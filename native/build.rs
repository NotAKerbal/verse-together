use rusqlite::{Connection, params};
use serde_json::Value;
use std::{env, fs, path::PathBuf};

fn main() {
    let root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("..");
    let catalog_path = root.join("src/lib/generated/scriptureCatalog.json");
    println!("cargo:rerun-if-changed={}", catalog_path.display());
    let catalog_bytes = fs::read(catalog_path).unwrap();
    let catalog: Value = serde_json::from_slice(&catalog_bytes).unwrap();
    let destination = PathBuf::from(env::var("OUT_DIR").unwrap()).join("scriptures.sqlite");
    let _ = fs::remove_file(&destination);
    let mut conn = Connection::open(destination).unwrap();
    conn.execute_batch("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
        CREATE TABLE books(volume TEXT, volume_title TEXT, book TEXT, label TEXT, long_title TEXT, short_title TEXT, chapters INTEGER, position INTEGER PRIMARY KEY);
        CREATE TABLE verses(id INTEGER PRIMARY KEY, volume TEXT, book TEXT, chapter INTEGER, verse INTEGER, text TEXT, reference TEXT);
        CREATE UNIQUE INDEX chapter_lookup ON verses(volume, book, chapter, verse);
        CREATE VIRTUAL TABLE verse_search USING fts5(text, content='verses', content_rowid='id', tokenize='unicode61 remove_diacritics 2');").unwrap();
    let tx = conn.transaction().unwrap();
    let mut hash = 0xcbf29ce484222325u64;
    for byte in &catalog_bytes {
        hash = (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3);
    }
    let mut position = 0;
    for volume in catalog["volumes"].as_array().unwrap() {
        let id = volume["volume"].as_str().unwrap();
        let data_path = root.join(format!("public/scripture-data/{id}.json"));
        println!("cargo:rerun-if-changed={}", data_path.display());
        let bytes = fs::read(data_path).unwrap();
        for byte in &bytes {
            hash = (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3);
        }
        let bundle: Value = serde_json::from_slice(&bytes).unwrap();
        for book in volume["books"].as_array().unwrap() {
            position += 1;
            let slug = book["book"].as_str().unwrap();
            let label = book["label"].as_str().unwrap();
            tx.execute(
                "INSERT INTO books VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    id,
                    volume["title"].as_str(),
                    slug,
                    label,
                    book["longTitle"].as_str().unwrap_or(label),
                    book["shortTitle"].as_str().unwrap_or(label),
                    book["chapterCount"].as_i64(),
                    position
                ],
            )
            .unwrap();
            let bundle_book = bundle["books"]
                .as_array()
                .unwrap()
                .iter()
                .find(|b| b["book"] == slug)
                .unwrap();
            for chapter in bundle_book["chapters"].as_array().unwrap() {
                let number = chapter["chapter"].as_i64().unwrap();
                for verse in chapter["verses"].as_array().unwrap() {
                    let n = verse["verse"].as_i64().unwrap();
                    tx.execute("INSERT INTO verses(volume,book,chapter,verse,text,reference) VALUES (?1,?2,?3,?4,?5,?6)",params![id,slug,number,n,verse["text"].as_str(),format!("{label} {number}:{n}")]).unwrap();
                }
            }
        }
    }
    tx.execute(
        "INSERT INTO verse_search(verse_search) VALUES ('rebuild')",
        [],
    )
    .unwrap();
    tx.commit().unwrap();
    conn.execute_batch("PRAGMA optimize; VACUUM;").unwrap();
    println!("cargo:rustc-env=VERSE_DATA_HASH={hash:x}");
}
