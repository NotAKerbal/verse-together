// Reading plans, after the website's /plans (PlansWorkspace, PlanDetail, the builder's quick starts): the account's
// plans with their progress, a plan's days and chapters, and starting one of the quick-start plans. Plans live in the
// account (`readingPlans:*`), so signed out this screen says so, as the website's does. Marking a chapter read goes
// through this computer's study like the reader's own chapter mark, so it is kept and synced even offline.
use crate::account::background;
use crate::cloud::{self, Backend, CallError, Convex};
use crate::design::{self, Colors, icon, sans, serif};
use crate::header::CONTENT_TOP;
use crate::icons;
use crate::store::{self, Location, NoteSource};
use crate::{App, Message, Screen};
use chrono::{Datelike, NaiveDate};
use iced::widget::{button, column, container, row, scrollable, space, text};
use iced::{Alignment::Center, Border, Element, Fill, Length, Padding, Task, font};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummary {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub template: String,
    pub step_count: usize,
    pub read_count: usize,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub chapters_per_day: Option<usize>,
    #[serde(default)]
    pub reading_days: Option<Vec<bool>>,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub volume: String,
    pub book: String,
    pub chapter: u32,
    pub label: String,
    pub index: usize,
    #[serde(default)]
    pub read_at: Option<f64>,
}
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Plan {
    #[serde(flatten)]
    pub summary: PlanSummary,
    pub steps: Vec<PlanStep>,
}

/// Which weekdays are reading days, Sunday first (`normalizeReadingDays`): every day unless chosen otherwise.
fn reading_days(days: &Option<Vec<bool>>) -> [bool; 7] {
    match days {
        Some(d) if d.len() == 7 && d.iter().any(|x| *x) => {
            [d[0], d[1], d[2], d[3], d[4], d[5], d[6]]
        }
        _ => [true; 7],
    }
}
fn is_reading_day(date: NaiveDate, days: &[bool; 7]) -> bool {
    days[date.weekday().num_days_from_sunday() as usize]
}
/// `describeReadingDays`.
pub fn describe_days(days: &Option<Vec<bool>>) -> String {
    let d = reading_days(days);
    let count = d.iter().filter(|x| **x).count();
    match count {
        7 => "Every day".into(),
        5 if !d[0] && !d[6] => "Weekdays".into(),
        n => format!("{n} days a week"),
    }
}
/// The day (0-based) of the schedule `today` is, counting only reading days, or `None` before the start.
pub fn day_index(start: &str, days: &[bool; 7], today: NaiveDate) -> Option<i64> {
    let start = NaiveDate::parse_from_str(start, "%Y-%m-%d").ok()?;
    if today < start {
        return Some(-1);
    }
    let mut count = 0;
    let mut date = start;
    while date < today {
        if is_reading_day(date, days) {
            count += 1;
        }
        date = date.succ_opt()?;
    }
    Some(count)
}
/// The date of schedule day `n` (0-based), counting only reading days.
pub fn day_date(start: &str, n: usize, days: &[bool; 7]) -> Option<NaiveDate> {
    let mut date = NaiveDate::parse_from_str(start, "%Y-%m-%d").ok()?;
    let mut seen = 0;
    for _ in 0..4000 {
        if is_reading_day(date, days) {
            if seen == n {
                return Some(date);
            }
            seen += 1;
        }
        date = date.succ_opt()?;
    }
    None
}
/// `buildPlanSchedule`'s heading for today and the chapters it holds.
pub fn today(
    plan: &Plan,
    read: &dyn Fn(&PlanStep) -> bool,
    now: NaiveDate,
) -> (String, Option<String>, Vec<usize>) {
    let unread: Vec<usize> = plan
        .steps
        .iter()
        .filter(|s| !read(s))
        .map(|s| s.index)
        .collect();
    let all_read = unread
        .is_empty()
        .then(|| "Every chapter is read.".to_string());
    let Some(cadence) = plan.summary.chapters_per_day.filter(|c| *c > 0) else {
        return (
            "Up next".into(),
            all_read,
            unread.into_iter().take(1).collect(),
        );
    };
    let days = reading_days(&plan.summary.reading_days);
    let day_count = plan.steps.len().div_ceil(cadence);
    let for_day =
        |d: usize| (d * cadence..((d + 1) * cadence).min(plan.steps.len())).collect::<Vec<_>>();
    match plan
        .summary
        .start_date
        .as_deref()
        .and_then(|s| day_index(s, &days, now).map(|i| (s, i)))
    {
        Some((start, i)) if i < 0 => (
            "Not started yet".into(),
            day_date(start, 0, &days).map(|d| format!("Day 1 is {}.", d.format("%A, %B %-d"))),
            for_day(0),
        ),
        Some((_, i)) if i as usize >= day_count => (
            "Schedule finished".into(),
            if unread.is_empty() {
                all_read
            } else {
                Some(crate::journal::plural(unread.len(), "chapter", "chapters") + " still unread.")
            },
            vec![],
        ),
        Some((start, i)) if !is_reading_day(now, &days) => (
            "Rest day".into(),
            day_date(start, i as usize, &days)
                .map(|d| format!("Day {} is {}.", i + 1, d.format("%A, %B %-d"))),
            for_day(i as usize),
        ),
        Some((_, i)) => (
            format!("Day {} of {day_count}", i + 1),
            None,
            for_day(i as usize),
        ),
        None => (
            "Up next".into(),
            all_read,
            unread.into_iter().take(cadence).collect(),
        ),
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum PlansLoad<T> {
    Loading,
    Ready(T),
    Failed(String),
}
#[derive(Default)]
pub struct PlansState {
    pub list: Option<PlansLoad<Vec<PlanSummary>>>,
    pub open: Option<PlansLoad<Plan>>,
    pub confirm_delete: Option<String>,
    pub opening: Option<String>,
    pub working: bool,
    pub error: Option<String>,
}
#[derive(Debug, Clone)]
pub enum PlansMsg {
    Load,
    Loaded(u64, Result<Vec<PlanSummary>, String>),
    Open(String),
    Opened(u64, String, Result<Option<Plan>, String>),
    Back,
    Start(&'static str),
    Created(u64, Result<String, String>),
    Delete(String),
    ConfirmDelete(bool),
    Deleted(u64, Result<(), String>),
    Read(usize),
    Step(usize),
}
fn msg(m: PlansMsg) -> Message {
    Message::Plans(m)
}
fn convex(app: &App) -> Option<impl FnOnce() -> Result<Convex, CallError> + Send + 'static> {
    let session = app.account.session.clone()?;
    let endpoints = app.account.endpoints.clone().ok()?;
    Some(move || {
        Ok(Convex::new(
            &endpoints,
            cloud::convex_token(&endpoints, &session)?,
        ))
    })
}
fn text_error(e: CallError) -> String {
    e.to_string()
}

impl App {
    fn plan_steps_for(&self, volume: &str, book: Option<&str>) -> Vec<serde_json::Value> {
        self.books
            .iter()
            .filter(|b| b.volume == volume && book.is_none_or(|x| b.id == x))
            .flat_map(|b| {
                (1..=b.chapters).map(move |c| {
                    json!({ "volume": b.volume, "book": b.id, "chapter": c, "label": format!("{} {c}", b.label) })
                })
            })
            .collect()
    }
    /// A plan's step as this reader's read chapters see it (the account's, plus marks not yet sent).
    fn step_read(&self, s: &PlanStep) -> bool {
        s.read_at.is_some()
            || self.store.as_ref().is_some_and(|st| {
                st.is_read(&Location {
                    volume: s.volume.clone(),
                    book: s.book.clone(),
                    chapter: s.chapter,
                })
                .unwrap_or(false)
            })
    }
    pub(crate) fn update_plans(&mut self, message: PlansMsg) -> Task<Message> {
        // Results are for the account they were asked for; after signing out or switching they are dropped.
        let generation = self.account_generation();
        match message {
            PlansMsg::Load => {
                let Some(c) = convex(self) else {
                    self.plans = PlansState::default();
                    return Task::none();
                };
                self.plans.list = Some(PlansLoad::Loading);
                return Task::perform(
                    background(move || -> Result<Vec<PlanSummary>, String> {
                        let v = c()
                            .map_err(text_error)?
                            .query("readingPlans:listMyPlans", json!({}))
                            .map_err(text_error)?;
                        Ok(serde_json::from_value(v).unwrap_or_default())
                    }),
                    move |r| msg(PlansMsg::Loaded(generation, r)),
                );
            }
            PlansMsg::Loaded(g, r) if g == generation => {
                self.plans.list = Some(match r {
                    Ok(list) => PlansLoad::Ready(list),
                    Err(e) => PlansLoad::Failed(e),
                });
            }
            PlansMsg::Open(id) => {
                let Some(c) = convex(self) else {
                    return Task::none();
                };
                self.plans.open = Some(PlansLoad::Loading);
                self.plans.opening = Some(id.clone());
                return Task::perform(
                    background(move || {
                        let r = c()
                            .map_err(text_error)
                            .and_then(|c| {
                                c.query("readingPlans:getPlan", json!({ "planId": id }))
                                    .map_err(text_error)
                            })
                            .map(|v| serde_json::from_value::<Plan>(v).ok());
                        (id, r)
                    }),
                    move |(id, r)| msg(PlansMsg::Opened(generation, id, r)),
                );
            }
            PlansMsg::Opened(g, id, r)
                if g == generation && self.plans.opening.as_deref() == Some(id.as_str()) =>
            {
                self.plans.open = Some(match r {
                    Ok(Some(plan)) => PlansLoad::Ready(plan),
                    Ok(None) => {
                        PlansLoad::Failed("This plan isn't in your account any more.".into())
                    }
                    Err(e) => PlansLoad::Failed(e),
                });
            }
            PlansMsg::Back => {
                self.plans.open = None;
                return self.update_plans(PlansMsg::Load);
            }
            PlansMsg::Start(template) => {
                let Some(c) = convex(self) else {
                    return Task::none();
                };
                // The website's quick starts: the Book of Mormon in 30 days, or the book being read, a chapter a day.
                let (title, steps, per_day) = if template == "bom-30" {
                    let steps = self.plan_steps_for("bookofmormon", None);
                    let per_day = steps.len().div_ceil(30);
                    ("Book of Mormon in 30 days".to_string(), steps, per_day)
                } else {
                    let l = &self.preferences.last;
                    let label = self
                        .book()
                        .map(|b| b.label.clone())
                        .unwrap_or_else(|| l.book.clone());
                    (
                        format!("{label}, a chapter a day"),
                        self.plan_steps_for(&l.volume, Some(&l.book)),
                        1,
                    )
                };
                self.plans.working = true;
                self.plans.error = None;
                let args = json!({
                    "title": title, "template": template, "steps": steps,
                    "startDate": store::today(), "chaptersPerDay": per_day,
                });
                return Task::perform(
                    background(move || -> Result<String, String> {
                        let v = c()
                            .map_err(text_error)?
                            .mutation("readingPlans:createPlan", args)
                            .map_err(text_error)?;
                        v["id"]
                            .as_str()
                            .map(str::to_string)
                            .ok_or_else(|| "The plan wasn't created.".into())
                    }),
                    move |r| msg(PlansMsg::Created(generation, r)),
                );
            }
            PlansMsg::Created(g, r) if g == generation => {
                self.plans.working = false;
                match r {
                    Ok(id) => return self.update_plans(PlansMsg::Open(id)),
                    Err(e) => self.plans.error = Some(format!("Couldn't start that plan. {e}")),
                }
            }
            PlansMsg::Delete(id) => self.plans.confirm_delete = Some(id),
            PlansMsg::ConfirmDelete(false) => self.plans.confirm_delete = None,
            PlansMsg::ConfirmDelete(true) => {
                let (Some(id), Some(c)) = (self.plans.confirm_delete.take(), convex(self)) else {
                    return Task::none();
                };
                self.plans.working = true;
                return Task::perform(
                    background(move || -> Result<(), String> {
                        c().map_err(text_error)?
                            .mutation("readingPlans:deletePlan", json!({ "planId": id }))
                            .map_err(text_error)
                            .map(|_| ())
                    }),
                    move |r| msg(PlansMsg::Deleted(generation, r)),
                );
            }
            PlansMsg::Deleted(g, r) if g == generation => {
                self.plans.working = false;
                if let Err(e) = r {
                    self.plans.error = Some(format!(
                        "Couldn't delete that plan. Try again in a moment. {e}"
                    ));
                }
                self.plans.open = None;
                return self.update_plans(PlansMsg::Load);
            }
            PlansMsg::Read(i) => {
                let Some(PlansLoad::Ready(plan)) = &self.plans.open else {
                    return Task::none();
                };
                let Some(step) = plan.steps.get(i).cloned() else {
                    return Task::none();
                };
                let read = self.step_read(&step);
                let l = Location {
                    volume: step.volume.clone(),
                    book: step.book.clone(),
                    chapter: step.chapter,
                };
                let label = step
                    .label
                    .rsplit_once(' ')
                    .map(|(b, _)| b.to_string())
                    .unwrap_or(step.label.clone());
                let source = NoteSource::scripture(&label, &l, None);
                if let Some(s) = &mut self.store {
                    let r = s.set_read(&l, &source, !read);
                    self.report(r);
                }
                if let Some(PlansLoad::Ready(plan)) = &mut self.plans.open
                    && read
                    && let Some(s) = plan.steps.get_mut(i)
                {
                    s.read_at = None;
                }
                if l == self.preferences.last {
                    self.read = !read;
                }
                self.sync_soon();
            }
            PlansMsg::Loaded(..)
            | PlansMsg::Opened(..)
            | PlansMsg::Created(..)
            | PlansMsg::Deleted(..) => {}
            PlansMsg::Step(i) => {
                if let Some(PlansLoad::Ready(plan)) = &self.plans.open
                    && let Some(step) = plan.steps.get(i)
                {
                    let l = Location {
                        volume: step.volume.clone(),
                        book: step.book.clone(),
                        chapter: step.chapter,
                    };
                    return self.navigate(l, None);
                }
            }
        }
        Task::none()
    }

    pub(crate) fn plans_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let mut page = column![].spacing(16);
        if self.account.session.is_none() {
            page = page.push(
                container(
                    column![
                        text("Sign in to keep a plan").size(20).font(serif()),
                        text("Plans, read chapters, and your last reading spot are saved to your account so they follow you between devices.")
                            .size(14)
                            .color(p.muted),
                        pill(p, "Sign in", Some(Message::SetScreen(Screen::SignIn)), true),
                    ]
                    .spacing(12),
                )
                .padding(20)
                .width(Fill)
                .style(card(p)),
            );
            return self.plans_page(page);
        }
        if let Some(open) = &self.plans.open {
            return self.plans_page(self.plan_detail(open));
        }
        page =
            page.push(row![text("My plans").size(22).font(serif()).width(Fill),].align_y(Center));
        if let Some(e) = &self.plans.error {
            page = page.push(text(e.clone()).size(13).color(p.accent));
        }
        match &self.plans.list {
            None | Some(PlansLoad::Loading) => {
                page = page.push(text("Loading your plans…").size(14).color(p.muted));
            }
            Some(PlansLoad::Failed(e)) => {
                page = page.push(
                    column![
                        text(format!("Your plans couldn't be loaded. {e}"))
                            .size(13)
                            .color(p.accent),
                        pill(p, "Try again", Some(msg(PlansMsg::Load)), false),
                    ]
                    .spacing(8),
                );
            }
            Some(PlansLoad::Ready(list)) => {
                if list.is_empty() {
                    page = page.push(
                        text("No plans yet. Start one below.")
                            .size(14)
                            .color(p.muted),
                    );
                }
                for plan in list {
                    let mut c = column![
                        text(describe_days(&plan.reading_days).to_uppercase())
                            .size(11)
                            .font(sans(font::Weight::Semibold))
                            .color(p.faint),
                        text(plan.title.clone()).size(19).font(serif()),
                        progress(p, plan.read_count, plan.step_count),
                    ]
                    .spacing(6);
                    let mut actions = row![pill(
                        p,
                        "Open plan",
                        Some(msg(PlansMsg::Open(plan.id.clone()))),
                        false
                    )]
                    .spacing(8);
                    if self.plans.confirm_delete.as_deref() == Some(plan.id.as_str()) {
                        c = c.push(
                            text(format!(
                                "Delete “{}”? Chapters you've marked read are kept.",
                                plan.title
                            ))
                            .size(13)
                            .color(p.accent),
                        );
                        actions = actions
                            .push(pill(
                                p,
                                "Delete plan",
                                Some(msg(PlansMsg::ConfirmDelete(true))),
                                false,
                            ))
                            .push(pill(
                                p,
                                "Cancel",
                                Some(msg(PlansMsg::ConfirmDelete(false))),
                                false,
                            ));
                    } else {
                        actions = actions.push(
                            button(icon(&icons::TRASH, p.muted, 13.))
                                .padding(10)
                                .on_press(msg(PlansMsg::Delete(plan.id.clone())))
                                .style(design::circle(p)),
                        );
                    }
                    page = page.push(
                        container(c.push(actions))
                            .padding(16)
                            .width(Fill)
                            .style(card(p)),
                    );
                }
            }
        }
        page = page
            .push(space().height(8))
            .push(text("Start a plan").size(18).font(serif()))
            .push(
                row![
                    quick(
                        p,
                        "Book of Mormon in 30 days",
                        "The whole book, about 8 chapters a day.",
                        (!self.plans.working).then(|| msg(PlansMsg::Start("bom-30")))
                    ),
                    quick(
                        p,
                        &format!(
                            "{}, a chapter a day",
                            self.book().map(|b| b.label.as_str()).unwrap_or("This book")
                        ),
                        "The book you're reading, one chapter each day.",
                        (!self.plans.working).then(|| msg(PlansMsg::Start("book-daily"))),
                    ),
                ]
                .spacing(12),
            );
        self.plans_page(page)
    }
    fn plans_page<'a>(&self, content: impl Into<Element<'a, Message>>) -> Element<'a, Message> {
        let p = self.p();
        scrollable(
            container(
                column![
                    button(row![text("←").size(13), text("Come, Follow Me").size(13)].spacing(4))
                        .padding(0)
                        .on_press(Message::SetScreen(Screen::Guides))
                        .style(design::link(p.muted)),
                    text("Your study plans").size(40).font(serif()),
                    content.into(),
                ]
                .spacing(14)
                .max_width(840),
            )
            .center_x(Fill)
            .padding(Padding {
                top: CONTENT_TOP + 16.0,
                right: 24.0,
                bottom: 64.0,
                left: 24.0,
            }),
        )
        .id("plans")
        .height(Fill)
        .into()
    }
    fn plan_detail<'a>(&'a self, open: &'a PlansLoad<Plan>) -> Element<'a, Message> {
        let p = self.p();
        let back = button(text("‹ My plans").size(13).color(p.accent))
            .padding(0)
            .on_press(msg(PlansMsg::Back))
            .style(design::link(p.accent));
        let plan = match open {
            PlansLoad::Loading => {
                return column![back, text("Loading the plan…").size(14).color(p.muted)]
                    .spacing(12)
                    .into();
            }
            PlansLoad::Failed(e) => {
                return column![back, text(e.clone()).size(13).color(p.accent)]
                    .spacing(12)
                    .into();
            }
            PlansLoad::Ready(plan) => plan,
        };
        let read_count = plan.steps.iter().filter(|s| self.step_read(s)).count();
        let today_date = chrono::Local::now().date_naive();
        let (title, note, steps) = today(plan, &|s| self.step_read(s), today_date);
        let mut c = column![
            back,
            text(plan.summary.title.clone()).size(26).font(serif()),
            progress(p, read_count, plan.steps.len()),
        ]
        .spacing(10);
        let mut today_card = column![
            text(title.to_uppercase())
                .size(11)
                .font(sans(font::Weight::Bold))
                .color(p.muted)
        ]
        .spacing(8);
        if let Some(note) = note {
            today_card = today_card.push(text(note).size(13).color(p.muted));
        }
        let mut chips = row![].spacing(8);
        for i in steps {
            if let Some(s) = plan.steps.get(i) {
                chips = chips.push(self.plan_chip(s));
            }
        }
        today_card = today_card.push(chips.wrap());
        c = c.push(container(today_card).padding(16).width(Fill).style(card(p)));
        let cadence = plan.summary.chapters_per_day.unwrap_or(0);
        let days = reading_days(&plan.summary.reading_days);
        let mut all = column![text("All chapters").size(16).font(serif())].spacing(8);
        if cadence > 0 {
            for (d, group) in plan.steps.chunks(cadence).enumerate().take(400) {
                let date = plan
                    .summary
                    .start_date
                    .as_deref()
                    .and_then(|s| day_date(s, d, &days))
                    .map(|d| format!(" · {}", d.format("%b %-d")))
                    .unwrap_or_default();
                let mut line = row![
                    text(format!("Day {}{date}", d + 1))
                        .size(12)
                        .color(p.faint)
                        .width(110)
                ]
                .spacing(8)
                .align_y(Center);
                let mut chips = row![].spacing(6);
                for s in group {
                    chips = chips.push(self.plan_chip(s));
                }
                line = line.push(chips.wrap());
                all = all.push(line);
            }
        } else {
            let mut chips = row![].spacing(6);
            for s in plan.steps.iter().take(2000) {
                chips = chips.push(self.plan_chip(s));
            }
            all = all.push(chips.wrap());
        }
        c.push(all)
            .push(pill(
                p,
                "Delete plan",
                Some(msg(PlansMsg::Delete(plan.summary.id.clone()))),
                false,
            ))
            .push_maybe_confirm(self, plan)
    }
    fn plan_chip<'a>(&self, s: &'a PlanStep) -> Element<'a, Message> {
        let p = self.p();
        let read = self.step_read(s);
        row![
            button(
                text(s.label.clone())
                    .size(13)
                    .font(sans(font::Weight::Semibold))
            )
            .padding([6, 12])
            .on_press(msg(PlansMsg::Step(s.index)))
            .style(move |_, status| button::Style {
                background: Some(
                    if read {
                        p.read
                    } else if matches!(status, button::Status::Hovered) {
                        p.hover
                    } else {
                        p.card
                    }
                    .into()
                ),
                text_color: if read { p.paper } else { p.ink },
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 999.0.into()
                },
                ..Default::default()
            }),
            button(icon(
                &icons::CHECK,
                if read { p.read } else { p.faint },
                11.
            ))
            .padding(6)
            .on_press(msg(PlansMsg::Read(s.index)))
            .style(design::circle(p)),
        ]
        .spacing(2)
        .align_y(Center)
        .into()
    }
}
trait ConfirmDelete<'a> {
    fn push_maybe_confirm(self, app: &'a App, plan: &'a Plan) -> Element<'a, Message>;
}
impl<'a> ConfirmDelete<'a> for iced::widget::Column<'a, Message> {
    fn push_maybe_confirm(self, app: &'a App, plan: &'a Plan) -> Element<'a, Message> {
        let p = app.p();
        if app.plans.confirm_delete.as_deref() == Some(plan.summary.id.as_str()) {
            self.push(
                text(format!(
                    "Delete “{}”? Chapters you've marked read are kept.",
                    plan.summary.title
                ))
                .size(13)
                .color(p.accent),
            )
            .push(
                row![
                    pill(
                        p,
                        "Delete plan",
                        Some(msg(PlansMsg::ConfirmDelete(true))),
                        false
                    ),
                    pill(
                        p,
                        "Cancel",
                        Some(msg(PlansMsg::ConfirmDelete(false))),
                        false
                    ),
                ]
                .spacing(8),
            )
            .into()
        } else {
            self.into()
        }
    }
}
fn card(p: Colors) -> impl Fn(&iced::Theme) -> container::Style {
    design::card(p, 16.0)
}
fn pill<'a>(p: Colors, label: &'a str, m: Option<Message>, primary: bool) -> Element<'a, Message> {
    button(
        text(label)
            .size(14)
            .font(sans(font::Weight::Bold))
            .color(if primary { p.paper } else { p.ink }),
    )
    .padding([9, 16])
    .on_press_maybe(m)
    .style(move |_, status| button::Style {
        background: Some(
            if primary {
                p.ink
            } else if matches!(status, button::Status::Hovered) {
                p.hover
            } else {
                p.card_strong
            }
            .into(),
        ),
        text_color: if primary { p.paper } else { p.ink },
        border: Border {
            color: p.rule,
            width: 2.0,
            radius: 999.0.into(),
        },
        ..Default::default()
    })
    .into()
}
fn quick<'a>(p: Colors, title: &str, hint: &'a str, m: Option<Message>) -> Element<'a, Message> {
    button(
        column![
            text(title.to_string())
                .size(15)
                .font(sans(font::Weight::Semibold)),
            text(hint).size(12).color(p.muted),
        ]
        .spacing(4),
    )
    .padding(14)
    .width(Fill)
    .on_press_maybe(m)
    .style(design::outlined(p, 14.0))
    .into()
}
fn progress<'a>(p: Colors, read: usize, total: usize) -> Element<'a, Message> {
    let fraction = if total == 0 {
        0.0
    } else {
        read as f32 / total as f32
    };
    column![
        container(
            container(space())
                .width(Length::FillPortion(((fraction * 1000.0) as u16).max(1)))
                .height(8)
                .style(move |_| container::Style {
                    background: Some(p.read.into()),
                    border: Border {
                        radius: 4.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                })
        )
        .width(Fill)
        .style(move |_| container::Style {
            background: Some(p.soft.into()),
            border: Border {
                radius: 4.0.into(),
                ..Default::default()
            },
            ..Default::default()
        }),
        text(format!("{read} of {total} chapters read"))
            .size(12)
            .color(p.muted),
    ]
    .spacing(4)
    .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn plan(
        steps: usize,
        per_day: Option<usize>,
        start: Option<&str>,
        days: Option<Vec<bool>>,
    ) -> Plan {
        Plan {
            summary: PlanSummary {
                id: "p".into(),
                title: "t".into(),
                template: "custom".into(),
                step_count: steps,
                read_count: 0,
                start_date: start.map(str::to_string),
                chapters_per_day: per_day,
                reading_days: days,
            },
            steps: (0..steps)
                .map(|i| PlanStep {
                    volume: "bookofmormon".into(),
                    book: "alma".into(),
                    chapter: i as u32 + 1,
                    label: format!("Alma {}", i + 1),
                    index: i,
                    read_at: None,
                })
                .collect(),
        }
    }
    #[test]
    fn schedules_follow_the_websites_plan_days() {
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();
        let p = plan(10, Some(3), Some("2026-10-26"), None);
        let none = |_: &PlanStep| false;
        assert_eq!(
            today(&p, &none, d("2026-10-27")),
            ("Day 2 of 4".into(), None, vec![3, 4, 5])
        );
        assert_eq!(today(&p, &none, d("2026-10-25")).0, "Not started yet");
        assert_eq!(today(&p, &none, d("2026-11-30")).0, "Schedule finished");
        // Weekdays only: Saturday is a rest day, and Monday continues the count.
        let weekdays = Some(vec![false, true, true, true, true, true, false]);
        let p = plan(10, Some(1), Some("2026-10-26"), weekdays.clone());
        assert_eq!(today(&p, &none, d("2026-10-31")).0, "Rest day");
        assert_eq!(today(&p, &none, d("2026-11-02")).0, "Day 6 of 10");
        assert_eq!(describe_days(&weekdays), "Weekdays");
        let open = plan(3, None, None, None);
        assert_eq!(today(&open, &|s| s.index == 0, d("2026-10-27")).2, vec![1]);
    }
}
