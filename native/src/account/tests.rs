// Account lifecycle through the app's real update loop. Credentials live in memory (never the OS keyring), and
// background tasks are never run, so nothing here reaches a server.
use super::*;
use crate::cloud::AccountUser;
use crate::store::{Annotation, Store};
use std::path::PathBuf;

struct Fixture {
    app: App,
    dir: PathBuf,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}
fn fixture() -> Fixture {
    let dir = std::env::temp_dir().join(format!(
        "verse-account-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    Fixture {
        app: App::from_directory(&dir),
        dir,
    }
}
fn session(id: &str) -> Session {
    Session::for_test(
        AccountUser {
            id: id.into(),
            name: format!("Reader {id}"),
            email: format!("{id}@example.com"),
        },
        &format!("token-{id}"),
    )
}
fn sign_in(f: &mut Fixture, id: &str) {
    let _ = f.app.update_account(AccountMsg::SignIn);
    assert_eq!(f.app.account.status, Status::Waiting);
    let generation = f.app.account.generation;
    let _ = f
        .app
        .update_account(AccountMsg::SignedIn(generation, Ok(session(id))));
    assert_eq!(f.app.store.as_ref().unwrap().owner(), id);
}
/// Writes in the journal (unsaved) as the reader would.
fn type_note(f: &mut Fixture, text: &str) {
    f.app.start_note("2026-10-27", None, text, None);
    assert!(f.app.journal.open.as_ref().unwrap().dirty);
}
fn notes_of(f: &Fixture, owner: &str) -> Vec<String> {
    let mut store = Store::open(&f.dir).unwrap();
    store.set_owner(owner);
    store
        .all_notes()
        .unwrap()
        .into_iter()
        .map(|n| n.body)
        .collect()
}

#[test]
fn composer_drafts_stay_with_the_owner_when_signing_in_or_the_session_ends() {
    use crate::journal_ui::JournalMsg;
    use crate::md_editor::{Action, Edit};
    let mut f = fixture();
    let compose = |f: &mut Fixture, text: &str| {
        let _ = f.app.update_journal(JournalMsg::New(None));
        let _ = f
            .app
            .update_journal(JournalMsg::ComposerBody(Action::Edit(Edit::Paste(
                std::sync::Arc::new(text.into()),
            ))));
    };
    compose(&mut f, "Guest entry draft");
    sign_in(&mut f, "account-a");
    assert!(f.app.journal.composer.is_none());
    assert_eq!(notes_of(&f, ""), ["Guest entry draft"]);
    assert!(notes_of(&f, "account-a").is_empty());
    compose(&mut f, "Account entry draft");
    let generation = f.app.account.generation;
    let _ = f
        .app
        .update_account(AccountMsg::Synced(generation, Err(CallError::SignedOut)));
    assert!(f.app.journal.composer.is_none());
    assert_eq!(notes_of(&f, "account-a"), ["Account entry draft"]);
    assert_eq!(notes_of(&f, ""), ["Guest entry draft"]);
}

/// A kept (crash-recovered) new entry belongs to its owner: after a restart it is shown only to that owner, and
/// signing out first saves it under the account, so the unsent-changes confirmation still applies.
#[test]
fn a_recovered_entry_is_shown_only_to_its_owner_and_signing_out_still_asks() {
    use crate::journal_ui::JournalMsg;
    use crate::md_editor::{Action, Edit};
    let mut f = fixture();
    sign_in(&mut f, "account-a");
    let _ = f.app.update_journal(JournalMsg::New(None));
    let _ = f
        .app
        .update_journal(JournalMsg::ComposerBody(Action::Edit(Edit::Paste(
            std::sync::Arc::new("Account A's unsaved entry\n".into()),
        ))));
    let _ = f.app.update(Message::Autosave);
    // Killed: a fresh start shows this computer's own study, without the account's entry.
    let mut f = Fixture {
        app: App::from_directory(&f.dir),
        dir: std::mem::take(&mut f.dir),
    };
    assert_eq!(f.app.store.as_ref().unwrap().owner(), "");
    assert!(f.app.journal.composer.is_none());
    // Another account never sees it.
    sign_in(&mut f, "account-b");
    assert!(f.app.journal.composer.is_none());
    let _ = f.app.update_account(AccountMsg::SignOut(true));
    let _ = f.app.update_account(AccountMsg::SignedOut(Ok(())));
    assert!(f.app.journal.composer.is_none());
    // Its own account does, exactly.
    sign_in(&mut f, "account-a");
    assert_eq!(
        f.app.journal.composer.as_ref().unwrap().draft.body.text(),
        "Account A's unsaved entry\n"
    );
    assert!(notes_of(&f, "account-a").is_empty());
    // Signing out keeps it as an unsent account note first, so it asks.
    let generation = f.app.account.generation;
    let _ = f
        .app
        .update_account(AccountMsg::Synced(generation, Ok(SyncReport::default())));
    let _ = f.app.update_account(AccountMsg::SignOut(false));
    assert_eq!(f.app.account.confirm_sign_out, Some(1));
    assert!(f.app.journal.composer.is_none());
    assert_eq!(notes_of(&f, "account-a"), ["Account A's unsaved entry\n"]);
    assert!(notes_of(&f, "").is_empty());
    let mut store = Store::open(&f.dir).unwrap();
    store.set_owner("account-a");
    assert_eq!(store.entry_draft().unwrap(), None);
}

/// A kept entry that can't be saved when the account changes stays shown under its own owner; nothing is copied.
#[test]
fn a_kept_entry_that_cant_be_saved_keeps_the_owner() {
    use crate::journal_ui::JournalMsg;
    use crate::md_editor::{Action, Edit};
    let mut f = fixture();
    let _ = f.app.update_journal(JournalMsg::New(None));
    let _ = f
        .app
        .update_journal(JournalMsg::ComposerBody(Action::Edit(Edit::Paste(
            std::sync::Arc::new("Guest entry".into()),
        ))));
    let _ = f.app.update(Message::Autosave);
    let db = rusqlite::Connection::open(f.dir.join("study.sqlite")).unwrap();
    db.execute_batch(
        "CREATE TRIGGER reject BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'disk full'); END;",
    )
    .unwrap();
    let _ = f.app.update_account(AccountMsg::SignIn);
    let generation = f.app.account.generation;
    let _ = f
        .app
        .update_account(AccountMsg::SignedIn(generation, Ok(session("account-a"))));
    assert_eq!(f.app.store.as_ref().unwrap().owner(), "");
    assert_eq!(
        f.app.journal.composer.as_ref().unwrap().draft.body.text(),
        "Guest entry"
    );
    db.execute_batch("DROP TRIGGER reject;").unwrap();
    let mut store = Store::open(&f.dir).unwrap();
    assert!(store.entry_draft().unwrap().is_some());
    store.set_owner("account-a");
    assert_eq!(store.entry_draft().unwrap(), None);
    assert!(store.all_notes().unwrap().is_empty());
}

#[test]
fn an_ended_session_saves_writing_under_its_own_account_first() {
    let mut f = fixture();
    sign_in(&mut f, "account-a");
    type_note(&mut f, "Written while signed in — ✓");
    let generation = f.app.account.generation;
    let _ = f
        .app
        .update_account(AccountMsg::Synced(generation, Err(CallError::SignedOut)));
    assert!(f.app.account.session.is_none());
    assert_eq!(f.app.store.as_ref().unwrap().owner(), "");
    assert_eq!(notes_of(&f, "account-a"), ["Written while signed in — ✓"]);
    assert!(
        notes_of(&f, "").is_empty(),
        "never copied into this computer's study"
    );
    assert_eq!(f.app.account.notice.as_deref(), Some(cloud::SIGNED_OUT));
    // Still queued for the account's next sign-in.
    assert_eq!(
        Store::open(&f.dir).unwrap().unsynced("account-a").unwrap(),
        1
    );
}

#[test]
fn a_session_restored_late_never_takes_the_guests_writing() {
    let mut f = fixture();
    let _restore = f.app.restore_account();
    type_note(&mut f, "Guest reflection");
    let generation = f.app.account.generation;
    let _ = f.app.update_account(AccountMsg::Restored(
        generation,
        Ok(Some(session("account-a"))),
    ));
    assert_eq!(f.app.store.as_ref().unwrap().owner(), "account-a");
    assert_eq!(notes_of(&f, ""), ["Guest reflection"]);
    assert!(notes_of(&f, "account-a").is_empty());
}

#[test]
fn results_for_an_earlier_account_are_ignored() {
    let mut f = fixture();
    sign_in(&mut f, "account-a");
    let first = f.app.account.generation;
    let _ = f.app.update_account(AccountMsg::SignOut(true));
    assert!(f.app.account.purging);
    // A sign-in can't start until the old account's cache is gone.
    let _ = f.app.update_account(AccountMsg::SignIn);
    assert_eq!(f.app.account.status, Status::SignedOut);
    let _ = f.app.update_account(AccountMsg::SignedOut(Ok(())));
    sign_in(&mut f, "account-b");
    // The first account's late sync and goals don't touch account B.
    let report = SyncReport {
        goals: Some(JournalGoals {
            study_days: 7,
            reflections: 7,
        }),
        ..Default::default()
    };
    let _ = f.app.update_account(AccountMsg::Synced(first, Ok(report)));
    let _ = f.app.update_account(AccountMsg::GoalsSaved(
        first,
        Ok(JournalGoals {
            study_days: 1,
            reflections: 1,
        }),
    ));
    let _ = f
        .app
        .update_account(AccountMsg::Synced(first, Err(CallError::SignedOut)));
    assert_eq!(f.app.account.goals, None);
    assert_eq!(f.app.account.status, Status::Syncing);
    assert_eq!(f.app.account.session.as_ref().unwrap().user.id, "account-b");
}

#[test]
fn a_session_for_a_cancelled_sign_in_is_ended_not_used() {
    let mut f = fixture();
    let _ = f.app.update_account(AccountMsg::SignIn);
    let generation = f.app.account.generation;
    let _ = f.app.update_account(AccountMsg::CancelSignIn);
    assert_eq!(f.app.account.status, Status::SignedOut);
    let _ = f
        .app
        .update_account(AccountMsg::SignedIn(generation, Ok(session("account-a"))));
    assert!(f.app.account.session.is_none());
    assert_eq!(f.app.store.as_ref().unwrap().owner(), "");
    assert_eq!(f.app.account.revoked, ["account-a"]);
    // A second sign-in's result supersedes the first's.
    let _ = f.app.update_account(AccountMsg::SignIn);
    let older = f.app.account.generation;
    let _ = f.app.update_account(AccountMsg::CancelSignIn);
    let _ = f.app.update_account(AccountMsg::SignIn);
    let newer = f.app.account.generation;
    let _ = f
        .app
        .update_account(AccountMsg::SignedIn(older, Ok(session("account-x"))));
    let _ = f
        .app
        .update_account(AccountMsg::SignedIn(newer, Ok(session("account-y"))));
    assert_eq!(f.app.account.session.as_ref().unwrap().user.id, "account-y");
    assert_eq!(f.app.account.revoked, ["account-a", "account-x"]);
}

#[test]
fn signing_out_asks_before_discarding_unsent_changes() {
    let mut f = fixture();
    sign_in(&mut f, "account-a");
    let generation = f.app.account.generation;
    let _ = f
        .app
        .update_account(AccountMsg::Synced(generation, Ok(SyncReport::default())));
    let location = f.app.preferences.last.clone();
    f.app
        .store
        .as_mut()
        .unwrap()
        .save_annotation(
            &location,
            &Annotation {
                verse: 1,
                note: "unsent".into(),
                ..Default::default()
            },
        )
        .unwrap();
    f.app.popover = Some(crate::Popover::AppSettings);
    let _ = f.app.update_account(AccountMsg::SignOut(false));
    assert_eq!(f.app.account.confirm_sign_out, Some(1));
    assert!(f.app.account.session.is_some());
    let _ = f.app.update_account(AccountMsg::SignOut(true));
    assert!(f.app.account.session.is_none());
    assert!(f.app.popover.is_none());
    assert_eq!(f.app.store.as_ref().unwrap().owner(), "");
}

#[test]
fn the_purge_waits_for_a_running_sync_to_let_go() {
    let f = fixture();
    let mut store = Store::open(&f.dir).unwrap();
    store.set_owner("account-a");
    let l = crate::store::Location::default();
    store
        .save_annotation(
            &l,
            &Annotation {
                verse: 1,
                note: "cached".into(),
                ..Default::default()
            },
        )
        .unwrap();
    let lock = Arc::new(Mutex::new(()));
    let running_sync = lock.lock().unwrap();
    let dir = f.dir.clone();
    let purge_lock = lock.clone();
    let purge = std::thread::spawn(move || sync::purge(&dir, "account-a", &purge_lock));
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(
        store.annotations(&l).unwrap().len(),
        1,
        "nothing is removed while the sync still holds the lock"
    );
    drop(running_sync);
    purge.join().unwrap().unwrap();
    assert!(store.annotations(&l).unwrap().is_empty());
}

#[test]
fn retries_back_off_and_a_refresh_stays_scheduled() {
    assert_eq!(AccountState::backoff(1), Duration::from_secs(5));
    assert_eq!(AccountState::backoff(2), Duration::from_secs(10));
    assert_eq!(AccountState::backoff(4), Duration::from_secs(40));
    assert_eq!(AccountState::backoff(30), MAX_BACKOFF);
    let mut f = fixture();
    sign_in(&mut f, "account-a");
    let generation = f.app.account.generation;
    let _ = f.app.update_account(AccountMsg::Synced(
        generation,
        Err(CallError::Unavailable("offline".into())),
    ));
    assert_eq!(f.app.account.failures, 1);
    assert!(f.app.account.notice.as_ref().unwrap().contains("5 seconds"));
    let _ = f.app.update_account(AccountMsg::Sync);
    let _ = f
        .app
        .update_account(AccountMsg::Synced(generation, Ok(SyncReport::default())));
    assert_eq!(f.app.account.failures, 0);
    assert_eq!(f.app.account.status, Status::Idle);
}

#[test]
fn a_profile_without_accounts_never_signs_in() {
    let mut f = fixture();
    f.app.account = AccountState::with(
        Err("Account features are off for this profile (--no-account).".into()),
        Arc::new(cloud::Memory::default()),
    );
    let _restore = f.app.restore_account();
    let _ = f.app.update_account(AccountMsg::SignIn);
    assert_eq!(f.app.account.status, Status::SignedOut);
    assert!(
        f.app
            .account
            .notice
            .as_ref()
            .unwrap()
            .contains("--no-account")
    );
}
