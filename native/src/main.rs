#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
mod account;
mod account_ui;
mod anim;
mod bible_catalog;
mod cloud;
mod design;
mod faith;
mod feedback;
mod guide_marks;
mod guide_text;
mod header;
#[allow(dead_code)]
mod icons;
mod journal;
mod journal_ui;
mod jst;
mod jst_text;
mod jump;
mod lesson_page;
mod lessons;
mod lessons_ui;
mod library_ui;
mod margin;
mod mark_layer;
mod marks;
mod md_editor;
mod md_live;
mod note_links;
#[cfg(test)]
mod parity_tests;
mod plan_model;
mod plans;
mod popup;
mod reader_tools;
mod reader_tools_ui;
mod release_notes;
mod reveal;
mod select_text;
mod settings_ui;
mod store;
mod sync;
mod text_selection;
mod ticker;
#[cfg(test)]
mod ui_tests;
mod view;
mod view_marks;

use design::{Colors, SANS};
use iced::widget::{operation, scrollable, text_editor};
use iced::{Event, Size, Subscription, Task, Theme, keyboard, window};
use marks::{MarkColor, MarkKind, MarkPreset, MarksPatch, TextRange};
use std::collections::{BTreeSet, HashMap};
use std::{path::PathBuf, time::Instant};
use store::{
    Annotation, Book, Location, NoteSource, Preferences, SearchResults, Store, TextWidth, Verse,
};

fn main() -> iced::Result {
    if std::env::args().any(|a| a == "--version") {
        println!("Verse Together Native {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    if std::env::args().any(|a| a == "--help") {
        println!(
            "Verse Together Native\n\n--data-dir PATH  Use a separate local study directory\n--no-account     Turn account sign-in and sync off for this run (QA and testing)\n--benchmark      Measure local data reads and searches without opening a window\n--version        Print version"
        );
        return Ok(());
    }
    if std::env::args().any(|a| a == "--benchmark") {
        benchmark();
        return Ok(());
    }
    iced::application(App::new, App::update, App::view)
        .title(|a: &App| {
            if a.content_hidden() {
                "Content hidden — Verse Together".to_string()
            } else {
                format!("{} — Verse Together", a.reference())
            }
        })
        .theme(App::theme)
        .subscription(App::subscription)
        .font(design::DM_SANS)
        .font(design::PAGELLA)
        .font(design::PAGELLA_ITALIC)
        .default_font(SANS)
        .window(window::Settings {
            platform_specific: platform_settings(),
            size: Size::new(1440., 960.),
            min_size: Some(Size::new(920., 640.)),
            exit_on_close_request: false,
            icon: app_icon(),
            ..Default::default()
        })
        .run()
}
fn app_icon() -> Option<window::Icon> {
    let image = image::load_from_memory(include_bytes!(
        "../../public/brand/icons/light/icon-192.png"
    ))
    .ok()?
    .to_rgba8();
    let (width, height) = image.dimensions();
    window::icon::from_rgba(image.into_raw(), width, height).ok()
}
fn platform_settings() -> window::settings::PlatformSpecific {
    let mut settings = window::settings::PlatformSpecific::default();
    #[cfg(target_os = "linux")]
    {
        settings.application_id = "app.versetogether.native".into();
    }
    settings
}
fn data_dir() -> PathBuf {
    let args = std::env::args().collect::<Vec<_>>();
    args.windows(2)
        .find(|pair| pair[0] == "--data-dir")
        .map(|pair| PathBuf::from(&pair[1]))
        .or_else(|| {
            directories::ProjectDirs::from("app", "VerseTogether", "VerseTogetherNative")
                .map(|p| p.data_dir().to_path_buf())
        })
        .unwrap_or_else(|| PathBuf::from("verse-together-data"))
}
#[derive(Debug, Clone, Copy, PartialEq)]
enum Screen {
    Reader,
    /// The website's `/browse` Library: its card grid, a volume's books, a book's chapters.
    Library,
    Journal,
    Guides,
    /// The website's `/account` Settings.
    Settings,
    /// The website's `/sign-in`.
    SignIn,
    /// The website's `/plans`.
    Plans,
}
/// A verse a mark is put on: where it is, the words (or the whole verse), its text and what it has now.
pub(crate) struct MarkTarget {
    pub location: Location,
    pub verse: u32,
    pub range: Option<TextRange>,
    pub text: String,
    pub annotation: Option<Annotation>,
}
impl MarkTarget {
    fn marks(&self) -> marks::VerseMarks {
        self.annotation
            .as_ref()
            .map(|a| a.marks.clone())
            .unwrap_or_default()
    }
}
/// Panels opened from the header. Only one is open at a time, as on the website.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Popover {
    Search,
    /// Books of a volume (the volume crumb), or a chosen book's chapters.
    Library,
    /// The current book's chapters (the chapter crumb).
    Chapters,
    ReaderSettings,
    /// The account menu under the avatar in the navigation (signed in).
    AppSettings,
    /// A lesson's contents.
    Contents,
    /// A lesson's log.
    LessonLog,
}
#[derive(Debug, Clone)]
enum Message {
    Event(Event),
    Frame(Instant),
    Navigate(Location, Option<u32>),
    Adjacent(i32),
    ToggleNav,
    TogglePopover(Popover),
    ClosePopover,
    LibraryVolume(String),
    LibraryBook(Option<String>),
    SelectVerse(u32),
    /// A press, drag or release in selectable text: its area, paragraph and byte offset.
    Pick(text_selection::Area, usize, usize, select_text::Phase),
    /// The pointer came up anywhere: a drag selection ends.
    EndDrag,
    /// Where the pointer is (its y in the window) while a selection is dragged.
    DragAt(f32),
    ClearSelection,
    ToggleLog,
    Copy,
    /// Toggle a quick mark on the selected verses (`false`) or the selected words (`true`).
    QuickMark(usize, bool),
    /// Set or remove one kind of mark on the selected verses or words.
    Mark(MarkKind, Option<MarkColor>, bool),
    ToggleStyles,
    StyleKind(MarkKind),
    CustomColor(String),
    /// Keep the chosen style as a quick mark.
    AddPreset(MarkPreset),
    PresetRemove(usize),
    PresetUp(usize),
    PresetName(usize, String),
    ResetPresets,
    ClearWords,
    /// Start a journal note quoting the selected words, linked to their verse.
    QuoteInJournal,
    CopySelectedWords,
    Bookmark,
    EditNote(text_editor::Action),
    SaveNote,
    Autosave,
    OpenSearch,
    SearchInput(String),
    SubmitSearch,
    SearchDone(u64, Result<SearchResults, String>),
    SearchScope(Option<String>),
    SetScreen(Screen),
    SetDark(bool),
    ToggleFocus,
    FontSize(f32),
    SetSerif(bool),
    SetTextWidth(TextWidth),
    SetSideBySide(bool),
    MarkRead,
    Lesson(lessons_ui::LessonMsg),
    JumpTo(Option<u32>),
    OpenLink(String),
    /// A link Ctrl- or ⌘-clicked in a journal note (one `safe_note_url` allows): a page of the website, or an
    /// http(s)/mailto address.
    NoteLink(String),
    DismissError,
    Retry,
    Journal(journal_ui::JournalMsg),
    Account(account::AccountMsg),
    Tools(reader_tools::ToolsMsg),
    Guide(guide_marks::GuideMsg),
    Plans(plans::PlansMsg),
    Library(library_ui::LibraryMsg),
    /// Start a journal note quoting the selected verses.
    VersesInJournal,
    /// Copy the website's share link for the selected verses (`/share/...`, its "Focus scripture" page).
    CopyShareLink,
    /// Open a Settings section (`/account#reading`).
    SettingsTab(settings_ui::SettingsTab),
    /// Settings → Reading's faith tradition.
    SetFaith(&'static str),
    /// Scripture appearance's Reset (`getDefaultAppearance`).
    ResetAppearance,
    Feedback(feedback::FeedbackMsg),
    Release(release_notes::ReleaseMsg),
    /// The reader's links to journal notes beside verses.
    NoteLinks(note_links::NoteLinkMsg),
    /// A programmatic scroll or focus finished. Iced applies widget operations without redrawing, so this
    /// (otherwise empty) message makes the window present the new position at once instead of at the next input.
    Presented,
}
/// Runs a scroll or focus operation, then redraws (see `Message::Presented`).
pub(crate) fn presented(task: Task<Message>) -> Task<Message> {
    task.chain(Task::done(Message::Presented))
}
struct App {
    store: Option<Store>,
    error: Option<String>,
    preferences: Preferences,
    books: Vec<Book>,
    verses: Vec<Verse>,
    /// Each verse's indent, which the inline verse number sits in, before its text.
    verse_prefix: Vec<String>,
    annotations: Vec<Annotation>,
    /// Words selected in the reader, verse by verse: each verse's index and the UTF-16 range of its text.
    word_selection: Vec<(usize, TextRange)>,
    /// A text selection being made or made, in the reader, a lesson's chapters or a guide.
    drag: Option<text_selection::Drag>,
    /// While a selection is dragged past the window's top or bottom edge: how far the page scrolls each frame.
    edge_scroll: f32,
    styles_open: bool,
    style_kind: MarkKind,
    custom_color: String,
    screen: Screen,
    selected: BTreeSet<u32>,
    anchor: Option<u32>,
    note: text_editor::Content,
    note_dirty: bool,
    autosave_failed: bool,
    copied: bool,
    copied_link: bool,
    log_open: bool,
    modifiers: keyboard::Modifiers,
    popover: Option<Popover>,
    library_volume: String,
    library_book: Option<String>,
    query: String,
    results: SearchResults,
    search_generation: u64,
    searching: bool,
    submit_search_when_ready: bool,
    scope: Option<String>,
    journal: journal_ui::JournalState,
    focus: bool,
    window_width: f32,
    window_height: f32,
    read: bool,
    lessons: lessons_ui::LessonsState,
    account: account::AccountState,
    tools: reader_tools::ToolsState,
    plans: plans::PlansState,
    /// The Library page shown, the card under the pointer, and whether browsing was last left in the reader.
    library: library_ui::LibraryPage,
    library_hover: Option<String>,
    library_read: Vec<u32>,
    browse_in_reader: bool,
    /// The verse a navigation jumped to, and when: extras that load just after (other Bibles, JST) re-anchor it.
    jumped: Option<(u32, Instant)>,
    /// The clock the header's transitions are drawn at; advanced by window frames only while one runs.
    now: Instant,
    motion: header::Motion,
    label_widths: [f32; 3],
    /// The open Settings section, the feedback form, the release notes' images, and the chapter's note links.
    settings_tab: settings_ui::SettingsTab,
    settings_motion: settings_ui::TabMotion,
    feedback: feedback::FeedbackUi,
    release: release_notes::ReleaseState,
    note_links: note_links::NoteLinks,
}
impl App {
    fn new() -> (Self, Task<Message>) {
        let mut app = Self::from_directory(&data_dir());
        let restore = app.restore_account();
        let tools = app.load_chapter_tools();
        (app, Task::batch([restore, tools]))
    }
    fn from_directory(directory: &std::path::Path) -> Self {
        design::load_fonts();
        let result = Store::open(directory);
        let (store, error) = match result {
            Ok(s) => (Some(s), None),
            Err(e) => (None, Some(format!("Could not open local study data: {e}"))),
        };
        let mut preferences = Preferences::default();
        let mut books = Vec::new();
        let mut issue = error;
        if let Some(s) = &store {
            match s.preferences() {
                Ok(p) => preferences = p.migrate(),
                Err(e) => issue = Some(e),
            }
            match s.books() {
                Ok(b) => books = b,
                Err(e) => issue = Some(e),
            }
        }
        if !books.iter().any(|b| {
            b.volume == preferences.last.volume
                && b.id == preferences.last.book
                && preferences.last.chapter >= 1
                && preferences.last.chapter <= b.chapters
        }) {
            preferences.last = Location::default();
        }
        let library_volume = preferences.last.volume.clone();
        let lessons = lessons_ui::LessonsState {
            weeks: lessons::weeks(&books),
            ..Default::default()
        };
        let now = Instant::now();
        let label_widths = header::measure_labels();
        let mut app = Self {
            store,
            error: issue,
            preferences,
            books,
            verses: vec![],
            verse_prefix: vec![],
            annotations: vec![],
            word_selection: vec![],
            drag: None,
            edge_scroll: 0.0,
            styles_open: false,
            style_kind: MarkKind::Highlight,
            custom_color: String::new(),
            screen: Screen::Reader,
            selected: BTreeSet::new(),
            anchor: None,
            note: text_editor::Content::new(),
            note_dirty: false,
            autosave_failed: false,
            copied: false,
            copied_link: false,
            log_open: false,
            modifiers: keyboard::Modifiers::default(),
            popover: None,
            library_volume,
            library_book: None,
            query: String::new(),
            results: SearchResults::default(),
            search_generation: 0,
            searching: false,
            submit_search_when_ready: false,
            scope: None,
            journal: journal_ui::JournalState::new(now),
            focus: false,
            window_width: 1440.,
            window_height: 960.,
            read: false,
            lessons,
            account: account::AccountState::new(directory),
            tools: reader_tools::ToolsState::new(),
            plans: plans::PlansState::default(),
            library: library_ui::LibraryPage::Home,
            library_hover: None,
            library_read: vec![],
            browse_in_reader: true,
            jumped: None,
            now,
            motion: header::Motion::new(0, label_widths, !anim::reduced_motion(), now),
            label_widths,
            settings_tab: settings_ui::SettingsTab::default(),
            settings_motion: settings_ui::TabMotion::new(settings_ui::SettingsTab::default(), now),
            feedback: Default::default(),
            release: Default::default(),
            note_links: Default::default(),
        };
        app.load_chapter();
        app
    }
    fn p(&self) -> Colors {
        Colors::new(self.preferences.dark)
    }
    /// `useFaithTradition().showLdsContent`: Latter-day Saint content shows for that tradition only.
    pub(crate) fn show_lds(&self) -> bool {
        self.preferences.faith_tradition == faith::LATTER_DAY_SAINT
    }
    fn reference(&self) -> String {
        let label = self
            .book()
            .map(|b| b.label.as_str())
            .unwrap_or("Scriptures");
        format!("{label} {}", self.preferences.last.chapter)
    }
    fn book(&self) -> Option<&Book> {
        self.books.iter().find(|b| {
            b.volume == self.preferences.last.volume && b.id == self.preferences.last.book
        })
    }
    fn theme(&self) -> Theme {
        let p = self.p();
        Theme::custom(
            "Verse Together",
            iced::theme::Palette {
                background: p.paper,
                text: p.ink,
                primary: p.accent,
                success: p.read,
                warning: p.gold,
                danger: p.accent,
            },
        )
    }
    fn subscription(&self) -> Subscription<Message> {
        let events = iced::event::listen_with(|event, status, _| {
            let relevant = match &event {
                Event::Window(
                    window::Event::CloseRequested
                    | window::Event::Resized(_)
                    | window::Event::Opened { .. },
                ) => true,
                Event::Keyboard(keyboard::Event::ModifiersChanged(_)) => true,
                Event::Keyboard(keyboard::Event::KeyPressed { key, modifiers, .. }) => {
                    match key.as_ref() {
                        keyboard::Key::Character("k" | "s" | "j") => modifiers.command(),
                        keyboard::Key::Character("c") => {
                            modifiers.command() && status == iced::event::Status::Ignored
                        }
                        keyboard::Key::Named(keyboard::key::Named::Escape) => true,
                        keyboard::Key::Named(
                            keyboard::key::Named::ArrowLeft | keyboard::key::Named::ArrowRight,
                        ) => modifiers.alt() || status == iced::event::Status::Ignored,
                        // Settings' tabs and the note picker; never while a field has the keyboard.
                        keyboard::Key::Named(
                            keyboard::key::Named::Home
                            | keyboard::key::Named::End
                            | keyboard::key::Named::ArrowUp
                            | keyboard::key::Named::ArrowDown,
                        ) => status == iced::event::Status::Ignored,
                        keyboard::Key::Named(keyboard::key::Named::Enter) => {
                            status == iced::event::Status::Ignored
                        }
                        _ => false,
                    }
                }
                _ => false,
            };
            relevant.then_some(Message::Event(event))
        });
        // Frames are requested only while a header transition runs; an idle window does no animation work.
        let account = self.account_subscription();
        let autosave = if self.has_unsaved_notes() {
            let delay = if self.autosave_failed { 10_000 } else { 750 };
            iced::time::every(std::time::Duration::from_millis(delay)).map(|_| Message::Autosave)
        } else {
            Subscription::none()
        };
        // While a selection is dragged, the button coming up anywhere (even outside the text) ends it.
        let dragging = self.drag.as_ref().is_some_and(|d| d.dragging);
        let drag = if dragging {
            iced::event::listen_with(|event, _, _| match event {
                Event::Mouse(iced::mouse::Event::ButtonReleased(iced::mouse::Button::Left)) => {
                    Some(Message::EndDrag)
                }
                Event::Mouse(iced::mouse::Event::CursorMoved { position }) => {
                    Some(Message::DragAt(position.y))
                }
                _ => None,
            })
        } else {
            Subscription::none()
        };
        // Past the window's edge, the page scrolls on each frame until the pointer comes back or the button is up.
        let edge = if dragging && self.edge_scroll != 0.0 {
            window::frames().map(Message::Frame)
        } else {
            Subscription::none()
        };
        let drag = Subscription::batch([drag, edge]);
        let events = Subscription::batch([events, drag]);
        if self.motion.is_animating(self.now)
            || self.journal.motion.is_animating(self.now)
            || self.settings_motion.is_animating(self.now)
        {
            Subscription::batch([
                events,
                account,
                autosave,
                window::frames().map(Message::Frame),
            ])
        } else {
            Subscription::batch([events, account, autosave])
        }
    }
    fn has_unsaved_notes(&self) -> bool {
        self.note_dirty || self.journal.open.as_ref().is_some_and(|note| note.dirty)
    }
    fn report<T>(&mut self, result: Result<T, String>) -> Option<T> {
        match result {
            Ok(x) => Some(x),
            Err(e) => {
                self.error = Some(e);
                None
            }
        }
    }
    fn persist(&mut self) {
        if let Some(s) = &self.store {
            let r = s.save_preferences(&self.preferences);
            self.report(r);
        }
    }
    fn reading_font(&self) -> iced::Font {
        if self.preferences.serif {
            design::serif()
        } else {
            SANS
        }
    }
    /// Builds each verse's selectable content. The leading indent is made of spaces as wide as the website's verse
    /// number slot (`min-width: 1.1rem` + `margin-right: 0.4rem`), so wrapped lines return to the left edge.
    fn build_verse_content(&mut self) {
        let mut prefixes: HashMap<usize, String> = HashMap::new();
        let font = self.reading_font();
        let size = self.preferences.font_size;
        self.verse_prefix = self
            .verses
            .iter()
            .map(|v| {
                let digits = v.number.to_string().len();
                prefixes
                    .entry(digits)
                    .or_insert_with(|| view::verse_indent(&v.number.to_string(), font, size))
                    .clone()
            })
            .collect();
        // Displayed offsets follow the indent, so a selection made before doesn't carry over.
        self.clear_text_selection(text_selection::Area::Reader);
    }
    fn load_chapter(&mut self) {
        if let Some(s) = &self.store {
            let verses = s.chapter(&self.preferences.last);
            let annotations = s.annotations(&self.preferences.last);
            let read = s.is_read(&self.preferences.last);
            if let Some(v) = self.report(verses) {
                self.verses = v;
                self.build_verse_content();
                self.apply_primary();
            }
            if let Some(a) = self.report(annotations) {
                self.annotations = a;
            }
            if let Some(r) = self.report(read) {
                self.read = r;
            }
        }
        self.refresh_note_links();
    }
    fn save_note(&mut self) -> bool {
        if !self.note_dirty {
            return true;
        }
        let Some(verse) = self.selected.first().copied() else {
            return true;
        };
        let mut a = self
            .annotations
            .iter()
            .find(|a| a.verse == verse)
            .cloned()
            .unwrap_or(Annotation {
                verse,
                ..Default::default()
            });
        a.note = self.note.text();
        if let Some(store) = &mut self.store {
            let result = store.save_annotation(&self.preferences.last, &a);
            if self.report(result).is_none() {
                return false;
            }
            self.note_dirty = false;
            self.load_annotations();
            self.sync_soon();
        }
        true
    }
    fn load_annotations(&mut self) {
        if let Some(s) = &self.store {
            let r = s.annotations(&self.preferences.last);
            if let Some(a) = self.report(r) {
                self.annotations = a;
            }
        }
    }
    fn load_note(&mut self) {
        let value = self
            .selected
            .first()
            .and_then(|v| self.annotations.iter().find(|a| a.verse == *v))
            .map(|a| a.note.as_str())
            .unwrap_or("");
        self.note = text_editor::Content::with_text(value);
        self.note_dirty = false;
        self.copied = false;
        self.copied_link = false;
    }
    fn navigate(&mut self, l: Location, verse: Option<u32>) -> Task<Message> {
        if !self.save_note() {
            return Task::none();
        }
        if !self.books.iter().any(|b| {
            b.volume == l.volume && b.id == l.book && l.chapter > 0 && l.chapter <= b.chapters
        }) {
            return Task::none();
        }
        self.preferences.last = l;
        self.jumped = verse.map(|v| (v, Instant::now()));
        self.library_volume = self.preferences.last.volume.clone();
        self.library_book = None;
        self.selected.clear();
        self.anchor = None;
        if let Some(v) = verse {
            self.selected.insert(v);
            self.anchor = Some(v);
        }
        self.popover = None;
        self.set_screen(Screen::Reader);
        self.load_chapter();
        self.load_note();
        self.persist();
        // Signed in, the chapter's marks are refreshed from the account.
        self.sync_soon();
        // The scroll operation uses rendered widget bounds, so verse jumps remain exact at every font size. It runs
        // on the next message, once the chapter (and the reader, when coming from another screen) is laid out.
        Task::batch([
            Task::done(Message::JumpTo(verse)),
            self.load_chapter_tools(),
        ])
    }
    /// The navigation link a screen belongs to, among those this faith tradition shows.
    pub(crate) fn nav_index(&self, screen: Screen) -> Option<usize> {
        header::screen_index(screen).filter(|i| *i < self.nav_count())
    }
    /// How many of the navigation's links show (`primaryNavItems` without Latter-day Saint pages when hidden).
    pub(crate) fn nav_count(&self) -> usize {
        if self.show_lds() { 3 } else { 2 }
    }
    /// Whether the page shown is Latter-day Saint content this faith tradition hides (`AppMain`'s notice).
    pub(crate) fn content_hidden(&self) -> bool {
        if self.show_lds() {
            return false;
        }
        match self.screen {
            Screen::Guides => true,
            Screen::Reader => faith::is_lds_volume(&self.preferences.last.volume),
            Screen::Library => match &self.library {
                library_ui::LibraryPage::Volume(v) | library_ui::LibraryPage::Book(v, _) => {
                    faith::is_lds_volume(v)
                }
                library_ui::LibraryPage::Home => false,
            },
            _ => false,
        }
    }
    fn set_screen(&mut self, screen: Screen) {
        if self.screen != screen {
            self.now = Instant::now();
            self.motion
                .set_active(self.nav_index(screen), self.label_widths, self.now);
        }
        self.screen = screen;
        match screen {
            Screen::Reader => {
                self.browse_in_reader = true;
                // Notes written in the journal meanwhile may link this chapter's verses now.
                self.refresh_note_links();
            }
            // As the website's `browse:last-location`: the Library's own landing page isn't remembered.
            Screen::Library if self.library != library_ui::LibraryPage::Home => {
                self.browse_in_reader = false
            }
            _ => {}
        }
    }
    fn begin_search(&mut self) -> Task<Message> {
        self.search_generation += 1;
        let generation = self.search_generation;
        self.submit_search_when_ready = false;
        self.results = SearchResults::default();
        if self.query.trim().is_empty() {
            self.searching = false;
            return Task::none();
        }
        let Some(store) = &self.store else {
            return Task::none();
        };
        let path = store.scripture_path.clone();
        let query = self.query.clone();
        let scope = self.scope.clone();
        let bible_only = !self.show_lds();
        self.searching = true;
        Task::perform(
            async move { Store::search(&path, &query, scope.as_deref(), bible_only) },
            move |r| Message::SearchDone(generation, r),
        )
    }
    fn selected_reference(&self) -> String {
        let mut parts = Vec::new();
        let mut numbers = self.selected.iter().copied().peekable();
        while let Some(start) = numbers.next() {
            let mut end = start;
            while numbers.peek() == Some(&(end + 1)) {
                end = numbers.next().unwrap();
            }
            parts.push(if start == end {
                start.to_string()
            } else {
                format!("{start}–{end}")
            });
        }
        format!("{}:{}", self.reference(), parts.join(", "))
    }
    fn selection_bookmarked(&self) -> bool {
        !self.selected.is_empty()
            && self.selected.iter().all(|v| {
                self.annotations
                    .iter()
                    .find(|a| a.verse == *v)
                    .is_some_and(|a| a.bookmarked)
            })
    }
    fn verse_text(&self, verse: u32) -> Option<&str> {
        self.verses
            .iter()
            .find(|v| v.number == verse)
            .map(|v| v.text.as_str())
    }
    /// What a mark applies to: the selected words, or each selected verse whole; in the reader's chapter, or on a
    /// lesson page in the week's chapters (a selection there may run across a chapter break).
    pub(crate) fn mark_targets(&self, words: bool) -> Vec<MarkTarget> {
        let target =
            |location: &Location, verse: u32, range, text: &str, list: &[Annotation]| MarkTarget {
                location: location.clone(),
                verse,
                range,
                text: text.to_string(),
                annotation: list.iter().find(|a| a.verse == verse).cloned(),
            };
        if self.screen == Screen::Guides {
            let Some(open) = &self.lessons.open else {
                return vec![];
            };
            let lesson = |c: usize, v: u32, range: Option<TextRange>| {
                let chapter = open.companion.chapters.get(c)?;
                let scripture = open.scripture.get(c)?;
                let verse = scripture.verses.iter().find(|x| x.number == v)?;
                Some(target(
                    &chapter.location,
                    v,
                    range,
                    &verse.text,
                    &scripture.annotations,
                ))
            };
            return if words {
                self.lessons
                    .words
                    .iter()
                    .filter_map(|(c, v, r)| lesson(*c, *v, Some(r.clone())))
                    .collect()
            } else {
                self.lessons
                    .selected
                    .iter()
                    .filter_map(|(c, v)| lesson(*c, *v, None))
                    .collect()
            };
        }
        let here = &self.preferences.last;
        if words {
            self.word_selection
                .iter()
                .filter_map(|(index, range)| {
                    let v = self.verses.get(*index)?;
                    Some(target(
                        here,
                        v.number,
                        Some(range.clone()),
                        &v.text,
                        &self.annotations,
                    ))
                })
                .collect()
        } else {
            self.selected
                .iter()
                .filter_map(|n| {
                    let text = self.verse_text(*n)?;
                    Some(target(here, *n, None, text, &self.annotations))
                })
                .collect()
        }
    }
    /// Whether every part of the target already has this mark in this color.
    pub(crate) fn mark_applied(&self, kind: MarkKind, color: &MarkColor, words: bool) -> bool {
        let targets = self.mark_targets(words);
        !targets.is_empty()
            && targets.iter().all(|t| {
                marks::colors_over(&t.marks(), &t.text, kind, t.range.as_ref())
                    .iter()
                    .all(|c| c.as_ref() == Some(color))
            })
    }
    /// Whether any part of the target has a mark of this kind.
    pub(crate) fn kind_applied(&self, kind: MarkKind, words: bool) -> bool {
        self.mark_targets(words).iter().any(|t| {
            marks::colors_over(&t.marks(), &t.text, kind, t.range.as_ref())
                .iter()
                .any(Option::is_some)
        })
    }
    fn apply_marks(&mut self, patch: MarksPatch, words: bool) {
        if !self.save_note() {
            return;
        }
        let mut by_chapter: Vec<(Location, Vec<Annotation>)> = vec![];
        for t in self.mark_targets(words) {
            if let Some(range) = &t.range
                && let Some(problem) = marks::range_problem(&t.text, range)
            {
                self.error = Some(problem.into());
                return;
            }
            let mut a = t.annotation.clone().unwrap_or(Annotation {
                verse: t.verse,
                ..Default::default()
            });
            a.marks = marks::apply(&a.marks, &patch, &t.text, t.range.as_ref());
            match by_chapter.iter_mut().find(|(l, _)| *l == t.location) {
                Some((_, list)) => list.push(a),
                None => by_chapter.push((t.location.clone(), vec![a])),
            }
        }
        if let Some(store) = &mut self.store {
            for (location, updates) in &by_chapter {
                let result = store.save_annotations(location, updates);
                if let Err(e) = result {
                    self.error = Some(e);
                    break;
                }
            }
        }
        self.load_annotations();
        if self.screen == Screen::Guides {
            self.reload_lesson_scripture();
        }
        self.sync_soon();
    }
    fn set_presets(&mut self, presets: Vec<MarkPreset>) {
        self.preferences.mark_presets = Some(marks::normalize_presets(presets));
        self.persist();
    }
    fn clear_words(&mut self) {
        self.clear_text_selection(text_selection::Area::Reader);
    }
    /// Opens the journal on today with a new note quoting scripture, linked to where it came from.
    fn write_in_journal(&mut self, source: NoteSource, quote: String) -> Task<Message> {
        self.set_screen(Screen::Journal);
        self.popover = None;
        let today = store::today();
        self.journal.month = journal::month_of(&today);
        self.journal.day = today.clone();
        self.reload_journal();
        self.start_note(&today, Some(source), &quote, None);
        presented(iced::widget::operation::focus("journal-title"))
    }
    /// The reader's Add to note (`onAddToNote`): each run of consecutive selected verses quoted under its own
    /// reference and verse link, its verses as separate paragraphs.
    fn reader_excerpt(&self, pieces: Vec<(u32, String)>) -> String {
        let label = self
            .book()
            .map(|b| b.label.clone())
            .unwrap_or_else(|| self.preferences.last.book.clone());
        journal::verse_passages(pieces)
            .into_iter()
            .map(|(a, b, text)| {
                let verses: Vec<u32> = (a..=b).collect();
                journal::scripture_block(&label, &self.preferences.last, &verses, &text)
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    }
    fn chapter_source(&self, verses: Option<(u32, u32)>) -> NoteSource {
        let label = self
            .book()
            .map(|b| b.label.clone())
            .unwrap_or_else(|| self.preferences.last.book.clone());
        NoteSource::scripture(&label, &self.preferences.last, verses)
    }
    /// `passageShareHref`: `/share/<volume slug>/<book>/<chapter>/<verses>` on the website.
    fn share_link(&self) -> String {
        let verses: Vec<u32> = self.selected.iter().copied().collect();
        let l = &self.preferences.last;
        format!(
            "{}/share/{}/{}/{}/{}",
            self.tools.site,
            store::volume_url_slug(&l.volume),
            l.book,
            l.chapter,
            journal::verse_spec(&verses)
                .replace('–', "-")
                .replace(' ', "")
        )
    }
    fn selected_passage(&self) -> String {
        let verses = self
            .verses
            .iter()
            .filter(|v| self.selected.contains(&v.number))
            .map(|v| format!("{} {}", v.number, v.text))
            .collect::<Vec<_>>()
            .join("\n\n");
        format!("{}\n\n{}", self.selected_reference(), verses)
    }
    /// The selected words wherever they are (reader, lesson or guide), for copying.
    fn selected_text(&self) -> Option<String> {
        let area = self.drag.as_ref().map(|d| d.area)?;
        let text = match area {
            text_selection::Area::Reader => self.reader_selected_text(),
            text_selection::Area::Lesson => self.lesson_selected_text(),
            text_selection::Area::Guide => self.guide_selected_text()?,
        };
        (!text.trim().is_empty()).then_some(text)
    }
    fn toggle_bookmark(&mut self) {
        if !self.save_note() {
            return;
        }
        let all = self.selection_bookmarked();
        let mut updates = Vec::new();
        for verse in self.selected.clone() {
            let mut a = self
                .annotations
                .iter()
                .find(|a| a.verse == verse)
                .cloned()
                .unwrap_or(Annotation {
                    verse,
                    ..Default::default()
                });
            a.bookmarked = !all;
            updates.push(a);
        }
        if let Some(store) = &mut self.store {
            let result = store.save_annotations(&self.preferences.last, &updates);
            if self.report(result).is_none() {
                return;
            }
        }
        self.load_annotations();
    }
    fn clear_selection(&mut self) -> bool {
        if !self.save_note() {
            return false;
        }
        self.selected.clear();
        self.anchor = None;
        self.load_note();
        true
    }
    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::Retry => {
                let (app, task) = Self::new();
                *self = app;
                return task;
            }
            Message::Account(message) => return self.update_account(message),
            Message::Tools(message) => return self.update_tools(message),
            Message::Guide(message) => return self.update_guide(message),
            Message::Plans(message) => return self.update_plans(message),
            Message::Library(message) => return self.update_library(message),
            Message::DismissError => self.error = None,
            Message::Presented => {}
            Message::Frame(now) => {
                self.now = now;
                if self.edge_scroll != 0.0
                    && let Some(d) = self.drag.as_ref().filter(|d| d.dragging)
                {
                    let id = match d.area {
                        text_selection::Area::Reader => "reader",
                        text_selection::Area::Lesson | text_selection::Area::Guide => "guide",
                    };
                    return operation::scroll_by(
                        id,
                        scrollable::AbsoluteOffset {
                            x: 0.0,
                            y: self.edge_scroll,
                        },
                    );
                }
            }
            Message::DragAt(y) => {
                // Further past the edge scrolls faster, up to 40px a frame (as the guide's editor scrolls).
                let past = if y < 0.0 {
                    y
                } else if y > self.window_height {
                    y - self.window_height
                } else {
                    0.0
                };
                self.edge_scroll = if self.drag.as_ref().is_some_and(|d| d.dragging) {
                    past.clamp(-40.0, 40.0)
                } else {
                    0.0
                };
            }
            Message::Navigate(l, v) => return self.navigate(l, v),
            Message::Adjacent(d) => {
                if let Some(l) = store::adjacent(&self.books, &self.preferences.last, d) {
                    return self.navigate(l, None);
                }
            }
            Message::ToggleNav => {
                self.now = Instant::now();
                let collapsed = !self.motion.collapsed;
                self.motion.set_collapsed(collapsed, self.now);
                if collapsed && self.popover == Some(Popover::AppSettings) {
                    self.popover = None;
                }
            }
            Message::TogglePopover(popover) => {
                if self.popover == Some(popover) {
                    self.popover = None;
                } else {
                    self.popover = Some(popover);
                    match popover {
                        Popover::Library => {
                            self.library_volume = self.preferences.last.volume.clone();
                            self.library_book = None;
                        }
                        Popover::Chapters => {
                            self.library_volume = self.preferences.last.volume.clone();
                            self.library_book = Some(self.preferences.last.book.clone());
                        }
                        Popover::Search => return presented(operation::focus("search")),
                        _ => {}
                    }
                }
            }
            Message::ClosePopover => self.popover = None,
            Message::LibraryVolume(v) => {
                self.library_volume = v;
                self.library_book = None;
                self.popover = Some(Popover::Library);
            }
            Message::LibraryBook(book) => {
                if let Some(id) = &book
                    && let Some(b) = self
                        .books
                        .iter()
                        .find(|b| b.volume == self.library_volume && &b.id == id)
                    && b.chapters == 1
                {
                    let l = Location {
                        volume: b.volume.clone(),
                        book: b.id.clone(),
                        chapter: 1,
                    };
                    return self.navigate(l, None);
                }
                self.popover = Some(Popover::Library);
                self.library_book = book;
            }
            Message::SelectVerse(v) => {
                if !self.save_note() {
                    return Task::none();
                }
                let was_empty = self.selected.is_empty();
                if self.modifiers.shift() {
                    let anchor = self.anchor.unwrap_or(v);
                    self.selected = (anchor.min(v)..=anchor.max(v)).collect();
                } else if self.modifiers.command() {
                    if !self.selected.remove(&v) {
                        self.selected.insert(v);
                    }
                    self.anchor = Some(v);
                } else if self.selected.len() == 1 && self.selected.contains(&v) {
                    self.selected.clear();
                    self.anchor = None;
                } else {
                    self.selected = BTreeSet::from([v]);
                    self.anchor = Some(v);
                }
                self.load_note();
                // Where opening or closing the study panel re-wraps the text, keep the chosen verse in view.
                if was_empty != self.selected.is_empty() && !self.log_open && self.panel_reflows() {
                    return presented(jump::to_verse(v));
                }
            }
            Message::Pick(area, block, at, phase) => {
                if matches!(phase, select_text::Phase::Press { .. }) {
                    self.edge_scroll = 0.0;
                }
                return self.pick(area, block, at, phase);
            }
            Message::EndDrag => {
                self.edge_scroll = 0.0;
                return self.end_drag();
            }
            Message::ClearWords => self.clear_words(),
            Message::QuoteInJournal => {
                let verses: Vec<u32> = self
                    .word_selection
                    .iter()
                    .filter_map(|(i, _)| Some(self.verses.get(*i)?.number))
                    .collect();
                let excerpt = self.reader_excerpt(self.reader_selected_pieces());
                if let (Some(first), Some(last)) = (verses.first(), verses.last())
                    && !excerpt.is_empty()
                    && self.save_note()
                {
                    let source = self.chapter_source(Some((*first, *last)));
                    self.clear_words();
                    return self.write_in_journal(source, format!("{excerpt}\n\n"));
                }
            }
            Message::VersesInJournal => {
                if let (Some(first), Some(last)) = (
                    self.selected.first().copied(),
                    self.selected.last().copied(),
                ) && self.save_note()
                {
                    let source = self.chapter_source(Some((first, last)));
                    let pieces = self
                        .verses
                        .iter()
                        .filter(|v| self.selected.contains(&v.number))
                        .map(|v| (v.number, v.text.clone()))
                        .collect::<Vec<_>>();
                    let excerpt = self.reader_excerpt(pieces);
                    return self.write_in_journal(source, format!("{excerpt}\n\n"));
                }
            }
            Message::Journal(message) => return self.update_journal(message),
            Message::CopySelectedWords => {
                if !self.word_selection.is_empty() {
                    return iced::clipboard::write(self.reader_selected_text());
                }
            }
            Message::QuickMark(i, words) => {
                if let Some(preset) = self.preferences.presets().get(i).cloned() {
                    let on = self.mark_applied(preset.kind, &preset.color, words);
                    self.apply_marks(
                        MarksPatch::set(preset.kind, (!on).then_some(preset.color)),
                        words,
                    );
                }
            }
            Message::Mark(kind, color, words) => {
                self.apply_marks(MarksPatch::set(kind, color), words);
            }
            Message::ToggleStyles => self.styles_open = !self.styles_open,
            Message::StyleKind(kind) => self.style_kind = kind,
            Message::CustomColor(value) => {
                self.custom_color = value.chars().filter(|c| *c != ' ').take(7).collect();
            }
            Message::AddPreset(preset) => {
                let mut presets = self.preferences.presets();
                if !presets.iter().any(|p| p.same_mark(&preset)) {
                    if presets.len() >= marks::PRESETS_MAX {
                        self.error = Some(format!(
                            "Choose up to {} quick marks. Remove one in Settings first.",
                            marks::PRESETS_MAX
                        ));
                        return Task::none();
                    }
                    presets.push(preset);
                    self.set_presets(presets);
                }
            }
            Message::PresetRemove(i) => {
                let mut presets = self.preferences.presets();
                if i < presets.len() {
                    presets.remove(i);
                    self.set_presets(presets);
                }
            }
            Message::PresetUp(i) => {
                let mut presets = self.preferences.presets();
                if i > 0 && i < presets.len() {
                    presets.swap(i - 1, i);
                    self.set_presets(presets);
                }
            }
            Message::PresetName(i, name) => {
                let mut presets = self.preferences.presets();
                if let Some(preset) = presets.get_mut(i) {
                    let name: String = name.chars().take(marks::PRESET_NAME_MAX).collect();
                    preset.name = (!name.trim().is_empty()).then_some(name);
                    // Stored as typed while editing; normalized when read back.
                    self.preferences.mark_presets = Some(presets);
                    self.persist();
                }
            }
            Message::ResetPresets => {
                self.preferences.mark_presets = None;
                self.persist();
            }
            Message::ClearSelection => {
                self.clear_selection();
            }
            Message::ToggleLog => {
                if self.log_open || !self.selected.is_empty() {
                    if self.clear_selection() {
                        self.log_open = false;
                    }
                } else {
                    self.log_open = true;
                }
            }
            Message::Copy => {
                if !self.selected.is_empty() {
                    self.copied = true;
                    return iced::clipboard::write(self.selected_passage());
                }
            }
            Message::Bookmark => self.toggle_bookmark(),
            Message::CopyShareLink => {
                if !self.selected.is_empty() {
                    self.copied_link = true;
                    return iced::clipboard::write(self.share_link());
                }
            }
            Message::Autosave => {
                // Persist drafts while the editor remains open. Failures keep the draft and its visible error;
                // retry slowly until saving works again. Idle windows have no autosave timer.
                let verse_saved = self.save_note();
                let journal_saved = self.save_journal_note();
                self.autosave_failed = !verse_saved || !journal_saved;
            }
            Message::EditNote(action) => {
                self.note_dirty |= action.is_edit();
                self.note.perform(action);
            }
            Message::SaveNote => {
                self.save_note();
            }
            Message::OpenSearch => {
                self.popover = Some(Popover::Search);
                return presented(operation::focus("search"));
            }
            Message::SearchInput(query) => {
                self.query = query;
                return self.begin_search();
            }
            Message::SubmitSearch => {
                if self.searching {
                    self.submit_search_when_ready = true;
                } else if let Some(hit) = self.results.hits.first() {
                    return self.navigate(hit.location.clone(), Some(hit.verse));
                }
            }
            Message::SearchDone(generation, result) => {
                if generation == self.search_generation {
                    self.searching = false;
                    let submit = std::mem::take(&mut self.submit_search_when_ready);
                    if let Some(r) = self.report(result) {
                        self.results = r;
                        if submit
                            && self.popover == Some(Popover::Search)
                            && let Some(hit) = self.results.hits.first()
                        {
                            return self.navigate(hit.location.clone(), Some(hit.verse));
                        }
                    }
                }
            }
            Message::SearchScope(scope) => {
                self.scope = scope;
                return self.begin_search();
            }
            Message::SetScreen(screen) => {
                if !self.save_note() || !self.save_journal_note() {
                    return Task::none();
                }
                let entering = self.screen != screen;
                self.set_screen(screen);
                self.focus = false;
                if self.popover != Some(Popover::AppSettings) {
                    self.popover = None;
                }
                if screen == Screen::Journal {
                    self.reload_journal();
                }
                if screen == Screen::Settings {
                    self.popover = None;
                    // `/account` without a section opens Account.
                    if entering {
                        // A page that opens shows its tab without a transition, as the website's does.
                        self.settings_tab = settings_ui::SettingsTab::Account;
                        self.settings_motion
                            .set(self.settings_tab, Instant::now(), false);
                    }
                    return self.update_account(account::AccountMsg::LoadDetails);
                }
                if screen == Screen::SignIn {
                    self.popover = None;
                }
                if screen == Screen::Plans {
                    self.popover = None;
                    return self.update_plans(plans::PlansMsg::Home);
                }
            }
            Message::SettingsTab(tab) => {
                let mut tasks = vec![];
                let entering = self.screen != Screen::Settings;
                if entering {
                    tasks.push(self.update(Message::SetScreen(Screen::Settings)));
                    if self.screen != Screen::Settings {
                        return Task::batch(tasks);
                    }
                }
                self.settings_tab = tab;
                // Switching sections animates the tabs (unless motion is reduced); arriving shows the tab at once.
                self.now = Instant::now();
                self.settings_motion
                    .set(tab, self.now, self.motion.animate && !entering);
                // A new section starts at its heading even when the previous one was long.
                tasks.push(presented(operation::scroll_to(
                    "account",
                    scrollable::AbsoluteOffset { x: 0.0, y: 0.0 },
                )));
                if tab == settings_ui::SettingsTab::ReleaseNotes {
                    tasks.push(self.load_release_thumbs());
                }
                return Task::batch(tasks);
            }
            Message::SetFaith(id) => {
                let id = faith::normalize_faith_tradition(id);
                if self.preferences.faith_tradition == id || !self.save_note() {
                    return Task::none();
                }
                self.preferences.faith_tradition = id.into();
                self.persist();
                // Only what shows changes; nothing hidden is removed from the study data.
                if !self.show_lds() {
                    self.selected.clear();
                    self.anchor = None;
                    self.clear_words();
                    if self.scope.as_deref().is_some_and(faith::is_lds_volume) {
                        self.scope = None;
                    }
                    if faith::is_lds_volume(&self.library_volume) {
                        self.library_volume = "oldtestament".into();
                        self.library_book = None;
                    }
                }
                self.now = Instant::now();
                self.motion
                    .set_active(self.nav_index(self.screen), self.label_widths, self.now);
                let search = if self.query.trim().is_empty() {
                    Task::none()
                } else {
                    self.begin_search()
                };
                return Task::batch([self.reload_reader_text(), search]);
            }
            Message::ResetAppearance => {
                self.preferences.font_size = store::DEFAULT_FONT_SIZE;
                self.preferences.serif = true;
                self.preferences.text_width = TextWidth::Comfortable;
                self.preferences.side_by_side = false;
                self.build_verse_content();
                self.persist();
            }
            Message::Feedback(m) => return self.update_feedback(m),
            Message::Release(m) => return self.update_release(m),
            Message::NoteLinks(m) => return self.update_note_links(m),
            Message::SetDark(dark) => {
                self.preferences.dark = dark;
                self.persist();
            }
            Message::ToggleFocus => {
                self.focus = !self.focus;
                self.popover = None;
            }
            Message::FontSize(size) => {
                let size = size.clamp(store::MIN_FONT_SIZE, store::MAX_FONT_SIZE);
                if size != self.preferences.font_size {
                    self.preferences.font_size = size;
                    self.build_verse_content();
                    self.persist();
                }
            }
            Message::SetSerif(serif) => {
                if serif != self.preferences.serif {
                    self.preferences.serif = serif;
                    self.build_verse_content();
                    self.persist();
                }
            }
            Message::SetTextWidth(width) => {
                self.preferences.text_width = width;
                self.persist();
            }
            Message::SetSideBySide(side_by_side) => {
                self.preferences.side_by_side = side_by_side;
                self.persist();
            }
            Message::MarkRead => {
                let source = self.chapter_source(None);
                if let Some(s) = &mut self.store {
                    let r = s.set_read(&self.preferences.last, &source, !self.read);
                    if self.report(r).is_some() {
                        self.read = !self.read;
                        // The chapter's mark is a reading in the log: the verses show it at once.
                        self.refresh_note_links();
                        self.sync_soon();
                    }
                }
            }
            Message::Lesson(message) => return self.update_lessons(message),
            Message::JumpTo(Some(v)) => return presented(jump::to_verse(v)),
            Message::JumpTo(None) => {
                return presented(operation::snap_to(
                    "reader",
                    scrollable::RelativeOffset::START,
                ));
            }
            Message::NoteLink(href) => {
                let Some(href) = md_live::safe_note_url(&href) else {
                    return Task::none();
                };
                if href.starts_with('/') {
                    // A page of the website: scripture and shared passages open here, other pages in the browser.
                    return self.update(Message::OpenLink(format!("{}{href}", self.tools.site)));
                }
                if href.to_ascii_lowercase().starts_with("mailto:")
                    && let Err(e) = webbrowser::open(&href)
                {
                    self.error = Some(e.to_string());
                    return Task::none();
                }
                return self.update(Message::OpenLink(href));
            }
            Message::OpenLink(url) => {
                if let Some((l, v)) = self.scripture_link(&url) {
                    return self.navigate(l, v);
                }
                // The website's own links open here: a shared passage with its verses selected, or a chapter.
                if let Some(path) = reader_tools::site_path(&url, &self.tools.site) {
                    if let Some((l, verses)) = reader_tools::share_href(path) {
                        let task = self.navigate(l.clone(), verses.first().copied());
                        if self.preferences.last == l {
                            // The chapter's own length (the default Bible's text may still be on its way).
                            let count = self
                                .store
                                .as_ref()
                                .and_then(|s| s.chapter(&l).ok())
                                .map_or(self.verses.len(), |v| v.len().max(self.verses.len()))
                                as u32;
                            self.selected = verses.into_iter().filter(|v| *v <= count).collect();
                            self.anchor = self.selected.first().copied();
                            self.load_note();
                        }
                        return task;
                    }
                    if let Some((l, v)) = reader_tools::app_scripture_href(path) {
                        return self.navigate(l, v);
                    }
                }
                if (url.starts_with("https://") || url.starts_with("http://"))
                    && let Err(e) = webbrowser::open(&url)
                {
                    self.error = Some(e.to_string());
                }
            }
            Message::Event(event) => match event {
                Event::Keyboard(keyboard::Event::ModifiersChanged(m)) => self.modifiers = m,
                Event::Keyboard(keyboard::Event::KeyPressed { key, modifiers, .. }) => {
                    self.modifiers = modifiers;
                    // The Your Bibles dialog is modal: the page behind takes no keys. Escape in the language chooser
                    // steps back to the catalog; otherwise it closes the dialog (reader settings stay open behind).
                    if self.tools.bibles_dialog.is_some() {
                        if matches!(key, keyboard::Key::Named(keyboard::key::Named::Escape)) {
                            return self.update_tools(if self.tools.choosing_language {
                                reader_tools::ToolsMsg::ChooseLanguage(false)
                            } else {
                                reader_tools::ToolsMsg::CloseBibles
                            });
                        }
                        return Task::none();
                    }
                    match key.as_ref() {
                        keyboard::Key::Character("k") if modifiers.command() => {
                            return self.update(Message::OpenSearch);
                        }
                        keyboard::Key::Character("s") if modifiers.command() => {
                            if self.screen == Screen::Journal {
                                self.save_journal_note();
                                return Task::none();
                            }
                            return self.update(Message::SaveNote);
                        }
                        keyboard::Key::Character("c") if modifiers.command() => {
                            // Selected words first (as the website copies a text selection), then whole verses.
                            if let Some(words) = self.selected_text() {
                                return iced::clipboard::write(words);
                            }
                            if !self.selected.is_empty() {
                                return self.update(Message::Copy);
                            }
                        }
                        keyboard::Key::Character("j") if modifiers.command() => {
                            return self.update(Message::SetScreen(Screen::Journal));
                        }
                        keyboard::Key::Named(keyboard::key::Named::Escape) => {
                            if self.release.viewing.is_some() {
                                self.release.viewing = None;
                            } else if self.note_links.picker.is_some()
                                || self.note_links.read_picker.is_some()
                            {
                                // As the website's marker dialog: Escape closes it (the marker keeps its place).
                                self.note_links.picker = None;
                                self.note_links.read_picker = None;
                            } else if self.popover.is_some() {
                                self.popover = None;
                            } else if self.screen == Screen::Journal && self.journal.open.is_some()
                            {
                                // As the browser's Back does on the website's journal: the note closes to its day.
                                return self.update_journal(journal_ui::JournalMsg::Close);
                            } else if self.screen == Screen::Guides
                                && self.lessons.guide.selection.is_some()
                            {
                                return self.update_guide(guide_marks::GuideMsg::Dismiss);
                            } else if self.focus {
                                self.focus = false;
                            } else if self.screen == Screen::Guides
                                && !self.lessons.words.is_empty()
                            {
                                self.clear_text_selection(text_selection::Area::Lesson);
                            } else if !self.word_selection.is_empty() {
                                self.clear_words();
                            } else if !self.selected.is_empty() {
                                return self.update(Message::ClearSelection);
                            } else {
                                self.log_open = false;
                            }
                        }
                        keyboard::Key::Named(keyboard::key::Named::ArrowRight)
                            if modifiers.alt() =>
                        {
                            return self.update(Message::Adjacent(1));
                        }
                        keyboard::Key::Named(keyboard::key::Named::ArrowLeft)
                            if modifiers.alt()
                                && self.screen == Screen::Journal
                                && self.journal.open.is_some() =>
                        {
                            return self.update_journal(journal_ui::JournalMsg::Close);
                        }
                        keyboard::Key::Named(keyboard::key::Named::ArrowLeft)
                            if modifiers.alt() =>
                        {
                            return self.update(Message::Adjacent(-1));
                        }
                        keyboard::Key::Named(
                            named @ (keyboard::key::Named::ArrowDown
                            | keyboard::key::Named::ArrowUp
                            | keyboard::key::Named::Enter),
                        ) if (self.note_links.picker.is_some()
                            || self.note_links.read_picker.is_some())
                            && modifiers.is_empty() =>
                        {
                            return self.update_note_links(match named {
                                keyboard::key::Named::ArrowDown => note_links::NoteLinkMsg::Step(1),
                                keyboard::key::Named::ArrowUp => note_links::NoteLinkMsg::Step(-1),
                                _ => note_links::NoteLinkMsg::Choose,
                            });
                        }
                        keyboard::Key::Named(
                            named @ (keyboard::key::Named::ArrowLeft
                            | keyboard::key::Named::ArrowRight
                            | keyboard::key::Named::Home
                            | keyboard::key::Named::End),
                        ) if self.screen == Screen::Settings
                            && self.release.viewing.is_none()
                            && modifiers.is_empty() =>
                        {
                            let key = match named {
                                keyboard::key::Named::ArrowLeft => "ArrowLeft",
                                keyboard::key::Named::ArrowRight => "ArrowRight",
                                keyboard::key::Named::Home => "Home",
                                _ => "End",
                            };
                            if let Some(tab) = settings_ui::tab_for_key(key, self.settings_tab) {
                                return self.update(Message::SettingsTab(tab));
                            }
                        }
                        _ => {}
                    }
                }
                Event::Window(window::Event::Resized(size))
                | Event::Window(window::Event::Opened { size, position: _ }) => {
                    self.window_width = size.width;
                    self.window_height = size.height;
                }
                Event::Window(window::Event::CloseRequested)
                    if self.save_note() && self.save_journal_note() =>
                {
                    self.persist();
                    return window::oldest().and_then(window::close);
                }
                _ => {}
            },
        }
        Task::none()
    }
    fn scripture_link(&self, url: &str) -> Option<(Location, Option<u32>)> {
        let path = url.split('?').next()?.split('#').next()?;
        let components = path.split('/').collect::<Vec<_>>();
        let i = components.iter().position(|s| *s == "scriptures")?;
        let volume = match *components.get(i + 1)? {
            "ot" => "oldtestament",
            "nt" => "newtestament",
            "bofm" => "bookofmormon",
            "dc-testament" => "doctrineandcovenants",
            "pgp" => "pearl",
            _ => return None,
        };
        let norm = |s: &str| {
            s.chars()
                .filter(|c| c.is_alphanumeric())
                .flat_map(char::to_lowercase)
                .collect::<String>()
        };
        let slug = norm(components.get(i + 2)?);
        let b = self.books.iter().find(|b| {
            b.volume == volume
                && ([b.id.as_str(), b.short_title.as_str(), b.label.as_str()]
                    .iter()
                    .any(|s| norm(s) == slug)
                    || b.volume == "doctrineandcovenants")
        })?;
        let chapter = components.get(i + 3)?.parse().ok()?;
        Some((
            Location {
                volume: volume.into(),
                book: b.id.clone(),
                chapter,
            },
            None,
        ))
    }
}

fn benchmark() {
    let started = Instant::now();
    let store = Store::open(&data_dir()).expect("open study data");
    let books = store.books().unwrap();
    println!(
        "Startup data initialization: {:.2} ms",
        started.elapsed().as_secs_f64() * 1000.
    );
    let started = Instant::now();
    for _ in 0..1000 {
        std::hint::black_box(store.chapter(&Location::default()).unwrap());
    }
    println!(
        "1,000 chapter reads: {:.2} ms",
        started.elapsed().as_secs_f64() * 1000.
    );
    let started = Instant::now();
    for _ in 0..100 {
        std::hint::black_box(
            Store::search(&store.scripture_path, "faith hope", None, false).unwrap(),
        );
    }
    println!(
        "100 full-text searches: {:.2} ms",
        started.elapsed().as_secs_f64() * 1000.
    );
    println!(
        "Bundled books: {}; chapters: {}",
        books.len(),
        books.iter().map(|b| b.chapters).sum::<u32>()
    );
}

#[cfg(test)]
mod interaction_tests {
    use super::*;
    use crate::select_text::Phase;
    use crate::text_selection::Area;
    use std::time::Duration;
    fn directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "verse-ui-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    fn app() -> (App, PathBuf) {
        let directory = directory();
        (App::from_directory(&directory), directory)
    }
    fn alma_32() -> Location {
        Location {
            volume: "bookofmormon".into(),
            book: "alma".into(),
            chapter: 32,
        }
    }
    #[test]
    fn the_readers_add_to_note_quotes_each_run_under_its_verse_link_like_the_website() {
        let (mut app, dir) = app();
        let _ = app.navigate(alma_32(), None);
        let text = |n: u32| {
            app.verses
                .iter()
                .find(|v| v.number == n)
                .unwrap()
                .text
                .clone()
        };
        let (v21, v22, v24) = (text(21), text(22), text(24));
        app.selected = BTreeSet::from([21, 22, 24]);
        let _ = app.update(Message::VersesInJournal);
        let open = app
            .journal
            .open
            .as_ref()
            .expect("a note opens with the passage");
        // The reading source stays context; the verse links in the body are what mark the verses on the website.
        assert_eq!(
            open.note.source.as_ref().unwrap().href,
            "/browse/bookofmormon/alma/32#v-21"
        );
        assert_eq!(
            open.body.text(),
            format!(
                "**[Alma 32:21–22](</browse/bookofmormon/alma/32#v-21>)**\n> {v21}\n>\n> {v22}\n\n**[Alma 32:24](</browse/bookofmormon/alma/32#v-24>)**\n> {v24}\n\n"
            )
        );
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn selecting_range_marks_every_verse_and_never_edits_scripture() {
        let (mut app, dir) = app();
        let original = app.verses[0].text.clone();
        // A drag over the words selects them and changes nothing in the text.
        drag(&mut app, Area::Reader, (0, 0), (0, 40));
        assert_eq!(app.verses[0].text, original);
        let _ = app.update(Message::ClearWords);
        let _ = app.update(Message::SelectVerse(2));
        app.modifiers = keyboard::Modifiers::SHIFT;
        let _ = app.update(Message::SelectVerse(5));
        assert_eq!(app.selected, BTreeSet::from([2, 3, 4, 5]));
        // The first default quick mark is the yellow highlight; a second press removes it.
        let _ = app.update(Message::QuickMark(0, false));
        let yellow = Some(MarkColor::Named("yellow"));
        assert_eq!(
            app.annotations
                .iter()
                .filter(|a| a.marks.highlight == yellow)
                .count(),
            4
        );
        let _ = app.update(Message::Bookmark);
        assert_eq!(app.annotations.iter().filter(|a| a.bookmarked).count(), 4);
        let _ = app.update(Message::QuickMark(0, false));
        assert!(
            app.annotations
                .iter()
                .all(|a| a.marks.highlight.is_none() && a.bookmarked)
        );
        // The rubric underline quick mark, then a custom color from the style picker.
        let _ = app.update(Message::QuickMark(5, false));
        assert!(app.mark_applied(MarkKind::Underline, &MarkColor::Named("red"), false));
        let custom = MarkColor::parse_input("A1B2C3").unwrap();
        let _ = app.update(Message::Mark(
            MarkKind::Highlight,
            Some(custom.clone()),
            false,
        ));
        assert!(app.mark_applied(MarkKind::Highlight, &custom, false));
        let _ = app.update(Message::AddPreset(MarkPreset::new(
            MarkKind::Highlight,
            custom.clone(),
        )));
        assert_eq!(app.preferences.presets().len(), 7);
        assert!(app.selected_passage().contains("1 Nephi 1:2–5"));
        app.selected = BTreeSet::from([2, 4, 5]);
        assert_eq!(app.selected_reference(), "1 Nephi 1:2, 4–5");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    /// Presses at one spot of an area, drags to another and lets go, as the pointer would.
    fn drag(app: &mut App, area: Area, from: (usize, usize), to: (usize, usize)) {
        let _ = app.update(Message::Pick(
            area,
            from.0,
            from.1,
            Phase::Press { clicks: 1 },
        ));
        let _ = app.update(Message::Pick(area, to.0, to.1, Phase::Drag));
        let _ = app.update(Message::Pick(area, to.0, to.1, Phase::Release));
    }
    #[test]
    fn dragging_a_selection_past_the_window_edge_scrolls_the_page_until_it_ends() {
        let (mut app, dir) = app();
        let _ = app.navigate(alma_32(), None);
        app.window_height = 800.0;
        let area = text_selection::Area::Reader;
        let _ = app.update(Message::Pick(area, 2, 0, Phase::Press { clicks: 1 }));
        let _ = app.update(Message::Pick(area, 3, 4, Phase::Drag));
        assert!(app.drag.as_ref().is_some_and(|d| d.dragging));
        // Inside the window nothing scrolls; past the bottom it scrolls down, faster further out (at most 40px a
        // frame); past the top it scrolls up.
        let _ = app.update(Message::DragAt(400.0));
        assert_eq!(app.edge_scroll, 0.0);
        let _ = app.update(Message::DragAt(812.0));
        assert_eq!(app.edge_scroll, 12.0);
        let _ = app.update(Message::DragAt(1200.0));
        assert_eq!(app.edge_scroll, 40.0);
        let _ = app.update(Message::DragAt(-6.0));
        assert_eq!(app.edge_scroll, -6.0);
        // The button coming up stops it, and the next drag starts still.
        let _ = app.update(Message::EndDrag);
        assert_eq!(app.edge_scroll, 0.0);
        app.edge_scroll = 9.0;
        let _ = app.update(Message::Pick(area, 1, 0, Phase::Press { clicks: 1 }));
        assert_eq!(app.edge_scroll, 0.0);
        drop(app);
        let _ = std::fs::remove_dir_all(dir);
    }
    #[test]
    fn copied_words_never_include_the_verse_number_indent() {
        let (mut app, dir) = app();
        let _ = app.navigate(alma_32(), None);
        for size in [store::MIN_FONT_SIZE, 16.0, store::MAX_FONT_SIZE] {
            let _ = app.update(Message::FontSize(size));
            for index in [0, app.verses.len() - 1] {
                // A triple click takes the whole verse paragraph, indent and all; only the words are selected.
                let _ = app.update(Message::Pick(
                    Area::Reader,
                    index,
                    2,
                    Phase::Press { clicks: 3 },
                ));
                let _ = app.update(Message::EndDrag);
                assert_eq!(app.reader_selected_text(), app.verses[index].text);
                assert_eq!(
                    app.selected_text().as_deref(),
                    Some(app.verses[index].text.as_str())
                );
                // The indent is real layout space, not part of the scripture.
                assert!(!app.verse_prefix[index].is_empty());
                assert!(
                    app.verse_prefix[index]
                        .chars()
                        .all(|c| ['\u{2002}', '\u{2009}', '\u{200A}', ' '].contains(&c))
                );
            }
        }
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn verse_indent_matches_the_websites_number_slot() {
        design::load_fonts();
        for (font, size) in [
            (design::serif(), 16.0),
            (design::serif(), 22.0),
            (SANS, 16.0),
        ] {
            let indent = view::verse_indent("1", font, size);
            let width = design::measure(&format!("{indent}x"), size, font)
                - design::measure("x", size, font);
            // 1.1rem + 0.4rem = 24px, filled with spaces to within a hair space.
            assert!((24.0..25.5).contains(&width), "{width} at {size}");
        }
    }
    #[test]
    fn navigating_saves_note_and_restart_restores_location() {
        let (mut app, dir) = app();
        let _ = app.update(Message::SelectVerse(3));
        app.note = text_editor::Content::with_text("Remember this thought.");
        app.note_dirty = true;
        let _ = app.update(Message::Adjacent(1));
        assert_eq!(app.preferences.last.chapter, 2);
        assert!(!app.note_dirty);
        drop(app);
        let app = App::from_directory(&dir);
        assert_eq!(app.preferences.last.chapter, 2);
        let entries = app
            .store
            .as_ref()
            .unwrap()
            .verse_notes_between(0, i64::MAX)
            .unwrap();
        assert_eq!(entries[0].note, "Remember this thought.");
        assert_eq!(entries[0].verse, 3);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn profiles_from_earlier_builds_open_with_the_web_reader_defaults() {
        let dir = directory();
        drop(Store::open(&dir).unwrap());
        let study = rusqlite::Connection::open(dir.join("study.sqlite")).unwrap();
        study
            .execute(
                "INSERT INTO preferences VALUES(1, ?1)",
                [r#"{"dark":false,"font_size":22,"serif":true,"sidebar":true,"last":{"volume":"bookofmormon","book":"alma","chapter":32}}"#],
            )
            .unwrap();
        drop(study);
        let mut app = App::from_directory(&dir);
        assert_eq!(app.preferences.font_size, 16.0);
        assert_eq!(app.reference(), "Alma 32");
        assert_eq!(app.preferences.text_width, TextWidth::Comfortable);
        let _ = app.update(Message::SetTextWidth(TextWidth::Wide));
        drop(app);
        let app = App::from_directory(&dir);
        assert_eq!(app.preferences.text_width, TextWidth::Wide);
        assert_eq!(app.preferences.font_size, 16.0);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn switching_screens_animates_the_header_then_stops_requesting_frames() {
        let (mut app, dir) = app();
        // Independent of the host's reduced-motion setting.
        app.motion.animate = true;
        let _ = app.update(Message::SelectVerse(2));
        assert!(!app.motion.is_animating(app.now));
        let _ = app.update(Message::SetScreen(Screen::Journal));
        let started = app.now;
        assert!(app.motion.is_animating(started));
        assert_eq!(app.motion.active, 1);
        let _ = app.update(Message::Frame(started + Duration::from_millis(140)));
        let (x, _) = app.motion.indicator(app.now);
        assert!(x > 0.0 && x < 42.0, "indicator mid-glide: {x}");
        let _ = app.update(Message::Frame(started + Duration::from_millis(300)));
        assert!(!app.motion.is_animating(app.now));
        assert_eq!(app.motion.indicator(app.now).0, 42.0);
        // Coming back to the reader keeps the chapter and the selected verse.
        let _ = app.update(Message::SetScreen(Screen::Reader));
        assert_eq!(app.selected, BTreeSet::from([2]));
        assert_eq!(app.reference(), "1 Nephi 1");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn navigation_collapse_toggles_and_closes_its_settings() {
        let (mut app, dir) = app();
        let _ = app.update(Message::TogglePopover(Popover::AppSettings));
        assert_eq!(app.popover, Some(Popover::AppSettings));
        let _ = app.update(Message::ToggleNav);
        assert!(app.motion.collapsed);
        assert_eq!(app.popover, None);
        let _ = app.update(Message::ToggleNav);
        assert!(!app.motion.collapsed);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn header_panels_are_exclusive() {
        let (mut app, dir) = app();
        let _ = app.update(Message::TogglePopover(Popover::Search));
        assert_eq!(app.popover, Some(Popover::Search));
        let _ = app.update(Message::TogglePopover(Popover::ReaderSettings));
        assert_eq!(app.popover, Some(Popover::ReaderSettings));
        let _ = app.update(Message::TogglePopover(Popover::ReaderSettings));
        assert_eq!(app.popover, None);
        let _ = app.update(Message::TogglePopover(Popover::Chapters));
        let _ = app.update(Message::ClosePopover);
        assert_eq!(app.popover, None);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn breadcrumbs_reach_every_book_and_chapter() {
        let (mut app, dir) = app();
        // The chapter crumb opens the current book's chapters.
        let _ = app.update(Message::TogglePopover(Popover::Chapters));
        assert_eq!(app.library_book.as_deref(), Some("1nephi"));
        // The volume crumb opens its books; any volume and book can be reached from there.
        let _ = app.update(Message::TogglePopover(Popover::Library));
        assert_eq!(app.popover, Some(Popover::Library));
        assert_eq!(app.library_book, None);
        let _ = app.update(Message::LibraryVolume("newtestament".into()));
        let _ = app.update(Message::LibraryBook(Some("john".into())));
        assert_eq!(app.library_book.as_deref(), Some("john"));
        let _ = app.update(Message::Navigate(
            Location {
                volume: "newtestament".into(),
                book: "john".into(),
                chapter: 3,
            },
            None,
        ));
        assert_eq!(app.reference(), "John 3");
        assert_eq!(app.popover, None);
        // A one-chapter book opens directly.
        let _ = app.update(Message::LibraryVolume("bookofmormon".into()));
        let _ = app.update(Message::LibraryBook(Some("enos".into())));
        assert_eq!(app.reference(), "Enos 1");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn log_opens_for_the_chapter_and_closing_it_saves_the_note() {
        let (mut app, dir) = app();
        let _ = app.update(Message::ToggleLog);
        assert!(app.log_open);
        let _ = app.update(Message::MarkRead);
        assert!(app.read);
        let _ = app.update(Message::SelectVerse(4));
        app.note = text_editor::Content::with_text("Logged.");
        app.note_dirty = true;
        let _ = app.update(Message::ToggleLog);
        assert!(!app.log_open);
        assert!(app.selected.is_empty());
        assert_eq!(app.annotations[0].note, "Logged.");
        drop(app);
        let app = App::from_directory(&dir);
        assert!(app.read);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn stale_search_results_do_not_replace_new_results() {
        let (mut app, dir) = app();
        app.search_generation = 2;
        let _ = app.update(Message::SearchDone(
            1,
            Ok(SearchResults {
                hits: vec![],
                more: true,
            }),
        ));
        assert!(!app.results.more);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn submitting_pending_search_waits_for_the_current_query() {
        let (mut app, dir) = app();
        app.popover = Some(Popover::Search);
        let path = app.store.as_ref().unwrap().scripture_path.clone();
        let old = Store::search(&path, "synagogues", None, false).unwrap();
        app.results = old.clone();
        let _ = app.update(Message::SearchInput("Alma 32:21".into()));
        let generation = app.search_generation;
        assert!(
            app.results.hits.is_empty(),
            "old results must not remain clickable"
        );
        let _ = app.update(Message::SubmitSearch);
        let _ = app.update(Message::SearchDone(generation - 1, Ok(old)));
        assert!(app.submit_search_when_ready);
        let current = Store::search(&path, "Alma 32:21", None, false).unwrap();
        let _ = app.update(Message::SearchDone(generation, Ok(current)));
        assert_eq!(app.reference(), "Alma 32");
        assert!(app.selected.contains(&21));
        assert_eq!(app.popover, None);
        assert!(!app.submit_search_when_ready);

        // Dismissing the panel while the query runs must cancel queued navigation.
        app.popover = Some(Popover::Search);
        let _ = app.update(Message::SearchInput("John 3:16".into()));
        let _ = app.update(Message::SubmitSearch);
        app.popover = None;
        let current = Store::search(&path, "John 3:16", None, false).unwrap();
        let _ = app.update(Message::SearchDone(app.search_generation, Ok(current)));
        assert_eq!(app.reference(), "Alma 32");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn a_shared_passage_opens_with_its_verses_selected() {
        let (mut app, dir) = app();
        let _ = app.update(Message::OpenLink(
            "https://www.versetogether.org/share/bookofmormon/alma/32/21-23,27".into(),
        ));
        assert_eq!(app.reference(), "Alma 32");
        assert_eq!(
            app.selected.iter().copied().collect::<Vec<_>>(),
            [21, 22, 23, 27]
        );
        // A note's own link to a chapter opens it too.
        let _ = app.update(Message::OpenLink("/browse/newtestament/john/3#v-16".into()));
        assert_eq!(app.reference(), "John 3");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn the_journal_editor_undoes_and_redoes_like_the_websites() {
        use journal_ui::JournalMsg;
        use md_editor::{Action, Edit};
        let (mut app, dir) = app();
        let _ = app.update(Message::Journal(JournalMsg::New(None)));
        let typed = |app: &mut App, text: &str| {
            for c in text.chars() {
                let edit = if c == '\n' {
                    Edit::Enter
                } else {
                    Edit::Insert(c)
                };
                // This sequence represents uninterrupted typing. Don't let unrelated parallel test work
                // turn a scheduler pause into a user pause and split the expected undo group.
                if let Some((_, at)) = &mut app.journal.open.as_mut().unwrap().last_edit {
                    *at = Instant::now();
                }
                let _ = app.update(Message::Journal(JournalMsg::Body(Action::Edit(edit))));
            }
        };
        typed(&mut app, "Seeds");
        typed(&mut app, " ");
        typed(&mut app, "of faith");
        let body = |app: &App| app.journal.open.as_ref().unwrap().body.text();
        assert_eq!(body(&app), "Seeds of faith");
        // A word typed is one step; the spaces between words are steps of their own.
        let _ = app.update(Message::Journal(JournalMsg::Undo));
        assert_eq!(body(&app), "Seeds of ");
        let _ = app.update(Message::Journal(JournalMsg::Undo));
        assert_eq!(body(&app), "Seeds of");
        let _ = app.update(Message::Journal(JournalMsg::Redo));
        assert_eq!(body(&app), "Seeds of ");
        // Typing after an undo starts a new history: there is nothing to redo.
        typed(&mut app, "x");
        let _ = app.update(Message::Journal(JournalMsg::Redo));
        assert_eq!(body(&app), "Seeds of x");
        for _ in 0..10 {
            let _ = app.update(Message::Journal(JournalMsg::Undo));
        }
        assert_eq!(body(&app), "");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn all_guides_are_available_and_scripture_links_stay_native() {
        let (mut app, dir) = app();
        for guide in lessons::guides() {
            let _ = app.update(Message::Lesson(lessons_ui::LessonMsg::Open(
                guide.start_date.clone(),
            )));
            let open = app.lessons.open.as_ref().unwrap();
            assert!(open.sections.len() > 3, "{}", guide.slug);
            // Every guide reads its week's chapters in full, each paired with the guide's chapter section.
            assert!(!open.companion.chapters.is_empty(), "{}", guide.slug);
            assert!(
                open.scripture.iter().all(|s| !s.verses.is_empty()),
                "{}",
                guide.slug
            );
            assert!(
                open.companion.chapters.iter().any(|c| c.heading.is_some()),
                "{}",
                guide.slug
            );
        }
        assert_eq!(app.screen, Screen::Guides);
        let (l, _) = app
            .scripture_link(
                "https://www.churchofjesuschrist.org/study/scriptures/ot/isa/40?lang=eng",
            )
            .unwrap();
        assert_eq!(l.book, "isaiah");
        assert_eq!(l.chapter, 40);
        assert!(app.scripture_link("file:///etc/passwd").is_none());
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn selected_words_are_marked_exactly_and_survive_restart() {
        let (mut app, dir) = app();
        let _ = app.navigate(alma_32(), None);
        let index = 20; // verse 21
        let text = app.verses[index].text.clone();
        let words = "faith is not to have a perfect knowledge";
        let byte = text.find(words).unwrap();
        // Drag from the end of the words back to their start (a drag runs either way).
        let prefix = app.verse_prefix[index].len();
        drag(
            &mut app,
            Area::Reader,
            (index, prefix + byte + words.len()),
            (index, prefix + byte),
        );
        assert_eq!(app.word_selection.len(), 1);
        let (_, range) = app.word_selection[0].clone();
        assert_eq!(
            range.end - range.start,
            words.encode_utf16().count(),
            "UTF-16 units of the selected words"
        );
        assert_eq!(app.reader_selected_text(), words);
        let _ = app.update(Message::QuickMark(1, true)); // blue highlight
        let marks = &app.annotations[0].marks;
        assert_eq!(marks.highlight, None, "only the words, not the verse");
        assert_eq!(marks.text_marks.len(), 1);
        assert_eq!(marks.text_marks[0].text, words);
        assert!(app.mark_applied(MarkKind::Highlight, &MarkColor::Named("blue"), true));
        let _ = app.update(Message::ClearWords);
        assert!(app.word_selection.is_empty() && app.drag.is_none());
        drop(app);
        let app = App::from_directory(&dir);
        let saved = app.store.as_ref().unwrap().annotations(&alma_32()).unwrap();
        assert_eq!(saved[0].verse, 21);
        assert_eq!(saved[0].marks.text_marks[0].text, words);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn a_selection_runs_across_verses_and_marks_each_verses_own_words() {
        let (mut app, dir) = app();
        let _ = app.navigate(alma_32(), None);
        let (a, b) = (20, 22); // verses 21 to 23
        let start = app.verse_prefix[a].len() + app.verses[a].text.find("faith is").unwrap();
        let end_words: String = app.verses[b]
            .text
            .split(' ')
            .take(4)
            .collect::<Vec<_>>()
            .join(" ");
        let end_words = end_words.as_str();
        let end = app.verse_prefix[b].len()
            + app.verses[b].text.find(end_words).unwrap()
            + end_words.len();
        drag(&mut app, Area::Reader, (a, start), (b, end));
        let verses: Vec<u32> = app
            .word_selection
            .iter()
            .map(|(i, _)| app.verses[*i].number)
            .collect();
        assert_eq!(verses, [21, 22, 23]);
        // The middle verse whole, the ends from and to the drag's ends; never an indent.
        let text = app.reader_selected_text();
        assert!(text.starts_with("faith is not"));
        assert!(text.contains(&app.verses[21].text));
        assert!(text.ends_with(end_words));
        let _ = app.update(Message::QuickMark(1, true));
        let marked: Vec<(u32, String)> = app
            .annotations
            .iter()
            .flat_map(|x| {
                x.marks
                    .text_marks
                    .iter()
                    .map(move |m| (x.verse, m.text.clone()))
            })
            .collect();
        assert_eq!(marked.len(), 3);
        assert!(marked[0].1.starts_with("faith is not") && marked[0].0 == 21);
        assert_eq!(marked[1], (22, app.verses[21].text.clone()));
        assert!(marked[2].1.ends_with(end_words) && marked[2].0 == 23);
        // Drawn on exactly those words, and the selection is kept after marking (as the website restores it).
        assert!(app.mark_applied(MarkKind::Highlight, &MarkColor::Named("blue"), true));
        // Ctrl+C copies the words.
        assert_eq!(app.selected_text().as_deref(), Some(text.as_str()));
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn words_selected_in_a_comparison_mark_only_the_kjv_words() {
        let (mut app, dir) = app();
        let _ = app.navigate(alma_32(), None);
        let index = 20;
        let kjv = app.verses[index].text.clone();
        // Another Bible whose wording differs in the middle of the verse.
        let other = kjv.replace("perfect knowledge", "complete understanding");
        app.tools.compare = vec![(
            "bsb".into(),
            crate::reader_tools::Load::Ready(vec![Verse {
                number: 21,
                text: other,
            }]),
        )];
        for side_by_side in [false, true] {
            app.preferences.side_by_side = side_by_side;
            let shown = app.verse_shown(index).unwrap();
            let display = shown.text();
            if !side_by_side {
                // Inline: "KJV / other" with the other Bible's words in the displayed text.
                assert!(display.contains("perfect knowledge / complete understanding"));
            }
            // From "a perfect" through the other Bible's words to "of things".
            let from = display.find("a perfect").unwrap();
            let to = display.find("of things").unwrap() + "of things".len();
            drag(&mut app, Area::Reader, (index, from), (index, to));
            assert_eq!(app.word_selection.len(), 1);
            assert_eq!(app.reader_selected_text(), "a perfect knowledge of things");
            let (_, range) = app.word_selection[0].clone();
            let units: Vec<u16> = kjv.encode_utf16().collect();
            assert_eq!(
                String::from_utf16(&units[range.start..range.end]).unwrap(),
                "a perfect knowledge of things"
            );
            // Only the other Bible's words selected: nothing to mark.
            if !side_by_side {
                let o = display.find("complete").unwrap();
                drag(&mut app, Area::Reader, (index, o), (index, o + 8));
                assert!(app.word_selection.is_empty());
            }
        }
        // Marked from a comparison, the words are the KJV's, drawn back on the KJV text.
        app.preferences.side_by_side = false;
        let shown = app.verse_shown(index).unwrap();
        let display = shown.text();
        let from = display.find("a perfect").unwrap();
        let to = display.find("of things").unwrap() + "of things".len();
        drag(&mut app, Area::Reader, (index, from), (index, to));
        let _ = app.update(Message::QuickMark(0, true));
        let saved = &app.annotations[0];
        assert_eq!(
            saved.marks.text_marks[0].text,
            "a perfect knowledge of things"
        );
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn a_lesson_selection_across_a_chapter_break_marks_and_quotes_each_chapter() {
        use crate::lessons_ui::LessonMsg;
        let (mut app, dir) = app();
        let _ = app.update(Message::Lesson(LessonMsg::Open("2026-10-26".into())));
        let _ = app.update(Message::SetScreen(Screen::Guides));
        let open = app.lessons.open.as_ref().unwrap();
        let last = open.scripture[0].verses.len() - 1;
        let first_label = open.companion.chapters[0].location.clone();
        let next_label = open.companion.chapters[1].location.clone();
        let end_text = open.scripture[0].verses[last].text.clone();
        let next_text = open.scripture[1].verses[0].text.clone();
        let indent = app
            .lesson_indent(open.scripture[0].verses[last].number)
            .len();
        let next_indent = app.lesson_indent(1).len();
        // From the last verse's fifth word into the next chapter's first verse.
        let from = indent + end_text.match_indices(' ').nth(3).unwrap().0 + 1;
        let to = next_indent + next_text.match_indices(' ').nth(2).unwrap().0;
        drag(
            &mut app,
            Area::Lesson,
            (text_selection::lesson_block(0, last), from),
            (text_selection::lesson_block(1, 0), to),
        );
        assert_eq!(app.lessons.words.len(), 2);
        assert_eq!(app.lessons.words[0].0, 0);
        assert_eq!(app.lessons.words[1], (1, 1, app.lessons.words[1].2.clone()));
        let reference = app.lesson_reference(&app.lesson_selected_verses());
        assert_eq!(
            reference,
            format!(
                "Jeremiah {}:{}; {}:1",
                first_label.chapter,
                last + 1,
                next_label.chapter
            )
        );
        let _ = app.update(Message::QuickMark(0, true));
        let store = app.store.as_ref().unwrap();
        let a = store.annotations(&first_label).unwrap();
        let b = store.annotations(&next_label).unwrap();
        assert!(end_text.ends_with(&a[0].marks.text_marks[0].text));
        assert!(next_text.starts_with(&b[0].marks.text_marks[0].text));
        assert_eq!(a[0].marks.highlight, None);
        // Add to note quotes each chapter's words under its own reference and link.
        let excerpt = app.lesson_excerpt();
        assert!(excerpt.starts_with(&format!(
            "**[Jeremiah {}:{}](</browse/oldtestament/jeremiah/{}#v-{}>)**\n> ",
            first_label.chapter,
            last + 1,
            first_label.chapter,
            last + 1
        )));
        assert!(excerpt.contains(&format!(
            "\n\n**[Jeremiah {}:1](</browse/oldtestament/jeremiah/{}#v-1>)**\n> ",
            next_label.chapter, next_label.chapter
        )));
        // A note on the first selected verse, from the lesson.
        let _ = app.update(Message::Lesson(LessonMsg::VerseNote));
        if let Some((.., content)) = &mut app.lessons.note {
            content.perform(text_editor::Action::Edit(text_editor::Edit::Paste(
                std::sync::Arc::new("Hope after lament".into()),
            )));
        }
        let _ = app.update(Message::Lesson(LessonMsg::SaveVerseNote));
        let a = app
            .store
            .as_ref()
            .unwrap()
            .annotations(&first_label)
            .unwrap();
        assert_eq!(a[0].note, "Hope after lament");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn guide_selections_run_across_paragraphs_and_are_anchored_like_the_website() {
        use crate::guide_marks::GuideMsg;
        use crate::lessons_ui::LessonMsg;
        let (mut app, dir) = app();
        let _ = app.update(Message::Lesson(LessonMsg::Open("2026-10-26".into())));
        let open = app.lessons.open.as_ref().unwrap();
        // Two paragraphs one after the other in the introduction.
        let part = &open.prose.parts[0];
        let i = (0..part.blocks.len() - 1)
            .find(|&i| {
                let (s0, b0, _) = part.blocks[i];
                let (s1, b1, _) = part.blocks[i + 1];
                matches!(
                    open.prose.blocks[s0][b0].kind,
                    crate::guide_text::Kind::Paragraph
                ) && matches!(
                    open.prose.blocks[s1][b1].kind,
                    crate::guide_text::Kind::Paragraph
                )
            })
            .unwrap();
        let (s0, b0, _) = part.blocks[i];
        let (s1, b1, _) = part.blocks[i + 1];
        let first = open.prose.blocks[s0][b0].text();
        let second = open.prose.blocks[s1][b1].text();
        let from = first.len() - first.split(' ').next_back().unwrap().len();
        let to = second.find(' ').unwrap();
        drag(
            &mut app,
            Area::Guide,
            (text_selection::guide_block(0, i), from),
            (text_selection::guide_block(0, i + 1), to),
        );
        let sel = app.lessons.guide.selection.clone().unwrap();
        assert!(sel.done);
        let _ = app.update(Message::Guide(GuideMsg::QuickMark(0)));
        let marks = app
            .store
            .as_ref()
            .unwrap()
            .guide_marks("2026-10-26")
            .unwrap();
        assert_eq!(marks.len(), 1);
        let anchor = &marks[0].anchor;
        // The quote runs from the end of one paragraph into the next, across the break between them.
        assert_eq!(
            anchor.exact,
            format!(
                "{}\n{}",
                first.split(' ').next_back().unwrap(),
                second.split(' ').next().unwrap()
            )
        );
        let open = app.lessons.open.as_ref().unwrap();
        assert_eq!(
            open.prose.parts[0].resolve(anchor),
            Some((sel.start, sel.end))
        );
        assert_eq!(app.lessons.guide.placed.len(), 1);
        // The same selection now is that span: the quick mark takes it off again, and an empty span is removed.
        let _ = app.update(Message::Guide(GuideMsg::QuickMark(0)));
        assert!(
            app.store
                .as_ref()
                .unwrap()
                .guide_marks("2026-10-26")
                .unwrap()
                .is_empty()
        );
        // A drag into another part stays in the part it started in.
        let _ = app.update(Message::Pick(
            Area::Guide,
            text_selection::guide_block(0, i),
            from,
            Phase::Press { clicks: 1 },
        ));
        let _ = app.update(Message::Pick(
            Area::Guide,
            text_selection::guide_block(1, 0),
            3,
            Phase::Drag,
        ));
        let _ = app.update(Message::EndDrag);
        assert_eq!(app.lessons.guide.selection.as_ref().map(|s| s.part), None);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn browse_opens_the_library_and_returns_where_browsing_was_left() {
        use library_ui::{LibraryMsg, LibraryPage};
        let (mut app, dir) = app();
        let _ = app.navigate(alma_32(), None);
        // From the reader, Browse opens the Library.
        let _ = app.update(Message::Library(LibraryMsg::Nav));
        assert_eq!(app.screen, Screen::Library);
        assert_eq!(app.library, LibraryPage::Home);
        // A volume, then a book; Back returns along the way.
        let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Volume(
            "bookofmormon".into(),
        ))));
        let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Book(
            "bookofmormon".into(),
            "alma".into(),
        ))));
        assert_eq!(
            app.library,
            LibraryPage::Book("bookofmormon".into(), "alma".into())
        );
        let _ = app.update(Message::Library(LibraryMsg::Back));
        assert_eq!(app.library, LibraryPage::Volume("bookofmormon".into()));
        // The one-book volume opens its book; a one-chapter book opens its chapter in the reader.
        let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Volume(
            "doctrineandcovenants".into(),
        ))));
        assert_eq!(
            app.library,
            LibraryPage::Book("doctrineandcovenants".into(), "doctrineandcovenants".into())
        );
        let _ = app.update(Message::Library(LibraryMsg::Back));
        assert_eq!(app.library, LibraryPage::Home);
        let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Book(
            "bookofmormon".into(),
            "enos".into(),
        ))));
        assert_eq!(app.screen, Screen::Reader);
        assert_eq!(app.preferences.last.book, "enos");
        // Continue reading opens the chapter left open; from another screen Browse returns to it.
        let _ = app.update(Message::Library(LibraryMsg::Nav));
        let _ = app.update(Message::Library(LibraryMsg::Continue));
        assert_eq!(
            (app.screen, app.preferences.last.chapter),
            (Screen::Reader, 1)
        );
        let _ = app.update(Message::SetScreen(Screen::Journal));
        let _ = app.update(Message::Library(LibraryMsg::Nav));
        assert_eq!(app.screen, Screen::Reader);
        // Left on the Library's landing page, Browse from elsewhere returns to the chapter instead (the website
        // doesn't remember `/browse` itself); left on a volume or book page, it comes back to that page.
        let _ = app.update(Message::Library(LibraryMsg::Nav));
        let _ = app.update(Message::SetScreen(Screen::Journal));
        let _ = app.update(Message::Library(LibraryMsg::Nav));
        assert_eq!(app.screen, Screen::Reader);
        let _ = app.update(Message::Library(LibraryMsg::Nav));
        let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Volume(
            "pearl".into(),
        ))));
        let _ = app.update(Message::SetScreen(Screen::Guides));
        let _ = app.update(Message::Library(LibraryMsg::Nav));
        assert_eq!(
            (app.screen, app.library.clone()),
            (Screen::Library, LibraryPage::Volume("pearl".into()))
        );
        // A book's page knows its read chapters.
        let l = alma_32();
        let source = NoteSource::scripture("Alma", &l, None);
        app.store
            .as_mut()
            .unwrap()
            .set_read(&l, &source, true)
            .unwrap();
        let _ = app.update(Message::Library(LibraryMsg::Show(LibraryPage::Book(
            "bookofmormon".into(),
            "alma".into(),
        ))));
        assert_eq!(app.library_read, vec![32]);
        let _ = app.view();
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn quick_marks_can_be_renamed_reordered_and_removed() {
        let (mut app, dir) = app();
        let _ = app.update(Message::PresetName(0, "Blessings".into()));
        let _ = app.update(Message::PresetUp(5));
        let presets = app.preferences.presets();
        assert_eq!(presets[0].name.as_deref(), Some("Blessings"));
        assert_eq!(presets[4].kind, MarkKind::Underline);
        let _ = app.update(Message::PresetRemove(0));
        assert_eq!(app.preferences.presets().len(), 5);
        drop(app);
        let app = App::from_directory(&dir);
        assert_eq!(app.preferences.presets().len(), 5);
        assert_eq!(app.preferences.presets()[3].kind, MarkKind::Underline);
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn share_links_match_the_websites_share_pages() {
        let (mut app, dir) = app();
        let _ = app.update(Message::Navigate(
            Location {
                volume: "doctrineandcovenants".into(),
                book: "doctrineandcovenants".into(),
                chapter: 4,
            },
            Some(2),
        ));
        app.selected.extend([3, 4, 6]);
        assert_eq!(
            app.share_link(),
            "https://www.versetogether.org/share/dnc/doctrineandcovenants/4/2-4,6"
        );
        drop(app);
        let _ = std::fs::remove_dir_all(dir);
    }
    #[test]
    fn autosave_persists_open_verse_and_journal_drafts_without_leaving() {
        let (mut app, dir) = app();
        let location = app.preferences.last.clone();
        let _ = app.update(Message::SelectVerse(1));
        let _ = app.update(Message::EditNote(text_editor::Action::Edit(
            text_editor::Edit::Paste(std::sync::Arc::new(
                "Verse draft survives a forced quit".into(),
            )),
        )));
        assert!(app.has_unsaved_notes());
        let _ = app.update(Message::Autosave);
        assert!(!app.note_dirty);
        assert_eq!(
            app.store.as_ref().unwrap().annotations(&location).unwrap()[0].note,
            "Verse draft survives a forced quit"
        );
        let _ = app.update(Message::Journal(journal_ui::JournalMsg::New(None)));
        let _ = app.update(Message::Journal(journal_ui::JournalMsg::Title(
            "Autosaved reflection".into(),
        )));
        let _ = app.update(Message::Autosave);
        assert!(app.journal.open.is_some());
        assert!(!app.has_unsaved_notes());
        let id = app.journal.open.as_ref().unwrap().note.id.clone();
        let saved = Store::open(&dir).unwrap().note(&id).unwrap().unwrap();
        assert_eq!(saved.title, "Autosaved reflection");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_autosave_keeps_the_draft_and_retries_without_losing_text() {
        let (mut app, dir) = app();
        let _ = app.update(Message::Journal(journal_ui::JournalMsg::New(None)));
        let _ = app.update(Message::Journal(journal_ui::JournalMsg::Title(
            "Keep this draft".into(),
        )));
        let db = rusqlite::Connection::open(dir.join("study.sqlite")).unwrap();
        db.execute_batch("CREATE TRIGGER reject_autosave BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'test write failure'); END;").unwrap();
        let _ = app.update(Message::Autosave);
        assert!(app.has_unsaved_notes());
        assert!(app.autosave_failed);
        assert!(app.error.as_ref().unwrap().contains("test write failure"));
        assert_eq!(
            app.journal.open.as_ref().unwrap().note.title,
            "Keep this draft"
        );
        db.execute_batch("DROP TRIGGER reject_autosave;").unwrap();
        let _ = app.update(Message::Autosave);
        assert!(!app.has_unsaved_notes());
        assert!(!app.autosave_failed);
        drop(app);
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
