// Come, Follow Me, after the website's LessonOverview and lesson page: this week's featured lesson and earlier
// lessons with their covers; a lesson's hero, contents and guide text; a scripture dock beside the guide that reads
// and marks the passage a section discusses (the same verse marks as the reader); and the lesson's log.
use crate::design::{self, Colors, icon, sans, serif};
use crate::header::{CONTENT_TOP, PILL_HEIGHT, TOP, shell_inset};
use crate::lessons::{self, Lesson, Section, Week};
use crate::mark_layer::{self, Run};
use crate::marks::{self, MarksPatch};
use crate::store::{self, Annotation, Location, Note, NoteSource, Verse};
use crate::{App, Message, Popover, Screen};
use iced::widget::{
    button, column, container, image, markdown, operation, row, scrollable, space, stack, text,
};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, Task, font};
use std::collections::{BTreeSet, HashMap};
use std::sync::{Mutex, OnceLock};

const ARTICLE: f32 = 736.0;
const DOCK: f32 = 400.0;

fn cover_image(
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
    pub markdown: Vec<Vec<markdown::Item>>,
    /// The sections' prose as selectable, markable blocks.
    pub prose: crate::guide_marks::GuideProse,
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
}

#[derive(Debug, Clone)]
pub enum LessonMsg {
    Open(String),
    Back,
    Jump(usize),
    Link(String),
    Dock(Location, Option<(u32, u32)>),
    CloseDock,
    DockScroll(Option<u32>),
    DockVerse(u32),
    DockMark(usize),
    LogReading,
    WriteNote,
    OpenNote(String),
    Credit(String),
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
        let markdown = sections
            .iter()
            .map(|s| markdown::parse(&s.body).collect())
            .collect();
        let prose = crate::guide_marks::GuideProse::new(&sections);
        self.lessons.open = Some(OpenGuide {
            lesson,
            sections,
            markdown,
            prose,
        });
        self.lessons.dock = None;
        self.lessons.guide = Default::default();
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
    fn lesson_source(&self) -> Option<NoteSource> {
        let open = self.lessons.open.as_ref()?;
        let label = match &open.lesson.guide {
            Some(g) => format!("{}: {}", g.scripture, g.title),
            None => open.lesson.title.clone(),
        };
        Some(NoteSource::lesson(&open.lesson.start, &label))
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
            LessonMsg::Jump(i) => {
                self.popover = None;
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
                    return self.load_dock(location, verse.map(|v| (v, v)));
                }
                return self.update(Message::OpenLink(url));
            }
            LessonMsg::Dock(location, verses) => return self.load_dock(location, verses),
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
                    return crate::presented(operation::focus("journal-title"));
                }
            }
            LessonMsg::OpenNote(id) => {
                self.popover = None;
                self.set_screen(Screen::Journal);
                self.reload_journal();
                return self.update_journal(crate::journal_ui::JournalMsg::Open(id));
            }
            LessonMsg::Credit(url) => return self.update(Message::OpenLink(url)),
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
        let media_w = (width * 630.0 / 1180.0).round();
        let height = 517.0;
        // The card's 14px corners on the art's side (`.featuredMedia`).
        let corners = iced::border::Radius::default()
            .top_left(14.0)
            .bottom_left(14.0);
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
                    .style(|_| container::Style {
                        background: Some(
                            iced::gradient::Linear::new(iced::Degrees(180.0))
                                .add_stop(0.7, Color::TRANSPARENT)
                                .add_stop(1.0, Color::from_rgba(0., 0., 0., 0.55))
                                .into(),
                        ),
                        border: Border {
                            radius: iced::border::Radius::default().bottom_left(14.0),
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
                .size(40)
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
        container(row![
            container(media).width(media_w).height(height).clip(true),
            container(body).padding([40, 36]).width(Fill),
        ])
        .width(width)
        .clip(true)
        .style(design::card(p, 14.0))
        .into()
    }

    fn credit_line<'a>(
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
        let gap = 30.0;
        let card_w = ((width - 2.0 * gap) / 3.0).floor();
        let media_h = (card_w * 9.0 / 16.0).round();
        let mut grid = column![].spacing(gap);
        for chunk in lessons.chunks(3) {
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
        let p = self.p();
        let lesson = &open.lesson;
        let cover = lessons::cover(&lesson.start);
        let dock_w = if self.lessons.dock.is_some() {
            DOCK + 24.0
        } else {
            0.0
        };
        let page_w = self.window_width - dock_w;
        let hero_h = 570.0;
        let paper = p.paper;
        let hero = stack![
            cover_image(cover, page_w.max(1.0), hero_h, 0.0.into()).opacity(0.92_f32),
            container(space())
                .width(Fill)
                .height(Fill)
                .style(move |_| container::Style {
                    background: Some(
                        iced::gradient::Linear::new(iced::Degrees(180.0))
                            .add_stop(0.0, Color { a: 0.0, ..paper })
                            .add_stop(0.55, Color { a: 0.0, ..paper })
                            .add_stop(1.0, paper)
                            .into(),
                    ),
                    ..Default::default()
                }),
        ]
        .width(Fill)
        .height(hero_h);
        let rubric = row![
            text(lesson.scripture.to_uppercase())
                .size(12.5)
                .font(sans(font::Weight::Bold))
                .color(p.accent),
            text("·").size(12).color(p.faint),
            text(lesson.date_label.to_uppercase())
                .size(12.5)
                .font(sans(font::Weight::Semibold))
                .color(p.faint),
        ]
        .spacing(10)
        .wrap();
        let mut article = column![
            button(
                row![text("←").size(13), text("All lessons").size(13)]
                    .spacing(4)
                    .align_y(Center)
            )
            .padding(0)
            .on_press(Message::Lesson(LessonMsg::Back))
            .style(design::link(p.muted)),
            space().height(12),
            rubric,
            space().height(10),
            text(&lesson.title).font(serif()).size(48).line_height(1.12),
        ]
        .spacing(0);
        if let Some(guide) = &lesson.guide {
            article = article.push(space().height(16)).push(
                text(&guide.summary)
                    .font(serif())
                    .size(19)
                    .line_height(1.5)
                    .color(p.muted),
            );
        }
        if let Some(credit) = &cover.credit {
            article = article
                .push(space().height(14))
                .push(self.credit_line(credit, p.faint));
        }
        if let Some(week) = &lesson.week {
            article = article
                .push(space().height(24))
                .push(
                    text("READ THE CHAPTERS")
                        .size(11)
                        .font(sans(font::Weight::Semibold))
                        .color(p.faint),
                )
                .push(space().height(10))
                .push(self.chapter_chips(week, p));
        }
        if open.sections.is_empty() {
            article = article.push(space().height(32)).push(
                text("There is no study guide for this week yet. You can still read the assigned scripture.")
                    .font(serif())
                    .size(17)
                    .color(p.muted),
            );
        }
        let mut style = markdown::Style::from(self.theme());
        style.font = serif();
        style.link_color = p.accent;
        for (i, (section, items)) in open.sections.iter().zip(&open.markdown).enumerate() {
            let mut settings = markdown::Settings::with_text_size(18, style);
            settings.h2_size = 30.into();
            settings.h3_size = 22.into();
            let mut block = column![].spacing(10);
            if let Some((location, verses)) = &section.passage {
                block = block.push(
                    button(
                        row![
                            icon(&crate::icons::BOOK_OPEN, p.accent, 12.),
                            text(format!("Read {}", passage_label(section)))
                                .size(12.5)
                                .font(sans(font::Weight::Semibold))
                        ]
                        .spacing(8)
                        .align_y(Center),
                    )
                    .padding([6, 12])
                    .on_press(Message::Lesson(LessonMsg::Dock(location.clone(), *verses)))
                    .style(design::outlined(p, 999.0)),
                );
            }
            let _ = (items, settings);
            let mut prose = column![].spacing(14);
            for (j, b) in open.prose.blocks[i].iter().enumerate() {
                prose = prose.push(self.guide_block(i, j, b, 18.0));
            }
            block = block.push(prose);
            article = article.push(
                container(block)
                    .id(format!("guide-sec-{i}"))
                    .padding(Padding::ZERO.top(if section.level == 3 { 14.0 } else { 28.0 })),
            );
        }
        let body = column![
            hero,
            container(article.max_width(ARTICLE).padding(Padding::ZERO.bottom(96)))
                .padding(Padding::ZERO.top(-0.0).left(24).right(24))
                .center_x(Fill)
        ];
        let guide = self.scroll(body).id("guide").width(Fill).height(Fill);
        // The same structure with or without the dock, so the guide keeps its scroll position.
        let dock: Element<'_, Message> = match &self.lessons.dock {
            Some(dock) => container(self.dock_view(dock))
                .padding(Padding {
                    top: CONTENT_TOP,
                    right: shell_inset(self.window_width).min(32.0),
                    bottom: 16.0,
                    left: 12.0,
                })
                .into(),
            None => space().width(0).into(),
        };
        row![guide, dock].height(Fill).into()
    }

    fn dock_view<'a>(&'a self, dock: &'a Dock) -> Element<'a, Message> {
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

    pub(crate) fn contents_panel(&self) -> Element<'_, Message> {
        let p = self.p();
        let mut list = column![].spacing(1);
        if let Some(open) = &self.lessons.open {
            for (i, section) in open.sections.iter().enumerate() {
                list = list.push(
                    button(
                        text(&section.title)
                            .size(if section.level == 3 { 12.5 } else { 13.5 })
                            .font(sans(if section.level == 3 {
                                font::Weight::Normal
                            } else {
                                font::Weight::Semibold
                            }))
                            .color(if section.level == 3 { p.muted } else { p.ink }),
                    )
                    .padding(Padding {
                        top: 6.0,
                        right: 10.0,
                        bottom: 6.0,
                        left: if section.level == 3 { 22.0 } else { 10.0 },
                    })
                    .width(Fill)
                    .on_press(Message::Lesson(LessonMsg::Jump(i)))
                    .style(design::quiet(p)),
                );
            }
        }
        container(self.scroll(list).height(Length::Shrink))
            .padding(10)
            .max_height((self.window_height - TOP - PILL_HEIGHT - 40.0).max(200.0))
            .style(design::popover(p))
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

fn passage_label(section: &Section) -> String {
    section
        .title
        .split(['—', ':'])
        .next()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| {
            // "Jeremiah 31:1–3 — …" keeps its verses; "Jeremiah 32: …" is the chapter.
            match section.title.split('—').next() {
                Some(head)
                    if head.contains(':')
                        && head
                            .trim()
                            .chars()
                            .last()
                            .is_some_and(|c| c.is_ascii_digit()) =>
                {
                    head.trim().to_string()
                }
                _ => s,
            }
        })
        .unwrap_or_default()
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
        let section = Section {
            level: 3,
            title: "Jeremiah 31:1–3 — Everlasting Love".into(),
            body: String::new(),
            passage: None,
        };
        assert_eq!(passage_label(&section), "Jeremiah 31:1–3");
        let chapter = Section {
            title: "Jeremiah 32: A Field Bought in a Falling Land".into(),
            ..section
        };
        assert_eq!(passage_label(&chapter), "Jeremiah 32");
    }
}
