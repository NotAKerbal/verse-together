// The journal's new entry kept across a forced quit, and its date fields' calendars, through the app's real update
// loop and headless view. Each test uses its own profile; nothing reaches a server.
use crate::journal_ui::{DateField, JournalMsg, ReadingTarget};
use crate::md_editor::{Action, Edit};
use crate::store::{Note, NoteSource, Store};
use crate::{App, Message, Screen};
use iced::keyboard::{self, Key, key::Named};
use std::path::PathBuf;

struct Profile(PathBuf);
impl Drop for Profile {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn profile() -> Profile {
    Profile(std::env::temp_dir().join(format!(
        "verse-journal-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    )))
}
/// The app as it starts on a profile (after a crash, nothing else ran).
fn start(dir: &Profile) -> App {
    let mut app = App::from_directory(&dir.0);
    app.window_width = 1280.0;
    app.window_height = 800.0;
    let _ = app.update(Message::SetScreen(Screen::Journal));
    app
}
fn journal(app: &mut App, m: JournalMsg) {
    let _ = app.update(Message::Journal(m));
}
fn paste(app: &mut App, text: &str) {
    journal(
        app,
        JournalMsg::ComposerBody(Action::Edit(Edit::Paste(std::sync::Arc::new(text.into())))),
    );
}
fn key(app: &mut App, key: Key) {
    let _ = app.update(Message::Event(iced::Event::Keyboard(
        keyboard::Event::KeyPressed {
            modified_key: key.clone(),
            key,
            physical_key: keyboard::key::Physical::Unidentified(
                keyboard::key::NativeCode::Unidentified,
            ),
            location: keyboard::Location::Standard,
            modifiers: keyboard::Modifiers::default(),
            text: None,
            repeat: false,
        },
    )));
}
fn notes(dir: &Profile, owner: &str) -> Vec<Note> {
    let mut store = Store::open(&dir.0).unwrap();
    store.set_owner(owner);
    store.all_notes().unwrap()
}
fn kept_rows(dir: &Profile) -> i64 {
    rusqlite::Connection::open(dir.0.join("study.sqlite"))
        .unwrap()
        .query_row("SELECT COUNT(*) FROM entry_drafts", [], |r| r.get(0))
        .unwrap()
}

/// Text written in the new entry survives the app being killed, exactly (whitespace, day, reading, prompt), and is
/// kept only on the autosave timer after a change; Save entry then makes exactly one note and leaves no copy.
#[test]
fn a_new_entry_survives_a_forced_quit_and_is_saved_exactly_once() {
    let dir = profile();
    let mut app = start(&dir);
    let prompt = crate::journal::REFLECTION_PROMPTS[1].to_string();
    journal(&mut app, JournalMsg::New(Some(prompt.clone())));
    assert!(
        !app.journal.entry_unkept,
        "an untouched entry has nothing to keep"
    );
    let source = NoteSource::lesson("2026-10-19", "Come, Follow Me: Alma 32–35");
    {
        let c = app.journal.composer.as_mut().unwrap();
        c.draft.note.source = Some(source.clone());
        c.draft.note.reading_at = Some(1_761_000_000);
    }
    let text = "  # Seeds  \n\nFaith *grows*\n\n- \n\n\tindented line   \n\n";
    paste(&mut app, text);
    journal(&mut app, JournalMsg::ComposerDay("10/20/2026".into()));
    assert!(app.journal.entry_unkept && app.has_unsaved_notes());
    // Nothing is written until the autosave timer fires.
    assert_eq!(kept_rows(&dir), 0);
    let _ = app.update(Message::Autosave);
    assert_eq!(kept_rows(&dir), 1);
    // Then the timer stops: an idle window does no work.
    assert!(!app.journal.entry_unkept && !app.has_unsaved_notes());
    let id = app.journal.composer.as_ref().unwrap().draft.note.id.clone();
    // A forced quit: no close handling runs.
    drop(app);
    assert!(notes(&dir, "").is_empty(), "not an entry before Save entry");

    let mut app = start(&dir);
    let c = app.journal.composer.as_ref().expect("the entry is back");
    assert!(c.shown);
    assert_eq!(c.draft.body.text(), text);
    assert_eq!(c.day, "10/20/2026");
    assert!(c.edited);
    assert_eq!(c.draft.prompt.as_deref(), Some(prompt.as_str()));
    assert_eq!(c.draft.note.source, Some(source.clone()));
    assert_eq!(c.draft.note.reading_at, Some(1_761_000_000));
    assert_eq!(c.draft.note.id, id);
    let shown = crate::ui_tests::visible_texts(&app);
    assert!(shown.iter().any(|t| t == "New entry"), "{shown:?}");
    assert!(!app.has_unsaved_notes());

    journal(&mut app, JournalMsg::SaveEntry);
    assert!(app.journal.composer.is_none());
    assert_eq!(kept_rows(&dir), 0);
    drop(app);
    let app = start(&dir);
    assert!(
        app.journal.composer.is_none(),
        "a saved entry isn't offered again"
    );
    let saved = notes(&dir, "");
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].id, id);
    assert_eq!(saved[0].markdown(), text);
    assert_eq!(saved[0].journal_date, "2026-10-20");
    assert_eq!(saved[0].source, Some(source));
    assert!(saved[0].reading_at.is_some());
}

/// Closing and reopening the entry keeps it; emptying it lets the kept copy go, so it never comes back.
#[test]
fn a_closed_entry_is_kept_and_an_emptied_one_is_not_brought_back() {
    let dir = profile();
    let mut app = start(&dir);
    journal(&mut app, JournalMsg::New(None));
    paste(&mut app, "Half a thought");
    journal(&mut app, JournalMsg::CloseComposer);
    let _ = app.update(Message::Autosave);
    journal(&mut app, JournalMsg::New(None));
    assert_eq!(
        app.journal.composer.as_ref().unwrap().draft.body.text(),
        "Half a thought"
    );
    drop(app);
    let mut app = start(&dir);
    assert_eq!(
        app.journal.composer.as_ref().unwrap().draft.body.text(),
        "Half a thought"
    );
    // Deleting all of it (whitespace left is nothing worth keeping).
    journal(
        &mut app,
        JournalMsg::ComposerBody(Action::Edit(Edit::Paste(
            std::sync::Arc::new(String::new()),
        ))),
    );
    {
        let c = app.journal.composer.as_mut().unwrap();
        c.draft.body = crate::md_editor::Content::with_text("  \n ");
    }
    let _ = app.update(Message::Autosave);
    assert_eq!(kept_rows(&dir), 0);
    drop(app);
    let app = start(&dir);
    assert!(app.journal.composer.is_none());
    assert!(notes(&dir, "").is_empty());
}

/// The normal close still keeps a written entry as that day's note (the native behavior), and with it goes the
/// kept copy: the next start shows one note and no entry.
#[test]
fn closing_the_app_keeps_the_entry_as_one_note_and_no_copy() {
    let dir = profile();
    let mut app = start(&dir);
    journal(&mut app, JournalMsg::New(None));
    paste(&mut app, "Before closing");
    let _ = app.update(Message::Autosave);
    assert!(app.keep_entry_draft());
    drop(app);
    let app = start(&dir);
    assert!(app.journal.composer.is_none());
    let saved = notes(&dir, "");
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].markdown(), "Before closing");
    assert_eq!(kept_rows(&dir), 0);
}

/// A failed write keeps the text in the editor and retries; nothing is lost or copied anywhere else.
#[test]
fn a_failed_keep_retries_without_losing_the_entry() {
    let dir = profile();
    let mut app = start(&dir);
    journal(&mut app, JournalMsg::New(None));
    paste(&mut app, "Keep trying");
    let db = rusqlite::Connection::open(dir.0.join("study.sqlite")).unwrap();
    db.execute_batch(
        "CREATE TRIGGER reject_keep BEFORE INSERT ON entry_drafts BEGIN SELECT RAISE(ABORT,'disk full'); END;",
    )
    .unwrap();
    let _ = app.update(Message::Autosave);
    assert!(app.autosave_failed && app.journal.entry_unkept);
    assert_eq!(
        app.journal.composer.as_ref().unwrap().draft.body.text(),
        "Keep trying"
    );
    db.execute_batch("DROP TRIGGER reject_keep;").unwrap();
    let _ = app.update(Message::Autosave);
    assert!(!app.autosave_failed && !app.journal.entry_unkept);
    assert_eq!(kept_rows(&dir), 1);
    // Save entry fails too while notes can't be written: the entry and its copy stay, then it saves once.
    db.execute_batch(
        "CREATE TRIGGER reject_note BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'disk full'); END;",
    )
    .unwrap();
    journal(&mut app, JournalMsg::SaveEntry);
    assert!(app.journal.composer.is_some());
    assert_eq!(kept_rows(&dir), 1);
    db.execute_batch("DROP TRIGGER reject_note;").unwrap();
    journal(&mut app, JournalMsg::SaveEntry);
    assert!(app.journal.composer.is_none());
    assert_eq!(notes(&dir, "").len(), 1);
    assert_eq!(kept_rows(&dir), 0);
}

/// The new entry's Day: typed, or chosen from its calendar (month arrows, keyboard, Today); it is required, so its
/// calendar has no Clear, and a day that isn't one is refused on save.
#[test]
fn the_entrys_day_is_typed_or_chosen_from_a_calendar_like_the_browsers() {
    let dir = profile();
    let mut app = start(&dir);
    journal(&mut app, JournalMsg::New(None));
    paste(&mut app, "Dated");
    let _ = app.update(Message::Autosave);
    journal(&mut app, JournalMsg::ComposerDay("10/20/2026".into()));
    journal(&mut app, JournalMsg::DateOpen(DateField::Day));
    let d = app.journal.date.unwrap();
    assert_eq!(d.field, DateField::Day);
    assert_eq!(d.calendar.focus.to_string(), "2026-10-20");
    let shown = crate::ui_tests::visible_texts(&app);
    assert!(shown.iter().any(|t| t == "October 2026"), "{shown:?}");
    assert!(!shown.iter().any(|t| t == "Clear"), "Day is required");
    // Arrows by days and weeks, Page Up by a month, Enter chooses.
    journal(&mut app, JournalMsg::DateStep(7));
    journal(&mut app, JournalMsg::DateStep(-1));
    journal(&mut app, JournalMsg::DateMonth(-1));
    assert_eq!(
        app.journal.date.unwrap().calendar.month.to_string(),
        "2026-09-01"
    );
    journal(&mut app, JournalMsg::DateEnter);
    let c = app.journal.composer.as_ref().unwrap();
    assert_eq!(c.day, "09/26/2026");
    assert!(app.journal.date.is_none() && app.journal.entry_unkept);
    // Clear can't empty a required field; typing follows into an open calendar.
    journal(&mut app, JournalMsg::DateOpen(DateField::Day));
    journal(&mut app, JournalMsg::DatePick(DateField::Day, None));
    assert_eq!(app.journal.composer.as_ref().unwrap().day, "09/26/2026");
    journal(&mut app, JournalMsg::DateOpen(DateField::Day));
    journal(&mut app, JournalMsg::ComposerDay("12/25/2026".into()));
    assert_eq!(
        app.journal.date.unwrap().calendar.month.to_string(),
        "2026-12-01"
    );
    // Closing the entry closes its calendar.
    journal(&mut app, JournalMsg::CloseComposer);
    assert!(app.journal.date.is_none());
    journal(&mut app, JournalMsg::New(None));
    // Only whole, real dates.
    for bad in ["02/30/2027", "10/28/26", "13/01/2026"] {
        journal(&mut app, JournalMsg::ComposerDay(bad.into()));
        journal(&mut app, JournalMsg::SaveEntry);
        assert_eq!(
            app.journal.composer.as_ref().unwrap().problem.as_deref(),
            Some("Choose a day for this entry."),
            "{bad}"
        );
    }
    // The calendar's Today, then Save entry, on that day.
    journal(&mut app, JournalMsg::DateOpen(DateField::Day));
    let today = crate::store::today();
    journal(
        &mut app,
        JournalMsg::DatePick(DateField::Day, Some(today.clone())),
    );
    journal(&mut app, JournalMsg::SaveEntry);
    let saved = notes(&dir, "");
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].journal_date, today);
}

/// The calendar opens from the keyboard in its field (Alt+Down); a press outside closes it without reaching what
/// is under it; Escape closes it before the reading editor it is in, and that before the note.
#[test]
fn calendars_open_from_the_keyboard_and_close_without_click_through_in_order() {
    let dir = profile();
    let mut app = start(&dir);
    journal(&mut app, JournalMsg::New(None));
    // Alt+Down in the Day field (focused by a click) opens its calendar.
    let messages = {
        let mut ui = crate::ui_tests::simulator_for(&app);
        let field = ui
            .find(iced_test::selector::id("journal-entry-day"))
            .unwrap()
            .bounds();
        ui.point_at(iced::Point::new(field.x + 20.0, field.center_y()));
        let _ = ui.simulate(iced_test::simulator::click());
        let _ = ui.simulate([iced::Event::Keyboard(keyboard::Event::KeyPressed {
            key: Key::Named(Named::ArrowDown),
            modified_key: Key::Named(Named::ArrowDown),
            physical_key: keyboard::key::Physical::Unidentified(
                keyboard::key::NativeCode::Unidentified,
            ),
            location: keyboard::Location::Standard,
            modifiers: keyboard::Modifiers::ALT,
            text: None,
            repeat: false,
        })]);
        ui.into_messages().collect::<Vec<_>>()
    };
    assert!(
        messages
            .iter()
            .any(|m| matches!(m, Message::Journal(JournalMsg::DateOpen(DateField::Day)))),
        "{messages:?}"
    );
    for m in messages {
        let _ = app.update(m);
    }
    assert!(app.journal.date.is_some_and(|d| d.field == DateField::Day));
    // A press on the entry's Close, outside the calendar, only closes the calendar.
    let messages = crate::ui_tests::click_label(&mut app, "Close");
    assert!(
        messages
            .iter()
            .any(|m| matches!(m, Message::Journal(JournalMsg::DateClose))),
        "{messages:?}"
    );
    assert!(
        !messages
            .iter()
            .any(|m| matches!(m, Message::Journal(JournalMsg::CloseComposer))),
        "{messages:?}"
    );
    assert!(app.journal.date.is_none());
    assert!(app.journal.composer.as_ref().unwrap().shown);
    // A press inside the calendar chooses there (its Today), not on the page beneath.
    journal(&mut app, JournalMsg::DateOpen(DateField::Day));
    let messages = crate::ui_tests::click_label(&mut app, "Today");
    assert!(
        messages.iter().any(|m| matches!(
            m,
            Message::Journal(JournalMsg::DatePick(DateField::Day, Some(_)))
        )),
        "{messages:?}"
    );
    assert!(
        !messages
            .iter()
            .any(|m| matches!(m, Message::Journal(JournalMsg::Today))),
        "{messages:?}"
    );

    // The reading editor's Read on, inside an open note: Escape closes the calendar, then the editor, then the
    // note.
    let alma = crate::store::Location {
        volume: "bookofmormon".into(),
        book: "alma".into(),
        chapter: 32,
    };
    let today = crate::store::today();
    app.start_note(
        &today,
        Some(NoteSource::scripture("Alma", &alma, None)),
        "",
        None,
    );
    journal(&mut app, JournalMsg::Reading(ReadingTarget::Note));
    journal(&mut app, JournalMsg::DateOpen(DateField::ReadOn));
    let shown = crate::ui_tests::visible_texts(&app);
    assert!(shown.iter().any(|t| t == "Clear"), "Read on isn't required");
    assert!(shown.iter().any(|t| t == "Log reading"));
    journal(&mut app, JournalMsg::DateStep(-1));
    let picked = app.journal.date.unwrap().calendar.focus;
    journal(&mut app, JournalMsg::DateEnter);
    assert_eq!(
        app.journal.reading.as_ref().unwrap().date,
        picked.format("%m/%d/%Y").to_string()
    );
    journal(&mut app, JournalMsg::DateOpen(DateField::ReadOn));
    journal(&mut app, JournalMsg::DatePick(DateField::ReadOn, None));
    assert_eq!(app.journal.reading.as_ref().unwrap().date, "");
    journal(&mut app, JournalMsg::ReadingSave);
    assert_eq!(
        app.journal.reading.as_ref().unwrap().error.as_deref(),
        Some("Choose the day you read it.")
    );
    journal(&mut app, JournalMsg::DateOpen(DateField::ReadOn));
    key(&mut app, Key::Named(Named::Escape));
    assert!(app.journal.date.is_none());
    assert!(app.journal.reading.is_some() && app.journal.open.is_some());
    key(&mut app, Key::Named(Named::Escape));
    assert!(app.journal.reading.is_none() && app.journal.open.is_some());
    key(&mut app, Key::Named(Named::Escape));
    assert!(app.journal.open.is_none());
}
