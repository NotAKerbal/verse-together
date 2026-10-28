#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
mod anim;
mod design;
mod guides;
mod header;
mod icons;
mod jump;
mod reveal;
mod selectable;
mod store;
#[cfg(test)]
mod ui_tests;
mod view;

use design::{Colors, SANS};
use iced::widget::{markdown, operation, scrollable, text_editor};
use iced::{Event, Size, Subscription, Task, Theme, keyboard, window};
use std::collections::{BTreeSet, HashMap};
use std::{path::PathBuf, time::Instant};
use store::{
    Annotation, Book, Location, Preferences, SearchResults, Store, StudyEntry, TextWidth, Verse,
};

fn main() -> iced::Result {
    if std::env::args().any(|a| a == "--version") {
        println!("Verse Together Native {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    if std::env::args().any(|a| a == "--help") {
        println!(
            "Verse Together Native\n\n--data-dir PATH  Use a separate local study directory\n--benchmark      Measure local data reads and searches without opening a window\n--version        Print version"
        );
        return Ok(());
    }
    if std::env::args().any(|a| a == "--benchmark") {
        benchmark();
        return Ok(());
    }
    iced::application(App::new, App::update, App::view)
        .title(|a: &App| format!("{} — Verse Together", a.reference()))
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
    Journal,
    Guides,
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
    /// The navigation's settings control: appearance.
    AppSettings,
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
    SelectText(usize, text_editor::Action),
    CopyWords(usize),
    ClearSelection,
    ToggleLog,
    Copy,
    Highlight,
    Bookmark,
    EditNote(text_editor::Action),
    SaveNote,
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
    MarkRead,
    Guide(usize),
    Section(usize),
    OpenLink(String),
    DismissError,
    Retry,
}
struct App {
    store: Option<Store>,
    error: Option<String>,
    preferences: Preferences,
    books: Vec<Book>,
    verses: Vec<Verse>,
    /// Each verse's words for native selection: an indent the inline verse number sits in, then the verse text.
    verse_content: Vec<text_editor::Content>,
    verse_prefix: Vec<String>,
    annotations: Vec<Annotation>,
    screen: Screen,
    selected: BTreeSet<u32>,
    anchor: Option<u32>,
    note: text_editor::Content,
    note_dirty: bool,
    copied: bool,
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
    journal: Vec<StudyEntry>,
    focus: bool,
    window_width: f32,
    read: bool,
    guide: usize,
    section: usize,
    guide_sections: Vec<(String, String)>,
    markdown: Vec<markdown::Item>,
    /// The clock the header's transitions are drawn at; advanced by window frames only while one runs.
    now: Instant,
    motion: header::Motion,
    label_widths: [f32; 3],
}
impl App {
    fn new() -> Self {
        Self::from_directory(&data_dir())
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
        let guide = guides::GUIDES.len() - 1;
        let guide_sections = guides::sections(guide);
        let markdown = markdown::parse(&guide_sections[0].1).collect();
        let now = Instant::now();
        let label_widths = header::measure_labels();
        let mut app = Self {
            store,
            error: issue,
            preferences,
            books,
            verses: vec![],
            verse_content: vec![],
            verse_prefix: vec![],
            annotations: vec![],
            screen: Screen::Reader,
            selected: BTreeSet::new(),
            anchor: None,
            note: text_editor::Content::new(),
            note_dirty: false,
            copied: false,
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
            journal: vec![],
            focus: false,
            window_width: 1440.,
            read: false,
            guide,
            section: 0,
            guide_sections,
            markdown,
            now,
            motion: header::Motion::new(0, label_widths, !anim::reduced_motion(), now),
            label_widths,
        };
        app.load_chapter();
        app
    }
    fn p(&self) -> Colors {
        Colors::new(self.preferences.dark)
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
                        ) => modifiers.alt(),
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
        if self.motion.is_animating(self.now) {
            Subscription::batch([events, window::frames().map(Message::Frame)])
        } else {
            events
        }
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
        self.verse_content = self
            .verses
            .iter()
            .zip(&self.verse_prefix)
            .map(|(v, prefix)| text_editor::Content::with_text(&format!("{prefix}{}", v.text)))
            .collect();
    }
    fn load_chapter(&mut self) {
        if let Some(s) = &self.store {
            let verses = s.chapter(&self.preferences.last);
            let annotations = s.annotations(&self.preferences.last);
            let read = s.is_read(&self.preferences.last);
            if let Some(v) = self.report(verses) {
                self.verses = v;
                self.build_verse_content();
            }
            if let Some(a) = self.report(annotations) {
                self.annotations = a;
            }
            if let Some(r) = self.report(read) {
                self.read = r;
            }
        }
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
        // The scroll operation uses rendered widget bounds, so verse jumps remain exact at every font size.
        if let Some(v) = verse {
            jump::to_verse(v)
        } else {
            operation::snap_to("reader", scrollable::RelativeOffset::START)
        }
    }
    fn set_screen(&mut self, screen: Screen) {
        if self.screen != screen {
            self.now = Instant::now();
            self.motion
                .set_active(header::screen_index(screen), self.label_widths, self.now);
        }
        self.screen = screen;
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
        self.searching = true;
        Task::perform(
            async move { Store::search(&path, &query, scope.as_deref()) },
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
    fn selection_marked(&self, bookmark: bool) -> bool {
        !self.selected.is_empty()
            && self.selected.iter().all(|v| {
                self.annotations
                    .iter()
                    .find(|a| a.verse == *v)
                    .is_some_and(|a| {
                        if bookmark {
                            a.bookmarked
                        } else {
                            a.highlighted
                        }
                    })
            })
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
    /// Words selected inside a verse, without the indent that holds the verse number.
    fn selected_words(&self, index: usize) -> Option<String> {
        let selection = self.verse_content.get(index)?.selection()?;
        let words = selection.trim_start_matches(view::INDENT_CHARS);
        (!words.is_empty()).then(|| words.to_string())
    }

    fn mark_selection(&mut self, bookmark: bool) {
        if !self.save_note() {
            return;
        }
        let all = self.selection_marked(bookmark);
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
            if bookmark {
                a.bookmarked = !all;
            } else {
                a.highlighted = !all;
            }
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
                *self = Self::new();
            }
            Message::DismissError => self.error = None,
            Message::Frame(now) => self.now = now,
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
                        Popover::Search => return operation::focus("search"),
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
                    return jump::to_verse(v);
                }
            }
            Message::SelectText(index, action) => {
                if !action.is_edit()
                    && let Some(content) = self.verse_content.get_mut(index)
                {
                    content.perform(action);
                }
            }
            Message::CopyWords(index) => {
                if let Some(words) = self.selected_words(index) {
                    return iced::clipboard::write(words);
                }
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
            Message::Highlight => self.mark_selection(false),
            Message::Bookmark => self.mark_selection(true),
            Message::EditNote(action) => {
                self.note_dirty |= action.is_edit();
                self.note.perform(action);
            }
            Message::SaveNote => {
                self.save_note();
            }
            Message::OpenSearch => {
                self.popover = Some(Popover::Search);
                return operation::focus("search");
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
                if !self.save_note() {
                    return Task::none();
                }
                self.set_screen(screen);
                self.focus = false;
                if self.popover != Some(Popover::AppSettings) {
                    self.popover = None;
                }
                if screen == Screen::Journal
                    && let Some(s) = &self.store
                {
                    let r = s.journal();
                    if let Some(j) = self.report(r) {
                        self.journal = j;
                    }
                }
            }
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
            Message::MarkRead => {
                if let Some(s) = &self.store {
                    let r = s.set_read(&self.preferences.last, !self.read);
                    if self.report(r).is_some() {
                        self.read = !self.read;
                    }
                }
            }
            Message::Guide(i) => {
                self.guide = i;
                self.section = 0;
                self.guide_sections = guides::sections(i);
                self.markdown = markdown::parse(&self.guide_sections[0].1).collect();
                return operation::snap_to("guide", scrollable::RelativeOffset::START);
            }
            Message::Section(i) => {
                self.section = i;
                self.markdown = markdown::parse(&self.guide_sections[i].1).collect();
                return operation::snap_to("guide", scrollable::RelativeOffset::START);
            }
            Message::OpenLink(url) => {
                if let Some((l, v)) = self.scripture_link(&url) {
                    return self.navigate(l, v);
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
                    match key.as_ref() {
                        keyboard::Key::Character("k") if modifiers.command() => {
                            return self.update(Message::OpenSearch);
                        }
                        keyboard::Key::Character("s") if modifiers.command() => {
                            return self.update(Message::SaveNote);
                        }
                        keyboard::Key::Character("c")
                            if modifiers.command() && !self.selected.is_empty() =>
                        {
                            return self.update(Message::Copy);
                        }
                        keyboard::Key::Character("j") if modifiers.command() => {
                            return self.update(Message::SetScreen(Screen::Journal));
                        }
                        keyboard::Key::Named(keyboard::key::Named::Escape) => {
                            if self.popover.is_some() {
                                self.popover = None;
                            } else if self.focus {
                                self.focus = false;
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
                            if modifiers.alt() =>
                        {
                            return self.update(Message::Adjacent(-1));
                        }
                        _ => {}
                    }
                }
                Event::Window(window::Event::Resized(size))
                | Event::Window(window::Event::Opened { size, position: _ }) => {
                    self.window_width = size.width;
                }
                Event::Window(window::Event::CloseRequested) if self.save_note() => {
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
        std::hint::black_box(Store::search(&store.scripture_path, "faith hope", None).unwrap());
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
    fn selecting_range_marks_every_verse_and_never_edits_scripture() {
        let (mut app, dir) = app();
        let original = app.verse_content[0].text();
        let _ = app.update(Message::SelectText(
            0,
            text_editor::Action::Edit(text_editor::Edit::Insert('X')),
        ));
        assert_eq!(app.verse_content[0].text(), original);
        let _ = app.update(Message::SelectVerse(2));
        app.modifiers = keyboard::Modifiers::SHIFT;
        let _ = app.update(Message::SelectVerse(5));
        assert_eq!(app.selected, BTreeSet::from([2, 3, 4, 5]));
        let _ = app.update(Message::Highlight);
        assert_eq!(app.annotations.iter().filter(|a| a.highlighted).count(), 4);
        let _ = app.update(Message::Bookmark);
        assert_eq!(app.annotations.iter().filter(|a| a.bookmarked).count(), 4);
        let _ = app.update(Message::Highlight);
        assert!(
            app.annotations
                .iter()
                .all(|a| !a.highlighted && a.bookmarked)
        );
        assert!(app.selected_passage().contains("1 Nephi 1:2–5"));
        app.selected = BTreeSet::from([2, 4, 5]);
        assert_eq!(app.selected_reference(), "1 Nephi 1:2, 4–5");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn copied_words_never_include_the_verse_number_indent() {
        let (mut app, dir) = app();
        let _ = app.navigate(alma_32(), None);
        for size in [store::MIN_FONT_SIZE, 16.0, store::MAX_FONT_SIZE] {
            let _ = app.update(Message::FontSize(size));
            for index in [0, app.verses.len() - 1] {
                let _ = app.update(Message::SelectText(index, text_editor::Action::SelectAll));
                assert_eq!(
                    app.selected_words(index).as_deref(),
                    Some(app.verses[index].text.as_str())
                );
                // The indent is real layout space, not part of the scripture.
                assert!(!app.verse_prefix[index].is_empty());
                assert!(
                    app.verse_prefix[index]
                        .chars()
                        .all(|c| view::INDENT_CHARS.contains(&c))
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
        let entries = app.store.as_ref().unwrap().journal().unwrap();
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
        let old = Store::search(&path, "synagogues", None).unwrap();
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
        let current = Store::search(&path, "Alma 32:21", None).unwrap();
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
        let current = Store::search(&path, "John 3:16", None).unwrap();
        let _ = app.update(Message::SearchDone(app.search_generation, Ok(current)));
        assert_eq!(app.reference(), "Alma 32");
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn all_guides_are_available_and_scripture_links_stay_native() {
        let (app, dir) = app();
        for i in 0..guides::GUIDES.len() {
            let sections = guides::sections(i);
            assert!(!sections.is_empty());
            for (_, body) in sections {
                assert!(!markdown::parse(&body).collect::<Vec<_>>().is_empty());
            }
        }
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
}
