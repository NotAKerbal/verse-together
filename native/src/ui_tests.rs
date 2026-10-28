// Renders the real view headlessly (Iced's own test simulator, Tiny Skia) to check layout and clicks against the
// website's measured geometry.
use crate::store::Location;
use crate::{App, Message, Popover, Screen, design};
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
        let _ = std::fs::remove_file(&path);
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
    app.results =
        crate::store::Store::search(&app.store.as_ref().unwrap().scripture_path, "faith", None)
            .unwrap();
    app.searching = false;
    shot(app, "search");
    let _ = app.update(Message::ClosePopover);
    let _ = app.update(Message::SelectVerse(21));
    let _ = app.update(Message::Highlight);
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
}
