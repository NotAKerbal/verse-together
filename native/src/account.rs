// The account in the app: signing in through the browser, restoring the session from the OS keyring, syncing in
// the background, and signing out. Signed in, the reader, journal and lessons show the account's study (cached on
// this computer); signed out, this computer's own study. Neither ever overwrites the other.
//
// Every background job carries the generation it was started in. Signing in, signing out, cancelling or a session
// ending starts a new generation, so a late result for an earlier one is discarded instead of being applied to
// whichever account is showing; a session that arrives for a cancelled sign-in is ended on the server. Syncs and
// the cache purge after signing out take the same lock, so a sync can never write an account's rows back after they
// were removed. Unsaved writing is saved under the account it was written in before the app switches owner.
use crate::cloud::{self, CallError, Credentials, Endpoints, Session};
use crate::store::{JournalGoals, Location};
use crate::sync::{self, SyncReport};
use crate::{App, Message, Screen};
use iced::{Subscription, Task};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// How long after a change the sync starts (more changes meanwhile join it).
const DEBOUNCE: Duration = Duration::from_secs(2);
/// How often the account is refreshed while the app is open and nothing is waiting.
const REFRESH: Duration = Duration::from_secs(60);
/// The longest wait between retries after failures.
const MAX_BACKOFF: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, PartialEq)]
pub enum Status {
    SignedOut,
    /// The browser is open on the website's approval page.
    Waiting,
    Idle,
    Syncing,
}
pub struct AccountState {
    /// The deployment, or why account features are off for this profile.
    pub endpoints: Result<Endpoints, String>,
    credentials: Arc<dyn Credentials>,
    pub session: Option<Session>,
    pub status: Status,
    pub goals: Option<JournalGoals>,
    generation: u64,
    sign_in_cancel: Option<Arc<AtomicBool>>,
    sync_cancel: Arc<AtomicBool>,
    /// Held by a sync for its whole run, and by the purge after signing out.
    lock: Arc<Mutex<()>>,
    /// Changes are waiting to be sent; a sync starts shortly.
    pub pending: bool,
    /// Syncs that failed in a row (the retry waits longer each time).
    pub failures: u32,
    pub last_sync: Option<String>,
    pub notice: Option<String>,
    /// Unsent changes found when signing out; signing out anyway discards them from this computer.
    pub confirm_sign_out: Option<usize>,
    /// The signed-out account's cached study is being removed; signing in waits for it.
    pub purging: bool,
    /// The session ended while writing couldn't be saved: the account's study stays shown until it can be.
    pub held: Option<String>,
    /// Sessions ended because they arrived for a sign-in that was no longer wanted.
    #[cfg(test)]
    pub revoked: Vec<String>,
    /// The Settings screen's view of the account (`AccountManager`).
    pub view: AccountView,
}
#[derive(Default)]
pub struct AccountView {
    pub details: Option<cloud::AccountDetails>,
    pub error: Option<String>,
    pub loading: bool,
    pub profile_open: bool,
    pub name: String,
    pub saving_name: bool,
    /// (succeeded, message) after saving the name.
    pub name_message: Option<(bool, String)>,
    pub revoking: bool,
    pub sessions_message: Option<(bool, String)>,
    /// Which collapsible sections are open: sync, sign-in methods, sessions.
    pub open: [bool; 3],
    /// Copying this computer's study into the account: asked to confirm, running, or its outcome.
    pub import_confirm: bool,
    pub importing: bool,
    pub import_message: Option<(bool, String)>,
    /// This computer's own notes and marked verses that could be copied.
    pub device: (usize, usize),
}
impl AccountState {
    /// `profile` is the study directory: a saved session belongs to it and to the deployment.
    pub fn new(profile: &Path) -> Self {
        let off = std::env::args().any(|a| a == "--no-account")
            || std::env::var("VERSE_TOGETHER_NO_ACCOUNT").is_ok_and(|v| v == "1");
        let endpoints = if off {
            Err("Account features are off for this profile (--no-account).".to_string())
        } else {
            Endpoints::from_env()
        };
        // Tests never touch the person's real keyring.
        let credentials: Arc<dyn Credentials> = match (&endpoints, cfg!(test)) {
            (Ok(e), false) => Arc::new(cloud::Keyring::new(e.credential_scope(profile))),
            _ => Arc::new(cloud::Memory::default()),
        };
        Self::with(endpoints, credentials)
    }
    pub fn with(endpoints: Result<Endpoints, String>, credentials: Arc<dyn Credentials>) -> Self {
        Self {
            endpoints,
            credentials,
            session: None,
            status: Status::SignedOut,
            goals: None,
            generation: 0,
            sign_in_cancel: None,
            sync_cancel: Arc::new(AtomicBool::new(false)),
            lock: Arc::new(Mutex::new(())),
            pending: false,
            failures: 0,
            last_sync: None,
            notice: None,
            confirm_sign_out: None,
            purging: false,
            held: None,
            #[cfg(test)]
            revoked: Vec::new(),
            view: AccountView::default(),
        }
    }
    /// Starts a new generation: anything still running for the previous one is stopped and its result ignored.
    fn next_generation(&mut self) -> u64 {
        self.generation += 1;
        self.view = AccountView::default();
        self.sync_cancel.store(true, Ordering::SeqCst);
        self.sync_cancel = Arc::new(AtomicBool::new(false));
        self.generation
    }
    /// The wait before the next retry after `failures` failed syncs: 5s, 10s, 20s… up to five minutes.
    pub fn backoff(failures: u32) -> Duration {
        Duration::from_secs(5u64.saturating_mul(1 << failures.saturating_sub(1).min(16)))
            .min(MAX_BACKOFF)
    }
}

#[derive(Debug, Clone)]
pub enum AccountMsg {
    Restored(u64, Result<Option<Session>, String>),
    SignIn,
    SignedIn(u64, Result<Session, String>),
    CancelSignIn,
    Stored(u64, Result<(), String>),
    SignOut(bool),
    SignedOut(Result<(), String>),
    /// Sync now (a change is waiting, a retry or refresh is due, or the reader asked).
    Sync,
    Synced(u64, Result<SyncReport, CallError>),
    GoalsSaved(u64, Result<JournalGoals, CallError>),
    /// Show this computer's study again after the session ended with unsaved writing.
    ReleaseHeld,
    DismissNotice,
    /// The Settings screen: load the profile, sign-in methods and sessions.
    LoadDetails,
    Details(u64, Result<cloud::AccountDetails, CallError>),
    ToggleProfile,
    NameInput(String),
    SaveName,
    NameSaved(u64, Result<String, CallError>),
    RevokeOthers,
    Revoked(u64, Result<(), CallError>),
    ToggleSection(usize),
    /// Copy this computer's own study into the account: ask, cancel, go, and its result.
    ImportAsk,
    ImportCancel,
    Import,
    Imported(u64, Result<sync::Imported, CallError>),
}

/// Runs blocking work (network, keyring, SQLite) on its own thread, once the task is actually run (a task that is
/// dropped unrun, as in tests, does nothing).
pub(crate) async fn background<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> T {
    let (tx, rx) = iced::futures::channel::oneshot::channel();
    std::thread::spawn(move || {
        let _ = tx.send(work());
    });
    rx.await.expect("background work finished")
}

impl App {
    pub(crate) fn account_generation(&self) -> u64 {
        self.account.generation
    }
    pub(crate) fn account_signed_in(&self) -> bool {
        self.account.session.is_some()
    }
    pub(crate) fn account_goals(&self) -> Option<JournalGoals> {
        self.account_signed_in()
            .then_some(self.account.goals)
            .flatten()
    }
    /// Asks for a sync soon (local changes were made). Nothing happens signed out.
    pub(crate) fn sync_soon(&mut self) {
        if self.account_signed_in() {
            self.account.pending = true;
        }
    }
    /// Restores a saved session at startup.
    pub(crate) fn restore_account(&mut self) -> Task<Message> {
        let Ok(endpoints) = self.account.endpoints.clone() else {
            return Task::none();
        };
        let generation = self.account.next_generation();
        let credentials = self.account.credentials.clone();
        let lock = self.account.lock.clone();
        Task::perform(
            background(move || {
                let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
                cloud::load_session(credentials.as_ref(), &endpoints)
            }),
            move |r| Message::Account(AccountMsg::Restored(generation, r)),
        )
    }
    /// One timer at a time, only while signed in and idle: soon after changes, backing off after failures, and
    /// otherwise a periodic refresh. Nothing runs signed out.
    pub(crate) fn account_subscription(&self) -> Subscription<Message> {
        if self.account.session.is_none() || self.account.status != Status::Idle {
            return Subscription::none();
        }
        let every = if self.account.failures > 0 {
            AccountState::backoff(self.account.failures)
        } else if self.account.pending {
            DEBOUNCE
        } else {
            REFRESH
        };
        iced::time::every(every).map(|_| Message::Account(AccountMsg::Sync))
    }
    fn data_directory(&self) -> Option<PathBuf> {
        self.store
            .as_ref()
            .and_then(|s| s.scripture_path.parent().map(|p| p.to_path_buf()))
    }
    /// Shows `owner`'s study ("" for this computer's own), after saving what is being written under the owner it
    /// was written for. Returns false, changing nothing, if that writing couldn't be saved.
    fn switch_owner(&mut self, owner: &str) -> bool {
        if !self.save_note() || !self.save_journal_note() {
            return false;
        }
        if let Some(s) = &mut self.store {
            s.set_owner(owner);
        }
        self.selected.clear();
        self.anchor = None;
        self.plans = Default::default();
        self.load_chapter();
        self.load_note();
        self.journal.open = None;
        if self.screen == Screen::Journal {
            self.reload_journal();
        }
        if self.lessons.open.is_some() {
            self.load_lesson_log();
            if self.lessons.selected.is_empty() {
                self.reload_lesson_scripture();
            }
            self.lessons.guide.selection = None;
            self.load_guide_marks();
        }
        true
    }
    /// The books whose read chapters are refreshed: the reader's, the open passage's, and this week's lesson's.
    fn sync_books(&self) -> Vec<(String, String)> {
        let mut books: Vec<(String, String)> = vec![(
            self.preferences.last.volume.clone(),
            self.preferences.last.book.clone(),
        )];
        if let Some(dock) = &self.lessons.dock {
            books.push((dock.location.volume.clone(), dock.location.book.clone()));
        }
        for l in self.lesson_chapters() {
            books.push((l.volume, l.book));
        }
        books.sort();
        books.dedup();
        books.truncate(12);
        books
    }
    fn start_sync(&mut self) -> Task<Message> {
        let (Some(session), Some(directory), Ok(endpoints)) = (
            self.account.session.clone(),
            self.data_directory(),
            self.account.endpoints.clone(),
        ) else {
            return Task::none();
        };
        if self.account.status != Status::Idle {
            return Task::none();
        }
        self.account.status = Status::Syncing;
        self.account.pending = false;
        let mut chapters: Vec<Location> = vec![self.preferences.last.clone()];
        if let Some(dock) = &self.lessons.dock
            && dock.location != self.preferences.last
        {
            chapters.push(dock.location.clone());
        }
        // The open lesson's chapters, whose marks show on its page.
        if let Some(open) = &self.lessons.open {
            for chapter in &open.companion.chapters {
                if !chapters.contains(&chapter.location) {
                    chapters.push(chapter.location.clone());
                }
            }
        }
        let job = sync::Job {
            directory,
            endpoints,
            session,
            chapters,
            books: self.sync_books(),
            guides: self
                .lessons
                .open
                .iter()
                .map(|o| o.lesson.start.clone())
                .collect(),
            cancel: self.account.sync_cancel.clone(),
            lock: self.account.lock.clone(),
        };
        let generation = self.account.generation;
        Task::perform(background(move || sync::run(&job)), move |r| {
            Message::Account(AccountMsg::Synced(generation, r))
        })
    }
    pub(crate) fn save_account_goals(&mut self, goals: JournalGoals) -> Task<Message> {
        let (Some(session), Ok(endpoints)) =
            (self.account.session.clone(), self.account.endpoints.clone())
        else {
            return Task::none();
        };
        let generation = self.account.generation;
        Task::perform(
            background(move || sync::save_goals(&endpoints, &session, goals)),
            move |r| Message::Account(AccountMsg::GoalsSaved(generation, r)),
        )
    }
    /// Ends a session the app no longer uses, in the background.
    fn revoke(&mut self, session: Session) -> Task<Message> {
        #[cfg(test)]
        self.account.revoked.push(session.user.id.clone());
        let Ok(endpoints) = self.account.endpoints.clone() else {
            return Task::none();
        };
        Task::perform(
            background(move || cloud::sign_out(&endpoints, &session)),
            |_| (),
        )
        .discard()
    }
    fn begin_session(&mut self, session: Session, store: bool) -> Task<Message> {
        let owner = session.user.id.clone();
        if !self.switch_owner(&owner) {
            self.account.status = Status::SignedOut;
            self.account.notice = Some(
                "Signed in, but your unsaved writing here couldn't be saved first, so this computer is still showing its own study. Save or copy it, then sign in again.".into(),
            );
            return self.revoke(session);
        }
        self.account.session = Some(session.clone());
        self.account.status = Status::Idle;
        self.account.failures = 0;
        self.account.held = None;
        self.account.view = AccountView::default();
        let mut sync = self.start_sync();
        if matches!(self.screen, Screen::SignIn | Screen::Settings) {
            // As the website returns from sign-in to where the reader came from: the account's settings.
            self.set_screen(Screen::Settings);
            sync = Task::batch([sync, self.load_account_details()]);
        }
        if !store {
            return sync;
        }
        let (Ok(endpoints), credentials, lock, generation) = (
            self.account.endpoints.clone(),
            self.account.credentials.clone(),
            self.account.lock.clone(),
            self.account.generation,
        ) else {
            return sync;
        };
        let saved = Task::perform(
            background(move || {
                let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
                cloud::store_session(credentials.as_ref(), &endpoints, &session)
            }),
            move |r| Message::Account(AccountMsg::Stored(generation, r)),
        );
        Task::batch([saved, sync])
    }
    /// The session ended on the server. The account's unsent changes stay cached for its next sign-in.
    fn session_ended(&mut self) -> Task<Message> {
        let Some(session) = self.account.session.take() else {
            return Task::none();
        };
        let owner = session.user.id.clone();
        self.account.next_generation();
        self.account.status = Status::SignedOut;
        self.account.goals = None;
        self.account.pending = false;
        self.account.failures = 0;
        if self.switch_owner("") {
            self.account.notice = Some(cloud::SIGNED_OUT.into());
        } else {
            self.account.held = Some(owner);
            self.account.notice = Some(format!(
                "{} Your unsaved writing couldn't be saved yet, so it is still shown here; it will sync after you sign in again.",
                cloud::SIGNED_OUT
            ));
        }
        let (Ok(endpoints), credentials, lock) = (
            self.account.endpoints.clone(),
            self.account.credentials.clone(),
            self.account.lock.clone(),
        ) else {
            return Task::none();
        };
        Task::perform(
            background(move || {
                let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
                cloud::forget_session(credentials.as_ref(), &endpoints, &session)
            }),
            |_| (),
        )
        .discard()
    }
    pub(crate) fn update_account(&mut self, message: AccountMsg) -> Task<Message> {
        match message {
            AccountMsg::Restored(generation, result) => {
                if generation != self.account.generation || self.account.status != Status::SignedOut
                {
                    return Task::none();
                }
                match result {
                    Ok(Some(session)) => return self.begin_session(session, false),
                    Ok(None) => {}
                    Err(e) => self.account.notice = Some(e),
                }
            }
            AccountMsg::SignIn => {
                let Ok(endpoints) = self.account.endpoints.clone() else {
                    self.account.notice = self.account.endpoints.clone().err();
                    return Task::none();
                };
                if self.account.status != Status::SignedOut
                    || self.account.purging
                    || !self.save_note()
                    || !self.save_journal_note()
                {
                    return Task::none();
                }
                let generation = self.account.next_generation();
                let cancel = Arc::new(AtomicBool::new(false));
                self.account.sign_in_cancel = Some(cancel.clone());
                self.account.status = Status::Waiting;
                self.account.notice = None;
                return Task::perform(
                    background(move || {
                        cloud::sign_in(&endpoints, cancel, |url| {
                            webbrowser::open(url)
                                .map_err(|e| format!("Couldn't open your browser: {e}"))
                        })
                    }),
                    move |r| Message::Account(AccountMsg::SignedIn(generation, r)),
                );
            }
            AccountMsg::CancelSignIn => {
                if self.account.status == Status::Waiting {
                    if let Some(cancel) = self.account.sign_in_cancel.take() {
                        cancel.store(true, Ordering::SeqCst);
                    }
                    self.account.next_generation();
                    self.account.status = Status::SignedOut;
                }
            }
            AccountMsg::SignedIn(generation, result) => {
                let current =
                    generation == self.account.generation && self.account.status == Status::Waiting;
                match result {
                    // Cancelled, or another sign-in started since: this session is not used.
                    Ok(session) if !current => return self.revoke(session),
                    Ok(session) => {
                        self.account.sign_in_cancel = None;
                        return self.begin_session(session, true);
                    }
                    Err(_) if !current => {}
                    Err(e) => {
                        self.account.sign_in_cancel = None;
                        self.account.status = Status::SignedOut;
                        if e != cloud::SIGN_IN_CANCELLED {
                            self.account.notice = Some(e);
                        }
                    }
                }
            }
            AccountMsg::Stored(generation, Err(e)) if generation == self.account.generation => {
                self.account.notice = Some(e);
            }
            AccountMsg::Stored(..) => {}
            AccountMsg::SignOut(force) => {
                let Some(session) = self.account.session.clone() else {
                    return Task::none();
                };
                if !self.save_note() || !self.save_journal_note() {
                    return Task::none();
                }
                let owner = session.user.id.clone();
                let unsent = self
                    .store
                    .as_ref()
                    .map(|s| s.unsynced(&owner).unwrap_or(0))
                    .unwrap_or(0);
                if unsent > 0 && !force {
                    self.account.confirm_sign_out = Some(unsent);
                    return Task::none();
                }
                let (Some(directory), Ok(endpoints)) =
                    (self.data_directory(), self.account.endpoints.clone())
                else {
                    return Task::none();
                };
                self.account.confirm_sign_out = None;
                self.popover = None;
                // This computer stops showing the account at once (a running sync stops before its next write);
                // its cache is removed once that sync has let go, then the server session is ended.
                self.account.next_generation();
                self.account.session = None;
                self.account.goals = None;
                self.account.status = Status::SignedOut;
                self.account.pending = false;
                self.account.failures = 0;
                self.account.purging = true;
                self.switch_owner("");
                let (credentials, lock) =
                    (self.account.credentials.clone(), self.account.lock.clone());
                return Task::perform(
                    background(move || {
                        let purged = sync::purge(&directory, &owner, &lock);
                        let ended = cloud::sign_out(&endpoints, &session);
                        let forgot = {
                            let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
                            cloud::forget_session(credentials.as_ref(), &endpoints, &session)
                        };
                        purged.and(forgot).and(ended)
                    }),
                    |r| Message::Account(AccountMsg::SignedOut(r)),
                );
            }
            AccountMsg::SignedOut(result) => {
                self.account.purging = false;
                if let Err(e) = result {
                    self.account.notice = Some(format!(
                        "Signed out on this computer, but not everything finished: {e}"
                    ));
                }
            }
            AccountMsg::ReleaseHeld => {
                if self.account.held.is_some() && self.switch_owner("") {
                    self.account.held = None;
                }
            }
            AccountMsg::Sync => {
                self.account.confirm_sign_out = None;
                return self.start_sync();
            }
            AccountMsg::Synced(generation, result) => {
                if generation != self.account.generation || self.account.session.is_none() {
                    return Task::none();
                }
                self.account.status = Status::Idle;
                match result {
                    Ok(report) => {
                        if report.goals.is_some() {
                            self.account.goals = report.goals;
                        }
                        self.account.last_sync =
                            Some(chrono::Local::now().format("%-I:%M %p").to_string());
                        self.account.pending |= report.more;
                        self.account.failures = if report.problems.is_empty() {
                            0
                        } else {
                            self.account.failures + 1
                        };
                        self.account.notice = if !report.problems.is_empty() {
                            Some(format!(
                                "{} couldn't be synced; trying again in {}: {}",
                                crate::journal::plural(report.problems.len(), "change", "changes"),
                                wait_label(AccountState::backoff(self.account.failures)),
                                report.problems[0]
                            ))
                        } else if report.kept_both > 0 {
                            Some(format!(
                                "{} changed both here and on another device. Both versions were kept in your journal.",
                                crate::journal::plural(report.kept_both, "note", "notes")
                            ))
                        } else if !report.read_only_copies.is_empty() {
                            Some(format!(
                                "{} published elsewhere while you changed {} here. Your changes were kept as separate drafts in your journal.",
                                crate::journal::plural(
                                    report.read_only_copies.len(),
                                    "note was",
                                    "notes were"
                                ),
                                if report.read_only_copies.len() == 1 {
                                    "it"
                                } else {
                                    "them"
                                }
                            ))
                        } else {
                            None
                        };
                        self.follow_read_only_copies(&report.read_only_copies);
                        self.show_synced();
                    }
                    Err(CallError::SignedOut) => return self.session_ended(),
                    Err(CallError::Cancelled) => {}
                    Err(e) => {
                        self.account.failures += 1;
                        self.account.notice = Some(format!(
                            "Couldn't sync; trying again in {}. {e}",
                            wait_label(AccountState::backoff(self.account.failures))
                        ));
                    }
                }
            }
            AccountMsg::GoalsSaved(generation, result) => {
                if generation != self.account.generation {
                    return Task::none();
                }
                match result {
                    Ok(goals) => {
                        self.account.goals = Some(goals);
                        self.journal.goal_draft = None;
                        self.journal.goals_saved = true;
                    }
                    Err(CallError::SignedOut) => return self.session_ended(),
                    Err(_) => {
                        self.journal.goal_error = Some(
                            "Your goals couldn't be saved. Your changes are still here; check your connection and try again.".into(),
                        );
                    }
                }
            }
            AccountMsg::DismissNotice => self.account.notice = None,
            AccountMsg::LoadDetails => return self.load_account_details(),
            AccountMsg::Details(generation, result) if generation == self.account.generation => {
                self.account.view.loading = false;
                match result {
                    Ok(details) => {
                        if !self.account.view.profile_open {
                            self.account.view.name = details.name.clone();
                        }
                        self.account.view.error = None;
                        self.account.view.details = Some(details);
                    }
                    Err(CallError::SignedOut) => return self.session_ended(),
                    // A list that fails keeps its last good value.
                    Err(e) => self.account.view.error = Some(e.to_string()),
                }
            }
            AccountMsg::ToggleProfile => {
                let v = &mut self.account.view;
                v.profile_open = !v.profile_open;
                v.name_message = None;
                if v.profile_open {
                    v.name = v
                        .details
                        .as_ref()
                        .map(|d| d.name.clone())
                        .or_else(|| self.account.session.as_ref().map(|s| s.user.name.clone()))
                        .unwrap_or_default();
                }
            }
            AccountMsg::NameInput(name) => {
                self.account.view.name = name.chars().take(100).collect();
            }
            AccountMsg::SaveName => {
                let name = self.account.view.name.trim().to_string();
                let (Some(session), Ok(endpoints)) =
                    (self.account.session.clone(), self.account.endpoints.clone())
                else {
                    return Task::none();
                };
                if name.is_empty() || self.account.view.saving_name {
                    return Task::none();
                }
                self.account.view.saving_name = true;
                self.account.view.name_message = None;
                let generation = self.account.generation;
                return Task::perform(
                    background(move || {
                        cloud::update_name(&endpoints, &session, &name).map(|()| name)
                    }),
                    move |r| Message::Account(AccountMsg::NameSaved(generation, r)),
                );
            }
            AccountMsg::NameSaved(generation, result) if generation == self.account.generation => {
                self.account.view.saving_name = false;
                match result {
                    Ok(name) => {
                        if let Some(s) = &mut self.account.session {
                            s.user.name = name.clone();
                        }
                        if let Some(d) = &mut self.account.view.details {
                            d.name = name;
                        }
                        self.account.view.name_message = Some((true, "Name saved.".into()));
                    }
                    Err(CallError::SignedOut) => return self.session_ended(),
                    Err(e) => self.account.view.name_message = Some((false, e.to_string())),
                }
            }
            AccountMsg::RevokeOthers => {
                let (Some(session), Ok(endpoints)) =
                    (self.account.session.clone(), self.account.endpoints.clone())
                else {
                    return Task::none();
                };
                if self.account.view.revoking {
                    return Task::none();
                }
                self.account.view.revoking = true;
                self.account.view.sessions_message = None;
                let generation = self.account.generation;
                return Task::perform(
                    background(move || cloud::revoke_other_sessions(&endpoints, &session)),
                    move |r| Message::Account(AccountMsg::Revoked(generation, r)),
                );
            }
            AccountMsg::Revoked(generation, result) if generation == self.account.generation => {
                self.account.view.revoking = false;
                match result {
                    Ok(()) => {
                        self.account.view.sessions_message =
                            Some((true, "Signed out of your other devices.".into()));
                        return self.load_account_details();
                    }
                    Err(CallError::SignedOut) => return self.session_ended(),
                    Err(e) => self.account.view.sessions_message = Some((false, e.to_string())),
                }
            }
            AccountMsg::Details(..) | AccountMsg::NameSaved(..) | AccountMsg::Revoked(..) => {}
            AccountMsg::ImportAsk => self.account.view.import_confirm = true,
            AccountMsg::ImportCancel => self.account.view.import_confirm = false,
            AccountMsg::Import => {
                let (Some(session), Some(directory), Ok(endpoints)) = (
                    self.account.session.clone(),
                    self.data_directory(),
                    self.account.endpoints.clone(),
                ) else {
                    return Task::none();
                };
                if self.account.view.importing {
                    return Task::none();
                }
                self.account.view.import_confirm = false;
                self.account.view.importing = true;
                self.account.view.import_message = None;
                let job = sync::Job {
                    directory,
                    endpoints,
                    session,
                    chapters: vec![],
                    books: vec![],
                    guides: vec![],
                    cancel: self.account.sync_cancel.clone(),
                    lock: self.account.lock.clone(),
                };
                let generation = self.account.generation;
                return Task::perform(background(move || sync::import_device(&job)), move |r| {
                    Message::Account(AccountMsg::Imported(generation, r))
                });
            }
            AccountMsg::Imported(generation, result) if generation == self.account.generation => {
                self.account.view.importing = false;
                match result {
                    Ok(done) => {
                        self.account.view.import_message = Some((
                            true,
                            format!(
                                "Copied {}, {} and {} into your account. They stay on this computer too.",
                                crate::journal::plural(done.notes, "note", "notes"),
                                crate::journal::plural(
                                    done.verses,
                                    "marked verse",
                                    "marked verses"
                                ),
                                crate::journal::plural(
                                    done.guide_marks,
                                    "guide mark",
                                    "guide marks"
                                )
                            ),
                        ));
                        // Bring the copies into this computer's view of the account.
                        return self.start_sync();
                    }
                    Err(CallError::SignedOut) => return self.session_ended(),
                    Err(e) => {
                        self.account.view.import_message = Some((
                            false,
                            format!(
                                "Not everything was copied; copying again picks up where it stopped. {e}"
                            ),
                        ))
                    }
                }
            }
            AccountMsg::Imported(..) => {}
            AccountMsg::ToggleSection(i) => {
                if let Some(open) = self.account.view.open.get_mut(i) {
                    *open = !*open;
                }
            }
        }
        Task::none()
    }
    pub(crate) fn load_account_details(&mut self) -> Task<Message> {
        let (Some(session), Ok(endpoints)) =
            (self.account.session.clone(), self.account.endpoints.clone())
        else {
            return Task::none();
        };
        self.account.view.loading = true;
        self.account.view.device = self
            .data_directory()
            .and_then(|dir| {
                let device = crate::store::Store::open(&dir).ok()?;
                let calls = sync::device_imports(&device, "").ok()?;
                let notes = calls
                    .iter()
                    .filter(|(p, _)| *p == "insights:importDeviceNote")
                    .count();
                Some((notes, calls.len() - notes))
            })
            .unwrap_or_default();
        let generation = self.account.generation;
        Task::perform(
            background(move || cloud::account_details(&endpoints, &session)),
            move |r| Message::Account(AccountMsg::Details(generation, r)),
        )
    }
    /// Shows what a sync brought, without disturbing anything being written or selected.
    fn show_synced(&mut self) {
        if let Some(s) = &self.store
            && self.selected.is_empty()
        {
            let r = s.annotations(&self.preferences.last);
            if let Some(a) = self.report(r) {
                self.annotations = a;
            }
        }
        if let Some(s) = &self.store
            && let Ok(read) = s.is_read(&self.preferences.last)
        {
            self.read = read;
        }
        // An open note follows its status on the account (a note published elsewhere becomes read-only).
        self.refresh_open_note();
        if self.screen == Screen::Journal && self.journal.open.is_none() {
            self.reload_journal();
        }
        // Notes the sync brought may link verses of this chapter (the picker stays as it is).
        let picker = self.note_links.picker;
        self.refresh_note_links();
        self.note_links.picker = picker.filter(|v| self.note_links.by_verse.contains_key(v));
        let read_picker = self.note_links.read_picker;
        let read = self.read_passages();
        self.note_links.read_picker =
            read_picker.filter(|v| read.get(v).is_some_and(|p| p.start == *v));
        if self.lessons.open.is_some() {
            self.load_lesson_log();
            if self.lessons.selected.is_empty() {
                self.reload_lesson_scripture();
            }
            if self.lessons.guide.selection.is_none() {
                self.load_guide_marks();
            }
        }
    }
}
fn wait_label(d: Duration) -> String {
    let s = d.as_secs();
    if s < 60 {
        format!("{s} seconds")
    } else {
        crate::journal::plural((s / 60) as usize, "minute", "minutes")
    }
}

#[cfg(test)]
mod tests;
