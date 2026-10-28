// The website's plan rules, ported so the native builder and plan pages compute exactly what the website does:
// selections and their steps (`planScope.ts`), reading days, pace and the day-by-day schedule
// (`planSchedule.ts`), and the builder's pace resolution (`PlanBuilder.tsx`). Reading days are seven flags,
// Monday first, as the website stores them. Pure, so testable.
use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::store::Book;

pub const PLAN_VOLUMES: [&str; 5] = [
    "bookofmormon",
    "oldtestament",
    "newtestament",
    "doctrineandcovenants",
    "pearl",
];
pub const WEEKDAY_LABELS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
pub const DEFAULT_PLAN_TITLE: &str = "New plan";

/// `VOLUME_SHORT_LABELS`.
pub fn volume_short_label(volume: &str) -> &'static str {
    match volume {
        "bookofmormon" => "Book of Mormon",
        "oldtestament" => "Old Testament",
        "newtestament" => "New Testament",
        "doctrineandcovenants" => "Doctrine & Covenants",
        "pearl" => "Pearl of Great Price",
        _ => "Scriptures",
    }
}
/// The builder's `VOLUME_TAB_LABELS`.
pub fn volume_tab_label(volume: &str) -> &'static str {
    match volume {
        "doctrineandcovenants" => "D&C",
        other => volume_short_label(other),
    }
}
/// `getChapterDelineation`.
pub fn delineation(volume: &str) -> &'static str {
    if volume == "doctrineandcovenants" {
        "Section"
    } else {
        "Chapter"
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Volume,
    Book,
    Range,
}

/// One piece of a plan's scope (`PlanSelection`); a plan reads its selections in order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Selection {
    pub kind: Kind,
    pub volume: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub book: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<u32>,
}
impl Selection {
    pub fn volume(volume: &str) -> Self {
        Self {
            kind: Kind::Volume,
            volume: volume.into(),
            book: None,
            from: None,
            to: None,
        }
    }
    pub fn book(volume: &str, book: &str) -> Self {
        Self {
            kind: Kind::Book,
            volume: volume.into(),
            book: Some(book.into()),
            from: None,
            to: None,
        }
    }
    pub fn range(volume: &str, book: &str, from: u32, to: u32) -> Self {
        Self {
            kind: Kind::Range,
            volume: volume.into(),
            book: Some(book.into()),
            from: Some(from),
            to: Some(to),
        }
    }
    /// `isSameTarget`: the same volume and book.
    pub fn same_target(&self, volume: &str, book: Option<&str>) -> bool {
        self.volume == volume && self.book.as_deref().unwrap_or("") == book.unwrap_or("")
    }
}

/// A chapter of a plan (`PlanStepInput`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StepInput {
    pub volume: String,
    pub book: String,
    pub chapter: u32,
    pub label: String,
}

/// The website's plan catalog (`QUICK_NAV_BOOKS`), which the reader's book list matches.
pub struct Catalog<'a> {
    pub books: &'a [Book],
}
impl<'a> Catalog<'a> {
    pub fn books(&self, volume: &str) -> impl Iterator<Item = &'a Book> + use<'a, '_> {
        let volume = volume.to_string();
        self.books.iter().filter(move |b| b.volume == volume)
    }
    pub fn find(&self, volume: &str, book: &str) -> Option<&'a Book> {
        self.books
            .iter()
            .find(|b| b.volume == volume && b.id == book)
    }
    /// `getBookLabel`.
    pub fn label(&self, volume: &str, book: &str) -> String {
        match self.find(volume, book) {
            Some(b) if b.id == "doctrineandcovenants" => "D&C".into(),
            Some(b) => b.label.clone(),
            None => book.replace('-', " "),
        }
    }
    pub fn volume_chapters(&self, volume: &str) -> u32 {
        self.books(volume).map(|b| b.chapters).sum()
    }
    fn range_steps(&self, volume: &str, book: &str, from: u32, to: u32) -> Vec<StepInput> {
        let Some(b) = self.find(volume, book) else {
            return vec![];
        };
        let from = from.clamp(1, b.chapters.max(1));
        let to = to.min(b.chapters).max(from);
        (from..=to)
            .map(|chapter| StepInput {
                volume: b.volume.clone(),
                book: b.id.clone(),
                chapter,
                label: format!("{} {chapter}", self.label(&b.volume, &b.id)),
            })
            .collect()
    }
    /// `buildSelectionSteps`.
    pub fn selection_steps(&self, s: &Selection) -> Vec<StepInput> {
        match (s.kind, s.book.as_deref()) {
            (Kind::Volume, _) => self
                .books(&s.volume)
                .flat_map(|b| self.range_steps(&b.volume, &b.id, 1, b.chapters))
                .collect(),
            (_, None) => vec![],
            (Kind::Book, Some(book)) => self
                .find(&s.volume, book)
                .map(|b| self.range_steps(&s.volume, book, 1, b.chapters))
                .unwrap_or_default(),
            (Kind::Range, Some(book)) => {
                let from = s.from.unwrap_or(1);
                self.range_steps(&s.volume, book, from, s.to.unwrap_or(from))
            }
        }
    }
    /// `buildScopeSteps`: every selection's chapters in order, each chapter once.
    pub fn scope_steps(&self, selections: &[Selection]) -> Vec<StepInput> {
        let mut seen = std::collections::HashSet::new();
        selections
            .iter()
            .flat_map(|s| self.selection_steps(s))
            .filter(|s| seen.insert((s.volume.clone(), s.book.clone(), s.chapter)))
            .collect()
    }
    /// `countSelectionChapters`.
    pub fn selection_chapters(&self, s: &Selection) -> u32 {
        if s.kind == Kind::Volume {
            return self.volume_chapters(&s.volume);
        }
        let Some(b) = s
            .book
            .as_deref()
            .and_then(|book| self.find(&s.volume, book))
        else {
            return 0;
        };
        if s.kind == Kind::Book {
            return b.chapters;
        }
        let from = s.from.unwrap_or(1).max(1);
        let to = s.to.unwrap_or(from).min(b.chapters);
        (to + 1).saturating_sub(from)
    }
    /// `describeSelection`: "Book of Mormon", "Acts", "Isaiah 1–12", "D&C 76".
    pub fn describe(&self, s: &Selection) -> String {
        if s.kind == Kind::Volume {
            return volume_short_label(&s.volume).into();
        }
        let label = self.label(&s.volume, s.book.as_deref().unwrap_or(""));
        if s.kind == Kind::Book {
            return label;
        }
        let from = s.from.unwrap_or(1);
        let to = s.to.unwrap_or(from);
        if from == to {
            format!("{label} {from}")
        } else {
            format!("{label} {from}–{to}")
        }
    }
    /// `autoTitleFromSelections`: "Acts + Isaiah 1–12", or "Genesis + Exodus + Leviticus + 2 more".
    pub fn auto_title(&self, selections: &[Selection]) -> String {
        if selections.is_empty() {
            return DEFAULT_PLAN_TITLE.into();
        }
        let labels: Vec<String> = selections.iter().map(|s| self.describe(s)).collect();
        if labels.len() <= 3 {
            labels.join(" + ")
        } else {
            format!("{} + {} more", labels[..3].join(" + "), labels.len() - 3)
        }
    }
    /// `selectionsFromSteps`: selections rebuilt from saved steps, for plans created before selections were kept.
    pub fn selections_from_steps(&self, steps: &[(String, String, u32)]) -> Vec<Selection> {
        let mut ranges: Vec<Selection> = vec![];
        for (volume, book, chapter) in steps {
            if let Some(last) = ranges.last_mut()
                && last.volume == *volume
                && last.book.as_deref() == Some(book)
                && last.to.map(|t| t + 1) == Some(*chapter)
            {
                last.to = Some(*chapter);
                continue;
            }
            ranges.push(Selection::range(volume, book, *chapter, *chapter));
        }
        let books: Vec<Selection> = ranges
            .into_iter()
            .map(
                |r| match self.find(&r.volume, r.book.as_deref().unwrap_or("")) {
                    Some(b) if r.from == Some(1) && r.to == Some(b.chapters) => {
                        Selection::book(&r.volume, &b.id)
                    }
                    _ => r,
                },
            )
            .collect();
        let mut out = vec![];
        let mut index = 0;
        while index < books.len() {
            let current = &books[index];
            let volume_books: Vec<&Book> = if current.kind == Kind::Book {
                self.books(&current.volume).collect()
            } else {
                vec![]
            };
            let matches_volume = !volume_books.is_empty()
                && volume_books.iter().enumerate().all(|(offset, entry)| {
                    books.get(index + offset).is_some_and(|c| {
                        c.kind == Kind::Book
                            && c.volume == entry.volume
                            && c.book.as_deref() == Some(&entry.id)
                    })
                });
            if matches_volume {
                out.push(Selection::volume(&current.volume));
                index += volume_books.len();
            } else {
                out.push(current.clone());
                index += 1;
            }
        }
        out
    }
}

/* ---------- reading days (Monday first) ---------- */

pub type Days = [bool; 7];
pub const EVERY_DAY: Days = [true; 7];

/// `normalizeReadingDays`: anything missing or malformed means every day.
pub fn normalize_days(days: Option<&[bool]>) -> Days {
    match days {
        Some(d) if d.len() == 7 && d.iter().any(|x| *x) => {
            [d[0], d[1], d[2], d[3], d[4], d[5], d[6]]
        }
        _ => EVERY_DAY,
    }
}
pub fn days_per_week(days: &Days) -> usize {
    days.iter().filter(|x| **x).count()
}
fn weekday(date: NaiveDate) -> usize {
    date.weekday().num_days_from_monday() as usize
}
pub fn is_reading_day(date: NaiveDate, days: &Days) -> bool {
    days[weekday(date)]
}
/// `describeReadingDays`: "Every day", "Weekdays", "Weekends", "Mon, Wed, Fri", "6 days a week".
pub fn describe_days(days: &Days) -> String {
    let count = days_per_week(days);
    if count == 7 {
        return "Every day".into();
    }
    if count == 5 && !days[5] && !days[6] {
        return "Weekdays".into();
    }
    if count == 2 && days[5] && days[6] {
        return "Weekends".into();
    }
    if count <= 3 {
        return WEEKDAY_LABELS
            .iter()
            .zip(days)
            .filter(|(_, on)| **on)
            .map(|(l, _)| *l)
            .collect::<Vec<_>>()
            .join(", ");
    }
    format!("{count} days a week")
}
pub fn parse_date(key: &str) -> Option<NaiveDate> {
    let key = key.trim();
    if key.len() != 10 {
        return None;
    }
    NaiveDate::parse_from_str(key, "%Y-%m-%d").ok()
}
pub fn date_key(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}
pub fn today() -> NaiveDate {
    Local::now().date_naive()
}
/// `formatDateKey`: "Oct 27, 2026".
pub fn format_date(key: &str) -> String {
    parse_date(key)
        .map(|d| d.format("%b %-d, %Y").to_string())
        .unwrap_or_else(|| key.to_string())
}
/// `formatShortDateKey`: "Oct 27", with the year only when it isn't this year's.
pub fn format_short_date(key: &str, now: NaiveDate) -> String {
    match parse_date(key) {
        Some(d) if d.year() == now.year() => d.format("%b %-d").to_string(),
        Some(_) => format_date(key),
        None => key.to_string(),
    }
}
/// `nthReadingDate`: the zero-based `n`th reading day on or after `start`.
pub fn nth_reading_date(start: NaiveDate, n: usize, days: &Days) -> NaiveDate {
    let per_week = days_per_week(days).max(1);
    let mut cursor = start;
    while !is_reading_day(cursor, days) {
        cursor += Duration::days(1);
    }
    if n == 0 {
        return cursor;
    }
    let weeks = n / per_week;
    let mut remaining = n % per_week;
    cursor += Duration::days(weeks as i64 * 7);
    while remaining > 0 {
        cursor += Duration::days(1);
        if is_reading_day(cursor, days) {
            remaining -= 1;
        }
    }
    cursor
}
/// `countReadingDaysBetween`: reading days in [from, to).
pub fn reading_days_between(from: NaiveDate, to: NaiveDate, days: &Days) -> usize {
    let span = (to - from).num_days();
    if span <= 0 {
        return 0;
    }
    let weeks = span / 7;
    let mut count = weeks as usize * days_per_week(days);
    let mut cursor = from + Duration::days(weeks * 7);
    for _ in weeks * 7..span {
        if is_reading_day(cursor, days) {
            count += 1;
        }
        cursor += Duration::days(1);
    }
    count
}
/// `getPlanDayIndex`: reading days before today; negative (in calendar days) before the start.
pub fn day_index(start: &str, days: &Days, now: NaiveDate) -> Option<i64> {
    let start = parse_date(start)?;
    let span = (now - start).num_days();
    if span < 0 {
        return Some(span);
    }
    Some(reading_days_between(start, now, days) as i64)
}
/// `getPlanDayCount`.
pub fn day_count(steps: usize, per_day: usize) -> usize {
    steps.div_ceil(per_day.max(1)).max(1)
}

/// `PaceSummary`.
#[derive(Debug, Clone, PartialEq)]
pub struct Pace {
    pub per_day: usize,
    pub days: usize,
    pub first: Option<String>,
    pub end: Option<String>,
    pub calendar_days: Option<i64>,
}
/// `summarizePace`.
pub fn summarize(steps: usize, per_day: usize, start: Option<&str>, days: &Days) -> Pace {
    let per_day = per_day.max(1);
    let count = day_count(steps, per_day);
    let Some(start) = start.and_then(parse_date) else {
        return Pace {
            per_day,
            days: count,
            first: None,
            end: None,
            calendar_days: None,
        };
    };
    let first = nth_reading_date(start, 0, days);
    let end = nth_reading_date(start, count - 1, days);
    Pace {
        per_day,
        days: count,
        first: Some(date_key(first)),
        end: Some(date_key(end)),
        calendar_days: Some((end - start).num_days() + 1),
    }
}
/// `pluralize`.
pub fn plural(count: usize, singular: &str) -> String {
    format!(
        "{count} {}",
        if count == 1 {
            singular.to_string()
        } else {
            format!("{singular}s")
        }
    )
}
/// `describePlanPace`: "89 chapters · 3 a day · 30 reading days · Oct 1, 2026 to Oct 30, 2026".
pub fn describe_pace(
    steps: usize,
    per_day: Option<usize>,
    start: Option<&str>,
    days: &Days,
) -> String {
    let chapters = plural(steps, "chapter");
    let Some(per_day) = per_day.filter(|p| *p > 0) else {
        return format!("{chapters} · read at your own pace");
    };
    let pace = summarize(steps, per_day, start, days);
    let cadence = format!(
        "{} a day · {}",
        pace.per_day,
        plural(pace.days, "reading day")
    );
    match (&pace.first, &pace.end) {
        (Some(first), Some(end)) => format!(
            "{chapters} · {cadence} · {} to {}",
            format_date(first),
            format_date(end)
        ),
        _ => format!("{chapters} · {cadence}"),
    }
}

/// One day of a plan's schedule (`PlanDayGroup`), as step indices.
#[derive(Debug, Clone, PartialEq)]
pub struct DayGroup {
    pub day: usize,
    pub date: Option<String>,
    pub steps: std::ops::Range<usize>,
    pub today: bool,
}
/// `PlanSchedule`.
#[derive(Debug, Clone, PartialEq)]
pub struct Schedule {
    pub title: String,
    pub note: Option<String>,
    pub today: Vec<usize>,
    pub groups: Option<Vec<DayGroup>>,
}
/// `buildPlanSchedule`: what to read today, and the whole plan grouped by day.
pub fn schedule(
    read: &[bool],
    per_day: Option<usize>,
    start: Option<&str>,
    days: &Days,
    now: NaiveDate,
) -> Schedule {
    let steps = read.len();
    let unread: Vec<usize> = (0..steps).filter(|i| !read[*i]).collect();
    let all_read = unread
        .is_empty()
        .then(|| "Every chapter is read.".to_string());
    let Some(cadence) = per_day.filter(|c| *c > 0) else {
        return Schedule {
            title: "Up next".into(),
            note: all_read,
            today: unread.into_iter().take(1).collect(),
            groups: None,
        };
    };
    let count = day_count(steps, cadence);
    let for_day = |d: usize| (d * cadence).min(steps)..((d + 1) * cadence).min(steps);
    let mut active = None;
    let mut title = "Up next".to_string();
    let mut note = all_read.clone();
    let mut today: Vec<usize> = unread.iter().copied().take(cadence).collect();
    if let Some(start) = start
        && let Some(index) = day_index(start, days, now)
    {
        let date_of = |d: usize| parse_date(start).map(|s| date_key(nth_reading_date(s, d, days)));
        if index < 0 {
            title = "Not started yet".into();
            note = Some(format!(
                "Day 1 is {}.",
                format_date(&date_of(0).unwrap_or_else(|| start.to_string()))
            ));
            today = for_day(0).collect();
        } else if index as usize >= count {
            title = "Schedule finished".into();
            note = if unread.is_empty() {
                all_read
            } else {
                Some(format!("{} still unread.", plural(unread.len(), "chapter")))
            };
        } else if !is_reading_day(now, days) {
            title = "Rest day".into();
            note = Some(format!(
                "Day {} is {}.",
                index + 1,
                date_of(index as usize)
                    .map(|d| format_date(&d))
                    .unwrap_or_else(|| "next".into())
            ));
            today = for_day(index as usize).collect();
        } else {
            active = Some(index as usize);
            title = format!("Day {} of {count}", index + 1);
            note = None;
            today = for_day(index as usize).collect();
        }
    }
    let groups = (0..count)
        .map(|day| DayGroup {
            day,
            date: start
                .and_then(parse_date)
                .map(|s| date_key(nth_reading_date(s, day, days))),
            steps: for_day(day),
            today: active == Some(day),
        })
        .collect();
    Schedule {
        title,
        note,
        today,
        groups: Some(groups),
    }
}

/* ---------- the builder ---------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Driver {
    PerDay,
    Days,
    FinishBy,
}

/// A saved plan as the builder reads it for editing (`PlanDetailData`).
pub struct SavedPlan<'a> {
    pub title: &'a str,
    pub selections: Option<Vec<Selection>>,
    pub steps: &'a [(String, String, u32)],
    pub start: Option<&'a str>,
    pub per_day: Option<usize>,
    pub days: Option<&'a [bool]>,
}

/// `BuilderState`.
#[derive(Debug, Clone, PartialEq)]
pub struct Builder {
    pub selections: Vec<Selection>,
    pub driver: Driver,
    pub per_day: usize,
    pub target_days: usize,
    pub finish_by: String,
    pub reading_days: Days,
    pub start_date: String,
    pub title_override: Option<String>,
}
impl Builder {
    /// `freshState`.
    pub fn fresh(now: NaiveDate) -> Self {
        Self {
            selections: vec![],
            driver: Driver::PerDay,
            per_day: 1,
            target_days: 30,
            finish_by: String::new(),
            reading_days: EVERY_DAY,
            start_date: date_key(now),
            title_override: None,
        }
    }
    /// `stateFromPlan`.
    pub fn from_plan(catalog: &Catalog, plan: SavedPlan, now: NaiveDate) -> Self {
        let SavedPlan {
            title,
            selections,
            steps,
            start,
            per_day,
            days,
        } = plan;
        let selections = selections
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| catalog.selections_from_steps(steps));
        let reading_days = normalize_days(days);
        let start_date = start.map(str::to_string).unwrap_or_else(|| date_key(now));
        let per_day = per_day.unwrap_or(1);
        let pace = summarize(steps.len(), per_day, Some(&start_date), &reading_days);
        let auto = catalog.auto_title(&selections);
        Self {
            selections,
            driver: Driver::PerDay,
            per_day,
            target_days: pace.days,
            finish_by: pace.end.unwrap_or_default(),
            reading_days,
            start_date,
            title_override: (title != auto).then(|| title.to_string()),
        }
    }
    pub fn title(&self, catalog: &Catalog) -> String {
        self.title_override
            .clone()
            .unwrap_or_else(|| catalog.auto_title(&self.selections))
    }
    /// `resolvePace`: chapters a day, the pace summary, and any problem with the dates.
    pub fn resolve(&self, steps: usize) -> (usize, Option<Pace>, Option<&'static str>) {
        let fallback = self.per_day.max(1);
        if steps == 0 {
            return (fallback, None, None);
        }
        let Some(start) = parse_date(&self.start_date) else {
            return (fallback, None, Some("Pick a start date."));
        };
        let per_day = match self.driver {
            Driver::PerDay => self.per_day.clamp(1, steps),
            Driver::Days => steps.div_ceil(self.target_days.clamp(1, steps)),
            Driver::FinishBy => {
                let Some(end) = parse_date(&self.finish_by) else {
                    return (1, None, Some("Pick a finish date."));
                };
                let days = reading_days_between(start, end + Duration::days(1), &self.reading_days);
                if days < 1 {
                    return (
                        1,
                        None,
                        Some("The finish date needs at least one reading day after the start."),
                    );
                }
                steps.div_ceil(days)
            }
        };
        (
            per_day,
            Some(summarize(
                steps,
                per_day,
                Some(&self.start_date),
                &self.reading_days,
            )),
            None,
        )
    }
    /// The form's problems, shown once saving has been tried.
    pub fn issues(&self, catalog: &Catalog, steps: usize) -> Vec<String> {
        let mut issues = vec![];
        if self.selections.is_empty() {
            issues.push("Pick at least one volume, book, or chapter range.".to_string());
        }
        if self.title(catalog).trim().is_empty() {
            issues.push("Give the plan a title.".into());
        }
        if let (_, _, Some(issue)) = self.resolve(steps)
            && !self.selections.is_empty()
        {
            issues.push(issue.into());
        }
        issues
    }
    pub fn volume_selected(&self, volume: &str) -> bool {
        self.selections
            .iter()
            .any(|s| s.kind == Kind::Volume && s.volume == volume)
    }
    pub fn book_selection(&self, volume: &str, book: &str) -> Option<&Selection> {
        self.selections
            .iter()
            .find(|s| s.kind != Kind::Volume && s.same_target(volume, Some(book)))
    }
    /// `toggleVolume`: a whole volume replaces any of its books.
    pub fn toggle_volume(&mut self, volume: &str) {
        if self.volume_selected(volume) {
            self.selections
                .retain(|s| !(s.kind == Kind::Volume && s.volume == volume));
        } else {
            self.selections.retain(|s| s.volume != volume);
            self.selections.push(Selection::volume(volume));
        }
    }
    /// `replaceBookSelection`.
    pub fn replace_book(&mut self, volume: &str, book: &str, next: Option<Selection>) {
        if let Some(index) = self
            .selections
            .iter()
            .position(|s| s.kind != Kind::Volume && s.same_target(volume, Some(book)))
        {
            match next {
                Some(next) => self.selections[index] = next,
                None => {
                    self.selections.remove(index);
                }
            }
        }
    }
    /// `setRange`: a range that covers the whole book is the book.
    pub fn set_range(&mut self, catalog: &Catalog, volume: &str, book: &str, from: u32, to: u32) {
        let Some(entry) = catalog.find(volume, book) else {
            return;
        };
        let from = from.clamp(1, entry.chapters);
        let to = to.clamp(from, entry.chapters);
        let next = if from == 1 && to == entry.chapters {
            Selection::book(volume, book)
        } else {
            Selection::range(volume, book, from, to)
        };
        self.replace_book(volume, book, Some(next));
    }
    /// `toggleWeekday`: at least one reading day stays on.
    pub fn toggle_weekday(&mut self, index: usize) {
        let mut next = self.reading_days;
        next[index] = !next[index];
        if next.iter().any(|x| *x) {
            self.reading_days = next;
        }
    }
    /// The website's quick starts (`QUICK_STARTS`).
    pub fn quick_start(&mut self, id: &str) {
        match id {
            "bom-30" => {
                self.selections = vec![Selection::volume("bookofmormon")];
                self.driver = Driver::Days;
                self.target_days = 30;
                self.title_override = None;
            }
            "nt-quarter" => {
                self.selections = vec![Selection::volume("newtestament")];
                self.driver = Driver::PerDay;
                self.per_day = 3;
                self.title_override = None;
            }
            "one-a-day" => {
                self.driver = Driver::PerDay;
                self.per_day = 1;
            }
            "gospels" => {
                self.selections = ["matthew", "mark", "luke", "john"]
                    .iter()
                    .map(|b| Selection::book("newtestament", b))
                    .collect();
                self.driver = Driver::PerDay;
                self.per_day = 1;
                self.title_override = None;
            }
            _ => {}
        }
    }
}

/// `QUICK_STARTS`: id, label, hint.
pub const QUICK_STARTS: [(&str, &str, &str); 4] = [
    (
        "bom-30",
        "Book of Mormon in 30 days",
        "The whole book, about 8 chapters a day.",
    ),
    (
        "nt-quarter",
        "New Testament this quarter",
        "Matthew to Revelation, 3 chapters a day.",
    ),
    (
        "one-a-day",
        "One chapter a day",
        "Keeps what you've picked, sets the pace to 1.",
    ),
    (
        "gospels",
        "Gospels only",
        "Matthew, Mark, Luke, and John, one a day.",
    ),
];

/// `describeFirstDay`: "Alma 1–3", or "Alma 63 to Helaman 2".
pub fn describe_first_day(catalog: &Catalog, steps: &[StepInput]) -> String {
    let (Some(first), Some(last)) = (steps.first(), steps.last()) else {
        return String::new();
    };
    if steps.len() == 1 {
        return first.label.clone();
    }
    if first.book == last.book && first.volume == last.volume {
        return format!(
            "{} {}–{}",
            catalog.label(&first.volume, &first.book),
            first.chapter,
            last.chapter
        );
    }
    format!("{} to {}", first.label, last.label)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn book(volume: &str, id: &str, label: &str, chapters: u32) -> Book {
        Book {
            volume: volume.into(),
            volume_title: String::new(),
            id: id.into(),
            label: label.into(),
            short_title: String::new(),
            chapters,
        }
    }
    fn books() -> Vec<Book> {
        vec![
            book("newtestament", "matthew", "Matthew", 28),
            book("newtestament", "mark", "Mark", 16),
            book(
                "doctrineandcovenants",
                "doctrineandcovenants",
                "Doctrine and Covenants",
                138,
            ),
            book("pearl", "moses", "Moses", 8),
            book("pearl", "abraham", "Abraham", 5),
        ]
    }
    fn d(key: &str) -> NaiveDate {
        parse_date(key).unwrap()
    }

    #[test]
    fn selections_describe_and_expand_like_the_website() {
        let books = books();
        let c = Catalog { books: &books };
        let picks = vec![
            Selection::book("newtestament", "mark"),
            Selection::range("doctrineandcovenants", "doctrineandcovenants", 76, 76),
            Selection::range("newtestament", "matthew", 5, 7),
            Selection::book("newtestament", "mark"),
        ];
        assert_eq!(c.describe(&picks[1]), "D&C 76");
        assert_eq!(c.describe(&picks[2]), "Matthew 5–7");
        assert_eq!(c.auto_title(&picks), "Mark + D&C 76 + Matthew 5–7 + 1 more");
        assert_eq!(c.auto_title(&[]), "New plan");
        let steps = c.scope_steps(&picks);
        // Mark is read once even though it was picked twice.
        assert_eq!(steps.len(), 16 + 1 + 3);
        assert_eq!(steps[16].label, "D&C 76");
        assert_eq!(c.selection_chapters(&Selection::volume("pearl")), 13);
        // Serialized as the backend's `planSelectionValidator` expects.
        assert_eq!(
            serde_json::to_value(&picks[0]).unwrap(),
            serde_json::json!({"kind":"book","volume":"newtestament","book":"mark"})
        );
        // Saved steps fold back into ranges, books and whole volumes.
        let saved: Vec<(String, String, u32)> = c
            .scope_steps(&[
                Selection::volume("pearl"),
                Selection::range("newtestament", "mark", 2, 4),
            ])
            .into_iter()
            .map(|s| (s.volume, s.book, s.chapter))
            .collect();
        assert_eq!(
            c.selections_from_steps(&saved),
            vec![
                Selection::volume("pearl"),
                Selection::range("newtestament", "mark", 2, 4)
            ]
        );
    }

    #[test]
    fn reading_days_are_monday_first() {
        // October 27, 2026 is a Tuesday.
        assert_eq!(weekday(d("2026-10-27")), 1);
        let weekdays = [true, true, true, true, true, false, false];
        assert_eq!(describe_days(&weekdays), "Weekdays");
        assert_eq!(
            describe_days(&[false, false, false, false, false, true, true]),
            "Weekends"
        );
        assert_eq!(
            describe_days(&[true, false, true, false, true, false, false]),
            "Mon, Wed, Fri"
        );
        assert_eq!(
            describe_days(&[true, true, true, true, true, true, false]),
            "6 days a week"
        );
        assert_eq!(describe_days(&EVERY_DAY), "Every day");
        // Starting on a Saturday with weekdays only, day 1 is Monday.
        assert_eq!(
            nth_reading_date(d("2026-10-31"), 0, &weekdays),
            d("2026-11-02")
        );
        assert_eq!(
            nth_reading_date(d("2026-10-26"), 5, &weekdays),
            d("2026-11-02")
        );
        assert_eq!(
            reading_days_between(d("2026-10-26"), d("2026-11-02"), &weekdays),
            5
        );
    }

    #[test]
    fn pace_and_schedule_follow_the_website() {
        let pace = summarize(239, 8, Some("2026-10-01"), &EVERY_DAY);
        assert_eq!((pace.per_day, pace.days), (8, 30));
        assert_eq!(pace.end.as_deref(), Some("2026-10-30"));
        assert_eq!(pace.calendar_days, Some(30));
        assert_eq!(
            describe_pace(239, Some(8), Some("2026-10-01"), &EVERY_DAY),
            "239 chapters · 8 a day · 30 reading days · Oct 1, 2026 to Oct 30, 2026"
        );
        assert_eq!(
            describe_pace(3, None, None, &EVERY_DAY),
            "3 chapters · read at your own pace"
        );
        let read = vec![true, true, false, false, false, false, false];
        let s = schedule(
            &read,
            Some(2),
            Some("2026-10-26"),
            &EVERY_DAY,
            d("2026-10-27"),
        );
        assert_eq!(s.title, "Day 2 of 4");
        assert_eq!(s.today, vec![2, 3]);
        let groups = s.groups.unwrap();
        assert_eq!(groups.len(), 4);
        assert!(groups[1].today);
        assert_eq!(groups[3].steps, 6..7);
        assert_eq!(groups[0].date.as_deref(), Some("2026-10-26"));
        let before = schedule(
            &read,
            Some(2),
            Some("2026-11-01"),
            &EVERY_DAY,
            d("2026-10-27"),
        );
        assert_eq!(before.title, "Not started yet");
        assert_eq!(before.note.as_deref(), Some("Day 1 is Nov 1, 2026."));
        let weekdays = [true, true, true, true, true, false, false];
        let rest = schedule(
            &[false; 14],
            Some(2),
            Some("2026-10-26"),
            &weekdays,
            d("2026-10-31"),
        );
        assert_eq!(rest.title, "Rest day");
        assert_eq!(rest.note.as_deref(), Some("Day 6 is Nov 2, 2026."));
        assert_eq!(rest.today, vec![10, 11]);
        let done = schedule(
            &read,
            Some(2),
            Some("2026-10-01"),
            &EVERY_DAY,
            d("2026-10-27"),
        );
        assert_eq!(done.title, "Schedule finished");
        assert_eq!(done.note.as_deref(), Some("5 chapters still unread."));
        let free = schedule(&read, None, None, &EVERY_DAY, d("2026-10-27"));
        assert_eq!(
            (free.title.as_str(), free.today.as_slice()),
            ("Up next", &[2][..])
        );
    }

    #[test]
    fn the_builder_resolves_pace_and_problems_like_the_website() {
        let books = books();
        let c = Catalog { books: &books };
        let mut b = Builder::fresh(d("2026-10-27"));
        assert_eq!(
            b.issues(&c, 0),
            vec!["Pick at least one volume, book, or chapter range."]
        );
        b.toggle_volume("pearl");
        assert_eq!(b.title(&c), "Pearl of Great Price");
        b.driver = Driver::Days;
        b.target_days = 4;
        let (per_day, pace, issue) = b.resolve(13);
        assert_eq!((per_day, pace.unwrap().days, issue), (4, 4, None));
        b.driver = Driver::FinishBy;
        assert_eq!(b.resolve(13).2, Some("Pick a finish date."));
        b.finish_by = "2026-10-26".into();
        assert_eq!(
            b.resolve(13).2,
            Some("The finish date needs at least one reading day after the start.")
        );
        b.finish_by = "2026-10-29".into();
        assert_eq!(b.resolve(13).0, 5);
        // Picking a book of a volume that is whole replaces the volume only when the volume is untapped.
        b.toggle_volume("pearl");
        b.selections.push(Selection::book("pearl", "moses"));
        b.set_range(&c, "pearl", "moses", 2, 9);
        assert_eq!(b.selections, vec![Selection::range("pearl", "moses", 2, 8)]);
        b.set_range(&c, "pearl", "moses", 1, 8);
        assert_eq!(b.selections, vec![Selection::book("pearl", "moses")]);
        b.toggle_volume("pearl");
        assert_eq!(b.selections, vec![Selection::volume("pearl")]);
        // The last reading day can't be turned off.
        b.reading_days = [true, false, false, false, false, false, false];
        b.toggle_weekday(0);
        assert!(b.reading_days[0]);
        b.quick_start("gospels");
        assert_eq!(b.selections.len(), 4);
        assert_eq!(b.per_day, 1);
        // Editing a plan starts from its own pace; a custom title is kept, an automatic one follows the picks.
        let steps: Vec<(String, String, u32)> = (1..=16)
            .map(|c| ("newtestament".into(), "mark".into(), c))
            .collect();
        let saved = |title, start, per_day| SavedPlan {
            title,
            selections: None,
            steps: &steps,
            start,
            per_day,
            days: None,
        };
        let edit = Builder::from_plan(
            &c,
            saved("Mark", Some("2026-10-01"), Some(2)),
            d("2026-10-27"),
        );
        assert_eq!(
            edit.selections,
            vec![Selection::book("newtestament", "mark")]
        );
        assert_eq!(
            (edit.target_days, edit.finish_by.as_str()),
            (8, "2026-10-08")
        );
        assert_eq!(edit.title_override, None);
        let named =
            Builder::from_plan(&c, saved("Evenings with Mark", None, None), d("2026-10-27"));
        assert_eq!(named.title_override.as_deref(), Some("Evenings with Mark"));
        assert_eq!(named.start_date, "2026-10-27");
        assert_eq!(
            describe_first_day(
                &c,
                &c.scope_steps(&[Selection::book("newtestament", "mark")])[..3]
            ),
            "Mark 1–3"
        );
    }
}
