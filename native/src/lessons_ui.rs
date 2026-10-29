// Come, Follow Me, after the website's LessonOverview and lesson page: this week's featured lesson and earlier
// lessons with their covers; a lesson's hero, contents and guide text; a scripture dock beside the guide that reads
// and marks the passage a section discusses (the same verse marks as the reader); and the lesson's log.
use crate::design::{self, Colors, icon, sans, serif};
use crate::header::{CONTENT_TOP, PILL_HEIGHT, shell_inset};
use crate::lessons::{self, Lesson, Section, Week};
use crate::mark_layer::{self, Run};
use crate::marks::{self, MarksPatch};
use crate::store::{self, Annotation, Location, Note, NoteSource, Verse};
use crate::{App, Message, Popover, Screen};
use iced::widget::{
    button, column, container, image, operation, row, scrollable, space, stack, text,
};
use iced::{Alignment::Center, Border, Color, Element, Fill, Padding, Task, font};
use std::collections::{BTreeSet, HashMap};
use std::sync::{Mutex, OnceLock};

const DOCK: f32 = 400.0;

pub(crate) fn cover_image(
    cover: &'static lessons::Cover,
    width: f32,
    height: f32,
    radius: iced::border::Radius,
) -> image::Image {
    static HANDLES: OnceLock<Mutex<HashMap<&'static str, image::Handle>>> = OnceLock::new();
    let handle = HANDLES
        .get_or_init(Default::default)
        .lock()
        .expect("cover cache")
        .entry(cover.file)
        .or_insert_with(|| image::Handle::from_bytes(cover.bytes))
        .clone();
    image(handle)
        .crop(lessons::crop(cover, width, height))
        .content_fit(iced::ContentFit::Cover)
        .width(width)
        .height(height)
        .border_radius(radius)
}

pub struct OpenGuide {
    pub lesson: Lesson,
    pub sections: Vec<Section>,
    /// The sections' prose as selectable, markable blocks.
    pub prose: crate::guide_marks::GuideProse,
    /// The guide paired with the week's chapters (`StudyCompanion`).
    pub companion: lessons::Companion,
    /// Each companion chapter's verses, this reader's marks on them, and how they interleave with the commentary.
    pub scripture: Vec<LessonChapter>,
}
pub struct LessonChapter {
    pub verses: Vec<Verse>,
    pub annotations: Vec<Annotation>,
    pub groups: Vec<lessons::ReadingGroup>,
}
pub struct Dock {
    pub location: Location,
    pub label: String,
    pub verses: Vec<Verse>,
    pub focus: Option<(u32, u32)>,
    pub annotations: Vec<Annotation>,
    pub selected: BTreeSet<u32>,
}
#[derive(Default)]
pub struct LessonsState {
    pub weeks: Vec<Week>,
    pub open: Option<OpenGuide>,
    pub dock: Option<Dock>,
    /// This lesson's journal notes, for its log.
    pub notes: Vec<Note>,
    pub logged: bool,
    /// Marks and notes on the open guide's prose, and the current selection in it.
    pub guide: crate::guide_marks::GuideMarksState,
    /// Open context disclosures, by their section.
    pub open_context: std::collections::HashSet<usize>,
    /// Context disclosures showing their full commentary.
    pub full: std::collections::HashSet<usize>,
    /// Selected verses: (companion chapter, verse).
    pub selected: BTreeSet<(usize, u32)>,
    /// Words selected in the chapters: (companion chapter, verse, UTF-16 range of its text).
    pub words: Vec<(usize, u32, crate::marks::TextRange)>,
    /// The verse note being written from the lesson: (companion chapter, verse) and its text.
    pub note: Option<(usize, u32, iced::widget::text_editor::Content)>,
    /// Contents entries opened or closed to show their passages, by section; others follow `contents_current`.
    pub contents_toggled: HashMap<usize, bool>,
    /// The contents entry last jumped to (its chapter row stays open and is marked).
    pub contents_current: Option<usize>,
}

/// Which part of the lesson a contents entry is in (`GuidePartName`), or the whole guide when nothing pairs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentsGroup {
    Introduction,
    Chapters,
    Guide,
    Closing,
}
impl ContentsGroup {
    pub fn label(self) -> &'static str {
        match self {
            Self::Introduction => "Introduction",
            Self::Chapters => "Chapter by chapter",
            Self::Guide => "Guide",
            Self::Closing => "After the chapters",
        }
    }
}
/// One contents entry (`TocItem`): a `##` section, its chapter reference and subtitle when it is a chapter's
/// commentary ("Jeremiah 31" · "Mourning Turned to Joy for All Israel"), and its `###` passages.
#[derive(Debug, Clone, PartialEq)]
pub struct ContentsItem {
    pub section: usize,
    pub group: ContentsGroup,
    pub title: String,
    pub chapter: Option<(String, Option<String>)>,
    /// (section, short reference "31:1–3", title).
    pub passages: Vec<(usize, String, String)>,
}
/// "Jeremiah 31: Mourning Turned to Joy" → ("Jeremiah 31", Some("Mourning Turned to Joy")).
fn chapter_heading(title: &str) -> Option<(String, Option<String>)> {
    let (head, rest) = match title.split_once(':') {
        Some((h, r)) if !r.starts_with(|c: char| c.is_ascii_digit()) => (h, Some(r.trim())),
        _ => (title, None),
    };
    let (book, number) = head.trim().rsplit_once(' ')?;
    (!book.is_empty() && !number.is_empty() && number.chars().all(|c| c.is_ascii_digit())).then(
        || {
            (
                format!("{} {number}", book.trim()),
                rest.filter(|r| !r.is_empty()).map(str::to_string),
            )
        },
    )
}
/// "Jeremiah 31:1–3 — Everlasting Love" → ("31:1–3", "Everlasting Love"); a heading without a reference keeps
/// its whole title.
fn passage_heading(title: &str) -> (String, String) {
    let (reference, text) = title
        .split_once(" — ")
        .map(|(a, b)| (a.trim(), b.trim()))
        .unwrap_or(("", title.trim()));
    let short = reference
        .rfind(' ')
        .map(|at| &reference[at + 1..])
        .filter(|r| r.chars().next().is_some_and(|c| c.is_ascii_digit()) && r.contains(':'))
        .unwrap_or(reference);
    (short.to_string(), text.to_string())
}
/// The lesson's contents, grouped as the website's drawer groups them: introduction, chapter by chapter, and
/// after the chapters (or one "Guide" group when no section pairs with a chapter).
pub fn contents(sections: &[Section], companion: &lessons::Companion) -> Vec<ContentsItem> {
    let paired = companion.chapters.iter().any(|c| c.heading.is_some());
    let mut items: Vec<ContentsItem> = vec![];
    for (i, section) in sections.iter().enumerate() {
        match section.level {
            2 => {
                let group = if !paired {
                    ContentsGroup::Guide
                } else if companion.introduction.contains(&i) {
                    ContentsGroup::Introduction
                } else if companion.closing.contains(&i) {
                    ContentsGroup::Closing
                } else {
                    ContentsGroup::Chapters
                };
                items.push(ContentsItem {
                    section: i,
                    group,
                    title: section.title.clone(),
                    chapter: chapter_heading(&section.title),
                    passages: vec![],
                });
            }
            3 => {
                if let Some(item) = items.last_mut() {
                    let (short, text) = passage_heading(&section.title);
                    item.passages.push((i, short, text));
                }
            }
            _ => {}
        }
    }
    items
}

#[derive(Debug, Clone)]
pub enum LessonMsg {
    Open(String),
    Back,
    Jump(usize),
    Link(String),
    CloseDock,
    DockScroll(Option<u32>),
    DockVerse(u32),
    DockMark(usize),
    LogReading,
    WriteNote,
    /// Open or close a context disclosure.
    Context(usize),
    /// "Read full commentary" / "Show less commentary".
    Full(usize),
    SelectVerse(usize, u32),
    Scroll(usize),
    ClearVerses,
    /// Copy the selected words (or verses).
    CopySelection,
    /// Start a note with the selection quoted under each chapter's reference.
    AddToNote,
    /// Open the note editor on the first selected verse.
    VerseNote,
    EditVerseNote(iced::widget::text_editor::Action),
    SaveVerseNote,
    OpenChapter(usize),
    OpenNote(String),
    Credit(String),
    /// Show or hide a contents entry's passages.
    ToggleContents(usize),
}

impl App {
    /// The chapters of this week's lesson (and the open one), for refreshing their read state.
    pub(crate) fn lesson_chapters(&self) -> Vec<Location> {
        let current = self.lesson_today().current;
        let open = self.lessons.open.as_ref().map(|o| o.lesson.clone());
        current
            .into_iter()
            .chain(open)
            .filter_map(|l| l.week)
            .flat_map(|w| w.reading())
            .map(|r| r.first())
            .collect()
    }
    pub(crate) fn lesson_today(&self) -> lessons::Overview {
        lessons::overview(&store::today(), lessons::guides(), &self.lessons.weeks)
    }
    pub(crate) fn open_lesson(&mut self, week: &str) -> Task<Message> {
        let Some(lesson) = lessons::lesson_for_week(week, lessons::guides(), &self.lessons.weeks)
        else {
            return Task::none();
        };
        let sections = lesson
            .guide
            .as_ref()
            .and_then(|g| lessons::guide_content(&g.slug))
            .map(|c| lessons::sections(c, &self.books))
            .unwrap_or_default();
        let prose = crate::guide_marks::GuideProse::new(&sections);
        // Only the week's own chapters are read in full on the page, as on the website.
        let chapters: Vec<Location> = if lesson.guide.is_some() {
            lesson
                .week
                .iter()
                .flat_map(|w| w.reading())
                .flat_map(|r| {
                    (r.from..=r.to).map(move |chapter| Location {
                        chapter,
                        ..r.first()
                    })
                })
                .collect()
        } else {
            vec![]
        };
        let companion = lessons::companion(&sections, &chapters, &self.books);
        self.lessons.open = Some(OpenGuide {
            lesson,
            sections,
            prose,
            companion,
            scripture: vec![],
        });
        self.reload_lesson_scripture();
        self.lessons.dock = None;
        self.lessons.guide = Default::default();
        self.lessons.open_context.clear();
        self.lessons.full.clear();
        self.lessons.contents_toggled.clear();
        self.lessons.contents_current = None;
        self.lessons.selected.clear();
        self.load_lesson_log();
        self.load_guide_marks();
        // Signed in, the guide's marks are refreshed from the account.
        self.sync_soon();
        self.set_screen(Screen::Guides);
        self.popover = None;
        crate::presented(operation::snap_to(
            "guide",
            scrollable::RelativeOffset::START,
        ))
    }
    pub(crate) fn lesson_source(&self) -> Option<NoteSource> {
        let open = self.lessons.open.as_ref()?;
        let label = match &open.lesson.guide {
            Some(g) => format!("{}: {}", g.scripture, g.title),
            None => open.lesson.title.clone(),
        };
        Some(NoteSource::lesson(&open.lesson.start, &label))
    }
    /// Reads the lesson's chapters and this reader's marks on them from this computer's study.
    pub(crate) fn reload_lesson_scripture(&mut self) {
        let Some(open) = &self.lessons.open else {
            return;
        };
        let Some(store) = &self.store else { return };
        let mut scripture = vec![];
        let mut problem = None;
        for chapter in &open.companion.chapters {
            match (
                store.chapter(&chapter.location),
                store.annotations(&chapter.location),
            ) {
                (Ok(verses), Ok(annotations)) => {
                    let groups = lessons::reading_groups(&verses, &chapter.blocks);
                    scripture.push(LessonChapter {
                        verses,
                        annotations,
                        groups,
                    });
                }
                (Err(e), _) | (_, Err(e)) => {
                    problem = Some(e);
                    scripture.push(LessonChapter {
                        verses: vec![],
                        annotations: vec![],
                        groups: vec![],
                    });
                }
            }
        }
        if let Some(open) = &mut self.lessons.open {
            open.scripture = scripture;
        }
        if let Some(e) = problem {
            self.report::<()>(Err(e));
        }
    }
    pub(crate) fn load_lesson_log(&mut self) {
        let Some(source) = self.lesson_source() else {
            return;
        };
        let Some(s) = &self.store else { return };
        let today = store::today();
        let notes = s.all_notes();
        let readings = s.readings_between(&today, &today);
        if let (Some(notes), Some(readings)) = (self.report(notes), self.report(readings)) {
            self.lessons.notes = notes
                .into_iter()
                .filter(|n| n.source.as_ref().is_some_and(|s| s.href == source.href))
                .collect();
            self.lessons.logged = readings.iter().any(|r| r.source.href == source.href);
        }
    }
    fn load_dock(&mut self, location: Location, focus: Option<(u32, u32)>) -> Task<Message> {
        let Some(s) = &self.store else {
            return Task::none();
        };
        let verses = s.chapter(&location);
        let annotations = s.annotations(&location);
        let (Some(verses), Some(annotations)) = (self.report(verses), self.report(annotations))
        else {
            return Task::none();
        };
        let label = self
            .books
            .iter()
            .find(|b| b.volume == location.volume && b.id == location.book)
            .map(|b| format!("{} {}", b.label, location.chapter))
            .unwrap_or_default();
        self.lessons.dock = Some(Dock {
            location,
            label,
            verses,
            focus,
            annotations,
            selected: focus.map(|(a, b)| (a..=b).collect()).unwrap_or_default(),
        });
        // Scrolled once the dock is in the interface (the next message is handled after it is rebuilt).
        Task::done(Message::Lesson(LessonMsg::DockScroll(focus.map(|f| f.0))))
    }
    pub(crate) fn update_lessons(&mut self, message: LessonMsg) -> Task<Message> {
        match message {
            LessonMsg::Open(week) => return self.open_lesson(&week),
            LessonMsg::Back => {
                self.lessons.open = None;
                self.lessons.dock = None;
                self.popover = None;
            }
            LessonMsg::ToggleContents(section) => {
                let open = self.contents_entry_open(section);
                self.lessons.contents_toggled.insert(section, !open);
            }
            LessonMsg::Jump(i) => {
                self.popover = None;
                if let Some(open) = &self.lessons.open {
                    // The entry (or the entry a passage belongs to) stays open the next time Contents opens.
                    self.lessons.contents_current = contents(&open.sections, &open.companion)
                        .into_iter()
                        .find(|item| item.section == i || item.passages.iter().any(|p| p.0 == i))
                        .map(|item| item.section);
                }
                if let Some(open) = &self.lessons.open
                    && let Some(block) = open
                        .companion
                        .chapters
                        .iter()
                        .flat_map(|c| {
                            c.blocks
                                .iter()
                                .chain(c.following.iter().flat_map(|f| f.1.iter()))
                        })
                        .find(|b| b.section == i && !b.after_heading)
                {
                    self.lessons.open_context.insert(block.section);
                    self.lessons.full.insert(block.section);
                    // Scrolled once the opened disclosure is laid out.
                    return Task::done(Message::Lesson(LessonMsg::Scroll(i)));
                }
                let mut task = crate::presented(crate::jump::to_verse_in(
                    "guide",
                    &format!("guide-sec-{i}"),
                    CONTENT_TOP,
                ));
                if let Some(open) = &self.lessons.open
                    && let Some((location, verses)) =
                        open.sections.get(i).and_then(|s| s.passage.clone())
                    && self.lessons.dock.is_some()
                {
                    task = Task::batch([task, self.load_dock(location, verses)]);
                }
                return task;
            }
            LessonMsg::Link(url) => {
                if let Some((location, verse)) = self.scripture_link(&url) {
                    let verse = verse.or_else(|| verse_in_url(&url));
                    // The week's own chapters are on this page: go to the passage beside the guide.
                    if let Some(index) = self.lessons.open.as_ref().and_then(|o| {
                        o.companion
                            .chapters
                            .iter()
                            .position(|c| c.location == location)
                    }) {
                        let id = match verse {
                            Some(v) => format!("lv-{index}-{v}"),
                            None => format!("lc-{index}"),
                        };
                        return crate::presented(crate::jump::to_verse_in(
                            "guide",
                            &id,
                            CONTENT_TOP + 20.0,
                        ));
                    }
                    return self.load_dock(location, verse.map(|v| (v, v)));
                }
                return self.update(Message::OpenLink(url));
            }
            LessonMsg::CloseDock => self.lessons.dock = None,
            LessonMsg::DockScroll(Some(first)) => {
                return crate::presented(crate::jump::to_verse_in(
                    "dock",
                    &format!("dock-{first}"),
                    16.0,
                ));
            }
            LessonMsg::DockScroll(None) => {
                return crate::presented(operation::snap_to(
                    "dock",
                    scrollable::RelativeOffset::START,
                ));
            }
            LessonMsg::DockVerse(v) => {
                if let Some(dock) = &mut self.lessons.dock
                    && !dock.selected.remove(&v)
                {
                    dock.selected.insert(v);
                }
            }
            LessonMsg::DockMark(i) => {
                let Some(preset) = self.preferences.presets().get(i).cloned() else {
                    return Task::none();
                };
                let Some(dock) = &self.lessons.dock else {
                    return Task::none();
                };
                let on = !dock.selected.is_empty()
                    && dock.selected.iter().all(|v| {
                        let marks = dock
                            .annotations
                            .iter()
                            .find(|a| a.verse == *v)
                            .map(|a| a.marks.clone())
                            .unwrap_or_default();
                        let text = dock
                            .verses
                            .iter()
                            .find(|x| x.number == *v)
                            .map(|x| x.text.as_str())
                            .unwrap_or("");
                        marks::colors_over(&marks, text, preset.kind, None)
                            .iter()
                            .all(|c| c.as_ref() == Some(&preset.color))
                    });
                let patch = MarksPatch::set(preset.kind, (!on).then_some(preset.color));
                let updates: Vec<Annotation> = dock
                    .selected
                    .iter()
                    .filter_map(|v| {
                        let text = dock.verses.iter().find(|x| x.number == *v)?.text.as_str();
                        let mut a = dock
                            .annotations
                            .iter()
                            .find(|a| a.verse == *v)
                            .cloned()
                            .unwrap_or(Annotation {
                                verse: *v,
                                ..Default::default()
                            });
                        a.marks = marks::apply(&a.marks, &patch, text, None);
                        Some(a)
                    })
                    .collect();
                let location = dock.location.clone();
                if let Some(s) = &mut self.store {
                    let r = s.save_annotations(&location, &updates);
                    if self.report(r).is_some() {
                        let fresh = self.store.as_ref().map(|s| s.annotations(&location));
                        if let Some(Some(fresh)) = fresh.map(|r| self.report(r))
                            && let Some(dock) = &mut self.lessons.dock
                        {
                            dock.annotations = fresh;
                        }
                        // The reader shows the same marks.
                        if location == self.preferences.last {
                            self.load_annotations();
                        }
                        self.sync_soon();
                    }
                }
            }
            LessonMsg::LogReading => {
                if let Some(source) = self.lesson_source()
                    && let Some(s) = &mut self.store
                {
                    let r = s.log_reading(&store::today(), &source);
                    if self.report(r).is_some() {
                        self.load_lesson_log();
                        self.sync_soon();
                    }
                }
            }
            LessonMsg::WriteNote => {
                if let Some(source) = self.lesson_source() {
                    self.popover = None;
                    self.set_screen(Screen::Journal);
                    let today = store::today();
                    self.journal.month = crate::journal::month_of(&today);
                    self.journal.day = today.clone();
                    self.reload_journal();
                    self.start_note(&today, Some(source), "", None);
                    return crate::presented(operation::focus("journal-body"));
                }
            }
            LessonMsg::OpenNote(id) => {
                self.popover = None;
                self.set_screen(Screen::Journal);
                self.reload_journal();
                return self.update_journal(crate::journal_ui::JournalMsg::Open(id));
            }
            LessonMsg::Credit(url) => return self.update(Message::OpenLink(url)),
            LessonMsg::Scroll(i) => {
                return crate::presented(crate::jump::to_verse_in(
                    "guide",
                    &format!("guide-sec-{i}"),
                    CONTENT_TOP,
                ));
            }
            LessonMsg::Context(i) => {
                if !self.lessons.open_context.remove(&i) {
                    self.lessons.open_context.insert(i);
                }
            }
            LessonMsg::Full(i) => {
                if !self.lessons.full.remove(&i) {
                    self.lessons.full.insert(i);
                }
            }
            LessonMsg::SelectVerse(chapter, verse) => {
                if !self.lessons.selected.remove(&(chapter, verse)) {
                    self.lessons.selected.insert((chapter, verse));
                }
            }
            LessonMsg::ClearVerses => {
                if !self.save_lesson_verse_note() {
                    return Task::none();
                }
                self.lessons.selected.clear();
                self.lessons.note = None;
                self.clear_text_selection(crate::text_selection::Area::Lesson);
            }
            LessonMsg::CopySelection => {
                let text = if self.lessons.words.is_empty() {
                    self.lesson_selected_verses_text()
                } else {
                    self.lesson_selected_text()
                };
                if !text.trim().is_empty() {
                    return iced::clipboard::write(text);
                }
            }
            LessonMsg::AddToNote => {
                let excerpt = self.lesson_excerpt();
                if !excerpt.is_empty()
                    && let Some(source) = self.lesson_source()
                {
                    self.lessons.selected.clear();
                    self.clear_text_selection(crate::text_selection::Area::Lesson);
                    return self.write_in_journal(source, format!("{excerpt}\n\n"));
                }
            }
            LessonMsg::VerseNote => {
                if let Some((c, v)) = self.lesson_selected_verses().first().copied() {
                    let body = self
                        .lessons
                        .open
                        .as_ref()
                        .and_then(|o| o.scripture.get(c))
                        .and_then(|s| s.annotations.iter().find(|a| a.verse == v))
                        .map(|a| a.note.clone())
                        .unwrap_or_default();
                    self.lessons.note =
                        Some((c, v, iced::widget::text_editor::Content::with_text(&body)));
                    return crate::presented(operation::focus("lesson-verse-note"));
                }
            }
            LessonMsg::EditVerseNote(action) => {
                if let Some((.., content)) = &mut self.lessons.note {
                    content.perform(action);
                }
            }
            LessonMsg::SaveVerseNote => {
                if self.save_lesson_verse_note() {
                    self.lessons.note = None;
                }
            }
            LessonMsg::OpenChapter(index) => {
                if let Some(chapter) = self
                    .lessons
                    .open
                    .as_ref()
                    .and_then(|o| o.companion.chapters.get(index))
                {
                    let location = chapter.location.clone();
                    return self.navigate(location, None);
                }
            }
        }
        Task::none()
    }

    pub(crate) fn guides_view(&self) -> Element<'_, Message> {
        match &self.lessons.open {
            Some(open) => self.guide_page(open),
            None => self.lesson_overview(),
        }
    }

    fn lesson_overview(&self) -> Element<'_, Message> {
        let p = self.p();
        let overview = self.lesson_today();
        let inset = shell_inset(self.window_width);
        let width = (self.window_width - 2.0 * inset).min(1180.0);
        let heading = |label: &'static str| text(label).font(serif()).size(30);
        let mut page = column![heading("This week"), space().height(18)];
        page = page.push(match &overview.current {
            Some(lesson) => self.featured_lesson(lesson, width),
            None => text(match overview.schedule {
                lessons::Schedule::After => "This year’s Come, Follow Me schedule has ended. Earlier lessons stay open below.",
                lessons::Schedule::Before => "This year’s Come, Follow Me schedule has not begun yet.",
                lessons::Schedule::During => "No lesson is scheduled for this week.",
            })
            .size(15)
            .color(p.muted)
            .into(),
        });
        for (label, lessons) in [
            ("Coming up", &overview.upcoming),
            ("Previous lessons", &overview.previous),
        ] {
            if lessons.is_empty() {
                continue;
            }
            page = page
                .push(space().height(56))
                .push(heading(label))
                .push(space().height(18))
                .push(self.lesson_grid(lessons, width));
        }
        let paintings = overview
            .current
            .iter()
            .chain(&overview.previous)
            .chain(&overview.upcoming)
            .any(|l| lessons::cover(&l.start).credit.is_some());
        page = page.push(space().height(40)).push(
            text(format!(
                "Landscape and still-life covers are illustrations generated with AI and show no people.{}",
                if paintings {
                    " Paintings of the Savior are historical public-domain works, credited on each cover and in full on each lesson."
                } else {
                    ""
                }
            ))
            .size(12)
            .color(p.faint),
        );
        // The page's own link to plans (`.plansLink`).
        page = page.push(space().height(16)).push(
            button(
                text("Your study plans")
                    .size(14)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
            )
            .padding(0)
            .on_press(Message::SetScreen(Screen::Plans))
            .style(design::link(p.accent)),
        );
        self.scroll(
            container(page.width(width))
                .padding(Padding {
                    top: CONTENT_TOP - 4.0,
                    right: inset,
                    bottom: 64.0,
                    left: inset,
                })
                .center_x(Fill),
        )
        .id("lessons")
        .height(Fill)
        .into()
    }

    fn chapter_chips<'a>(&'a self, week: &Week, p: Colors) -> Element<'a, Message> {
        let mut chips = row![].spacing(8);
        let mut lines = column![].spacing(8);
        let mut count = 0;
        for range in week.reading() {
            let read = self.store.as_ref().is_some_and(|s| {
                (range.from..=range.to).all(|c| {
                    s.is_read(&Location {
                        chapter: c,
                        ..range.first()
                    })
                    .unwrap_or(false)
                })
            });
            chips = chips.push(
                button({
                    let mut label = row![
                        text(lessons::describe_range(&range, &self.books))
                            .size(13)
                            .font(sans(font::Weight::Semibold)),
                    ]
                    .spacing(6)
                    .align_y(Center);
                    if read {
                        label = label.push(icon(&crate::icons::CHECK, p.read, 11.));
                    }
                    label
                })
                .padding([8, 13])
                .on_press(Message::Navigate(range.first(), None))
                .style(design::outlined(p, 999.0)),
            );
            count += 1;
            if count % 3 == 0 {
                lines = lines.push(chips);
                chips = row![].spacing(8);
            }
        }
        if count % 3 != 0 {
            lines = lines.push(chips);
        }
        lines.into()
    }

    fn featured_lesson(&self, lesson: &Lesson, width: f32) -> Element<'_, Message> {
        let p = self.p();
        let cover = lessons::cover(&lesson.start);
        // Below 768px the art sits above the text at 3:2 (`.featured` has one column), else beside it.
        let stacked = self.window_width < 768.0;
        let (media_w, height) = if stacked {
            (width, (width * 2.0 / 3.0).round())
        } else {
            ((width * 630.0 / 1180.0).round(), 517.0)
        };
        // The card's 14px corners on the art's side (`.featuredMedia`).
        let corners = if stacked {
            iced::border::Radius::default()
                .top_left(14.0)
                .top_right(14.0)
        } else {
            iced::border::Radius::default()
                .top_left(14.0)
                .bottom_left(14.0)
        };
        let mut media = stack![cover_image(cover, media_w, height, corners)];
        if let Some(credit) = &cover.credit {
            media = media.push(
                container(self.credit_line(credit, Color::WHITE))
                    .padding(Padding {
                        top: 0.0,
                        right: 24.0,
                        bottom: 16.0,
                        left: 15.0,
                    })
                    .width(Fill)
                    .height(Fill)
                    .align_y(iced::alignment::Vertical::Bottom)
                    .style(move |_| container::Style {
                        background: Some(
                            iced::gradient::Linear::new(iced::Degrees(180.0))
                                .add_stop(0.7, Color::TRANSPARENT)
                                .add_stop(1.0, Color::from_rgba(0., 0., 0., 0.55))
                                .into(),
                        ),
                        border: Border {
                            radius: if stacked {
                                iced::border::Radius::default()
                            } else {
                                iced::border::Radius::default().bottom_left(14.0)
                            },
                            ..Default::default()
                        },
                        ..Default::default()
                    }),
            );
        }
        let kicker = row![
            text("THIS WEEK")
                .size(12)
                .font(sans(font::Weight::Bold))
                .color(p.accent),
            text("·").size(12).color(p.faint),
            text(lesson.date_label.to_uppercase())
                .size(12)
                .font(sans(font::Weight::Semibold))
                .color(p.faint),
        ]
        .spacing(10);
        let mut body = column![
            kicker,
            text(lesson.title.clone())
                .font(serif())
                // `clamp(1.65rem, 1.25rem + 1.6vw, 2.45rem)`, as it was (40px) on a wide window.
                .size(if stacked {
                    (20.0 + self.window_width * 0.016).clamp(26.4, 39.2)
                } else {
                    40.0
                })
                .line_height(1.1),
        ]
        .spacing(14);
        match &lesson.guide {
            Some(guide) => {
                body = body
                    .push(
                        text(lesson.scripture.clone())
                            .size(13.6)
                            .font(sans(font::Weight::Semibold))
                            .color(p.accent),
                    )
                    .push(
                        text(guide.summary.clone())
                            .font(serif())
                            .size(17.6)
                            .line_height(1.55)
                            .color(p.muted),
                    );
            }
            None => {
                let note = lesson
                    .week
                    .as_ref()
                    .and_then(|w| w.suggestion.as_ref())
                    .map(|(_, n)| format!("{n}. "))
                    .unwrap_or_default();
                body = body.push(
                    text(format!("{note}There is no study guide for this week yet. You can still read the assigned scripture."))
                        .font(serif())
                        .size(17.6)
                        .color(p.muted),
                );
            }
        }
        if let Some(week) = &lesson.week {
            body = body.push(
                column![
                    text("READ THE CHAPTERS")
                        .size(11)
                        .font(sans(font::Weight::Semibold))
                        .color(p.faint),
                    self.chapter_chips(week, p)
                ]
                .spacing(10),
            );
        }
        if lesson.guide.is_some() {
            body = body.push(
                button(
                    row![
                        text("Open the study guide")
                            .size(14.4)
                            .font(sans(font::Weight::Semibold)),
                        text("→").size(14)
                    ]
                    .spacing(10)
                    .align_y(Center),
                )
                .padding([12, 20])
                .on_press(Message::Lesson(LessonMsg::Open(lesson.start.clone())))
                .style(move |_, status| button::Style {
                    background: Some(
                        if matches!(status, button::Status::Hovered) {
                            design::mix(p.ink, p.paper, 0.12)
                        } else {
                            p.ink
                        }
                        .into(),
                    ),
                    text_color: p.paper,
                    border: Border {
                        radius: 999.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }),
            );
        }
        let media = container(media).width(media_w).height(height).clip(true);
        let card: Element<'_, Message> = if stacked {
            // `padding: clamp(1.25rem, 3vw, 2.25rem)`.
            let pad = (self.window_width * 0.03).clamp(20.0, 36.0);
            column![media, container(body).padding(pad).width(Fill)].into()
        } else {
            row![media, container(body).padding([40, 36]).width(Fill)].into()
        };
        container(card)
            .width(width)
            .clip(true)
            .style(design::card(p, 14.0))
            .into()
    }

    pub(crate) fn credit_line<'a>(
        &self,
        credit: &'static lessons::Credit,
        color: Color,
    ) -> Element<'a, Message> {
        let mut words = format!(", {}, {}.", credit.artist, credit.date);
        if let Some(c) = credit.collection {
            words.push_str(&format!(" {c}."));
        }
        words.push_str(&format!(" {}, via", credit.license));
        let line = row![
            text(credit.title)
                .size(12)
                .font(design::serif_italic())
                .color(color),
            text(words).size(12).color(color),
            button(text(credit.source_label).size(12).color(color))
                .padding(0)
                .on_press(Message::Lesson(LessonMsg::Credit(credit.source_url.into())))
                .style(|_, _| button::Style::default()),
        ]
        .spacing(4)
        .wrap();
        line.into()
    }

    fn lesson_grid(&self, lessons: &[Lesson], width: f32) -> Element<'_, Message> {
        let p = self.p();
        // `repeat(auto-fill, minmax(min(100%, 17.5rem), 1fr))`: as many 280px columns as fit, at most three here.
        let columns = (((width + 30.0) / (280.0 + 30.0)).floor() as usize).clamp(1, 3);
        let gap = if columns == 3 {
            30.0
        } else {
            (self.window_width * 0.025).clamp(16.0, 28.0)
        };
        let card_w = ((width - (columns - 1) as f32 * gap) / columns as f32).floor();
        let media_h = (card_w * 9.0 / 16.0).round();
        let mut grid = column![].spacing(gap);
        for chunk in lessons.chunks(columns) {
            let mut line = row![].spacing(gap);
            for lesson in chunk {
                let cover = lessons::cover(&lesson.start);
                let corners = iced::border::Radius::default()
                    .top_left(14.0)
                    .top_right(14.0);
                let mut media = stack![cover_image(cover, card_w, media_h, corners)];
                if let Some(credit) = &cover.credit {
                    media = media.push(
                        container(
                            text(format!("{}, {}", credit.artist, credit.title))
                                .size(11)
                                .color(Color::WHITE),
                        )
                        .padding([6, 10])
                        .width(Fill)
                        .height(Fill)
                        .align_y(iced::alignment::Vertical::Bottom),
                    );
                }
                let mut body = column![
                    text(lesson.date_label.to_uppercase())
                        .size(11)
                        .font(sans(font::Weight::Semibold))
                        .color(p.faint),
                    text(lesson.scripture.clone())
                        .size(13)
                        .font(sans(font::Weight::Semibold))
                        .color(p.accent),
                    text(lesson.title.clone())
                        .font(serif())
                        .size(22)
                        .line_height(1.2),
                ]
                .spacing(8);
                if let Some(guide) = &lesson.guide {
                    body = body.push(
                        text(guide.summary.clone())
                            .size(13.6)
                            .line_height(1.5)
                            .color(p.muted),
                    );
                }
                let card = button(column![
                    container(media).width(card_w).height(media_h).clip(true),
                    container(body).padding(20)
                ])
                .padding(0)
                .width(card_w)
                .on_press_maybe(
                    lesson
                        .week
                        .is_some()
                        .then(|| Message::Lesson(LessonMsg::Open(lesson.start.clone()))),
                )
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
                        radius: 14.0.into(),
                    },
                    shadow: design::soft_shadow(p),
                    ..Default::default()
                });
                line = line.push(container(card).clip(true));
            }
            grid = grid.push(line);
        }
        grid.into()
    }

    fn guide_page<'a>(&'a self, open: &'a OpenGuide) -> Element<'a, Message> {
        self.lesson_page(open)
    }

    pub(crate) fn dock_view<'a>(&'a self, dock: &'a Dock) -> Element<'a, Message> {
        let p = self.p();
        let dark = self.preferences.dark;
        let font = self.reading_font();
        let size = 16.0;
        let close = button(
            container(icon(&crate::icons::XMARK, p.ink, 13.))
                .center_x(32)
                .center_y(32),
        )
        .padding(0)
        .on_press(Message::Lesson(LessonMsg::CloseDock))
        .style(design::circle(p));
        let mut head = column![
            row![text(&dock.label).font(serif()).size(22).width(Fill), close].align_y(Center),
        ]
        .spacing(10);
        let presets = self.preferences.presets();
        if !dock.selected.is_empty() {
            let mut quick = row![].spacing(2).align_y(Center);
            for (i, preset) in presets.iter().enumerate() {
                quick = quick.push(
                    button(crate::view_marks::sample(
                        preset.kind,
                        &preset.color,
                        dark,
                        p.ink,
                    ))
                    .padding(3)
                    .on_press(Message::Lesson(LessonMsg::DockMark(i)))
                    .style(design::quiet(p)),
                );
            }
            head = head.push(quick);
        }
        head = head.push(
            row![
                text(if dock.selected.is_empty() {
                    "Select verse numbers to mark them.".to_string()
                } else {
                    format!(
                        "{} selected",
                        crate::journal::plural(dock.selected.len(), "verse", "verses")
                    )
                })
                .size(12)
                .color(p.faint)
                .width(Fill),
                button(
                    text("Open in reader")
                        .size(12)
                        .font(sans(font::Weight::Semibold))
                )
                .padding([5, 10])
                .on_press(Message::Navigate(
                    dock.location.clone(),
                    dock.selected.first().copied().or(dock.focus.map(|f| f.0))
                ))
                .style(design::outlined(p, 999.0)),
            ]
            .align_y(Center),
        );
        let mut verses = column![].spacing(6);
        for verse in &dock.verses {
            let focused = dock
                .focus
                .is_some_and(|(a, b)| verse.number >= a && verse.number <= b);
            let selected = dock.selected.contains(&verse.number);
            let marks = dock
                .annotations
                .iter()
                .find(|a| a.verse == verse.number)
                .map(|a| a.marks.clone())
                .unwrap_or_default();
            let runs: Vec<Run> = if marks.is_empty() {
                vec![]
            } else {
                marks::segments(&marks, &verse.text)
                    .into_iter()
                    .map(|s| Run {
                        text: verse.text[s.start..s.end].to_string(),
                        highlight: s.highlight.map(|c| c.highlight(dark)),
                        underline: s.underline.map(|c| c.underline(dark)),
                    })
                    .collect()
            };
            let words = mark_layer::marks(
                // Shaped and wrapped exactly as the mark layer lays out its runs.
                text(&verse.text)
                    .font(font)
                    .size(size)
                    .line_height(iced::widget::text::LineHeight::Absolute(26.0.into()))
                    .shaping(iced::widget::text::Shaping::Advanced)
                    .wrapping(iced::widget::text::Wrapping::Word)
                    .width(Fill)
                    .into(),
                runs,
                font,
                size,
                26.0,
            );
            let number = button(
                text(verse.number.to_string())
                    .size(11.5)
                    .font(sans(font::Weight::Semibold))
                    .color(if selected { p.paper } else { p.accent }),
            )
            .padding([2, 6])
            .on_press(Message::Lesson(LessonMsg::DockVerse(verse.number)))
            .style(move |_, _| button::Style {
                background: selected.then(|| p.ink.into()),
                border: Border {
                    radius: 8.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            });
            verses = verses.push(
                container(row![container(number).width(34), words].align_y(iced::Alignment::Start))
                    .id(format!("dock-{}", verse.number))
                    .padding([6, 8])
                    .style(move |_| container::Style {
                        background: focused.then(|| p.soft.into()),
                        border: Border {
                            radius: 8.0.into(),
                            ..Default::default()
                        },
                        ..Default::default()
                    }),
            );
        }
        container(
            column![
                head,
                self.scroll(verses.padding(Padding::ZERO.right(10)))
                    .id("dock")
                    .height(Fill)
            ]
            .spacing(12),
        )
        .padding(18)
        .width(DOCK)
        .height(Fill)
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

    /// The header pill on a lesson: its contents and its log (`ReaderHeaderSlot` on the lesson page).
    pub(crate) fn lesson_pill(&self) -> Element<'_, Message> {
        let p = self.p();
        let item = |glyph: &'static crate::icons::Icon, label: &'static str, popover: Popover| {
            let open = self.popover == Some(popover);
            button(
                container(
                    row![
                        icon(glyph, if open { p.paper } else { p.ink }, 13.),
                        text(label).size(13).font(sans(font::Weight::Semibold))
                    ]
                    .spacing(8)
                    .align_y(Center),
                )
                .center_y(36),
            )
            .padding([0, 14])
            .height(36)
            .on_press(Message::TogglePopover(popover))
            .style(move |_, status| button::Style {
                background: if open {
                    Some(p.ink.into())
                } else if matches!(status, button::Status::Hovered) {
                    Some(p.hover.into())
                } else {
                    None
                },
                text_color: if open { p.paper } else { p.ink },
                border: Border {
                    radius: 11.2.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
        };
        container(
            row![
                item(&crate::icons::BARS, "Contents", Popover::Contents),
                item(&crate::icons::BOOK, "Log", Popover::LessonLog)
            ]
            .spacing(4)
            .align_y(Center),
        )
        .padding([5, 6])
        .height(PILL_HEIGHT)
        .style(design::pill(p))
        .into()
    }

    /// Whether a contents entry shows its passages: as last toggled, else open when it is the current entry.
    pub(crate) fn contents_entry_open(&self, section: usize) -> bool {
        self.lessons
            .contents_toggled
            .get(&section)
            .copied()
            .unwrap_or(self.lessons.contents_current == Some(section))
    }
    /// The lesson's contents (`ContentsNav`'s drawer): a sheet from the left edge over a dimmed page, its entries
    /// grouped by part, each chapter one compact row whose passages open beneath it. Choosing an entry jumps
    /// there and closes the drawer; the backdrop, × and Escape close it.
    pub(crate) fn contents_drawer(&self) -> Element<'_, Message> {
        let p = self.p();
        let items = self
            .lessons
            .open
            .as_ref()
            .map(|open| contents(&open.sections, &open.companion))
            .unwrap_or_default();
        let ink2 = design::mix(p.ink, p.muted, 0.45);
        let mut groups = column![].spacing(16);
        for group in [
            ContentsGroup::Introduction,
            ContentsGroup::Guide,
            ContentsGroup::Chapters,
            ContentsGroup::Closing,
        ] {
            let in_group: Vec<&ContentsItem> = items.iter().filter(|i| i.group == group).collect();
            if in_group.is_empty() {
                continue;
            }
            let mut list = column![].spacing(1.6);
            for item in in_group {
                let current = self.lessons.contents_current == Some(item.section);
                let label: Element<'_, Message> = match &item.chapter {
                    Some((reference, subtitle)) => {
                        let mut spans = vec![
                            iced::widget::span(reference.clone())
                                .font(sans(font::Weight::Semibold))
                                .color(p.accent),
                        ];
                        if let Some(subtitle) = subtitle {
                            spans.push(
                                iced::widget::span(format!(" {subtitle}"))
                                    .font(sans(if current {
                                        font::Weight::Semibold
                                    } else {
                                        font::Weight::Normal
                                    }))
                                    .color(ink2),
                            );
                        }
                        iced::widget::rich_text::<(), _, _, _>(spans)
                            .size(13.5)
                            .line_height(1.35)
                            .width(Fill)
                            .into()
                    }
                    None => text(item.title.clone())
                        .size(13.5)
                        .line_height(1.35)
                        .font(sans(if current {
                            font::Weight::Semibold
                        } else {
                            font::Weight::Normal
                        }))
                        .color(if current { p.accent } else { p.ink })
                        .width(Fill)
                        .into(),
                };
                let link = button(label)
                    .padding([4.8, 0.0])
                    .width(Fill)
                    .on_press(Message::Lesson(LessonMsg::Jump(item.section)))
                    .style(move |_, status| button::Style {
                        text_color: if matches!(status, button::Status::Hovered) {
                            p.accent
                        } else {
                            p.ink
                        },
                        ..Default::default()
                    });
                let mut entry = row![link]
                    .spacing(4)
                    .align_y(iced::alignment::Vertical::Top);
                let open = self.contents_entry_open(item.section);
                if !item.passages.is_empty() {
                    let chevron = design::rotated_icon(
                        &crate::icons::CHEVRON_DOWN,
                        p.muted,
                        10.,
                        if open { 180.0 } else { 0.0 },
                    );
                    let toggle = button(container(chevron).center_x(32).center_y(32))
                        .padding(0)
                        .on_press(Message::Lesson(LessonMsg::ToggleContents(item.section)))
                        .style(move |_, status| button::Style {
                            background: matches!(status, button::Status::Hovered)
                                .then(|| p.hover.into()),
                            border: Border {
                                radius: 3.0.into(),
                                ..Default::default()
                            },
                            ..Default::default()
                        });
                    entry = entry.push(self.hint(
                        toggle,
                        format!(
                            "{} passages in {}",
                            if open { "Hide" } else { "Show" },
                            item.chapter.as_ref().map_or(&item.title, |c| &c.0)
                        ),
                    ));
                }
                let mut block = column![entry];
                if open && !item.passages.is_empty() {
                    let mut passages = column![];
                    for (section, short, title) in &item.passages {
                        let mut spans = vec![];
                        if !short.is_empty() {
                            spans.push(
                                iced::widget::span(format!("{short} "))
                                    .font(sans(font::Weight::Semibold))
                                    .color(p.accent),
                            );
                        }
                        spans.push(iced::widget::span(title.clone()).color(ink2));
                        passages = passages.push(
                            button(
                                iced::widget::rich_text::<(), _, _, _>(spans)
                                    .size(13.5)
                                    .line_height(1.35)
                                    .width(Fill),
                            )
                            .padding([4, 0])
                            .width(Fill)
                            .on_press(Message::Lesson(LessonMsg::Jump(*section)))
                            .style(|_, _| button::Style::default()),
                        );
                    }
                    block = block.push(container(passages).padding(Padding {
                        top: 0.0,
                        right: 0.0,
                        bottom: 6.4,
                        left: 12.0,
                    }));
                }
                list = list.push(block);
            }
            groups = groups.push(
                column![
                    text(group.label().to_uppercase())
                        .size(10)
                        .font(sans(font::Weight::Semibold))
                        .color(p.muted),
                    // The list sizes the stack; its rule (`border-left`) runs down beside it.
                    stack![
                        container(list).padding(Padding::ZERO.left(12)).width(Fill),
                        container(space().width(1).height(Fill)).style(move |_| {
                            container::Style {
                                background: Some(p.rule.into()),
                                ..Default::default()
                            }
                        }),
                    ],
                ]
                .spacing(4),
            );
        }
        let close = button(
            container(icon(&crate::icons::XMARK, p.muted, 14.))
                .center_x(44)
                .center_y(44),
        )
        .padding(0)
        .on_press(Message::ClosePopover)
        .style(|_, _| button::Style::default());
        let head = row![
            text("CONTENTS")
                .size(11)
                .font(sans(font::Weight::Semibold))
                .color(p.muted)
                .width(Fill),
            self.hint(close, "Close contents".into()),
        ]
        .align_y(Center)
        .padding(Padding::ZERO.right(8));
        let width = (self.window_width * 0.88).min(352.0);
        let sheet = container(
            column![
                head,
                self.scroll(container(groups).padding(Padding {
                    top: 4.0,
                    right: 16.0,
                    bottom: 24.0,
                    left: 0.0,
                }))
                .id("contents-drawer")
                .height(Fill),
            ]
            .spacing(4),
        )
        .padding(Padding {
            top: 12.0,
            right: 0.0,
            bottom: 0.0,
            left: 16.0,
        })
        .width(width)
        .height(Fill)
        .style(move |_| container::Style {
            background: Some(p.paper.into()),
            text_color: Some(p.ink),
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 0.0.into(),
            },
            ..Default::default()
        });
        let backdrop =
            iced::widget::mouse_area(container(space()).width(Fill).height(Fill).style(|_| {
                container::Style {
                    background: Some(Color::from_rgba(0.0, 0.0, 0.0, 0.35).into()),
                    ..Default::default()
                }
            }))
            .on_press(Message::ClosePopover);
        stack![backdrop, iced::widget::opaque(sheet)]
            .width(Fill)
            .height(Fill)
            .into()
    }

    pub(crate) fn lesson_log_panel(&self) -> Element<'_, Message> {
        let p = self.p();
        let logged = self.lessons.logged;
        let mut panel = column![
            text("Log").size(15).font(sans(font::Weight::Semibold)),
            text("Record today's study of this lesson, or write about it in your journal.")
                .size(12.5)
                .color(p.muted),
            button(
                row![
                    icon(
                        &crate::icons::CHECK,
                        if logged { p.paper } else { p.read },
                        13.
                    ),
                    text(if logged {
                        "Reading logged today"
                    } else {
                        "Log this lesson's reading"
                    })
                    .size(13)
                    .font(sans(font::Weight::Semibold))
                ]
                .spacing(8)
                .align_y(Center),
            )
            .padding([9, 12])
            .width(Fill)
            .on_press_maybe((!logged).then_some(Message::Lesson(LessonMsg::LogReading)))
            .style(move |_, _| button::Style {
                background: Some(if logged { p.read } else { p.soft }.into()),
                text_color: if logged { p.paper } else { p.ink },
                border: Border {
                    radius: 11.2.into(),
                    ..Default::default()
                },
                ..Default::default()
            }),
            button(
                row![
                    icon(&crate::icons::PEN_TO_SQUARE, p.accent, 13.),
                    text("Write about this lesson").size(13)
                ]
                .spacing(10)
                .align_y(Center),
            )
            .padding([9, 12])
            .width(Fill)
            .on_press(Message::Lesson(LessonMsg::WriteNote))
            .style(design::quiet(p)),
        ]
        .spacing(10);
        if !self.lessons.notes.is_empty() {
            panel = panel.push(text("Notes on this lesson").size(12).color(p.faint));
            for note in &self.lessons.notes {
                panel = panel.push(
                    button(
                        column![
                            text(note.display_title()).font(serif()).size(15),
                            text(crate::journal::day_heading(&note.journal_date))
                                .size(11)
                                .color(p.faint)
                        ]
                        .spacing(2),
                    )
                    .padding([7, 10])
                    .width(Fill)
                    .on_press(Message::Lesson(LessonMsg::OpenNote(note.id.clone())))
                    .style(design::quiet(p)),
                );
            }
        }
        container(panel)
            .padding(14)
            .style(design::popover(p))
            .into()
    }
}

/// The verse a churchofjesuschrist.org link points at (`id=p13` or `#p13`).
fn verse_in_url(url: &str) -> Option<u32> {
    let marker = url
        .rsplit(['#', '&', '?'])
        .find(|part| part.strip_prefix("id=").unwrap_or(part).starts_with('p'))?;
    let id = marker.strip_prefix("id=").unwrap_or(marker);
    id.strip_prefix('p')?
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn church_links_name_their_verse() {
        assert_eq!(
            verse_in_url(
                "https://www.churchofjesuschrist.org/study/scriptures/ot/jer/31?lang=eng&id=p13#p13"
            ),
            Some(13)
        );
        assert_eq!(
            verse_in_url("https://www.churchofjesuschrist.org/study/scriptures/ot/jer/43?lang=eng"),
            None
        );
    }
}
