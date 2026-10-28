use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{Mutex, OnceLock}};

#[derive(Clone, Deserialize, Serialize)]
pub struct Verse {
    verse: u32,
    text: String,
}

#[derive(Clone, Serialize)]
pub struct Chapter {
    reference: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    translation: Option<&'static str>,
    verses: Vec<Verse>,
}

#[derive(Deserialize)]
struct Bundle { books: Vec<Book> }
#[derive(Deserialize)]
struct Book { book: String, title: String, chapters: Vec<BundleChapter> }
#[derive(Deserialize)]
struct BundleChapter { chapter: u32, verses: Vec<Verse> }
#[derive(Deserialize)]
struct Catalog { volumes: Vec<CatalogVolume> }
#[derive(Deserialize)]
struct CatalogVolume { volume: String, books: Vec<CatalogBook> }
#[derive(Deserialize)]
struct CatalogBook { book: String, label: String }

type VolumeIndex = HashMap<(String, u32), Chapter>;
static VOLUMES: OnceLock<Mutex<HashMap<String, VolumeIndex>>> = OnceLock::new();

// Compile in the existing source data; callers cannot provide a filesystem path.
fn source(volume: &str) -> Option<&'static str> {
    match volume {
        "oldtestament" => Some(include_str!("../../public/scripture-data/oldtestament.json")),
        "newtestament" => Some(include_str!("../../public/scripture-data/newtestament.json")),
        "bookofmormon" => Some(include_str!("../../public/scripture-data/bookofmormon.json")),
        "doctrineandcovenants" => Some(include_str!("../../public/scripture-data/doctrineandcovenants.json")),
        "pearl" => Some(include_str!("../../public/scripture-data/pearl.json")),
        _ => None,
    }
}

pub fn read(volume: &str, book: &str, chapter: u32) -> Result<Option<Chapter>, String> {
    if chapter == 0 || book.len() > 64 { return Ok(None); }
    let Some(json) = source(volume) else { return Ok(None); };
    let mut volumes = VOLUMES.get_or_init(|| Mutex::new(HashMap::new()))
        .lock().map_err(|_| "Scripture cache unavailable".to_string())?;
    if !volumes.contains_key(volume) {
        let bundle: Bundle = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let translation = match volume { "oldtestament" | "newtestament" => Some("lds"), _ => None };
        let catalog: Catalog = serde_json::from_str(include_str!("../../src/lib/generated/scriptureCatalog.json"))
            .map_err(|e| e.to_string())?;
        let labels: HashMap<String, String> = catalog.volumes.into_iter()
            .find(|entry| entry.volume == volume).ok_or("Missing scripture catalog volume")?
            .books.into_iter().map(|book| (book.book, book.label)).collect();
        let mut index = HashMap::new();
        for book in bundle.books {
            for chapter in book.chapters {
                index.insert((book.book.clone(), chapter.chapter), Chapter {
                    reference: format!("{} {}", labels.get(&book.book).unwrap_or(&book.title), chapter.chapter),
                    translation,
                    verses: chapter.verses,
                });
            }
        }
        volumes.insert(volume.to_string(), index);
    }
    Ok(volumes.get(volume).and_then(|index| index.get(&(book.to_string(), chapter))).cloned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_existing_text_and_translation() {
        let chapter = read("bookofmormon", "1nephi", 1).unwrap().unwrap();
        assert_eq!(chapter.reference, "1 Nephi 1");
        assert_eq!(chapter.verses.len(), 20);
        assert!(chapter.verses[0].text.starts_with("I, Nephi"));
        assert_eq!(chapter.translation, None);
        assert_eq!(read("oldtestament", "genesis", 1).unwrap().unwrap().translation, Some("lds"));
    }

    #[test]
    fn rejects_unknown_and_invalid_requests() {
        for (volume, book, chapter) in [("../secrets", "genesis", 1), ("pearl", "missing", 1),
            ("newtestament", "john", 0), ("newtestament", "john", 999)] {
            assert!(read(volume, book, chapter).unwrap().is_none());
        }
    }

    #[test]
    fn all_bundled_chapters_match_manifest() {
        let manifest: serde_json::Value = serde_json::from_str(include_str!("../../public/scripture-data/manifest.json")).unwrap();
        for volume in manifest["volumes"].as_array().unwrap() {
            let id = volume["volume"].as_str().unwrap();
            let bundle: Bundle = serde_json::from_str(source(id).unwrap()).unwrap();
            let mut chapters = 0;
            let mut verses = 0;
            for book in bundle.books {
                for chapter in book.chapters {
                    let actual = read(id, &book.book, chapter.chapter).unwrap().unwrap();
                    assert_eq!(actual.verses.len(), chapter.verses.len());
                    for (actual, expected) in actual.verses.iter().zip(&chapter.verses) {
                        assert_eq!(actual.verse, expected.verse);
                        assert_eq!(actual.text, expected.text);
                    }
                    chapters += 1;
                    verses += actual.verses.len();
                }
            }
            assert_eq!(chapters, volume["chapterCount"].as_u64().unwrap());
            assert_eq!(verses as u64, volume["verseCount"].as_u64().unwrap());
        }
    }
}
