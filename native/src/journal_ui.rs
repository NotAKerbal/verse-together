// The Journal screen, after the website's JournalWorkspace and JournalHome: a month calendar with weekly goals in
// the left rail and the selected day in the main card. Opening a note glides the day's list into the rail (280ms,
// cubic-bezier(0.2, 0, 0, 1)) while the calendar fades out and the note fades in from the right.
use crate::anim::{CubicBezier, NAV, Transition};
use crate::design::{self, Colors, icon, sans, serif};
use crate::header::CONTENT_TOP;
use crate::icons;
use crate::journal::{self, Entry, REFLECTION_PROMPTS, WEEKDAYS};
use crate::store::{self, JournalGoals, Note, NoteSource};
use crate::{App, Message};
use iced::widget::{
    button, column, container, image, markdown, mouse_area, opaque, pin, row, space, stack, text,
    text_editor, text_input,
};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, Task, font};
use std::sync::OnceLock;
use std::time::Instant;

const NOTES_EASE: CubicBezier = CubicBezier::new(0.2, 0.0, 0.0, 1.0);
const GAP: f32 = 20.0;
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
    pub body: text_editor::Content,
    pub dirty: bool,
    pub preview: bool,
    pub markdown: Vec<markdown::Item>,
    pub confirm_delete: bool,
    /// The reflection prompt the note was started from, shown until something is written.
    pub prompt: Option<String>,
}
pub struct JournalState {
    pub month: String,
    pub day: String,
    pub entries: Vec<Entry>,
    /// Every note, for the reflection worth revisiting.
    pub notes: Vec<Note>,
    pub prompt: usize,
    pub open: Option<OpenNote>,
    /// 0 with the calendar showing, 1 with a note open.
    pub motion: Transition,
    pub goal_draft: Option<JournalGoals>,
    pub goal_error: Option<String>,
    pub goals_saved: bool,
    /// Something the journal needs to tell the reader (shown above the note).
    pub notice: Option<String>,
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
            motion: Transition::new(0.0, NAV, NOTES_EASE, now),
            goal_draft: None,
            goal_error: None,
            goals_saved: false,
            notice: None,
        }
    }
}

#[derive(Debug, Clone)]
pub enum JournalMsg {
    Month(i32),
    Today,
    Day(String),
    /// A new note for the selected day, optionally from a reflection prompt.
    New(Option<String>),
    NextPrompt,
    Open(String),
    Close,
    Title(String),
    Body(text_editor::Action),
    Save,
    Preview(bool),
    ToggleReading,
    Delete,
    ConfirmDelete(bool),
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
    }
    /// Saves the open note if it changed. Returns false (keeping the draft) when saving fails.
    pub(crate) fn save_journal_note(&mut self) -> bool {
        let Some(open) = &mut self.journal.open else {
            return true;
        };
        if !open.dirty {
            return true;
        }
        open.note.body = open.body.text();
        // A note nobody wrote anything in is not kept.
        let empty = open.note.title.trim().is_empty()
            && open.note.body.trim().is_empty()
            && open.note.reading_at.is_none();
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
            if let Some(saved) = saved {
                // Later saves from this editor continue the note it saved to.
                open.note.id = saved.id;
                open.note.rev = saved.rev;
                if saved.forked {
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
        let target = if open.is_some() { 1.0 } else { 0.0 };
        self.journal.open = open;
        self.journal
            .motion
            .set(target, self.now, self.motion.animate);
    }
    pub(crate) fn open_note(&mut self, note: Note, prompt: Option<String>) {
        let body = text_editor::Content::with_text(&note.body);
        let markdown = markdown::parse(&note.body).collect();
        self.journal.month = journal::month_of(&note.journal_date);
        self.journal.day = note.journal_date.clone();
        self.set_note_open(Some(OpenNote {
            note,
            body,
            dirty: false,
            preview: false,
            markdown,
            confirm_delete: false,
            prompt,
        }));
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
                self.reload_journal();
            }
            JournalMsg::Day(day) => {
                if !self.save_journal_note() {
                    return Task::none();
                }
                self.journal.day = day;
                self.set_note_open(None);
            }
            JournalMsg::New(prompt) => {
                if !self.save_journal_note() {
                    return Task::none();
                }
                let day = self.journal.day.clone();
                self.start_note(&day, None, "", prompt);
                return crate::presented(iced::widget::operation::focus("journal-title"));
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
                    self.set_note_open(None);
                }
            }
            JournalMsg::Title(title) => {
                if let Some(open) = &mut self.journal.open {
                    open.note.title = title.chars().take(store::NOTE_TITLE_MAX).collect();
                    open.dirty = true;
                }
            }
            JournalMsg::Body(action) => {
                if let Some(open) = &mut self.journal.open {
                    open.dirty |= action.is_edit();
                    open.body.perform(action);
                }
            }
            JournalMsg::Save => {
                self.save_journal_note();
            }
            JournalMsg::Preview(preview) => {
                if let Some(open) = &mut self.journal.open {
                    open.preview = preview;
                    if preview {
                        open.markdown = markdown::parse(&open.body.text()).collect();
                    }
                }
            }
            JournalMsg::ToggleReading => {
                if let Some(open) = &mut self.journal.open
                    && open.note.source.is_some()
                {
                    open.note.reading_at = match open.note.reading_at {
                        Some(_) => None,
                        None => Some(store::now()),
                    };
                    open.dirty = true;
                }
            }
            JournalMsg::Delete => {
                if let Some(open) = &mut self.journal.open {
                    open.confirm_delete = true;
                }
            }
            JournalMsg::ConfirmDelete(confirm) => {
                if let Some(open) = &mut self.journal.open {
                    open.confirm_delete = false;
                    if confirm {
                        let id = open.note.id.clone();
                        if let Some(s) = &mut self.store {
                            let r = s.delete_note(&id);
                            if self.report(r).is_some() {
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
                pin(container(self.note_card(open, p.faded(t), t == 1.0))
                    .width(main_w)
                    .height(height))
                .x(main_x + 24.0 * (1.0 - t)),
            ),
            None => space().into(),
        });
        // The day's card: the main area when the calendar shows, the rail when a note is open.
        let chooser_x = main_x * (1.0 - t);
        let chooser_w = main_w + (rail - main_w) * t;
        layers = layers.push(
            pin(container(self.chooser_card(t > 0.5))
                .width(chooser_w)
                .height(height))
            .x(chooser_x),
        );
        let mut page = stack![container(layers).padding(Padding {
            top: CONTENT_TOP,
            right: gutter,
            bottom: 32.0,
            left: gutter,
        })]
        .width(Fill)
        .height(Fill);
        if let Some(goals) = self.journal.goal_draft {
            page = page.push(self.goal_dialog(goals));
        }
        page.into()
    }

    fn calendar_card(&self, p: Colors, interactive: bool) -> Element<'_, Message> {
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
                .size(19)
                .width(Fill),
            nav(&icons::CHEVRON_LEFT, -1),
            button(
                container(text("Today").size(14).font(sans(font::Weight::Medium))).center_y(Fill)
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
                    None => Element::from(space().width(Fill).height(36)),
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
                            .padding(Padding::ZERO.top(6)),
                        )
                        .padding(0)
                        .width(Fill)
                        .height(36)
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
            space().height(14),
            self.goals_section(p, &today, interactive),
        ];
        container(self.scroll(container(content).padding(20)).height(Fill))
            .width(Fill)
            .height(Fill)
            .style(design::card(p, 12.0))
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
        let goal = |glyph: &'static icons::Icon,
                    title: String,
                    count: usize,
                    target: u32,
                    hint: &'static str| {
            row![
                goal_icon(glyph),
                column![
                    text(title).font(serif()).size(16.3),
                    row![
                        bar(count, target),
                        row![
                            text(count.to_string())
                                .size(12.8)
                                .font(sans(font::Weight::Semibold)),
                            text(format!(" / {target}")).size(12.8).color(p.muted),
                        ]
                    ]
                    .spacing(13)
                    .align_y(Center),
                    text(hint).size(11.8).color(p.muted),
                ]
                .spacing(8)
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
        let edit = button(
            row![
                icon(&icons::PEN, p.accent, 12.),
                text("Edit goals")
                    .size(12.5)
                    .font(sans(font::Weight::Semibold))
            ]
            .spacing(7)
            .align_y(Center),
        )
        .padding([6, 0])
        .on_press_maybe(interactive.then_some(Message::Journal(JournalMsg::EditGoals)))
        .style(design::link(p.accent));
        let mut weekly = column![
            row![
                text("Weekly goals").font(serif()).size(20.8).width(Fill),
                edit
            ]
            .align_y(Center),
            text(format!(
                "{} – {}",
                journal::short_date(&start),
                journal::short_date(&end)
            ))
            .size(12)
            .color(p.faint),
            space().height(10),
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
            space().height(14),
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
        ]
        .spacing(4);
        if self.journal.goals_saved {
            weekly = weekly.push(text("Weekly goals saved.").size(12).color(p.muted));
        }
        let month_days = progress.month_study_days;
        let month = column![
            row![
                text("This month").font(serif()).size(20.8).width(Fill),
                text(journal::month_heading(&journal::month_of(today)))
                    .size(11.5)
                    .color(p.faint)
            ]
            .align_y(Center),
            space().height(8),
            row![
                goal_icon(&icons::CALENDAR_DAYS),
                column![
                    text(format!(
                        "{} of study",
                        journal::plural(month_days, "day", "days")
                    ))
                    .font(serif())
                    .size(18.4),
                    text(if month_days > 0 {
                        "You're showing up. Keep going."
                    } else {
                        "A fresh moment to begin."
                    })
                    .size(11.8)
                    .color(p.muted),
                ]
                .spacing(8)
                .width(Fill),
            ]
            .spacing(16)
            .align_y(Center),
        ]
        .spacing(4);
        column![
            rule(),
            space().height(21),
            weekly,
            space().height(19),
            rule(),
            space().height(21),
            month
        ]
        .into()
    }

    /// The selected day: its heading, the invitation to reflect, and its entries.
    fn chooser_card(&self, compact: bool) -> Element<'_, Message> {
        let p = self.p();
        let today = store::today();
        let day = &self.journal.day;
        let is_today = *day == today;
        let mut heading = row![text(journal::day_heading(day)).font(serif()).size(20)]
            .spacing(8)
            .align_y(iced::Alignment::End);
        if is_today {
            heading = heading.push(
                text("Today")
                    .font(iced::Font {
                        weight: font::Weight::Bold,
                        ..serif()
                    })
                    .size(14)
                    .color(p.accent),
            );
        }
        let entries = journal::day_entries(&self.journal.entries, day);
        let mut content = column![heading].spacing(20);
        if compact {
            let mut list = column![].spacing(10);
            for entry in &entries {
                list = list.push(self.entry_row(entry, false));
            }
            if entries.is_empty() {
                list = list.push(
                    text("Nothing recorded for this day yet.")
                        .size(13)
                        .color(p.muted),
                );
            }
            content = content.push(list).push(
                button(
                    row![
                        icon(&icons::PLUS, p.ink, 12.),
                        text("New note").size(13).font(sans(font::Weight::Semibold))
                    ]
                    .spacing(8)
                    .align_y(Center),
                )
                .padding([9, 14])
                .on_press(Message::Journal(JournalMsg::New(None)))
                .style(design::outlined(p, 999.0)),
            );
        } else {
            content = content.push(self.invitation());
            let mut journal_heading = row![
                text(if is_today {
                    "Today’s journal"
                } else {
                    "This day’s journal"
                })
                .font(serif())
                .size(24)
                .width(Fill),
                text(journal::plural(entries.len(), "entry", "entries"))
                    .size(12)
                    .color(p.faint)
            ]
            .align_y(Center);
            journal_heading = journal_heading.padding(Padding::ZERO.top(10));
            let mut list = column![rule(p)];
            if entries.is_empty() {
                list = list.push(
                    container(
                        text("Nothing recorded for this day yet. A sentence is enough to begin.")
                            .size(14.4)
                            .line_height(1.6)
                            .color(p.muted),
                    )
                    .padding([24, 0]),
                );
            }
            for entry in &entries {
                list = list.push(self.entry_row(entry, true)).push(rule(p));
            }
            content = content.push(column![journal_heading, space().height(14), list]);
            let before = if *day < today {
                day.clone()
            } else {
                today.clone()
            };
            if let Some(note) = journal::revisit(&self.journal.notes, &before) {
                content = content.push(self.revisit(note));
            }
        }
        container(self.scroll(container(content).padding(21)).height(Fill))
            .width(Fill)
            .height(Fill)
            .style(design::card(p, 12.0))
            .into()
    }

    fn invitation(&self) -> Element<'_, Message> {
        let prompt = REFLECTION_PROMPTS[self.journal.prompt];
        let write = button(
            container(
                row![
                    icon(&icons::PEN, Color::from_rgb8(0x18, 0x17, 0x15), 16.),
                    text("Write a reflection")
                        .size(14)
                        .font(sans(font::Weight::Semibold))
                ]
                .spacing(10)
                .align_y(Center),
            )
            .center_y(Fill),
        )
        .padding([0, 19])
        .height(44)
        .on_press(Message::Journal(JournalMsg::New(Some(prompt.to_string()))))
        .style(|_, status| button::Style {
            background: Some(
                if matches!(status, button::Status::Hovered) {
                    design::mix(ART_BUTTON, Color::BLACK, 0.05)
                } else {
                    ART_BUTTON
                }
                .into(),
            ),
            text_color: Color::from_rgb8(0x18, 0x17, 0x15),
            border: Border {
                color: ART_BUTTON,
                width: 1.0,
                radius: 9.6.into(),
            },
            ..Default::default()
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
                .size(34)
                .color(ON_ART),
            container(
                text(prompt)
                    .font(serif())
                    .size(18.4)
                    .line_height(1.5)
                    .color(ON_ART)
            )
            .max_width(448)
            .height(56),
            row![write, another].spacing(24).align_y(Center),
        ]
        .spacing(14)
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
            container(copy).padding(40).center_y(Fill),
        ]
        .width(Fill)
        .height(280)
        .into()
    }

    fn revisit<'a>(&'a self, note: &'a Note) -> Element<'a, Message> {
        let p = self.p();
        column![
            rule(p),
            space().height(20),
            row![
                text("A thought worth revisiting")
                    .font(serif())
                    .size(20)
                    .width(Fill),
                text(journal::short_date(&note.journal_date))
                    .size(12)
                    .color(p.faint)
            ]
            .align_y(Center),
            space().height(16),
            button(
                row![
                    note_icon(p, &icons::PEN),
                    column![
                        text(note.display_title()).font(serif()).size(18.4),
                        text(note.excerpt(160)).size(13.6).color(p.muted),
                    ]
                    .spacing(5)
                    .width(Fill),
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

    /// One entry (`JournalNoteCard`): a note, a logged reading, or an older verse note.
    fn entry_row<'a>(&'a self, entry: &'a Entry, prominent: bool) -> Element<'a, Message> {
        let p = self.p();
        let selected =
            matches!((entry, &self.journal.open), (Entry::Note(n), Some(o)) if o.note.id == n.id);
        let (glyph, title, excerpt, logged, source, on_press, when): (
            &'static icons::Icon,
            String,
            String,
            bool,
            Option<&NoteSource>,
            Message,
            i64,
        ) = match entry {
            Entry::Note(n) => {
                let reading = n.reading_at.is_some();
                let excerpt = n.excerpt(160);
                let by_reading = reading && n.title.trim().is_empty() && excerpt.is_empty();
                (
                    if reading {
                        &icons::BOOK_OPEN
                    } else {
                        &icons::LIGHTBULB
                    },
                    if by_reading {
                        format!(
                            "Read {}",
                            n.source
                                .as_ref()
                                .map(|s| s.label.as_str())
                                .unwrap_or("a passage")
                        )
                    } else {
                        n.display_title().to_string()
                    },
                    excerpt,
                    reading && !by_reading,
                    n.source.as_ref(),
                    Message::Journal(JournalMsg::Open(n.id.clone())),
                    n.created,
                )
            }
            Entry::Reading(r) => (
                &icons::BOOK_OPEN,
                format!("Read {}", r.source.label),
                String::new(),
                false,
                Some(&r.source),
                Message::Journal(JournalMsg::OpenSource(r.source.clone())),
                r.read_at,
            ),
            Entry::Verse(v) => (
                &icons::NOTE_STICKY,
                v.reference.clone(),
                v.note.clone(),
                false,
                None,
                Message::Navigate(v.location.clone(), Some(v.verse)),
                v.updated,
            ),
        };
        let mut copy = column![
            text(title)
                .font(serif())
                .size(if prominent { 19.2 } else { 16.0 })
                .wrapping(iced::widget::text::Wrapping::WordOrGlyph)
        ]
        .spacing(4)
        .width(Fill);
        if logged {
            copy = copy.push(
                text("Reading logged")
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
            );
        }
        if !excerpt.is_empty() {
            let short: String = if excerpt.chars().count() > 180 {
                format!("{}…", excerpt.chars().take(180).collect::<String>())
            } else {
                excerpt
            };
            copy = copy.push(
                text(short)
                    .size(if prominent { 14.1 } else { 12.5 })
                    .line_height(1.5)
                    .color(p.muted),
            );
        }
        let head = if prominent {
            row![note_icon(p, glyph), copy].spacing(16).align_y(Center)
        } else {
            row![icon(glyph, p.goal, 13.), copy].spacing(10)
        };
        let time = chrono::DateTime::from_timestamp(when, 0)
            .map(|t| {
                t.with_timezone(&chrono::Local)
                    .format("%-I:%M %p")
                    .to_string()
            })
            .unwrap_or_default();
        let verb = match entry {
            Entry::Reading(_) => "Logged",
            Entry::Verse(_) => "Verse note",
            Entry::Note(n) if n.reading_at.is_some() => "Logged",
            Entry::Note(_) => "Written",
        };
        let mut meta = row![].spacing(6).align_y(Center);
        if let Some(source) = source {
            meta = meta.push(
                button(
                    text(source.label.clone())
                        .size(12)
                        .font(sans(font::Weight::Semibold)),
                )
                .padding(0)
                .on_press(Message::Journal(JournalMsg::OpenSource(source.clone())))
                .style(design::link(p.accent)),
            );
            meta = meta.push(text("·").size(12).color(p.faint));
        }
        meta = meta.push(text(format!("{verb} {time}")).size(12).color(p.faint));
        if let Entry::Reading(r) = entry {
            meta = meta.push(space::horizontal()).push(
                button(icon(&icons::TRASH, p.faint, 11.))
                    .padding(4)
                    .on_press(Message::Journal(JournalMsg::DeleteReading(r.id.clone())))
                    .style(design::circle(p)),
            );
        }
        let card = button(head)
            .padding(if prominent { [19, 0] } else { [10, 12] })
            .width(Fill)
            .on_press(on_press)
            .style(move |_, status| {
                let hovered = matches!(status, button::Status::Hovered);
                button::Style {
                    background: if selected {
                        Some(p.note.into())
                    } else if hovered {
                        Some(if prominent { p.soft } else { p.hover }.into())
                    } else {
                        None
                    },
                    text_color: p.ink,
                    border: Border {
                        color: if prominent {
                            Color::TRANSPARENT
                        } else {
                            p.rule
                        },
                        width: if prominent { 0.0 } else { 2.0 },
                        radius: if prominent { 0.0 } else { 16.0 }.into(),
                    },
                    ..Default::default()
                }
            });
        column![
            card,
            container(meta).padding(Padding {
                top: 0.0,
                right: 0.0,
                bottom: if prominent { 16.0 } else { 0.0 },
                left: if prominent { 64.0 } else { 33.0 },
            })
        ]
        .into()
    }

    fn note_card<'a>(
        &'a self,
        open: &'a OpenNote,
        p: Colors,
        interactive: bool,
    ) -> Element<'a, Message> {
        let msg = |m: JournalMsg| interactive.then_some(Message::Journal(m));
        let round = |glyph: &'static icons::Icon, m: Option<Message>| {
            button(container(icon(glyph, p.ink, 14.)).center_x(36).center_y(36))
                .padding(0)
                .on_press_maybe(m)
                .style(design::outlined(p, 18.0))
        };
        let status = if open.dirty {
            button(text("Save").size(13).font(sans(font::Weight::Semibold)))
                .padding([8, 14])
                .on_press_maybe(msg(JournalMsg::Save))
                .style(design::active(p))
                .into()
        } else {
            Element::from(
                row![
                    icon(&icons::CHECK, p.faint, 12.),
                    text("Saved").size(12).color(p.faint)
                ]
                .spacing(6)
                .align_y(Center),
            )
        };
        let mode = self.segmented(
            &[(false, "Write"), (true, "Preview")],
            open.preview,
            |preview| Message::Journal(JournalMsg::Preview(preview)),
        );
        let toolbar = row![
            round(&icons::ARROW_LEFT, msg(JournalMsg::Close)),
            space::horizontal(),
            container(mode).width(180),
            round(&icons::TRASH, msg(JournalMsg::Delete)),
            status,
        ]
        .spacing(10)
        .align_y(Center);
        let title = text_input(store::DEFAULT_NOTE_TITLE, &open.note.title)
            .id("journal-title")
            .on_input(|t| Message::Journal(JournalMsg::Title(t)))
            .font(serif())
            .size(30)
            .padding([4, 0])
            .style(move |_, _| text_input::Style {
                background: Color::TRANSPARENT.into(),
                border: Border::default(),
                icon: p.muted,
                placeholder: p.faint,
                value: p.ink,
                selection: p.gold,
            });
        let mut meta = row![
            text(journal::day_heading(&open.note.journal_date))
                .size(12.5)
                .color(p.muted)
        ]
        .spacing(10)
        .align_y(Center);
        if let Some(source) = &open.note.source {
            meta = meta.push(text("·").size(12).color(p.faint)).push(
                button(
                    text(source.label.clone())
                        .size(12.5)
                        .font(sans(font::Weight::Semibold)),
                )
                .padding(0)
                .on_press_maybe(msg(JournalMsg::OpenSource(source.clone())))
                .style(design::link(p.accent)),
            );
            let logged = open.note.reading_at.is_some();
            meta = meta.push(
                button(
                    row![
                        icon(&icons::BOOK_OPEN, if logged { p.paper } else { p.ink }, 11.),
                        text(if logged {
                            "Reading logged"
                        } else {
                            "Log reading"
                        })
                        .size(12)
                    ]
                    .spacing(6)
                    .align_y(Center),
                )
                .padding([5, 10])
                .on_press_maybe(msg(JournalMsg::ToggleReading))
                .style(if logged {
                    design::segment(p, true)
                } else {
                    design::segment(p, false)
                }),
            );
        }
        let body: Element<'_, Message> = if open.preview {
            let mut style = markdown::Style::from(self.theme());
            style.font = serif();
            style.link_color = p.accent;
            let settings = markdown::Settings::with_text_size(16, style);
            self.scroll(
                container(
                    markdown::view(&open.markdown, settings)
                        .map(|uri| Message::OpenLink(uri.to_string())),
                )
                .padding([8, 2]),
            )
            .height(Fill)
            .into()
        } else {
            text_editor(&open.body)
                .placeholder(
                    open.prompt
                        .as_deref()
                        .unwrap_or("Write in Markdown: # headings, **bold**, > quotes, - lists"),
                )
                .on_action(|a| Message::Journal(JournalMsg::Body(a)))
                .font(serif())
                .size(17)
                .line_height(iced::widget::text::LineHeight::Relative(1.65))
                .height(Fill)
                .padding([12, 2])
                .style(move |_, _| text_editor::Style {
                    background: Color::TRANSPARENT.into(),
                    border: Border::default(),
                    placeholder: p.faint,
                    value: p.ink,
                    selection: p.gold,
                })
                .into()
        };
        let mut content = column![toolbar, title, meta, rule(p), body].spacing(12);
        if open.confirm_delete {
            content = content.push(
                container(
                    row![
                        text("Delete this note? This can't be undone.")
                            .size(13)
                            .width(Fill),
                        button(text("Cancel").size(12.5))
                            .padding([7, 12])
                            .on_press(Message::Journal(JournalMsg::ConfirmDelete(false)))
                            .style(design::outlined(p, 8.0)),
                        button(
                            text("Delete note")
                                .size(12.5)
                                .font(sans(font::Weight::Semibold))
                        )
                        .padding([7, 12])
                        .on_press(Message::Journal(JournalMsg::ConfirmDelete(true)))
                        .style(design::active(p)),
                    ]
                    .spacing(8)
                    .align_y(Center),
                )
                .padding(12)
                .style(design::card(p, 10.0)),
            );
        }
        container(content)
            .padding(21)
            .width(Fill)
            .height(Fill)
            .style(design::card(p, 12.0))
            .into()
    }

    fn goal_dialog(&self, goals: JournalGoals) -> Element<'_, Message> {
        let p = self.p();
        let stepper = |label: &'static str, hint: String, value: u32, max: u32, study: bool| {
            let step = |glyph: &'static icons::Icon, by: i32, enabled: bool| {
                button(container(icon(glyph, p.ink, 13.)).center_x(44).center_y(44))
                    .padding(0)
                    .on_press_maybe(
                        enabled.then_some(Message::Journal(JournalMsg::GoalStep(study, by))),
                    )
                    .style(design::quiet(p))
            };
            column![
                row![
                    column![
                        text(label).font(serif()).size(18.4),
                        text(hint).size(12).color(p.muted)
                    ]
                    .spacing(5)
                    .width(Fill),
                    container(
                        row![
                            step(&icons::MINUS, -1, value > 1),
                            text(value.to_string()).size(16).center().width(48),
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
                .align_y(Center),
                space().height(20),
                rule(p),
            ]
            .spacing(0)
        };
        let mut form = column![
            row![
                text("Edit weekly goals")
                    .font(serif())
                    .size(29.6)
                    .width(Fill),
                button(
                    container(icon(&icons::XMARK, p.muted, 16.))
                        .center_x(44)
                        .center_y(44)
                )
                .padding(0)
                .on_press(Message::Journal(JournalMsg::CancelGoals))
                .style(design::quiet(p)),
            ]
            .align_y(Center),
            text("Choose a rhythm that works for you.")
                .size(14.4)
                .color(p.muted),
            space().height(8),
            stepper(
                "Study days per week",
                "1–7 days".into(),
                goals.study_days,
                7,
                true
            ),
            space().height(20),
            stepper(
                "Reflections per week",
                format!("1–{} notes each week", store::MAX_WEEKLY_REFLECTIONS),
                goals.reflections,
                store::MAX_WEEKLY_REFLECTIONS,
                false
            ),
        ]
        .spacing(6);
        if let Some(error) = &self.journal.goal_error {
            form = form.push(text(error.as_str()).size(13.6).color(p.accent));
        }
        form = form
            .push(
                text("Changing a goal keeps your recorded progress.")
                    .size(12)
                    .color(p.muted),
            )
            .push(
                row![
                    space::horizontal(),
                    button(text("Cancel").size(14).font(sans(font::Weight::Semibold)))
                        .padding([11, 19])
                        .on_press(Message::Journal(JournalMsg::CancelGoals))
                        .style(design::outlined(p, 9.6)),
                    button(
                        text("Save goals")
                            .size(14)
                            .font(sans(font::Weight::Semibold))
                    )
                    .padding([11, 19])
                    .on_press(Message::Journal(JournalMsg::SaveGoals))
                    .style(move |_, _| button::Style {
                        background: Some(p.accent.into()),
                        text_color: p.paper,
                        border: Border {
                            radius: 9.6.into(),
                            ..Default::default()
                        },
                        ..Default::default()
                    }),
                ]
                .spacing(10),
            );
        let dialog = container(form)
            .padding(26)
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
fn note_icon<'a>(p: Colors, glyph: &'static icons::Icon) -> Element<'a, Message> {
    container(icon(glyph, p.goal, 16.))
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
