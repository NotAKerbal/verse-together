// Renders the real view headlessly (Iced's own test simulator, Tiny Skia) to check layout and clicks against the
// website's measured geometry.
use crate::store::Location;
use crate::{App, Message, Popover, Screen, design, header};
use iced::{Rectangle, Settings, Size};
use iced_test::selector::Candidate;
use iced_test::{Simulator, selector};
use std::path::PathBuf;
use std::time::Duration;

const WINDOW: Size = Size::new(1280., 800.);

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
        "verse-ui-sim-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let mut app = App::from_directory(&dir);
    app.window_width = WINDOW.width;
    app.window_height = WINDOW.height;
    app.motion.animate = true;
    let _ = app.update(Message::Navigate(
        Location {
            volume: "bookofmormon".into(),
            book: "alma".into(),
            chapter: 32,
        },
        None,
    ));
    Fixture { app, dir }
}
fn simulator(app: &App) -> Simulator<'_, Message> {
    Simulator::with_size(
        Settings {
            default_font: design::SANS,
            ..Settings::default()
        },
        WINDOW,
        app.view(),
    )
}
fn bounds(ui: &mut Simulator<'_, Message>, id: &'static str) -> Rectangle {
    ui.find(selector::id(id))
        .unwrap_or_else(|_| panic!("{id} is on screen"))
        .bounds()
}
/// The headless view of an app (for other test modules).
pub(crate) fn simulator_for(app: &App) -> Simulator<'_, Message> {
    simulator(app)
}
/// Every text visible in the view, in drawing order (for other test modules).
pub(crate) fn visible_texts(app: &App) -> Vec<String> {
    let mut ui = simulator(app);
    let mut texts = Vec::new();
    let _ = ui.find(|candidate: Candidate<'_>| -> Option<Rectangle> {
        if let Candidate::Text {
            content,
            visible_bounds: Some(_),
            ..
        } = candidate
        {
            texts.push(content.to_string());
        }
        None
    });
    texts
}
/// Clicks visible text, as `click` does (for other test modules).
pub(crate) fn click_label(app: &mut App, label: &'static str) -> Vec<Message> {
    click(app, label)
}
/// Clicks the topmost visible text with this label, as a pointer would.
fn click(app: &mut App, label: &'static str) -> Vec<Message> {
    let mut ui = simulator(app);
    let mut hits = Vec::new();
    let _ = ui.find(|candidate: Candidate<'_>| -> Option<Rectangle> {
        if let Candidate::Text {
            content,
            visible_bounds: Some(visible),
            ..
        } = candidate
            && content == label
        {
            hits.push(visible);
        }
        None
    });
    let target = *hits.last().unwrap_or_else(|| panic!("{label} is visible"));
    apply(app, press(ui, target))
}
/// Clicks the center of the widget with this id.
fn click_id(app: &mut App, id: &'static str) -> Vec<Message> {
    let mut ui = simulator(app);
    let target = bounds(&mut ui, id);
    apply(app, press(ui, target))
}
fn press(mut ui: Simulator<'_, Message>, target: Rectangle) -> Vec<Message> {
    ui.point_at(target.center());
    let _ = ui.simulate(iced_test::simulator::click());
    ui.into_messages().collect()
}
fn apply(app: &mut App, messages: Vec<Message>) -> Vec<Message> {
    for message in messages.clone() {
        let _ = app.update(message);
    }
    messages
}

#[test]
fn reader_starts_where_the_website_does_with_one_header_row() {
    let f = fixture();
    let mut ui = simulator(&f.app);
    let nav = bounds(&mut ui, "nav-pill");
    let reader = bounds(&mut ui, "reader-pill");
    // Header: one row at y16, 48px tall, inset 50px at 1280px.
    assert_eq!((nav.x, nav.y, nav.height), (50.0, 16.0, 48.0));
    assert_eq!((reader.y, reader.height), (16.0, 48.0));
    assert!((reader.x + reader.width - 1230.0).abs() < 1.0, "{reader:?}");
    // The website's pill is 430.25px with only Browse labelled; font metrics differ slightly natively.
    assert!((nav.width - 430.25).abs() < 24.0, "nav pill {}", nav.width);
    // Verse 1 is 16px under the header in a centered 896px column (912px with the rows' outer margins).
    let first = bounds(&mut ui, "verse-1");
    let second = bounds(&mut ui, "verse-2");
    assert_eq!((first.x, first.y, first.width), (184.0, 80.0, 912.0));
    assert_eq!(second.y, first.y + first.height + 12.0);
    // 28px lines plus 8px padding: each of these verses wraps to two lines at this width, as on the website.
    assert!(
        (first.height - 72.0).abs() <= 28.0,
        "verse 1 height {}",
        first.height
    );
    // No duplicated title block, library sidebar, chapter strip or status footer.
    for gone in [
        "LIBRARY",
        "← Previous",
        "Next →",
        "THE BOOK OF ALMA",
        "Chapter",
        "ON THIS DEVICE",
        "All scriptures available offline",
        "Select text to copy · Click verse numbers to study · Shift-click for a range",
    ] {
        assert!(ui.find(gone).is_err(), "{gone} should not be shown");
    }
}

#[test]
fn header_controls_open_their_real_panels() {
    let mut f = fixture();
    let app = &mut f.app;
    assert!(matches!(
        click(app, "Alma 32")[..],
        [Message::TogglePopover(Popover::Chapters)]
    ));
    assert_eq!(app.popover, Some(Popover::Chapters));
    // Choosing a chapter in the open picker navigates.
    click(app, "33");
    assert_eq!(app.reference(), "Alma 33");
    assert_eq!(app.popover, None);
    click(app, "Book of Mormon");
    assert_eq!(app.popover, Some(Popover::Library));
    click(app, "New Testament");
    click(app, "John");
    click(app, "3");
    assert_eq!(app.reference(), "John 3");
    click(app, "Log");
    assert!(app.log_open);
    click(app, "Mark chapter read");
    assert!(app.read);
}

#[test]
fn verse_numbers_select_and_the_study_panel_keeps_the_column() {
    let mut f = fixture();
    let app = &mut f.app;
    let before = bounds(&mut simulator(app), "verse-3");
    click(app, "3");
    assert!(app.selected.contains(&3));
    let mut ui = simulator(app);
    let after = bounds(&mut ui, "verse-3");
    // At 1280px the panel fits beside the 896px column without re-wrapping it.
    assert_eq!(before.width, after.width);
    assert_eq!(before.height, after.height);
    assert!(ui.find("Copy passage").is_ok());
    assert!(
        ui.find("Notes and marks stay on this device. Cloud sync is not connected.")
            .is_err()
    );
}

#[test]
fn nav_collapses_smoothly_and_screens_switch_from_the_header() {
    let mut f = fixture();
    let app = &mut f.app;
    let open = bounds(&mut simulator(app), "nav-pill").width;
    let _ = app.update(Message::ToggleNav);
    let started = app.now;
    let _ = app.update(Message::Frame(started + Duration::from_millis(100)));
    let mid = bounds(&mut simulator(app), "nav-pill").width;
    let _ = app.update(Message::Frame(started + Duration::from_millis(300)));
    let closed = bounds(&mut simulator(app), "nav-pill").width;
    assert!(closed < mid && mid < open, "{open} > {mid} > {closed}");
    // Collapsed: wordmark, toggle and padding only (the website settles at 173.25px).
    assert!((closed - 173.25).abs() < 20.0, "collapsed {closed}");
    let _ = app.update(Message::ToggleNav);
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    assert_eq!(bounds(&mut simulator(app), "nav-pill").width, open);
    click_id(app, "nav-1");
    assert_eq!(app.screen, Screen::Journal);
    click_id(app, "nav-2");
    assert_eq!(app.screen, Screen::Guides);
}

#[test]
fn long_breadcrumbs_keep_reader_controls_visible_at_minimum_width() {
    let mut f = fixture();
    let app = &mut f.app;
    app.window_width = 920.0;
    let _ = app.update(Message::Navigate(
        Location {
            volume: "doctrineandcovenants".into(),
            book: "doctrineandcovenants".into(),
            chapter: 138,
        },
        None,
    ));
    let mut ui = Simulator::with_size(
        Settings {
            default_font: design::SANS,
            ..Settings::default()
        },
        Size::new(920.0, 640.0),
        app.view(),
    );
    let nav = bounds(&mut ui, "nav-pill");
    let reader = bounds(&mut ui, "reader-pill");
    assert!(
        nav.x + nav.width + 12.0 <= reader.x,
        "header pills overlap: {nav:?}, {reader:?}"
    );
    let log = ui.find("Log").expect("Log action stays visible").bounds();
    assert!(
        log.x >= reader.x && log.x + log.width <= reader.x + reader.width,
        "Log clipped outside pill: {log:?}, {reader:?}"
    );
    assert!(
        reader.x + reader.width <= 920.0 - crate::header::shell_inset(920.0) + 1.0,
        "reader controls overflow the window: {reader:?}"
    );
}

/// Writes PNG snapshots for visual review: `VERSE_SNAPSHOTS=/tmp/dir cargo test snapshots -- --ignored`.
#[test]
#[ignore]
fn snapshots() {
    let out = PathBuf::from(std::env::var("VERSE_SNAPSHOTS").expect("VERSE_SNAPSHOTS directory"));
    let mut f = fixture();
    let app = &mut f.app;
    let shot = |app: &App, name: &str| {
        let path = out.join(format!("{name}.png"));
        // The snapshot is written beside `path` with the renderer's name, and only when it doesn't exist yet.
        let _ = std::fs::remove_file(out.join(format!("{name}-tiny-skia.png")));
        let mut ui = simulator(app);
        ui.snapshot(&app.theme())
            .unwrap()
            .matches_image(&path)
            .unwrap();
    };
    shot(app, "reader");
    let _ = app.update(Message::ToggleNav);
    let started = app.now;
    let _ = app.update(Message::Frame(started + Duration::from_millis(90)));
    shot(app, "collapse-90ms");
    let _ = app.update(Message::Frame(started + Duration::from_millis(300)));
    shot(app, "collapsed");
    let _ = app.update(Message::ToggleNav);
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    for (popover, name) in [
        (Popover::Chapters, "chapters"),
        (Popover::Library, "library"),
        (Popover::ReaderSettings, "reader-settings"),
        (Popover::AppSettings, "app-settings"),
    ] {
        let _ = app.update(Message::TogglePopover(popover));
        shot(app, name);
        let _ = app.update(Message::ClosePopover);
    }
    let _ = app.update(Message::TogglePopover(Popover::Search));
    let _ = app.update(Message::SearchInput("faith".into()));
    app.results = crate::store::Store::search(
        &app.store.as_ref().unwrap().scripture_path,
        "faith",
        None,
        false,
    )
    .unwrap();
    app.searching = false;
    shot(app, "search");
    let _ = app.update(Message::ClosePopover);
    let _ = app.update(Message::SelectVerse(21));
    let _ = app.update(Message::QuickMark(0, false));
    shot(app, "selected");
    let _ = app.update(Message::ClearSelection);
    let _ = app.update(Message::ToggleLog);
    shot(app, "log");
    let _ = app.update(Message::ToggleLog);
    let _ = app.update(Message::ToggleFocus);
    shot(app, "simple");
    let _ = app.update(Message::ToggleFocus);
    let _ = app.update(Message::SetDark(true));
    shot(app, "dark");
    let _ = app.update(Message::SetDark(false));
    let _ = app.update(Message::SetScreen(Screen::Journal));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(120)));
    shot(app, "journal-switching");
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    shot(app, "journal");
    let _ = app.update(Message::SetScreen(Screen::Guides));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    shot(app, "guides");
    parity_snapshots(app, &shot);
}

/// The journal, lessons and marks added for web parity.
fn parity_snapshots(app: &mut App, shot: &dyn Fn(&App, &str)) {
    use crate::journal_ui::JournalMsg;
    use crate::lessons_ui::LessonMsg;
    use crate::marks::{MarkColor, MarkKind};
    let _ = app.update(Message::Lesson(LessonMsg::Open("2026-10-26".into())));
    shot(app, "lesson");
    for verse in 1..=3 {
        let _ = app.update(Message::Lesson(LessonMsg::SelectVerse(0, verse)));
    }
    let _ = app.update(Message::QuickMark(1, false));
    shot(app, "lesson-marks");
    let _ = app.update(Message::TogglePopover(Popover::Contents));
    shot(app, "lesson-contents");
    let _ = app.update(Message::ClosePopover);
    let _ = app.update(Message::SetScreen(Screen::Reader));
    let _ = app.update(Message::SelectVerse(21));
    let _ = app.update(Message::QuickMark(0, false));
    let _ = app.update(Message::Mark(
        MarkKind::Underline,
        Some(MarkColor::Named("blue")),
        false,
    ));
    let _ = app.update(Message::ToggleStyles);
    shot(app, "marks-panel");
    let _ = app.update(Message::ClearSelection);
    shot(app, "marks");
    let _ = app.update(Message::SetScreen(Screen::Journal));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    shot(app, "journal-home");
    let _ = app.update(Message::Journal(JournalMsg::New(Some(
        "What helped you feel closer to God?".into(),
    ))));
    shot(app, "journal-composer");
    for c in "# Seeds of faith".chars() {
        let _ = app.update(Message::Journal(JournalMsg::ComposerBody(
            crate::md_editor::Action::Edit(crate::md_editor::Edit::Insert(c)),
        )));
    }
    let _ = app.update(Message::Journal(JournalMsg::SaveEntry));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(140)));
    shot(app, "journal-opening");
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    shot(app, "journal-note");
    let _ = app.update(Message::Journal(JournalMsg::Body(
        crate::md_editor::Action::Move(crate::md_editor::Motion::DocEnd, false),
    )));
    for c in "\n\n## A mighty change\n\nFaith is **not** a perfect knowledge, but *hope* for things.\n- Read [Alma 32](/browse/bookofmormon/alma/32)\n> Ye must nourish it".chars() {
        let edit = if c == '\n' {
            crate::md_editor::Edit::Enter
        } else {
            crate::md_editor::Edit::Insert(c)
        };
        let _ = app.update(Message::Journal(JournalMsg::Body(
            crate::md_editor::Action::Edit(edit),
        )));
    }
    shot(app, "journal-markdown");
    let _ = app.update(Message::Journal(JournalMsg::Close));
    let _ = app.update(Message::Journal(JournalMsg::EditGoals));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    shot(app, "journal-goals");
    let _ = app.update(Message::Journal(JournalMsg::CancelGoals));
    let _ = app.update(Message::TogglePopover(Popover::AppSettings));
    shot(app, "settings-account");
    let _ = app.update(Message::ClosePopover);
    plan_snapshots(app, shot);
}

/// The plan pages signed in, with a plan as `readingPlans:getPlan` returns it (no server is called here).
fn plan_snapshots(app: &mut App, shot: &dyn Fn(&App, &str)) {
    use crate::plans::{BuilderMsg, Page, Plan, PlanStep, PlanSummary, PlansLoad, PlansMsg};
    app.account.session = Some(crate::cloud::Session::for_test(
        crate::cloud::AccountUser {
            id: "reader".into(),
            name: "Reader".into(),
            email: "reader@example.com".into(),
        },
        "token",
    ));
    let _ = app.update(Message::SetScreen(Screen::Plans));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    let start = (chrono::Local::now().date_naive() - chrono::Duration::days(2))
        .format("%Y-%m-%d")
        .to_string();
    let summary = PlanSummary {
        id: "plan-1".into(),
        title: "Mark".into(),
        template: "custom".into(),
        step_count: 16,
        read_count: 3,
        start_date: Some(start),
        chapters_per_day: Some(2),
        reading_days: Some(vec![true, true, true, true, true, false, false]),
        selections: None,
    };
    let done = PlanSummary {
        id: "plan-2".into(),
        title: "Gospels only".into(),
        step_count: 4,
        read_count: 4,
        chapters_per_day: None,
        reading_days: None,
        start_date: None,
        ..summary.clone()
    };
    app.plans.list = Some(PlansLoad::Ready(vec![summary.clone(), done]));
    shot(app, "plans-list");
    app.plans.open = Some(PlansLoad::Ready(Plan {
        summary,
        steps: (1..=16)
            .map(|c| PlanStep {
                volume: "newtestament".into(),
                book: "mark".into(),
                chapter: c,
                label: format!("Mark {c}"),
                index: c as usize - 1,
                read_at: (c <= 3).then_some(1.0),
            })
            .collect(),
    }));
    app.plans.page = Page::Detail;
    shot(app, "plans-detail");
    let _ = app.update(Message::Plans(PlansMsg::New));
    for m in [
        BuilderMsg::ToggleVolume("pearl"),
        BuilderMsg::Tab("newtestament"),
        BuilderMsg::TapBook("newtestament".into(), "mark".into()),
        BuilderMsg::TapBook("newtestament".into(), "mark".into()),
        BuilderMsg::Stepper(crate::plans::Field::From, 2),
        BuilderMsg::Stepper(crate::plans::Field::To, 5),
    ] {
        let _ = app.update(Message::Plans(PlansMsg::Builder(m)));
    }
    shot(app, "plans-builder");
    // The start date's calendar, scrolled into view (the builder can only be reached signed in).
    let _ = app.update(Message::Plans(PlansMsg::Builder(BuilderMsg::DateText(
        crate::plans::DateTarget::Start,
        "11/02/2026".into(),
    ))));
    let _ = app.update(Message::Plans(PlansMsg::Builder(BuilderMsg::DateOpen(
        crate::plans::DateTarget::Start,
    ))));
    let _ = app.update(Message::Plans(PlansMsg::Builder(BuilderMsg::DateFocus(3))));
    {
        let out =
            PathBuf::from(std::env::var("VERSE_SNAPSHOTS").expect("VERSE_SNAPSHOTS directory"));
        let path = out.join("plans-date-picker.png");
        let _ = std::fs::remove_file(out.join("plans-date-picker-tiny-skia.png"));
        let mut ui = simulator(app);
        ui.point_at(iced::Point::new(640.0, 500.0));
        let _ = ui.simulate([iced::Event::Mouse(iced::mouse::Event::WheelScrolled {
            delta: iced::mouse::ScrollDelta::Pixels { x: 0.0, y: -700.0 },
        })]);
        ui.snapshot(&app.theme())
            .unwrap()
            .matches_image(&path)
            .unwrap();
    }
    let _ = app.update(Message::Plans(PlansMsg::Builder(BuilderMsg::DateClose)));
    let _ = app.update(Message::Plans(PlansMsg::Edit("plan-1".into())));
    shot(app, "plans-edit");
    app.account.session = None;
    app.plans = Default::default();
    use crate::library_ui::{LibraryMsg, LibraryPage};
    let _ = app.update(Message::Library(LibraryMsg::Nav));
    let _ = app.update(Message::Library(LibraryMsg::Nav));
    shot(app, "library");
    let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Volume(
        "oldtestament".into(),
    ))));
    shot(app, "library-volume");
    let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Book(
        "oldtestament".into(),
        "psalms".into(),
    ))));
    shot(app, "library-book");
    website_213_snapshots(app, shot);
}

/// Settings' sections, the faith tradition, the default Bible and the reader's note links (website 2.12–2.13).
fn website_213_snapshots(app: &mut App, shot: &dyn Fn(&App, &str)) {
    use crate::library_ui::{LibraryMsg, LibraryPage};
    use crate::settings_ui::SettingsTab;
    for (tab, name) in [
        (SettingsTab::Account, "settings-account"),
        (SettingsTab::Reading, "settings-reading"),
        (SettingsTab::BibleTranslations, "settings-translations"),
        (SettingsTab::StudyTools, "settings-study-tools"),
        (SettingsTab::Feedback, "settings-feedback"),
    ] {
        let _ = app.update(Message::SettingsTab(tab));
        shot(app, name);
    }
    let _ = app.update(Message::SettingsTab(SettingsTab::ReleaseNotes));
    let _ = app.update(Message::Release(crate::release_notes::ReleaseMsg::Thumbs(
        crate::release_notes::decode_thumbs(),
    )));
    shot(app, "settings-release-notes");
    let first = crate::release_notes::all_screenshots()
        .next()
        .unwrap()
        .clone();
    let _ = app.update(Message::Release(crate::release_notes::ReleaseMsg::Open(
        first,
    )));
    shot(app, "settings-release-viewer");
    let _ = app.update(Message::Release(crate::release_notes::ReleaseMsg::Close));
    let _ = app.update(Message::ToggleFocus);
    shot(app, "settings-simple");
    let _ = app.update(Message::ToggleFocus);
    // Note links beside verses, and the picker of several notes.
    let jeremiah = Location {
        volume: "oldtestament".into(),
        book: "jeremiah".into(),
        chapter: 31,
    };
    for (title, body) in [
        (
            "The new covenant",
            "**[Jeremiah 31:31–33](/browse/oldtestament/jeremiah/31#v-31)**",
        ),
        (
            "Written in hearts",
            "[Jeremiah 31:33](/browse/oldtestament/jeremiah/31#v-33) and [31:31](/browse/oldtestament/jeremiah/31#v-31)",
        ),
    ] {
        let mut note = crate::store::Note::new("2026-10-26", None);
        note.title = title.into();
        note.body = body.into();
        app.store.as_mut().unwrap().save_note(&note).unwrap();
    }
    let _ = app.update(Message::Navigate(jeremiah.clone(), Some(31)));
    let _ = app.update(Message::ClearSelection);
    let _ = app.update(Message::NoteLinks(crate::note_links::NoteLinkMsg::Marker(
        31,
    )));
    {
        let out =
            PathBuf::from(std::env::var("VERSE_SNAPSHOTS").expect("VERSE_SNAPSHOTS directory"));
        let path = out.join("reader-note-links.png");
        let _ = std::fs::remove_file(out.join("reader-note-links-tiny-skia.png"));
        let mut ui = simulator(app);
        ui.point_at(iced::Point::new(640.0, 500.0));
        let _ = ui.simulate([iced::Event::Mouse(iced::mouse::Event::WheelScrolled {
            delta: iced::mouse::ScrollDelta::Pixels { x: 0.0, y: -2600.0 },
        })]);
        ui.snapshot(&app.theme())
            .unwrap()
            .matches_image(&path)
            .unwrap();
    }
    let _ = app.update(Message::NoteLinks(crate::note_links::NoteLinkMsg::Close));
    // A default Bible that couldn't load this chapter: the bundled text with the website's notice.
    let _ = app.update(Message::Tools(crate::reader_tools::ToolsMsg::SetDefault(
        "BSB".into(),
    )));
    let _ = app.update(Message::Tools(crate::reader_tools::ToolsMsg::Primary(
        jeremiah,
        "BSB".into(),
        Err("offline".into()),
    )));
    shot(app, "reader-default-bible-notice");
    let _ = app.update(Message::Tools(crate::reader_tools::ToolsMsg::SetDefault(
        "lds".into(),
    )));
    // Other denominations.
    let _ = app.update(Message::SetFaith(crate::faith::OTHER));
    let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Home)));
    shot(app, "faith-other-library");
    let _ = app.update(Message::SetScreen(Screen::Guides));
    shot(app, "faith-other-hidden");
    let _ = app.update(Message::SetFaith(crate::faith::LATTER_DAY_SAINT));

    // The Settings tabs part way through a change (120ms of 280ms).
    let _ = app.update(Message::SettingsTab(
        crate::settings_ui::SettingsTab::Account,
    ));
    let _ = app.update(Message::SettingsTab(
        crate::settings_ui::SettingsTab::Reading,
    ));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(120)));
    shot(app, "settings-tabs-120ms");
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(300)));
    // Your Bibles full screen: the list, then the catalog.
    let _ = app.update(Message::SettingsTab(
        crate::settings_ui::SettingsTab::BibleTranslations,
    ));
    shot(app, "settings-translations");
    let _ = app.update(Message::Tools(crate::reader_tools::ToolsMsg::BiblesView(
        crate::reader_tools::BiblesView::List,
    )));
    shot(app, "bibles-dialog-list");
    let _ = app.update(Message::Tools(crate::reader_tools::ToolsMsg::BiblesView(
        crate::reader_tools::BiblesView::Add,
    )));
    app.tools.catalog = Some(crate::reader_tools::Load::Ready(vec![]));
    shot(app, "bibles-dialog-catalog");
    let _ = app.update(Message::Tools(crate::reader_tools::ToolsMsg::CloseBibles));
    // The reading log beside the verses it covers, and its dialog of several readings.
    let jeremiah = Location {
        volume: "oldtestament".into(),
        book: "jeremiah".into(),
        chapter: 31,
    };
    {
        let store = app.store.as_mut().unwrap();
        for (day, verses) in [("2026-10-20", (3, 4)), ("2026-10-22", (5, 6))] {
            store
                .log_reading(
                    day,
                    &crate::store::NoteSource::scripture("Jeremiah", &jeremiah, Some(verses)),
                )
                .unwrap();
        }
    }
    let _ = app.update(Message::Navigate(jeremiah.clone(), None));
    shot(app, "reader-reading-log");
    let _ = app.update(Message::NoteLinks(
        crate::note_links::NoteLinkMsg::ReadMarker(3),
    ));
    shot(app, "reader-reading-log-picker");
    let _ = app.update(Message::NoteLinks(crate::note_links::NoteLinkMsg::Close));
    // A published account note, read-only.
    {
        let store = app.store.as_mut().unwrap();
        store.set_owner("account-1");
        store
            .apply_remote_note(&crate::store::RemoteNote {
                remote_id: "r1".into(),
                revision: 1,
                updated_at: "2026-10-27T00:00:00.000Z".into(),
                journal_date: "2026-10-27".into(),
                source: Some(crate::store::NoteSource::scripture(
                    "Jeremiah",
                    &jeremiah,
                    Some((33, 33)),
                )),
                reading_at: Some(1_793_000_000),
                created: 1_793_000_000,
                updated: 1_793_000_000,
                text: Some((
                    "Written in hearts".into(),
                    "## The law within\n\n> I will put my law in their inward parts\n\nSee [Jeremiah 31:33](/browse/oldtestament/jeremiah/31#v-33).".into(),
                )),
            })
            .unwrap();
        store
            .set_note_statuses(&[("r1".into(), "published".into())])
            .unwrap();
    }
    let id = app.store.as_ref().unwrap().all_notes().unwrap()[0]
        .id
        .clone();
    let _ = app.update(Message::SetScreen(Screen::Journal));
    let _ = app.update(Message::Journal(crate::journal_ui::JournalMsg::Open(id)));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(400)));
    shot(app, "journal-published");
    let _ = app.update(Message::Journal(crate::journal_ui::JournalMsg::Close));
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(400)));
    shot(app, "journal-published-list");
    app.store.as_mut().unwrap().set_owner("");
}

#[test]
fn the_gear_leads_to_settings_and_sign_in_like_the_website() {
    let mut f = fixture();
    let app = &mut f.app;
    // Signed out, the navigation's gear opens Settings (the website's /account), with no active link.
    let _ = click_id(app, "nav-settings");
    assert_eq!(app.screen, Screen::Settings);
    assert_eq!(header::screen_index(app.screen), None);
    let _ = app.update(Message::Frame(app.now + Duration::from_millis(400)));
    let mut ui = simulator(app);
    // The Account section opens first (`/account`), its heading and lead under the tabs.
    assert!(
        ui.find("Your profile, sign-in methods and devices.")
            .is_ok()
    );
    assert!(
        ui.find("Sign in to manage your account and sync your study. General settings are saved on this device.")
            .is_ok()
    );
    drop(ui);
    let _ = click(app, "Sign in");
    assert_eq!(app.screen, Screen::SignIn);
    let mut ui = simulator(app);
    // The website's card: 448px wide, centered at 1280px (x416), 40px under the header's content line (y120).
    let card = bounds(&mut ui, "sign-in-card");
    assert_eq!((card.x, card.y, card.width), (416.0, 120.0, 448.0));
    assert!(
        (card.height - 275.0).abs() < 24.0,
        "card height {}",
        card.height
    );
    assert!(ui.find("Continue with Google").is_ok());
    assert!(
        ui.find("New to Verse Together? Continuing with Google creates your account.")
            .is_ok()
    );
    // Google-only, as the production deployment: no invented email or password fields.
    assert!(ui.find("Password").is_err());
    assert!(ui.find("Email").is_err());
}

#[test]
fn your_bibles_opens_its_catalog_from_reader_settings() {
    let mut f = fixture();
    let app = &mut f.app;
    let _ = app.update(Message::Navigate(
        Location {
            volume: "newtestament".into(),
            book: "john".into(),
            chapter: 3,
        },
        None,
    ));
    let _ = app.update(Message::TogglePopover(Popover::ReaderSettings));
    let messages = click(app, "+ Add Bible");
    assert!(
        messages.iter().any(|m| matches!(
            m,
            Message::Tools(crate::reader_tools::ToolsMsg::BiblesView(_))
        )),
        "{messages:?}"
    );
    assert_eq!(app.popover, Some(Popover::ReaderSettings));
    assert_eq!(
        app.tools.bibles_dialog,
        Some(crate::reader_tools::BiblesView::Add)
    );
}

#[test]
fn the_bible_catalog_chooses_languages_like_the_website() {
    use crate::reader_tools::{Load, ToolsMsg, Translation};
    let mut f = fixture();
    let app = &mut f.app;
    let _ = app.update(Message::Navigate(
        Location {
            volume: "newtestament".into(),
            book: "john".into(),
            chapter: 3,
        },
        None,
    ));
    let bible = |id: &str, name: &str, lang: &str, english: &str, native: &str| Translation {
        id: id.into(),
        name: name.into(),
        english_name: None,
        short_name: Some(id.to_uppercase()),
        language: Some(lang.into()),
        language_english_name: Some(english.into()),
        language_name: Some(native.into()),
    };
    let _ = app.update(Message::TogglePopover(Popover::ReaderSettings));
    let _ = click(app, "+ Add Bible");
    app.tools.catalog = Some(Load::Ready(vec![
        bible("BSB", "Berean Standard Bible", "eng", "English", "English"),
        bible("spa_rvr", "Reina-Valera 1909", "spa", "Spanish", "español"),
        bible(
            "spa_pdt",
            "Palabra de Dios para Todos",
            "spa",
            "Spanish",
            "español",
        ),
    ]));
    // The opening view: the featured English Bibles and the language button.
    let _ = click(app, "Change ›");
    assert!(app.tools.choosing_language);
    // Search the languages by their own name; Enter takes the first.
    let _ = app.update(Message::Tools(ToolsMsg::LanguageQuery("espanol".into())));
    let _ = click(app, "Spanish · español");
    assert_eq!(app.tools.catalog_language, "spa");
    assert!(!app.tools.choosing_language);
    // The Spanish Bibles are listed; adding one saves it to Your Bibles.
    let _ = click(app, "Palabra de Dios para Todos");
    let messages = click(app, "Add");
    assert!(
        messages
            .iter()
            .any(|m| matches!(m, Message::Tools(ToolsMsg::SaveBible(_)))),
        "{messages:?}"
    );
    assert!(
        app.preferences
            .bibles
            .iter()
            .any(|b| b.id.starts_with("spa_"))
    );
    // Added, the dialog returns to the list of Bibles, where it shows (in the reader, switched on).
    assert_eq!(
        app.tools.bibles_dialog,
        Some(crate::reader_tools::BiblesView::List)
    );
    let mut ui = simulator(app);
    assert!(ui.find("Reina-Valera 1909").is_ok());
    assert!(ui.find("Spanish · SPA_RVR").is_ok());
    assert!(ui.find("Done").is_ok());
    drop(ui);
    assert_eq!(app.popover, Some(Popover::ReaderSettings));
}

#[test]
fn your_bibles_opens_full_screen_like_the_websites_dialog() {
    use crate::reader_tools::{BiblesView, Load, ToolsMsg};
    use crate::settings_ui::SettingsTab;
    use iced::keyboard::{self, key::Named};
    let mut f = fixture();
    let app = &mut f.app;
    let key = |app: &mut App, named: Named| {
        let _ = app.update(Message::Event(iced::Event::Keyboard(
            keyboard::Event::KeyPressed {
                key: keyboard::Key::Named(named),
                modified_key: keyboard::Key::Named(named),
                physical_key: keyboard::key::Physical::Unidentified(
                    keyboard::key::NativeCode::Unidentified,
                ),
                location: keyboard::Location::Standard,
                modifiers: keyboard::Modifiers::default(),
                text: None,
                repeat: false,
            },
        )));
    };
    let _ = app.update(Message::SettingsTab(SettingsTab::BibleTranslations));
    // In place: the list and "+ Add Bible", no catalog.
    let mut ui = simulator(app);
    assert!(ui.find("Your Bibles").is_ok());
    assert!(ui.find("+ Add Bible").is_ok());
    assert!(ui.find("Search by name or abbreviation").is_err());
    drop(ui);
    // The full-screen button opens the list over the whole window, header included.
    let _ = app.update(Message::Tools(ToolsMsg::BiblesView(BiblesView::List)));
    let mut ui = simulator(app);
    let done = ui.find("Done").expect("Done").bounds();
    assert!(
        done.y < 64.0 && done.x > 640.0 && done.x < 640.0 + 288.0 + 40.0,
        "{done:?}"
    );
    assert!(ui.find("‹ Back").is_err(), "the list has no Back");
    drop(ui);
    // The page underneath takes no clicks.
    let messages = click_id(app, "settings-tab-reading");
    assert!(
        !messages
            .iter()
            .any(|m| matches!(m, Message::SettingsTab(_))),
        "{messages:?}"
    );
    // Modal: the page's keys do nothing while it is open; Escape closes it.
    key(app, Named::ArrowRight);
    assert_eq!(app.settings_tab, SettingsTab::BibleTranslations);
    key(app, Named::Escape);
    assert_eq!(app.tools.bibles_dialog, None);
    // "+ Add Bible" opens the catalog in it, with Back, its title and Done.
    let _ = click(app, "+ Add Bible");
    assert_eq!(app.tools.bibles_dialog, Some(BiblesView::Add));
    app.tools.catalog = Some(Load::Ready(vec![]));
    let mut ui = simulator(app);
    assert!(ui.find("Add a Bible").is_ok());
    assert!(ui.find("‹ Back").is_ok());
    assert!(ui.find("Search by name or abbreviation").is_ok());
    drop(ui);
    // The language chooser: Escape steps back to the catalog, then closes; Back goes to the list; Done closes.
    let _ = click(app, "Change ›");
    assert!(app.tools.choosing_language);
    assert!(simulator(app).find("Choose a language").is_ok());
    key(app, Named::Escape);
    assert!(!app.tools.choosing_language);
    assert_eq!(app.tools.bibles_dialog, Some(BiblesView::Add));
    let _ = click(app, "‹ Back");
    assert_eq!(app.tools.bibles_dialog, Some(BiblesView::List));
    let _ = click(app, "Done");
    assert_eq!(app.tools.bibles_dialog, None);
    let _ = app.update(Message::Tools(ToolsMsg::BiblesView(BiblesView::Add)));
    key(app, Named::Escape);
    assert_eq!(app.tools.bibles_dialog, None);
    assert_eq!(app.screen, Screen::Settings);
}

#[test]
fn settings_has_the_websites_six_tabs_in_the_header_and_follows_the_keyboard() {
    use crate::settings_ui::SettingsTab;
    use iced::keyboard::{self, key::Named};
    let mut f = fixture();
    let app = &mut f.app;
    let _ = app.update(Message::SetScreen(Screen::Settings));
    assert_eq!(app.settings_tab, SettingsTab::Account);
    let mut ui = simulator(app);
    // From 900px the pill sits at the header's right, beside the navigation (one header row, 48px tall).
    let tabs = bounds(&mut ui, "settings-tabs");
    assert_eq!((tabs.y, tabs.height), (16.0, 48.0));
    assert!((tabs.x + tabs.width - 1230.0).abs() < 1.0, "{tabs:?}");
    // Only the open section is named; the others are icons.
    assert!(ui.find("Account").is_ok());
    assert!(ui.find("Release notes").is_err());
    for tab in [
        "account",
        "reading",
        "bible-translations",
        "study-tools",
        "release-notes",
        "feedback",
    ] {
        let id: &'static str = Box::leak(format!("settings-tab-{tab}").into_boxed_str());
        assert!(ui.find(selector::id(id)).is_ok(), "{id}");
    }
    drop(ui);
    // A tab opens its section.
    let _ = click_id(app, "settings-tab-study-tools");
    assert_eq!(app.settings_tab, SettingsTab::StudyTools);
    let mut ui = simulator(app);
    assert!(ui.find("Quick marks").is_ok());
    assert!(
        ui.find("The marks at the top of the selection menu when you choose verses.")
            .is_ok()
    );
    drop(ui);
    // Left and Right step and wrap, Home and End go to the ends.
    let key = |app: &mut App, named: Named| {
        let _ = app.update(Message::Event(iced::Event::Keyboard(
            keyboard::Event::KeyPressed {
                key: keyboard::Key::Named(named),
                modified_key: keyboard::Key::Named(named),
                physical_key: keyboard::key::Physical::Unidentified(
                    keyboard::key::NativeCode::Unidentified,
                ),
                location: keyboard::Location::Standard,
                modifiers: keyboard::Modifiers::default(),
                text: None,
                repeat: false,
            },
        )));
    };
    key(app, Named::ArrowRight);
    assert_eq!(app.settings_tab, SettingsTab::ReleaseNotes);
    key(app, Named::End);
    assert_eq!(app.settings_tab, SettingsTab::Feedback);
    key(app, Named::ArrowRight);
    assert_eq!(app.settings_tab, SettingsTab::Account);
    key(app, Named::ArrowLeft);
    assert_eq!(app.settings_tab, SettingsTab::Feedback);
    key(app, Named::Home);
    assert_eq!(app.settings_tab, SettingsTab::Account);
    // Each section has the website's heading.
    for (tab, title) in [
        (SettingsTab::Reading, "Reading & appearance"),
        (SettingsTab::BibleTranslations, "Bible translations"),
        (SettingsTab::ReleaseNotes, "Release notes"),
        (SettingsTab::Feedback, "Send feedback"),
    ] {
        let _ = app.update(Message::SettingsTab(tab));
        let mut ui = simulator(app);
        assert!(ui.find(title).is_ok(), "{title}");
    }
    // Simple mode keeps the pill at the top of the page instead.
    let _ = app.update(Message::ToggleFocus);
    let mut ui = simulator(app);
    let tabs = bounds(&mut ui, "settings-tabs");
    assert!(tabs.y > 64.0, "{tabs:?}");
    assert!(tabs.width <= 480.0);
    drop(ui);
    // Leaving and coming back opens Account again, as `/account` does.
    let _ = app.update(Message::SetScreen(Screen::Journal));
    let _ = app.update(Message::SetScreen(Screen::Settings));
    assert_eq!(app.settings_tab, SettingsTab::Account);
}

#[test]
fn settings_tabs_move_like_the_websites_over_280ms_and_then_stop() {
    use crate::settings_ui::{SettingsTab, page_tab_widths};
    use std::time::Duration;
    // `flex: 1 1 0` with the open tab's `flex-grow: 3`, and minimum widths taking their share first.
    let w = page_tab_widths(450.0, [3.0, 1.0, 1.0, 1.0, 1.0, 1.0], [44.0; 6]);
    assert!(
        (w[0] - 168.75).abs() < 0.01 && (w[1] - 56.25).abs() < 0.01,
        "{w:?}"
    );
    let w = page_tab_widths(
        450.0,
        [3.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        [200.0, 44.0, 44.0, 44.0, 44.0, 44.0],
    );
    assert!(
        (w[0] - 200.0).abs() < 0.01 && (w[5] - 50.0).abs() < 0.01,
        "{w:?}"
    );

    let mut f = fixture();
    let app = &mut f.app;
    app.motion.animate = true;
    let _ = app.update(Message::SetScreen(Screen::Settings));
    // Arriving shows the open tab at once.
    assert!(!app.settings_motion.is_animating(app.now));
    let width = |app: &App, id: &'static str| bounds(&mut simulator(app), id).width;
    let account_open = width(app, "settings-tab-account");
    let reading_closed = width(app, "settings-tab-reading");
    let _ = click_id(app, "settings-tab-reading");
    let t0 = app.now;
    assert!(
        app.settings_motion.is_animating(t0),
        "frames run while it moves"
    );
    // At the start nothing has moved yet; part way through both tabs are between their sizes.
    assert!((width(app, "settings-tab-reading") - reading_closed).abs() < 0.5);
    let _ = app.update(Message::Frame(t0 + Duration::from_millis(100)));
    let (reading, account) = (
        width(app, "settings-tab-reading"),
        width(app, "settings-tab-account"),
    );
    assert!(reading > reading_closed + 4.0, "{reading}");
    assert!(
        account < account_open - 1.0 && account > reading_closed,
        "{account}"
    );
    // Settled after 280ms: the open tab named, the other an icon, and no more frames.
    let _ = app.update(Message::Frame(t0 + Duration::from_millis(300)));
    assert!(!app.settings_motion.is_animating(app.now));
    assert!((width(app, "settings-tab-account") - reading_closed).abs() < 0.5);
    let reading_open = width(app, "settings-tab-reading");
    assert!(reading_open > reading + 1.0);
    let mut ui = simulator(app);
    assert!(ui.find("Reading").is_ok());
    assert!(ui.find("Account").is_err());
    drop(ui);
    // The keyboard moves them the same way.
    let _ = app.update(Message::Event(iced::Event::Keyboard(
        iced::keyboard::Event::KeyPressed {
            key: iced::keyboard::Key::Named(iced::keyboard::key::Named::ArrowRight),
            modified_key: iced::keyboard::Key::Named(iced::keyboard::key::Named::ArrowRight),
            physical_key: iced::keyboard::key::Physical::Unidentified(
                iced::keyboard::key::NativeCode::Unidentified,
            ),
            location: iced::keyboard::Location::Standard,
            modifiers: iced::keyboard::Modifiers::default(),
            text: None,
            repeat: false,
        },
    )));
    assert_eq!(app.settings_tab, SettingsTab::BibleTranslations);
    assert!(app.settings_motion.is_animating(app.now));
    let t1 = app.now;
    let _ = app.update(Message::Frame(t1 + Duration::from_millis(300)));

    // Simple mode: the page pill's open tab grows from an equal share to three.
    let _ = app.update(Message::ToggleFocus);
    let share = width(app, "settings-tab-account");
    let _ = app.update(Message::SettingsTab(SettingsTab::Account));
    let t2 = app.now;
    assert!((width(app, "settings-tab-account") - share).abs() < 0.5);
    let _ = app.update(Message::Frame(t2 + Duration::from_millis(140)));
    let middle = width(app, "settings-tab-account");
    let _ = app.update(Message::Frame(t2 + Duration::from_millis(300)));
    let end = width(app, "settings-tab-account");
    assert!(share < middle && middle < end, "{share} {middle} {end}");

    // Reduced motion: no transition at all.
    app.motion.animate = false;
    let _ = app.update(Message::SettingsTab(SettingsTab::Feedback));
    assert!(!app.settings_motion.is_animating(app.now));
}

#[test]
fn a_dragged_selection_follows_the_page_as_it_scrolls_under_a_still_pointer() {
    use crate::select_text::Phase;
    use crate::text_selection::Area;
    let mut f = fixture();
    let app = &mut f.app;
    // A drag started in the first verse.
    let _ = app.update(Message::Pick(
        Area::Reader,
        0,
        3,
        Phase::Press { clicks: 1 },
    ));
    let _ = app.update(Message::Pick(Area::Reader, 0, 8, Phase::Drag));
    assert!(app.drag.as_ref().is_some_and(|d| d.dragging));
    let mut ui = simulator(app);
    let pointer = iced::Point::new(640.0, 520.0);
    ui.point_at(pointer);
    // The page scrolls (as the edge scroll does each frame) while the pointer stays put; the next frame picks the
    // words now under it, in a verse further on.
    let _ = ui.simulate([iced::Event::Mouse(iced::mouse::Event::WheelScrolled {
        delta: iced::mouse::ScrollDelta::Pixels { x: 0.0, y: -900.0 },
    })]);
    let _ = ui.simulate([iced::Event::Window(iced::window::Event::RedrawRequested(
        std::time::Instant::now(),
    ))]);
    let blocks: Vec<usize> = ui
        .into_messages()
        .filter_map(|m| match m {
            Message::Pick(Area::Reader, block, _, Phase::Drag) => Some(block),
            _ => None,
        })
        .collect();
    assert!(blocks.last().is_some_and(|b| *b > 3), "{blocks:?}");
}
