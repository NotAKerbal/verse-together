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
    pub text: String,
    pub highlighted: bool,
    pub bookmarked: bool,
    pub note: String,
}
#[derive(Debug, Clone, Default)]
pub struct Annotation {
    pub verse: u32,
    pub highlighted: bool,
    pub bookmarked: bool,
    pub note: String,
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
}

pub struct Store {
    pub scripture_path: PathBuf,
    scripture: Connection,
    study: Connection,
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
        let study = Connection::open(directory.join("study.sqlite")).map_err(error)?;
        study.busy_timeout(Duration::from_secs(3)).map_err(error)?;
        study.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS annotations(volume TEXT, book TEXT, chapter INTEGER, verse INTEGER, highlighted INTEGER NOT NULL DEFAULT 0, bookmarked INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL, PRIMARY KEY(volume,book,chapter,verse));
          CREATE TABLE IF NOT EXISTS preferences(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS reading(volume TEXT, book TEXT, chapter INTEGER, PRIMARY KEY(volume,book,chapter));").map_err(error)?;
        Ok(Self {
            scripture_path,
            scripture,
            study,
        })
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
        let mut stmt = self.scripture.prepare("SELECT verse,text FROM verses WHERE volume=?1 AND book=?2 AND chapter=?3 ORDER BY verse").map_err(error)?;
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
        let mut stmt=self.study.prepare("SELECT verse,highlighted,bookmarked,note FROM annotations WHERE volume=?1 AND book=?2 AND chapter=?3 ORDER BY verse").map_err(error)?;
        stmt.query_map(params![l.volume, l.book, l.chapter], |r| {
            Ok(Annotation {
                verse: r.get(0)?,
                highlighted: r.get(1)?,
                bookmarked: r.get(2)?,
                note: r.get(3)?,
            })
        })
        .map_err(error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(error)
    }
    pub fn save_annotation(&mut self, l: &Location, a: &Annotation) -> Result<()> {
        Self::write_annotation(&self.study, l, a)
    }
    pub fn save_annotations(&mut self, l: &Location, annotations: &[Annotation]) -> Result<()> {
        let transaction = self.study.transaction().map_err(error)?;
        for annotation in annotations {
            Self::write_annotation(&transaction, l, annotation)?;
        }
        transaction.commit().map_err(error)
    }
    fn write_annotation(connection: &Connection, l: &Location, a: &Annotation) -> Result<()> {
        // Empty annotations are removed, but clearing a mark never deletes an existing note.
        if a.note.trim().is_empty() && !a.highlighted && !a.bookmarked {
            connection.execute("DELETE FROM annotations WHERE volume=?1 AND book=?2 AND chapter=?3 AND verse=?4",params![l.volume,l.book,l.chapter,a.verse]).map_err(error)?;
        } else {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(error)?
                .as_secs();
            connection.execute("INSERT INTO annotations VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(volume,book,chapter,verse) DO UPDATE SET highlighted=excluded.highlighted,bookmarked=excluded.bookmarked,note=excluded.note,updated=excluded.updated",params![l.volume,l.book,l.chapter,a.verse,a.highlighted,a.bookmarked,a.note,now]).map_err(error)?;
        }
        Ok(())
    }
    pub fn journal(&self) -> Result<Vec<StudyEntry>> {
        let mut stmt=self.study.prepare("SELECT volume,book,chapter,verse,highlighted,bookmarked,note FROM annotations ORDER BY updated DESC,verse LIMIT 1000").map_err(error)?;
        let items = stmt
            .query_map([], |r| {
                Ok((
                    Location {
                        volume: r.get(0)?,
                        book: r.get(1)?,
                        chapter: r.get(2)?,
                    },
                    Annotation {
                        verse: r.get(3)?,
                        highlighted: r.get(4)?,
                        bookmarked: r.get(5)?,
                        note: r.get(6)?,
                    },
                ))
            })
            .map_err(error)?;
        let books = self.books()?;
        let mut entries = Vec::new();
        for item in items {
            let (location, a) = item.map_err(error)?;
            let label = books
                .iter()
                .find(|b| b.volume == location.volume && b.id == location.book)
                .map(|b| b.label.as_str())
                .unwrap_or(&location.book);
            let text = self
                .chapter(&location)?
                .into_iter()
                .find(|v| v.number == a.verse)
                .map(|v| v.text)
                .unwrap_or_default();
            entries.push(StudyEntry {
                reference: format!("{label} {}:{}", location.chapter, a.verse),
                location,
                verse: a.verse,
                text,
                highlighted: a.highlighted,
                bookmarked: a.bookmarked,
                note: a.note,
            });
        }
        Ok(entries)
    }
    pub fn is_read(&self, l: &Location) -> Result<bool> {
        self.study
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM reading WHERE volume=?1 AND book=?2 AND chapter=?3)",
                params![l.volume, l.book, l.chapter],
                |r| r.get(0),
            )
            .map_err(error)
    }
    pub fn set_read(&self, l: &Location, read: bool) -> Result<()> {
        let sql = if read {
            "INSERT OR IGNORE INTO reading VALUES(?1,?2,?3)"
        } else {
            "DELETE FROM reading WHERE volume=?1 AND book=?2 AND chapter=?3"
        };
        self.study
            .execute(sql, params![l.volume, l.book, l.chapter])
            .map_err(error)?;
        Ok(())
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
                highlighted: true,
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
            highlighted: true,
            bookmarked: true,
            note: "A meaningful note\nwith Unicode: hébreu".into(),
        };
        store.save_annotation(&l, &annotation).unwrap();
        annotation.highlighted = false;
        store.save_annotation(&l, &annotation).unwrap();
        let prefs = Preferences {
            dark: true,
            font_size: 20.0,
            ..Preferences::default()
        };
        store.save_preferences(&prefs).unwrap();
        store.set_read(&l, true).unwrap();
        drop(store);
        let store = Store::open(&dir).unwrap();
        let saved = store.annotations(&l).unwrap();
        assert_eq!(saved[0].note, annotation.note);
        assert!(!saved[0].highlighted);
        assert!(saved[0].bookmarked);
        assert!(store.preferences().unwrap().dark);
        assert!(store.is_read(&l).unwrap());
        assert_eq!(store.journal().unwrap().len(), 1);
        drop(store);
        fs::remove_dir_all(dir).unwrap();
    }
}
