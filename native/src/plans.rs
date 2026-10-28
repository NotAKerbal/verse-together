// Reading plans, after the website's /plans: the plan list (`PlansWorkspace`), a plan's page (`PlanDetail`), and
// the builder that creates and edits plans (`PlanBuilder`: what to read, how fast, the summary and quick starts).
// The rules come from `plan_model` (the website's `planScope.ts`/`planSchedule.ts`). Plans live in the account
// (`readingPlans:*`), so signed out these pages say so, as the website's do. Marking a chapter read goes through
// this computer's study like the reader's own chapter mark, so it is kept and synced even offline.
use crate::account::background;
use crate::cloud::{self, Backend, CallError, Convex};
use crate::design::{self, Colors, sans, serif};
use crate::header::CONTENT_TOP;
use crate::plan_model::{self as model, Builder, Catalog, Driver, Kind, Selection};
use crate::store::{Location, NoteSource};
use crate::{App, Message, Screen};
use iced::widget::{button, column, container, row, scrollable, space, svg, text, text_input};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, Shadow, Task, font};
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
    #[serde(default)]
    pub selections: Option<Vec<Selection>>,
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

#[derive(Debug, Clone, PartialEq)]
pub enum PlansLoad<T> {
    Loading,
    Ready(T),
    Failed(String),
}

/// Which page of /plans is showing.
#[derive(Debug, Clone, PartialEq, Default)]
pub enum Page {
    #[default]
    List,
    /// `/plans/[planId]`
    Detail,
    /// `/plans/new`, or `/plans/[planId]/edit` with the plan's id.
    Builder(Option<String>),
}

/// The builder form (`PlanBuilderForm`) and its scope step's own state (`ScopeStep`).
pub struct BuilderForm {
    pub state: Builder,
    pub active_volume: &'static str,
    /// The book whose chapter range is being narrowed.
    pub narrowing: Option<(String, String)>,
    pub attempted: bool,
    pub saving: bool,
    pub server_error: Option<String>,
    /// What's typed into a number field before it is a number (`Stepper`'s draft).
    pub drafts: Vec<(Field, String)>,
    /// The open date picker, and what's typed into a date field (as the browser's date input shows it).
    pub date: Option<DatePicker>,
    pub date_text: Vec<(DateTarget, String)>,
}
#[cfg(test)]
impl BuilderForm {
    fn clone_dates(&self) -> (String, String) {
        (self.state.start_date.clone(), self.state.finish_by.clone())
    }
}
/// The builder's two date fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateTarget {
    Start,
    Finish,
}
/// The browser date input's calendar: the month shown and the day the keyboard is on.
#[derive(Debug, Clone, PartialEq)]
pub struct DatePicker {
    pub target: DateTarget,
    pub month: chrono::NaiveDate,
    pub focus: chrono::NaiveDate,
}
impl DatePicker {
    fn calendar(&self) -> Calendar {
        Calendar {
            month: self.month,
            focus: self.focus,
        }
    }
}
use crate::date_picker::Calendar;
pub use crate::date_picker::{date_display, parse_typed_date};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field {
    From,
    To,
    PerDay,
    Days,
}

#[derive(Default)]
pub struct PlansState {
    pub page: Page,
    pub list: Option<PlansLoad<Vec<PlanSummary>>>,
    pub open: Option<PlansLoad<Plan>>,
    pub confirm_delete: Option<String>,
    pub opening: Option<String>,
    /// Open the builder on this plan once it has loaded.
    pub edit_after_open: bool,
    pub working: bool,
    pub error: Option<String>,
    pub builder: Option<BuilderForm>,
}

#[derive(Debug, Clone)]
pub enum BuilderMsg {
    ToggleVolume(&'static str),
    Tab(&'static str),
    TapBook(String, String),
    Stepper(Field, u32),
    Draft(Field, String),
    WholeBook,
    RemoveBook,
    DoneNarrowing,
    Driver(Driver),
    /// Open or close a date field's calendar.
    DateOpen(DateTarget),
    DateClose,
    DateMonth(i32),
    /// Move the calendar's keyboard day by some days.
    DateFocus(i64),
    /// Choose a day (a date key), or clear the field (`None`).
    DatePick(DateTarget, Option<String>),
    /// Enter on the calendar: choose the keyboard's day.
    DateEnter,
    DateText(DateTarget, String),
    Weekday(usize),
    Title(String),
    RemoveSelection(usize),
    Quick(&'static str),
    Submit,
    Saved(u64, Result<String, String>),
}

#[derive(Debug, Clone)]
pub enum PlansMsg {
    /// The /plans page, from elsewhere in the app.
    Home,
    Load,
    Loaded(u64, Result<Vec<PlanSummary>, String>),
    Open(String),
    Opened(u64, String, Result<Option<Plan>, String>),
    Back,
    New,
    Edit(String),
    /// Leave the builder: back to the plan being edited, or to the list.
    CloseBuilder,
    Builder(BuilderMsg),
    Delete(String),
    ConfirmDelete(bool),
    Deleted(u64, Result<(), String>),
    Read(usize),
    Step(usize),
}
fn msg(m: PlansMsg) -> Message {
    Message::Plans(m)
}
fn bmsg(m: BuilderMsg) -> Message {
    Message::Plans(PlansMsg::Builder(m))
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
fn top() -> Task<Message> {
    crate::presented(iced::widget::operation::snap_to(
        "plans",
        scrollable::RelativeOffset::START,
    ))
}

impl App {
    fn catalog(&self) -> Catalog<'_> {
        Catalog { books: &self.books }
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
    fn open_builder(&mut self, plan: Option<&Plan>) {
        let now = model::today();
        let state = match plan {
            Some(plan) => {
                let steps: Vec<(String, String, u32)> = plan
                    .steps
                    .iter()
                    .map(|s| (s.volume.clone(), s.book.clone(), s.chapter))
                    .collect();
                Builder::from_plan(
                    &self.catalog(),
                    model::SavedPlan {
                        title: &plan.summary.title,
                        selections: plan.summary.selections.clone(),
                        steps: &steps,
                        start: plan.summary.start_date.as_deref(),
                        per_day: plan.summary.chapters_per_day,
                        days: plan.summary.reading_days.as_deref(),
                    },
                    now,
                )
            }
            None => Builder::fresh(now),
        };
        self.plans.builder = Some(BuilderForm {
            state,
            active_volume: "bookofmormon",
            narrowing: None,
            attempted: false,
            saving: false,
            server_error: None,
            drafts: vec![],
            date: None,
            date_text: vec![],
        });
        self.plans.page = Page::Builder(plan.map(|p| p.summary.id.clone()));
    }
    pub(crate) fn update_plans(&mut self, message: PlansMsg) -> Task<Message> {
        // Results are for the account they were asked for; after signing out or switching they are dropped.
        let generation = self.account_generation();
        match message {
            PlansMsg::Home => {
                self.plans.page = Page::List;
                self.plans.builder = None;
                self.plans.open = None;
                return Task::batch([self.update_plans(PlansMsg::Load), top()]);
            }
            PlansMsg::Load => {
                let Some(c) = convex(self) else {
                    let page = std::mem::take(&mut self.plans.page);
                    self.plans = PlansState {
                        page,
                        ..Default::default()
                    };
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
                if !self.plans.edit_after_open {
                    self.plans.page = Page::Detail;
                }
                return Task::batch([
                    Task::perform(
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
                    ),
                    top(),
                ]);
            }
            PlansMsg::Opened(g, id, r)
                if g == generation && self.plans.opening.as_deref() == Some(id.as_str()) =>
            {
                self.plans.open = Some(match r {
                    Ok(Some(plan)) => PlansLoad::Ready(plan),
                    // `PlanDetail`'s "Plan not found".
                    Ok(None) => PlansLoad::Failed(String::new()),
                    Err(e) => PlansLoad::Failed(e),
                });
                if std::mem::take(&mut self.plans.edit_after_open) {
                    match &self.plans.open {
                        Some(PlansLoad::Ready(plan)) => {
                            let plan = plan.clone();
                            self.open_builder(Some(&plan));
                        }
                        _ => self.plans.page = Page::Detail,
                    }
                }
            }
            PlansMsg::Back => {
                self.plans.open = None;
                self.plans.page = Page::List;
                return Task::batch([self.update_plans(PlansMsg::Load), top()]);
            }
            PlansMsg::New => {
                self.open_builder(None);
                return top();
            }
            PlansMsg::Edit(id) => {
                if let Some(PlansLoad::Ready(plan)) = &self.plans.open
                    && plan.summary.id == id
                {
                    let plan = plan.clone();
                    self.open_builder(Some(&plan));
                    return top();
                }
                self.plans.edit_after_open = true;
                self.plans.page = Page::Builder(Some(id.clone()));
                self.plans.builder = None;
                return self.update_plans(PlansMsg::Open(id));
            }
            PlansMsg::CloseBuilder => {
                self.plans.builder = None;
                return match std::mem::take(&mut self.plans.page) {
                    Page::Builder(Some(id)) => self.update_plans(PlansMsg::Open(id)),
                    _ => self.update_plans(PlansMsg::Back),
                };
            }
            PlansMsg::Builder(m) => return self.update_builder(m, generation),
            PlansMsg::Delete(id) => self.plans.confirm_delete = Some(id),
            PlansMsg::ConfirmDelete(false) => self.plans.confirm_delete = None,
            PlansMsg::ConfirmDelete(true) => {
                let (Some(id), Some(c)) = (self.plans.confirm_delete.take(), convex(self)) else {
                    return Task::none();
                };
                self.plans.working = true;
                self.plans.error = None;
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
                match r {
                    Err(_) if self.plans.page == Page::Detail => {
                        self.plans.error =
                            Some("Couldn't delete the plan. Try again in a moment.".into());
                    }
                    Err(_) => {
                        self.plans.error =
                            Some("Couldn't delete that plan. Try again in a moment.".into());
                        return self.update_plans(PlansMsg::Load);
                    }
                    Ok(()) => return self.update_plans(PlansMsg::Back),
                }
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
                    if self.report(r).is_none() {
                        self.plans.error =
                            Some("Couldn't update that chapter. Try again in a moment.".into());
                        return Task::none();
                    }
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
            PlansMsg::Loaded(..) | PlansMsg::Opened(..) | PlansMsg::Deleted(..) => {}
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

    /// The builder's save (`handleSubmit`): `readingPlans:createPlan` for a new plan, `readingPlans:updatePlan`
    /// for the one being edited, with the website's arguments. `None` while the form has problems.
    pub(crate) fn plan_call(&self) -> Option<(&'static str, serde_json::Value)> {
        let form = self.plans.builder.as_ref()?;
        let catalog = self.catalog();
        let state = &form.state;
        let steps = catalog.scope_steps(&state.selections);
        if !state.issues(&catalog, steps.len()).is_empty() {
            return None;
        }
        let (per_day, _, _) = state.resolve(steps.len());
        let mut args = json!({
            "title": state.title(&catalog).trim(),
            "steps": steps,
            "selections": state.selections,
            "startDate": state.start_date,
            "chaptersPerDay": per_day,
            "readingDays": state.reading_days,
        });
        match &self.plans.page {
            Page::Builder(Some(id)) => {
                args["planId"] = json!(id);
                Some(("readingPlans:updatePlan", args))
            }
            _ => {
                args["template"] = json!("custom");
                Some(("readingPlans:createPlan", args))
            }
        }
    }
    fn update_builder(&mut self, m: BuilderMsg, generation: u64) -> Task<Message> {
        let books = self.books.clone();
        let catalog = Catalog { books: &books };
        let Some(form) = &mut self.plans.builder else {
            return Task::none();
        };
        let state = &mut form.state;
        // Any edit clears a save error (`patch`).
        if !matches!(m, BuilderMsg::Saved(..) | BuilderMsg::Submit) {
            form.server_error = None;
        }
        match m {
            BuilderMsg::ToggleVolume(volume) => {
                state.toggle_volume(volume);
                if form.narrowing.as_ref().is_some_and(|(v, _)| v == volume) {
                    form.narrowing = None;
                }
            }
            BuilderMsg::Tab(volume) => form.active_volume = volume,
            BuilderMsg::TapBook(volume, book) => {
                if state.book_selection(&volume, &book).is_none() {
                    state.selections.push(Selection::book(&volume, &book));
                    form.narrowing = None;
                } else if form.narrowing.as_ref() == Some(&(volume.clone(), book.clone())) {
                    form.narrowing = None;
                } else {
                    form.narrowing = Some((volume, book));
                }
                form.drafts
                    .retain(|(f, _)| !matches!(f, Field::From | Field::To));
            }
            BuilderMsg::Stepper(field, value) => {
                form.drafts.retain(|(f, _)| *f != field);
                apply_stepper(form, &catalog, field, value);
            }
            BuilderMsg::Draft(field, value) => {
                form.drafts.retain(|(f, _)| *f != field);
                let parsed = value.trim().parse::<u32>().ok();
                form.drafts.push((field, value));
                if let Some(n) = parsed {
                    apply_stepper(form, &catalog, field, n);
                }
            }
            BuilderMsg::WholeBook => {
                if let Some((volume, book)) = form.narrowing.clone()
                    && let Some(entry) = catalog.find(&volume, &book)
                {
                    state.set_range(&catalog, &volume, &book, 1, entry.chapters);
                }
                form.drafts.clear();
            }
            BuilderMsg::RemoveBook => {
                if let Some((volume, book)) = form.narrowing.take() {
                    state.replace_book(&volume, &book, None);
                }
            }
            BuilderMsg::DoneNarrowing => form.narrowing = None,
            BuilderMsg::Driver(driver) => state.driver = driver,
            BuilderMsg::DateOpen(target) => {
                if form.date.as_ref().is_some_and(|d| d.target == target) {
                    form.date = None;
                } else {
                    let key = match target {
                        DateTarget::Start => &state.start_date,
                        DateTarget::Finish => &state.finish_by,
                    };
                    // An empty field opens on today, or on its minimum when that is later.
                    let mut today = model::today();
                    if target == DateTarget::Finish
                        && let Ok(min) =
                            chrono::NaiveDate::parse_from_str(&state.start_date, "%Y-%m-%d")
                    {
                        today = today.max(min);
                    }
                    let day = chrono::NaiveDate::parse_from_str(key, "%Y-%m-%d").unwrap_or(today);
                    let cal = Calendar::on(day);
                    form.date = Some(DatePicker {
                        target,
                        month: cal.month,
                        focus: cal.focus,
                    });
                }
            }
            BuilderMsg::DateClose => form.date = None,
            BuilderMsg::DateMonth(by) => {
                if let Some(d) = &mut form.date {
                    let mut cal = d.calendar();
                    cal.shift_month(by);
                    (d.month, d.focus) = (cal.month, cal.focus);
                }
            }
            BuilderMsg::DateFocus(by) => {
                if let Some(d) = &mut form.date {
                    let mut cal = d.calendar();
                    cal.step(by);
                    (d.month, d.focus) = (cal.month, cal.focus);
                }
            }
            BuilderMsg::DateEnter => {
                if let Some(d) = form.date.clone() {
                    let min = (d.target == DateTarget::Finish)
                        .then(|| {
                            chrono::NaiveDate::parse_from_str(&state.start_date, "%Y-%m-%d").ok()
                        })
                        .flatten();
                    if min.is_none_or(|m| d.focus >= m) {
                        let key = d.focus.format("%Y-%m-%d").to_string();
                        return self
                            .update_builder(BuilderMsg::DatePick(d.target, Some(key)), generation);
                    }
                }
            }
            BuilderMsg::DatePick(target, key) => {
                let key = key.unwrap_or_default();
                match target {
                    DateTarget::Start => state.start_date = key,
                    DateTarget::Finish => state.finish_by = key,
                }
                form.date_text.retain(|(t, _)| *t != target);
                form.date = None;
            }
            BuilderMsg::DateText(target, text) => {
                // As the browser's date input: a complete, real date is the value; anything else is no date.
                let key = parse_typed_date(&text).unwrap_or_default();
                match target {
                    DateTarget::Start => state.start_date = key,
                    DateTarget::Finish => state.finish_by = key,
                }
                form.date_text.retain(|(t, _)| *t != target);
                form.date_text.push((target, text));
            }
            BuilderMsg::Weekday(index) => state.toggle_weekday(index),
            BuilderMsg::Title(value) => state.title_override = Some(value),
            BuilderMsg::RemoveSelection(index) => {
                if index < state.selections.len() {
                    state.selections.remove(index);
                }
            }
            BuilderMsg::Quick(id) => state.quick_start(id),
            BuilderMsg::Submit => {
                if form.saving {
                    return Task::none();
                }
                form.attempted = true;
                let steps = catalog.scope_steps(&state.selections);
                if !state.issues(&catalog, steps.len()).is_empty() {
                    return Task::none();
                }
                let Some(c) = convex(self) else {
                    return Task::none();
                };
                let Some((name, args)) = self.plan_call() else {
                    return Task::none();
                };
                let Some(form) = &mut self.plans.builder else {
                    return Task::none();
                };
                form.saving = true;
                form.server_error = None;
                return Task::perform(
                    background(move || -> Result<String, String> {
                        let v = c()
                            .map_err(text_error)?
                            .mutation(name, args)
                            .map_err(text_error)?;
                        v["id"]
                            .as_str()
                            .map(str::to_string)
                            .ok_or_else(|| "Couldn't save the plan.".into())
                    }),
                    move |r| bmsg(BuilderMsg::Saved(generation, r)),
                );
            }
            BuilderMsg::Saved(g, r) if g == generation => match r {
                Ok(id) => {
                    self.plans.builder = None;
                    return self.update_plans(PlansMsg::Open(id));
                }
                Err(e) => {
                    form.saving = false;
                    form.server_error =
                        Some(e.trim_start_matches("Uncaught Error:").trim().to_string());
                }
            },
            BuilderMsg::Saved(..) => {}
        }
        Task::none()
    }
}

/// A `Stepper` commit, clamped to its bounds.
fn apply_stepper(form: &mut BuilderForm, catalog: &Catalog, field: Field, value: u32) {
    let steps = catalog.scope_steps(&form.state.selections).len().max(1);
    let state = &mut form.state;
    match field {
        Field::PerDay => state.per_day = (value as usize).clamp(1, steps),
        Field::Days => state.target_days = (value as usize).clamp(1, steps),
        Field::From | Field::To => {
            let Some((volume, book)) = form.narrowing.clone() else {
                return;
            };
            let Some(entry) = catalog.find(&volume, &book) else {
                return;
            };
            let (from, to) = narrowed_range(state, &volume, &book, entry.chapters);
            if field == Field::From {
                let from = value.clamp(1, entry.chapters);
                state.set_range(catalog, &volume, &book, from, to.max(from));
            } else {
                state.set_range(
                    catalog,
                    &volume,
                    &book,
                    from,
                    value.clamp(from, entry.chapters),
                );
            }
        }
    }
}
/// The narrowed book's range (`stripFrom`, `stripTo`).
fn narrowed_range(state: &Builder, volume: &str, book: &str, chapters: u32) -> (u32, u32) {
    match state.book_selection(volume, book) {
        Some(s) if s.kind == Kind::Range => {
            let from = s.from.unwrap_or(1);
            (from, s.to.unwrap_or(from))
        }
        _ => (1, chapters),
    }
}

/* ---------- the website's own small icons, stroked as its inline SVGs ---------- */

fn hex(c: Color) -> String {
    let [r, g, b, a] = c.into_rgba8();
    format!("#{r:02x}{g:02x}{b:02x}{:02x}", a)
}
/// An inline SVG from the plan pages (`CheckIcon`, `CloseIcon`, `PlusIcon`, `TrashIcon`, `ArrowIcon`).
fn stroke<'a>(paths: &[&str], width: f32, color: Color, size: f32) -> svg::Svg<'a> {
    let body: String = paths
        .iter()
        .map(|d| format!(r#"<path d="{d}"/>"#))
        .collect();
    let markup = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round">{body}</svg>"#,
        hex(color)
    );
    svg(svg::Handle::from_memory(markup.into_bytes()))
        .width(size)
        .height(size)
}
fn check_icon<'a>(color: Color) -> svg::Svg<'a> {
    stroke(&["m5 12 5 5L20 7"], 3.0, color, 14.0)
}
fn close_icon<'a>(color: Color) -> svg::Svg<'a> {
    stroke(&["m6 6 12 12", "M18 6 6 18"], 2.6, color, 14.0)
}
fn plus_icon<'a>(color: Color) -> svg::Svg<'a> {
    stroke(&["M12 5v14", "M5 12h14"], 2.8, color, 16.0)
}
fn trash_icon<'a>(color: Color) -> svg::Svg<'a> {
    stroke(
        &["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
        2.2,
        color,
        16.0,
    )
}

/* ---------- shared pieces ---------- */

const DARK_TEXT: Color = Color::from_rgb(23. / 255., 22. / 255., 26. / 255.);

/// `.font-display`: the serif at weight 500.
fn display(_size: f32) -> iced::Font {
    iced::Font {
        weight: font::Weight::Medium,
        ..serif()
    }
}
fn panel(p: Colors, background: Color) -> impl Fn(&iced::Theme) -> container::Style {
    move |_| container::Style {
        background: Some(background.into()),
        text_color: Some(p.ink),
        border: Border {
            color: p.rule,
            width: 1.0,
            radius: 9.6.into(),
        },
        ..Default::default()
    }
}
/// `surface-button … rounded-full border-2 px-4 text-sm` (border-2 is 1px on the website).
fn surface_button<'a>(
    p: Colors,
    content: impl Into<Element<'a, Message>>,
    m: Option<Message>,
    pad_x: f32,
) -> Element<'a, Message> {
    button(container(content).center_y(Length::Shrink))
        .padding([0.0, pad_x])
        .height(36)
        .on_press_maybe(m)
        .style(move |_, status| button::Style {
            background: Some(
                if matches!(status, button::Status::Hovered | button::Status::Pressed) {
                    p.hover
                } else {
                    p.card
                }
                .into(),
            ),
            text_color: if matches!(status, button::Status::Disabled) {
                design::fade(p.ink, 0.6)
            } else {
                p.ink
            },
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 999.0.into(),
            },
            ..Default::default()
        })
        .into()
}
fn surface_label<'a>(label: impl Into<String>) -> Element<'a, Message> {
    text(label.into())
        .size(14)
        .font(sans(font::Weight::Semibold))
        .into()
}
/// The primary pill: ink fill, paper text, soft shadow.
fn primary_style(p: Colors) -> impl Fn(&iced::Theme, button::Status) -> button::Style {
    move |_, status| button::Style {
        background: Some(
            if matches!(status, button::Status::Disabled) {
                design::fade(p.ink, 0.6)
            } else {
                p.ink
            }
            .into(),
        ),
        text_color: p.paper,
        border: Border {
            color: p.rule,
            width: 1.0,
            radius: 999.0.into(),
        },
        shadow: design::soft_shadow(p),
        ..Default::default()
    }
}
/// `pill-tag`: rubric outline and text, small caps.
fn pill_tag<'a>(p: Colors, label: impl Into<String>, fill: Option<Color>) -> Element<'a, Message> {
    let filled = fill.is_some();
    container(
        text(label.into().to_uppercase())
            .size(10.9)
            .font(sans(font::Weight::Semibold))
            .color(if filled { DARK_TEXT } else { p.accent }),
    )
    .padding([2, 8])
    .style(move |_| container::Style {
        background: fill.map(Into::into),
        border: Border {
            color: p.rubric_line,
            width: 1.0,
            radius: 999.0.into(),
        },
        ..Default::default()
    })
    .into()
}
/// `ProgressBar`: a 12px rounded track, accent fill (mint once complete), and "read/total".
fn progress<'a>(p: Colors, value: usize, max: usize, width: Option<f32>) -> Element<'a, Message> {
    let safe_max = max.max(1);
    let clamped = value.min(safe_max);
    let complete = max > 0 && clamped >= safe_max;
    let percent = ((clamped as f32 / safe_max as f32) * 100.0).round() as u16;
    let fill = if complete { p.mint } else { p.primary };
    let mut track = row![];
    if percent > 0 {
        track = track.push(
            container(space())
                .width(Length::FillPortion(percent))
                .height(Fill)
                .style(move |_| container::Style {
                    background: Some(fill.into()),
                    ..Default::default()
                }),
        );
    }
    if percent < 100 {
        track = track.push(space().width(Length::FillPortion(100 - percent)));
    }
    let bar = container(track)
        .height(12)
        .width(Fill)
        .clip(true)
        .style(move |_| container::Style {
            background: Some(p.card.into()),
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 999.0.into(),
            },
            ..Default::default()
        });
    let line = row![
        bar,
        text(format!("{clamped}/{max}"))
            .size(11.2)
            .font(sans(font::Weight::Bold))
            .color(p.muted)
    ]
    .spacing(8)
    .align_y(Center);
    match width {
        Some(w) => container(line).max_width(w).into(),
        None => line.into(),
    }
}
/// `SubLabel`: 0.68rem bold small caps in the soft foreground.
fn sub_label<'a>(p: Colors, label: impl Into<String>) -> Element<'a, Message> {
    text(label.into().to_uppercase())
        .size(10.9)
        .font(sans(font::Weight::Bold))
        .color(p.faint)
        .into()
}
fn soft_input(p: Colors) -> impl Fn(&iced::Theme, text_input::Status) -> text_input::Style {
    move |_, status| text_input::Style {
        background: if matches!(status, text_input::Status::Focused { .. }) {
            p.card
        } else {
            p.input
        }
        .into(),
        border: Border {
            color: if matches!(status, text_input::Status::Focused { .. }) {
                design::mix(p.rule, p.ink, 0.15)
            } else {
                p.rule
            },
            width: 1.0,
            radius: 8.0.into(),
        },
        icon: p.muted,
        placeholder: p.faint,
        value: p.ink,
        selection: p.gold,
    }
}
fn error_text<'a>(p: Colors, message: impl Into<String>) -> Element<'a, Message> {
    text(message.into())
        .size(14)
        .font(sans(font::Weight::Semibold))
        .color(p.coral)
        .into()
}

impl App {
    pub(crate) fn plans_view(&self) -> Element<'_, Message> {
        let p = self.p();
        let signed_in = self.account.session.is_some();
        let body: Element<'_, Message> = match &self.plans.page {
            Page::List => {
                let mut c = column![self.page_hero(
                    "Plans",
                    "Line up chapters, pace them across days, and watch the book and chapter grids fill in as you read."
                )]
                .spacing(24);
                c = c.push(if signed_in {
                    self.plan_list()
                } else {
                    self.signed_out()
                });
                c.into()
            }
            Page::Detail => {
                let back = surface_button(
                    p,
                    surface_label("← All plans"),
                    Some(msg(PlansMsg::Back)),
                    12.0,
                );
                let mut c = column![back].spacing(24);
                c = c.push(if signed_in {
                    self.plan_detail()
                } else {
                    self.signed_out()
                });
                c.into()
            }
            Page::Builder(editing) => {
                let back = surface_button(
                    p,
                    surface_label(if editing.is_some() {
                        "← Back to plan"
                    } else {
                        "← All plans"
                    }),
                    Some(msg(PlansMsg::CloseBuilder)),
                    12.0,
                );
                let mut c = column![
                    back,
                    self.page_hero(
                        if editing.is_some() { "Edit plan" } else { "New plan" },
                        if editing.is_some() {
                            "Change what you're reading or how fast. Your read chapters stay put."
                        } else {
                            "Two steps: what to read, then how fast. A whole volume, a handful of books, or one chapter range, it all works."
                        }
                    )
                ]
                .spacing(24);
                c = c.push(if !signed_in {
                    self.signed_out()
                } else {
                    match (&self.plans.builder, editing.is_some(), &self.plans.open) {
                        (Some(form), _, _) => self.builder_form(form),
                        (None, true, Some(PlansLoad::Failed(e))) if e.is_empty() => {
                            self.not_found()
                        }
                        (None, true, Some(PlansLoad::Failed(e))) => error_text(p, e.clone()),
                        _ => soft_note(p, "Loading plan…"),
                    }
                });
                c.into()
            }
        };
        let gutter = (self.window_width * 0.026).clamp(16.0, 32.0);
        scrollable(
            container(container(body).max_width(1180))
                .center_x(Fill)
                .padding(Padding {
                    top: CONTENT_TOP + 16.0,
                    right: gutter,
                    bottom: 64.0,
                    left: gutter,
                }),
        )
        .id("plans")
        .height(Fill)
        .into()
    }
    /// `page-hero`: rubric eyebrow, serif title, quiet lede.
    fn page_hero<'a>(
        &self,
        title: impl Into<String>,
        subtitle: impl Into<String>,
    ) -> Element<'a, Message> {
        let p = self.p();
        let size = (self.window_width * 0.03).clamp(30.4, 41.6);
        container(
            column![
                text("STUDY PLANS")
                    .size(11.5)
                    .font(sans(font::Weight::Semibold))
                    .color(p.accent),
                text(title.into()).size(size).font(serif()),
                container(
                    text(subtitle.into())
                        .size(14)
                        .font(serif())
                        .line_height(1.6)
                        .color(p.muted)
                )
                .max_width(640),
            ]
            .spacing(12),
        )
        .padding([12, 4])
        .into()
    }
    /// `PlansSignedOut`.
    fn signed_out<'a>(&self) -> Element<'a, Message> {
        let p = self.p();
        container(
            column![
                text("Sign in to keep a plan").size(20).font(display(20.)),
                container(
                    text("Plans, read chapters, and your last reading spot are saved to your account so they follow you between devices.")
                        .size(14)
                        .color(p.muted)
                )
                .max_width(640),
                button(text("Sign in").size(14).font(sans(font::Weight::Bold)))
                    .padding([0, 16])
                    .height(40)
                    .on_press(Message::SetScreen(Screen::SignIn))
                    .style(primary_style(p)),
            ]
            .spacing(12),
        )
        .padding(20)
        .width(Fill)
        .style(panel(p, p.sky_soft))
        .into()
    }
    fn not_found<'a>(&self) -> Element<'a, Message> {
        let p = self.p();
        container(
            column![
                text("Plan not found").size(20.8).font(display(20.8)),
                text("It may have been deleted, or the link is wrong.")
                    .size(14)
                    .color(p.muted),
            ]
            .spacing(12),
        )
        .padding(20)
        .width(Fill)
        .style(panel(p, p.card))
        .into()
    }
    fn columns(&self) -> usize {
        if self.window_width >= 1024.0 {
            3
        } else if self.window_width >= 640.0 {
            2
        } else {
            1
        }
    }

    /// `PlanList`.
    fn plan_list(&self) -> Element<'_, Message> {
        let p = self.p();
        let new_plan = button(
            container(
                row![
                    plus_icon(p.paper),
                    text("New plan").size(14).font(sans(font::Weight::Bold))
                ]
                .spacing(8)
                .align_y(Center),
            )
            .center_y(Fill),
        )
        .padding([0, 20])
        .height(40)
        .on_press(msg(PlansMsg::New))
        .style(primary_style(p));
        let mut c = column![
            row![
                text("My plans").size(20.8).font(display(20.8)).width(Fill),
                new_plan
            ]
            .align_y(Center)
            .padding([0, 4])
        ]
        .spacing(16);
        if let Some(e) = &self.plans.error {
            c = c.push(container(error_text(p, e.clone())).padding([0, 4]));
        }
        match &self.plans.list {
            None | Some(PlansLoad::Loading) => c = c.push(soft_note(p, "Loading your plans…")),
            Some(PlansLoad::Failed(e)) => {
                c = c.push(
                    column![
                        error_text(p, format!("Your plans couldn't be loaded. {e}")),
                        surface_button(
                            p,
                            surface_label("Try again"),
                            Some(msg(PlansMsg::Load)),
                            16.0
                        ),
                    ]
                    .spacing(8),
                );
            }
            Some(PlansLoad::Ready(list)) if list.is_empty() => {
                c = c.push(
                    container(
                        column![
                            text("No plans yet. Pick a volume, a few books, or a chapter range, set a pace, and it will show up here.")
                                .size(14)
                                .color(p.muted),
                            surface_button(p, surface_label("Build your first plan"), Some(msg(PlansMsg::New)), 16.0),
                        ]
                        .spacing(12),
                    )
                    .padding([24, 20])
                    .width(Fill)
                    .style(panel(p, p.soft)),
                );
            }
            Some(PlansLoad::Ready(list)) => {
                let columns = self.columns();
                let mut grid = column![].spacing(14.4);
                for chunk in list.chunks(columns) {
                    let mut line = row![].spacing(14.4);
                    for plan in chunk {
                        line = line
                            .push(container(self.plan_card(plan)).width(Length::FillPortion(1)));
                    }
                    for _ in chunk.len()..columns {
                        line = line.push(space().width(Length::FillPortion(1)));
                    }
                    grid = grid.push(line);
                }
                c = c.push(grid);
            }
        }
        c.into()
    }
    /// `PlanCard`.
    fn plan_card<'a>(&'a self, plan: &'a PlanSummary) -> Element<'a, Message> {
        let p = self.p();
        let days = model::normalize_days(plan.reading_days.as_deref());
        let percent = if plan.step_count > 0 {
            (plan.read_count as f32 / plan.step_count as f32 * 100.0).round() as usize
        } else {
            0
        };
        let mut tags = row![pill_tag(p, model::describe_days(&days), None)].spacing(6);
        if percent == 100 {
            tags = tags.push(pill_tag(p, "Done", Some(p.mint)));
        }
        let title = button(text(plan.title.clone()).size(19.2).font(display(19.2)))
            .padding(0)
            .on_press(msg(PlansMsg::Open(plan.id.clone())))
            .style(design::link(p.ink));
        let trash = button(container(trash_icon(p.ink)).center(34))
            .padding(0)
            .width(36)
            .height(36)
            .on_press_maybe((!self.plans.working).then(|| msg(PlansMsg::Delete(plan.id.clone()))))
            .style(design::outlined(p, 18.0));
        let mut c = column![
            row![column![tags, title].spacing(8).width(Fill), trash].spacing(12),
            progress(p, plan.read_count, plan.step_count, None),
            text(model::describe_pace(
                plan.step_count,
                plan.chapters_per_day,
                plan.start_date.as_deref(),
                &days
            ))
            .size(12)
            .font(sans(font::Weight::Semibold))
            .color(p.muted),
        ]
        .spacing(12);
        if self.plans.confirm_delete.as_deref() == Some(plan.id.as_str()) {
            c = c.push(self.confirm_delete(&plan.title));
        } else {
            c = c.push(
                row![
                    surface_button(
                        p,
                        surface_label("Open plan"),
                        Some(msg(PlansMsg::Open(plan.id.clone()))),
                        16.0
                    ),
                    surface_button(
                        p,
                        surface_label("Edit"),
                        Some(msg(PlansMsg::Edit(plan.id.clone()))),
                        16.0
                    ),
                ]
                .spacing(8),
            );
        }
        container(c)
            .padding(16)
            .width(Fill)
            .style(panel(p, p.card))
            .into()
    }
    /// The website asks with `window.confirm`; here the question is asked in place.
    fn confirm_delete<'a>(&self, title: &str) -> Element<'a, Message> {
        let p = self.p();
        column![
            text(format!(
                "Delete \"{title}\"? Chapters you've marked read are kept."
            ))
            .size(14)
            .font(sans(font::Weight::Semibold)),
            row![
                button(text("Delete").size(14).font(sans(font::Weight::Bold)))
                    .padding([0, 16])
                    .height(36)
                    .on_press(msg(PlansMsg::ConfirmDelete(true)))
                    .style(primary_style(p)),
                surface_button(
                    p,
                    surface_label("Cancel"),
                    Some(msg(PlansMsg::ConfirmDelete(false))),
                    16.0
                ),
            ]
            .spacing(8),
        ]
        .spacing(8)
        .into()
    }

    /// `PlanDetail`.
    fn plan_detail(&self) -> Element<'_, Message> {
        let p = self.p();
        let plan = match &self.plans.open {
            None | Some(PlansLoad::Loading) => return soft_note(p, "Loading plan…"),
            Some(PlansLoad::Failed(e)) if e.is_empty() => return self.not_found(),
            Some(PlansLoad::Failed(e)) => return error_text(p, e.clone()),
            Some(PlansLoad::Ready(plan)) => plan,
        };
        let read: Vec<bool> = plan.steps.iter().map(|s| self.step_read(s)).collect();
        let read_count = read.iter().filter(|r| **r).count();
        let total = plan.steps.len();
        let days = model::normalize_days(plan.summary.reading_days.as_deref());
        let schedule = model::schedule(
            &read,
            plan.summary.chapters_per_day,
            plan.summary.start_date.as_deref(),
            &days,
            model::today(),
        );
        let percent = if total > 0 {
            (read_count as f32 / total as f32 * 100.0).round() as usize
        } else {
            0
        };
        let edit = || {
            surface_button(
                p,
                surface_label("Edit plan"),
                Some(msg(PlansMsg::Edit(plan.summary.id.clone()))),
                16.0,
            )
        };
        let title_size = (self.window_width * 0.03).clamp(30.4, 41.6);
        let hero = container(
            column![
                row![
                    row![
                        pill_tag(p, model::describe_days(&days), None),
                        pill_tag(
                            p,
                            format!("{percent}% read"),
                            Some(if percent == 100 { p.mint } else { p.primary })
                        ),
                    ]
                    .spacing(8)
                    .width(Fill),
                    edit(),
                ]
                .align_y(Center),
                text(plan.summary.title.clone())
                    .size(title_size)
                    .font(serif()),
                text(model::describe_pace(
                    total,
                    plan.summary.chapters_per_day,
                    plan.summary.start_date.as_deref(),
                    &days
                ))
                .size(14)
                .font(serif())
                .color(p.muted),
                progress(p, read_count, total, Some(448.0)),
            ]
            .spacing(12),
        )
        .padding([12, 4]);
        let mut c = column![hero].spacing(24);
        if let Some(e) = &self.plans.error {
            c = c.push(container(error_text(p, e.clone())).padding([0, 4]));
        }
        let mut today_head = row![
            text(schedule.title.clone())
                .size(19.2)
                .font(display(19.2))
                .width(Fill)
        ]
        .align_y(Center);
        if let Some(note) = &schedule.note {
            today_head = today_head.push(
                text(note.clone())
                    .size(14)
                    .font(sans(font::Weight::Semibold))
                    .color(p.muted),
            );
        }
        let mut today = column![today_head].spacing(12);
        if !schedule.today.is_empty() {
            let mut list = column![].spacing(8);
            for &i in &schedule.today {
                list = list.push(self.step_row(&plan.steps[i], read[i], true));
            }
            today = today.push(list);
        }
        c = c.push(
            container(today)
                .padding(20)
                .width(Fill)
                .style(panel(p, p.soft)),
        );
        let mut all = column![text("All chapters").size(19.2).font(display(19.2))].spacing(16);
        match &schedule.groups {
            Some(groups) => {
                for group in groups {
                    let is_today = group.today;
                    let mut head = row![
                        container(
                            text(format!("DAY {}", group.day + 1))
                                .size(11.5)
                                .font(sans(font::Weight::Bold))
                                .color(if group.today { DARK_TEXT } else { p.ink })
                        )
                        .padding([2, 8])
                        .style(move |_| container::Style {
                            background: Some(if is_today { p.primary } else { p.card }.into()),
                            border: Border {
                                color: p.rule,
                                width: 1.0,
                                radius: 999.0.into(),
                            },
                            ..Default::default()
                        })
                    ]
                    .spacing(8)
                    .align_y(Center);
                    if let Some(date) = &group.date {
                        head = head.push(
                            text(model::format_date(date).to_uppercase())
                                .size(11.5)
                                .font(sans(font::Weight::Bold))
                                .color(p.faint),
                        );
                    }
                    if group.today {
                        head = head.push(
                            text("TODAY")
                                .size(11.5)
                                .font(sans(font::Weight::Bold))
                                .color(p.faint),
                        );
                    }
                    let mut list = column![].spacing(8);
                    for i in group.steps.clone() {
                        list = list.push(self.step_row(&plan.steps[i], read[i], group.today));
                    }
                    all = all.push(column![head, list].spacing(8));
                }
            }
            None => {
                let mut list = column![].spacing(8);
                for (i, s) in plan.steps.iter().enumerate() {
                    list = list.push(self.step_row(s, read[i], false));
                }
                all = all.push(list);
            }
        }
        c = c.push(
            container(all)
                .padding(20)
                .width(Fill)
                .style(panel(p, p.card)),
        );
        let footer: Element<'_, Message> = if self.plans.confirm_delete.as_deref()
            == Some(plan.summary.id.as_str())
        {
            self.confirm_delete(&plan.summary.title)
        } else {
            row![
                edit(),
                surface_button(
                    p,
                    surface_label(if self.plans.working {
                        "Deleting…"
                    } else {
                        "Delete plan"
                    }),
                    (!self.plans.working).then(|| msg(PlansMsg::Delete(plan.summary.id.clone()))),
                    16.0
                ),
            ]
            .spacing(8)
            .into()
        };
        c.push(container(footer).align_right(Fill).padding([0, 4]))
            .into()
    }
    /// `StepRow`.
    fn step_row<'a>(
        &self,
        step: &'a PlanStep,
        read: bool,
        highlight: bool,
    ) -> Element<'a, Message> {
        let p = self.p();
        let toggle = button(
            container(if read {
                Element::from(
                    text("✓")
                        .size(12.8)
                        .font(sans(font::Weight::Bold))
                        .color(p.paper),
                )
            } else {
                space().into()
            })
            .center(26),
        )
        .padding(0)
        .width(28)
        .height(28)
        .on_press(msg(PlansMsg::Read(step.index)))
        .style(move |_, _| button::Style {
            background: Some(if read { p.ink } else { p.card }.into()),
            text_color: if read { p.paper } else { p.ink },
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 14.0.into(),
            },
            ..Default::default()
        });
        let label = button(
            text(step.label.clone())
                .size(14)
                .font(sans(font::Weight::Semibold))
                .wrapping(iced::widget::text::Wrapping::None),
        )
        .padding(0)
        .width(Fill)
        .on_press(msg(PlansMsg::Step(step.index)))
        .style(design::link(p.ink));
        let mut line = row![toggle, label].spacing(12).align_y(Center);
        if read {
            line = line.push(
                text("READ")
                    .size(10.6)
                    .font(sans(font::Weight::Bold))
                    .color(p.muted),
            );
        }
        let background = if read {
            p.mint
        } else if highlight {
            p.note
        } else {
            p.card
        };
        container(line)
            .padding([8, 12])
            .width(Fill)
            .style(move |_| container::Style {
                background: Some(background.into()),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 13.6.into(),
                },
                ..Default::default()
            })
            .into()
    }

    /* ---------- the builder ---------- */

    fn builder_form<'a>(&'a self, form: &'a BuilderForm) -> Element<'a, Message> {
        let catalog = self.catalog();
        let steps = catalog.scope_steps(&form.state.selections);
        let pace = form.state.resolve(steps.len());
        let main = column![
            self.scope_step(form),
            self.pace_step(form, steps.len(), &pace)
        ]
        .spacing(24);
        let aside =
            column![self.summary_card(form, &steps, &pace), self.quick_starts()].spacing(20);
        if self.window_width >= 1024.0 {
            row![main.width(Fill), aside.width(336)].spacing(24).into()
        } else {
            column![main, aside].spacing(24).into()
        }
    }
    /// `StepHeading`.
    fn step_heading<'a>(&self, number: u32, title: &'a str, hint: &'a str) -> Element<'a, Message> {
        let p = self.p();
        row![
            container(
                text(number.to_string())
                    .size(16.8)
                    .font(display(16.8))
                    .color(DARK_TEXT)
            )
            .center(36)
            .style(move |_| container::Style {
                background: Some(p.primary.into()),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 18.0.into(),
                },
                ..Default::default()
            }),
            column![
                text(title).size(20).font(display(20.)),
                text(hint).size(14).color(p.muted),
            ]
            .spacing(2)
            .width(Fill),
        ]
        .spacing(12)
        .into()
    }
    /// A `CHIP_BASE_CLASS` chip.
    fn chip<'a>(
        &self,
        content: Element<'a, Message>,
        background: Color,
        m: Option<Message>,
        lifted: bool,
    ) -> Element<'a, Message> {
        let p = self.p();
        button(content)
            .padding([6, 12])
            .on_press_maybe(m)
            .style(move |_, _| button::Style {
                background: Some(background.into()),
                text_color: p.ink,
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 999.0.into(),
                },
                shadow: if lifted {
                    design::soft_shadow(p)
                } else {
                    Shadow::default()
                },
                ..Default::default()
            })
            .into()
    }
    /// The builder's volume tab shown: other denominations see the New Testament in place of a hidden volume.
    fn builder_volume(&self, form: &BuilderForm) -> &'static str {
        if !self.show_lds() && crate::faith::is_lds_volume(form.active_volume) {
            "newtestament"
        } else {
            form.active_volume
        }
    }
    /// The volumes the builder offers (`PLAN_VOLUME_IDS`, without Latter-day Saint ones when they're hidden).
    fn builder_volumes(&self) -> impl Iterator<Item = &'static str> + '_ {
        model::PLAN_VOLUMES
            .into_iter()
            .filter(|v| self.show_lds() || !crate::faith::is_lds_volume(v))
    }
    /// `ScopeStep`.
    fn scope_step<'a>(&'a self, form: &'a BuilderForm) -> Element<'a, Message> {
        let p = self.p();
        let catalog = self.catalog();
        let state = &form.state;
        let mut whole = row![].spacing(8);
        for volume in self.builder_volumes() {
            let on = state.volume_selected(volume);
            let mut content = row![].spacing(6).align_y(Center);
            if on {
                content = content.push(check_icon(p.ink));
            }
            content = content
                .push(
                    text(model::volume_short_label(volume))
                        .size(14)
                        .font(sans(font::Weight::Semibold)),
                )
                .push(
                    text(catalog.volume_chapters(volume).to_string())
                        .size(12)
                        .font(sans(font::Weight::Bold))
                        .color(p.muted),
                );
            whole = whole.push(self.chip(
                content.into(),
                if on { p.mint } else { p.card },
                Some(bmsg(BuilderMsg::ToggleVolume(volume))),
                false,
            ));
        }
        // `segmented-control`
        let mut tabs = row![].spacing(4);
        for volume in self.builder_volumes() {
            let chosen = self.builder_volume(form) == volume;
            tabs = tabs.push(
                button(
                    container(
                        text(model::volume_tab_label(volume))
                            .size(14)
                            .font(sans(font::Weight::Semibold)),
                    )
                    .center_y(Fill),
                )
                .padding([0.0, 13.6])
                .height(33.6)
                .on_press(bmsg(BuilderMsg::Tab(volume)))
                .style(move |_, status| button::Style {
                    background: if chosen {
                        Some(p.ink.into())
                    } else if matches!(status, button::Status::Hovered) {
                        Some(p.hover.into())
                    } else {
                        None
                    },
                    text_color: if chosen { p.paper } else { p.ink },
                    border: Border {
                        radius: 999.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                }),
            );
        }
        let tabs = container(tabs.wrap())
            .padding(3.2)
            .style(move |_| container::Style {
                background: Some(p.card.into()),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 999.0.into(),
                },
                ..Default::default()
            });
        let active = self.builder_volume(form);
        let active_selected = state.volume_selected(active);
        let mut books = row![].spacing(8);
        for entry in catalog.books(active) {
            let selection = if active_selected {
                None
            } else {
                state.book_selection(&entry.volume, &entry.id)
            };
            let range = selection.filter(|s| s.kind == Kind::Range);
            let open = form.narrowing.as_ref() == Some(&(entry.volume.clone(), entry.id.clone()));
            let background = if active_selected {
                p.mint
            } else if range.is_some() {
                p.primary
            } else if selection.is_some() {
                p.sky_soft
            } else {
                p.card
            };
            let narrowed = range.is_some();
            let count = match range {
                Some(r) => format!("{}–{}", r.from.unwrap_or(1), r.to.unwrap_or(1)),
                None => entry.chapters.to_string(),
            };
            let label_color = if narrowed { DARK_TEXT } else { p.ink };
            let content = row![
                text(entry.label.clone())
                    .size(14)
                    .font(sans(font::Weight::Semibold))
                    .color(if active_selected {
                        design::fade(label_color, 0.7)
                    } else {
                        label_color
                    }),
                text(count)
                    .size(12)
                    .font(sans(font::Weight::Bold))
                    .color(if narrowed { DARK_TEXT } else { p.muted }),
            ]
            .spacing(6)
            .align_y(Center);
            books = books.push(
                self.chip(
                    content.into(),
                    background,
                    (!active_selected)
                        .then(|| bmsg(BuilderMsg::TapBook(entry.volume.clone(), entry.id.clone()))),
                    open,
                ),
            );
        }
        let mut pick = column![sub_label(p, "Or pick books"), tabs].spacing(12);
        if active_selected {
            pick = pick.push(
                text(format!(
                    "The whole {} is in this plan. Untap it above to pick individual books.",
                    model::volume_short_label(active)
                ))
                .size(14)
                .font(sans(font::Weight::Semibold))
                .color(p.muted),
            );
        }
        pick = pick.push(books.wrap().vertical_spacing(8));
        if let Some(strip) = self.narrow_strip(form) {
            pick = pick.push(strip);
        }
        container(
            column![
                self.step_heading(
                    1,
                    "What to read",
                    "Tap a whole volume, or pick books and narrow any of them to a chapter range. Everything reads in the order you add it."
                ),
                column![sub_label(p, "Whole volume"), whole.wrap().vertical_spacing(8)].spacing(8),
                pick,
            ]
            .spacing(20),
        )
        .padding(20)
        .width(Fill)
        .style(panel(p, p.card))
        .into()
    }
    /// The "Narrow …" strip under the books.
    fn narrow_strip<'a>(&'a self, form: &'a BuilderForm) -> Option<Element<'a, Message>> {
        let p = self.p();
        let catalog = self.catalog();
        let (volume, book) = form.narrowing.as_ref()?;
        if *volume != self.builder_volume(form) {
            return None;
        }
        let entry = catalog.find(volume, book)?;
        let selection = form.state.book_selection(volume, book)?;
        let (from, to) = narrowed_range(&form.state, volume, book, entry.chapters);
        let delineation = model::delineation(volume);
        let lower = delineation.to_lowercase();
        let mut buttons = row![].spacing(8);
        if selection.kind == Kind::Range {
            buttons = buttons.push(surface_button(
                p,
                surface_label("Whole book"),
                Some(bmsg(BuilderMsg::WholeBook)),
                12.0,
            ));
        }
        buttons = buttons
            .push(surface_button(
                p,
                surface_label("Remove"),
                Some(bmsg(BuilderMsg::RemoveBook)),
                12.0,
            ))
            .push(
                button(
                    container(text("Done").size(14).font(sans(font::Weight::Bold))).center_y(Fill),
                )
                .padding([0, 12])
                .height(36)
                .on_press(bmsg(BuilderMsg::DoneNarrowing))
                .style(move |_, _| button::Style {
                    background: Some(p.ink.into()),
                    text_color: p.paper,
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 999.0.into(),
                    },
                    ..Default::default()
                }),
            );
        let content = row![
            column![
                text(format!("Narrow {}", entry.label))
                    .size(14)
                    .font(sans(font::Weight::Bold)),
                text(format!("{delineation}s 1–{}", entry.chapters))
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.muted),
            ],
            row![
                sub_label(p, "From"),
                self.stepper(
                    form,
                    Field::From,
                    &format!("first {lower}"),
                    from as usize,
                    1,
                    entry.chapters as usize
                )
            ]
            .spacing(8)
            .align_y(Center),
            row![
                sub_label(p, "To"),
                self.stepper(
                    form,
                    Field::To,
                    &format!("last {lower}"),
                    to as usize,
                    from as usize,
                    entry.chapters as usize
                )
            ]
            .spacing(8)
            .align_y(Center),
            space().width(Fill),
            buttons,
        ]
        .spacing(16)
        .align_y(Center)
        .wrap()
        .vertical_spacing(12);
        Some(
            container(content)
                .padding(12)
                .width(Fill)
                .style(move |_| container::Style {
                    background: Some(p.note.into()),
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 16.0.into(),
                    },
                    ..Default::default()
                })
                .into(),
        )
    }
    /// `Stepper`: − [number] + in a pill.
    fn stepper<'a>(
        &self,
        form: &'a BuilderForm,
        field: Field,
        _label: &str,
        value: usize,
        min: usize,
        max: usize,
    ) -> Element<'a, Message> {
        let p = self.p();
        let shown = form
            .drafts
            .iter()
            .find(|(f, _)| *f == field)
            .map(|(_, d)| d.clone())
            .unwrap_or_else(|| value.to_string());
        let round = move |label: &'static str, m: Option<Message>| {
            button(container(text(label).size(18).font(sans(font::Weight::Bold))).center(40))
                .padding(0)
                .width(40)
                .height(40)
                .on_press_maybe(m)
                .style(move |_, status| button::Style {
                    background: matches!(status, button::Status::Hovered).then(|| p.hover.into()),
                    text_color: if matches!(status, button::Status::Disabled) {
                        design::fade(p.ink, 0.4)
                    } else {
                        p.ink
                    },
                    border: Border {
                        radius: 20.0.into(),
                        ..Default::default()
                    },
                    ..Default::default()
                })
        };
        container(
            row![
                round(
                    "−",
                    (value > min).then(|| bmsg(BuilderMsg::Stepper(field, value as u32 - 1)))
                ),
                text_input("", &shown)
                    .on_input(move |v| bmsg(BuilderMsg::Draft(field, v)))
                    .width(64)
                    .size(18.4)
                    .font(display(18.4))
                    .align_x(Center)
                    .padding([6, 0])
                    .style(move |_, _| text_input::Style {
                        background: Color::TRANSPARENT.into(),
                        border: Border::default(),
                        icon: p.muted,
                        placeholder: p.faint,
                        value: p.ink,
                        selection: p.gold,
                    }),
                round(
                    "+",
                    (value < max).then(|| bmsg(BuilderMsg::Stepper(field, value as u32 + 1)))
                ),
            ]
            .align_y(Center),
        )
        .padding(2)
        .style(move |_| container::Style {
            background: Some(p.card.into()),
            border: Border {
                color: p.rule,
                width: 1.0,
                radius: 999.0.into(),
            },
            shadow: design::soft_shadow(p),
            ..Default::default()
        })
        .into()
    }
    /// `PaceStep`.
    fn pace_step<'a>(
        &'a self,
        form: &'a BuilderForm,
        steps: usize,
        pace: &(usize, Option<model::Pace>, Option<&'static str>),
    ) -> Element<'a, Message> {
        let p = self.p();
        let state = &form.state;
        let summary = pace.1.as_ref();
        let now = model::today();
        let cards = [
            (
                Driver::PerDay,
                "Chapters per day",
                summary.map(|s| s.per_day.to_string()),
                "Fix the daily amount",
            ),
            (
                Driver::Days,
                "Reading days",
                summary.map(|s| s.days.to_string()),
                "Fix how many sittings",
            ),
            (
                Driver::FinishBy,
                "Finish by",
                summary.and_then(|s| s.end.as_deref().map(|e| model::format_short_date(e, now))),
                "Fix the end date",
            ),
        ];
        let mut grid = row![].spacing(12);
        for (driver, label, value, note) in cards {
            let active = state.driver == driver;
            grid = grid.push(
                button(
                    column![
                        text(label.to_uppercase())
                            .size(10.6)
                            .font(sans(font::Weight::Bold))
                            .color(if active { DARK_TEXT } else { p.faint }),
                        text(value.unwrap_or_else(|| "–".into()))
                            .size(24)
                            .font(display(24.))
                            .color(if active { DARK_TEXT } else { p.ink }),
                        text(if active { "Driving the schedule" } else { note })
                            .size(12)
                            .font(sans(font::Weight::Semibold))
                            .color(if active {
                                Color {
                                    a: 0.7,
                                    ..DARK_TEXT
                                }
                            } else {
                                p.muted
                            }),
                    ]
                    .spacing(2),
                )
                .padding([12, 16])
                .width(Length::FillPortion(1))
                .on_press(bmsg(BuilderMsg::Driver(driver)))
                .style(move |_, _| button::Style {
                    background: Some(if active { p.primary } else { p.card }.into()),
                    text_color: p.ink,
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 16.0.into(),
                    },
                    shadow: if active {
                        design::soft_shadow(p)
                    } else {
                        Shadow::default()
                    },
                    ..Default::default()
                }),
            );
        }
        let max = steps.max(1);
        let mut driver_input = column![].spacing(8);
        match state.driver {
            Driver::PerDay => {
                driver_input =
                    driver_input
                        .push(sub_label(p, "Chapters per day"))
                        .push(self.stepper(
                            form,
                            Field::PerDay,
                            "chapters per day",
                            state.per_day,
                            1,
                            max,
                        ));
            }
            Driver::Days => {
                driver_input = driver_input
                    .push(sub_label(p, "Reading days"))
                    .push(self.stepper(
                        form,
                        Field::Days,
                        "reading days",
                        state.target_days,
                        1,
                        max,
                    ));
                if let Some(s) = summary
                    && s.days != state.target_days
                    && steps > 0
                {
                    driver_input = driver_input.push(
                        text(format!(
                            "At {} a day it actually wraps up in {}.",
                            s.per_day,
                            model::plural(s.days, "reading day")
                        ))
                        .size(12)
                        .font(sans(font::Weight::Semibold))
                        .color(p.muted),
                    );
                }
            }
            Driver::FinishBy => {
                driver_input = driver_input
                    .push(sub_label(p, "Finish by"))
                    .push(self.date_field(form, DateTarget::Finish, 224.0));
            }
        }
        if let Some(issue) = pace.2 {
            driver_input = driver_input.push(error_text(p, issue));
        }
        let per_week = model::days_per_week(&state.reading_days);
        let mut weekdays = row![].spacing(6);
        for (index, label) in model::WEEKDAY_LABELS.iter().enumerate() {
            let on = state.reading_days[index];
            weekdays = weekdays.push(
                button(
                    container(text(*label).size(12).font(sans(font::Weight::Bold))).center(Fill),
                )
                .padding(0)
                .width(48)
                .height(40)
                .on_press(bmsg(BuilderMsg::Weekday(index)))
                .style(move |_, _| button::Style {
                    background: Some(if on { p.ink } else { p.card }.into()),
                    text_color: if on { p.paper } else { p.muted },
                    border: Border {
                        color: p.rule,
                        width: 1.0,
                        radius: 999.0.into(),
                    },
                    ..Default::default()
                }),
            );
        }
        let days_block = column![
            sub_label(
                p,
                format!(
                    "Reading days · {}",
                    if per_week == 7 {
                        "every day".to_string()
                    } else {
                        format!("{per_week} a week")
                    }
                )
            ),
            weekdays.wrap()
        ]
        .spacing(8);
        let start_block = column![
            sub_label(p, "Start date"),
            self.date_field(form, DateTarget::Start, 192.0)
        ]
        .spacing(8);
        container(
            column![
                self.step_heading(
                    2,
                    "How fast",
                    "Choose the one number you care about. The other two follow from it."
                ),
                grid,
                driver_input,
                row![container(days_block).width(Fill), start_block]
                    .spacing(16)
                    .align_y(iced::Alignment::End),
            ]
            .spacing(20),
        )
        .padding(20)
        .width(Fill)
        .style(panel(p, p.card))
        .into()
    }
    /// The website's `<input type="date">`: the date as the browser shows it ("10/28/2026"), typed or chosen from
    /// its calendar (the button, or the keyboard: arrows, Page Up/Down for months, Enter, Escape). Days before the
    /// field's minimum (a finish date before the start) can't be chosen. Stored as the date key (YYYY-MM-DD).
    fn date_field<'a>(
        &self,
        form: &'a BuilderForm,
        target: DateTarget,
        width: f32,
    ) -> Element<'a, Message> {
        let p = self.p();
        let state = &form.state;
        let key = match target {
            DateTarget::Start => &state.start_date,
            DateTarget::Finish => &state.finish_by,
        };
        let typed = form
            .date_text
            .iter()
            .find(|(t, _)| *t == target)
            .map(|(_, v)| v.clone());
        let shown = typed.clone().unwrap_or_else(|| date_display(key));
        let invalid = typed
            .as_ref()
            .is_some_and(|t| !t.trim().is_empty() && key.is_empty());
        let open = form.date.as_ref().filter(|d| d.target == target);
        let input = text_input("mm/dd/yyyy", &shown)
            .id(match target {
                DateTarget::Start => "plan-start-date",
                DateTarget::Finish => "plan-finish-date",
            })
            .on_input(move |v| bmsg(BuilderMsg::DateText(target, v)))
            .size(14)
            .font(sans(font::Weight::Semibold))
            .padding(Padding {
                top: 8.0,
                right: 40.0,
                bottom: 8.0,
                left: 12.0,
            })
            .width(width)
            .style(soft_input(p));
        let field = crate::date_picker::with_toggle(
            p,
            input,
            open.is_some(),
            bmsg(BuilderMsg::DateOpen(target)),
            Length::Fixed(width),
        );
        let min = (target == DateTarget::Finish)
            .then(|| chrono::NaiveDate::parse_from_str(&state.start_date, "%Y-%m-%d").ok())
            .flatten();
        let panel = open.map(|d| self.calendar(d, key, min));
        let picker = crate::popup::popup(field, panel)
            .on_dismiss(bmsg(BuilderMsg::DateClose))
            .on_key(crate::date_picker::calendar_keys(
                |by| bmsg(BuilderMsg::DateFocus(by)),
                |by| bmsg(BuilderMsg::DateMonth(by)),
                bmsg(BuilderMsg::DateEnter),
            ));
        let mut c = column![picker].spacing(4);
        if invalid {
            c = c.push(error_text(p, "Enter a whole date, like 10/28/2026."));
        }
        c.into()
    }
    /// The date input's calendar (`date_picker`), with Clear: a plan's dates aren't required.
    fn calendar<'a>(
        &self,
        d: &DatePicker,
        key: &str,
        min: Option<chrono::NaiveDate>,
    ) -> Element<'a, Message> {
        let target = d.target;
        self.date_calendar(
            &d.calendar(),
            chrono::NaiveDate::parse_from_str(key, "%Y-%m-%d").ok(),
            min,
            true,
            move |key| bmsg(BuilderMsg::DatePick(target, key)),
            |by| bmsg(BuilderMsg::DateMonth(by)),
        )
    }
    /// `SummaryCard`.
    fn summary_card<'a>(
        &'a self,
        form: &'a BuilderForm,
        steps: &[model::StepInput],
        pace: &(usize, Option<model::Pace>, Option<&'static str>),
    ) -> Element<'a, Message> {
        let p = self.p();
        let catalog = self.catalog();
        let state = &form.state;
        let editing = matches!(self.plans.page, Page::Builder(Some(_)));
        let title = state.title(&catalog);
        let summary = pace.1.as_ref();
        let per_week = model::days_per_week(&state.reading_days);
        let now = model::today();
        let preview = match summary {
            Some(s) => format!(
                "Day 1 is {}. {} with {}.",
                model::describe_first_day(&catalog, &steps[..s.per_day.min(steps.len())]),
                model::plural(
                    s.calendar_days.map(|d| d as usize).unwrap_or(s.days),
                    "calendar day"
                ),
                if per_week == 7 {
                    "reading every day".to_string()
                } else {
                    format!(
                        "{per_week} reading {} a week",
                        if per_week == 1 { "day" } else { "days" }
                    )
                }
            ),
            None => "Pick something to read and the schedule will fill in here.".into(),
        };
        let title_input = column![
            text(format!(
                "PLAN TITLE{}",
                if state.title_override.is_none() {
                    " · AUTO"
                } else {
                    ""
                }
            ))
            .size(10.6)
            .font(sans(font::Weight::Bold))
            .color(p.muted),
            text_input("Name this plan", &title)
                .on_input(|v| bmsg(BuilderMsg::Title(v.chars().take(120).collect())))
                .size(21.6)
                .font(display(21.6))
                .padding(Padding::ZERO.bottom(4))
                .style(move |_, _| text_input::Style {
                    background: Color::TRANSPARENT.into(),
                    border: Border::default(),
                    icon: p.muted,
                    placeholder: p.faint,
                    value: p.ink,
                    selection: p.gold,
                }),
            container(space())
                .height(2)
                .width(Fill)
                .style(move |_| container::Style {
                    background: Some(p.rule.into()),
                    ..Default::default()
                }),
        ]
        .spacing(4);
        let picks: Element<'_, Message> = if state.selections.is_empty() {
            text("Nothing picked yet.")
                .size(14)
                .font(sans(font::Weight::Semibold))
                .color(p.muted)
                .into()
        } else {
            let mut chips = row![].spacing(6);
            for (index, s) in state.selections.iter().enumerate() {
                chips = chips.push(
                    container(
                        row![
                            text(catalog.describe(s))
                                .size(12)
                                .font(sans(font::Weight::Bold)),
                            text(catalog.selection_chapters(s).to_string())
                                .size(12)
                                .font(sans(font::Weight::Bold))
                                .color(p.muted),
                            button(container(close_icon(p.ink)).center(22))
                                .padding(0)
                                .width(24)
                                .height(24)
                                .on_press(bmsg(BuilderMsg::RemoveSelection(index)))
                                .style(design::outlined(p, 12.0)),
                        ]
                        .spacing(6)
                        .align_y(Center),
                    )
                    .padding(Padding {
                        top: 2.0,
                        right: 2.0,
                        bottom: 2.0,
                        left: 10.0,
                    })
                    .style(move |_| container::Style {
                        background: Some(p.card.into()),
                        border: Border {
                            color: p.rule,
                            width: 1.0,
                            radius: 999.0.into(),
                        },
                        ..Default::default()
                    }),
                );
            }
            chips.wrap().vertical_spacing(6).into()
        };
        let tile = move |value: String, label: &'static str| {
            container(column![
                text(value).size(20).font(display(20.)),
                text(label.to_uppercase())
                    .size(10.6)
                    .font(sans(font::Weight::Bold))
                    .color(p.muted),
            ])
            .padding([8, 12])
            .width(Length::FillPortion(1))
            .style(move |_| container::Style {
                background: Some(p.card.into()),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 13.6.into(),
                },
                ..Default::default()
            })
        };
        let dash = || "–".to_string();
        let tiles = column![
            row![
                tile(steps.len().to_string(), "Chapters"),
                tile(
                    summary.map(|s| s.per_day.to_string()).unwrap_or_else(dash),
                    "Per reading day"
                ),
            ]
            .spacing(8),
            row![
                tile(
                    summary.map(|s| s.days.to_string()).unwrap_or_else(dash),
                    "Reading days"
                ),
                tile(
                    summary
                        .and_then(|s| s.end.as_deref().map(|e| model::format_short_date(e, now)))
                        .unwrap_or_else(dash),
                    "Finishes"
                ),
            ]
            .spacing(8),
        ]
        .spacing(8);
        let mut c = column![
            title_input,
            picks,
            tiles,
            text(preview)
                .size(14)
                .font(sans(font::Weight::Semibold))
                .line_height(1.375),
        ]
        .spacing(16);
        let issues = if form.attempted {
            state.issues(&catalog, steps.len())
        } else {
            vec![]
        };
        if !issues.is_empty() {
            let mut list = column![].spacing(4);
            for issue in issues {
                list = list.push(
                    text(issue)
                        .size(14)
                        .font(sans(font::Weight::Semibold))
                        .color(DARK_TEXT),
                );
            }
            c = c.push(
                container(list)
                    .padding([8, 12])
                    .width(Fill)
                    .style(move |_| container::Style {
                        background: Some(p.coral.into()),
                        border: Border {
                            color: p.rule,
                            width: 1.0,
                            radius: 13.6.into(),
                        },
                        ..Default::default()
                    }),
            );
        }
        if let Some(e) = &form.server_error {
            c = c.push(error_text(p, e.clone()));
        }
        c = c.push(
            button(
                container(
                    text(if form.saving {
                        "Saving…"
                    } else if editing {
                        "Save changes"
                    } else {
                        "Start this plan"
                    })
                    .size(14)
                    .font(sans(font::Weight::Bold)),
                )
                .center(Fill),
            )
            .width(Fill)
            .height(44)
            .on_press_maybe((!form.saving).then(|| bmsg(BuilderMsg::Submit)))
            .style(primary_style(p)),
        );
        if editing {
            c = c.push(
                text("Chapters you've already read stay read. Only the schedule is rebuilt.")
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.muted),
            );
        }
        container(c)
            .padding(20)
            .width(Fill)
            .style(move |_| container::Style {
                background: Some(p.note.into()),
                text_color: Some(p.ink),
                border: Border {
                    color: p.rule,
                    width: 1.0,
                    radius: 8.0.into(),
                },
                ..Default::default()
            })
            .into()
    }
    /// `QuickStarts`.
    fn quick_starts(&self) -> Element<'_, Message> {
        let p = self.p();
        let mut list = column![].spacing(8);
        for (id, label, hint) in model::QUICK_STARTS {
            // The Book of Mormon plan is Latter-day Saint content.
            if id == "bom-30" && !self.show_lds() {
                continue;
            }
            list = list.push(
                button(
                    column![
                        text(label).size(14).font(sans(font::Weight::Bold)),
                        text(hint)
                            .size(12)
                            .font(sans(font::Weight::Semibold))
                            .color(p.muted),
                    ]
                    .spacing(0),
                )
                .padding([8, 12])
                .width(Fill)
                .on_press(bmsg(BuilderMsg::Quick(id)))
                .style(design::outlined(p, 13.6)),
            );
        }
        container(
            column![
                text("Quick starts").size(16.8).font(display(16.8)),
                list,
                text("These fill in the builder. Tweak anything before you start.")
                    .size(12)
                    .font(sans(font::Weight::Semibold))
                    .color(p.muted),
            ]
            .spacing(12),
        )
        .padding(16)
        .width(Fill)
        .style(panel(p, p.card))
        .into()
    }
}

/// `panel-card-soft px-5 py-6 text-sm`, for loading and empty states.
fn soft_note<'a>(p: Colors, message: &'static str) -> Element<'a, Message> {
    container(text(message).size(14).color(p.muted))
        .padding([24, 20])
        .width(Fill)
        .style(panel(p, p.soft))
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud::AccountUser;

    fn signed_in() -> (App, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "verse-plans-{}-{}",
            std::process::id(),
            crate::store::new_id()
        ));
        let mut app = App::from_directory(&dir);
        app.account.session = Some(cloud::Session::for_test(
            AccountUser {
                id: "reader".into(),
                name: "Reader".into(),
                email: "reader@example.com".into(),
            },
            "token",
        ));
        (app, dir)
    }
    fn send(app: &mut App, m: BuilderMsg) {
        let _ = app.update_plans(PlansMsg::Builder(m));
    }

    #[test]
    fn plan_dates_are_typed_or_chosen_from_a_calendar_like_the_browsers() {
        let (mut app, dir) = signed_in();
        let _ = app.update_plans(PlansMsg::New);
        let form = |app: &App| app.plans.builder.as_ref().unwrap().clone_dates();
        // Typing: only a whole, real date is a value (as `<input type="date">`), shown back as typed.
        send(
            &mut app,
            BuilderMsg::DateText(DateTarget::Start, "11/3".into()),
        );
        assert_eq!(form(&app).0, "");
        send(
            &mut app,
            BuilderMsg::DateText(DateTarget::Start, "02/30/2027".into()),
        );
        assert_eq!(form(&app).0, "", "no February 30th");
        send(
            &mut app,
            BuilderMsg::DateText(DateTarget::Start, "11/03/2026".into()),
        );
        assert_eq!(form(&app).0, "2026-11-03");
        assert_eq!(date_display("2026-11-03"), "11/03/2026");
        assert_eq!(
            parse_typed_date("2026-11-03").as_deref(),
            Some("2026-11-03")
        );
        // The calendar opens on the chosen day; arrows move by days and weeks, Page Down by months.
        send(&mut app, BuilderMsg::DateOpen(DateTarget::Finish));
        let picker = app.plans.builder.as_ref().unwrap().date.clone().unwrap();
        assert_eq!(picker.target, DateTarget::Finish);
        send(&mut app, BuilderMsg::DateClose);
        send(&mut app, BuilderMsg::DateOpen(DateTarget::Start));
        let d = |app: &App| app.plans.builder.as_ref().unwrap().date.clone().unwrap();
        assert_eq!(d(&app).focus.to_string(), "2026-11-03");
        send(&mut app, BuilderMsg::DateFocus(7));
        send(&mut app, BuilderMsg::DateFocus(-1));
        assert_eq!(d(&app).focus.to_string(), "2026-11-09");
        send(&mut app, BuilderMsg::DateMonth(1));
        assert_eq!(d(&app).month.to_string(), "2026-12-01");
        assert_eq!(d(&app).focus.to_string(), "2026-12-09");
        send(&mut app, BuilderMsg::DateEnter);
        assert_eq!(form(&app).0, "2026-12-09");
        assert!(app.plans.builder.as_ref().unwrap().date.is_none());
        // A finish date before the start can't be chosen from the calendar.
        send(&mut app, BuilderMsg::Driver(Driver::FinishBy));
        send(&mut app, BuilderMsg::DateOpen(DateTarget::Finish));
        assert_eq!(
            d(&app).focus.to_string(),
            "2026-12-09",
            "opens on its minimum"
        );
        send(&mut app, BuilderMsg::DateFocus(-3));
        send(&mut app, BuilderMsg::DateEnter);
        assert_eq!(form(&app).1, "");
        send(&mut app, BuilderMsg::DateFocus(10));
        send(&mut app, BuilderMsg::DateEnter);
        assert_eq!(form(&app).1, "2026-12-16");
        // Clear empties the field.
        send(&mut app, BuilderMsg::DateOpen(DateTarget::Finish));
        send(&mut app, BuilderMsg::DatePick(DateTarget::Finish, None));
        assert_eq!(form(&app).1, "");
        let _ = app.view();
        drop(app);
        std::fs::remove_dir_all(dir).unwrap();
    }
    /// The builder, driven as a reader would, saves exactly what the website's builder saves.
    #[test]
    fn the_builder_creates_and_edits_plans_like_the_website() {
        let (mut app, dir) = signed_in();
        let _ = app.update_plans(PlansMsg::New);
        assert_eq!(app.plans.page, Page::Builder(None));
        // Nothing picked: saving shows the website's problem and sends nothing.
        send(&mut app, BuilderMsg::Submit);
        let form = app.plans.builder.as_ref().unwrap();
        assert!(form.attempted && !form.saving);
        assert!(app.plan_call().is_none());
        // Pearl of Great Price whole, then Mark narrowed to 2–5 from the New Testament tab.
        send(&mut app, BuilderMsg::ToggleVolume("pearl"));
        send(&mut app, BuilderMsg::Tab("newtestament"));
        send(
            &mut app,
            BuilderMsg::TapBook("newtestament".into(), "mark".into()),
        );
        send(
            &mut app,
            BuilderMsg::TapBook("newtestament".into(), "mark".into()),
        );
        send(&mut app, BuilderMsg::Stepper(Field::From, 2));
        send(&mut app, BuilderMsg::Draft(Field::To, "5".into()));
        send(&mut app, BuilderMsg::DoneNarrowing);
        // Reading days: weekdays only; finish in 4 reading days from a fixed start.
        send(&mut app, BuilderMsg::Weekday(5));
        send(&mut app, BuilderMsg::Weekday(6));
        // The start date typed as the browser's date input shows it.
        send(
            &mut app,
            BuilderMsg::DateText(DateTarget::Start, "11/02/2026".into()),
        );
        send(&mut app, BuilderMsg::Driver(Driver::Days));
        send(&mut app, BuilderMsg::Draft(Field::Days, "4".into()));
        let (name, args) = app.plan_call().unwrap();
        assert_eq!(name, "readingPlans:createPlan");
        assert_eq!(args["template"], "custom");
        assert_eq!(args["title"], "Pearl of Great Price + Mark 2–5");
        assert_eq!(
            args["selections"],
            json!([
                {"kind": "volume", "volume": "pearl"},
                {"kind": "range", "volume": "newtestament", "book": "mark", "from": 2, "to": 5}
            ])
        );
        let steps = args["steps"].as_array().unwrap();
        assert_eq!(steps.len(), 16 + 4);
        assert_eq!(
            steps[0],
            json!({"volume": "pearl", "book": "moses", "chapter": 1, "label": "Moses 1"})
        );
        assert_eq!(steps[16]["label"], "Mark 2");
        // 20 chapters over 4 reading days: 5 a day.
        assert_eq!(args["chaptersPerDay"], 5);
        assert_eq!(
            args["readingDays"],
            json!([true, true, true, true, true, false, false])
        );
        assert_eq!(args["startDate"], "2026-11-02");
        // A title of the reader's own.
        send(&mut app, BuilderMsg::Title("Evenings".into()));
        assert_eq!(app.plan_call().unwrap().1["title"], "Evenings");

        // Editing a saved plan starts from its selections, pace and title, and updates that plan.
        let plan = Plan {
            summary: PlanSummary {
                id: "plan-1".into(),
                title: "Mark".into(),
                template: "book-daily".into(),
                step_count: 16,
                read_count: 3,
                start_date: Some("2026-10-01".into()),
                chapters_per_day: Some(1),
                reading_days: None,
                selections: None,
            },
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
        };
        app.plans.open = Some(PlansLoad::Ready(plan));
        let _ = app.update_plans(PlansMsg::Edit("plan-1".into()));
        assert_eq!(app.plans.page, Page::Builder(Some("plan-1".into())));
        let form = app.plans.builder.as_ref().unwrap();
        assert_eq!(
            form.state.selections,
            vec![Selection::book("newtestament", "mark")]
        );
        assert_eq!(form.state.title_override, None);
        send(&mut app, BuilderMsg::Stepper(Field::PerDay, 2));
        let (name, args) = app.plan_call().unwrap();
        assert_eq!(name, "readingPlans:updatePlan");
        assert_eq!(args["planId"], "plan-1");
        assert_eq!(args["chaptersPerDay"], 2);
        assert_eq!(args["startDate"], "2026-10-01");
        assert_eq!(args.get("template"), None);
        // Leaving the builder goes back to the plan.
        let _ = app.update_plans(PlansMsg::CloseBuilder);
        assert_eq!(app.plans.page, Page::Detail);
        assert!(app.plans.builder.is_none());
        drop(app);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn other_traditions_build_bible_plans_and_keep_a_saved_plans_hidden_volumes() {
        use crate::{Message, Screen, faith};
        let (mut app, dir) = signed_in();
        let _ = app.update(Message::SetScreen(Screen::Plans));
        let _ = app.update(Message::SetFaith(faith::OTHER));
        let _ = app.update_plans(PlansMsg::New);
        let count = |app: &App, label: &str| {
            crate::ui_tests::visible_texts(app)
                .iter()
                .filter(|t| t.as_str() == label)
                .count()
        };
        // Only the Bible's volumes are offered, whole or by book, and no Book of Mormon quick start; the volume tab
        // left on the Book of Mormon shows the New Testament instead.
        for hidden in [
            "Book of Mormon",
            "Doctrine & Covenants",
            "D&C",
            "Pearl of Great Price",
        ] {
            assert_eq!(count(&app, hidden), 0, "{hidden}");
        }
        assert_eq!(count(&app, "Book of Mormon in 30 days"), 0);
        assert!(count(&app, "Old Testament") >= 2 && count(&app, "New Testament") >= 2);
        assert_eq!(
            app.plans.builder.as_ref().unwrap().active_volume,
            "bookofmormon"
        );
        assert!(count(&app, "Matthew") >= 1, "the New Testament's books");
        assert_eq!(count(&app, "1 Nephi"), 0);
        // A plan made here holds only what was offered.
        send(&mut app, BuilderMsg::ToggleVolume("oldtestament"));
        send(&mut app, BuilderMsg::Driver(Driver::Days));
        send(&mut app, BuilderMsg::Draft(Field::Days, "90".into()));
        let (name, args) = app.plan_call().unwrap();
        assert_eq!(name, "readingPlans:createPlan");
        assert_eq!(
            args["selections"],
            json!([{"kind": "volume", "volume": "oldtestament"}])
        );
        assert!(
            args["steps"]
                .as_array()
                .unwrap()
                .iter()
                .all(|s| s["volume"] == "oldtestament")
        );

        // Editing a plan saved with a Latter-day Saint volume keeps it: its tile shows, it stays in the plan, and
        // the update sends it back unchanged with the new pace, as the website does. Nothing is dropped.
        let steps: Vec<PlanStep> = (1..=22)
            .map(|c| PlanStep {
                volume: "bookofmormon".into(),
                book: "1nephi".into(),
                chapter: c,
                label: format!("1 Nephi {c}"),
                index: c as usize - 1,
                read_at: None,
            })
            .collect();
        let plan = Plan {
            summary: PlanSummary {
                id: "plan-lds".into(),
                title: "1 Nephi + Mark".into(),
                template: "custom".into(),
                step_count: 22,
                read_count: 0,
                start_date: Some("2026-10-01".into()),
                chapters_per_day: Some(1),
                reading_days: None,
                selections: Some(vec![
                    Selection::book("bookofmormon", "1nephi"),
                    Selection::book("newtestament", "mark"),
                ]),
            },
            steps,
        };
        app.plans.open = Some(PlansLoad::Ready(plan));
        let _ = app.update_plans(PlansMsg::Edit("plan-lds".into()));
        let form = app.plans.builder.as_ref().unwrap();
        assert_eq!(form.state.selections.len(), 2);
        assert_eq!(
            count(&app, "1 Nephi"),
            1,
            "its selection tile, not a book to add"
        );
        assert_eq!(count(&app, "Book of Mormon"), 0, "no volume chip or tab");
        send(&mut app, BuilderMsg::Stepper(Field::PerDay, 2));
        let (name, args) = app.plan_call().unwrap();
        assert_eq!(name, "readingPlans:updatePlan");
        assert_eq!(
            args["selections"],
            json!([
                {"kind": "book", "volume": "bookofmormon", "book": "1nephi"},
                {"kind": "book", "volume": "newtestament", "book": "mark"}
            ])
        );
        let steps = args["steps"].as_array().unwrap();
        assert_eq!(steps[0]["label"], "1 Nephi 1");
        assert_eq!(steps.len(), 22 + 16);
        assert_eq!(args["chaptersPerDay"], 2);

        // Back to the Latter-day Saint tradition, everything is offered again.
        let _ = app.update_plans(PlansMsg::CloseBuilder);
        let _ = app.update(Message::SetFaith(faith::LATTER_DAY_SAINT));
        let _ = app.update_plans(PlansMsg::New);
        assert!(count(&app, "Book of Mormon") >= 2);
        assert_eq!(count(&app, "Book of Mormon in 30 days"), 1);
        drop(app);
        let _ = std::fs::remove_dir_all(dir);
    }
}
