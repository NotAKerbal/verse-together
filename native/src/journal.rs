// The website's Journal (src/features/notes/journal*.ts): a Sunday-first month calendar, Monday–Sunday weekly goals,
// a day's entries (Markdown notes, logged readings, and older verse notes), and a reflection worth revisiting.
use crate::store::{Note, Reading, StudyEntry};
use chrono::{Datelike, Duration, NaiveDate};

pub const REFLECTION_PROMPTS: [&str; 5] = [
    "What is one thing you want to carry with you from your study?",
    "Where did you notice a little light in your day?",
    "What invitation could you put into practice this week?",
    "What question would you like to bring to your next study?",
    "What helped you feel closer to God?",
];
const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
pub const WEEKDAYS: [&str; 7] = ["S", "M", "T", "W", "T", "F", "S"];

pub fn date(key: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(key, "%Y-%m-%d").ok()
}
pub fn key(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}
/// `YYYY-MM` of a day.
pub fn month_of(day: &str) -> String {
    day.get(..7).unwrap_or(day).to_string()
}
fn month_start(month: &str) -> Option<NaiveDate> {
    date(&format!("{month}-01"))
}
pub fn shift_month(month: &str, by: i32) -> String {
    let Some(start) = month_start(month) else {
        return month.to_string();
    };
    let index = start.year() * 12 + start.month0() as i32 + by;
    format!(
        "{:04}-{:02}",
        index.div_euclid(12),
        index.rem_euclid(12) + 1
    )
}
/// "October 2026"
pub fn month_heading(month: &str) -> String {
    month_start(month)
        .map(|d| format!("{} {}", MONTHS[d.month0() as usize], d.year()))
        .unwrap_or_default()
}
/// "Tuesday, October 27, 2026"
pub fn day_heading(day: &str) -> String {
    date(day)
        .map(|d| {
            format!(
                "{}, {} {}, {}",
                d.format("%A"),
                MONTHS[d.month0() as usize],
                d.day(),
                d.year()
            )
        })
        .unwrap_or_default()
}
/// "Oct 26"
pub fn short_date(day: &str) -> String {
    date(day)
        .map(|d| format!("{} {}", &MONTHS[d.month0() as usize][..3], d.day()))
        .unwrap_or_default()
}
/// The month's days in Sunday-first weeks, with `None` before the first and after the last.
pub fn month_grid(month: &str) -> Vec<Option<String>> {
    let Some(first) = month_start(month) else {
        return vec![];
    };
    let mut cells = vec![None; first.weekday().num_days_from_sunday() as usize];
    let mut day = first;
    while day.month() == first.month() {
        cells.push(Some(key(day)));
        day += Duration::days(1);
    }
    while cells.len() % 7 != 0 {
        cells.push(None);
    }
    cells
}
/// Weekly goals run Monday–Sunday, independently of the Sunday-first calendar.
pub fn goal_week(today: &str) -> (String, String) {
    let Some(d) = date(today) else {
        return (today.into(), today.into());
    };
    let start = d - Duration::days(d.weekday().num_days_from_monday() as i64);
    (key(start), key(start + Duration::days(6)))
}

/// One row of a day in the journal.
#[derive(Debug, Clone)]
pub enum Entry {
    Note(Note),
    /// A reading logged without a note.
    Reading(Reading),
    /// An older verse note, shown read-only and opened in the reader.
    Verse(StudyEntry),
}
impl Entry {
    pub fn day(&self) -> String {
        match self {
            Self::Note(n) => n.journal_date.clone(),
            Self::Reading(r) => r.journal_date.clone(),
            Self::Verse(v) => crate::store::local_date(v.updated),
        }
    }
    pub fn time(&self) -> i64 {
        match self {
            Self::Note(n) => n.created,
            Self::Reading(r) => r.read_at,
            Self::Verse(v) => v.updated,
        }
    }
    fn reads(&self) -> bool {
        match self {
            Self::Reading(_) => true,
            Self::Note(n) => n.reading_at.is_some(),
            Self::Verse(_) => false,
        }
    }
}
/// Entries newest first.
pub fn entries(notes: Vec<Note>, readings: Vec<Reading>, verses: Vec<StudyEntry>) -> Vec<Entry> {
    let mut out: Vec<Entry> = notes
        .into_iter()
        .map(Entry::Note)
        .chain(readings.into_iter().map(Entry::Reading))
        .chain(verses.into_iter().map(Entry::Verse))
        .collect();
    out.sort_by(|a, b| b.day().cmp(&a.day()).then(b.time().cmp(&a.time())));
    out
}
pub fn day_entries<'a>(entries: &'a [Entry], day: &str) -> Vec<&'a Entry> {
    entries.iter().filter(|e| e.day() == day).collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Progress {
    pub study_days: usize,
    pub reflections: usize,
    pub month_study_days: usize,
}
/// `journalHomeProgress`: distinct days with reading this week and month, and reflections written this week.
/// Entries dated after today don't count.
pub fn progress(entries: &[Entry], today: &str) -> Progress {
    let (start, end) = goal_week(today);
    let month = month_of(today);
    let mut week_days = std::collections::BTreeSet::new();
    let mut month_days = std::collections::BTreeSet::new();
    let mut reflections = 0;
    for entry in entries {
        let day = entry.day();
        if day.as_str() > today {
            continue;
        }
        let in_week = day >= start && day <= end;
        if entry.reads() {
            if in_week {
                week_days.insert(day.clone());
            }
            if month_of(&day) == month {
                month_days.insert(day.clone());
            }
        }
        if in_week && matches!(entry, Entry::Note(n) if n.has_reflection()) {
            reflections += 1;
        }
    }
    Progress {
        study_days: week_days.len(),
        reflections,
        month_study_days: month_days.len(),
    }
}
/// A real earlier reflection to resurface: the latest before `before`; never a reading or an invented quote.
pub fn revisit<'a>(notes: &'a [Note], before: &str) -> Option<&'a Note> {
    notes
        .iter()
        .filter(|n| n.has_reflection() && n.journal_date.as_str() < before)
        .max_by(|a, b| {
            a.journal_date
                .cmp(&b.journal_date)
                .then(a.created.cmp(&b.created))
        })
}
/// Verses as the website writes a selection: "3–5, 9".
pub fn verse_spec(verses: &[u32]) -> String {
    let mut sorted = verses.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    let mut parts = Vec::new();
    let mut i = 0;
    while i < sorted.len() {
        let start = sorted[i];
        let mut end = start;
        while i + 1 < sorted.len() && sorted[i + 1] == end + 1 {
            i += 1;
            end = sorted[i];
        }
        parts.push(if start == end {
            start.to_string()
        } else {
            format!("{start}–{end}")
        });
        i += 1;
    }
    parts.join(", ")
}
pub fn plural(count: usize, one: &str, many: &str) -> String {
    format!("{count} {}", if count == 1 { one } else { many })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{Location, NoteSource};
    fn note(day: &str, body: &str, reading: bool) -> Note {
        let mut n = Note::new(day, None);
        n.body = body.into();
        n.reading_at = reading.then_some(1);
        n
    }
    #[test]
    fn calendar_matches_the_websites_month() {
        let grid = month_grid("2026-10");
        // October 1, 2026 is a Thursday: four blanks, then 31 days, in whole weeks.
        assert_eq!(grid.iter().take_while(|c| c.is_none()).count(), 4);
        assert_eq!(grid.iter().flatten().count(), 31);
        assert_eq!(grid.len() % 7, 0);
        assert_eq!(month_heading("2026-10"), "October 2026");
        assert_eq!(day_heading("2026-10-27"), "Tuesday, October 27, 2026");
        assert_eq!(shift_month("2026-12", 1), "2027-01");
        assert_eq!(shift_month("2026-01", -1), "2025-12");
        assert_eq!(
            goal_week("2026-10-27"),
            ("2026-10-26".into(), "2026-11-01".into())
        );
        assert_eq!(
            goal_week("2026-11-01").0,
            "2026-10-26",
            "Sunday ends the week"
        );
        assert_eq!(short_date("2026-11-01"), "Nov 1");
    }
    #[test]
    fn goals_count_study_days_and_reflections_like_the_website() {
        let alma = Location::default();
        let reading = Reading {
            id: "r".into(),
            journal_date: "2026-10-26".into(),
            source: NoteSource::scripture("1 Nephi", &alma, None),
            read_at: 5,
            origin: "chapter_mark".into(),
        };
        let mut second = reading.clone();
        second.id = "r2".into();
        let entries = entries(
            vec![
                note("2026-10-27", "A thought", true),
                note("2026-10-27", "", false),
                note("2026-10-25", "Last week", false),
                note("2026-10-29", "Future", true),
            ],
            vec![reading, second],
            vec![],
        );
        let p = progress(&entries, "2026-10-27");
        assert_eq!(p.study_days, 2, "the 26th and the 27th, each once");
        assert_eq!(p.reflections, 1, "empty notes and other weeks don't count");
        assert_eq!(p.month_study_days, 2);
        assert_eq!(day_entries(&entries, "2026-10-26").len(), 2);
        let notes: Vec<Note> = entries
            .iter()
            .filter_map(|e| match e {
                Entry::Note(n) => Some(n.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(revisit(&notes, "2026-10-27").unwrap().body, "Last week");
        assert!(revisit(&notes, "2026-10-25").is_none());
        assert_eq!(plural(1, "entry", "entries"), "1 entry");
    }
}
