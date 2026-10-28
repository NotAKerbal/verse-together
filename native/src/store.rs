use crate::marks::{MarkColor, MarkPreset, TextMark, VerseMarks};
use rusqlite::{Connection, OpenFlags, params};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub type Result<T> = std::result::Result<T, String>;
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Location {
    pub volume: String,
    pub book: String,
    pub chapter: u32,
}
impl Default for Location {
    fn default() -> Self {
        Self {
            volume: "bookofmormon".into(),
            book: "1nephi".into(),
            chapter: 1,
        }
    }
}
#[derive(Debug, Clone)]
pub struct Book {
    pub volume: String,
    pub volume_title: String,
    pub id: String,
    pub label: String,
    pub short_title: String,
    pub chapters: u32,
}
#[derive(Debug, Clone)]
pub struct Verse {
    pub number: u32,
    pub text: String,
}
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub location: Location,
    pub verse: u32,
    pub text: String,
    pub reference: String,
}
#[derive(Debug, Clone, Default)]
pub struct SearchResults {
    pub hits: Vec<SearchHit>,
    pub more: bool,
}
#[derive(Debug, Clone)]
pub struct StudyEntry {
    pub location: Location,
    pub verse: u32,
    pub reference: String,
    pub note: String,
    /// Seconds since the epoch.
    pub updated: i64,
}
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Annotation {
    pub verse: u32,
    pub marks: VerseMarks,
    pub bookmarked: bool,
    pub note: String,
}
impl Annotation {
    pub fn is_empty(&self) -> bool {
        self.note.trim().is_empty() && !self.bookmarked && self.marks.is_empty()
    }
    pub fn is_marked(&self) -> bool {
        !self.marks.is_empty()
    }
}

/// Where a journal note or a reading came from (convex/noteJournal.ts `NoteSource`): always a same-app link,
/// with scripture coordinates when known. Field names match the website's, so sources sync unchanged.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSource {
    pub kind: SourceKind,
    pub label: String,
    pub href: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub book: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verse_start: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verse_end: Option<u32>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    Scripture,
    Guide,
    Page,
}
/// The website's URL slug for a volume (`toScriptureVolumeUrlSlug`).
pub fn volume_url_slug(volume: &str) -> &str {
    match volume {
        "doctrineandcovenants" => "dnc",
        other => other,
    }
}
pub fn volume_from_url_slug(slug: &str) -> &str {
    match slug {
        "dnc" => "doctrineandcovenants",
        "old-testament" => "oldtestament",
        "new-testament" => "newtestament",
        other => other,
    }
}
impl NoteSource {
    /// A chapter (and optionally verses), linked as the website links it: `/browse/<volume>/<book>/<chapter>#v-N`.
    pub fn scripture(label: &str, l: &Location, verses: Option<(u32, u32)>) -> Self {
        let mut href = format!(
            "/browse/{}/{}/{}",
            volume_url_slug(&l.volume),
            l.book,
            l.chapter
        );
        let mut label = format!("{label} {}", l.chapter);
        if let Some((a, b)) = verses {
            href.push_str(&format!("#v-{a}"));
            label.push_str(&if a == b {
                format!(":{a}")
            } else {
                format!(":{a}-{b}")
            });
        }
        Self {
            kind: SourceKind::Scripture,
            label,
            href,
            volume: Some(l.volume.clone()),
            book: Some(l.book.clone()),
            chapter: Some(l.chapter),
            verse_start: verses.map(|v| v.0),
            verse_end: verses.map(|v| v.1),
        }
    }
    /// A Come, Follow Me lesson (`lessonNoteSource`).
    pub fn lesson(week_start: &str, label: &str) -> Self {
        Self {
            kind: SourceKind::Guide,
            label: label.chars().take(200).collect(),
            href: format!("/come-follow-me/{week_start}"),
            volume: None,
            book: None,
            chapter: None,
            verse_start: None,
            verse_end: None,
        }
    }
    /// The chapter (and first verse) a scripture source points to.
    pub fn location(&self) -> Option<(Location, Option<u32>)> {
        if self.kind != SourceKind::Scripture {
            return None;
        }
        let (volume, book, chapter) = match (&self.volume, &self.book, self.chapter) {
            (Some(v), Some(b), Some(c)) => (volume_from_url_slug(v).to_string(), b.clone(), c),
            _ => {
                let path = self.href.split('#').next()?;
                let mut parts = path.trim_start_matches('/').split('/');
                if parts.next()? != "browse" {
                    return None;
                }
                (
                    volume_from_url_slug(parts.next()?).to_string(),
                    parts.next()?.to_string(),
                    parts.next()?.parse().ok()?,
                )
            }
        };
        Some((
            Location {
                volume,
                book,
                chapter,
            },
            self.verse_start,
        ))
    }
}

/// A Markdown journal note (the website's Notes journal entry).
#[derive(Debug, Clone, PartialEq)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    /// Local `YYYY-MM-DD` the entry belongs to.
    pub journal_date: String,
    pub source: Option<NoteSource>,
    /// When the entry also logs reading of its source (seconds since the epoch).
    pub reading_at: Option<i64>,
    pub created: i64,
    pub updated: i64,
    /// The local revision this copy was read at (0 before it is first saved). Saving checks it, so text written
    /// in an editor never silently replaces an edit a sync brought in meanwhile.
    pub rev: i64,
}
pub const DEFAULT_NOTE_TITLE: &str = "Untitled note";
pub const NOTE_TITLE_MAX: usize = 120;
pub const NOTE_MARKDOWN_MAX: usize = 200_000;
impl Note {
    pub fn new(journal_date: &str, source: Option<NoteSource>) -> Self {
        let now = now();
        Self {
            id: new_id(),
            title: String::new(),
            body: String::new(),
            journal_date: journal_date.into(),
            source,
            reading_at: None,
            created: now,
            updated: now,
            rev: 0,
        }
    }
    pub fn display_title(&self) -> &str {
        let title = self.title.trim();
        if title.is_empty() {
            DEFAULT_NOTE_TITLE
        } else {
            title
        }
    }
    /// Whether the entry holds an actual reflection (`hasReflection`), not just a named reading.
    pub fn has_reflection(&self) -> bool {
        !self.body.trim().is_empty()
            || (!self.title.trim().is_empty() && self.title.trim() != DEFAULT_NOTE_TITLE)
    }
    /// The body as plain text for a one-line preview.
    pub fn excerpt(&self, limit: usize) -> String {
        let plain = self
            .body
            .lines()
            .map(|l| l.trim_start_matches(['#', '>', '-', '*', ' ']).trim())
            .filter(|l| !l.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
            .replace(['*', '_', '`'], "");
        if plain.chars().count() > limit {
            format!(
                "{}…",
                plain.chars().take(limit).collect::<String>().trim_end()
            )
        } else {
            plain
        }
    }
}
/// A logged reading.
#[derive(Debug, Clone, PartialEq)]
pub struct Reading {
    pub id: String,
    pub journal_date: String,
    pub source: NoteSource,
    pub read_at: i64,
    /// `chapter_mark` (the reader's Log panel) or `manual`.
    pub origin: String,
}

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
/// A random 128-bit identifier, hex encoded.
pub fn new_id() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("system randomness");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
/// Today's local `YYYY-MM-DD`.
pub fn today() -> String {
    chrono::Local::now()
        .date_naive()
        .format("%Y-%m-%d")
        .to_string()
}
/// The local `YYYY-MM-DD` of a moment.
pub fn local_date(secs: i64) -> String {
    use chrono::TimeZone;
    chrono::Local
        .timestamp_opt(secs, 0)
        .single()
        .map(|t| t.date_naive().format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// The website's journal goals (`src/lib/journalGoals.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalGoals {
    pub study_days: u32,
    pub reflections: u32,
}
pub const MAX_WEEKLY_REFLECTIONS: u32 = 21;
impl Default for JournalGoals {
    fn default() -> Self {
        Self {
            study_days: 5,
            reflections: 3,
        }
    }
}
impl JournalGoals {
    pub fn problem(&self) -> Option<String> {
        if !(1..=7).contains(&self.study_days) {
            return Some("Choose between 1 and 7 study days per week.".into());
        }
        if !(1..=MAX_WEEKLY_REFLECTIONS).contains(&self.reflections) {
            return Some(format!(
                "Choose between 1 and {MAX_WEEKLY_REFLECTIONS} reflections per week."
            ));
        }
        None
    }
}

/// The website's Reader settings text widths: a centered 56rem measure, 88rem, or edge to edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextWidth {
    #[default]
    Comfortable,
    Wide,
    Full,
}

/// Saved as JSON, so fields can be added compatibly. Unknown fields from older builds (such as the removed library
/// sidebar preference) are ignored.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Preferences {
    pub dark: bool,
    pub font_size: f32,
    pub serif: bool,
    pub last: Location,
    pub text_width: TextWidth,
    /// 0 for preferences written before the web-matched reader (whose default text size was 22px).
    #[serde(default)]
    pub version: u32,
    /// The quick marks offered for a selection; `None` until the reader changes the defaults.
    pub mark_presets: Option<Vec<MarkPreset>>,
    /// This device's weekly goals (an account keeps its own).
    pub goals: JournalGoals,
    /// Bibles kept in Your Bibles (`favorite_bible_translations_v1`).
    pub bibles: Vec<crate::reader_tools::FavoriteBible>,
    /// The Bibles shown beside the KJV, by id.
    pub compare_bibles: Vec<String>,
    /// Joseph Smith Translation passages shown with Bible chapters.
    pub jst: bool,
}
pub const PREFERENCES_VERSION: u32 = 2;
/// The website's 1rem reading size; its Reader settings scale it from 85% to 130%.
pub const DEFAULT_FONT_SIZE: f32 = 16.0;
pub const MIN_FONT_SIZE: f32 = DEFAULT_FONT_SIZE * 0.85;
pub const MAX_FONT_SIZE: f32 = DEFAULT_FONT_SIZE * 1.30;
impl Default for Preferences {
    fn default() -> Self {
        Self {
            dark: false,
            font_size: DEFAULT_FONT_SIZE,
            serif: true,
            last: Location::default(),
            text_width: TextWidth::Comfortable,
            version: PREFERENCES_VERSION,
            mark_presets: None,
            goals: JournalGoals::default(),
            bibles: Vec::new(),
            compare_bibles: Vec::new(),
            jst: false,
        }
    }
}
impl Preferences {
    /// Brings preferences from earlier builds up to date. The old default size (22px) becomes the website's 16px;
    /// a size someone chose stays, within the supported range.
    pub fn migrate(mut self) -> Self {
        if self.version < PREFERENCES_VERSION && self.font_size == 22.0 {
            self.font_size = DEFAULT_FONT_SIZE;
        }
        self.font_size = self.font_size.clamp(MIN_FONT_SIZE, MAX_FONT_SIZE);
        self.version = PREFERENCES_VERSION;
        self
    }
    pub fn presets(&self) -> Vec<MarkPreset> {
        self.mark_presets
            .clone()
            .map(crate::marks::normalize_presets)
            .unwrap_or_else(crate::marks::default_presets)
    }
}

/// A verse annotation changed here and not yet confirmed by the account. Only the fields that changed are sent
/// (bookmarks are this app's own and never are), so a highlight made here can't overwrite a note written on the
/// website, and a cleared note is sent as a removal.
#[derive(Debug, Clone)]
pub struct DirtyAnnotation {
    pub location: Location,
    pub annotation: Annotation,
    /// The local revision this state was read at; an acknowledgement only cleans this exact revision.
    pub rev: i64,
    pub marks: bool,
    pub note: bool,
}
/// A journal note changed here and not yet confirmed by the account.
#[derive(Debug, Clone)]
pub struct DirtyNote {
    pub note: Note,
    pub deleted: bool,
    pub remote_id: Option<String>,
    /// The server's Markdown revision this copy's text is based on.
    pub remote_revision: Option<i64>,
    /// The idempotency key the account's entry is (or will be) created with.
    pub request_id: String,
    /// Whether a create was ever sent (its reply may have been lost).
    pub attempted: bool,
    pub body: bool,
    pub meta: bool,
}
/// A logged reading changed here and not yet confirmed.
#[derive(Debug, Clone)]
pub struct DirtyReading {
    pub reading: Reading,
    pub deleted: bool,
    pub remote_id: Option<String>,
    pub attempted: bool,
    pub rev: i64,
}
/// A chapter marked read or unread here and not yet confirmed.
#[derive(Debug, Clone)]
pub struct DirtyChapter {
    pub location: Location,
    pub read: bool,
    pub rev: i64,
}
/// A note as the account lists it (`insights:listMyJournal`), with its text when it was fetched.
#[derive(Debug, Clone)]
pub struct RemoteNote {
    pub remote_id: String,
    pub revision: i64,
    pub updated_at: String,
    pub journal_date: String,
    pub source: Option<NoteSource>,
    pub reading_at: Option<i64>,
    pub created: i64,
    pub updated: i64,
    /// Title and body, when the text was fetched (its revision changed).
    pub text: Option<(String, String)>,
}
/// A reading as the account lists it (`readingProgress:listMyReadingLog`).
#[derive(Debug, Clone)]
pub struct RemoteReading {
    pub remote_id: String,
    pub request_id: Option<String>,
    pub journal_date: String,
    pub source: NoteSource,
    pub read_at: i64,
    pub origin: String,
}
/// A note already here that the account has: local id, server id, Markdown revision, server change time, and
/// whether it has unsent changes.
pub type KnownNote = (String, String, i64, Option<String>, bool);
/// What saving a journal note did.
#[derive(Debug, Clone, PartialEq)]
pub struct NoteSaved {
    pub id: String,
    pub rev: i64,
    /// The note had changed underneath the editor (a sync brought another device's edit), so this text was kept
    /// as a separate note instead of overwriting that edit.
    pub forked: bool,
}

pub struct Store {
    pub scripture_path: PathBuf,
    scripture: Connection,
    study: Connection,
    /// Whose rows are read and written: "" for this device's own (signed-out) study, else the signed-in account's
    /// id. Accounts and the device never see each other's rows.
    owner: String,
}
/// The study database's layout version (`PRAGMA user_version`).
pub const SCHEMA_VERSION: i64 = 4;
const SCHEMA_V2: &str = "
  CREATE TABLE IF NOT EXISTS preferences(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
  CREATE TABLE annotations_v2(owner TEXT NOT NULL DEFAULT '', volume TEXT NOT NULL, book TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
    highlight_color TEXT, underline_color TEXT, text_marks TEXT NOT NULL DEFAULT '[]', bookmarked INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL, dirty INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(owner,volume,book,chapter,verse));
  CREATE TABLE reading_v2(owner TEXT NOT NULL DEFAULT '', volume TEXT NOT NULL, book TEXT NOT NULL, chapter INTEGER NOT NULL,
    PRIMARY KEY(owner,volume,book,chapter));
  CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '', journal_date TEXT NOT NULL, source TEXT, reading_at INTEGER, created INTEGER NOT NULL,
    updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, remote_id TEXT, remote_revision INTEGER, dirty INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS notes_by_day ON notes(owner, journal_date);
  CREATE TABLE IF NOT EXISTS reading_log(id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', journal_date TEXT NOT NULL,
    source TEXT NOT NULL, read_at INTEGER NOT NULL, origin TEXT NOT NULL, created INTEGER NOT NULL, remote_id TEXT,
    deleted INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS reading_by_day ON reading_log(owner, journal_date);
";
/// Version 3: local change revisions (a counter that only grows, independent of the clock), which fields of a
/// verse or note changed, idempotency keys for creates, and chapter read state for accounts.
const SCHEMA_V3_COLUMNS: &[(&str, &str, &str)] = &[
    ("annotations", "rev", "INTEGER NOT NULL DEFAULT 0"),
    ("annotations", "marks_dirty", "INTEGER NOT NULL DEFAULT 0"),
    ("annotations", "note_dirty", "INTEGER NOT NULL DEFAULT 0"),
    ("reading", "dirty", "INTEGER NOT NULL DEFAULT 0"),
    ("reading", "deleted", "INTEGER NOT NULL DEFAULT 0"),
    ("reading", "rev", "INTEGER NOT NULL DEFAULT 0"),
    ("notes", "rev", "INTEGER NOT NULL DEFAULT 0"),
    ("notes", "body_dirty", "INTEGER NOT NULL DEFAULT 0"),
    ("notes", "meta_dirty", "INTEGER NOT NULL DEFAULT 0"),
    ("notes", "request_id", "TEXT"),
    ("notes", "attempted", "INTEGER NOT NULL DEFAULT 0"),
    ("notes", "remote_updated", "TEXT"),
    ("reading_log", "rev", "INTEGER NOT NULL DEFAULT 0"),
    ("reading_log", "attempted", "INTEGER NOT NULL DEFAULT 0"),
    ("reading_log", "request_id", "TEXT"),
];
const SCHEMA_V3: &str = "
  CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY, value INTEGER NOT NULL);
  UPDATE annotations SET marks_dirty=1, note_dirty=1 WHERE dirty=1 AND owner<>'';
  UPDATE annotations SET dirty=0 WHERE owner='';
  UPDATE notes SET body_dirty=1, meta_dirty=1 WHERE dirty=1 AND owner<>'';
  UPDATE notes SET request_id=id WHERE request_id IS NULL AND remote_id IS NULL;
  UPDATE reading_log SET request_id=id WHERE request_id IS NULL;
";
/// Version 4: marks and notes on study guide prose (the website's `guideHighlights`).
const SCHEMA_V4: &str = "
  CREATE TABLE IF NOT EXISTS guide_marks(owner TEXT NOT NULL DEFAULT '', guide TEXT NOT NULL, part TEXT NOT NULL,
    start_block TEXT NOT NULL, start_offset INTEGER NOT NULL, end_block TEXT NOT NULL, end_offset INTEGER NOT NULL,
    exact TEXT NOT NULL, prefix TEXT NOT NULL, suffix TEXT NOT NULL, highlight_color TEXT, underline_color TEXT,
    body TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL, dirty INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(owner, guide, part, start_block, start_offset, end_block, end_offset, exact));
";
fn columns(connection: &Connection, table: &str) -> Result<Vec<String>> {
    let mut stmt = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(error)?;
    stmt.query_map([], |r| r.get::<_, String>(1))
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
}
/// Brings a study database from any earlier build up to the current layout, in one transaction. Before changing a
/// database that holds study data, a snapshot is written beside it (`study-before-vN.sqlite`) and kept.
fn migrate(study: &mut Connection, directory: &Path) -> Result<()> {
    let version: i64 = study
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(error)?;
    if version >= SCHEMA_VERSION {
        return Ok(());
    }
    let old_annotations = columns(study, "annotations")?;
    let old_reading = columns(study, "reading")?;
    let has_data: bool = !old_annotations.is_empty()
        && study
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM annotations) OR EXISTS(SELECT 1 FROM reading)",
                [],
                |r| r.get(0),
            )
            .unwrap_or(true);
    let backup = directory.join(format!("study-before-v{SCHEMA_VERSION}.sqlite"));
    let earlier_backup = directory.join("study-before-v2.sqlite");
    if has_data && !backup.exists() && !(version < 2 && earlier_backup.exists()) {
        let path = if version < 2 {
            &earlier_backup
        } else {
            &backup
        };
        study
            .execute("VACUUM INTO ?1", [path.to_string_lossy()])
            .map_err(|e| format!("Could not back up study data before upgrading it: {e}"))?;
    }
    let tx = study.transaction().map_err(error)?;
    if version < 2 {
        tx.execute_batch(SCHEMA_V2).map_err(error)?;
        if old_annotations.iter().any(|c| c == "highlighted") {
            // The earlier single highlight was the website's yellow.
            tx.execute_batch(
                "INSERT INTO annotations_v2(owner,volume,book,chapter,verse,highlight_color,bookmarked,note,updated)
                   SELECT '',volume,book,chapter,verse,CASE WHEN highlighted THEN 'yellow' END,bookmarked,note,updated FROM annotations;
                 DROP TABLE annotations;",
            )
            .map_err(error)?;
        }
        if !old_reading.is_empty() {
            tx.execute_batch(
                "INSERT OR IGNORE INTO reading_v2(owner,volume,book,chapter) SELECT '',volume,book,chapter FROM reading;
                 DROP TABLE reading;",
            )
            .map_err(error)?;
        }
        tx.execute_batch(
            "ALTER TABLE annotations_v2 RENAME TO annotations; ALTER TABLE reading_v2 RENAME TO reading;",
        )
        .map_err(error)?;
    }
    if version < 3 {
        for (table, column, declaration) in SCHEMA_V3_COLUMNS {
            if !columns(&tx, table)?.iter().any(|c| c == column) {
                tx.execute_batch(&format!(
                    "ALTER TABLE {table} ADD COLUMN {column} {declaration};"
                ))
                .map_err(error)?;
            }
        }
        tx.execute_batch(SCHEMA_V3).map_err(error)?;
    }
    tx.execute_batch(SCHEMA_V4).map_err(error)?;
    tx.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(error)?;
    tx.commit().map_err(error)
}
/// The next local change revision. Revisions only grow (across every table and connection), so an
/// acknowledgement for what was sent can never be mistaken for a later edit, however quickly it was made.
fn next_rev(connection: &Connection) -> Result<i64> {
    connection
        .query_row(
            "INSERT INTO counters(name,value) VALUES('rev',1) ON CONFLICT(name) DO UPDATE SET value=value+1 RETURNING value",
            [],
            |r| r.get(0),
        )
        .map_err(error)
}
fn read_annotation(r: &rusqlite::Row<'_>, offset: usize) -> rusqlite::Result<Annotation> {
    let color = |i: usize| -> rusqlite::Result<Option<MarkColor>> {
        Ok(r.get::<_, Option<String>>(offset + i)?
            .and_then(|c| MarkColor::parse(&c)))
    };
    let marks: String = r.get(offset + 3)?;
    Ok(Annotation {
        verse: r.get(offset)?,
        marks: VerseMarks {
            highlight: color(1)?,
            underline: color(2)?,
            // Unreadable stored marks are dropped rather than failing the chapter.
            text_marks: serde_json::from_str::<Vec<TextMark>>(&marks).unwrap_or_default(),
        },
        bookmarked: r.get(offset + 4)?,
        note: r.get(offset + 5)?,
    })
}
const ANNOTATION_COLUMNS: &str = "verse,highlight_color,underline_color,text_marks,bookmarked,note";
fn read_note(r: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    let source: Option<String> = r.get(5)?;
    Ok(Note {
        id: r.get(0)?,
        title: r.get(1)?,
        body: r.get(2)?,
        journal_date: r.get(3)?,
        reading_at: r.get(4)?,
        source: source.and_then(|s| serde_json::from_str(&s).ok()),
        created: r.get(6)?,
        updated: r.get(7)?,
        rev: r.get(8)?,
    })
}
const NOTE_COLUMNS: &str = "id,title,body,journal_date,reading_at,source,created,updated,rev";
fn source_json(source: Option<&NoteSource>) -> Result<Option<String>> {
    source.map(serde_json::to_string).transpose().map_err(error)
}
fn read_reading(r: &rusqlite::Row<'_>) -> rusqlite::Result<Option<Reading>> {
    let source: String = r.get(2)?;
    Ok(serde_json::from_str(&source).ok().map(|source| Reading {
        id: r.get(0).unwrap_or_default(),
        journal_date: r.get(1).unwrap_or_default(),
        source,
        read_at: r.get(3).unwrap_or_default(),
        origin: r.get(4).unwrap_or_default(),
    }))
}
/// A marked or annotated span of a study guide's prose (`guideHighlights`).
#[derive(Debug, Clone, PartialEq)]
pub struct GuideMark {
    /// The lesson's week, `YYYY-MM-DD`.
    pub guide: String,
    /// "introduction" or "reader".
    pub part: String,
    pub anchor: crate::guide_text::Anchor,
    pub highlight: Option<MarkColor>,
    pub underline: Option<MarkColor>,
    pub body: String,
}
impl GuideMark {
    pub fn is_empty(&self) -> bool {
        self.highlight.is_none() && self.underline.is_none() && self.body.trim().is_empty()
    }
}
const GUIDE_COLUMNS: &str = "guide,part,start_block,start_offset,end_block,end_offset,exact,prefix,suffix,highlight_color,underline_color,body,updated";
fn read_guide_mark(r: &rusqlite::Row<'_>) -> rusqlite::Result<GuideMark> {
    let color = |i: usize| -> rusqlite::Result<Option<MarkColor>> {
        Ok(r.get::<_, Option<String>>(i)?
            .and_then(|c| MarkColor::parse(&c)))
    };
    Ok(GuideMark {
        guide: r.get(0)?,
        part: r.get(1)?,
        anchor: crate::guide_text::Anchor {
            start_block: r.get(2)?,
            start_offset: r.get::<_, i64>(3)? as usize,
            end_block: r.get(4)?,
            end_offset: r.get::<_, i64>(5)? as usize,
            exact: r.get(6)?,
            prefix: r.get(7)?,
            suffix: r.get(8)?,
        },
        highlight: color(9)?,
        underline: color(10)?,
        body: r.get(11)?,
    })
}
/// The website's verse note limit (`ANNOTATION_BODY_MAX`, counted after whitespace is collapsed).
pub const VERSE_NOTE_MAX: usize = 1200;
pub fn normalize_verse_note(note: &str) -> String {
    note.split_whitespace().collect::<Vec<_>>().join(" ")
}

impl Store {
    pub fn open(directory: &Path) -> Result<Self> {
        fs::create_dir_all(directory).map_err(error)?;
        let scripture_path =
            directory.join(concat!("scriptures-", env!("VERSE_DATA_HASH"), ".sqlite"));
        if !scripture_path.exists() {
            let temp = directory.join(format!("scriptures-{}.tmp", std::process::id()));
            fs::write(
                &temp,
                include_bytes!(concat!(env!("OUT_DIR"), "/scriptures.sqlite")),
            )
            .map_err(error)?;
            fs::rename(&temp, &scripture_path).map_err(error)?;
        }
        let scripture =
            Connection::open_with_flags(&scripture_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(error)?;
        let mut study = Connection::open(directory.join("study.sqlite")).map_err(error)?;
        study.busy_timeout(Duration::from_secs(10)).map_err(error)?;
        study
            .execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")
            .map_err(error)?;
        migrate(&mut study, directory)?;
        Ok(Self {
            scripture_path,
            scripture,
            study,
            owner: String::new(),
        })
    }
    /// Switches whose study is shown: "" for this device's own, or an account id.
    pub fn set_owner(&mut self, owner: &str) {
        self.owner = owner.to_string();
    }
    #[cfg(test)]
    pub fn owner(&self) -> &str {
        &self.owner
    }
    fn is_account(&self) -> bool {
        !self.owner.is_empty()
    }
    pub fn books(&self) -> Result<Vec<Book>> {
        Self::books_from(&self.scripture)
    }
    fn books_from(connection: &Connection) -> Result<Vec<Book>> {
        let mut stmt = connection.prepare("SELECT volume,volume_title,book,label,short_title,chapters FROM books ORDER BY position").map_err(error)?;
        stmt.query_map([], |r| {
            Ok(Book {
                volume: r.get(0)?,
                volume_title: r.get(1)?,
                id: r.get(2)?,
                label: r.get(3)?,
                short_title: r.get(4)?,
                chapters: r.get(5)?,
            })
        })
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    pub fn chapter(&self, location: &Location) -> Result<Vec<Verse>> {
        let mut stmt = self.scripture.prepare_cached("SELECT verse,text FROM verses WHERE volume=?1 AND book=?2 AND chapter=?3 ORDER BY verse").map_err(error)?;
        stmt.query_map(
            params![location.volume, location.book, location.chapter],
            |r| {
                Ok(Verse {
                    number: r.get(0)?,
                    text: r.get(1)?,
                })
            },
        )
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    pub fn preferences(&self) -> Result<Preferences> {
        match self
            .study
            .query_row("SELECT json FROM preferences WHERE id=1", [], |r| {
                r.get::<_, String>(0)
            }) {
            Ok(json) => serde_json::from_str(&json).map_err(error),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Preferences::default()),
            Err(e) => Err(error(e)),
        }
    }
    pub fn save_preferences(&self, p: &Preferences) -> Result<()> {
        self.study.execute("INSERT INTO preferences VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET json=excluded.json", [serde_json::to_string(p).map_err(error)?]).map_err(error)?;
        Ok(())
    }
    pub fn annotations(&self, l: &Location) -> Result<Vec<Annotation>> {
        let mut stmt = self.study.prepare_cached(&format!("SELECT {ANNOTATION_COLUMNS} FROM annotations WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 ORDER BY verse")).map_err(error)?;
        stmt.query_map(params![self.owner, l.volume, l.book, l.chapter], |r| {
            read_annotation(r, 0)
        })
        .map_err(error)?
        .filter(|a| a.as_ref().map_or(true, |a| !a.is_empty()))
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    pub fn save_annotation(&mut self, l: &Location, a: &Annotation) -> Result<()> {
        let transaction = self.study.transaction().map_err(error)?;
        Self::write_annotation(&transaction, &self.owner, l, a)?;
        transaction.commit().map_err(error)
    }
    pub fn save_annotations(&mut self, l: &Location, annotations: &[Annotation]) -> Result<()> {
        let transaction = self.study.transaction().map_err(error)?;
        for annotation in annotations {
            Self::write_annotation(&transaction, &self.owner, l, annotation)?;
        }
        transaction.commit().map_err(error)
    }
    fn write_annotation(
        connection: &Connection,
        owner: &str,
        l: &Location,
        a: &Annotation,
    ) -> Result<()> {
        if normalize_verse_note(&a.note).chars().count() > VERSE_NOTE_MAX {
            return Err(format!(
                "Keep a verse note to {VERSE_NOTE_MAX} characters (as on the website)."
            ));
        }
        let key = params![owner, l.volume, l.book, l.chapter, a.verse];
        let existing = match connection.query_row(&format!("SELECT {ANNOTATION_COLUMNS} FROM annotations WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 AND verse=?5"), key, |r| read_annotation(r, 0)) {
            Ok(row) => Some(row),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(error(e)),
        };
        let before = existing.clone().unwrap_or(Annotation {
            verse: a.verse,
            ..Default::default()
        });
        let marks_changed = before.marks != a.marks;
        let note_changed = before.note != a.note;
        if !marks_changed && !note_changed && before.bookmarked == a.bookmarked {
            return Ok(());
        }
        let account = !owner.is_empty();
        // Bookmarks are this app's own: changing one alone never queues anything for the account.
        let (marks_dirty, note_dirty) = if account {
            (marks_changed, note_changed)
        } else {
            (false, false)
        };
        if a.is_empty() && !account {
            connection.execute("DELETE FROM annotations WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 AND verse=?5", key).map_err(error)?;
            return Ok(());
        }
        // An account's removal is kept as an empty row with its change queued until the server has removed it too.
        let rev = next_rev(connection)?;
        let marks = serde_json::to_string(&a.marks.text_marks).map_err(error)?;
        connection.execute("INSERT INTO annotations(owner,volume,book,chapter,verse,highlight_color,underline_color,text_marks,bookmarked,note,updated,dirty,rev,marks_dirty,note_dirty)
            VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12|?13,?14,?12,?13)
            ON CONFLICT(owner,volume,book,chapter,verse) DO UPDATE SET highlight_color=excluded.highlight_color,underline_color=excluded.underline_color,
              text_marks=excluded.text_marks,bookmarked=excluded.bookmarked,note=excluded.note,updated=excluded.updated,rev=excluded.rev,
              marks_dirty=marks_dirty|excluded.marks_dirty,note_dirty=note_dirty|excluded.note_dirty,
              dirty=marks_dirty|excluded.marks_dirty|note_dirty|excluded.note_dirty",
            params![owner,l.volume,l.book,l.chapter,a.verse,a.marks.highlight.as_ref().map(|c| c.as_str()),a.marks.underline.as_ref().map(|c| c.as_str()),marks,a.bookmarked,a.note,now(),marks_dirty,note_dirty,rev]).map_err(error)?;
        Ok(())
    }
    /// Verses with a note updated within `[from, to)` (seconds since the epoch), for the journal's days.
    pub fn verse_notes_between(&self, from: i64, to: i64) -> Result<Vec<StudyEntry>> {
        self.study_entries("note<>'' AND updated>=?2 AND updated<?3", [from, to])
    }
    /// Every verse with a note (for copying this computer's study into an account).
    pub fn all_verse_annotations(&self) -> Result<Vec<(Location, Annotation)>> {
        let mut stmt = self.study.prepare(&format!("SELECT volume,book,chapter,{ANNOTATION_COLUMNS} FROM annotations WHERE owner=?1 ORDER BY volume,book,chapter,verse")).map_err(error)?;
        stmt.query_map([&self.owner], |r| {
            Ok((
                Location {
                    volume: r.get(0)?,
                    book: r.get(1)?,
                    chapter: r.get(2)?,
                },
                read_annotation(r, 3)?,
            ))
        })
        .map_err(error)?
        .filter(|row| {
            row.as_ref()
                .map_or(true, |(_, a)| !a.note.trim().is_empty() || a.is_marked())
        })
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    fn study_entries<const N: usize>(
        &self,
        filter: &str,
        extra: [i64; N],
    ) -> Result<Vec<StudyEntry>> {
        let mut stmt = self.study.prepare(&format!("SELECT volume,book,chapter,{ANNOTATION_COLUMNS},updated FROM annotations WHERE owner=?1 AND {filter} ORDER BY updated DESC,verse LIMIT 1000")).map_err(error)?;
        let mut args: Vec<&dyn rusqlite::ToSql> = vec![&self.owner];
        for value in &extra {
            args.push(value);
        }
        let items = stmt
            .query_map(args.as_slice(), |r| {
                Ok((
                    Location {
                        volume: r.get(0)?,
                        book: r.get(1)?,
                        chapter: r.get(2)?,
                    },
                    read_annotation(r, 3)?,
                    r.get::<_, i64>(9)?,
                ))
            })
            .map_err(error)?;
        let books = self.books()?;
        let mut entries = Vec::new();
        for item in items {
            let (location, a, updated) = item.map_err(error)?;
            let label = books
                .iter()
                .find(|b| b.volume == location.volume && b.id == location.book)
                .map(|b| b.label.as_str())
                .unwrap_or(&location.book);
            entries.push(StudyEntry {
                reference: format!("{label} {}:{}", location.chapter, a.verse),
                location,
                verse: a.verse,
                note: a.note,
                updated,
            });
        }
        Ok(entries)
    }
    pub fn is_read(&self, l: &Location) -> Result<bool> {
        self.study
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM reading WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 AND deleted=0)",
                params![self.owner, l.volume, l.book, l.chapter],
                |r| r.get(0),
            )
            .map_err(error)
    }
    /// The chapters of a book marked read.
    #[cfg(test)]
    pub fn read_chapters(&self, volume: &str, book: &str) -> Result<Vec<u32>> {
        let mut stmt = self.study.prepare_cached("SELECT chapter FROM reading WHERE owner=?1 AND volume=?2 AND book=?3 AND deleted=0 ORDER BY chapter").map_err(error)?;
        stmt.query_map(params![self.owner, volume, book], |r| r.get(0))
            .map_err(error)?
            .collect::<std::result::Result<_, _>>()
            .map_err(error)
    }
    /// Marks a chapter read or unread. Marking it read also logs today's reading in the journal (as the website's
    /// chapter mark does). Marking it unread again takes back that day's mark here on the device; an account keeps
    /// its reading history, as the website does, unless the mark was never sent.
    pub fn set_read(&mut self, l: &Location, source: &NoteSource, read: bool) -> Result<()> {
        let today = today();
        let account = self.is_account();
        let tx = self.study.transaction().map_err(error)?;
        let rev = next_rev(&tx)?;
        if read {
            tx.execute(
                "INSERT INTO reading(owner,volume,book,chapter,dirty,deleted,rev) VALUES(?1,?2,?3,?4,?5,0,?6)
                 ON CONFLICT(owner,volume,book,chapter) DO UPDATE SET deleted=0, dirty=excluded.dirty|dirty, rev=excluded.rev",
                params![self.owner, l.volume, l.book, l.chapter, account, rev],
            )
            .map_err(error)?;
            let logged: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM reading_log WHERE owner=?1 AND journal_date=?2 AND origin='chapter_mark' AND deleted=0 AND json_extract(source,'$.href')=?3)", params![self.owner, today, source.href], |r| r.get(0)).map_err(error)?;
            if !logged {
                let id = new_id();
                tx.execute("INSERT INTO reading_log(id,owner,journal_date,source,read_at,origin,created,dirty,rev,request_id) VALUES(?1,?2,?3,?4,?5,'chapter_mark',?5,?6,?7,?1)",
                    params![id, self.owner, today, serde_json::to_string(source).map_err(error)?, now(), account, rev]).map_err(error)?;
            }
        } else if account {
            tx.execute(
                "UPDATE reading SET deleted=1, dirty=1, rev=?5 WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4",
                params![self.owner, l.volume, l.book, l.chapter, rev],
            )
            .map_err(error)?;
            tx.execute("DELETE FROM reading_log WHERE owner=?1 AND journal_date=?2 AND origin='chapter_mark' AND attempted=0 AND remote_id IS NULL AND json_extract(source,'$.href')=?3",
                params![self.owner, today, source.href]).map_err(error)?;
        } else {
            tx.execute(
                "DELETE FROM reading WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4",
                params![self.owner, l.volume, l.book, l.chapter],
            )
            .map_err(error)?;
            tx.execute("UPDATE reading_log SET deleted=1 WHERE owner=?1 AND journal_date=?2 AND origin='chapter_mark' AND json_extract(source,'$.href')=?3",
                params![self.owner, today, source.href]).map_err(error)?;
        }
        tx.commit().map_err(error)
    }
    /// Journal notes of the days `from..=to` (`YYYY-MM-DD`), newest first.
    pub fn notes_between(&self, from: &str, to: &str) -> Result<Vec<Note>> {
        let mut stmt = self.study.prepare_cached(&format!("SELECT {NOTE_COLUMNS} FROM notes WHERE owner=?1 AND deleted=0 AND journal_date>=?2 AND journal_date<=?3 ORDER BY journal_date DESC, updated DESC")).map_err(error)?;
        stmt.query_map(params![self.owner, from, to], read_note)
            .map_err(error)?
            .collect::<std::result::Result<_, _>>()
            .map_err(error)
    }
    /// Every journal note, newest first (for searching and revisiting).
    pub fn all_notes(&self) -> Result<Vec<Note>> {
        self.notes_between("0000-00-00", "9999-99-99")
    }
    pub fn note(&self, id: &str) -> Result<Option<Note>> {
        match self.study.query_row(
            &format!("SELECT {NOTE_COLUMNS} FROM notes WHERE owner=?1 AND id=?2 AND deleted=0"),
            params![self.owner, id],
            read_note,
        ) {
            Ok(n) => Ok(Some(n)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(error(e)),
        }
    }
    /// Saves a note from an editor that loaded it at `note.rev`. If the stored note changed since (a sync brought
    /// an edit made elsewhere), that edit is kept and this text is saved as a separate note on the same day.
    pub fn save_note(&mut self, note: &Note) -> Result<NoteSaved> {
        if note.title.chars().count() > NOTE_TITLE_MAX {
            return Err(format!("Keep the title to {NOTE_TITLE_MAX} characters."));
        }
        if note.body.len() > NOTE_MARKDOWN_MAX {
            return Err("This note is too long to save.".into());
        }
        let account = self.is_account();
        let source = source_json(note.source.as_ref())?;
        let title = note.title.trim().to_string();
        let tx = self.study.transaction().map_err(error)?;
        let existing = match tx.query_row(
            &format!("SELECT {NOTE_COLUMNS},deleted FROM notes WHERE owner=?1 AND id=?2"),
            params![self.owner, note.id],
            |r| Ok((read_note(r)?, r.get::<_, bool>(9)?)),
        ) {
            Ok(row) => Some(row),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(error(e)),
        };
        // Another owner's row with this id is never touched.
        let taken = existing.is_none()
            && tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM notes WHERE id=?1)",
                    [&note.id],
                    |r| r.get::<_, bool>(0),
                )
                .map_err(error)?;
        let rev = next_rev(&tx)?;
        let stale = existing
            .as_ref()
            .is_some_and(|(stored, deleted)| *deleted || stored.rev != note.rev);
        let saved = if taken || stale {
            let id = new_id();
            tx.execute("INSERT INTO notes(id,owner,title,body,journal_date,source,reading_at,created,updated,dirty,rev,body_dirty,meta_dirty,request_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8,?9,?10,?9,?9,?11)",
                params![id, self.owner, title, note.body, note.journal_date, source, note.reading_at, now(), account, rev, new_id()]).map_err(error)?;
            NoteSaved {
                id,
                rev,
                forked: existing.is_some() || taken,
            }
        } else if let Some((stored, _)) = &existing {
            let body = stored.title != title || stored.body != note.body;
            let meta = stored.journal_date != note.journal_date
                || stored.source != note.source
                || stored.reading_at != note.reading_at;
            if !body && !meta {
                return Ok(NoteSaved {
                    id: note.id.clone(),
                    rev: stored.rev,
                    forked: false,
                });
            }
            tx.execute("UPDATE notes SET title=?3, body=?4, journal_date=?5, source=?6, reading_at=?7, updated=?8, rev=?9,
                    body_dirty=body_dirty|?10, meta_dirty=meta_dirty|?11, dirty=dirty|?10|?11 WHERE owner=?1 AND id=?2",
                params![self.owner, note.id, title, note.body, note.journal_date, source, note.reading_at, now(), rev, account && body, account && meta]).map_err(error)?;
            NoteSaved {
                id: note.id.clone(),
                rev,
                forked: false,
            }
        } else {
            tx.execute("INSERT INTO notes(id,owner,title,body,journal_date,source,reading_at,created,updated,dirty,rev,body_dirty,meta_dirty,request_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?10,?10,?12)",
                params![note.id, self.owner, title, note.body, note.journal_date, source, note.reading_at, note.created, now(), account, rev, new_id()]).map_err(error)?;
            NoteSaved {
                id: note.id.clone(),
                rev,
                forked: false,
            }
        };
        tx.commit().map_err(error)?;
        Ok(saved)
    }
    pub fn delete_note(&mut self, id: &str) -> Result<()> {
        let account = self.is_account();
        let tx = self.study.transaction().map_err(error)?;
        let rev = next_rev(&tx)?;
        tx.execute(
            "UPDATE notes SET deleted=1, dirty=?4, updated=?3, rev=?5 WHERE owner=?1 AND id=?2",
            params![self.owner, id, now(), account, rev],
        )
        .map_err(error)?;
        if !account {
            tx.execute(
                "DELETE FROM notes WHERE owner=?1 AND id=?2",
                params![self.owner, id],
            )
            .map_err(error)?;
        }
        tx.commit().map_err(error)
    }
    pub fn readings_between(&self, from: &str, to: &str) -> Result<Vec<Reading>> {
        let mut stmt = self.study.prepare_cached("SELECT id,journal_date,source,read_at,origin FROM reading_log WHERE owner=?1 AND deleted=0 AND journal_date>=?2 AND journal_date<=?3 ORDER BY read_at DESC").map_err(error)?;
        let rows = stmt
            .query_map(params![self.owner, from, to], read_reading)
            .map_err(error)?;
        let mut out = Vec::new();
        for row in rows {
            if let Some(reading) = row.map_err(error)? {
                out.push(reading);
            }
        }
        Ok(out)
    }
    /// Logs a reading by hand (the Log button on a lesson or the journal).
    pub fn log_reading(&mut self, journal_date: &str, source: &NoteSource) -> Result<()> {
        let account = self.is_account();
        let tx = self.study.transaction().map_err(error)?;
        let rev = next_rev(&tx)?;
        let id = new_id();
        tx.execute("INSERT INTO reading_log(id,owner,journal_date,source,read_at,origin,created,dirty,rev,request_id) VALUES(?1,?2,?3,?4,?5,'manual',?5,?6,?7,?1)",
            params![id, self.owner, journal_date, serde_json::to_string(source).map_err(error)?, now(), account, rev]).map_err(error)?;
        tx.commit().map_err(error)
    }
    pub fn delete_reading(&mut self, id: &str) -> Result<()> {
        let account = self.is_account();
        let tx = self.study.transaction().map_err(error)?;
        let rev = next_rev(&tx)?;
        if account {
            // Never sent: nothing to take back on the server.
            tx.execute("DELETE FROM reading_log WHERE owner=?1 AND id=?2 AND attempted=0 AND remote_id IS NULL", params![self.owner, id]).map_err(error)?;
        }
        tx.execute(
            "UPDATE reading_log SET deleted=1, dirty=?3, rev=?4 WHERE owner=?1 AND id=?2",
            params![self.owner, id, account, rev],
        )
        .map_err(error)?;
        tx.commit().map_err(error)
    }
    /// Removes everything cached for an account on this computer (its device study is never touched).
    pub fn forget_owner(&mut self, owner: &str) -> Result<()> {
        if owner.is_empty() {
            return Err("This device's own study can't be removed this way.".into());
        }
        let tx = self.study.transaction().map_err(error)?;
        for table in [
            "annotations",
            "reading",
            "notes",
            "reading_log",
            "guide_marks",
        ] {
            tx.execute(&format!("DELETE FROM {table} WHERE owner=?1"), [owner])
                .map_err(error)?;
        }
        tx.commit().map_err(error)
    }

    // ---- Account sync. Each queue reads changed rows with the revision they were read at; acknowledging a
    // ---- revision cleans the row only if nothing changed since, so a later edit is always sent too.

    /// The signed-in account's verse annotations changed here and not yet sent (an empty one is a removal).
    pub fn dirty_annotations(&self, limit: usize) -> Result<Vec<DirtyAnnotation>> {
        let mut stmt = self.study.prepare(&format!("SELECT volume,book,chapter,{ANNOTATION_COLUMNS},rev,marks_dirty,note_dirty FROM annotations WHERE owner=?1 AND dirty=1 ORDER BY rev LIMIT ?2")).map_err(error)?;
        stmt.query_map(params![self.owner, limit as i64], |r| {
            Ok(DirtyAnnotation {
                location: Location {
                    volume: r.get(0)?,
                    book: r.get(1)?,
                    chapter: r.get(2)?,
                },
                annotation: read_annotation(r, 3)?,
                rev: r.get(9)?,
                marks: r.get(10)?,
                note: r.get(11)?,
            })
        })
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    /// The server confirmed the annotation as it was at `rev`.
    pub fn annotation_synced(&mut self, l: &Location, verse: u32, rev: i64) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        tx.execute("UPDATE annotations SET dirty=0, marks_dirty=0, note_dirty=0 WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 AND verse=?5 AND rev=?6", params![self.owner,l.volume,l.book,l.chapter,verse,rev]).map_err(error)?;
        tx.execute("DELETE FROM annotations WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 AND verse=?5 AND dirty=0 AND note='' AND highlight_color IS NULL AND underline_color IS NULL AND text_marks='[]' AND bookmarked=0", params![self.owner,l.volume,l.book,l.chapter,verse]).map_err(error)?;
        tx.commit().map_err(error)
    }
    /// Takes the server's annotations for a chapter. A verse's fields changed here and not yet sent are kept;
    /// its other fields still follow the server. Bookmarks are this app's own and are kept.
    pub fn apply_remote_chapter(&mut self, l: &Location, remote: &[Annotation]) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        let local: Vec<(Annotation, bool, bool)> = {
            let mut stmt = tx.prepare(&format!("SELECT {ANNOTATION_COLUMNS},marks_dirty,note_dirty FROM annotations WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4")).map_err(error)?;
            stmt.query_map(params![self.owner, l.volume, l.book, l.chapter], |r| {
                Ok((read_annotation(r, 0)?, r.get(6)?, r.get(7)?))
            })
            .map_err(error)?
            .collect::<std::result::Result<_, _>>()
            .map_err(error)?
        };
        let mut verses: Vec<u32> = local
            .iter()
            .map(|(a, _, _)| a.verse)
            .chain(remote.iter().map(|a| a.verse))
            .collect();
        verses.sort_unstable();
        verses.dedup();
        for verse in verses {
            let here = local.iter().find(|(a, _, _)| a.verse == verse);
            let there = remote.iter().find(|a| a.verse == verse);
            let (marks_dirty, note_dirty) = here.map(|(_, m, n)| (*m, *n)).unwrap_or_default();
            let current = here.map(|(a, _, _)| a.clone()).unwrap_or(Annotation {
                verse,
                ..Default::default()
            });
            let mut next = current.clone();
            if !marks_dirty {
                next.marks = there.map(|a| a.marks.clone()).unwrap_or_default();
            }
            if !note_dirty {
                next.note = there.map(|a| a.note.clone()).unwrap_or_default();
            }
            if next == current {
                continue;
            }
            let key = params![self.owner, l.volume, l.book, l.chapter, verse];
            if next.is_empty() && !marks_dirty && !note_dirty {
                tx.execute("DELETE FROM annotations WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 AND verse=?5", key).map_err(error)?;
                continue;
            }
            let rev = next_rev(&tx)?;
            let marks = serde_json::to_string(&next.marks.text_marks).map_err(error)?;
            tx.execute("INSERT INTO annotations(owner,volume,book,chapter,verse,highlight_color,underline_color,text_marks,bookmarked,note,updated,dirty,rev) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,0,?12)
                ON CONFLICT(owner,volume,book,chapter,verse) DO UPDATE SET highlight_color=excluded.highlight_color,underline_color=excluded.underline_color,text_marks=excluded.text_marks,note=excluded.note,rev=excluded.rev",
                params![self.owner,l.volume,l.book,l.chapter,verse,next.marks.highlight.as_ref().map(|c| c.as_str()),next.marks.underline.as_ref().map(|c| c.as_str()),marks,next.bookmarked,next.note,now(),rev]).map_err(error)?;
        }
        tx.commit().map_err(error)
    }
    /// Notes changed here and not yet sent.
    pub fn dirty_notes(&self, limit: usize) -> Result<Vec<DirtyNote>> {
        let mut stmt = self.study.prepare(&format!("SELECT {NOTE_COLUMNS},deleted,remote_id,remote_revision,COALESCE(request_id,id),attempted,body_dirty,meta_dirty FROM notes WHERE owner=?1 AND dirty=1 ORDER BY rev LIMIT ?2")).map_err(error)?;
        stmt.query_map(params![self.owner, limit as i64], |r| {
            Ok(DirtyNote {
                note: read_note(r)?,
                deleted: r.get(9)?,
                remote_id: r.get(10)?,
                remote_revision: r.get(11)?,
                request_id: r.get(12)?,
                attempted: r.get(13)?,
                body: r.get(14)?,
                meta: r.get(15)?,
            })
        })
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    /// Records that a note's create is about to be sent (its reply may be lost; a retry reuses the request id).
    pub fn note_attempted(&mut self, id: &str) -> Result<()> {
        self.study
            .execute(
                "UPDATE notes SET attempted=1 WHERE owner=?1 AND id=?2",
                params![self.owner, id],
            )
            .map_err(error)?;
        Ok(())
    }
    /// The server holds the note as it was at `rev`: its id and Markdown revision. A note changed again since
    /// stays queued, now based on that revision.
    pub fn note_synced(
        &mut self,
        id: &str,
        rev: i64,
        remote_id: &str,
        revision: i64,
        remote_updated: Option<&str>,
    ) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        tx.execute("UPDATE notes SET remote_id=?3, remote_revision=?4, remote_updated=COALESCE(?6,remote_updated),
                dirty=CASE WHEN rev=?5 THEN 0 ELSE dirty END, body_dirty=CASE WHEN rev=?5 THEN 0 ELSE body_dirty END,
                meta_dirty=CASE WHEN rev=?5 THEN 0 ELSE meta_dirty END WHERE owner=?1 AND id=?2",
            params![self.owner, id, remote_id, revision, rev, remote_updated]).map_err(error)?;
        tx.execute(
            "DELETE FROM notes WHERE owner=?1 AND id=?2 AND deleted=1 AND dirty=0",
            params![self.owner, id],
        )
        .map_err(error)?;
        tx.commit().map_err(error)
    }
    /// A removed note the server no longer has (or never had): forget it here.
    pub fn note_gone(&mut self, id: &str, rev: i64) -> Result<()> {
        self.study
            .execute(
                "DELETE FROM notes WHERE owner=?1 AND id=?2 AND deleted=1 AND rev=?3",
                params![self.owner, id, rev],
            )
            .map_err(error)?;
        Ok(())
    }
    /// The account's copy changed (or was deleted) since this text was based on it. This copy is detached and
    /// queued to be created as its own entry; the account's version arrives with the next pull. Both are kept.
    pub fn note_conflict(&mut self, id: &str) -> Result<()> {
        self.study.execute("UPDATE notes SET remote_id=NULL, remote_revision=NULL, remote_updated=NULL, request_id=?3, attempted=0, dirty=1, body_dirty=1, meta_dirty=1 WHERE owner=?1 AND id=?2",
            params![self.owner, id, new_id()]).map_err(error)?;
        Ok(())
    }
    /// The server's ids, revisions and change times of notes already here, and whether each has unsent changes.
    pub fn remote_notes(&self) -> Result<Vec<KnownNote>> {
        let mut stmt = self.study.prepare("SELECT id,remote_id,COALESCE(remote_revision,0),remote_updated,dirty FROM notes WHERE owner=?1 AND remote_id IS NOT NULL").map_err(error)?;
        stmt.query_map([&self.owner], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    /// Stores the account's copy of a note. Fields changed here and not yet sent are kept (the text keeps its base
    /// revision, so sending it later detects the conflict); every other field follows the server, metadata included.
    pub fn apply_remote_note(&mut self, remote: &RemoteNote) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        let existing = match tx.query_row(
            &format!("SELECT {NOTE_COLUMNS},body_dirty,meta_dirty,COALESCE(remote_revision,0),deleted FROM notes WHERE owner=?1 AND remote_id=?2"),
            params![self.owner, remote.remote_id],
            |r| Ok((read_note(r)?, r.get::<_, bool>(9)?, r.get::<_, bool>(10)?, r.get::<_, i64>(11)?, r.get::<_, bool>(12)?)),
        ) {
            Ok(row) => Some(row),
            Err(rusqlite::Error::QueryReturnedNoRows) => None,
            Err(e) => return Err(error(e)),
        };
        let source = source_json(remote.source.as_ref())?;
        match existing {
            Some((_, _, _, _, true)) => {}
            Some((stored, body_dirty, meta_dirty, base, false)) => {
                let mut next = stored.clone();
                let mut revision = base;
                if !body_dirty && let Some((title, body)) = &remote.text {
                    next.title = title.clone();
                    next.body = body.clone();
                    revision = remote.revision;
                }
                if !meta_dirty {
                    next.journal_date = remote.journal_date.clone();
                    next.source = remote.source.clone();
                    next.reading_at = remote.reading_at;
                }
                let changed = next != stored;
                let rev = if changed { next_rev(&tx)? } else { stored.rev };
                tx.execute("UPDATE notes SET title=?3,body=?4,journal_date=?5,source=?6,reading_at=?7,updated=CASE WHEN ?11 THEN ?8 ELSE updated END,remote_revision=?9,remote_updated=?10,rev=?12 WHERE owner=?1 AND id=?2",
                    params![self.owner, stored.id, next.title, next.body, next.journal_date, source_json(next.source.as_ref())?, next.reading_at, remote.updated, revision, remote.updated_at, changed, rev]).map_err(error)?;
            }
            None => {
                let (title, body) = remote.text.clone().unwrap_or_default();
                let rev = next_rev(&tx)?;
                tx.execute("INSERT INTO notes(id,owner,title,body,journal_date,source,reading_at,created,updated,remote_id,remote_revision,remote_updated,dirty,rev) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,0,?13)",
                    params![new_id(), self.owner, title, body, remote.journal_date, source, remote.reading_at, remote.created, remote.updated, remote.remote_id, remote.revision, remote.updated_at, rev]).map_err(error)?;
            }
        }
        tx.commit().map_err(error)
    }
    /// Removes notes deleted on the server (those not listed any more), unless changed here since.
    pub fn retain_remote_notes(&mut self, listed: &[String]) -> Result<()> {
        for (id, remote, _, _, dirty) in self.remote_notes()? {
            if !dirty && !listed.contains(&remote) {
                self.study
                    .execute(
                        "DELETE FROM notes WHERE owner=?1 AND id=?2",
                        params![self.owner, id],
                    )
                    .map_err(error)?;
            }
        }
        Ok(())
    }
    /// Readings logged or removed here and not yet sent.
    pub fn dirty_readings(&self, limit: usize) -> Result<Vec<DirtyReading>> {
        let mut stmt = self.study.prepare("SELECT id,journal_date,source,read_at,origin,deleted,remote_id,attempted,rev FROM reading_log WHERE owner=?1 AND dirty=1 ORDER BY rev LIMIT ?2").map_err(error)?;
        let rows = stmt
            .query_map(params![self.owner, limit as i64], |r| {
                Ok(
                    read_reading(r)?.map(|reading| -> rusqlite::Result<DirtyReading> {
                        Ok(DirtyReading {
                            reading,
                            deleted: r.get(5)?,
                            remote_id: r.get(6)?,
                            attempted: r.get(7)?,
                            rev: r.get(8)?,
                        })
                    }),
                )
            })
            .map_err(error)?;
        let mut out = Vec::new();
        for row in rows {
            if let Some(row) = row.map_err(error)? {
                out.push(row.map_err(error)?);
            }
        }
        Ok(out)
    }
    pub fn reading_attempted(&mut self, id: &str) -> Result<()> {
        self.study
            .execute(
                "UPDATE reading_log SET attempted=1 WHERE owner=?1 AND id=?2",
                params![self.owner, id],
            )
            .map_err(error)?;
        Ok(())
    }
    /// The server confirmed the reading as it was at `rev` (with its id once known).
    pub fn reading_synced(&mut self, id: &str, rev: i64, remote_id: Option<&str>) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        tx.execute(
            "UPDATE reading_log SET remote_id=COALESCE(?4,remote_id), dirty=CASE WHEN rev=?3 THEN 0 ELSE dirty END WHERE owner=?1 AND id=?2",
            params![self.owner, id, rev, remote_id],
        )
        .map_err(error)?;
        tx.execute(
            "DELETE FROM reading_log WHERE owner=?1 AND id=?2 AND deleted=1 AND dirty=0",
            params![self.owner, id],
        )
        .map_err(error)?;
        tx.commit().map_err(error)
    }
    /// Takes the account's reading history: new readings are added, readings removed there are removed here, and
    /// readings with unsent changes here are left alone.
    pub fn apply_remote_readings(&mut self, remote: &[RemoteReading]) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        for reading in remote {
            let source = serde_json::to_string(&reading.source).map_err(error)?;
            let updated = tx.execute("UPDATE reading_log SET remote_id=?2 WHERE owner=?1 AND remote_id IS NULL AND (id=?3 OR request_id=?3)",
                params![self.owner, reading.remote_id, reading.request_id]).map_err(error)?;
            let known: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM reading_log WHERE owner=?1 AND remote_id=?2)",
                    params![self.owner, reading.remote_id],
                    |r| r.get(0),
                )
                .map_err(error)?;
            if updated == 0 && known {
                tx.execute("UPDATE reading_log SET journal_date=?3, source=?4, read_at=?5, origin=?6 WHERE owner=?1 AND remote_id=?2 AND dirty=0",
                    params![self.owner, reading.remote_id, reading.journal_date, source, reading.read_at, reading.origin]).map_err(error)?;
            } else if !known {
                let rev = next_rev(&tx)?;
                tx.execute("INSERT INTO reading_log(id,owner,journal_date,source,read_at,origin,created,remote_id,request_id,dirty,rev) VALUES(?1,?2,?3,?4,?5,?6,?5,?7,?8,0,?9)",
                    params![new_id(), self.owner, reading.journal_date, source, reading.read_at, reading.origin, reading.remote_id, reading.request_id, rev]).map_err(error)?;
            }
        }
        let listed: Vec<&str> = remote.iter().map(|r| r.remote_id.as_str()).collect();
        let known: Vec<(String, String)> = {
            let mut stmt = tx.prepare("SELECT id,remote_id FROM reading_log WHERE owner=?1 AND remote_id IS NOT NULL AND dirty=0").map_err(error)?;
            stmt.query_map([&self.owner], |r| Ok((r.get(0)?, r.get(1)?)))
                .map_err(error)?
                .collect::<std::result::Result<_, _>>()
                .map_err(error)?
        };
        for (id, remote_id) in known {
            if !listed.contains(&remote_id.as_str()) {
                tx.execute(
                    "DELETE FROM reading_log WHERE owner=?1 AND id=?2",
                    params![self.owner, id],
                )
                .map_err(error)?;
            }
        }
        tx.commit().map_err(error)
    }
    /// Chapters marked read or unread here and not yet sent.
    pub fn dirty_chapters(&self, limit: usize) -> Result<Vec<DirtyChapter>> {
        let mut stmt = self.study.prepare("SELECT volume,book,chapter,deleted,rev FROM reading WHERE owner=?1 AND dirty=1 ORDER BY rev LIMIT ?2").map_err(error)?;
        stmt.query_map(params![self.owner, limit as i64], |r| {
            Ok(DirtyChapter {
                location: Location {
                    volume: r.get(0)?,
                    book: r.get(1)?,
                    chapter: r.get(2)?,
                },
                read: !r.get::<_, bool>(3)?,
                rev: r.get(4)?,
            })
        })
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    pub fn chapter_synced(&mut self, l: &Location, rev: i64) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        tx.execute("UPDATE reading SET dirty=0 WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 AND rev=?5", params![self.owner, l.volume, l.book, l.chapter, rev]).map_err(error)?;
        tx.execute("DELETE FROM reading WHERE owner=?1 AND volume=?2 AND book=?3 AND chapter=?4 AND deleted=1 AND dirty=0", params![self.owner, l.volume, l.book, l.chapter]).map_err(error)?;
        tx.commit().map_err(error)
    }
    /// Takes the account's read chapters of a book, except chapters marked or unmarked here and not yet sent.
    pub fn apply_remote_book(&mut self, volume: &str, book: &str, read: &[u32]) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        tx.execute(
            "DELETE FROM reading WHERE owner=?1 AND volume=?2 AND book=?3 AND dirty=0",
            params![self.owner, volume, book],
        )
        .map_err(error)?;
        for chapter in read {
            tx.execute("INSERT OR IGNORE INTO reading(owner,volume,book,chapter,dirty,deleted,rev) VALUES(?1,?2,?3,?4,0,0,0)", params![self.owner, volume, book, chapter]).map_err(error)?;
        }
        tx.commit().map_err(error)
    }
    /// The marked or annotated spans of a guide's prose.
    pub fn guide_marks(&self, guide: &str) -> Result<Vec<GuideMark>> {
        let mut stmt = self.study.prepare_cached(&format!("SELECT {GUIDE_COLUMNS} FROM guide_marks WHERE owner=?1 AND guide=?2 AND (highlight_color IS NOT NULL OR underline_color IS NOT NULL OR body<>'')")).map_err(error)?;
        stmt.query_map(params![self.owner, guide], read_guide_mark)
            .map_err(error)?
            .collect::<std::result::Result<_, _>>()
            .map_err(error)
    }
    /// Saves a span's marks and note. One with nothing left is removed (an account's removal is kept, queued,
    /// until the server has removed it too).
    pub fn save_guide_mark(&mut self, m: &GuideMark) -> Result<()> {
        if normalize_verse_note(&m.body).chars().count() > VERSE_NOTE_MAX {
            return Err(format!(
                "Keep a note to {VERSE_NOTE_MAX} characters (as on the website)."
            ));
        }
        let account = self.is_account();
        let tx = self.study.transaction().map_err(error)?;
        let a = &m.anchor;
        let key = params![
            self.owner,
            m.guide,
            m.part,
            a.start_block,
            a.start_offset as i64,
            a.end_block,
            a.end_offset as i64,
            a.exact
        ];
        if m.is_empty() && !account {
            tx.execute("DELETE FROM guide_marks WHERE owner=?1 AND guide=?2 AND part=?3 AND start_block=?4 AND start_offset=?5 AND end_block=?6 AND end_offset=?7 AND exact=?8", key).map_err(error)?;
        } else {
            let rev = next_rev(&tx)?;
            tx.execute("INSERT INTO guide_marks(owner,guide,part,start_block,start_offset,end_block,end_offset,exact,prefix,suffix,highlight_color,underline_color,body,updated,dirty,rev)
                VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
                ON CONFLICT(owner,guide,part,start_block,start_offset,end_block,end_offset,exact) DO UPDATE SET prefix=excluded.prefix,suffix=excluded.suffix,
                  highlight_color=excluded.highlight_color,underline_color=excluded.underline_color,body=excluded.body,updated=excluded.updated,dirty=excluded.dirty,rev=excluded.rev",
                params![self.owner, m.guide, m.part, a.start_block, a.start_offset as i64, a.end_block, a.end_offset as i64, a.exact, a.prefix, a.suffix,
                    m.highlight.as_ref().map(|c| c.as_str()), m.underline.as_ref().map(|c| c.as_str()), m.body, now(), account, rev]).map_err(error)?;
        }
        tx.commit().map_err(error)
    }
    /// Spans changed here and not yet sent, with the revision they were read at.
    pub fn dirty_guide_marks(&self, limit: usize) -> Result<Vec<(GuideMark, i64)>> {
        let mut stmt = self.study.prepare(&format!("SELECT {GUIDE_COLUMNS},rev FROM guide_marks WHERE owner=?1 AND dirty=1 ORDER BY rev LIMIT ?2")).map_err(error)?;
        stmt.query_map(params![self.owner, limit as i64], |r| {
            Ok((read_guide_mark(r)?, r.get(13)?))
        })
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    pub fn guide_mark_synced(&mut self, m: &GuideMark, rev: i64) -> Result<()> {
        let a = &m.anchor;
        let key = params![
            self.owner,
            m.guide,
            m.part,
            a.start_block,
            a.start_offset as i64,
            a.end_block,
            a.end_offset as i64,
            a.exact,
            rev
        ];
        self.study.execute("UPDATE guide_marks SET dirty=0 WHERE owner=?1 AND guide=?2 AND part=?3 AND start_block=?4 AND start_offset=?5 AND end_block=?6 AND end_offset=?7 AND exact=?8 AND rev=?9", key).map_err(error)?;
        self.study.execute("DELETE FROM guide_marks WHERE owner=?1 AND dirty=0 AND highlight_color IS NULL AND underline_color IS NULL AND body=''", [&self.owner]).map_err(error)?;
        Ok(())
    }
    /// Takes the account's spans for a guide, except spans changed here and not yet sent.
    pub fn apply_remote_guide(&mut self, guide: &str, remote: &[GuideMark]) -> Result<()> {
        let tx = self.study.transaction().map_err(error)?;
        tx.execute(
            "DELETE FROM guide_marks WHERE owner=?1 AND guide=?2 AND dirty=0",
            params![self.owner, guide],
        )
        .map_err(error)?;
        for m in remote {
            let a = &m.anchor;
            tx.execute("INSERT OR IGNORE INTO guide_marks(owner,guide,part,start_block,start_offset,end_block,end_offset,exact,prefix,suffix,highlight_color,underline_color,body,updated,dirty,rev)
                VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,0,0)",
                params![self.owner, guide, m.part, a.start_block, a.start_offset as i64, a.end_block, a.end_offset as i64, a.exact, a.prefix, a.suffix,
                    m.highlight.as_ref().map(|c| c.as_str()), m.underline.as_ref().map(|c| c.as_str()), m.body, now()]).map_err(error)?;
        }
        tx.commit().map_err(error)
    }
    /// Every guide this computer has spans in (for copying them into an account).
    pub fn all_guide_marks(&self) -> Result<Vec<GuideMark>> {
        let mut stmt = self.study.prepare(&format!("SELECT {GUIDE_COLUMNS} FROM guide_marks WHERE owner=?1 AND (highlight_color IS NOT NULL OR underline_color IS NOT NULL OR body<>'')")).map_err(error)?;
        stmt.query_map([&self.owner], read_guide_mark)
            .map_err(error)?
            .collect::<std::result::Result<_, _>>()
            .map_err(error)
    }
    /// Local changes for an account not yet confirmed by the server.
    pub fn unsynced(&self, owner: &str) -> Result<usize> {
        let mut total = 0;
        for table in [
            "annotations",
            "notes",
            "reading_log",
            "reading",
            "guide_marks",
        ] {
            total += self
                .study
                .query_row(
                    &format!("SELECT COUNT(*) FROM {table} WHERE owner=?1 AND dirty=1"),
                    [owner],
                    |r| r.get::<_, i64>(0),
                )
                .map_err(error)? as usize;
        }
        Ok(total)
    }
    pub fn search(path: &Path, query: &str, volume: Option<&str>) -> Result<SearchResults> {
        let conn =
            Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(error)?;
        let query = query.trim();
        if query.is_empty() {
            return Ok(SearchResults::default());
        }
        let reference =
            regex::Regex::new(r"^(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$").unwrap();
        let mut hits = Vec::new();
        if let Some(captures) = reference.captures(query) {
            let normalize = |s: &str| {
                s.chars()
                    .filter(|c| c.is_alphanumeric())
                    .flat_map(char::to_lowercase)
                    .collect::<String>()
            };
            let name = normalize(&captures[1]);
            if let Some(book) = Self::books_from(&conn)?.into_iter().find(|b| {
                volume.is_none_or(|v| b.volume == v)
                    && [b.label.as_str(), b.short_title.as_str(), b.id.as_str()]
                        .iter()
                        .any(|s| normalize(s) == name)
            }) {
                let chapter = captures[2].parse::<u32>().unwrap_or(0);
                let first = captures
                    .get(3)
                    .and_then(|v| v.as_str().parse::<u32>().ok())
                    .unwrap_or(0);
                let last = captures
                    .get(4)
                    .and_then(|v| v.as_str().parse::<u32>().ok())
                    .unwrap_or(if first == 0 { u32::MAX } else { first });
                let mut stmt=conn.prepare("SELECT volume,book,chapter,verse,text,reference FROM verses WHERE volume=?1 AND book=?2 AND chapter=?3 AND verse BETWEEN ?4 AND ?5 ORDER BY verse LIMIT 101").map_err(error)?;
                hits = stmt
                    .query_map(
                        params![book.volume, book.id, chapter, first, last],
                        read_hit,
                    )
                    .map_err(error)?
                    .collect::<std::result::Result<_, _>>()
                    .map_err(error)?;
            }
        } else {
            let words = query
                .split(|c: char| !c.is_alphanumeric())
                .filter(|w| !w.is_empty())
                .take(16)
                .map(|w| format!("\"{w}\"*"))
                .collect::<Vec<_>>();
            if !words.is_empty() {
                let expression = words.join(" AND ");
                let mut stmt=conn.prepare("SELECT v.volume,v.book,v.chapter,v.verse,v.text,v.reference FROM verse_search s JOIN verses v ON v.id=s.rowid WHERE verse_search MATCH ?1 AND (?2 IS NULL OR v.volume=?2) ORDER BY rank LIMIT 101").map_err(error)?;
                hits = stmt
                    .query_map(params![expression, volume], read_hit)
                    .map_err(error)?
                    .collect::<std::result::Result<_, _>>()
                    .map_err(error)?;
            }
        }
        let more = hits.len() > 100;
        hits.truncate(100);
        Ok(SearchResults { hits, more })
    }
}
fn read_hit(r: &rusqlite::Row<'_>) -> rusqlite::Result<SearchHit> {
    Ok(SearchHit {
        location: Location {
            volume: r.get(0)?,
            book: r.get(1)?,
            chapter: r.get(2)?,
        },
        verse: r.get(3)?,
        text: r.get(4)?,
        reference: r.get(5)?,
    })
}

pub fn adjacent(books: &[Book], l: &Location, direction: i32) -> Option<Location> {
    let index = books
        .iter()
        .position(|b| b.volume == l.volume && b.id == l.book)?;
    if direction > 0 {
        if l.chapter < books[index].chapters {
            return Some(Location {
                chapter: l.chapter + 1,
                ..l.clone()
            });
        }
        let next = books.get(index + 1)?;
        Some(Location {
            volume: next.volume.clone(),
            book: next.id.clone(),
            chapter: 1,
        })
    } else {
        if l.chapter > 1 {
            return Some(Location {
                chapter: l.chapter - 1,
                ..l.clone()
            });
        }
        let prev = books.get(index.checked_sub(1)?)?;
        Some(Location {
            volume: prev.volume.clone(),
            book: prev.id.clone(),
            chapter: prev.chapters,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "verse-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[test]
    fn complete_dataset_and_navigation() {
        let dir = directory();
        let store = Store::open(&dir).unwrap();
        let books = store.books().unwrap();
        assert_eq!(books.len(), 87);
        assert_eq!(books.iter().map(|b| b.chapters).sum::<u32>(), 1582);
        assert_eq!(
            store
                .scripture
                .query_row("SELECT COUNT(*) FROM verses", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            41995
        );
        let chapter = store.chapter(&Location::default()).unwrap();
        assert_eq!(chapter.len(), 20);
        assert!(chapter[0].text.starts_with("I, Nephi"));
        let last = Location {
            volume: "bookofmormon".into(),
            book: "1nephi".into(),
            chapter: 22,
        };
        let next = adjacent(&books, &last, 1).unwrap();
        assert_eq!(next.book, "2nephi");
        assert_eq!(adjacent(&books, &next, -1), Some(last));
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn reference_search_fts_and_safe_input() {
        let dir = directory();
        let store = Store::open(&dir).unwrap();
        let hits = Store::search(&store.scripture_path, "Alma 32:21", None).unwrap();
        assert_eq!(hits.hits.len(), 1);
        assert!(hits.hits[0].text.contains("faith"));
        assert_eq!(
            Store::search(&store.scripture_path, "John 3:16-17", None)
                .unwrap()
                .hits
                .len(),
            2
        );
        assert_eq!(
            Store::search(&store.scripture_path, "John 3:16", Some("bookofmormon"))
                .unwrap()
                .hits
                .len(),
            0
        );
        assert!(
            !Store::search(&store.scripture_path, "faith hope", None)
                .unwrap()
                .hits
                .is_empty()
        );
        for input in [
            "\"",
            "***",
            "OR NOT",
            "' OR 1=1; --",
            "John 999999999999999999999999999:1",
        ] {
            Store::search(&store.scripture_path, input, None).unwrap();
        }
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn range_marks_are_atomic_when_a_write_fails() {
        let dir = directory();
        let mut store = Store::open(&dir).unwrap();
        store.study.execute_batch("CREATE TRIGGER reject_four BEFORE INSERT ON annotations WHEN NEW.verse=4 BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        let annotations = (2..=5)
            .map(|verse| Annotation {
                verse,
                marks: VerseMarks {
                    highlight: Some(MarkColor::Named("yellow")),
                    ..Default::default()
                },
                ..Default::default()
            })
            .collect::<Vec<_>>();
        assert!(
            store
                .save_annotations(&Location::default(), &annotations)
                .is_err()
        );
        assert!(store.annotations(&Location::default()).unwrap().is_empty());
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn earlier_preferences_load_with_the_websites_reader_defaults() {
        let old: Preferences = serde_json::from_str(
            r#"{"dark":true,"font_size":22,"serif":true,"sidebar":true,"last":{"volume":"bookofmormon","book":"alma","chapter":32}}"#,
        )
        .unwrap();
        assert_eq!(old.version, 0);
        let migrated = old.migrate();
        assert_eq!(migrated.font_size, DEFAULT_FONT_SIZE);
        assert_eq!(migrated.text_width, TextWidth::Comfortable);
        assert!(migrated.dark);
        assert_eq!(migrated.last.chapter, 32);
        // A size someone picked is kept (within range), and current preferences are left alone.
        let chosen: Preferences =
            serde_json::from_str(r#"{"font_size":28,"sidebar":false}"#).unwrap();
        assert_eq!(chosen.migrate().font_size, MAX_FONT_SIZE);
        let current = Preferences {
            font_size: 18.0,
            ..Preferences::default()
        };
        assert_eq!(current.migrate().font_size, 18.0);
    }
    #[test]
    fn notes_marks_preferences_and_read_state_survive_restart() {
        let dir = directory();
        let mut store = Store::open(&dir).unwrap();
        let l = Location::default();
        let mut annotation = Annotation {
            verse: 3,
            marks: VerseMarks {
                highlight: Some(MarkColor::Named("blue")),
                underline: Some(MarkColor::Custom("#123abc".into())),
                ..Default::default()
            },
            bookmarked: true,
            note: "A meaningful note\nwith Unicode: hébreu".into(),
        };
        store.save_annotation(&l, &annotation).unwrap();
        annotation.marks.highlight = None;
        store.save_annotation(&l, &annotation).unwrap();
        let prefs = Preferences {
            dark: true,
            font_size: 20.0,
            ..Preferences::default()
        };
        store.save_preferences(&prefs).unwrap();
        let source = NoteSource::scripture("1 Nephi", &l, None);
        store.set_read(&l, &source, true).unwrap();
        drop(store);
        let store = Store::open(&dir).unwrap();
        let saved = store.annotations(&l).unwrap();
        assert_eq!(saved[0].note, annotation.note);
        assert_eq!(saved[0].marks.highlight, None);
        assert_eq!(saved[0].marks.underline, annotation.marks.underline);
        assert!(saved[0].bookmarked);
        assert!(store.preferences().unwrap().dark);
        assert!(store.is_read(&l).unwrap());
        assert_eq!(store.verse_notes_between(0, i64::MAX).unwrap().len(), 1);
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
    /// A study database exactly as earlier native builds wrote it.
    fn write_v1_profile(dir: &Path) {
        fs::create_dir_all(dir).unwrap();
        let c = Connection::open(dir.join("study.sqlite")).unwrap();
        c.execute_batch("PRAGMA journal_mode=WAL;
          CREATE TABLE annotations(volume TEXT, book TEXT, chapter INTEGER, verse INTEGER, highlighted INTEGER NOT NULL DEFAULT 0, bookmarked INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL, PRIMARY KEY(volume,book,chapter,verse));
          CREATE TABLE preferences(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
          CREATE TABLE reading(volume TEXT, book TEXT, chapter INTEGER, PRIMARY KEY(volume,book,chapter));
          INSERT INTO annotations VALUES('bookofmormon','alma',32,21,1,1,'Faith is not a perfect knowledge — hébreu ✓',1761600000);
          INSERT INTO annotations VALUES('bookofmormon','alma',32,22,0,0,'Only a note',1761600001);
          INSERT INTO reading VALUES('bookofmormon','alma',32);
          INSERT INTO preferences VALUES(1,'{\"dark\":true,\"font_size\":18}');").unwrap();
    }
    #[test]
    fn earlier_profiles_migrate_without_losing_study_data() {
        let dir = directory();
        write_v1_profile(&dir);
        let alma = Location {
            volume: "bookofmormon".into(),
            book: "alma".into(),
            chapter: 32,
        };
        let store = Store::open(&dir).unwrap();
        let saved = store.annotations(&alma).unwrap();
        assert_eq!(saved.len(), 2);
        assert_eq!(saved[0].marks.highlight, Some(MarkColor::Named("yellow")));
        assert!(saved[0].bookmarked);
        assert_eq!(saved[0].note, "Faith is not a perfect knowledge — hébreu ✓");
        assert_eq!(saved[1].marks, VerseMarks::default());
        assert_eq!(saved[1].note, "Only a note");
        assert!(store.is_read(&alma).unwrap());
        assert!(store.preferences().unwrap().dark);
        // A snapshot of the original data is kept beside it.
        let backup = Connection::open(dir.join("study-before-v2.sqlite")).unwrap();
        let old: i64 = backup
            .query_row(
                "SELECT COUNT(*) FROM annotations WHERE highlighted=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(old, 1);
        drop(store);
        // Opening again is a no-op, and the backup is not overwritten.
        let store = Store::open(&dir).unwrap();
        assert_eq!(store.annotations(&alma).unwrap().len(), 2);
        let version: i64 = store
            .study
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn a_failed_migration_leaves_the_original_untouched() {
        let dir = directory();
        write_v1_profile(&dir);
        // A conflicting table makes the upgrade fail part way.
        Connection::open(dir.join("study.sqlite"))
            .unwrap()
            .execute_batch("CREATE TABLE annotations_v2(x);")
            .unwrap();
        assert!(Store::open(&dir).is_err());
        let c = Connection::open(dir.join("study.sqlite")).unwrap();
        let rows: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM annotations WHERE highlighted=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            rows, 1,
            "the original rows are still in their original table"
        );
        drop(c);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn accounts_and_the_device_never_see_each_others_study() {
        let dir = directory();
        let mut store = Store::open(&dir).unwrap();
        let l = Location::default();
        let note = |text: &str| Annotation {
            verse: 1,
            note: text.into(),
            ..Default::default()
        };
        store.save_annotation(&l, &note("device")).unwrap();
        let mut journal = Note::new("2026-10-27", None);
        journal.body = "Device reflection".into();
        store.save_note(&journal).unwrap();
        store.set_owner("account-a");
        assert!(store.annotations(&l).unwrap().is_empty());
        assert!(
            store
                .notes_between("2026-10-01", "2026-10-31")
                .unwrap()
                .is_empty()
        );
        assert!(store.note(&journal.id).unwrap().is_none());
        // An account can't overwrite the device's note through its id either.
        let mut stolen = journal.clone();
        stolen.body = "overwritten".into();
        let kept = store.save_note(&stolen).unwrap();
        assert!(
            kept.forked && kept.id != journal.id,
            "saved as the account's own note"
        );
        store.save_annotation(&l, &note("account")).unwrap();
        assert_eq!(store.unsynced("account-a").unwrap(), 2);
        store.forget_owner("account-a").unwrap();
        assert!(store.forget_owner("").is_err());
        store.set_owner("");
        assert_eq!(store.annotations(&l).unwrap()[0].note, "device");
        assert_eq!(
            store.note(&journal.id).unwrap().unwrap().body,
            "Device reflection"
        );
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn journal_notes_and_reading_log_persist_by_day() {
        let dir = directory();
        let mut store = Store::open(&dir).unwrap();
        let alma = Location {
            volume: "bookofmormon".into(),
            book: "alma".into(),
            chapter: 32,
        };
        let source = NoteSource::scripture("Alma", &alma, Some((21, 23)));
        assert_eq!(source.href, "/browse/bookofmormon/alma/32#v-21");
        assert_eq!(source.label, "Alma 32:21-23");
        assert_eq!(source.location(), Some((alma.clone(), Some(21))));
        let mut note = Note::new("2026-10-27", Some(source.clone()));
        note.title = "Faith".into();
        note.body = "# Seeds\n\nA **particle** of faith.".into();
        store.save_note(&note).unwrap();
        store.set_read(&alma, &source, true).unwrap();
        store.set_read(&alma, &source, true).unwrap();
        store
            .log_reading(
                "2026-10-26",
                &NoteSource::lesson("2026-10-26", "Jeremiah 31–33"),
            )
            .unwrap();
        drop(store);
        let mut store = Store::open(&dir).unwrap();
        let notes = store.notes_between("2026-10-27", "2026-10-27").unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].source, Some(source.clone()));
        assert_eq!(notes[0].excerpt(40), "Seeds A particle of faith.");
        let today = today();
        let logged = store.readings_between(&today, &today).unwrap();
        assert_eq!(logged.len(), 1, "marking read twice logs once");
        assert_eq!(logged[0].origin, "chapter_mark");
        assert_eq!(
            store
                .readings_between("2026-10-26", "2026-10-26")
                .unwrap()
                .len(),
            1
        );
        store.set_read(&alma, &source, false).unwrap();
        assert!(store.readings_between(&today, &today).unwrap().is_empty());
        store.delete_note(&note.id).unwrap();
        assert!(store.note(&note.id).unwrap().is_none());
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn review_sync_ack_does_not_discard_a_second_edit_within_one_second() {
        let dir = directory();
        let mut store = Store::open(&dir).unwrap();
        store.set_owner("review-account");
        let location = Location::default();
        let mut annotation = Annotation {
            verse: 1,
            note: "First edit".into(),
            ..Default::default()
        };
        // Two quick edits are a normal UI action. Do not rely on a sleep or timestamp precision.
        store.save_annotation(&location, &annotation).unwrap();
        let DirtyAnnotation {
            annotation: sent,
            rev: version,
            ..
        } = store.dirty_annotations(500).unwrap().remove(0);
        annotation.note = "Second edit, made while the first is being sent".into();
        store.save_annotation(&location, &annotation).unwrap();
        store.annotation_synced(&location, 1, version).unwrap();
        store.apply_remote_chapter(&location, &[sent]).unwrap();
        assert_eq!(
            store.annotations(&location).unwrap()[0].note,
            annotation.note,
            "acknowledging the first edit must not let a pull overwrite the second"
        );
        assert_eq!(
            store.dirty_annotations(500).unwrap().len(),
            1,
            "the second edit still needs to be sent"
        );
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn guide_marks_are_kept_per_owner_and_acknowledged_by_revision() {
        let dir = directory();
        let mut store = Store::open(&dir).unwrap();
        let mark = GuideMark {
            guide: "2026-10-26".into(),
            part: "reader".into(),
            anchor: crate::guide_text::Anchor {
                start_block: "jeremiah-31-1-3-everlasting-love".into(),
                start_offset: 10,
                end_block: "jeremiah-31-1-3-everlasting-love".into(),
                end_offset: 15,
                exact: "ḥesed".into(),
                prefix: "is ".into(),
                suffix: ", covenant".into(),
            },
            highlight: Some(MarkColor::Named("green")),
            underline: None,
            body: String::new(),
        };
        store.save_guide_mark(&mark).unwrap();
        assert_eq!(
            store.guide_marks("2026-10-26").unwrap(),
            std::slice::from_ref(&mark)
        );
        store.set_owner("account-a");
        assert!(store.guide_marks("2026-10-26").unwrap().is_empty());
        store.save_guide_mark(&mark).unwrap();
        let (sent, rev) = store.dirty_guide_marks(10).unwrap().remove(0);
        let mut later = sent.clone();
        later.body = "A note typed while the mark was being sent".into();
        store.save_guide_mark(&later).unwrap();
        store.guide_mark_synced(&sent, rev).unwrap();
        store.apply_remote_guide("2026-10-26", &[sent]).unwrap();
        assert_eq!(store.guide_marks("2026-10-26").unwrap()[0].body, later.body);
        assert_eq!(store.unsynced("account-a").unwrap(), 1);
        // Removing it keeps a queued removal until the server confirms.
        let mut cleared = later.clone();
        cleared.highlight = None;
        cleared.body.clear();
        store.save_guide_mark(&cleared).unwrap();
        assert!(store.guide_marks("2026-10-26").unwrap().is_empty());
        let (removal, rev) = store.dirty_guide_marks(10).unwrap().remove(0);
        assert!(removal.is_empty());
        store.guide_mark_synced(&removal, rev).unwrap();
        assert_eq!(store.unsynced("account-a").unwrap(), 0);
        store.set_owner("");
        assert_eq!(
            store.guide_marks("2026-10-26").unwrap().len(),
            1,
            "the device's own mark is untouched"
        );
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
}
