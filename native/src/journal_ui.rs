// The Journal screen, after the website's JournalWorkspace and JournalHome: a month calendar with weekly goals in
// the left rail and the selected day in the main card. Opening a note glides the day's list into the rail (280ms,
// cubic-bezier(0.2, 0, 0, 1)) while the calendar fades out and the note fades in from the right.
use crate::anim::{CubicBezier, NAV, Transition};
use crate::design::{self, Colors, icon, sans, serif};
use crate::header::CONTENT_TOP;
use crate::icons;
use crate::journal::{self, Entry, REFLECTION_PROMPTS, WEEKDAYS};
use crate::md_editor;
use crate::store::{self, JournalGoals, Note, NoteSource};
use crate::{App, Message};
use iced::widget::{
    button, column, container, image, mouse_area, opaque, pin, row, space, stack, text, text_input,
};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, Task, font};
use std::sync::OnceLock;
use std::time::Instant;

const NOTES_EASE: CubicBezier = CubicBezier::new(0.2, 0.0, 0.0, 1.0);
const GAP: f32 = 20.0;
/// The website's `lg` breakpoint: narrower windows show the journal's stages one at a time.
const PHONE_BELOW: f32 = 1024.0;
/// The main area's day list, scrolled to show a new entry and back to its top when a note closes.
pub(crate) const CHOOSER: &str = "journal-chooser";
/// The invitation's text and its primary button on the dawn painting.
const ON_ART: Color = Color::from_rgb(0xfb as f32 / 255., 0xf7 as f32 / 255., 0xec as f32 / 255.);
const ART_BUTTON: Color =
    Color::from_rgb(0xe3 as f32 / 255., 0x90 as f32 / 255., 0x7a as f32 / 255.);

fn dawn() -> image::Handle {
    static ART: OnceLock<image::Handle> = OnceLock::new();
    ART.get_or_init(|| {
        image::Handle::from_bytes(&include_bytes!("../../public/art/journal-dawn.webp")[..])
    })
    .clone()
}

pub struct OpenNote {
    pub note: Note,
    /// The whole note as Markdown, as the website's one editor shows it: a title is its leading `# ` line.
    pub body: md_editor::Content,
    pub dirty: bool,
    pub confirm_delete: bool,
    /// The reflection prompt the note was started from (the composer shows it above the editor).
    pub prompt: Option<String>,
    /// Earlier versions of the body for Ctrl+Z, and undone ones for Ctrl+Shift+Z / Ctrl+Y (the website's editor
    /// history).
    pub undo: Vec<String>,
    pub redo: Vec<String>,
    /// The last edit's kind and time: typing within a word groups into one undo step.
    pub last_edit: Option<(EditKind, std::time::Instant)>,
    /// The note's status on the account ("draft", "published", "archived"). Only drafts can be changed, as on the
    /// website; the others are shown read-only.
    pub status: String,
    /// When this editor last saved (the website's "Saved at 8:14 PM"); `None` until it has.
    pub saved_at: Option<i64>,
}
impl OpenNote {
    pub fn read_only(&self) -> bool {
        store::status_is_read_only(&self.status)
    }
    /// The website keeps published notes (they may be shared); archived ones can still be deleted.
    pub fn can_delete(&self) -> bool {
        self.status != "published"
    }
}
/// What the journal says when text written in a note that became read-only was kept as a separate draft.
pub const READ_ONLY_COPY_NOTICE: &str = "This note was published, so it can't be changed. What you wrote was kept as a separate draft, which you're editing now.";
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EditKind {
    Typing,
    Break,
    Delete,
    Paste,
}
const UNDO_LIMIT: usize = 200;
/// The unsaved entry (`JournalEntryComposer`): a blank note under the day's actions, saved as an entry only when
/// asked. Closing it keeps what was written until it is saved.
pub struct Composer {
    pub draft: OpenNote,
    pub shown: bool,
    /// The day as typed in its Day field (`MM/DD/YYYY`).
    pub day: String,
    /// The reader changed the day or the reading, so the entry no longer follows the selected day.
    pub edited: bool,
    pub problem: Option<String>,
    /// Its editor has focus (its border takes the accent, `focus-within`).
    pub focused: bool,
}
impl Composer {
    fn pristine(&self) -> bool {
        !self.edited && self.draft.body.is_empty() && self.draft.note.reading_at.is_none()
    }
}
/// Which entry the reading editor (`ReadingChip`'s dialog) changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReadingTarget {
    Note,
    Composer,
}
/// `ReadingChip`'s small editor: the passage or guide, the whole chapter or some verses, and the day.
pub struct ReadingEdit {
    pub target: ReadingTarget,
    pub choices: Vec<NoteSource>,
    pub chosen: usize,
    pub part: bool,
    pub start: String,
    pub end: String,
    /// `MM/DD/YYYY`, as the website's date field shows it.
    pub date: String,
    pub error: Option<String>,
    /// The entry logs this reading already ("Edit reading" rather than "Log reading").
    pub editing: bool,
}
pub struct JournalState {
    pub month: String,
    pub day: String,
    pub entries: Vec<Entry>,
    /// Every note, for the reflection worth revisiting.
    pub notes: Vec<Note>,
    pub prompt: usize,
    pub open: Option<OpenNote>,
    pub composer: Option<Composer>,
    pub reading: Option<ReadingEdit>,
    /// 0 with the calendar showing, 1 with a note open.
    pub motion: Transition,
    pub goal_draft: Option<JournalGoals>,
    pub goal_error: Option<String>,
    pub goals_saved: bool,
    /// Something the journal needs to tell the reader (shown above the note).
    pub notice: Option<String>,
    /// Account notes that aren't drafts (local id → "published" / "archived"), tagged in the day's list.
    pub statuses: std::collections::HashMap<String, String>,
    /// Recent reading sources, offered by the reading chip (`logOptions`).
    pub recent_sources: Vec<NoteSource>,
    /// The narrow layout shows the selected day's entries rather than the calendar (`stage === "day"`).
    pub phone_day: bool,
    /// A note opened or closed: the day's list goes back to its top on the next frame.
    pub snap_list: bool,
}
impl JournalState {
    pub fn new(now: Instant) -> Self {
        let today = store::today();
        Self {
            month: journal::month_of(&today),
            day: today,
            entries: vec![],
            notes: vec![],
            prompt: 0,
            open: None,
            composer: None,
            reading: None,
            motion: Transition::new(0.0, NAV, NOTES_EASE, now),
            goal_draft: None,
            goal_error: None,
            goals_saved: false,
            notice: None,
            statuses: Default::default(),
            recent_sources: vec![],
            phone_day: false,
            snap_list: false,
        }
    }
}

#[derive(Debug, Clone)]
pub enum JournalMsg {
    Month(i32),
    Today,
    Day(String),
    /// The day's new entry (`onNewNote`), optionally from a reflection prompt.
    New(Option<String>),
    NextPrompt,
    Open(String),
    Close,
    /// The narrow layout's "‹ Calendar".
    ShowCalendar,
    Body(md_editor::Action),
    Undo,
    Redo,
    Delete,
    ConfirmDelete(bool),
    /// The new entry's editor, its history, its Day field, Save entry and Close.
    ComposerBody(md_editor::Action),
    ComposerUndo,
    ComposerRedo,
    ComposerDay(String),
    ComposerFocus(bool),
    SaveEntry,
    CloseComposer,
    /// The reading chip and its editor.
    Reading(ReadingTarget),
    ReadingChoose(usize),
    ReadingPart(bool),
    ReadingStart(String),
    ReadingEnd(String),
    ReadingDate(String),
    ReadingSave,
    ReadingRemove,
    ReadingCancel,
    EditGoals,
    GoalStep(bool, i32),
    SaveGoals,
    CancelGoals,
    OpenSource(NoteSource),
    DeleteReading(String),
}

impl App {
    pub(crate) fn journal_goals(&self) -> JournalGoals {
        self.account_goals().unwrap_or(self.preferences.goals)
    }
    /// Reads the journal around the visible month and this week.
    pub(crate) fn reload_journal(&mut self) {
        let Some(s) = &self.store else { return };
        let today = store::today();
        let grid = journal::month_grid(&self.journal.month);
        let (week_start, week_end) = journal::goal_week(&today);
        let first = grid
            .iter()
            .flatten()
            .next()
            .cloned()
            .unwrap_or(today.clone());
        let last = grid
            .iter()
            .flatten()
            .last()
            .cloned()
            .unwrap_or(today.clone());
        let from = first.clone().min(week_start).min(self.journal.day.clone());
        let to = last.max(week_end).max(today).max(self.journal.day.clone());
        let epoch = |day: &str, extra: i64| {
            journal::date(day)
                .and_then(|d| d.and_hms_opt(0, 0, 0))
                .map(|t| t.and_utc().timestamp() + extra)
                .unwrap_or(0)
        };
        let notes = s.all_notes();
        let statuses = s.read_only_notes();
        let readings = s.readings_between(&from, &to);
        // A day either side covers every time zone; entries are then placed by their local day.
        let verses = s.verse_notes_between(epoch(&from, -86_400), epoch(&to, 2 * 86_400));
        if let (Some(notes), Some(readings), Some(verses)) = (
            self.report(notes),
            self.report(readings),
            self.report(verses),
        ) {
            let in_window: Vec<Note> = notes
                .iter()
                .filter(|n| n.journal_date >= from && n.journal_date <= to)
                .cloned()
                .collect();
            self.journal.entries = journal::entries(in_window, readings, verses);
            self.journal.notes = notes;
        }
        if let Some(statuses) = self.report(statuses) {
            self.journal.statuses = statuses;
        }
        // What the reading chip offers: sources this person actually has, newest first (`logOptions`).
        let mut recent: Vec<NoteSource> = vec![];
        for source in self.journal.entries.iter().filter_map(|e| match e {
            Entry::Note(n) => n.source.clone(),
            Entry::Reading(r) => Some(r.source.clone()),
            Entry::Verse(_) => None,
        }) {
            if recent.len() < MAX_LOG_CHOICES && !recent.contains(&source) {
                recent.push(source);
            }
        }
        self.journal.recent_sources = recent;
    }
    /// Saves the open note if it changed. Returns false (keeping the draft) when saving fails.
    pub(crate) fn save_journal_note(&mut self) -> bool {
        let Some(open) = &mut self.journal.open else {
            return true;
        };
        if !open.dirty {
            return true;
        }
        let markdown = open.body.text();
        open.note.set_markdown(&markdown);
        // A note nobody wrote anything in is not kept.
        let empty = markdown.trim().is_empty() && open.note.reading_at.is_none();
        let note = open.note.clone();
        let Some(store) = &mut self.store else {
            return true;
        };
        let result = if empty {
            store.delete_note(&note.id).map(|()| None)
        } else {
            store.save_note(&note).map(Some)
        };
        let Some(saved) = self.report(result) else {
            return false;
        };
        if let Some(open) = &mut self.journal.open {
            open.dirty = false;
            open.saved_at = Some(store::now());
            if let Some(saved) = saved {
                // Later saves from this editor continue the note it saved to.
                open.note.id = saved.id;
                open.note.rev = saved.rev;
                if saved.read_only {
                    // The copy is a draft of its own; the published note keeps its reading.
                    open.note.reading_at = None;
                    open.status = "draft".into();
                    self.journal.notice = Some(READ_ONLY_COPY_NOTICE.into());
                } else if saved.forked {
                    self.journal.notice = Some(
                        "This note changed on another device while you wrote. Your version was saved as a separate note, so both are kept.".into(),
                    );
                }
            }
        }
        self.reload_journal();
        self.sync_soon();
        true
    }
    fn set_note_open(&mut self, open: Option<OpenNote>) {
        self.now = Instant::now();
        if open.is_some() != self.journal.open.is_some() {
            self.journal.snap_list = true;
        }
        let target = if open.is_some() { 1.0 } else { 0.0 };
        self.journal.open = open;
        self.journal
            .motion
            .set(target, self.now, self.motion.animate);
    }
    pub(crate) fn open_note(&mut self, note: Note, prompt: Option<String>) {
        let body = md_editor::Content::with_text(&note.markdown());
        let status = self
            .store
            .as_ref()
            .and_then(|s| s.note_status(&note.id).ok())
            .unwrap_or_else(|| "draft".into());
        self.journal.month = journal::month_of(&note.journal_date);
        self.journal.day = note.journal_date.clone();
        // Narrow windows: closing it shows its day (`closeNote` → the day's stage).
        self.journal.phone_day = true;
        self.set_note_open(Some(OpenNote {
            note,
            body,
            dirty: false,
            confirm_delete: false,
            prompt,
            undo: vec![],
            redo: vec![],
            last_edit: None,
            status,
            saved_at: None,
        }));
        self.journal.reading = None;
    }
    /// A sync found the open note published (or archived) while unsent text written in it was waiting: that text was
    /// kept as a separate draft, which the editor continues.
    pub(crate) fn follow_read_only_copies(&mut self, copies: &[(String, String, i64)]) {
        let Some(open) = &mut self.journal.open else {
            return;
        };
        if let Some((_, copy, rev)) = copies.iter().find(|(id, ..)| *id == open.note.id) {
            open.note.id = copy.clone();
            open.note.rev = *rev;
            open.note.reading_at = None;
            open.status = "draft".into();
            self.journal.notice = Some(READ_ONLY_COPY_NOTICE.into());
        }
    }
    /// After a sync: the open note follows its status on the account. A note that became read-only while text was
    /// being written in it keeps that text as a separate draft (`Store::save_note`); one that is read-only shows
    /// the account's current version.
    pub(crate) fn refresh_open_note(&mut self) {
        let Some(open) = &self.journal.open else {
            return;
        };
        let id = open.note.id.clone();
        let status = self.store.as_ref().map(|s| s.note_status(&id));
        let Some(status) = status.and_then(|r| self.report(r)) else {
            return;
        };
        let open = self.journal.open.as_mut().expect("checked above");
        if !store::status_is_read_only(&status) {
            if open.read_only() {
                // Back to a draft on the account: editable again, with its current text.
                open.status = status;
            }
            // A clean editor follows synced metadata and text too. Keeping its old local
            // revision makes the next edit look like a concurrent change and forks it.
            // reload_open_note preserves any writing that has not been saved yet.
            self.reload_open_note();
            return;
        }
        if open.dirty {
            // Saving keeps the text as its own draft and leaves the published note untouched.
            self.save_journal_note();
            return;
        }
        open.status = status;
        open.confirm_delete &= open.can_delete();
        self.reload_open_note();
    }
    /// Shows the stored version of the open note (which has nothing unsaved).
    fn reload_open_note(&mut self) {
        let Some(open) = &self.journal.open else {
            return;
        };
        if open.dirty {
            return;
        }
        let stored = self.store.as_ref().map(|s| s.note(&open.note.id));
        if let Some(Some(note)) = stored.and_then(|r| self.report(r))
            && let Some(open) = &mut self.journal.open
        {
            if note.markdown() != open.body.text() {
                open.body = md_editor::Content::with_text(&note.markdown());
                open.undo.clear();
                open.redo.clear();
            }
            open.note = note;
        }
    }
    /// Starts a note (saved once something is written), optionally quoting scripture from a source.
    pub(crate) fn start_note(
        &mut self,
        day: &str,
        source: Option<NoteSource>,
        body: &str,
        prompt: Option<String>,
    ) {
        let mut note = Note::new(day, source);
        note.body = body.to_string();
        let quoted = !body.is_empty();
        self.open_note(note, prompt);
        if let Some(open) = &mut self.journal.open {
            // A quote is already something worth keeping.
            open.dirty = quoted;
        }
    }
    /// The day's new entry: shown under the day's actions, kept as it is if something was already written in it
    /// (`restartEntryDraft`), otherwise started afresh on the selected day.
    fn show_composer(&mut self, prompt: Option<String>) {
        let day = self.journal.day.clone();
        match &mut self.journal.composer {
            Some(c) if !c.pristine() => {
                c.shown = true;
                c.draft.prompt = prompt;
            }
            _ => {
                self.journal.composer = Some(Composer {
                    draft: blank_entry(&day, prompt),
                    shown: true,
                    day: field_date(&day),
                    edited: false,
                    problem: None,
                    focused: false,
                });
            }
        }
        if self
            .journal
            .reading
            .as_ref()
            .is_some_and(|r| r.target == ReadingTarget::Composer)
        {
            self.journal.reading = None;
        }
    }
    /// An untouched new entry moves with the selected day.
    fn follow_day_with_composer(&mut self) {
        let day = self.journal.day.clone();
        if let Some(c) = &mut self.journal.composer
            && c.pristine()
        {
            c.draft.note.journal_date = day.clone();
            c.day = field_date(&day);
        }
    }
    /// Save entry (`saveEntryDraft`): the new entry becomes a note of its day, which then opens.
    fn save_entry(&mut self) -> Task<Message> {
        let Some(c) = &mut self.journal.composer else {
            return Task::none();
        };
        let text = c.draft.body.text();
        if c.draft.note.reading_at.is_none() && text.trim().is_empty() {
            c.problem = Some("Write a note or log your reading first.".into());
            return Task::none();
        }
        let Some(day) = parse_field_date(&c.day) else {
            c.problem = Some("Choose a day for this entry.".into());
            return Task::none();
        };
        let mut note = c.draft.note.clone();
        note.journal_date = day;
        note.set_markdown(&text);
        let now = store::now();
        note.created = now;
        note.updated = now;
        if note.reading_at.is_some() {
            note.reading_at = Some(now);
        }
        // The note in view keeps what was typed in it.
        if !self.save_journal_note() {
            return Task::none();
        }
        let Some(store) = &mut self.store else {
            return Task::none();
        };
        let result = store.save_note(&note);
        let Some(saved) = self.report(result) else {
            if let Some(c) = &mut self.journal.composer {
                c.problem =
                    Some("Your entry wasn't saved. Your text is still here; try again.".into());
            }
            return Task::none();
        };
        self.journal.composer = None;
        self.journal.reading = None;
        self.reload_journal();
        self.sync_soon();
        let stored = self.store.as_ref().map(|s| s.note(&saved.id));
        if let Some(Some(stored)) = stored.and_then(|r| self.report(r)) {
            self.open_note(stored, None);
        }
        Task::none()
    }
    /// Closing the app with something written in the new entry keeps it: it is saved as that day's entry (the
    /// website keeps an unsaved entry in the browser instead). Returns false, keeping the window open, if that fails.
    pub(crate) fn keep_entry_draft(&mut self) -> bool {
        let Some(c) = &self.journal.composer else {
            return true;
        };
        if c.draft.body.text().trim().is_empty() && c.draft.note.reading_at.is_none() {
            return true;
        }
        let mut note = c.draft.note.clone();
        note.set_markdown(&c.draft.body.text());
        if let Some(day) = parse_field_date(&c.day) {
            note.journal_date = day;
        }
        let Some(store) = &mut self.store else {
            return true;
        };
        let result = store.save_note(&note);
        if self.report(result).is_none() {
            return false;
        }
        self.journal.composer = None;
        self.sync_soon();
        true
    }
    /// The sources the reading chip can log for an entry: its own first, then the open note's, the selected day's
    /// and recent ones, one per chapter or guide (`ReadingChip`'s `choices`).
    fn reading_choices(&self, own: Option<&NoteSource>) -> Vec<NoteSource> {
        let mut out: Vec<NoteSource> = vec![];
        let day = journal::day_entries(&self.journal.entries, &self.journal.day);
        let candidates = own
            .into_iter()
            .cloned()
            .chain(
                self.journal
                    .open
                    .as_ref()
                    .and_then(|o| o.note.source.clone()),
            )
            .chain(day.iter().filter_map(|e| match e {
                Entry::Note(n) => n.source.clone(),
                Entry::Reading(r) => Some(r.source.clone()),
                Entry::Verse(_) => None,
            }))
            .chain(self.journal.recent_sources.iter().cloned());
        for source in candidates {
            if !out.iter().any(|o| chapter_key(o) == chapter_key(&source)) {
                out.push(source);
            }
            if out.len() > MAX_LOG_CHOICES {
                break;
            }
        }
        out
    }
    fn open_reading_editor(&mut self, target: ReadingTarget) {
        if self
            .journal
            .reading
            .as_ref()
            .is_some_and(|r| r.target == target)
        {
            self.journal.reading = None;
            return;
        }
        let (note, day) = match target {
            ReadingTarget::Note => match &self.journal.open {
                Some(o) if !o.read_only() => (o.note.clone(), o.note.journal_date.clone()),
                _ => return,
            },
            ReadingTarget::Composer => match &self.journal.composer {
                Some(c) => (
                    c.draft.note.clone(),
                    parse_field_date(&c.day).unwrap_or_else(|| c.draft.note.journal_date.clone()),
                ),
                None => return,
            },
        };
        let logged = note.reading_at.is_some();
        let own = if logged { note.source.as_ref() } else { None };
        let choices = self.reading_choices(own.or(note.source.as_ref()));
        let Some(first) = choices.first() else {
            return;
        };
        let start = first.verse_start.unwrap_or(1);
        self.journal.reading = Some(ReadingEdit {
            target,
            part: first.verse_start.is_some(),
            start: start.to_string(),
            end: first.verse_end.unwrap_or(start).to_string(),
            choices,
            chosen: 0,
            date: field_date(&day),
            error: None,
            editing: logged,
        });
    }
    /// Save reading / Log reading: the entry logs the chosen passage on the chosen day (`setEntryReading`).
    fn save_reading(&mut self, remove: bool) -> Task<Message> {
        let Some(edit) = &self.journal.reading else {
            return Task::none();
        };
        let whole = chapter_source(&edit.choices[edit.chosen]);
        let (part, start, end, date) = (
            edit.part,
            edit.start.clone(),
            edit.end.clone(),
            edit.date.clone(),
        );
        let count = whole
            .location()
            .and_then(|(l, _)| self.store.as_ref().and_then(|s| s.chapter(&l).ok()))
            .map(|v| v.len() as u32)
            .filter(|n| *n > 0);
        let Some(edit) = &mut self.journal.reading else {
            return Task::none();
        };
        let mut next = whole.clone();
        if !remove && part && whole.kind == store::SourceKind::Scripture {
            let first = start.trim().parse::<u32>().ok();
            let last = end.trim().parse::<u32>().ok();
            match (first, last) {
                (Some(first), Some(last))
                    if first >= 1 && last >= first && count.is_none_or(|n| last <= n) =>
                {
                    let label = format!(
                        "{}:{first}{}",
                        whole.label,
                        if last == first {
                            String::new()
                        } else {
                            format!("-{last}")
                        }
                    );
                    next.label = label.chars().take(200).collect();
                    next.href = format!("{}#v-{first}", whole.href);
                    next.verse_start = Some(first);
                    next.verse_end = Some(last);
                }
                _ => {
                    edit.error = Some(match count {
                        Some(n) => format!("Choose verses between 1 and {n}, in order."),
                        None => "Choose a valid verse range, in order.".into(),
                    });
                    return Task::none();
                }
            }
        }
        let day = parse_field_date(&date);
        if !remove && day.is_none() {
            edit.error = Some("Choose the day you read it.".into());
            return Task::none();
        }
        let target = edit.target;
        // An entry with no note text keeps its reading (`canRemove`): it would be empty. The editor stays open.
        if remove
            && target == ReadingTarget::Note
            && self
                .journal
                .open
                .as_ref()
                .is_some_and(|o| o.body.text().trim().is_empty())
        {
            return Task::none();
        }
        self.journal.reading = None;
        match target {
            ReadingTarget::Composer => {
                if let Some(c) = &mut self.journal.composer {
                    c.edited = true;
                    c.problem = None;
                    if remove {
                        c.draft.note.reading_at = None;
                    } else {
                        c.draft.note.source = Some(next);
                        c.draft.note.reading_at = Some(store::now());
                        if let Some(day) = day {
                            c.day = field_date(&day);
                        }
                    }
                }
            }
            ReadingTarget::Note => {
                let Some(open) = &mut self.journal.open else {
                    return Task::none();
                };
                if open.read_only() {
                    return Task::none();
                }
                if remove {
                    open.note.reading_at = None;
                } else {
                    open.note.source = Some(next);
                    open.note.reading_at = Some(open.note.reading_at.unwrap_or_else(store::now));
                    if let Some(day) = day {
                        open.note.journal_date = day;
                    }
                }
                open.dirty = true;
                if self.save_journal_note()
                    && let Some(open) = &self.journal.open
                {
                    // The entry moved to the day it was read: the journal follows it there.
                    let day = open.note.journal_date.clone();
                    self.journal.month = journal::month_of(&day);
                    self.journal.day = day;
                    self.reload_journal();
                }
            }
        }
        Task::none()
    }
    pub(crate) fn update_journal(&mut self, message: JournalMsg) -> Task<Message> {
        match message {
            JournalMsg::Month(by) => {
                self.journal.month = journal::shift_month(&self.journal.month, by);
                self.reload_journal();
            }
            JournalMsg::Today => {
                if !self.save_journal_note() {
                    return Task::none();
                }
                let today = store::today();
                self.journal.month = journal::month_of(&today);
                self.journal.day = today;
                self.journal.phone_day = true;
                self.follow_day_with_composer();
                self.reload_journal();
            }
            JournalMsg::ShowCalendar => self.journal.phone_day = false,
            JournalMsg::Day(day) => {
                if !self.save_journal_note() {
                    return Task::none();
                }
                self.journal.phone_day = true;
                self.journal.day = day;
                self.follow_day_with_composer();
                self.set_note_open(None);
            }
            JournalMsg::New(prompt) => {
                let prompted = prompt.is_some();
                self.show_composer(prompt);
                let focus = crate::presented(iced::widget::operation::focus("journal-composer"));
                if self.journal.open.is_some() {
                    return focus;
                }
                // In the main area the entry opens under the invitation: bring it into view (`block: "nearest"`).
                let height = (self.window_height - CONTENT_TOP - 32.0).max(320.0);
                let bottom =
                    21.0 + 28.0 + 12.0 + 280.0 + 12.0 + if prompted { 458.0 } else { 425.0 };
                let offset = (bottom + 21.0 - height).max(0.0);
                return Task::batch([
                    focus,
                    iced::widget::operation::scroll_to(
                        iced::widget::Id::new(CHOOSER),
                        iced::widget::scrollable::AbsoluteOffset { x: 0.0, y: offset },
                    ),
                ]);
            }
            JournalMsg::NextPrompt => {
                self.journal.prompt = (self.journal.prompt + 1) % REFLECTION_PROMPTS.len();
            }
            JournalMsg::Open(id) => {
                if !self.save_journal_note() {
                    return Task::none();
                }
                let note = self.store.as_ref().map(|s| s.note(&id));
                if let Some(Some(note)) = note.and_then(|r| self.report(r)) {
                    self.open_note(note, None);
                }
            }
            JournalMsg::Close => {
                if self.save_journal_note() {
                    self.journal.reading = None;
                    self.set_note_open(None);
                }
            }
            JournalMsg::Body(action) => {
                if let Some(open) = &mut self.journal.open {
                    // A read-only note can be selected and copied, never changed.
                    if open.read_only() && action.is_edit() {
                        return Task::none();
                    }
                    edit_entry(open, action);
                }
            }
            JournalMsg::Undo | JournalMsg::Redo => {
                if let Some(open) = &mut self.journal.open
                    && !open.read_only()
                {
                    step_history(open, matches!(message, JournalMsg::Undo));
                }
            }
            JournalMsg::ComposerBody(action) => {
                if let Some(c) = &mut self.journal.composer {
                    if action.is_edit() {
                        c.problem = None;
                    }
                    edit_entry(&mut c.draft, action);
                }
            }
            JournalMsg::ComposerUndo | JournalMsg::ComposerRedo => {
                if let Some(c) = &mut self.journal.composer {
                    step_history(&mut c.draft, matches!(message, JournalMsg::ComposerUndo));
                }
            }
            JournalMsg::ComposerDay(day) => {
                if let Some(c) = &mut self.journal.composer {
                    c.day = day.chars().take(10).collect();
                    c.edited = true;
                    c.problem = None;
                }
            }
            JournalMsg::ComposerFocus(focused) => {
                if let Some(c) = &mut self.journal.composer {
                    c.focused = focused;
                }
            }
            JournalMsg::SaveEntry => return self.save_entry(),
            JournalMsg::CloseComposer => {
                if let Some(c) = &mut self.journal.composer {
                    c.shown = false;
                }
                if self
                    .journal
                    .reading
                    .as_ref()
                    .is_some_and(|r| r.target == ReadingTarget::Composer)
                {
                    self.journal.reading = None;
                }
            }
            JournalMsg::Reading(target) => self.open_reading_editor(target),
            JournalMsg::ReadingChoose(index) => {
                if let Some(edit) = &mut self.journal.reading
                    && index < edit.choices.len()
                {
                    edit.chosen = index;
                    edit.part = false;
                    edit.error = None;
                }
            }
            JournalMsg::ReadingPart(part) => {
                if let Some(edit) = &mut self.journal.reading {
                    edit.part = part;
                    edit.error = None;
                }
            }
            JournalMsg::ReadingStart(ref value) | JournalMsg::ReadingEnd(ref value) => {
                let start = matches!(message, JournalMsg::ReadingStart(_));
                if let Some(edit) = &mut self.journal.reading {
                    let value: String =
                        value.chars().filter(char::is_ascii_digit).take(3).collect();
                    if start {
                        edit.start = value;
                    } else {
                        edit.end = value;
                    }
                    edit.error = None;
                }
            }
            JournalMsg::ReadingDate(value) => {
                if let Some(edit) = &mut self.journal.reading {
                    edit.date = value.chars().take(10).collect();
                    edit.error = None;
                }
            }
            JournalMsg::ReadingSave => return self.save_reading(false),
            JournalMsg::ReadingRemove => return self.save_reading(true),
            JournalMsg::ReadingCancel => self.journal.reading = None,
            JournalMsg::Delete => {
                if let Some(open) = &mut self.journal.open {
                    open.confirm_delete = open.can_delete();
                }
            }
            JournalMsg::ConfirmDelete(confirm) => {
                if let Some(open) = &mut self.journal.open {
                    open.confirm_delete = false;
                    if confirm && open.can_delete() {
                        let id = open.note.id.clone();
                        if let Some(s) = &mut self.store {
                            let r = s.delete_note(&id);
                            if self.report(r).is_some() {
                                self.journal.reading = None;
                                self.set_note_open(None);
                                self.reload_journal();
                                self.sync_soon();
                            }
                        }
                    }
                }
            }
            JournalMsg::EditGoals => {
                self.journal.goal_draft = Some(self.journal_goals());
                self.journal.goal_error = None;
                self.journal.goals_saved = false;
            }
            JournalMsg::GoalStep(study, by) => {
                if let Some(goals) = &mut self.journal.goal_draft {
                    if study {
                        goals.study_days = (goals.study_days as i32 + by).clamp(1, 7) as u32;
                    } else {
                        goals.reflections = (goals.reflections as i32 + by)
                            .clamp(1, store::MAX_WEEKLY_REFLECTIONS as i32)
                            as u32;
                    }
                }
            }
            JournalMsg::SaveGoals => {
                if let Some(goals) = self.journal.goal_draft {
                    if let Some(problem) = goals.problem() {
                        self.journal.goal_error = Some(problem);
                        return Task::none();
                    }
                    if self.account_signed_in() {
                        return self.save_account_goals(goals);
                    }
                    self.preferences.goals = goals;
                    self.persist();
                    self.journal.goal_draft = None;
                    self.journal.goals_saved = true;
                }
            }
            JournalMsg::CancelGoals => self.journal.goal_draft = None,
            JournalMsg::OpenSource(source) => {
                if !self.save_journal_note() {
                    return Task::none();
                }
                if let Some((location, verse)) = source.location() {
                    return self.navigate(location, verse);
                }
                if let Some(week) = source.href.strip_prefix("/come-follow-me/") {
                    return self.open_lesson(week);
                }
            }
            JournalMsg::DeleteReading(id) => {
                if let Some(s) = &mut self.store {
                    let r = s.delete_reading(&id);
                    if self.report(r).is_some() {
                        self.reload_journal();
                        self.sync_soon();
                    }
                }
            }
        }
        Task::none()
    }

    pub(crate) fn journal_view(&self) -> Element<'_, Message> {
        // Below the website's `lg` (64rem) the calendar, a day's entries and the open note are separate screens.
        if self.window_width < PHONE_BELOW {
            return self.journal_stages_view();
        }
        let p = self.p();
        let now = self.now;
        let t = self.journal.motion.value(now);
        let gutter = (self.window_width * 0.026).clamp(16.0, 32.0);
        let width = self.window_width - 2.0 * gutter;
        let height = (self.window_height - CONTENT_TOP - 32.0).max(320.0);
        let rail = if self.window_width >= 1280.0 {
            384.0
        } else {
            352.0
        };
        let main_x = rail + GAP;
        let main_w = (width - main_x).max(320.0);
        let mut layers = stack![].width(Fill).height(Fill);
        // Three layers at fixed positions in the stack (an empty one stands in for a hidden layer), so widget state
        // such as the title's focus survives the calendar disappearing at the end of the glide.
        // The calendar steps back as the note opens; hidden once it has faded.
        layers = layers.push(if t < 1.0 {
            Element::from(
                pin(container(self.calendar_card(p.faded(1.0 - t), t == 0.0))
                    .width(rail)
                    .height(height))
                .x(-12.0 * t),
            )
        } else {
            space().into()
        });
        // Present from the first frame (fully transparent), so the title can take focus as the note opens.
        layers = layers.push(match &self.journal.open {
            Some(open) => Element::from(
                pin(
                    container(self.note_card(open, p.faded(t), t == 1.0, main_w))
                        .width(main_w)
                        .height(height),
                )
                .x(main_x + 24.0 * (1.0 - t)),
            ),
            None => space().into(),
        });
        // The day's card: the main area when the calendar shows, the rail when a note is open.
        let chooser_x = main_x * (1.0 - t);
        let chooser_w = main_w + (rail - main_w) * t;
        layers = layers.push(
            pin(container(self.chooser_card(t > 0.5, chooser_w))
                .width(chooser_w)
                .height(height))
            .x(chooser_x),
        );
        let page = stack![container(layers).padding(Padding {
            top: CONTENT_TOP,
            right: gutter,
            bottom: 32.0,
            left: gutter,
        })]
        .width(Fill)
        .height(Fill);
        page.into()
    }

    /// The website's phone layout (`layout="phone"`), used below 1024px: one screen per stage. The calendar with the
    /// invitation and goals; then a day's entries under "‹ Calendar"; then the note under "‹ {day}".
    fn journal_stages_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let gutter = 24.0;
        let width = self.window_width - 2.0 * gutter;
        let back = |label: String, m: JournalMsg| {
            button(
                container(
                    row![
                        icon(&icons::CHEVRON_LEFT, p.ink, 14.),
                        text(label).size(14).font(sans(font::Weight::Bold))
                    ]
                    .spacing(6)
                    .align_y(Center),
                )
                .center_y(40),
            )
            .padding([0, 8])
            .height(40)
            .on_press(Message::Journal(m))
            .style(design::circle(p))
        };
        let page_padding = Padding {
            top: CONTENT_TOP,
            right: gutter,
            bottom: 32.0,
            left: gutter,
        };
        if let Some(open) = &self.journal.open {
            // `min-h-[60dvh]`.
            let height = self.window_height * 0.6;
            let note = container(self.note_card(open, p, true, width)).height(height);
            return container(
                column![
                    back(
                        journal::day_heading(&open.note.journal_date),
                        JournalMsg::Close
                    ),
                    note
                ]
                .spacing(12),
            )
            .padding(page_padding)
            .into();
        }
        let content: Element<'_, Message> = if self.journal.phone_day {
            column![
                container(back("Calendar".into(), JournalMsg::ShowCalendar)),
                self.chooser_content(false, width + 42.0),
            ]
            .spacing(12)
            .into()
        } else {
            let mut screen = column![
                self.invitation(),
                container(self.calendar_content(p, true, true)).style(design::card(p, 12.0)),
            ]
            .spacing(12);
            let today = store::today();
            if let Some(note) = journal::revisit(&self.journal.notes, &today) {
                screen = screen.push(self.revisit(note, width + 42.0));
            }
            screen.into()
        };
        self.scroll(container(content).padding(page_padding))
            .height(Fill)
            .into()
    }

    fn calendar_card(&self, p: Colors, interactive: bool) -> Element<'_, Message> {
        container(
            self.scroll(self.calendar_content(p, interactive, false))
                .height(Fill),
        )
        .width(Fill)
        .height(Fill)
        .style(design::card(p, 12.0))
        .into()
    }
    /// The month and the weekly goals: the desktop rail's (36px days) or the phone screen's (48px days).
    fn calendar_content(&self, p: Colors, interactive: bool, phone: bool) -> Element<'_, Message> {
        let day_height = if phone { 48.0 } else { 36.0 };
        let today = store::today();
        let month = &self.journal.month;
        let nav = |glyph: &'static icons::Icon, by: i32| {
            button(container(icon(glyph, p.ink, 13.)).center_x(36).center_y(36))
                .padding(0)
                .on_press_maybe(interactive.then_some(Message::Journal(JournalMsg::Month(by))))
                .style(design::outlined(p, 18.0))
        };
        let header = row![
            text(journal::month_heading(month))
                .font(serif())
                .size(18)
                .width(Fill),
            nav(&icons::CHEVRON_LEFT, -1),
            button(
                container(text("Today").size(14).font(sans(font::Weight::Semibold))).center_y(Fill)
            )
            .padding([0, 14])
            .height(36)
            .on_press_maybe(interactive.then_some(Message::Journal(JournalMsg::Today)))
            .style(design::outlined(p, 18.0)),
            nav(&icons::CHEVRON_RIGHT, 1),
        ]
        .spacing(6)
        .align_y(Center);
        let mut weekdays = row![].spacing(4);
        for day in WEEKDAYS {
            weekdays = weekdays.push(
                text(day)
                    .size(11)
                    .font(sans(font::Weight::Bold))
                    .color(p.faint)
                    .center()
                    .width(Fill),
            );
        }
        let counts = |day: &str| journal::day_entries(&self.journal.entries, day).len();
        let mut grid = column![].spacing(4);
        for week in journal::month_grid(month).chunks(7) {
            let mut line = row![].spacing(4);
            for cell in week {
                line = line.push(match cell {
                    None => Element::from(space().width(Fill).height(day_height)),
                    Some(day) => {
                        let selected = *day == self.journal.day;
                        let is_today = *day == today;
                        let has = counts(day) > 0;
                        let number = day[8..].trim_start_matches('0').to_string();
                        let dot = container(space().width(6).height(6)).style(move |_| {
                            container::Style {
                                background: has.then(|| p.primary.into()),
                                border: Border {
                                    color: if has { p.rule } else { Color::TRANSPARENT },
                                    width: if has { 1.0 } else { 0.0 },
                                    radius: 3.0.into(),
                                },
                                ..Default::default()
                            }
                        });
                        button(
                            container(
                                column![text(number).size(14).font(sans(font::Weight::Bold)), dot]
                                    .spacing(2)
                                    .align_x(Center),
                            )
                            .center_x(Fill)
                            .padding(Padding::ZERO.top(if phone { 12.0 } else { 6.0 })),
                        )
                        .padding(0)
                        .width(Fill)
                        .height(day_height)
                        .on_press_maybe(
                            interactive.then(|| Message::Journal(JournalMsg::Day(day.clone()))),
                        )
                        .style(move |_, status| button::Style {
                            background: if selected {
                                Some(p.ink.into())
                            } else if matches!(status, button::Status::Hovered) {
                                Some(p.hover.into())
                            } else {
                                None
                            },
                            text_color: if selected { p.paper } else { p.ink },
                            border: Border {
                                color: if selected {
                                    p.rule
                                } else if is_today {
                                    p.accent
                                } else {
                                    Color::TRANSPARENT
                                },
                                width: 2.0,
                                radius: 12.8.into(),
                            },
                            ..Default::default()
                        })
                        .into()
                    }
                });
            }
            grid = grid.push(line);
        }
        let calendar = column![header, weekdays, grid].spacing(6);
        let content = column![
            calendar,
            space().height(20),
            self.goals_section(p, &today, interactive),
        ];
        container(content)
            .padding(if phone { 16 } else { 20 })
            .into()
    }

    fn goals_section(&self, p: Colors, today: &str, interactive: bool) -> Element<'_, Message> {
        let progress = journal::progress(&self.journal.entries, today);
        let goals = self.journal_goals();
        let (start, end) = journal::goal_week(today);
        let rule = || {
            container(space().height(1).width(Fill)).style(move |_| container::Style {
                background: Some(p.rule.into()),
                ..Default::default()
            })
        };
        let goal_icon = |glyph: &'static icons::Icon| {
            container(icon(glyph, p.goal, 19.))
                .center_x(48)
                .center_y(48)
                .style(move |_| container::Style {
                    background: Some(p.soft.into()),
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 24.0.into(),
                    },
                    ..Default::default()
                })
        };
        let bar = |count: usize, target: u32| {
            let fraction = (count as f32 / target.max(1) as f32).min(1.0);
            let filled = (fraction * 1000.0).round() as u16;
            let mut track = row![].width(Fill);
            if filled > 0 {
                track = track.push(
                    container(space().height(9))
                        .width(Length::FillPortion(filled))
                        .style(move |_| container::Style {
                            background: Some(p.goal.into()),
                            border: Border {
                                radius: 16.0.into(),
                                ..Default::default()
                            },
                            ..Default::default()
                        }),
                );
            }
            if filled < 1000 {
                track = track.push(space().width(Length::FillPortion(1000 - filled)).height(9));
            }
            container(track)
                .width(Fill)
                .height(9)
                .style(move |_| container::Style {
                    background: Some(p.rule.into()),
                    border: Border {
                        radius: 16.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                })
        };
        let lh = |px: f32| iced::widget::text::LineHeight::Absolute(px.into());
        // `.goal`: the 3rem icon beside its heading (1.02rem, line-height 1.4), the bar and count 0.5rem under it,
        // and the hint (0.74rem, 1.5) 0.5rem under that.
        let goal = |glyph: &'static icons::Icon,
                    title: String,
                    count: usize,
                    target: u32,
                    hint: &'static str| {
            row![
                goal_icon(glyph),
                column![
                    text(title).font(serif()).size(16.32).line_height(lh(22.85)),
                    space().height(8),
                    row![
                        bar(count, target),
                        row![
                            text(count.to_string())
                                .size(12.8)
                                .font(sans(font::Weight::Semibold)),
                            text(format!(" / {target}")).size(12.8).color(p.muted),
                        ]
                    ]
                    .spacing(12.8)
                    .align_y(Center),
                    space().height(8),
                    text(hint).size(11.84).line_height(lh(17.76)).color(p.muted),
                ]
                .width(Fill),
            ]
            .spacing(16)
            .align_y(Center)
        };
        let plural = |n: u32, one: &str, many: &str| {
            if n == 1 {
                one.to_string()
            } else {
                many.to_string()
            }
        };
        let study_hint = if progress.study_days >= goals.study_days as usize {
            "Your weekly study goal is met. Keep a little light with you."
        } else {
            "A little time in scripture each day."
        };
        let reflect_hint = if progress.reflections >= goals.reflections as usize {
            "Your weekly reflection goal is met."
        } else {
            "Turn what you read into a note."
        };
        // `.editButton`: 44px tall, pulled into the heading's line by its negative margins.
        let edit = button(
            container(
                row![
                    icon(&icons::PEN, p.accent, 12.8),
                    text("Edit goals")
                        .size(12.48)
                        .font(sans(font::Weight::Semibold))
                ]
                .spacing(7.2)
                .align_y(Center),
            )
            .center_y(31.2),
        )
        .padding(0)
        .height(31.2)
        .on_press_maybe(interactive.then_some(Message::Journal(JournalMsg::EditGoals)))
        .style(design::link(p.accent));
        let weekly = column![
            row![
                text("Weekly goals")
                    .font(serif())
                    .size(20.8)
                    .line_height(lh(31.2))
                    .width(Fill),
                edit
            ]
            .align_y(Center),
            space().height(4),
            text(format!(
                "{} – {}",
                journal::short_date(&start),
                journal::short_date(&end)
            ))
            .size(12)
            .line_height(lh(18.0))
            .color(p.faint),
            space().height(26.4),
            goal(
                &icons::BOOK_OPEN,
                format!(
                    "Study {} {} a week",
                    goals.study_days,
                    plural(goals.study_days, "day", "days")
                ),
                progress.study_days,
                goals.study_days,
                study_hint
            ),
            space().height(26.4),
            goal(
                &icons::PEN,
                format!(
                    "Write {} {} a week",
                    goals.reflections,
                    plural(goals.reflections, "reflection", "reflections")
                ),
                progress.reflections,
                goals.reflections,
                reflect_hint
            ),
            // `.savedNotice` keeps its line (0.65rem above, at least 1rem tall) whether or not it says anything.
            space().height(10.4),
            container(if self.journal.goals_saved {
                Element::from(text("Weekly goals saved.").size(12).color(p.muted))
            } else {
                space().into()
            })
            .height(16),
        ];
        let month_days = progress.month_study_days;
        let month = column![
            row![
                text("This month")
                    .font(serif())
                    .size(20.8)
                    .line_height(lh(31.2))
                    .width(Fill),
                text(journal::month_heading(&journal::month_of(today)))
                    .size(11.52)
                    .color(p.faint)
            ]
            .align_y(Center),
            space().height(16),
            row![
                goal_icon(&icons::CALENDAR_DAYS),
                column![
                    text(format!(
                        "{} of study",
                        journal::plural(month_days, "day", "days")
                    ))
                    .font(serif())
                    .size(18.4)
                    .line_height(lh(25.76)),
                    space().height(8),
                    text(if month_days > 0 {
                        "You're showing up. Keep going."
                    } else {
                        "A fresh moment to begin."
                    })
                    .size(11.84)
                    .line_height(lh(17.76))
                    .color(p.muted),
                ]
                .width(Fill),
            ]
            .spacing(16)
            .align_y(Center),
        ];
        column![
            rule(),
            space().height(20.8),
            weekly,
            space().height(19.2),
            rule(),
            space().height(20.8),
            month
        ]
        .into()
    }

    /// The selected day. In the main area (`compact` false): its heading, the invitation to reflect, the new entry,
    /// "Today's journal" and its entries, then a thought worth revisiting. In the rail beside an open note: back,
    /// the short date, New note (and the new entry under it), then the day's entry cards. `width` is the card's.
    fn chooser_card(&self, compact: bool, width: f32) -> Element<'_, Message> {
        // One list in either place: it is put back at its top whenever a note opens or closes (`snap_list`).
        let list = self
            .scroll(container(self.chooser_content(compact, width)).padding(21))
            .id(iced::widget::Id::new(CHOOSER))
            .height(Fill);
        container(list)
            .width(Fill)
            .height(Fill)
            .style(design::card(self.p(), 12.0))
            .into()
    }
    fn chooser_content(&self, compact: bool, width: f32) -> iced::widget::Column<'_, Message> {
        let p = self.p();
        let today = store::today();
        let day = &self.journal.day;
        let is_today = *day == today;
        let inner = (width - 2.0 * 21.0).max(120.0);
        let today_tag = || {
            text("Today")
                .font(iced::Font {
                    weight: font::Weight::Bold,
                    ..serif()
                })
                .size(14)
                .color(p.accent)
        };
        let entries = journal::day_entries(&self.journal.entries, day);
        // The website lists a day's entries oldest first.
        let mut entries: Vec<&Entry> = entries;
        entries.sort_by_key(|e| e.time());
        let composer = self
            .journal
            .composer
            .as_ref()
            .filter(|c| c.shown)
            .map(|c| self.composer_card(c, inner));
        let mut content = column![].spacing(12);
        if compact {
            // `Back to calendar`, then the date abbreviated as the rail is narrow.
            let mut heading = row![
                button(
                    container(icon(&icons::CHEVRON_LEFT, p.ink, 13.))
                        .center_x(36)
                        .center_y(36)
                )
                .padding(0)
                .on_press(Message::Journal(JournalMsg::Close))
                .style(design::outlined(p, 18.0)),
                text(short_day_heading(day)).font(serif()).size(18),
            ]
            .spacing(8)
            .align_y(Center);
            if is_today {
                heading = heading.push(today_tag());
            }
            let new_note = button(
                container(
                    row![
                        icon(&icons::PLUS, p.ink, 12.),
                        text("New note").size(14).font(sans(font::Weight::Semibold))
                    ]
                    .spacing(6)
                    .align_y(Center),
                )
                .center_y(36),
            )
            .padding([0, 14])
            .height(36)
            .on_press(Message::Journal(JournalMsg::New(None)))
            .style(design::outlined(p, 18.0));
            let mut top = column![heading, new_note].spacing(8);
            if let Some(composer) = composer {
                top = top.push(composer);
            }
            content = content.push(top);
            let mut list = column![].spacing(10);
            for entry in &entries {
                list = list.push(self.entry_card(entry, inner));
            }
            if entries.is_empty() {
                list = list.push(empty_day(p));
            }
            content = content.push(list);
        } else {
            let mut heading = row![text(journal::day_heading(day)).font(serif()).size(20)]
                .spacing(8)
                .align_y(iced::Alignment::End);
            if is_today {
                heading = heading.push(today_tag());
            }
            content = content.push(heading).push(self.invitation());
            // The day's actions: the new entry once started. The website's actions row keeps its gap when empty.
            let composing = composer.is_some();
            if let Some(composer) = composer {
                content = content.push(composer);
            }
            let journal_heading = row![
                text(if is_today {
                    "Today’s journal"
                } else {
                    "This day’s journal"
                })
                .font(serif())
                .size(24)
                .line_height(iced::widget::text::LineHeight::Absolute(36.0.into()))
                .width(Fill),
                text(journal::plural(entries.len(), "entry", "entries"))
                    .size(12)
                    .color(p.faint)
            ]
            .align_y(Center)
            .padding(Padding::ZERO.top(if composing { 9.6 } else { 21.6 }));
            let mut list = column![rule(p)];
            if entries.is_empty() {
                list = list.push(empty_day(p));
            }
            for entry in &entries {
                list = list.push(self.entry_row(entry, inner)).push(rule(p));
            }
            content = content.push(column![journal_heading, space().height(12), list]);
            let before = if *day < today {
                day.clone()
            } else {
                today.clone()
            };
            if let Some(note) = journal::revisit(&self.journal.notes, &before) {
                content = content.push(self.revisit(note, inner));
            }
        }
        content
    }

    fn invitation(&self) -> Element<'_, Message> {
        let prompt = REFLECTION_PROMPTS[self.journal.prompt];
        // Disabled while the new entry is being written (`disabled={creating || composing}`).
        let composing = self.journal.composer.as_ref().is_some_and(|c| c.shown);
        let write = button(
            container(
                row![
                    icon(&icons::PEN, Color::from_rgb8(0x18, 0x17, 0x15), 16.),
                    text("Write a reflection")
                        .size(14.08)
                        .font(sans(font::Weight::Semibold))
                ]
                .spacing(10.4)
                .align_y(Center),
            )
            .center_y(Fill),
        )
        .padding([0, 19])
        .height(44)
        .on_press_maybe(
            (!composing).then(|| Message::Journal(JournalMsg::New(Some(prompt.to_string())))),
        )
        .style(move |_, status| {
            let base = if matches!(status, button::Status::Hovered) {
                design::mix(ART_BUTTON, Color::BLACK, 0.05)
            } else {
                ART_BUTTON
            };
            let alpha = if composing { 0.5 } else { 1.0 };
            button::Style {
                background: Some(design::fade(base, alpha).into()),
                text_color: design::fade(Color::from_rgb8(0x18, 0x17, 0x15), alpha),
                border: Border {
                    color: design::fade(ART_BUTTON, alpha),
                    width: 1.0,
                    radius: 9.6.into(),
                },
                ..Default::default()
            }
        });
        let another = button(
            column![
                text("Choose another prompt")
                    .font(serif())
                    .size(15.7)
                    .color(ON_ART),
                container(space().height(1).width(Fill)).style(|_| container::Style {
                    background: Some(ON_ART.into()),
                    ..Default::default()
                })
            ]
            .spacing(3)
            .width(Length::Shrink),
        )
        .padding([6, 0])
        .on_press(Message::Journal(JournalMsg::NextPrompt))
        .style(|_, _| button::Style::default());
        let copy = column![
            text("Make room for a little light.")
                .font(serif())
                .size(32.2)
                .line_height(1.12)
                .color(ON_ART),
            space().height(14.4),
            container(
                text(prompt)
                    .font(serif())
                    .size(18.4)
                    .line_height(1.5)
                    .color(ON_ART)
            )
            .max_width(448)
            .height(56),
            space().height(22.4),
            row![write, another].spacing(24).align_y(Center),
        ]
        .max_width(560);
        let art = image(dawn())
            .content_fit(iced::ContentFit::Cover)
            .width(Fill)
            .height(Fill)
            .border_radius(11.2);
        stack![
            art,
            container(space())
                .width(Fill)
                .height(Fill)
                .style(|_| container::Style {
                    background: Some(Color::from_rgba8(14, 19, 16, 0.2).into()),
                    border: Border {
                        radius: 11.2.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }),
            container(copy).padding([0, 37]).center_y(Fill),
        ]
        .width(Fill)
        .height(280)
        .into()
    }

    fn revisit<'a>(&'a self, note: &'a Note, width: f32) -> Element<'a, Message> {
        let p = self.p();
        // The card's 1rem padding, its icon and gaps, and the Open note pill.
        let copy_width = width - 2.0 * 17.0 - 48.0 - 2.0 * 16.0 - 96.0;
        let mut copy = column![
            text(note.display_title())
                .font(serif())
                .size(18.4)
                .wrapping(iced::widget::text::Wrapping::WordOrGlyph)
        ]
        .spacing(5.6)
        .width(Fill);
        let excerpt = note.excerpt(220);
        if !excerpt.is_empty() {
            copy = copy.push(
                text(design::clamp_lines(
                    &excerpt,
                    13.6,
                    20.4,
                    sans(font::Weight::Normal),
                    copy_width,
                    2,
                ))
                .size(13.6)
                .line_height(1.5)
                .color(p.muted),
            );
        }
        column![
            space().height(12),
            rule(p),
            space().height(20.8),
            row![
                text("A thought worth revisiting")
                    .font(serif())
                    .size(20)
                    .width(Fill),
                text(journal::short_date(&note.journal_date))
                    .size(11.8)
                    .color(p.faint)
            ]
            .align_y(Center),
            space().height(16),
            button(
                row![
                    note_icon(p, &icons::PEN, 19.2),
                    copy,
                    container(text("Open note").size(12.8))
                        .padding([7, 16])
                        .style(move |_| container::Style {
                            border: Border {
                                color: p.rule,
                                width: 1.0,
                                radius: 32.0.into(),
                            },
                            ..Default::default()
                        }),
                ]
                .spacing(16)
                .align_y(Center),
            )
            .padding(16)
            .width(Fill)
            .on_press(Message::Journal(JournalMsg::Open(note.id.clone())))
            .style(move |_, status| button::Style {
                background: Some(
                    if matches!(status, button::Status::Hovered) {
                        p.hover
                    } else {
                        p.soft
                    }
                    .into(),
                ),
                text_color: p.ink,
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 9.6.into(),
                },
                ..Default::default()
            }),
        ]
        .into()
    }

    /// Who wrote an entry here: the account's name (as the website labels its own notes), else "You".
    fn author_label(&self) -> String {
        self.account
            .session
            .as_ref()
            .map(|s| s.user.name.trim().to_string())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "You".into())
    }

    /// `NoteSourceLine`: who, a verb, where it came from (a link back) or that it is personal, and when.
    fn source_line<'a>(
        &self,
        source: Option<&NoteSource>,
        verb: &str,
        time: i64,
        link: Option<Message>,
    ) -> Element<'a, Message> {
        let p = self.p();
        let small = |s: String| text(s).size(12).color(p.muted);
        let mut line = row![
            row![
                icon(&icons::USER, p.ink, 10.),
                text(self.author_label())
                    .size(12)
                    .font(sans(font::Weight::Semibold))
            ]
            .spacing(4)
            .align_y(Center),
            small(verb.to_lowercase()),
        ]
        .spacing(6)
        .align_y(Center);
        match (source, link) {
            (Some(source), Some(link)) => {
                let glyph = if source.kind == store::SourceKind::Guide {
                    &icons::FEATHER
                } else {
                    &icons::BOOK_OPEN
                };
                line = line.push(small("from".into())).push(
                    button(
                        column![
                            row![
                                icon(glyph, p.ink, 10.),
                                text(source.label.clone())
                                    .size(12)
                                    .font(sans(font::Weight::Semibold))
                                    .color(p.ink)
                            ]
                            .spacing(4)
                            .align_y(Center),
                            container(space().height(1).width(Fill)).style(move |_| {
                                container::Style {
                                    background: Some(design::rule_strong(p).into()),
                                    ..Default::default()
                                }
                            }),
                        ]
                        .spacing(1)
                        .width(Length::Shrink),
                    )
                    .padding(0)
                    .on_press(link)
                    .style(|_, _| button::Style::default()),
                );
            }
            _ => {
                line = line.push(
                    text("a personal note (no reading source)")
                        .size(12)
                        .font(iced::Font {
                            style: font::Style::Italic,
                            ..sans(font::Weight::Normal)
                        })
                        .color(p.muted),
                );
            }
        }
        line.push(text("·").size(12).color(p.muted))
            .push(small(clock(time)))
            .wrap()
            .vertical_spacing(4)
            .into()
    }

    /// What a row shows for an entry: its icon, title, "Reading logged", excerpt and source line.
    fn entry_parts<'a>(&'a self, entry: &'a Entry) -> EntryParts<'a> {
        match entry {
            Entry::Note(n) => {
                let reading = n.reading_at.is_some();
                let excerpt = n.excerpt(220);
                let by_reading = reading && !n.has_reflection();
                EntryParts {
                    glyph: if reading {
                        &icons::BOOK_OPEN
                    } else {
                        &icons::LIGHTBULB
                    },
                    title: if by_reading {
                        format!(
                            "Read {}",
                            n.source
                                .as_ref()
                                .map(|s| s.label.as_str())
                                .unwrap_or("a passage")
                        )
                    } else {
                        n.display_title()
                    },
                    excerpt,
                    logged: reading && !by_reading,
                    source: n.source.as_ref(),
                    verb: if reading { "Logged" } else { "Wrote" },
                    on_press: Message::Journal(JournalMsg::Open(n.id.clone())),
                    time: n.created,
                    status: self.journal.statuses.get(&n.id).cloned(),
                }
            }
            Entry::Reading(r) => EntryParts {
                glyph: &icons::BOOK_OPEN,
                title: format!("Read {}", r.source.label),
                excerpt: String::new(),
                logged: false,
                source: Some(&r.source),
                verb: "Logged",
                on_press: Message::Journal(JournalMsg::OpenSource(r.source.clone())),
                time: r.read_at,
                status: None,
            },
            Entry::Verse(v) => EntryParts {
                glyph: &icons::NOTE_STICKY,
                title: v.reference.clone(),
                excerpt: v.note.clone(),
                logged: false,
                source: None,
                verb: "Noted",
                on_press: Message::Navigate(v.location.clone(), Some(v.verse)),
                time: v.updated,
                status: None,
            },
        }
    }

    fn source_link(&self, entry: &Entry) -> Option<Message> {
        match entry {
            Entry::Note(Note {
                source: Some(source),
                ..
            }) => Some(Message::Journal(JournalMsg::OpenSource(source.clone()))),
            Entry::Reading(r) => Some(Message::Journal(JournalMsg::OpenSource(r.source.clone()))),
            _ => None,
        }
    }

    /// One entry of the day's list in the main area (`.entryList > li`): a ruled row, its 3rem round icon, the
    /// title, excerpt (two lines) and source line, the whole row tinted on hover.
    fn entry_row<'a>(&'a self, entry: &'a Entry, width: f32) -> Element<'a, Message> {
        let p = self.p();
        if let Entry::Reading(r) = entry {
            return self.reading_row(r, true);
        }
        if let Entry::Verse(v) = entry {
            return self.journal_verse_row(v, true);
        }
        let parts = self.entry_parts(entry);
        let copy_width = width - 2.0 * 16.0 - 48.0 - 16.0;
        let mut copy = column![
            text(design::clamp_lines(
                &parts.title,
                19.2,
                26.4,
                serif(),
                copy_width - if parts.status.is_some() { 90.0 } else { 0.0 },
                2,
            ))
            .font(serif())
            .size(19.2)
            .line_height(iced::widget::text::LineHeight::Absolute(26.4.into()))
        ]
        .width(Fill);
        if parts.logged {
            copy = copy.push(space().height(2)).push(
                text("Reading logged")
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
            );
        }
        if !parts.excerpt.is_empty() {
            copy = copy.push(space().height(5.6)).push(
                text(design::clamp_lines(
                    &parts.excerpt,
                    14.08,
                    21.12,
                    sans(font::Weight::Normal),
                    copy_width,
                    2,
                ))
                .size(14.08)
                .line_height(iced::widget::text::LineHeight::Absolute(21.12.into()))
                .color(p.muted),
            );
        }
        let mut head = row![note_icon(p, parts.glyph, 16.), copy]
            .spacing(16)
            .align_y(Center);
        if let Some(status) = &parts.status {
            head = head.push(status_tag(p, status));
        }
        let source = self.source_line(
            parts.source,
            parts.verb,
            parts.time,
            self.source_link(entry),
        );
        let selected =
            matches!((entry, &self.journal.open), (Entry::Note(n), Some(o)) if o.note.id == n.id);
        let body = column![
            head,
            container(source).padding(Padding::ZERO.top(6).left(64))
        ];
        // The row is the button; its source link stays clickable on its own (`raiseLink`).
        button(body)
            .padding([19.2, 16.0])
            .width(Fill)
            .on_press(parts.on_press)
            .style(move |_, status| button::Style {
                background: if selected {
                    Some(p.note.into())
                } else if matches!(status, button::Status::Hovered) {
                    Some(p.soft.into())
                } else {
                    None
                },
                text_color: p.ink,
                ..Default::default()
            })
            .into()
    }

    /// One entry card in the rail (`JournalNoteCard`, prominent): bordered and rounded, the open note tinted.
    fn entry_card<'a>(&'a self, entry: &'a Entry, width: f32) -> Element<'a, Message> {
        let p = self.p();
        if let Entry::Reading(r) = entry {
            return self.reading_row(r, false);
        }
        if let Entry::Verse(v) = entry {
            return self.journal_verse_row(v, false);
        }
        let parts = self.entry_parts(entry);
        let selected =
            matches!((entry, &self.journal.open), (Entry::Note(n), Some(o)) if o.note.id == n.id);
        let copy_width = width - 2.0 * 17.0 - 14.0 - 8.0;
        let mut copy = column![
            text(design::clamp_lines(
                &parts.title,
                17.92,
                24.64,
                serif(),
                copy_width - if parts.status.is_some() { 80.0 } else { 0.0 },
                2,
            ))
            .font(serif())
            .size(17.92)
            .line_height(iced::widget::text::LineHeight::Absolute(24.64.into()))
        ]
        .width(Fill);
        if parts.logged {
            copy = copy.push(space().height(2)).push(
                text("Reading logged")
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
            );
        }
        if !parts.excerpt.is_empty() {
            copy = copy.push(space().height(2)).push(
                text(design::clamp_lines(
                    &parts.excerpt,
                    12.0,
                    20.0,
                    sans(font::Weight::Normal),
                    copy_width,
                    2,
                ))
                .size(12)
                .line_height(iced::widget::text::LineHeight::Absolute(20.0.into()))
                .color(p.muted),
            );
        }
        let mut head = row![
            container(icon(parts.glyph, p.ink, 14.))
                .center_x(14)
                .padding(Padding::ZERO.top(5)),
            copy
        ]
        .spacing(8);
        if let Some(status) = &parts.status {
            head = head.push(status_tag(p, status));
        }
        let source = self.source_line(
            parts.source,
            parts.verb,
            parts.time,
            self.source_link(entry),
        );
        button(column![
            head,
            container(source).padding(Padding::ZERO.top(6).left(20))
        ])
        .padding([12, 16])
        .width(Fill)
        .on_press(parts.on_press)
        .style(move |_, status| button::Style {
            background: Some(
                if selected {
                    p.note
                } else if matches!(status, button::Status::Hovered) {
                    p.hover
                } else {
                    p.card
                }
                .into(),
            ),
            text_color: p.ink,
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 16.0.into(),
            },
            shadow: if selected || matches!(status, button::Status::Hovered) {
                design::soft_shadow(p)
            } else {
                iced::Shadow::default()
            },
            ..Default::default()
        })
        .into()
    }

    /// A reading logged without a note: the whole card links back to what was read (`EntryRow`'s reading). This
    /// computer's own readings can also be removed here.
    fn reading_row<'a>(&'a self, r: &'a store::Reading, row_style: bool) -> Element<'a, Message> {
        let p = self.p();
        let marked = r.origin == "chapter_mark" || r.origin == "legacy";
        let copy = column![
            row![
                icon(&icons::BOOK, p.accent, 14.),
                text("Reading").size(14).font(sans(font::Weight::Bold)),
                column![
                    text(r.source.label.clone())
                        .size(14)
                        .font(sans(font::Weight::Bold)),
                    container(space().height(1).width(Fill)).style(move |_| container::Style {
                        background: Some(p.ink.into()),
                        ..Default::default()
                    }),
                ]
                .spacing(1)
                .width(Length::Shrink),
            ]
            .spacing(8)
            .align_y(Center),
            text(format!(
                "{} at {}",
                if marked {
                    "Chapter marked read"
                } else {
                    "Logged"
                },
                clock(r.read_at)
            ))
            .size(12)
            .color(p.muted),
        ]
        .spacing(2)
        .width(Fill);
        let line = row![
            copy,
            button(icon(&icons::TRASH, p.faint, 11.))
                .padding(6)
                .on_press(Message::Journal(JournalMsg::DeleteReading(r.id.clone())))
                .style(design::circle(p)),
        ]
        .align_y(Center);
        let link = button(line)
            .width(Fill)
            .on_press(Message::Journal(JournalMsg::OpenSource(r.source.clone())));
        if row_style {
            link.padding([19.2, 16.0])
                .style(move |_, status| button::Style {
                    background: matches!(status, button::Status::Hovered).then(|| p.soft.into()),
                    text_color: p.ink,
                    ..Default::default()
                })
                .into()
        } else {
            link.padding([12, 16])
                .style(move |_, status| button::Style {
                    background: Some(
                        if matches!(status, button::Status::Hovered) {
                            p.hover
                        } else {
                            p.card
                        }
                        .into(),
                    ),
                    text_color: p.ink,
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 16.0.into(),
                    },
                    ..Default::default()
                })
                .into()
        }
    }

    /// An older verse note: read-only here, opened in the reader.
    fn journal_verse_row<'a>(
        &'a self,
        v: &'a store::StudyEntry,
        row_style: bool,
    ) -> Element<'a, Message> {
        let p = self.p();
        let source = NoteSource::scripture(&v.reference, &v.location, Some((v.verse, v.verse)));
        let body: String = v.note.chars().take(600).collect();
        let content = column![
            text("VERSE NOTE · READ-ONLY HERE")
                .size(12)
                .font(sans(font::Weight::Bold))
                .color(p.faint),
            text(body).font(serif()).size(15.7).line_height(1.625),
            self.source_line(
                Some(&source),
                "Noted",
                v.updated,
                Some(Message::Navigate(v.location.clone(), Some(v.verse))),
            ),
        ]
        .spacing(6);
        container(content)
            .padding(if row_style {
                [19.2, 16.0]
            } else {
                [12.0, 16.0]
            })
            .width(Fill)
            .style(move |_| container::Style {
                background: (!row_style).then(|| p.card.into()),
                border: if row_style {
                    Border::default()
                } else {
                    Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 16.0.into(),
                    }
                },
                ..Default::default()
            })
            .into()
    }

    /// The reading chip (`ReadingChip`): "Read 1 Nephi 2" when the entry logs a reading, a dashed "Log reading" when
    /// there is something to log; choosing it opens its small editor below it.
    fn reading_chip<'a>(
        &'a self,
        target: ReadingTarget,
        note: &'a Note,
        enabled: bool,
    ) -> Option<Element<'a, Message>> {
        let p = self.p();
        let logged = note.reading_at.is_some() && note.source.is_some();
        if !logged && self.reading_choices(note.source.as_ref()).is_empty() {
            return None;
        }
        let label = match (&note.source, logged) {
            (Some(source), true) => format!("Read {}", source.label),
            _ => "Log reading".to_string(),
        };
        let mut inside = row![
            icon(
                if logged {
                    &icons::BOOK_OPEN
                } else {
                    &icons::PLUS
                },
                if logged { p.ink } else { p.muted },
                12.
            ),
            text(label)
                .size(12)
                .font(sans(font::Weight::Semibold))
                .color(if logged { p.ink } else { p.muted })
                .wrapping(iced::widget::text::Wrapping::None),
        ]
        .spacing(8)
        .align_y(Center);
        if logged {
            inside = inside.push(icon(&icons::CHEVRON_DOWN, p.ink, 10.));
        }
        let chip = button(container(inside).center_y(36))
            .padding([0, 14])
            .height(36)
            .on_press_maybe(enabled.then_some(Message::Journal(JournalMsg::Reading(target))))
            .style(move |_, status| button::Style {
                background: if matches!(status, button::Status::Hovered) {
                    Some(p.hover.into())
                } else if logged {
                    Some(p.note.into())
                } else {
                    None
                },
                text_color: p.ink,
                border: Border {
                    color: if logged { p.accent } else { Color::TRANSPARENT },
                    width: if logged { 1.0 } else { 0.0 },
                    radius: 999.0.into(),
                },
                ..Default::default()
            });
        let chip: Element<'_, Message> = if logged {
            chip.into()
        } else {
            stack![chip, design::dashed_outline(p.rule, 18.0)]
                .width(Length::Shrink)
                .into()
        };
        let editor = self
            .journal
            .reading
            .as_ref()
            .filter(|r| r.target == target)
            .map(|r| self.reading_editor(r, note));
        Some(
            crate::popup::popup(chip, editor)
                .on_dismiss(Message::Journal(JournalMsg::ReadingCancel))
                .placement(crate::popup::Placement {
                    gap: 8.0,
                    margin: 16.0,
                    clearance: 0.0,
                    right: false,
                    escape: true,
                })
                .into(),
        )
    }

    /// `ReadingChip`'s dialog: which passage, the whole chapter or some verses, the day it was read.
    fn reading_editor<'a>(&'a self, edit: &'a ReadingEdit, note: &'a Note) -> Element<'a, Message> {
        let p = self.p();
        let msg = |m: JournalMsg| Message::Journal(m);
        let small_label = |s: &'static str| text(s).size(12).font(sans(font::Weight::Semibold));
        let field = |value: &str, on: fn(String) -> JournalMsg, placeholder: &str| {
            text_input(placeholder, value)
                .on_input(move |v| Message::Journal(on(v)))
                .on_submit(Message::Journal(JournalMsg::ReadingSave))
                .size(14)
                .padding([7, 8])
                .style(move |_, status| text_input::Style {
                    background: Color::TRANSPARENT.into(),
                    border: Border {
                        color: if matches!(status, text_input::Status::Focused { .. }) {
                            p.accent
                        } else {
                            p.rule
                        },
                        width: 1.0,
                        radius: 8.0.into(),
                    },
                    icon: p.muted,
                    placeholder: p.faint,
                    value: p.ink,
                    selection: p.primary,
                })
        };
        let whole = chapter_source(&edit.choices[edit.chosen]);
        let scripture = whole.kind == store::SourceKind::Scripture && whole.location().is_some();
        let mut panel = column![
            text(if edit.editing {
                "Edit reading"
            } else {
                "Log reading"
            })
            .size(14)
            .font(sans(font::Weight::Bold))
        ]
        .spacing(16);
        if edit.choices.len() > 1 {
            let mut choices = column![
                text("Passage or guide")
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.muted)
            ]
            .spacing(4);
            for (i, choice) in edit.choices.iter().enumerate() {
                choices = choices.push(
                    iced::widget::radio(chapter_source(choice).label, i, Some(edit.chosen), |i| {
                        Message::Journal(JournalMsg::ReadingChoose(i))
                    })
                    .size(14)
                    .text_size(14)
                    .spacing(8),
                );
            }
            panel = panel.push(choices);
        } else {
            panel = panel.push(
                text(whole.label.clone())
                    .size(14)
                    .font(sans(font::Weight::Semibold)),
            );
        }
        if scripture {
            // `.segmented-control` / `.segmented-control-button`: rounded pills in a rounded, bordered track.
            let segment = |label: &'static str, chosen: bool, part: bool| {
                button(
                    container(text(label).size(12.5))
                        .center_x(Fill)
                        .center_y(33.6),
                )
                .padding(0)
                .height(33.6)
                .width(Fill)
                .on_press(msg(JournalMsg::ReadingPart(part)))
                .style(move |theme, status| button::Style {
                    border: Border {
                        radius: 999.0.into(),
                        ..Default::default()
                    },
                    ..design::segment(p, chosen)(theme, status)
                })
            };
            let mut range = column![
                container(
                    row![
                        segment("Whole chapter", !edit.part, false),
                        segment("Verses", edit.part, true)
                    ]
                    .spacing(4)
                )
                .padding(3.2)
                .style(move |_| container::Style {
                    background: Some(p.card.into()),
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 999.0.into(),
                    },
                    ..Default::default()
                })
            ]
            .spacing(12);
            if edit.part {
                range = range.push(
                    row![
                        column![
                            small_label("First verse"),
                            field(&edit.start, JournalMsg::ReadingStart, "1")
                        ]
                        .spacing(4)
                        .width(Fill),
                        column![
                            small_label("Last verse"),
                            field(&edit.end, JournalMsg::ReadingEnd, "1")
                        ]
                        .spacing(4)
                        .width(Fill),
                    ]
                    .spacing(8),
                );
            }
            panel = panel.push(range);
        }
        panel = panel.push(
            column![
                small_label("Read on"),
                field(&edit.date, JournalMsg::ReadingDate, "MM/DD/YYYY")
            ]
            .spacing(4),
        );
        if let Some(error) = &edit.error {
            panel = panel.push(
                text(error.clone())
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
            );
        }
        let can_remove = match edit.target {
            ReadingTarget::Note => self
                .journal
                .open
                .as_ref()
                .is_some_and(|o| !o.body.text().trim().is_empty()),
            ReadingTarget::Composer => true,
        };
        let mut actions = row![].spacing(8).align_y(Center);
        if edit.editing {
            actions = actions.push(
                button(
                    text("Remove reading")
                        .size(12)
                        .font(sans(font::Weight::Semibold)),
                )
                .padding([9, 8])
                .on_press_maybe(can_remove.then_some(msg(JournalMsg::ReadingRemove)))
                .style(design::link(p.accent)),
            );
        }
        actions = actions
            .push(space::horizontal())
            .push(
                button(text("Cancel").size(12).font(sans(font::Weight::Semibold)))
                    .padding([9, 12])
                    .on_press(msg(JournalMsg::ReadingCancel))
                    .style(design::outlined(p, 999.0)),
            )
            .push(
                button(
                    text(if edit.editing {
                        "Save reading"
                    } else {
                        "Log reading"
                    })
                    .size(12)
                    .font(sans(font::Weight::Semibold)),
                )
                .padding([9, 12])
                .on_press(msg(JournalMsg::ReadingSave))
                .style(design::active(p)),
            );
        panel = panel.push(actions);
        if edit.editing && !can_remove {
            panel = panel.push(
                text("Add a note before removing the reading, or delete the entry.")
                    .size(12)
                    .color(p.muted),
            );
        }
        let _ = note;
        container(panel)
            .padding(16)
            .width(352)
            .style(move |_| container::Style {
                background: Some(p.card.into()),
                text_color: Some(p.ink),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 16.0.into(),
                },
                shadow: design::soft_shadow(p),
                ..Default::default()
            })
            .into()
    }

    /// The day's new entry (`JournalEntryComposer` in its panel): the reflection prompt, "New entry" and Close, the
    /// reading chip, the note, its Day and Save entry.
    fn composer_card<'a>(&'a self, c: &'a Composer, width: f32) -> Element<'a, Message> {
        let p = self.p();
        let msg = |m: JournalMsg| Message::Journal(m);
        let mut panel = column![].spacing(12);
        if let Some(prompt) = &c.draft.prompt {
            panel = panel.push(
                container(text(prompt.clone()).font(serif()).size(18).color(p.muted))
                    .padding(Padding::ZERO.bottom(4)),
            );
        }
        panel = panel.push(
            row![
                text("New entry").font(serif()).size(16).width(Fill),
                button(text("Close").size(14).font(sans(font::Weight::Semibold)))
                    .padding([8, 16])
                    .on_press(msg(JournalMsg::CloseComposer))
                    .style(design::outlined(p, 999.0)),
            ]
            .align_y(Center),
        );
        let mut chips = row![].spacing(12).align_y(Center);
        let mut any_chip = false;
        if let Some(chip) = self.reading_chip(ReadingTarget::Composer, &c.draft.note, true) {
            chips = chips.push(chip);
            any_chip = true;
        }
        if let Some(source) = &c.draft.note.source
            && c.draft.note.reading_at.is_none()
        {
            chips = chips.push(
                text(format!("Linked to {}", source.label))
                    .size(12)
                    .color(p.muted),
            );
            any_chip = true;
        }
        if any_chip {
            panel = panel.push(chips);
        }
        let placeholder = if c.draft.note.reading_at.is_some() {
            "Add a note (optional)…"
        } else {
            "Write a note…"
        };
        let editor = md_editor::md_editor(&c.draft.body, self.editor_palette(), |a| {
            Message::Journal(JournalMsg::ComposerBody(a))
        })
        .id("journal-composer")
        .on_undo(msg(JournalMsg::ComposerUndo))
        .on_redo(msg(JournalMsg::ComposerRedo))
        .on_link(Message::NoteLink)
        .placeholder(placeholder)
        .on_focus(|f| Message::Journal(JournalMsg::ComposerFocus(f)))
        .grow(192.0);
        let focused = c.focused;
        panel = panel.push(
            container(editor)
                .padding([8, 12])
                .width(Fill)
                .style(move |_| container::Style {
                    border: Border {
                        color: if focused { p.accent } else { p.rule },
                        width: 1.0,
                        radius: 16.0.into(),
                    },
                    ..Default::default()
                }),
        );
        if let Some(problem) = &c.problem {
            panel = panel.push(
                text(problem.clone())
                    .size(14)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
            );
        }
        let day = column![
            text("Day").size(14).font(sans(font::Weight::Semibold)),
            text_input("MM/DD/YYYY", &c.day)
                .on_input(|v| Message::Journal(JournalMsg::ComposerDay(v)))
                .on_submit(msg(JournalMsg::SaveEntry))
                .size(14)
                .padding([7, 10])
                .width(146)
                .style(move |_, status| text_input::Style {
                    background: Color::TRANSPARENT.into(),
                    border: Border {
                        color: if matches!(status, text_input::Status::Focused { .. }) {
                            p.accent
                        } else {
                            p.rule
                        },
                        width: 1.0,
                        radius: 8.0.into(),
                    },
                    icon: p.muted,
                    placeholder: p.faint,
                    value: p.ink,
                    selection: p.primary,
                }),
        ]
        .spacing(4);
        let save = button(
            container(text("Save entry").size(14).font(sans(font::Weight::Bold))).center_y(36),
        )
        .padding([0, 16])
        .height(36)
        .on_press(msg(JournalMsg::SaveEntry))
        .style(design::active(p));
        panel = panel.push(
            row![day, space::horizontal(), save]
                .align_y(iced::Alignment::End)
                .spacing(12),
        );
        let _ = width;
        column![
            container(panel)
                .padding(16)
                .width(Fill)
                .style(move |_| container::Style {
                    background: Some(p.card.into()),
                    text_color: Some(p.ink),
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 9.6.into(),
                    },
                    ..Default::default()
                }),
        ]
        .push(
            container(
                text("Closing keeps what you wrote here until you save it.")
                    .size(12)
                    .color(p.muted),
            )
            .padding(Padding::ZERO.top(8)),
        )
        .into()
    }

    fn editor_palette(&self) -> md_editor::Palette {
        let p = self.p();
        md_editor::Palette {
            ink: p.ink,
            soft: p.faint,
            rubric: p.accent,
            quote: p.accent,
            rule_strong: design::rule_strong(p),
            code: p.hover,
            selection: p.primary,
        }
    }

    /// The open note (`JournalNoteEditor`): when it was written and its reading or source above, the Markdown
    /// editor filling the card, its save state and Delete note at the bottom. The X closes it to its day.
    fn note_card<'a>(
        &'a self,
        open: &'a OpenNote,
        p: Colors,
        interactive: bool,
        width: f32,
    ) -> Element<'a, Message> {
        let msg = |m: JournalMsg| interactive.then_some(Message::Journal(m));
        let read_only = open.read_only();
        let note = &open.note;
        // The entry's time, or the day it was written when that was another one.
        let created_day = store::local_date(note.created);
        let when = if created_day == note.journal_date {
            clock(note.created)
        } else {
            format!(
                "Written {}, {}",
                short_day_heading(&created_day),
                clock(note.created)
            )
        };
        let time_line = text(when.to_uppercase())
            .size(12)
            .font(sans(font::Weight::Bold))
            .color(p.accent);
        let logged = note.reading_at.is_some() && note.source.is_some();
        let mut meta = row![].spacing(8).align_y(Center);
        // Read-only, the reading shows only when the note logs one, and can't be changed.
        if (!read_only || logged)
            && let Some(chip) =
                self.reading_chip(ReadingTarget::Note, note, interactive && !read_only)
        {
            meta = meta.push(chip);
        }
        match &note.source {
            Some(source) if logged => {
                // The chip names the passage; this is just a way there.
                meta = meta.push(
                    button(
                        container(icon(&icons::ARROW_RIGHT, p.muted, 14.))
                            .center_x(36)
                            .center_y(36),
                    )
                    .padding(0)
                    .on_press_maybe(msg(JournalMsg::OpenSource(source.clone())))
                    .style(design::circle(p)),
                );
            }
            Some(source) => {
                let glyph = if source.kind == store::SourceKind::Guide {
                    &icons::FEATHER
                } else {
                    &icons::BOOK_OPEN
                };
                meta = meta.push(
                    row![
                        text("From").size(12).color(p.muted),
                        button(
                            column![
                                row![
                                    icon(glyph, p.ink, 10.),
                                    text(source.label.clone())
                                        .size(12)
                                        .font(sans(font::Weight::Semibold))
                                        .color(p.ink)
                                ]
                                .spacing(6)
                                .align_y(Center),
                                container(space().height(1).width(Fill)).style(move |_| {
                                    container::Style {
                                        background: Some(design::rule_strong(p).into()),
                                        ..Default::default()
                                    }
                                }),
                            ]
                            .spacing(1)
                            .width(Length::Shrink),
                        )
                        .padding(0)
                        .on_press_maybe(msg(JournalMsg::OpenSource(source.clone())))
                        .style(|_, _| button::Style::default()),
                    ]
                    .spacing(6)
                    .align_y(Center),
                );
            }
            None => {
                meta = meta.push(
                    text("Personal note")
                        .size(12)
                        .font(iced::Font {
                            style: font::Style::Italic,
                            ..sans(font::Weight::Normal)
                        })
                        .color(p.muted),
                );
            }
        }
        let mut left = column![container(time_line).padding(Padding::ZERO.top(2))]
            .spacing(6)
            .width(Fill);
        left = left.push(meta.wrap().vertical_spacing(4));
        // Below `lg` the website's controls are touch-sized (44px, 14px text).
        let touch = self.window_width < PHONE_BELOW;
        let close_size = if touch { 44.0 } else { 36.0 };
        let close = button(
            container(icon(&icons::XMARK, p.muted, 16.))
                .center_x(close_size)
                .center_y(close_size),
        )
        .padding(0)
        .on_press_maybe(msg(JournalMsg::Close))
        .style(design::circle(p));
        // The X sits 0.5rem up and out from the corner (`-mr-2 -mt-2`), over the card's padding.
        let inner = (width - 42.0).max(120.0);
        let mut header = column![
            stack![
                container(left).padding(Padding::ZERO.right(36)),
                pin(close).x(inner - close_size + 8.0).y(-8.0),
            ]
            .width(Fill)
        ]
        .spacing(6);
        if read_only {
            // "Published · read-only": a mint pill with the surface border.
            header = header.push(
                container(
                    text(if open.status == "published" {
                        "Published · read-only"
                    } else {
                        "Archived · read-only"
                    })
                    .size(12)
                    .font(sans(font::Weight::Bold)),
                )
                .padding([4, 12])
                .style(move |_| iced::widget::container::Style {
                    background: Some(p.mint.into()),
                    text_color: Some(p.ink),
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 999.0.into(),
                    },
                    ..Default::default()
                }),
            );
        }
        // The website's editor: Markdown styled as it is written, its syntax hidden off the caret's line.
        let mut editor = md_editor::md_editor(&open.body, self.editor_palette(), |a| {
            Message::Journal(JournalMsg::Body(a))
        })
        .id("journal-body")
        .on_undo(Message::Journal(JournalMsg::Undo))
        .on_redo(Message::Journal(JournalMsg::Redo))
        .on_link(Message::NoteLink)
        .read_only(read_only);
        if !read_only {
            editor = editor.placeholder(if note.reading_at.is_some() {
                "Add a note (optional)…"
            } else {
                "Write a note…"
            });
        }
        let body: Element<'_, Message> = if read_only && open.body.text().trim().is_empty() {
            container(text("This note is empty.").size(14).color(p.muted))
                .height(Fill)
                .into()
        } else {
            container(editor).height(Fill).into()
        };
        let mut content = column![header, body].spacing(12);
        if open.confirm_delete && open.can_delete() {
            let logs = note.reading_at.is_some();
            content = content.push(
                container(
                    column![
                        text("Delete this note?")
                            .size(14)
                            .font(sans(font::Weight::Semibold)),
                        text(if logs {
                            "It and its reading will be removed from your notes, calendar and reading history. Chapters you marked read stay read. This can't be undone."
                        } else {
                            "It will be removed from your notes and calendar. This can't be undone."
                        })
                        .size(12)
                        .color(p.muted),
                        row![
                            button(
                                container(
                                    text("Delete note")
                                        .size(12)
                                        .font(sans(font::Weight::Bold))
                                )
                                .center_y(32)
                            )
                            .padding([0, 12])
                            .height(32)
                            .on_press_maybe(msg(JournalMsg::ConfirmDelete(true)))
                            .style(move |_, status| button::Style {
                                background: Some(
                                    design::fade(
                                        p.accent,
                                        if matches!(status, button::Status::Hovered) {
                                            0.9
                                        } else {
                                            1.0
                                        }
                                    )
                                    .into()
                                ),
                                text_color: p.paper,
                                border: Border {
                                    color: p.accent,
                                    width: 1.0,
                                    radius: 999.0.into(),
                                },
                                ..Default::default()
                            }),
                            button(
                                container(
                                    text("Cancel")
                                        .size(12)
                                        .font(sans(font::Weight::Semibold))
                                )
                                .center_y(32)
                            )
                            .padding([0, 12])
                            .height(32)
                            .on_press_maybe(msg(JournalMsg::ConfirmDelete(false)))
                            .style(design::outlined(p, 999.0)),
                        ]
                        .spacing(8),
                    ]
                    .spacing(8),
                )
                .padding(12)
                .width(Fill)
                .style(move |_| container::Style {
                    background: Some(p.card.into()),
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 16.0.into(),
                    },
                    ..Default::default()
                }),
            );
        } else if !(read_only && !open.can_delete()) {
            // The footer: what has been saved, and Delete note.
            let state: Element<'_, Message> = if read_only {
                space().into()
            } else if open.dirty {
                text("Unsaved changes").size(12).color(p.faint).into()
            } else if let Some(at) = open.saved_at {
                text(format!("Saved at {}", clock(at)))
                    .size(12)
                    .color(p.faint)
                    .into()
            } else {
                space().into()
            };
            let mut footer = row![container(state).width(Fill)].align_y(iced::Alignment::Start);
            if open.can_delete() {
                footer = footer.push(
                    button(
                        container(
                            row![
                                icon(&icons::TRASH, p.ink, 12.),
                                text("Delete note")
                                    .size(if touch { 14 } else { 12 })
                                    .font(sans(font::Weight::Semibold))
                            ]
                            .spacing(6)
                            .align_y(Center),
                        )
                        .center_y(if touch { 44 } else { 32 }),
                    )
                    .padding([0, if touch { 16 } else { 12 }])
                    .height(if touch { 44 } else { 32 })
                    .on_press_maybe(msg(JournalMsg::Delete))
                    .style(design::outlined(p, 999.0)),
                );
            }
            content = content.push(footer);
        }
        container(content)
            .padding(21)
            .width(Fill)
            .height(Fill)
            .style(design::card(p, 12.0))
            .into()
    }

    pub(crate) fn goal_dialog(&self, goals: JournalGoals) -> Element<'_, Message> {
        let p = self.p();
        let divider = move || {
            container(space().width(1).height(33.6)).style(move |_| container::Style {
                background: Some(p.rule.into()),
                ..Default::default()
            })
        };
        // `.goalField`: 1.25rem above and below, a rule under it; the stepper's number between two dividers.
        let stepper = |label: &'static str, hint: String, value: u32, max: u32, study: bool| {
            let step = |glyph: &'static icons::Icon, by: i32, enabled: bool| {
                button(
                    container(icon(glyph, p.ink, 13.6))
                        .center_x(44)
                        .center_y(44),
                )
                .padding(0)
                .on_press_maybe(
                    enabled.then_some(Message::Journal(JournalMsg::GoalStep(study, by))),
                )
                .style(design::quiet(p))
            };
            column![
                container(
                    row![
                        column![
                            text(label)
                                .font(serif())
                                .size(18.4)
                                .line_height(iced::widget::text::LineHeight::Absolute(27.6.into())),
                            text(hint)
                                .size(12)
                                .line_height(iced::widget::text::LineHeight::Absolute(18.0.into()))
                                .color(p.muted)
                        ]
                        .spacing(4.8)
                        .width(Fill),
                        container(
                            row![
                                step(&icons::MINUS, -1, value > 1),
                                divider(),
                                text(value.to_string()).size(16).center().width(46),
                                divider(),
                                step(&icons::PLUS, 1, value < max),
                            ]
                            .align_y(Center)
                        )
                        .style(move |_| container::Style {
                            border: Border {
                                color: p.rule,
                                width: 1.0,
                                radius: 9.6.into(),
                            },
                            ..Default::default()
                        }),
                    ]
                    .align_y(Center)
                )
                .padding([20, 0]),
                rule(p),
            ]
        };
        let mut form = column![
            row![
                text("Edit weekly goals")
                    .font(serif())
                    .size(29.6)
                    .line_height(iced::widget::text::LineHeight::Absolute(35.52.into()))
                    .width(Fill),
                container(
                    button(
                        container(icon(&icons::XMARK, p.muted, 16.8))
                            .center_x(44)
                            .center_y(44)
                    )
                    .padding(0)
                    .on_press(Message::Journal(JournalMsg::CancelGoals))
                    .style(design::quiet(p))
                )
                .padding(Padding::ZERO.left(8)),
            ]
            .align_y(iced::Alignment::Center),
            space().height(8),
            text("Choose a rhythm that works for you.")
                .size(14.4)
                .line_height(iced::widget::text::LineHeight::Absolute(21.6.into()))
                .color(p.muted),
            space().height(5.6),
            stepper(
                "Study days per week",
                "1–7 days".into(),
                goals.study_days,
                7,
                true
            ),
            stepper(
                "Reflections per week",
                format!("1–{} notes each week", store::MAX_WEEKLY_REFLECTIONS),
                goals.reflections,
                store::MAX_WEEKLY_REFLECTIONS,
                false
            ),
        ];
        if let Some(error) = &self.journal.goal_error {
            form = form
                .push(space().height(16))
                .push(text(error.as_str()).size(13.6).color(p.accent));
        }
        let action = |label: &'static str, m: JournalMsg, primary: bool| {
            button(
                container(text(label).size(14.08).font(sans(font::Weight::Semibold))).center_y(44),
            )
            .padding([0.0, 19.2])
            .height(44)
            .on_press(Message::Journal(m))
            .style(move |_, status| {
                let hovered = matches!(status, button::Status::Hovered);
                let shade = |c: Color| {
                    if hovered {
                        design::mix(c, Color::BLACK, 0.05)
                    } else {
                        c
                    }
                };
                button::Style {
                    background: primary.then(|| shade(p.accent).into()),
                    text_color: if primary { p.paper } else { p.ink },
                    border: Border {
                        color: if primary { p.accent } else { p.rule },
                        width: 1.0,
                        radius: 9.6.into(),
                    },
                    ..Default::default()
                }
            })
        };
        form = form
            .push(space().height(16))
            .push(
                text("Changing a goal keeps your recorded progress.")
                    .size(12)
                    .line_height(1.5)
                    .color(p.muted),
            )
            .push(space().height(20))
            .push(
                row![
                    space::horizontal(),
                    action("Cancel", JournalMsg::CancelGoals, false),
                    action("Save goals", JournalMsg::SaveGoals, true),
                ]
                .spacing(10.4),
            );
        let dialog = container(form)
            .padding(26.4)
            .width(512)
            .style(move |_| container::Style {
                background: Some(p.card_strong.into()),
                text_color: Some(p.ink),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 12.8.into(),
                },
                shadow: iced::Shadow {
                    color: Color::from_rgba(0., 0., 0., 0.25),
                    offset: iced::Vector::new(0., 20.),
                    blur_radius: 80.,
                },
                ..Default::default()
            });
        stack![
            mouse_area(
                container(space())
                    .width(Fill)
                    .height(Fill)
                    .style(|_| container::Style {
                        background: Some(Color::from_rgba(0., 0., 0., 0.55).into()),
                        ..Default::default()
                    })
            )
            .on_press(Message::Journal(JournalMsg::CancelGoals)),
            container(opaque(dialog)).center_x(Fill).center_y(Fill),
        ]
        .into()
    }
}

fn rule<'a>(p: Colors) -> Element<'a, Message> {
    container(space().height(1).width(Fill))
        .style(move |_| container::Style {
            background: Some(p.rule.into()),
            ..Default::default()
        })
        .into()
}
fn note_icon<'a>(p: Colors, glyph: &'static icons::Icon, size: f32) -> Element<'a, Message> {
    container(icon(glyph, p.goal, size))
        .center_x(48)
        .center_y(48)
        .style(move |_| container::Style {
            background: Some(p.soft.into()),
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 24.0.into(),
            },
            ..Default::default()
        })
        .into()
}
/// "Nothing recorded for this day yet. A sentence is enough to begin." (`.emptyDay`)
fn empty_day<'a>(p: Colors) -> Element<'a, Message> {
    container(
        text("Nothing recorded for this day yet. A sentence is enough to begin.")
            .size(14.4)
            .line_height(1.6)
            .color(p.muted),
    )
    .padding([24, 0])
    .into()
}
/// `JournalNoteCard`'s pill for a note that isn't a draft ("Published" / "Archived", mint).
fn status_tag<'a>(p: Colors, status: &str) -> Element<'a, Message> {
    // `.pill-tag` (0.68rem semibold capitals, rubric text and outline) on `--accent-mint`, 0.62rem here.
    container(
        text(if status == "published" {
            "PUBLISHED"
        } else {
            "ARCHIVED"
        })
        .size(9.9)
        .font(sans(font::Weight::Semibold))
        .color(p.accent),
    )
    .padding([2, 8])
    .style(move |_| iced::widget::container::Style {
        background: Some(p.mint.into()),
        border: Border {
            color: p.rubric_line,
            width: 1.0,
            radius: 999.0.into(),
        },
        ..Default::default()
    })
    .into()
}
/// A time of day as the website writes it: "8:14 PM".
fn clock(secs: i64) -> String {
    chrono::DateTime::from_timestamp(secs, 0)
        .map(|t| {
            t.with_timezone(&chrono::Local)
                .format("%-I:%M %p")
                .to_string()
        })
        .unwrap_or_default()
}
/// `formatShortDayHeading`: "Wed, Oct 28, 2026".
pub(crate) fn short_day_heading(day: &str) -> String {
    journal::date(day)
        .map(|d| d.format("%a, %b %-d, %Y").to_string())
        .unwrap_or_default()
}
/// What one row of the day's list shows.
struct EntryParts<'a> {
    glyph: &'static icons::Icon,
    title: String,
    excerpt: String,
    logged: bool,
    source: Option<&'a NoteSource>,
    verb: &'static str,
    on_press: Message,
    time: i64,
    status: Option<String>,
}
/// How many recent sources the reading chip offers (`MAX_LOG_CHOICES`).
const MAX_LOG_CHOICES: usize = 8;

/// A blank entry for the composer.
fn blank_entry(day: &str, prompt: Option<String>) -> OpenNote {
    OpenNote {
        note: Note::new(day, None),
        body: md_editor::Content::with_text(""),
        dirty: false,
        confirm_delete: false,
        prompt,
        undo: vec![],
        redo: vec![],
        last_edit: None,
        status: "draft".into(),
        saved_at: None,
    }
}
/// One edit to an entry's text, grouped into undo steps as the website's editor history groups typing.
fn edit_entry(open: &mut OpenNote, action: md_editor::Action) {
    if let md_editor::Action::Edit(edit) = &action {
        let kind = match edit {
            md_editor::Edit::Insert(c) if !c.is_whitespace() => EditKind::Typing,
            md_editor::Edit::Insert(_) | md_editor::Edit::Enter => EditKind::Break,
            md_editor::Edit::Paste(_) => EditKind::Paste,
            _ => EditKind::Delete,
        };
        let now = std::time::Instant::now();
        let grouped = open.last_edit.is_some_and(|(last, at)| {
            last == kind
                && kind != EditKind::Paste
                && now.duration_since(at) < std::time::Duration::from_secs(1)
        });
        if !grouped {
            open.undo.push(open.body.text());
            if open.undo.len() > UNDO_LIMIT {
                open.undo.remove(0);
            }
        }
        open.redo.clear();
        open.last_edit = Some((kind, now));
    }
    open.dirty |= action.is_edit();
    open.body.perform(action);
}
/// Ctrl+Z / Ctrl+Shift+Z: the caret goes back to where the text changed, as the website's editor puts it.
fn step_history(open: &mut OpenNote, undo: bool) {
    let (from, to) = if undo {
        (&mut open.undo, &mut open.redo)
    } else {
        (&mut open.redo, &mut open.undo)
    };
    if let Some(text) = from.pop() {
        let current = open.body.text();
        open.body = md_editor::Content::with_text(&text);
        open.body.place_after_change(&current);
        to.push(current);
        open.dirty = true;
        open.last_edit = None;
    }
}
/// The whole chapter a scripture source points into (`chapterSource`).
pub(crate) fn chapter_source(source: &NoteSource) -> NoteSource {
    if source.kind != store::SourceKind::Scripture || source.verse_start.is_none() {
        return source.clone();
    }
    static VERSES: OnceLock<regex::Regex> = OnceLock::new();
    let verses = VERSES.get_or_init(|| regex::Regex::new(r":\d+(?:[-–]\d+)?$").unwrap());
    NoteSource {
        label: verses.replace(&source.label, "").into_owned(),
        href: source.href.split('#').next().unwrap_or("").to_string(),
        verse_start: None,
        verse_end: None,
        ..source.clone()
    }
}
fn chapter_key(source: &NoteSource) -> String {
    let chapter = chapter_source(source);
    format!("{:?}|{}", chapter.kind, chapter.href)
}
/// A day as the website's date field shows it here: `10/28/2026`.
pub(crate) fn field_date(day: &str) -> String {
    journal::date(day)
        .map(|d| d.format("%m/%d/%Y").to_string())
        .unwrap_or_default()
}
/// A date typed as `MM/DD/YYYY` (or `YYYY-MM-DD`) as a journal day.
pub(crate) fn parse_field_date(value: &str) -> Option<String> {
    let value = value.trim();
    chrono::NaiveDate::parse_from_str(value, "%m/%d/%Y")
        .or_else(|_| chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d"))
        .ok()
        .map(journal::key)
}
