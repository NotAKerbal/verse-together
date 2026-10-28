// The reader's links to journal notes beside verses, after the website's `VerseInsightMarker`: "Note" (or "3 notes")
// at the first verse of each passage a note links, opening that note (or a picker of them). Since 2.13.0 a note marks
// a verse only through a verse link in its body (`convex/noteScriptureLinks.ts` `scriptureLinksForChapter`, which
// `listMyScriptureRefsForChapter` and the reader's device notes both use), never through its reading source. The
// notes are this computer's: its own, or the signed-in account's synced copy, read from the study database.
use crate::design::{self, icon, sans};
use crate::icons;
use crate::store::{Location, LoggedReading, Note, NoteSource, SourceKind, volume_from_url_slug};
use crate::{App, Message, Screen};
use iced::widget::{button, column, container, row, scrollable, text};
use iced::{Alignment::Center, Border, Color, Element, Fill, Length, Padding, Task, font};
use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use regex::Regex;
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// `SOURCE_HREF_MAX`.
const HREF_MAX: usize = 2048;

/// `isSafeSourceHref`: a path within the website, without controls, whitespace, backslashes or bidi overrides.
pub fn is_safe_href(href: &str) -> bool {
    if href.is_empty() || href.encode_utf16().count() > HREF_MAX {
        return false;
    }
    let unsafe_char = |c: char| {
        matches!(c, '\u{0}'..='\u{1f}' | '\u{7f}'..='\u{9f}' | '\\' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
            || c.is_whitespace()
            || c == '\u{feff}'
    };
    !href.chars().any(unsafe_char) && href.starts_with('/') && !href.starts_with("//")
}
/// `bookKey`: case and punctuation aside ("jer-emiah" is "jeremiah").
fn book_key(book: &str) -> String {
    book.to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        .collect()
}
/// `parseVerseSpec(spec, 999)`: "5, 7–8" → [5, 7, 8]; `None` for anything that isn't a verse list.
fn parse_verse_spec(spec: &str) -> Option<Vec<u32>> {
    static SEPARATOR: OnceLock<Regex> = OnceLock::new();
    static DASH: OnceLock<Regex> = OnceLock::new();
    let separator = SEPARATOR.get_or_init(|| Regex::new(r"\s*[,;]\s*").unwrap());
    let dash = DASH.get_or_init(|| Regex::new(r"\s*[-–—]\s*").unwrap());
    let spec = spec.trim();
    if spec.is_empty() {
        return None;
    }
    let mut verses = std::collections::BTreeSet::new();
    for part in separator.split(spec) {
        if part.is_empty() {
            continue;
        }
        let ends: Vec<&str> = dash.split(part).collect();
        if ends.len() > 2
            || !ends
                .iter()
                .all(|e| !e.is_empty() && e.bytes().all(|b| b.is_ascii_digit()))
        {
            return None;
        }
        let start: u64 = ends[0].parse().ok()?;
        let end: u64 = ends.last()?.parse().ok()?;
        let low = start.min(end).max(1);
        let high = start.max(end).min(999);
        verses.extend((low..=high).map(|v| v as u32));
    }
    (!verses.is_empty()).then(|| verses.into_iter().collect())
}
/// `groupVerseRuns`: consecutive verses as (first, last).
fn verse_runs(verses: &[u32]) -> Vec<(u32, u32)> {
    let mut runs: Vec<(u32, u32)> = vec![];
    for &v in verses {
        match runs.last_mut() {
            Some(last) if v == last.1 + 1 => last.1 = v,
            _ => runs.push((v, v)),
        }
    }
    runs
}
/// `scriptureLinksForChapter`: the verse ranges of this chapter a note's body links to. Only Markdown links count
/// (not code, images, raw HTML or bare text), to `/browse/<volume>/<book>/<chapter>#v-N` with the volume and book in
/// any of their spellings; a generated label ("Jeremiah 31:5, 7–8") gives the whole passage, keeping its gaps.
pub fn scripture_links_for_chapter(body: &str, chapter: &Location) -> Vec<(u32, u32)> {
    static HREF: OnceLock<Regex> = OnceLock::new();
    static LABEL: OnceLock<Regex> = OnceLock::new();
    let href_pattern = HREF.get_or_init(|| {
        Regex::new(r"^/browse/([^/?#]+)/([^/?#]+)/([0-9]+)(?:\?[^#]*)?#v-([1-9][0-9]*)$").unwrap()
    });
    let label_pattern = LABEL.get_or_init(|| Regex::new(r"([0-9]+):([0-9\s,–—-]+)$").unwrap());
    let mut refs: Vec<(u32, u32)> = vec![];
    let mut add = |href: &str, label: &str| {
        if !is_safe_href(href) {
            return;
        }
        let Some(m) = href_pattern.captures(href) else {
            return;
        };
        if volume_from_url_slug(&m[1]) != volume_from_url_slug(&chapter.volume)
            || book_key(&m[2]) != book_key(&chapter.book)
            || m[3].parse::<u64>().ok() != Some(u64::from(chapter.chapter))
        {
            return;
        }
        let Ok(first) = m[4].parse::<u32>() else {
            return;
        };
        let mut ranges = vec![(first, first)];
        let verses = label_pattern
            .captures(label.trim())
            .filter(|s| s[1].parse::<u64>().ok() == Some(u64::from(chapter.chapter)))
            .and_then(|s| parse_verse_spec(&s[2]));
        if let Some(verses) = verses
            && verses.first() == Some(&first)
        {
            ranges = verse_runs(&verses);
        }
        for range in ranges {
            if !refs.contains(&range) {
                refs.push(range);
            }
        }
    };
    // CommonMark without extensions, as the website's `new Marked({ gfm: false })`.
    let mut link: Option<(String, String)> = None;
    for event in Parser::new(body) {
        match event {
            Event::Start(Tag::Link { dest_url, .. }) => {
                link = Some((dest_url.to_string(), String::new()))
            }
            Event::Text(t) | Event::Code(t) => {
                if let Some((_, label)) = &mut link {
                    label.push_str(&t);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some((_, label)) = &mut link {
                    label.push('\n');
                }
            }
            Event::End(TagEnd::Link) => {
                if let Some((href, label)) = link.take() {
                    add(&href, &label);
                }
            }
            _ => {}
        }
    }
    refs
}

/// One passage a note links (`VerseInsightRef`).
#[derive(Debug, Clone, PartialEq)]
pub struct NoteRef {
    pub note_id: String,
    pub title: String,
    pub start: u32,
    pub end: u32,
    pub published: bool,
}
/// `groupVerseInsightRefsByVerse`: each note once at the first verse of each passage it links, notes in order.
pub fn group_by_verse(refs: Vec<NoteRef>) -> BTreeMap<u32, Vec<NoteRef>> {
    let mut grouped: BTreeMap<u32, Vec<NoteRef>> = BTreeMap::new();
    for r in refs {
        let start = r.start.min(r.end);
        let at = grouped.entry(start).or_default();
        if !at.iter().any(|x| x.note_id == r.note_id) {
            at.push(r);
        }
    }
    grouped
}
/// The links for a chapter from these notes (most recently changed first): notes with something written in their
/// body (`hasReaderNote`), drafts and published ones (archived notes mark nothing).
pub fn chapter_refs(notes: &[(Note, String)], chapter: &Location) -> BTreeMap<u32, Vec<NoteRef>> {
    let mut refs = vec![];
    for (note, status) in notes {
        if note.body.trim().is_empty() || !matches!(status.as_str(), "draft" | "published") {
            continue;
        }
        for (start, end) in scripture_links_for_chapter(&note.body, chapter) {
            refs.push(NoteRef {
                note_id: note.id.clone(),
                title: note.display_title(),
                start: start.min(end),
                end: start.max(end),
                published: status == "published",
            });
        }
    }
    group_by_verse(refs)
}
/// `formatRange`: "v. 3" or "vv. 3-5".
pub fn range_label(r: &NoteRef) -> String {
    if r.start == r.end {
        format!("v. {}", r.start)
    } else {
        format!("vv. {}-{}", r.start, r.end)
    }
}

/// One entry of the reading log at a passage, as the reader's reading marker lists it.
#[derive(Debug, Clone, PartialEq)]
pub struct ReadRef {
    pub id: String,
    /// A journal entry that logs the reading (else a logged reading).
    pub note: bool,
    pub journal_date: String,
    pub read_at: i64,
    /// The verses it logs: its own, else the whole chapter's.
    pub start: u32,
    pub end: u32,
}
/// A run of verses the reading log covers (`ReadPassage`).
#[derive(Debug, Clone, PartialEq)]
pub struct ReadPassage {
    pub start: u32,
    pub end: u32,
    pub readings: Vec<ReadRef>,
}
/// `sourceMatchesChapter`: a scripture source naming this volume (any alias), book (case and punctuation aside) and
/// chapter. A source without its volume and book doesn't match, as on the website.
pub fn source_matches_chapter(source: &NoteSource, chapter: &Location) -> bool {
    source.kind == SourceKind::Scripture
        && source.chapter == Some(chapter.chapter)
        && match (&source.volume, &source.book) {
            (Some(volume), Some(book)) => {
                !volume.is_empty()
                    && !book.is_empty()
                    && volume_from_url_slug(volume) == volume_from_url_slug(&chapter.volume)
                    && book_key(book) == book_key(&chapter.book)
            }
            _ => false,
        }
}
/// `chapterReadPassages`: the reading log's entries for this chapter merged into runs of consecutive verses present in
/// it (overlapping and adjoining logs join), each verse keyed to its run. A log without verses covers the chapter.
pub fn chapter_read_passages(
    readings: &[LoggedReading],
    chapter: &Location,
    verses: &[u32],
) -> BTreeMap<u32, ReadPassage> {
    let (Some(&first), Some(&last)) = (verses.first(), verses.last()) else {
        return BTreeMap::new();
    };
    let mut by_verse: BTreeMap<u32, Vec<ReadRef>> = BTreeMap::new();
    for r in readings {
        if !source_matches_chapter(&r.source, chapter) {
            continue;
        }
        let (start, end) = match r.source.verse_start {
            None => (0, u32::MAX),
            Some(a) => {
                let b = r.source.verse_end.unwrap_or(a);
                (a.min(b), a.max(b))
            }
        };
        let entry = ReadRef {
            id: r.id.clone(),
            note: r.note,
            journal_date: r.journal_date.clone(),
            read_at: r.read_at,
            start: r.source.verse_start.unwrap_or(first),
            end: r.source.verse_end.or(r.source.verse_start).unwrap_or(last),
        };
        for &verse in verses {
            if verse < start || verse > end {
                continue;
            }
            let rows = by_verse.entry(verse).or_default();
            if !rows.iter().any(|x| x.id == entry.id) {
                rows.push(entry.clone());
            }
        }
    }
    let mut runs: Vec<ReadPassage> = vec![];
    for (verse, rows) in by_verse {
        match runs.last_mut() {
            Some(run) if verse == run.end + 1 => run.end = verse,
            _ => runs.push(ReadPassage {
                start: verse,
                end: verse,
                readings: vec![],
            }),
        }
        let run = runs.last_mut().expect("pushed above");
        for r in rows {
            if !run.readings.iter().any(|x| x.id == r.id) {
                run.readings.push(r);
            }
        }
    }
    let mut passages = BTreeMap::new();
    for run in runs {
        for verse in verses
            .iter()
            .copied()
            .filter(|v| *v >= run.start && *v <= run.end)
        {
            passages.insert(verse, run.clone());
        }
    }
    passages
}
/// A reading's day as the website's picker names it ("Oct 27, 2026").
pub fn read_date(read_at: i64) -> String {
    chrono::DateTime::from_timestamp(read_at, 0)
        .map(|t| {
            t.with_timezone(&chrono::Local)
                .format("%b %-d, %Y")
                .to_string()
        })
        .unwrap_or_default()
}
/// `passageLabel`: "verse 5" or "verses 5–7".
pub fn passage_label(p: &ReadPassage) -> String {
    if p.start == p.end {
        format!("verse {}", p.start)
    } else {
        format!("verses {}–{}", p.start, p.end)
    }
}

#[derive(Debug, Clone, Default)]
pub struct NoteLinks {
    /// The chapter these are for and its links by first verse.
    pub chapter: Option<Location>,
    pub by_verse: BTreeMap<u32, Vec<NoteRef>>,
    /// The reading log's entries for this chapter (matched to it; merged into passages against its verses).
    pub reading_log: Vec<LoggedReading>,
    /// The verse whose picker is open (its notes, or its reading log), and the row the arrow keys are on.
    pub picker: Option<u32>,
    pub read_picker: Option<u32>,
    pub highlighted: usize,
}
#[derive(Debug, Clone)]
pub enum NoteLinkMsg {
    /// The marker: one note opens, several toggle the picker.
    Marker(u32),
    Open(String),
    /// The reading marker at the first verse of a read passage: one reading opens, several toggle its picker.
    ReadMarker(u32),
    /// A reading of the log: (its id, whether it is a journal entry).
    OpenReading(String, bool),
    Close,
    /// Arrow keys in the picker.
    Step(i32),
    Choose,
}
fn msg(m: NoteLinkMsg) -> Message {
    Message::NoteLinks(m)
}

impl App {
    /// Reads the chapter's note links again from the study database.
    pub(crate) fn refresh_note_links(&mut self) {
        let l = self.preferences.last.clone();
        let Some(store) = &self.store else { return };
        let notes = store.notes_linking_verses();
        let log = store.chapter_reading_log(l.chapter);
        if let Some(notes) = self.report(notes) {
            self.note_links.by_verse = chapter_refs(&notes, &l);
        }
        if let Some(log) = self.report(log) {
            self.note_links.reading_log = log
                .into_iter()
                .filter(|r| source_matches_chapter(&r.source, &l))
                .collect();
        }
        if self.note_links.chapter.as_ref() != Some(&l) {
            self.note_links.picker = None;
            self.note_links.read_picker = None;
        }
        self.note_links.chapter = Some(l);
    }
    pub(crate) fn update_note_links(&mut self, message: NoteLinkMsg) -> Task<Message> {
        match message {
            NoteLinkMsg::Marker(verse) => {
                let Some(refs) = self.note_links.by_verse.get(&verse) else {
                    return Task::none();
                };
                if refs.len() == 1 {
                    let id = refs[0].note_id.clone();
                    return self.update_note_links(NoteLinkMsg::Open(id));
                }
                self.note_links.picker = if self.note_links.picker == Some(verse) {
                    None
                } else {
                    Some(verse)
                };
                self.note_links.read_picker = None;
                self.note_links.highlighted = 0;
            }
            NoteLinkMsg::ReadMarker(verse) => {
                let Some(passage) = self.read_passages().remove(&verse) else {
                    return Task::none();
                };
                if let [only] = passage.readings.as_slice() {
                    return self
                        .update_note_links(NoteLinkMsg::OpenReading(only.id.clone(), only.note));
                }
                self.note_links.read_picker = if self.note_links.read_picker == Some(verse) {
                    None
                } else {
                    Some(verse)
                };
                self.note_links.picker = None;
                self.note_links.highlighted = 0;
            }
            NoteLinkMsg::OpenReading(id, true) => {
                self.note_links.read_picker = None;
                return self.update_note_links(NoteLinkMsg::Open(id));
            }
            NoteLinkMsg::OpenReading(id, false) => {
                // A logged reading is an entry of its day in the journal: the journal opens on that day.
                self.note_links.read_picker = None;
                let Some(day) = self
                    .note_links
                    .reading_log
                    .iter()
                    .find(|r| r.id == id && !r.note)
                    .map(|r| r.journal_date.clone())
                else {
                    return Task::none();
                };
                if !self.save_note() || !self.save_journal_note() {
                    return Task::none();
                }
                self.set_screen(Screen::Journal);
                self.popover = None;
                self.focus = false;
                self.journal.month = crate::journal::month_of(&day);
                let task = self.update_journal(crate::journal_ui::JournalMsg::Day(day));
                self.reload_journal();
                return task;
            }
            NoteLinkMsg::Open(id) => {
                self.note_links.picker = None;
                // Nothing written is lost: the verse note and any open journal note are saved first.
                if !self.save_note() || !self.save_journal_note() {
                    return Task::none();
                }
                let note = self.store.as_ref().map(|s| s.note(&id));
                match note.and_then(|r| self.report(r)) {
                    Some(Some(note)) => {
                        self.set_screen(Screen::Journal);
                        self.popover = None;
                        self.focus = false;
                        self.reload_journal();
                        self.open_note(note, None);
                    }
                    Some(None) => {
                        // Deleted or moved by a sync since the chapter was read.
                        self.error = Some("This note isn't on this computer any more.".into());
                        self.refresh_note_links();
                    }
                    None => {}
                }
            }
            NoteLinkMsg::Close => {
                self.note_links.picker = None;
                self.note_links.read_picker = None;
            }
            NoteLinkMsg::Step(delta) => {
                let n = if let Some(refs) = self
                    .note_links
                    .picker
                    .and_then(|v| self.note_links.by_verse.get(&v))
                {
                    refs.len()
                } else if let Some(passage) = self
                    .note_links
                    .read_picker
                    .and_then(|v| self.read_passages().remove(&v))
                {
                    passage.readings.len()
                } else {
                    0
                } as i32;
                let next = (self.note_links.highlighted as i32 + delta).rem_euclid(n.max(1));
                self.note_links.highlighted = next as usize;
            }
            NoteLinkMsg::Choose => {
                if let Some(r) = self
                    .note_links
                    .read_picker
                    .and_then(|v| self.read_passages().remove(&v))
                    .and_then(|p| p.readings.get(self.note_links.highlighted).cloned())
                {
                    return self.update_note_links(NoteLinkMsg::OpenReading(r.id, r.note));
                }
                if let Some(r) = self
                    .note_links
                    .picker
                    .and_then(|v| self.note_links.by_verse.get(&v))
                    .and_then(|refs| refs.get(self.note_links.highlighted))
                {
                    let id = r.note_id.clone();
                    return self.update_note_links(NoteLinkMsg::Open(id));
                }
            }
        }
        Task::none()
    }

    /// The "Note" / "N notes" marker at a verse (`VerseInsightMarker`), hidden in simple mode. With several notes
    /// it opens "Your notes" floating beside it.
    pub(crate) fn note_link_marker(&self, verse: u32) -> Option<Element<'_, Message>> {
        if self.focus {
            return None;
        }
        let refs = self.note_links.by_verse.get(&verse)?;
        let p = self.p();
        let open = self.note_links.picker == Some(verse);
        let label = if refs.len() == 1 {
            "Note".to_string()
        } else {
            format!("{} notes", refs.len())
        };
        let hint = if refs.len() == 1 {
            let title = refs[0].title.trim();
            if title.is_empty() {
                "Untitled note"
            } else {
                title
            }
            .to_string()
        } else {
            format!("{} notes", refs.len())
        };
        let color = if open {
            p.ink
        } else {
            Color { a: 0.65, ..p.ink }
        };
        let marker = button(
            container(design::underlined_with(
                label,
                11.,
                color,
                Color {
                    a: 0.25 * color.a,
                    ..color
                },
                font::Weight::Medium,
                4.0,
            ))
            .center_y(28)
            .padding([0, 4]),
        )
        .padding(0)
        .height(28)
        .on_press(msg(NoteLinkMsg::Marker(verse)))
        .style(move |_, _| button::Style {
            background: None,
            text_color: color,
            border: Border {
                radius: 4.0.into(),
                ..Default::default()
            },
            ..Default::default()
        });
        let panel = open.then(|| {
            let rows = refs
                .iter()
                .map(|r| {
                    let title = r.title.trim();
                    PickerRow {
                        title: if title.is_empty() {
                            "Untitled note"
                        } else {
                            title
                        }
                        .to_string(),
                        range: range_label(r),
                        badge: Some(r.published),
                        on_press: msg(NoteLinkMsg::Open(r.note_id.clone())),
                    }
                })
                .collect();
            self.picker_panel("Your notes", format!("Verse {verse}"), rows)
        });
        Some(floating(self.hint(marker, hint), panel))
    }
    /// The reading log's passages in this chapter, by verse (`chapterReadPassages` against the verses shown).
    pub(crate) fn read_passages(&self) -> BTreeMap<u32, ReadPassage> {
        let Some(chapter) = &self.note_links.chapter else {
            return BTreeMap::new();
        };
        let verses: Vec<u32> = self.verses.iter().map(|v| v.number).collect();
        chapter_read_passages(&self.note_links.reading_log, chapter, &verses)
    }
    /// `VerseInsightMarker variant="reading"`: a check at the first verse of a read passage ("Logged as read"),
    /// opening its one reading or "Reading log" floating beside it. Shown in simple mode too, as on the website.
    pub(crate) fn read_marker(&self, passage: &ReadPassage) -> Element<'_, Message> {
        let p = self.p();
        let verse = passage.start;
        let color = self.read_color();
        let ink = p.ink;
        let marker = button(
            container(icon(&icons::CHECK, color, 11.2))
                .center_x(24)
                .center_y(24),
        )
        .padding(0)
        .width(24)
        .height(24)
        .on_press(msg(NoteLinkMsg::ReadMarker(verse)))
        .style(move |_, status| button::Style {
            background: None,
            text_color: if matches!(status, button::Status::Hovered) {
                ink
            } else {
                color
            },
            border: Border {
                radius: 4.0.into(),
                ..Default::default()
            },
            ..Default::default()
        });
        let panel = (self.note_links.read_picker == Some(verse)).then(|| {
            let rows = passage
                .readings
                .iter()
                .map(|r| PickerRow {
                    title: read_date(r.read_at),
                    range: if r.start == r.end {
                        format!("v. {}", r.start)
                    } else {
                        format!("vv. {}-{}", r.start, r.end)
                    },
                    badge: None,
                    on_press: msg(NoteLinkMsg::OpenReading(r.id.clone(), r.note)),
                })
                .collect();
            self.picker_panel("Reading log", passage_label(passage), rows)
        });
        floating(self.hint(marker, "Logged as read".into()), panel)
    }
    /// `--reader-read`: the reading log's rule and check.
    pub(crate) fn read_color(&self) -> Color {
        if self.preferences.dark {
            Color::from_rgb8(0x9b, 0xae, 0x9d)
        } else {
            Color::from_rgb8(0x6d, 0x80, 0x70)
        }
    }
    /// The marker's dialog: a header on `--accent-sky-soft` with its title, the passage and a close button, then its
    /// rows (title, range, and for notes Draft or Published), at most 288px tall before it scrolls.
    fn picker_panel(
        &self,
        title: &'static str,
        passage: String,
        rows: Vec<PickerRow>,
    ) -> Element<'_, Message> {
        let p = self.p();
        let close = button(
            container(icon(&icons::XMARK, p.ink, 10.))
                .center_x(28)
                .center_y(28),
        )
        .padding(0)
        .on_press(msg(NoteLinkMsg::Close))
        .style(move |_, status| button::Style {
            background: Some(
                if matches!(status, button::Status::Hovered) {
                    p.hover
                } else {
                    p.card
                }
                .into(),
            ),
            border: Border {
                color: p.rule,
                width: 2.0,
                radius: 999.0.into(),
            },
            ..Default::default()
        });
        let header = container(
            row![
                column![
                    text(title).size(14).font(design::serif()),
                    text(passage)
                        .size(11)
                        .font(sans(font::Weight::Semibold))
                        .color(Color { a: 0.65, ..p.ink }),
                ]
                .width(Fill),
                close,
            ]
            .align_y(Center),
        )
        .padding([8, 12])
        .width(Fill)
        .style(move |_| container::Style {
            background: Some(p.sky_soft.into()),
            border: Border {
                color: p.rule,
                width: 0.0,
                radius: 0.0.into(),
            },
            ..Default::default()
        });
        let count = rows.len();
        let mut list = column![].spacing(2);
        for (i, r) in rows.into_iter().enumerate() {
            let highlighted = i == self.note_links.highlighted;
            let mut line = row![
                column![
                    text(r.title)
                        .size(14)
                        .font(sans(font::Weight::Semibold))
                        .wrapping(iced::widget::text::Wrapping::None),
                    text(r.range).size(11).color(Color { a: 0.6, ..p.ink }),
                ]
                .width(Fill),
            ]
            .spacing(8)
            .align_y(Center);
            if let Some(published) = r.badge {
                line = line.push(
                    container(
                        text(if published { "PUBLISHED" } else { "DRAFT" })
                            .size(10)
                            .font(sans(font::Weight::Bold)),
                    )
                    .padding([2, 8])
                    .style(move |_| container::Style {
                        background: Some(if published { p.mint } else { p.note }.into()),
                        text_color: Some(p.ink),
                        border: Border {
                            color: p.rule,
                            width: 2.0,
                            radius: 999.0.into(),
                        },
                        ..Default::default()
                    }),
                );
            }
            list = list.push(
                button(line)
                    .padding([6, 8])
                    .width(Fill)
                    .on_press(r.on_press)
                    .style(move |_, status| {
                        let on = highlighted || matches!(status, button::Status::Hovered);
                        button::Style {
                            background: on.then(|| p.hover.into()),
                            text_color: p.ink,
                            border: Border {
                                color: if on { p.rule } else { Color::TRANSPARENT },
                                width: 2.0,
                                radius: 12.0.into(),
                            },
                            ..Default::default()
                        }
                    }),
            );
        }
        // The header's 2px rule below it (`border-b-2`).
        let divider = container(iced::widget::space())
            .width(Fill)
            .height(2)
            .style(move |_| container::Style {
                background: Some(p.rule.into()),
                ..Default::default()
            });
        let panel = column![
            header,
            divider,
            container(
                scrollable(container(list).padding(8))
                    .height(Length::Fixed((count as f32 * 50.0 + 16.0).min(288.0)))
            )
        ];
        // `min(288px, 100vw - 24px)`.
        container(panel)
            .width((self.window_width - 24.0).clamp(0.0, 288.0))
            .clip(true)
            .style(move |_| container::Style {
                background: Some(p.card.into()),
                text_color: Some(p.ink),
                border: Border {
                    color: p.rule,
                    width: 2.0,
                    radius: 16.0.into(),
                },
                shadow: design::soft_shadow(p),
                ..Default::default()
            })
            .padding(Padding::ZERO)
            .into()
    }
}
/// A row of a marker's dialog.
struct PickerRow {
    title: String,
    range: String,
    /// Notes say Draft (`false`) or Published (`true`); readings have no badge.
    badge: Option<bool>,
    on_press: Message,
}
/// The marker with its dialog floating over the page when open (`createPortal`, `position: fixed`): lined up with the
/// marker's right edge, 8px below it (or above when it doesn't fit), 12px inside the window, following the page as
/// it scrolls. Nothing in the chapter moves or re-wraps. A press outside closes it; the app handles its keys.
fn floating<'a>(
    marker: Element<'a, Message>,
    panel: Option<Element<'a, Message>>,
) -> Element<'a, Message> {
    crate::popup::popup(marker, panel)
        .on_dismiss(msg(NoteLinkMsg::Close))
        .placement(crate::popup::Placement {
            gap: 8.0,
            margin: 12.0,
            clearance: 12.0,
            right: true,
            escape: false,
        })
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn jeremiah() -> Location {
        Location {
            volume: "oldtestament".into(),
            book: "jeremiah".into(),
            chapter: 31,
        }
    }
    const HREF: &str = "/browse/oldtestament/jeremiah/31#v-5";
    // The cases are the website's own (tests/noteScriptureLinks.test.ts).
    #[test]
    fn note_links_are_found_like_the_websites_backlinks() {
        let c = jeremiah();
        assert_eq!(
            scripture_links_for_chapter(&format!("**[Jeremiah 31](<{HREF}>)**"), &c),
            [(5, 5)]
        );
        assert_eq!(
            scripture_links_for_chapter(&format!("[verse][ref]\n\n[ref]: {HREF}"), &c),
            [(5, 5)]
        );
        assert!(scripture_links_for_chapter("A thought with no link", &c).is_empty());
        assert!(scripture_links_for_chapter("", &c).is_empty());
        // The quoted range, with the gaps of a noncontiguous selection kept.
        assert_eq!(
            scripture_links_for_chapter(
                "**[Jeremiah 31:5–7](/browse/oldtestament/jeremiah/31#v-5)**\n> Selected words",
                &c
            ),
            [(5, 7)]
        );
        assert_eq!(
            scripture_links_for_chapter(&format!("[Jeremiah 31:5, 7–8]({HREF})"), &c),
            [(5, 5), (7, 8)]
        );
        assert_eq!(
            scripture_links_for_chapter(&format!("[Jeremiah 31:2–7]({HREF})"), &c),
            [(5, 5)]
        );
        for body in [
            format!("`[verse]({HREF})`"),
            format!("```md\n[verse]({HREF})\n```"),
            format!("![verse]({HREF})"),
            format!("<a href=\"{HREF}\">verse</a>"),
            HREF.to_string(),
            format!("[verse](https://example.com{HREF})"),
            "[chapter](/browse/oldtestament/jeremiah/31)".to_string(),
            "[other](/browse/oldtestament/jeremiah/32#v-5)".to_string(),
        ] {
            assert!(scripture_links_for_chapter(&body, &c).is_empty(), "{body}");
        }
        assert_eq!(
            scripture_links_for_chapter(
                "[verse](/browse/old-testament/jer-emiah/31?translation=kjv#v-5)",
                &c
            ),
            [(5, 5)]
        );
        // What this app's (and the website's) Add to note writes: one run per consecutive verses.
        let nephi = Location {
            volume: "bookofmormon".into(),
            book: "1-ne".into(),
            chapter: 1,
        };
        let excerpt = "**[1 Nephi 1:2–3](/browse/bookofmormon/1-ne/1#v-2)**\n> 2 Yea…\n\n**[1 Nephi 1:6](/browse/bookofmormon/1-ne/1#v-6)**\n> 6 And…";
        assert_eq!(
            scripture_links_for_chapter(excerpt, &nephi),
            [(2, 3), (6, 6)]
        );
        assert!(!is_safe_href("/browse/x y/1#v-1"));
        assert!(!is_safe_href("//evil.example/browse"));
        assert!(!is_safe_href("/browse/\u{202e}x/1#v-1"));
    }
    #[test]
    fn each_note_links_once_per_passage_and_keeps_every_note() {
        let r = |id: &str, start, end| NoteRef {
            note_id: id.into(),
            title: id.into(),
            start,
            end,
            published: false,
        };
        let grouped = group_by_verse(vec![
            r("first", 3, 7),
            r("first", 3, 7),
            r("second", 3, 5),
            r("first", 9, 10),
        ]);
        assert_eq!(grouped.keys().copied().collect::<Vec<_>>(), [3, 9]);
        assert_eq!(grouped[&3], [r("first", 3, 7), r("second", 3, 5)]);
        assert_eq!(grouped[&9], [r("first", 9, 10)]);
        assert_eq!(
            group_by_verse(vec![r("reversed", 7, 3)])
                .keys()
                .copied()
                .collect::<Vec<_>>(),
            [3]
        );
        assert_eq!(range_label(&r("x", 3, 3)), "v. 3");
        assert_eq!(range_label(&r("x", 3, 5)), "vv. 3-5");
    }
    #[test]
    fn only_written_drafts_and_published_notes_mark_verses() {
        let c = jeremiah();
        let note = |id: &str, body: &str| {
            let mut n = Note::new("2026-10-28", None);
            n.id = id.into();
            n.body = body.into();
            n
        };
        let linked = format!("[Jeremiah 31:5]({HREF})");
        let refs = chapter_refs(
            &[
                (note("draft", &linked), "draft".into()),
                (note("published", &linked), "published".into()),
                (note("archived", &linked), "archived".into()),
                (note("empty", "   "), "draft".into()),
            ],
            &c,
        );
        let at = &refs[&5];
        assert_eq!(
            at.iter().map(|r| r.note_id.as_str()).collect::<Vec<_>>(),
            ["draft", "published"]
        );
        assert!(!at[0].published && at[1].published);
    }
    fn logged(id: &str, verses: Option<(u32, Option<u32>)>) -> LoggedReading {
        LoggedReading {
            id: id.into(),
            note: true,
            journal_date: "2026-10-26".into(),
            read_at: 1_793_016_000,
            source: NoteSource {
                kind: SourceKind::Scripture,
                label: "Jeremiah 31".into(),
                href: "/browse/oldtestament/jeremiah/31".into(),
                volume: Some("oldtestament".into()),
                book: Some("jeremiah".into()),
                chapter: Some(31),
                verse_start: verses.map(|v| v.0),
                verse_end: verses.and_then(|v| v.1),
            },
        }
    }
    fn ids(p: &ReadPassage) -> Vec<&str> {
        p.readings.iter().map(|r| r.id.as_str()).collect()
    }
    // The cases are the website's own (tests/chapterReadStatus.test.ts).
    #[test]
    fn read_passages_join_like_the_websites_reading_log() {
        let c = jeremiah();
        let verses: Vec<u32> = (1..=9).collect();
        let first = logged("first", Some((1, Some(2))));
        let second = logged("second", Some((2, Some(4))));
        let third = logged("third", Some((7, Some(9))));
        let result = chapter_read_passages(&[first.clone(), second, third, first], &c, &verses);
        assert_eq!(
            result.keys().copied().collect::<Vec<_>>(),
            [1, 2, 3, 4, 7, 8, 9]
        );
        assert_eq!((result[&1].start, result[&1].end), (1, 4));
        assert_eq!(ids(&result[&1]), ["first", "second"]);
        assert_eq!(result[&4], result[&1]);
        assert_eq!(
            (result[&7].start, result[&7].end, ids(&result[&7])),
            (7, 9, vec!["third"])
        );
        let adjoining = chapter_read_passages(
            &[
                logged("a", Some((1, Some(2)))),
                logged("b", Some((3, Some(4)))),
            ],
            &c,
            &verses,
        );
        assert_eq!(adjoining[&1].end, 4);

        // Whole chapters, single verses, reversed ranges and the volume's and book's other spellings.
        let mut whole = logged("chapter", None);
        whole.source.volume = Some("old-testament".into());
        whole.source.book = Some("Jer-emiah".into());
        let r = chapter_read_passages(&[whole], &c, &verses);
        assert_eq!((r[&1].start, r[&1].end), (1, 9));
        assert_eq!((r[&1].readings[0].start, r[&1].readings[0].end), (1, 9));
        let r = chapter_read_passages(
            &[
                logged("single", Some((2, None))),
                logged("reverse", Some((9, Some(7)))),
            ],
            &c,
            &verses,
        );
        assert_eq!((r[&2].start, r[&2].end), (2, 2));
        assert_eq!((r[&7].start, r[&7].end), (7, 9));
        assert_eq!(passage_label(&r[&7]), "verses 7–9");
        assert_eq!(passage_label(&r[&2]), "verse 2");

        // Other chapters, guides, verses past the chapter, nothing logged, no verses.
        let mut other = logged("other", None);
        other.source.chapter = Some(30);
        let mut guide = logged("guide", None);
        guide.source.kind = SourceKind::Guide;
        let mut unnamed = logged("no volume", None);
        unnamed.source.volume = None;
        let r = chapter_read_passages(
            &[
                other,
                guide,
                unnamed,
                logged("past", Some((10, Some(12)))),
                logged("visible", Some((8, Some(12)))),
            ],
            &c,
            &verses,
        );
        assert_eq!(r.keys().copied().collect::<Vec<_>>(), [8, 9]);
        assert!(chapter_read_passages(&[], &c, &verses).is_empty());
        assert!(chapter_read_passages(&[logged("all", None)], &c, &[]).is_empty());
    }
}
