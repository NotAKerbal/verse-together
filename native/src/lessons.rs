// Come, Follow Me lessons as the website shows them (src/lib/comeFollowMe.ts, src/features/comeFollowMe/lessons.ts
// and lessonCovers.ts): the 2026 schedule, the published study guides, their covers, and which lesson is this week.
// The schedule is read from the website's own source file, and the guides from its catalog, at build time.
use crate::store::{Book, Location, Verse};
use serde::Deserialize;
use std::sync::OnceLock;

include!(concat!(env!("OUT_DIR"), "/guides.rs"));
const SCHEDULE_SOURCE: &str = include_str!("../../src/lib/comeFollowMe.ts");

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Guide {
    pub slug: String,
    pub title: String,
    pub scripture: String,
    pub start_date: String,
    pub end_date: String,
    pub date_label: String,
    pub author: String,
    pub summary: String,
    pub sha256: String,
}
/// Every published guide, newest first, each once.
pub fn guides() -> &'static [Guide] {
    static GUIDES: OnceLock<Vec<Guide>> = OnceLock::new();
    GUIDES.get_or_init(|| {
        let mut all: Vec<Guide> = serde_json::from_str(GUIDE_CATALOG).expect("guide catalog");
        all.sort_by(|a, b| b.start_date.cmp(&a.start_date));
        all
    })
}
pub fn guide_content(slug: &str) -> Option<&'static str> {
    GUIDE_FILES
        .iter()
        .find(|(s, _)| *s == slug)
        .map(|(_, c)| *c)
}

#[derive(Debug, Clone, PartialEq)]
pub struct ChapterRange {
    pub volume: String,
    pub book: String,
    pub from: u32,
    pub to: u32,
}
impl ChapterRange {
    pub fn first(&self) -> Location {
        Location {
            volume: self.volume.clone(),
            book: self.book.clone(),
            chapter: self.from,
        }
    }
}
#[derive(Debug, Clone, PartialEq)]
pub struct Week {
    pub start: String,
    pub end: String,
    pub block: String,
    pub refs: Vec<ChapterRange>,
    /// For weeks with no assigned chapters, somewhere fitting to read instead.
    pub suggestion: Option<(ChapterRange, &'static str)>,
}
impl Week {
    /// The assigned chapters, or the special week's suggested reading.
    pub fn reading(&self) -> Vec<ChapterRange> {
        if !self.refs.is_empty() {
            self.refs.clone()
        } else {
            self.suggestion.iter().map(|(r, _)| r.clone()).collect()
        }
    }
}
fn special(block: &str) -> Option<(ChapterRange, &'static str)> {
    let (book, chapter, note) = match block {
        "Introduction to the Old Testament" => ("genesis", 1, "Start at the beginning"),
        "Easter" => ("isaiah", 53, "Read about the Savior"),
        "Christmas" => ("isaiah", 9, "Read about the Savior"),
        _ => return None,
    };
    Some((
        ChapterRange {
            volume: "oldtestament".into(),
            book: book.into(),
            from: chapter,
            to: chapter,
        },
        note,
    ))
}
/// "102–3" means 102–103: the end shares the start's leading digits.
fn expand_range_end(from: u32, to: u32) -> u32 {
    if to >= from {
        return to;
    }
    let (f, t) = (from.to_string(), to.to_string());
    if t.len() >= f.len() {
        return to;
    }
    format!("{}{t}", &f[..f.len() - t.len()])
        .parse()
        .unwrap_or(to)
}
/// Expands a block like "Exodus 19–20; 24; 31–34" or "Ruth; 1 Samuel 1–7" (`parseBlock`): a part without a book
/// continues the previous book, and a book without numbers is the whole book.
pub fn parse_block(block: &str, books: &[Book]) -> Result<Vec<ChapterRange>, String> {
    let part_pattern = regex::Regex::new(
        r"^(?:([123]?\s*[A-Za-z][A-Za-z ]*?))?\s*(?:(\d+)(?:\s*[–—-]\s*(\d+))?)?$",
    )
    .unwrap();
    let mut refs = Vec::new();
    let mut current: Option<&Book> = None;
    for part in block.split(';').map(str::trim).filter(|p| !p.is_empty()) {
        let captures = part_pattern
            .captures(part)
            .ok_or_else(|| format!("cannot parse {part:?} in {block:?}"))?;
        if let Some(name) = captures.get(1) {
            let slug: String = name
                .as_str()
                .to_lowercase()
                .chars()
                .filter(|c| !c.is_whitespace())
                .collect();
            let volume = if slug == "moses" || slug == "abraham" {
                "pearl"
            } else {
                "oldtestament"
            };
            current = Some(
                books
                    .iter()
                    .find(|b| b.volume == volume && b.id == slug)
                    .ok_or_else(|| format!("unknown book {:?}", name.as_str()))?,
            );
        }
        let book = current.ok_or_else(|| format!("{part:?} has no book in {block:?}"))?;
        let number = |i: usize| captures.get(i).and_then(|m| m.as_str().parse::<u32>().ok());
        let from = number(2).unwrap_or(1);
        let to = match (number(2), number(3)) {
            (_, Some(to)) => expand_range_end(from, to),
            (Some(_), None) => from,
            (None, _) => book.chapters,
        };
        if from < 1 || to < from || to > book.chapters {
            return Err(format!(
                "{} {from}–{to} is out of range in {block:?}",
                book.id
            ));
        }
        refs.push(ChapterRange {
            volume: book.volume.clone(),
            book: book.id.clone(),
            from,
            to,
        });
    }
    Ok(refs)
}
/// The 2026 schedule, read from the website's `SCHEDULE_2026`.
pub fn weeks(books: &[Book]) -> Vec<Week> {
    let row = regex::Regex::new(r#"\["(\d{4}-\d{2}-\d{2})", "(\d{4}-\d{2}-\d{2})", "([^"]+)"\]"#)
        .unwrap();
    let schedule = SCHEDULE_SOURCE
        .split("const SCHEDULE_2026")
        .nth(1)
        .and_then(|s| s.split("];").next())
        .unwrap_or("");
    row.captures_iter(schedule)
        .filter_map(|c| {
            let block = c[3].to_string();
            let suggestion = special(&block);
            let refs = if suggestion.is_some() {
                vec![]
            } else {
                parse_block(&block, books).ok()?
            };
            Some(Week {
                start: c[1].into(),
                end: c[2].into(),
                block,
                refs,
                suggestion,
            })
        })
        .collect()
}

/// "Jeremiah 31–33", "Lamentations 1", or "Esther" for a whole book (`describeRange`).
pub fn describe_range(range: &ChapterRange, books: &[Book]) -> String {
    let book = books
        .iter()
        .find(|b| b.volume == range.volume && b.id == range.book);
    let label = book.map(|b| b.label.as_str()).unwrap_or(&range.book);
    if range.from == 1 && book.is_some_and(|b| b.chapters == range.to) {
        label.to_string()
    } else if range.from == range.to {
        format!("{label} {}", range.from)
    } else {
        format!("{label} {}–{}", range.from, range.to)
    }
}

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
/// "October 19–25, 2026", "September 28–October 4, 2026": the guides' own style.
pub fn format_lesson_dates(start: &str, end: &str) -> String {
    let parts = |d: &str| -> (u32, usize, u32) {
        let mut it = d.split('-').map(|n| n.parse::<u32>().unwrap_or(1));
        (
            it.next().unwrap_or(0),
            it.next().unwrap_or(1) as usize,
            it.next().unwrap_or(1),
        )
    };
    let (sy, sm, sd) = parts(start);
    let (ey, em, ed) = parts(end);
    let month = |m: usize| MONTHS[m.clamp(1, 12) - 1];
    if sy != ey {
        format!("{} {sd}, {sy}–{} {ed}, {ey}", month(sm), month(em))
    } else if sm != em {
        format!("{} {sd}–{} {ed}, {ey}", month(sm), month(em))
    } else {
        format!("{} {sd}–{ed}, {ey}", month(sm))
    }
}

pub struct Credit {
    pub title: &'static str,
    pub artist: &'static str,
    pub date: &'static str,
    pub collection: Option<&'static str>,
    pub license: &'static str,
    pub source_label: &'static str,
    pub source_url: &'static str,
}
/// A lesson's cover. Paintings of the Savior are historical works by human artists, credited wherever shown;
/// generated covers show landscapes or objects only.
pub struct Cover {
    pub file: &'static str,
    pub bytes: &'static [u8],
    pub width: u32,
    pub height: u32,
    /// The website's alt text; kept with the cover (Iced 0.14 has no accessible image names yet).
    #[allow(dead_code)]
    pub alt: &'static str,
    /// CSS `object-position`, as fractions.
    pub focus: (f32, f32),
    pub credit: Option<Credit>,
}
macro_rules! asset {
    ($path:literal) => {
        (
            $path,
            include_bytes!(concat!("../../public", $path)) as &[u8],
        )
    };
}
fn covers() -> &'static [(&'static str, Cover)] {
    static COVERS: OnceLock<Vec<(&'static str, Cover)>> = OnceLock::new();
    COVERS.get_or_init(|| {
        let generated = |(file, bytes): (&'static str, &'static [u8]), alt| Cover {
            file,
            bytes,
            width: 1536,
            height: 1024,
            alt,
            focus: (0.5, 0.5),
            credit: None,
        };
        vec![
            (
                "2026-10-26",
                Cover {
                    file: asset!("/cfm/covers/rembrandt-jeremiah.webp").0,
                    bytes: asset!("/cfm/covers/rembrandt-jeremiah.webp").1,
                    width: 1180,
                    height: 1500,
                    alt: "Jeremiah rests his head on his hand as Jerusalem burns in the distance, in Rembrandt’s painting.",
                    focus: (0.5, 0.38),
                    credit: Some(Credit {
                        title: "Jeremiah Lamenting the Destruction of Jerusalem",
                        artist: "Rembrandt van Rijn",
                        date: "1630",
                        collection: Some("Rijksmuseum"),
                        license: "Public domain",
                        source_label: "Wikimedia Commons",
                        source_url: "https://commons.wikimedia.org/wiki/File:Rembrandt_-_Jeremiah_lamenting.jpg",
                    }),
                },
            ),
            (
                "2026-10-19",
                generated(
                    asset!("/cfm/covers/jeremiah-potter.webp"),
                    "A half-formed clay vessel on an ancient potter’s wheel in a quiet workshop, lit through a stone doorway.",
                ),
            ),
            (
                "2026-10-12",
                generated(
                    asset!("/cfm/covers/zion-dawn.webp"),
                    "Limestone rooftops and stone walls of ancient Jerusalem across rolling hills at dawn, an olive tree in front.",
                ),
            ),
            (
                "2026-10-05",
                Cover {
                    file: asset!("/cfm/art/bloch-gethsemane.webp").0,
                    bytes: asset!("/cfm/art/bloch-gethsemane.webp").1,
                    width: 640,
                    height: 896,
                    alt: "An angel comforts Jesus as He kneels in Gethsemane, in a painting by Carl Bloch.",
                    focus: (0.5, 0.52),
                    credit: Some(Credit {
                        title: "Christ in Gethsemane",
                        artist: "Carl Bloch",
                        date: "1873",
                        collection: None,
                        license: "Public domain",
                        source_label: "Wikimedia Commons",
                        source_url: "https://commons.wikimedia.org/wiki/File:Carl_Heinrich_Bloch_-_Gethsemane.jpg",
                    }),
                },
            ),
            (
                "2026-09-28",
                Cover {
                    file: asset!("/cfm/art/tissot-good-shepherd.webp").0,
                    bytes: asset!("/cfm/art/tissot-good-shepherd.webp").1,
                    width: 382,
                    height: 713,
                    alt: "Jesus carries a sheep on His shoulders along a rocky path, in James Tissot’s The Good Shepherd.",
                    focus: (0.5, 0.12),
                    credit: Some(Credit {
                        title: "The Good Shepherd",
                        artist: "James Tissot",
                        date: "1886–1894",
                        collection: Some("Brooklyn Museum"),
                        license: "Public domain",
                        source_label: "Wikimedia Commons",
                        source_url: "https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_The_Good_Shepherd_(Le_bon_pasteur)_-_James_Tissot_-_overall.jpg",
                    }),
                },
            ),
            (
                "",
                generated(
                    asset!("/cfm/covers/scripture-landscape.webp"),
                    "A footpath winds between olive trees on sunlit terraced hills, with pale mountains in the distance.",
                ),
            ),
        ]
    })
}
/// The week's own cover, or the fallback landscape.
pub fn cover(week_start: &str) -> &'static Cover {
    let all = covers();
    all.iter()
        .find(|(w, _)| *w == week_start)
        .or_else(|| all.iter().find(|(w, _)| w.is_empty()))
        .map(|(_, c)| c)
        .expect("fallback cover")
}
/// The part of a cover shown in a `width` × `height` frame, as `object-fit: cover` with its focus point.
pub fn crop(cover: &Cover, width: f32, height: f32) -> iced::Rectangle<u32> {
    let (w, h) = (cover.width as f32, cover.height as f32);
    let frame = (width / height.max(1.0)).max(0.01);
    let (cw, ch) = if w / h > frame {
        (h * frame, h)
    } else {
        (w, w / frame)
    };
    let x = ((w - cw) * cover.focus.0).round();
    let y = ((h - ch) * cover.focus.1).round();
    iced::Rectangle {
        x: x as u32,
        y: y as u32,
        width: cw.round().max(1.0) as u32,
        height: ch.round().max(1.0) as u32,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Lesson {
    /// Monday, `YYYY-MM-DD`.
    pub start: String,
    pub week: Option<Week>,
    pub guide: Option<Guide>,
    pub title: String,
    pub scripture: String,
    pub date_label: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Schedule {
    Before,
    During,
    After,
}
pub struct Overview {
    pub schedule: Schedule,
    pub current: Option<Lesson>,
    pub previous: Vec<Lesson>,
    pub upcoming: Vec<Lesson>,
}
fn guide_lesson(guide: &Guide, weeks: &[Week]) -> Lesson {
    Lesson {
        start: guide.start_date.clone(),
        week: weeks.iter().find(|w| w.start == guide.start_date).cloned(),
        guide: Some(guide.clone()),
        title: guide.title.clone(),
        scripture: guide.scripture.clone(),
        date_label: guide.date_label.clone(),
    }
}
fn week_lesson(week: &Week) -> Lesson {
    Lesson {
        start: week.start.clone(),
        week: Some(week.clone()),
        guide: None,
        title: week.block.clone(),
        scripture: week.block.clone(),
        date_label: format_lesson_dates(&week.start, &week.end),
    }
}
pub fn lesson_for_week(start: &str, guides: &[Guide], weeks: &[Week]) -> Option<Lesson> {
    match guides.iter().find(|g| g.start_date == start) {
        Some(g) => Some(guide_lesson(g, weeks)),
        None => weeks.iter().find(|w| w.start == start).map(week_lesson),
    }
}
/// Only a guide whose dates include today, or the scheduled week containing it, is "this week"; the newest guide
/// is never promoted in their place (`getLessonOverview`).
pub fn overview(today: &str, guides: &[Guide], weeks: &[Week]) -> Overview {
    let schedule = match (weeks.first(), weeks.last()) {
        (Some(first), _) if today < first.start.as_str() => Schedule::Before,
        (_, Some(last)) if today > last.end.as_str() => Schedule::After,
        (None, _) => Schedule::Before,
        _ => Schedule::During,
    };
    let current = guides
        .iter()
        .find(|g| g.start_date.as_str() <= today && today <= g.end_date.as_str())
        .map(|g| guide_lesson(g, weeks))
        .or_else(|| {
            weeks
                .iter()
                .find(|w| w.start.as_str() <= today && today <= w.end.as_str())
                .map(week_lesson)
        });
    let mut previous: Vec<_> = guides
        .iter()
        .filter(|g| g.end_date.as_str() < today)
        .collect();
    previous.sort_by(|a, b| b.start_date.cmp(&a.start_date));
    let mut upcoming: Vec<_> = guides
        .iter()
        .filter(|g| g.start_date.as_str() > today)
        .collect();
    upcoming.sort_by(|a, b| a.start_date.cmp(&b.start_date));
    Overview {
        schedule,
        current,
        previous: previous
            .into_iter()
            .map(|g| guide_lesson(g, weeks))
            .collect(),
        upcoming: upcoming
            .into_iter()
            .map(|g| guide_lesson(g, weeks))
            .collect(),
    }
}

/// One part of a guide's text: the introduction (level 1) or a `##`/`###` section.
#[derive(Debug, Clone)]
pub struct Section {
    pub level: u8,
    pub title: String,
    pub body: String,
    /// The passage a verse-by-verse section discusses: "Jeremiah 31:1–3 — …".
    pub passage: Option<(Location, Option<(u32, u32)>)>,
}
/// Splits a guide into sections, leaving out its `#` title (the page's hero shows it).
pub fn sections(content: &str, books: &[Book]) -> Vec<Section> {
    let mut out = vec![Section {
        level: 1,
        title: "Introduction".into(),
        body: String::new(),
        passage: None,
    }];
    for line in content.lines() {
        let heading = if let Some(t) = line.strip_prefix("### ") {
            Some((3, t))
        } else {
            line.strip_prefix("## ").map(|t| (2, t))
        };
        match heading {
            Some((level, title)) => out.push(Section {
                level,
                title: title.trim().to_string(),
                body: format!("{line}\n"),
                passage: passage(title, books),
            }),
            None if line.starts_with("# ") && out.len() == 1 && out[0].body.trim().is_empty() => {}
            None => {
                let last = out.last_mut().expect("introduction");
                last.body.push_str(line);
                last.body.push('\n');
            }
        }
    }
    out.retain(|s| !s.body.trim().is_empty());
    out
}
/// The scripture a heading names, when it starts with one ("Lamentations 3:22–24 — …", "Jeremiah 32: …").
pub fn passage(title: &str, books: &[Book]) -> Option<(Location, Option<(u32, u32)>)> {
    let pattern = regex::Regex::new(
        r"^((?:[1-4] )?[A-Z][A-Za-z ]*?) (\d+)(?::(\d+)[ab]?(?:\s*[–-]\s*(\d+)[ab]?)?)?(?:\s|:|$)",
    )
    .ok()?;
    let c = pattern.captures(title)?;
    let book = books.iter().find(|b| b.label == c[1].trim())?;
    let chapter: u32 = c[2].parse().ok()?;
    if chapter == 0 || chapter > book.chapters {
        return None;
    }
    let verses = c.get(3).and_then(|a| {
        let a: u32 = a.as_str().parse().ok()?;
        let b = c.get(4).and_then(|b| b.as_str().parse().ok()).unwrap_or(a);
        Some((a, b.max(a)))
    });
    Some((
        Location {
            volume: book.volume.clone(),
            book: book.id.clone(),
            chapter,
        },
        verses,
    ))
}

/// One piece of a chapter's commentary in the scripture-first lesson (`GuideContextBlock`): a section's prose,
/// discussing a passage when its heading names one.
#[derive(Debug, Clone, PartialEq)]
pub struct ContextBlock {
    /// The section it comes from (index into `sections`).
    pub section: usize,
    /// A chapter section's own prose after its heading: "Chapter context".
    pub after_heading: bool,
    /// The verses it discusses, first to last, and the heading's reference ("Jeremiah 31:1–3").
    pub passage: Option<(u32, u32, String)>,
}
/// A chapter of the week, read in full with its commentary beside the verses it discusses (`StudyCompanion`).
#[derive(Debug, Clone, PartialEq)]
pub struct CompanionChapter {
    pub location: Location,
    pub label: String,
    /// The guide's `##` section for this chapter, when it has one.
    pub heading: Option<usize>,
    pub blocks: Vec<ContextBlock>,
    /// Sections the guide places after this chapter's and before the next chapter's: heading and blocks.
    pub following: Vec<(usize, Vec<ContextBlock>)>,
}
/// The lesson page's parts (`readGuide`'s introduction, reader sections and closing).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Companion {
    /// Sections shown before the scripture.
    pub introduction: Vec<usize>,
    pub chapters: Vec<CompanionChapter>,
    /// Sections shown after the scripture.
    pub closing: Vec<usize>,
}
/// A run of verses and the commentary that follows them (`readingGroups`).
#[derive(Debug, Clone, PartialEq)]
pub struct ReadingGroup {
    pub verses: std::ops::Range<usize>,
    pub context: Option<ContextBlock>,
}

/// Pairs the guide with the week's chapters, as the website's lesson page does: a `##` section naming one of the
/// chapters is that chapter's commentary; sections before the first such section are the introduction, sections
/// after the last are the closing, and sections between follow the chapter before them.
pub fn companion(sections: &[Section], chapters: &[Location], books: &[Book]) -> Companion {
    let label_of = |l: &Location| {
        books
            .iter()
            .find(|b| b.volume == l.volume && b.id == l.book)
            .map(|b| format!("{} {}", b.label, l.chapter))
            .unwrap_or_default()
    };
    // Top-level groups: the introduction (level 1) and each `##` section with its `###` sections.
    let mut groups: Vec<Vec<usize>> = vec![];
    for (i, section) in sections.iter().enumerate() {
        if section.level <= 2 || groups.is_empty() {
            groups.push(vec![i]);
        } else if let Some(last) = groups.last_mut() {
            last.push(i);
        }
    }
    let paired = |group: &[usize]| -> Option<Location> {
        let head = &sections[group[0]];
        if head.level != 2 {
            return None;
        }
        match &head.passage {
            Some((l, None)) if chapters.contains(l) => Some(l.clone()),
            _ => None,
        }
    };
    let blocks_of = |group: &[usize]| -> Vec<ContextBlock> {
        let mut out = vec![];
        for (n, &i) in group.iter().enumerate() {
            let section = &sections[i];
            if n == 0 {
                // The chapter's own prose after its heading, when there is any.
                let rest = section.body.lines().skip(1).any(|l| !l.trim().is_empty());
                if section.level == 2 && rest {
                    out.push(ContextBlock {
                        section: i,
                        after_heading: true,
                        passage: None,
                    });
                }
                continue;
            }
            let passage = section.passage.as_ref().and_then(|(_, verses)| {
                let (a, b) = (*verses)?;
                let reference = section.title.split(" — ").next().unwrap_or(&section.title);
                Some((a, b, reference.trim().to_string()))
            });
            out.push(ContextBlock {
                section: i,
                after_heading: false,
                passage,
            });
        }
        out
    };
    let first = groups.iter().position(|g| paired(g).is_some());
    let last = groups.iter().rposition(|g| paired(g).is_some());
    let (Some(first), Some(last)) = (first, last) else {
        // Nothing to pair with: the guide reads as one document, before the scripture.
        return Companion {
            introduction: (0..sections.len()).collect(),
            chapters: chapters
                .iter()
                .map(|l| CompanionChapter {
                    location: l.clone(),
                    label: label_of(l),
                    heading: None,
                    blocks: vec![],
                    following: vec![],
                })
                .collect(),
            closing: vec![],
        };
    };
    let flatten = |range: std::ops::Range<usize>| -> Vec<usize> {
        groups[range].iter().flatten().copied().collect()
    };
    let out_chapters = chapters
        .iter()
        .map(|l| {
            let index = (first..=last).find(|&g| paired(&groups[g]).as_ref() == Some(l));
            let mut following = vec![];
            if let Some(index) = index {
                for group in &groups[index + 1..=last] {
                    if paired(group).is_some() {
                        break;
                    }
                    following.push((group[0], blocks_of(group)));
                }
            }
            CompanionChapter {
                location: l.clone(),
                label: label_of(l),
                heading: index.map(|g| groups[g][0]),
                blocks: index.map(|g| blocks_of(&groups[g])).unwrap_or_default(),
                following,
            }
        })
        .collect();
    Companion {
        introduction: flatten(0..first),
        chapters: out_chapters,
        closing: flatten(last + 1..groups.len()),
    }
}
/// `readingGroups`: complete scripture interleaved with the commentary, each verse once, even when two comments
/// overlap; commentary without a passage stays in source order.
pub fn reading_groups(verses: &[Verse], blocks: &[ContextBlock]) -> Vec<ReadingGroup> {
    let mut groups = vec![];
    let mut cursor = 0;
    let take_through = |cursor: &mut usize, last: u32| {
        let start = *cursor;
        while *cursor < verses.len() && verses[*cursor].number <= last {
            *cursor += 1;
        }
        start..*cursor
    };
    for block in blocks {
        let Some((first, last, _)) = &block.passage else {
            groups.push(ReadingGroup {
                verses: cursor..cursor,
                context: Some(block.clone()),
            });
            continue;
        };
        let gap = take_through(&mut cursor, first.saturating_sub(1));
        if !gap.is_empty() {
            groups.push(ReadingGroup {
                verses: gap,
                context: None,
            });
        }
        let own = take_through(&mut cursor, *last);
        groups.push(ReadingGroup {
            verses: own,
            context: Some(block.clone()),
        });
    }
    if cursor < verses.len() {
        groups.push(ReadingGroup {
            verses: cursor..verses.len(),
            context: None,
        });
    }
    groups
}
/// `verseRangeLabel`.
pub fn verse_range_label(first: u32, last: u32) -> String {
    if first == last {
        format!("Verse {first}")
    } else {
        format!("Verses {first}–{last}")
    }
}
/// The disclosure's label (`contextLabel`): "Chapter context", "Context for verse 4", "Context for verses 1–3".
pub fn context_label(block: &ContextBlock) -> String {
    match &block.passage {
        None => "Chapter context".into(),
        Some((first, last, reference)) => {
            let verses = reference
                .split_once(':')
                .map(|(_, v)| v)
                .unwrap_or(reference);
            let single = first == last && !verses.contains(['–', '-']);
            format!(
                "Context for {} {verses}",
                if single { "verse" } else { "verses" }
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    use sha2::Digest;
    fn books() -> Vec<Book> {
        let dir = std::env::temp_dir().join(format!(
            "verse-lessons-{}-{}",
            std::process::id(),
            crate::store::new_id()
        ));
        let books = Store::open(&dir).unwrap().books().unwrap();
        let _ = std::fs::remove_dir_all(dir);
        books
    }
    #[test]
    fn the_whole_2026_schedule_parses_like_the_website() {
        let books = books();
        let weeks = weeks(&books);
        assert_eq!(weeks.len(), 52);
        assert_eq!(weeks[0].start, "2025-12-29");
        assert!(
            weeks.iter().all(|w| !w.reading().is_empty()),
            "every week has reading"
        );
        let jer = weeks.iter().find(|w| w.start == "2026-10-26").unwrap();
        let labels: Vec<_> = jer.refs.iter().map(|r| describe_range(r, &books)).collect();
        assert_eq!(
            labels,
            [
                "Jeremiah 31–33",
                "Jeremiah 36–39",
                "Lamentations 1",
                "Lamentations 3"
            ]
        );
        let psalms = weeks.iter().find(|w| w.start == "2026-08-31").unwrap();
        assert_eq!(
            (psalms.refs[0].from, psalms.refs[0].to),
            (102, 103),
            "\"102–3\" is 102–103"
        );
        let moses = weeks.iter().find(|w| w.start == "2026-01-05").unwrap();
        assert_eq!(moses.refs[0].volume, "pearl");
        let esther = weeks.iter().find(|w| w.start == "2026-08-03").unwrap();
        assert_eq!(describe_range(&esther.refs[0], &books), "Esther");
        let christmas = weeks.last().unwrap();
        assert_eq!(christmas.reading()[0].book, "isaiah");
        assert!(parse_block("Nonesuch 4", &books).is_err());
        assert!(parse_block("Genesis 51", &books).is_err());
    }
    #[test]
    fn this_week_is_never_the_newest_guide_by_default() {
        let books = books();
        let weeks = weeks(&books);
        let o = overview("2026-10-27", guides(), &weeks);
        let current = o.current.unwrap();
        assert_eq!(current.start, "2026-10-26");
        assert_eq!(current.title, "I Will Turn Their Mourning into Joy");
        assert_eq!(o.previous.len(), 4);
        assert_eq!(o.previous[0].start, "2026-10-19");
        // A scheduled week without a guide is its reading, not an older guide.
        let later = overview("2026-11-03", guides(), &weeks).current.unwrap();
        assert!(later.guide.is_none());
        assert_eq!(later.title, "Ezekiel 1–3; 33–34; 36–37; 47");
        assert_eq!(
            overview("2027-02-01", guides(), &weeks).schedule,
            Schedule::After
        );
        assert_eq!(
            format_lesson_dates("2026-09-28", "2026-10-04"),
            "September 28–October 4, 2026"
        );
    }
    #[test]
    fn embedded_guides_match_their_published_checksums() {
        assert_eq!(guides().len(), 5);
        for guide in guides() {
            let content = guide_content(&guide.slug).expect("guide text");
            let digest = sha2::Sha256::digest(content.as_bytes());
            let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
            assert_eq!(hex, guide.sha256, "{}", guide.slug);
        }
    }
    #[test]
    fn covers_follow_the_websites_covers() {
        let source = include_str!("../../src/features/comeFollowMe/lessonCovers.ts");
        // Every cover the website lists is here.
        for (week, cover) in covers().iter().filter(|(w, _)| !w.is_empty()) {
            assert!(
                *week == "2026-10-26" || source.contains(&format!("\"{week}\": {{")),
                "{week}"
            );
            assert!(source.contains(cover.file) || *week == "2026-10-26");
            if cover.credit.is_some() {
                assert!(cover.alt.contains("painting") || cover.alt.contains("Tissot"));
            }
        }
        assert_eq!(
            cover("2026-11-02").file,
            "/cfm/covers/scripture-landscape.webp"
        );
        let r = crop(cover("2026-10-26"), 630.0, 517.0);
        assert!((r.width as f32 / r.height as f32 - 630.0 / 517.0).abs() < 0.01);
    }
    #[test]
    fn guide_sections_find_their_passages() {
        let books = books();
        let guide = guides()
            .iter()
            .find(|g| g.start_date == "2026-10-26")
            .unwrap();
        let sections = sections(guide_content(&guide.slug).unwrap(), &books);
        assert_eq!(sections[0].title, "Introduction");
        assert!(!sections[0].body.contains("# I Will Turn"));
        let first = sections
            .iter()
            .find(|s| s.title.starts_with("Jeremiah 31:1–3"))
            .unwrap();
        let (location, verses) = first.passage.clone().unwrap();
        assert_eq!(
            (location.book.as_str(), location.chapter, verses),
            ("jeremiah", 31, Some((1, 3)))
        );
        assert!(sections.iter().any(|s| {
            s.passage
                .as_ref()
                .is_some_and(|(l, _)| l.book == "lamentations")
        }));
        assert!(passage("Historical and Literary Context", &books).is_none());
    }

    #[test]
    fn the_lesson_reads_scripture_first_like_the_website() {
        let books = books();
        let weeks = weeks(&books);
        let lesson = lesson_for_week("2026-10-26", guides(), &weeks).unwrap();
        let content = guide_content(&lesson.guide.as_ref().unwrap().slug).unwrap();
        let sections = sections(content, &books);
        let chapters: Vec<Location> = lesson
            .week
            .as_ref()
            .unwrap()
            .reading()
            .iter()
            .flat_map(|r| {
                (r.from..=r.to).map(move |c| Location {
                    chapter: c,
                    ..r.first()
                })
            })
            .collect();
        let c = companion(&sections, &chapters, &books);
        // The website's nine chapter sections, in order.
        let labels: Vec<&str> = c.chapters.iter().map(|ch| ch.label.as_str()).collect();
        assert_eq!(
            labels,
            [
                "Jeremiah 31",
                "Jeremiah 32",
                "Jeremiah 33",
                "Jeremiah 36",
                "Jeremiah 37",
                "Jeremiah 38",
                "Jeremiah 39",
                "Lamentations 1",
                "Lamentations 3"
            ]
        );
        assert!(c.chapters.iter().all(|ch| ch.heading.is_some()));
        // The introduction and the historical context come first; the weekly plan and sources after.
        assert!(
            c.introduction
                .iter()
                .any(|&i| sections[i].title == "Historical and Literary Context")
        );
        assert!(c.closing.iter().any(|&i| {
            sections[i]
                .title
                .starts_with("Weekly Study and Discussion Plan")
        }));
        let jer31 = &c.chapters[0];
        assert!(jer31.blocks[0].after_heading);
        assert_eq!(context_label(&jer31.blocks[0]), "Chapter context");
        assert_eq!(context_label(&jer31.blocks[1]), "Context for verses 1–3");
        // Every verse is read exactly once, in order.
        let verses: Vec<Verse> = (1..=40)
            .map(|n| Verse {
                number: n,
                text: String::new(),
            })
            .collect();
        let groups = reading_groups(&verses, &jer31.blocks);
        let read: Vec<usize> = groups.iter().flat_map(|g| g.verses.clone()).collect();
        assert_eq!(read, (0..40).collect::<Vec<_>>());
        assert_eq!(groups[0].verses, 0..0);
        assert_eq!(groups[1].verses, 0..3);
        assert_eq!(verse_range_label(1, 3), "Verses 1–3");
        // Half verses ("13b") still name their passage.
        assert_eq!(
            passage("Isaiah 57:13b–14 — The path made level", &books)
                .unwrap()
                .1,
            Some((13, 14))
        );
    }
}
