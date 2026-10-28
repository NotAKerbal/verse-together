// End-to-end checks of the website's 2.12–2.13 behavior in the real app state: the default Bible, the faith
// tradition, the reader's links to journal notes, the feedback form and the release notes. Network replies are
// delivered as the messages the background work would send, so nothing here reaches a server.
use crate::marks::{MarkColor, MarkKind, TextMark, TextRange, VerseMarks};
use crate::reader_tools::{Primary, ToolsMsg};
use crate::store::{Annotation, Location, Note, NoteSource, Verse};
use crate::{App, Message, Screen, faith, feedback, note_links, release_notes, settings_ui};
use std::path::PathBuf;

struct Profile(PathBuf);
impl Drop for Profile {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn profile() -> Profile {
    Profile(std::env::temp_dir().join(format!(
        "verse-parity-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    )))
}
fn at(volume: &str, book: &str, chapter: u32) -> Location {
    Location {
        volume: volume.into(),
        book: book.into(),
        chapter,
    }
}
fn utf16(text: &str, words: &str) -> (usize, usize) {
    let byte = text.find(words).expect("words in the verse");
    let start = text[..byte].encode_utf16().count();
    (start, start + words.encode_utf16().count())
}
fn text_mark(text: &str, words: &str, kind: MarkKind, color: &'static str) -> TextMark {
    let (start, end) = utf16(text, words);
    TextMark {
        start,
        end,
        text: words.into(),
        kind,
        color: MarkColor::Named(color),
    }
}
/// The colors drawn on a verse's text as it is shown now.
fn drawn(app: &App, verse: u32) -> Vec<(Option<MarkColor>, Option<MarkColor>)> {
    let text = &app.verses.iter().find(|v| v.number == verse).unwrap().text;
    let a = app.annotations.iter().find(|a| a.verse == verse).unwrap();
    crate::marks::segments(&a.marks, text)
        .into_iter()
        .map(|s| (s.highlight, s.underline))
        .collect()
}
fn texts(verses: &[Verse]) -> Vec<(u32, &str)> {
    verses.iter().map(|v| (v.number, v.text.as_str())).collect()
}
const BSB_16: &str = "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.";

#[test]
fn the_default_bible_is_the_main_text_and_marks_stay_on_their_own_words() {
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    let john = at("newtestament", "john", 3);
    let _ = app.update(Message::Navigate(john.clone(), None));
    let kjv = app.verses[15].text.clone();
    assert!(kjv.contains("only begotten Son"));
    // The verse is highlighted whole, and "begotten" underlined in the KJV.
    let mut marks = VerseMarks {
        highlight: Some(MarkColor::Named("yellow")),
        ..Default::default()
    };
    marks
        .text_marks
        .push(text_mark(&kjv, "begotten", MarkKind::Underline, "blue"));
    let store = app.store.as_mut().unwrap();
    store
        .save_annotation(
            &john,
            &Annotation {
                verse: 16,
                marks,
                ..Default::default()
            },
        )
        .unwrap();
    app.load_annotations();
    assert!(
        drawn(&app, 16)
            .iter()
            .any(|(_, u)| *u == Some(MarkColor::Named("blue")))
    );

    // Make the BSB the default: the text waits for it, as the website streams it, with nothing compared twice.
    app.preferences.compare_bibles = vec!["BSB".into(), "eng_webu".into()];
    app.preferences.jst = true;
    let _ = app.update(Message::Tools(ToolsMsg::SetDefault(" BSB ".into())));
    assert_eq!(app.preferences.default_bible, "BSB");
    assert_eq!(
        app.tools.primary,
        Primary::Loading {
            requested: "BSB".into()
        }
    );
    assert!(app.verses.is_empty());
    assert_eq!(
        app.tools.primary_in_flight,
        [(john.clone(), "BSB".to_string())]
    );
    assert_eq!(
        app.tools
            .compare
            .iter()
            .map(|(id, _)| id.as_str())
            .collect::<Vec<_>>(),
        ["eng_webu"]
    );
    // The JST revises the KJV only.
    assert!(!app.jst_enabled());
    // A late answer for another chapter changes nothing here.
    let _ = app.update(Message::Tools(ToolsMsg::Primary(
        at("newtestament", "john", 4),
        "BSB".into(),
        Ok((
            "BSB".into(),
            vec![Verse {
                number: 1,
                text: "Other".into(),
            }],
        )),
    )));
    assert!(app.verses.is_empty());
    let bsb = vec![
        Verse {
            number: 16,
            text: BSB_16.into(),
        },
        Verse {
            number: 17,
            text: "For God did not send His Son into the world to condemn the world, but to save the world through Him.".into(),
        },
    ];
    let _ = app.update(Message::Tools(ToolsMsg::Primary(
        john.clone(),
        "BSB".into(),
        Ok(("BSB".into(), bsb.clone())),
    )));
    assert_eq!(texts(&app.verses), texts(&bsb));
    assert_eq!(app.primary_translation(), "BSB");
    assert_eq!(app.primary_notice(), None);
    // The whole-verse highlight stays; the KJV word's underline isn't drawn on the BSB's different words.
    assert_eq!(drawn(&app, 16), [(Some(MarkColor::Named("yellow")), None)]);

    // Words marked in the BSB are saved as the BSB's words, so they never show on the KJV.
    let (start, end) = utf16(BSB_16, "one and only");
    app.word_selection = vec![(0, TextRange { start, end })];
    let _ = app.update(Message::Mark(
        MarkKind::Highlight,
        Some(MarkColor::Named("green")),
        true,
    ));
    let saved = app.store.as_ref().unwrap().annotations(&john).unwrap();
    let saved = saved.iter().find(|a| a.verse == 16).unwrap();
    assert!(
        saved
            .marks
            .text_marks
            .iter()
            .any(|m| m.text == "one and only")
    );
    assert!(
        drawn(&app, 16)
            .iter()
            .any(|(h, _)| *h == Some(MarkColor::Named("green")))
    );

    // Leaving and coming back reads the BSB from memory, without waiting again.
    let _ = app.update(Message::Navigate(at("newtestament", "john", 4), None));
    let _ = app.update(Message::Navigate(john.clone(), None));
    assert_eq!(
        app.tools.primary,
        Primary::Shown {
            requested: "BSB".into(),
            actual: "BSB".into()
        }
    );
    assert_eq!(texts(&app.verses), texts(&bsb));

    // Back to the bundled KJV: its own underline shows again, the BSB's words don't.
    let _ = app.update(Message::Tools(ToolsMsg::SetDefault("lds".into())));
    assert_eq!(app.tools.primary, Primary::Bundled);
    assert_eq!(app.verses[15].text, kjv);
    let colors = drawn(&app, 16);
    assert!(
        colors
            .iter()
            .any(|(_, u)| *u == Some(MarkColor::Named("blue")))
    );
    assert!(
        !colors
            .iter()
            .any(|(h, _)| *h == Some(MarkColor::Named("green")))
    );
    assert!(app.jst_enabled());

    // A default Bible that can't load this chapter shows the bundled text, with the website's notice.
    let _ = app.update(Message::Tools(ToolsMsg::SetDefault("eng_net".into())));
    let _ = app.update(Message::Tools(ToolsMsg::Primary(
        john.clone(),
        "eng_net".into(),
        Err("Couldn't reach Verse Together".into()),
    )));
    assert_eq!(app.verses[15].text, kjv);
    assert_eq!(
        app.primary_notice().as_deref(),
        Some(
            "Your default Bible couldn’t load this chapter. Showing King James Bible (LDS edition) instead."
        )
    );
    assert!(
        app.jst_enabled(),
        "the bundled KJV is shown, so its JST can be"
    );
    // The provider's own fallback text is named as what it is.
    let _ = app.update(Message::Tools(ToolsMsg::SetDefault("eng_lsv".into())));
    let _ = app.update(Message::Tools(ToolsMsg::Primary(
        john.clone(),
        "eng_lsv".into(),
        Ok(("kjv".into(), bsb.clone())),
    )));
    assert_eq!(
        app.primary_notice().as_deref(),
        Some("Your default Bible couldn’t load this chapter. Showing KJV instead.")
    );

    // The Book of Mormon is never read in another Bible.
    let _ = app.update(Message::Navigate(at("bookofmormon", "alma", 32), None));
    assert_eq!(app.tools.primary, Primary::Bundled);
    assert!(!app.verses.is_empty());

    // Removing the default Bible restores the King James Bible, and the choice survives a restart.
    app.preferences.bibles = crate::reader_tools::featured_bibles();
    let _ = app.update(Message::Tools(ToolsMsg::SetDefault("BSB".into())));
    let _ = app.update(Message::Tools(ToolsMsg::RemoveBible("bsb".into())));
    assert_eq!(app.preferences.default_bible, "lds");
    assert!(!app.preferences.bibles.iter().any(|b| b.id == "BSB"));
    let _ = app.update(Message::Tools(ToolsMsg::SetDefault("eng_webu".into())));
    drop(app);
    let reopened = App::from_directory(&dir.0);
    assert_eq!(reopened.preferences.default_bible, "eng_webu");
}

#[test]
fn other_denominations_hide_latter_day_saint_content_without_removing_study_data() {
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    app.window_width = 1280.0;
    app.window_height = 800.0;
    let alma = at("bookofmormon", "alma", 32);
    let _ = app.update(Message::Navigate(alma.clone(), None));
    app.store
        .as_mut()
        .unwrap()
        .save_annotation(
            &alma,
            &Annotation {
                verse: 21,
                note: "Faith is not a perfect knowledge".into(),
                ..Default::default()
            },
        )
        .unwrap();
    app.preferences.jst = true;
    // Chosen in Settings → Reading, with its real control.
    let _ = app.update(Message::SettingsTab(settings_ui::SettingsTab::Reading));
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(
        ui.find("Church of Jesus Christ of Latter-day Saints")
            .is_ok()
    );
    drop(ui);
    let _ = crate::ui_tests::click_label(&mut app, "Other denominations");
    assert_eq!(app.preferences.faith_tradition, faith::OTHER);
    assert!(!app.show_lds());
    // The navigation drops Come Follow Me; the Library keeps the Bible and the journal.
    assert_eq!(app.nav_count(), 2);
    assert_eq!(app.nav_index(Screen::Guides), None);
    let _ = app.update(Message::Library(crate::library_ui::LibraryMsg::Show(
        crate::library_ui::LibraryPage::Home,
    )));
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find(iced_test::selector::id("nav-2")).is_err());
    assert!(ui.find("Old Testament").is_ok());
    assert!(ui.find("New Testament").is_ok());
    assert!(ui.find("Journal").is_ok());
    for hidden in [
        "Book of Mormon",
        "Doctrine and Covenants",
        "Pearl of Great Price",
        "Continue reading",
    ] {
        assert!(ui.find(hidden).is_err(), "{hidden} shows");
    }
    assert!(ui.find("Search or jump to John 3:16").is_ok());
    drop(ui);
    // A direct way in (the reader's last chapter, Come, Follow Me) shows the website's notice instead.
    let _ = app.update(Message::SetScreen(Screen::Reader));
    assert!(app.content_hidden());
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("Content hidden by your faith tradition").is_ok());
    assert!(
        ui.find("You can change your faith tradition in Settings → Reading.")
            .is_ok()
    );
    assert!(ui.find(iced_test::selector::id("reader-pill")).is_err());
    drop(ui);
    let _ = app.update(Message::SetScreen(Screen::Guides));
    assert!(app.content_hidden());
    // Browse returns to the Library itself rather than to hidden content (`useBrowseNavHref`).
    let _ = app.update(Message::SetScreen(Screen::Journal));
    let _ = app.update(Message::Library(crate::library_ui::LibraryMsg::Nav));
    assert_eq!(app.screen, Screen::Library);
    assert_eq!(app.library, crate::library_ui::LibraryPage::Home);
    // The notice's Settings link opens Reading.
    let _ = app.update(Message::SetScreen(Screen::Reader));
    let _ = crate::ui_tests::click_label(&mut app, "Settings");
    assert_eq!(
        (app.screen, app.settings_tab),
        (Screen::Settings, settings_ui::SettingsTab::Reading)
    );
    // Bible chapters read as before, without the JST, study paths or the study helps.
    let _ = app.update(Message::Navigate(at("newtestament", "john", 3), None));
    assert!(!app.content_hidden());
    assert!(!app.jst_enabled());
    assert_eq!(app.tools.paths, crate::reader_tools::Load::Ready(vec![]));
    // Search keeps to the Bible: a Book of Mormon reference finds nothing, words only Bible verses.
    let path = app.store.as_ref().unwrap().scripture_path.clone();
    assert!(
        crate::store::Store::search(&path, "Alma 32", None, true)
            .unwrap()
            .hits
            .is_empty()
    );
    let hits = crate::store::Store::search(&path, "faith", None, true)
        .unwrap()
        .hits;
    assert!(!hits.is_empty());
    assert!(
        hits.iter()
            .all(|h| crate::reader_tools::is_bible(&h.location.volume))
    );
    assert!(
        crate::store::Store::search(&path, "faith", None, false)
            .unwrap()
            .hits
            .iter()
            .any(|h| !crate::reader_tools::is_bible(&h.location.volume))
    );
    // Nothing hidden was removed, and the choice is kept on this device.
    let kept = app.store.as_ref().unwrap().annotations(&alma).unwrap();
    assert!(
        kept.iter()
            .any(|a| a.verse == 21 && a.note.starts_with("Faith is"))
    );
    drop(app);
    let mut app = App::from_directory(&dir.0);
    assert_eq!(app.preferences.faith_tradition, faith::OTHER);
    // Switching back shows it all again.
    let _ = app.update(Message::SetFaith(faith::LATTER_DAY_SAINT));
    let _ = app.update(Message::Navigate(alma.clone(), None));
    assert!(!app.content_hidden());
    assert_eq!(app.nav_count(), 3);
    assert!(app.annotations.iter().any(|a| a.verse == 21));
}

#[test]
fn verse_links_open_the_journal_notes_that_link_them_without_losing_drafts() {
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    app.window_width = 1280.0;
    app.window_height = 800.0;
    let jeremiah = at("oldtestament", "jeremiah", 31);
    let store = app.store.as_mut().unwrap();
    let mut first = Note::new("2026-10-26", None);
    first.title = "The new covenant".into();
    first.body = "**[Jeremiah 31:5, 7–8](/browse/oldtestament/jeremiah/31#v-5)**\n> 5 Thou shalt yet plant vines".into();
    store.save_note(&first).unwrap();
    let mut second = Note::new("2026-10-27", None);
    second.title = "Vineyards".into();
    second.body = "See [this verse](/browse/old-testament/jeremiah/31#v-5).".into();
    store.save_note(&second).unwrap();
    // A note whose only tie is its reading source marks nothing (2.13.0).
    let mut sourced = Note::new(
        "2026-10-27",
        Some(NoteSource::scripture("Jeremiah", &jeremiah, Some((12, 12)))),
    );
    sourced.body = "Thinking about verse 12".into();
    store.save_note(&sourced).unwrap();
    // Nor does another chapter's link.
    let mut other = Note::new("2026-10-27", None);
    other.body = "[Jeremiah 32:5](/browse/oldtestament/jeremiah/32#v-5)".into();
    store.save_note(&other).unwrap();

    let _ = app.update(Message::Navigate(jeremiah.clone(), None));
    let links = &app.note_links.by_verse;
    assert_eq!(links.keys().copied().collect::<Vec<_>>(), [5, 7]);
    assert_eq!(links[&5].len(), 2);
    assert_eq!((links[&7][0].start, links[&7][0].end), (7, 8));
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("2 notes").is_ok());
    assert!(ui.find("Note").is_ok());
    drop(ui);

    // A verse note being written is saved before a note opens.
    let _ = app.update(Message::SelectVerse(3));
    let _ = app.update(Message::EditNote(iced::widget::text_editor::Action::Edit(
        iced::widget::text_editor::Edit::Paste(std::sync::Arc::new("Everlasting love".into())),
    )));
    assert!(app.note_dirty);
    // (The study panel also says "Note", so the marker is pressed by its message here; "2 notes" is clicked below.)
    let _ = app.update(Message::NoteLinks(note_links::NoteLinkMsg::Marker(7)));
    assert!(!app.note_dirty);
    let saved = app.store.as_ref().unwrap().annotations(&jeremiah).unwrap();
    assert!(
        saved
            .iter()
            .any(|a| a.verse == 3 && a.note == "Everlasting love")
    );
    assert_eq!(app.screen, Screen::Journal);
    assert_eq!(app.journal.open.as_ref().unwrap().note.id, first.id);

    // Several notes at a verse: the picker lists them; the arrow keys and Enter choose one.
    let _ = app.update(Message::Navigate(jeremiah.clone(), None));
    let place = |app: &App, id: &'static str| {
        crate::ui_tests::simulator_for(app)
            .find(iced_test::selector::id(id))
            .unwrap()
            .bounds()
    };
    let (verse_6, marker) = {
        let mut ui = crate::ui_tests::simulator_for(&app);
        (
            ui.find(iced_test::selector::id("verse-6"))
                .unwrap()
                .bounds(),
            ui.find("2 notes").unwrap().bounds(),
        )
    };
    let _ = crate::ui_tests::click_label(&mut app, "2 notes");
    assert_eq!(app.note_links.picker, Some(5));
    // It floats over the page: nothing below the marker moves, and it opens just below the marker, lined up with
    // its right edge and inside the window.
    assert_eq!(place(&app, "verse-6"), verse_6);
    let mut ui = crate::ui_tests::simulator_for(&app);
    let title = ui.find("Your notes").unwrap().bounds();
    assert!(title.y > marker.y + marker.height && title.y < marker.y + marker.height + 40.0);
    assert!(title.x < marker.x && title.x > marker.x + marker.width - 288.0);
    assert!(ui.find("Verse 5").is_ok());
    assert!(ui.find("The new covenant").is_ok());
    assert!(ui.find("Vineyards").is_ok());
    assert!(ui.find("DRAFT").is_ok());
    drop(ui);
    // Most recently changed first: "Vineyards", then "The new covenant" (opened, so not changed since).
    let order: Vec<_> = app.note_links.by_verse[&5]
        .iter()
        .map(|r| r.title.clone())
        .collect();
    let _ = app.update(Message::NoteLinks(note_links::NoteLinkMsg::Step(1)));
    let _ = app.update(Message::NoteLinks(note_links::NoteLinkMsg::Choose));
    assert_eq!(app.journal.open.as_ref().unwrap().note.title, order[1]);

    // A link written in the journal shows when the reader is back.
    let _ = app.update(Message::Navigate(jeremiah.clone(), None));
    let mut third = Note::new("2026-10-28", None);
    third.title = "Hope".into();
    third.body = "[Jeremiah 31:17](/browse/oldtestament/jeremiah/31#v-17)".into();
    app.store.as_mut().unwrap().save_note(&third).unwrap();
    let _ = app.update(Message::SetScreen(Screen::Journal));
    let _ = app.update(Message::SetScreen(Screen::Reader));
    assert!(app.note_links.by_verse.contains_key(&17));
    // In simple mode no links show.
    app.focus = true;
    assert!(app.note_link_marker(5).is_none());
}

#[test]
fn account_notes_keep_their_listed_status_and_leave_with_the_account() {
    let dir = profile();
    let mut store = crate::store::Store::open(&dir.0).unwrap();
    store.set_owner("account-1");
    store
        .apply_remote_note(&crate::store::RemoteNote {
            remote_id: "r1".into(),
            revision: 1,
            updated_at: "2026-10-27T00:00:00.000Z".into(),
            journal_date: "2026-10-27".into(),
            source: None,
            reading_at: None,
            created: 1,
            updated: 1,
            text: Some((
                "Published thoughts".into(),
                "[Jeremiah 31:3](/browse/oldtestament/jeremiah/31#v-3)".into(),
            )),
        })
        .unwrap();
    store
        .set_note_statuses(&[("r1".into(), "published".into())])
        .unwrap();
    let notes = store.notes_linking_verses().unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].1, "published");
    let refs = note_links::chapter_refs(&notes, &at("oldtestament", "jeremiah", 31));
    assert!(refs[&3][0].published);
    // This device's own notes never see the account's.
    store.set_owner("");
    assert!(store.notes_linking_verses().unwrap().is_empty());
    store.forget_owner("account-1").unwrap();
    store.set_owner("account-1");
    assert!(store.notes_linking_verses().unwrap().is_empty());
}

#[test]
fn the_feedback_form_validates_sends_once_and_keeps_a_failed_draft() {
    use feedback::{FeedbackMsg, Status};
    use iced::widget::text_editor::{Action, Edit};
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    app.window_width = 1280.0;
    app.window_height = 800.0;
    let _ = app.update(Message::SettingsTab(settings_ui::SettingsTab::Feedback));
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(
        ui.find("Sent anonymously. You don't need to sign in.")
            .is_ok()
    );
    assert!(ui.find("0/2000").is_ok());
    assert!(ui.find("Send feedback").is_ok());
    drop(ui);
    // Too short: nothing is sent and the error shows.
    let paste = |app: &mut App, s: &str| {
        let _ = app.update(Message::Feedback(FeedbackMsg::Message(Action::Edit(
            Edit::Paste(std::sync::Arc::new(s.into())),
        ))));
    };
    paste(&mut app, "hey");
    let _ = crate::ui_tests::click_label(&mut app, "Send feedback");
    assert_eq!(app.feedback.form.status, Status::Idle);
    assert_eq!(app.feedback.generation, 0);
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("Write at least 5 characters.").is_ok());
    drop(ui);
    // A real message sends once; while it's in flight the draft can't change and a second press does nothing.
    paste(&mut app, " — the calendar is lovely");
    let _ = app.update(Message::Feedback(FeedbackMsg::Contact(
        "me@example.com".into(),
    )));
    let _ = crate::ui_tests::click_label(&mut app, "Send feedback");
    assert_eq!(app.feedback.form.status, Status::Pending);
    assert_eq!(app.feedback.generation, 1);
    let _ = app.update(Message::Feedback(FeedbackMsg::Submit));
    assert_eq!(app.feedback.generation, 1);
    paste(&mut app, "!!!");
    assert_eq!(
        app.feedback.form.draft.message,
        "hey — the calendar is lovely"
    );
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("Sending…").is_ok());
    drop(ui);
    // A failure keeps everything typed.
    let _ = app.update(Message::Feedback(FeedbackMsg::Sent(
        1,
        Err("HTTP 502".into()),
    )));
    assert_eq!(app.feedback.form.status, Status::Failed);
    assert_eq!(app.feedback.form.draft.contact, "me@example.com");
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(
        ui.find("Your feedback couldn't be sent. It's still here, so you can try again.")
            .is_ok()
    );
    drop(ui);
    // Only the latest send's answer counts; success clears the form and says so.
    let _ = app.update(Message::Feedback(FeedbackMsg::Submit));
    assert_eq!(app.feedback.generation, 2);
    let _ = app.update(Message::Feedback(FeedbackMsg::Sent(1, Ok(()))));
    assert_eq!(app.feedback.form.status, Status::Pending);
    let _ = app.update(Message::Feedback(FeedbackMsg::Sent(2, Ok(()))));
    assert_eq!(app.feedback.form.status, Status::Sent);
    assert!(app.feedback.message.text().trim().is_empty());
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("Thanks! Your feedback was sent.").is_ok());
    drop(ui);
    // Typing past the limit is cut short, as `maxLength` does.
    paste(&mut app, &"x".repeat(feedback::MESSAGE_MAX + 100));
    assert_eq!(
        feedback::utf16_len(&app.feedback.form.draft.message),
        feedback::MESSAGE_MAX
    );
    assert_eq!(app.feedback.form.status, Status::Idle);
}

#[test]
fn release_notes_show_the_websites_history_and_open_a_screenshot() {
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    app.window_width = 1280.0;
    app.window_height = 800.0;
    let _ = app.update(Message::SettingsTab(settings_ui::SettingsTab::ReleaseNotes));
    assert!(
        app.release.loading,
        "thumbnails are decoded in the background"
    );
    let notes = release_notes::notes();
    let mut ui = crate::ui_tests::simulator_for(&app);
    for release in &notes.releases[..release_notes::RECENT_COUNT] {
        let version: &'static str =
            Box::leak(format!("Version {}", release.version).into_boxed_str());
        assert!(ui.find(version).is_ok(), "{version}");
        let title: &'static str = Box::leak(release.title.clone().into_boxed_str());
        assert!(ui.find(title).is_ok(), "{title}");
    }
    assert!(ui.find("Earlier releases").is_ok());
    assert!(ui.find("2.0.0–2.11.0").is_ok());
    assert!(
        ui.find("Version 2.0.0").is_err(),
        "earlier releases start closed"
    );
    // The dev integration announces desktop account approval as upcoming.
    assert!(!notes.unreleased.items.is_empty());
    assert!(ui.find("Unreleased").is_ok());
    drop(ui);
    // (Below the fold at this window size, so it is opened by its message.)
    let _ = app.update(Message::Release(release_notes::ReleaseMsg::ToggleEarlier));
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("Version 2.0.0").is_ok());
    assert!(ui.find("September 25, 2026 – October 23, 2026").is_ok());
    drop(ui);
    // A screenshot opens full size over the page; Escape closes it.
    let shot = release_notes::all_screenshots().next().unwrap().clone();
    let _ = app.update(Message::Release(release_notes::ReleaseMsg::Open(
        shot.clone(),
    )));
    assert_eq!(app.release.viewing.as_ref(), Some(&shot));
    let mut ui = crate::ui_tests::simulator_for(&app);
    let caption: &'static str = Box::leak(shot.caption.clone().into_boxed_str());
    assert!(ui.find(caption).is_ok());
    drop(ui);
    let _ = app.update(Message::Event(iced::Event::Keyboard(
        iced::keyboard::Event::KeyPressed {
            key: iced::keyboard::Key::Named(iced::keyboard::key::Named::Escape),
            modified_key: iced::keyboard::Key::Named(iced::keyboard::key::Named::Escape),
            physical_key: iced::keyboard::key::Physical::Unidentified(
                iced::keyboard::key::NativeCode::Unidentified,
            ),
            location: iced::keyboard::Location::Standard,
            modifiers: Default::default(),
            text: None,
            repeat: false,
        },
    )));
    assert!(app.release.viewing.is_none());
}

#[test]
fn a_default_bible_failure_is_retried_on_a_new_visit_never_leaving_the_reader_empty() {
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    let john = at("newtestament", "john", 3);
    let _ = app.update(Message::Navigate(john.clone(), None));
    let _ = app.update(Message::Tools(ToolsMsg::SetDefault("BSB".into())));
    let _ = app.update(Message::Tools(ToolsMsg::Primary(
        john.clone(),
        "BSB".into(),
        Err("offline".into()),
    )));
    assert!(app.primary_is_bundled() && !app.verses.is_empty());
    // Long after the failure, reading the same chapter again in place (a sync, another owner) keeps its text.
    app.tools.primary_cache[0].at = std::time::Instant::now() - std::time::Duration::from_secs(600);
    app.load_chapter();
    assert!(!app.verses.is_empty());
    assert!(matches!(app.tools.primary, Primary::Shown { .. }));
    // A new visit tries the default Bible again.
    let _ = app.update(Message::Navigate(at("newtestament", "john", 4), None));
    let _ = app.update(Message::Navigate(john.clone(), None));
    assert_eq!(
        app.tools.primary,
        Primary::Loading {
            requested: "BSB".into()
        }
    );
    assert!(
        app.tools
            .primary_in_flight
            .contains(&(john, "BSB".to_string()))
    );
}

#[test]
fn a_bible_added_in_settings_is_saved_but_only_shown_when_added_in_the_reader() {
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    let bsb = crate::reader_tools::featured_bibles().remove(0);
    let net = crate::reader_tools::featured_bibles().remove(1);
    let _ = app.update(Message::SettingsTab(
        settings_ui::SettingsTab::BibleTranslations,
    ));
    let _ = app.update(Message::Tools(ToolsMsg::SaveBible(bsb.clone())));
    assert!(app.preferences.bibles.iter().any(|b| b.id == bsb.id));
    assert!(app.preferences.compare_bibles.is_empty());
    let _ = app.update(Message::Navigate(at("newtestament", "john", 3), None));
    let _ = app.update(Message::Tools(ToolsMsg::SaveBible(net.clone())));
    assert_eq!(app.preferences.compare_bibles, [net.id]);
}

fn remote_note(
    id: &str,
    title: &str,
    body: &str,
    source: Option<NoteSource>,
) -> crate::store::RemoteNote {
    crate::store::RemoteNote {
        remote_id: id.into(),
        revision: 1,
        updated_at: "2026-10-27T00:00:00.000Z".into(),
        journal_date: "2026-10-27".into(),
        reading_at: source.as_ref().map(|_| 1_793_000_000),
        source,
        created: 1_793_000_000,
        updated: 1_793_000_000,
        text: Some((title.into(), body.into())),
    }
}

#[test]
fn a_clean_open_draft_follows_sync_without_forking_the_next_edit() {
    use crate::journal_ui::JournalMsg;
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    let store = app.store.as_mut().unwrap();
    store.set_owner("account-1");
    let mut remote = remote_note("r1", "Before", "Original text", None);
    store.apply_remote_note(&remote).unwrap();
    let note = store.all_notes().unwrap().remove(0);
    app.open_note(note.clone(), None);

    remote.text = Some(("From the web".into(), "Updated text".into()));
    remote.revision += 1;
    app.store
        .as_mut()
        .unwrap()
        .apply_remote_note(&remote)
        .unwrap();
    app.refresh_open_note();
    let open = app.journal.open.as_ref().unwrap();
    assert_eq!(open.note.title, "From the web");
    assert_eq!(open.body.text(), "Updated text");
    let _ = app.update(Message::Journal(JournalMsg::Title("Edited here".into())));
    assert!(app.save_journal_note());
    assert_eq!(app.journal.open.as_ref().unwrap().note.id, note.id);
    assert_eq!(app.store.as_ref().unwrap().all_notes().unwrap().len(), 1);

    // A real concurrent edit still keeps the unsaved local draft and forks on save.
    let _ = app.update(Message::Journal(JournalMsg::Title("Unsaved here".into())));
    remote.revision += 1;
    remote.text = Some(("Another web edit".into(), "Other text".into()));
    let store = app.store.as_mut().unwrap();
    let dirty = store.dirty_notes(10).unwrap().remove(0);
    store
        .note_synced(&note.id, dirty.note.rev, "r1", remote.revision - 1, None)
        .unwrap();
    store.apply_remote_note(&remote).unwrap();
    app.refresh_open_note();
    assert_eq!(
        app.journal.open.as_ref().unwrap().note.title,
        "Unsaved here"
    );
    assert!(app.save_journal_note());
    assert_ne!(app.journal.open.as_ref().unwrap().note.id, note.id);
    assert_eq!(app.store.as_ref().unwrap().all_notes().unwrap().len(), 2);
}

#[test]
fn published_notes_open_read_only_everywhere_and_text_typed_as_one_is_published_is_kept() {
    use crate::journal_ui::{JournalMsg, READ_ONLY_COPY_NOTICE};
    use crate::md_editor::{Action, Edit};
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    app.window_width = 1280.0;
    app.window_height = 800.0;
    let jeremiah = at("oldtestament", "jeremiah", 31);
    let store = app.store.as_mut().unwrap();
    store.set_owner("account-1");
    let source = NoteSource::scripture("Jeremiah", &jeremiah, Some((3, 3)));
    for (id, title, verse) in [("r1", "Shared covenant", 3), ("r2", "Still a draft", 4)] {
        store
            .apply_remote_note(&remote_note(
                id,
                title,
                &format!("[Jeremiah 31:{verse}](/browse/oldtestament/jeremiah/31#v-{verse}) [site](/come-follow-me)"),
                (verse == 3).then(|| source.clone()),
            ))
            .unwrap();
    }
    store
        .set_note_statuses(&[
            ("r1".into(), "published".into()),
            ("r2".into(), "draft".into()),
        ])
        .unwrap();
    let id_of = |app: &App, title: &str| {
        app.store
            .as_ref()
            .unwrap()
            .all_notes()
            .unwrap()
            .into_iter()
            .find(|n| n.title == title)
            .unwrap()
    };
    let published = id_of(&app, "Shared covenant");

    // The verse's "Note" link opens it read-only, as the website's journal shows a published note.
    let _ = app.update(Message::Navigate(jeremiah.clone(), None));
    let _ = app.update(Message::NoteLinks(note_links::NoteLinkMsg::Marker(3)));
    assert_eq!(app.screen, Screen::Journal);
    let open = app.journal.open.as_ref().unwrap();
    assert_eq!(open.note.id, published.id);
    assert!(open.read_only() && !open.can_delete());
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("Published · read-only").is_ok());
    assert!(ui.find("Shared covenant").is_ok());
    assert!(ui.find("Reading logged").is_ok(), "its reading shows");
    assert!(
        ui.find("Saved").is_err() && ui.find("Save").is_err(),
        "no save state"
    );
    drop(ui);
    // Every way of changing it does nothing: title, typing, pasting, undo, the reading, deleting.
    for m in [
        JournalMsg::Title("Changed".into()),
        JournalMsg::Body(Action::Edit(Edit::Insert('x'))),
        JournalMsg::Body(Action::Edit(Edit::Paste(std::sync::Arc::new(
            "pasted".into(),
        )))),
        JournalMsg::Body(Action::Edit(Edit::Backspace)),
        JournalMsg::Undo,
        JournalMsg::Redo,
        JournalMsg::ToggleReading,
        JournalMsg::Delete,
        JournalMsg::ConfirmDelete(true),
        JournalMsg::Save,
    ] {
        let _ = app.update(Message::Journal(m));
    }
    let open = app.journal.open.as_ref().unwrap();
    assert!(!open.dirty && !open.confirm_delete);
    assert_eq!(open.note, published);
    assert_eq!(open.body.text(), published.body);
    // Its text can still be selected (and so copied).
    let _ = app.update(Message::Journal(JournalMsg::Body(Action::SelectAll)));
    assert_eq!(
        app.journal
            .open
            .as_ref()
            .unwrap()
            .body
            .selected_text()
            .as_deref(),
        Some(published.body.as_str())
    );
    let _ = app.update(Message::Journal(JournalMsg::Close));
    assert_eq!(
        app.store.as_ref().unwrap().note(&published.id).unwrap(),
        Some(published.clone())
    );
    // The day's list tags it; opening it from there is read-only too.
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("PUBLISHED").is_ok());
    drop(ui);
    let _ = app.update(Message::Journal(JournalMsg::Open(published.id.clone())));
    assert!(app.journal.open.as_ref().unwrap().read_only());

    // A draft being written when a sync finds it published: the published note is left as the account has it, and
    // what was typed continues as a separate draft of the same account.
    let draft = id_of(&app, "Still a draft");
    let _ = app.update(Message::Journal(JournalMsg::Open(draft.id.clone())));
    assert!(!app.journal.open.as_ref().unwrap().read_only());
    let _ = app.update(Message::Journal(JournalMsg::Body(Action::Move(
        crate::md_editor::Motion::DocEnd,
        false,
    ))));
    let _ = app.update(Message::Journal(JournalMsg::Body(Action::Edit(
        Edit::Paste(std::sync::Arc::new(" typed meanwhile".into())),
    ))));
    assert!(app.journal.open.as_ref().unwrap().dirty);
    app.store
        .as_mut()
        .unwrap()
        .set_note_statuses(&[
            ("r1".into(), "published".into()),
            ("r2".into(), "published".into()),
        ])
        .unwrap();
    app.refresh_open_note();
    let open = app.journal.open.as_ref().unwrap();
    assert_ne!(open.note.id, draft.id);
    assert!(!open.read_only() && !open.dirty);
    assert!(open.body.text().ends_with(" typed meanwhile"));
    assert_eq!(app.journal.notice.as_deref(), Some(READ_ONLY_COPY_NOTICE));
    let copy = open.note.id.clone();
    let store = app.store.as_mut().unwrap();
    assert_eq!(store.note(&draft.id).unwrap().unwrap().body, draft.body);
    assert!(
        store
            .note(&copy)
            .unwrap()
            .unwrap()
            .body
            .ends_with(" typed meanwhile")
    );
    assert_eq!(store.note_status(&copy).unwrap(), "draft");
    store.set_owner("");
    assert_eq!(
        store.note(&copy).unwrap(),
        None,
        "kept under the same account"
    );
    store.set_owner("account-1");
    // Typing on continues in that copy.
    let _ = app.update(Message::Journal(JournalMsg::Body(Action::Edit(
        Edit::Insert('!'),
    ))));
    assert!(app.save_journal_note());
    assert_eq!(app.journal.open.as_ref().unwrap().note.id, copy);
    // Without anything unsaved, an open note that becomes published just turns read-only.
    let _ = app.update(Message::Journal(JournalMsg::Open(draft.id.clone())));
    assert!(app.journal.open.as_ref().unwrap().read_only());
    app.journal.open.as_mut().unwrap().status = "draft".into();
    app.refresh_open_note();
    assert!(app.journal.open.as_ref().unwrap().read_only());
    assert_eq!(app.journal.open.as_ref().unwrap().note.id, draft.id);
}

#[test]
fn the_reading_log_marks_read_passages_and_opens_their_entries_without_moving_the_text() {
    use crate::journal_ui::JournalMsg;
    use note_links::NoteLinkMsg;
    let dir = profile();
    let mut app = App::from_directory(&dir.0);
    app.window_width = 1280.0;
    app.window_height = 800.0;
    let jeremiah = at("oldtestament", "jeremiah", 31);
    let store = app.store.as_mut().unwrap();
    // This computer's own log: verses 3–4 one day, verse 5 another (adjoining: one passage), and a journal entry
    // logging 7–8 whose body links nothing (a reading isn't a note link).
    store
        .log_reading(
            "2026-10-20",
            &NoteSource::scripture("Jeremiah", &jeremiah, Some((3, 4))),
        )
        .unwrap();
    store
        .log_reading(
            "2026-10-22",
            &NoteSource::scripture("Jeremiah", &jeremiah, Some((5, 5))),
        )
        .unwrap();
    let mut entry = Note::new(
        "2026-10-24",
        Some(NoteSource::scripture("Jeremiah", &jeremiah, Some((7, 8)))),
    );
    entry.title = "Read about the new covenant".into();
    entry.reading_at = Some(1_793_000_000);
    store.save_note(&entry).unwrap();
    // A signed-in account's log on this computer never shows for the device, nor the device's for the account.
    store.set_owner("account-1");
    store
        .log_reading(
            "2026-10-21",
            &NoteSource::scripture("Jeremiah", &jeremiah, Some((20, 21))),
        )
        .unwrap();
    store.set_owner("");

    let _ = app.update(Message::Navigate(jeremiah.clone(), None));
    // Marking a chapter read logs it, and the reader shows it straight away (then takes it back).
    let mut marked = App::from_directory(&profile().0);
    let _ = marked.update(Message::Navigate(at("oldtestament", "jeremiah", 30), None));
    let _ = marked.update(Message::MarkRead);
    let whole = marked.read_passages();
    assert_eq!((whole[&1].start, whole[&1].end), (1, 24));
    let _ = marked.update(Message::MarkRead);
    assert!(marked.read_passages().is_empty());
    let read = app.read_passages();
    assert_eq!(read.keys().copied().collect::<Vec<_>>(), [3, 4, 5, 7, 8]);
    assert_eq!(
        (read[&3].start, read[&3].end, read[&3].readings.len()),
        (3, 5, 2)
    );
    assert_eq!((read[&7].start, read[&7].end), (7, 8));
    assert!(read[&7].readings[0].note);
    assert!(
        app.note_links.by_verse.is_empty(),
        "readings make no note links"
    );

    // The check and its rule sit in the verse's margin: the verses keep their places.
    let mut plain = App::from_directory(&profile().0);
    plain.window_width = 1280.0;
    plain.window_height = 800.0;
    let _ = plain.update(Message::Navigate(jeremiah.clone(), None));
    let place = |app: &App, id: &'static str| {
        crate::ui_tests::simulator_for(app)
            .find(iced_test::selector::id(id))
            .unwrap()
            .bounds()
    };
    for id in ["verse-3", "verse-6", "verse-9"] {
        assert_eq!(place(&app, id), place(&plain, id), "{id}");
    }

    // One reading opens its journal entry.
    let _ = app.update(Message::NoteLinks(NoteLinkMsg::ReadMarker(7)));
    assert_eq!(app.screen, Screen::Journal);
    assert_eq!(app.journal.open.as_ref().unwrap().note.id, entry.id);

    // Several: "Reading log" floats beside the check with each day; the keys choose one, which opens its day.
    let _ = app.update(Message::Navigate(jeremiah.clone(), None));
    let before = place(&app, "verse-6");
    let _ = app.update(Message::NoteLinks(NoteLinkMsg::ReadMarker(3)));
    assert_eq!(app.note_links.read_picker, Some(3));
    let today = crate::note_links::read_date(crate::store::now());
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("Reading log").is_ok());
    assert!(ui.find("verses 3–5").is_ok());
    assert!(ui.find(today.as_str()).is_ok());
    assert!(ui.find("vv. 3-4").is_ok() && ui.find("v. 5").is_ok());
    assert!(ui.find("DRAFT").is_err(), "readings have no status");
    drop(ui);
    assert_eq!(place(&app, "verse-6"), before, "the dialog moves nothing");
    let order: Vec<String> = app.read_passages()[&3]
        .readings
        .iter()
        .map(|r| r.journal_date.clone())
        .collect();
    // In the order of the verses they reach, as the website lists them.
    assert_eq!(order, ["2026-10-20", "2026-10-22"]);
    let _ = app.update(Message::NoteLinks(NoteLinkMsg::Step(1)));
    let _ = app.update(Message::NoteLinks(NoteLinkMsg::Step(-1)));
    let _ = app.update(Message::NoteLinks(NoteLinkMsg::Choose));
    assert_eq!(app.screen, Screen::Journal);
    assert!(app.journal.open.is_none());
    assert_eq!(app.journal.day, "2026-10-20");
    let mut ui = crate::ui_tests::simulator_for(&app);
    assert!(ui.find("Read Jeremiah 31:3-4").is_ok());
    drop(ui);
    let _ = app.update_journal(JournalMsg::Today);

    // Escape closes the dialog; signed in, the account's own log shows instead.
    let _ = app.update(Message::Navigate(jeremiah.clone(), None));
    let _ = app.update(Message::NoteLinks(NoteLinkMsg::ReadMarker(3)));
    let _ = app.update(Message::Event(iced::Event::Keyboard(
        iced::keyboard::Event::KeyPressed {
            key: iced::keyboard::Key::Named(iced::keyboard::key::Named::Escape),
            modified_key: iced::keyboard::Key::Named(iced::keyboard::key::Named::Escape),
            physical_key: iced::keyboard::key::Physical::Unidentified(
                iced::keyboard::key::NativeCode::Unidentified,
            ),
            location: iced::keyboard::Location::Standard,
            modifiers: iced::keyboard::Modifiers::default(),
            text: None,
            repeat: false,
        },
    )));
    assert_eq!(app.note_links.read_picker, None);
    app.store.as_mut().unwrap().set_owner("account-1");
    app.refresh_note_links();
    assert_eq!(
        app.read_passages().keys().copied().collect::<Vec<_>>(),
        [20, 21]
    );
}
