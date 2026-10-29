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
    write_guides(&root);
    write_release_images(&root);
}

/// Embeds the website's release-note screenshots that `assets/release-notes.json` (generated from
/// `src/lib/releaseNotes.ts`) shows, by their `src`.
fn write_release_images(root: &std::path::Path) {
    // The website's version (package.json), which its newest release note must name.
    let package = root.join("package.json");
    println!("cargo:rerun-if-changed={}", package.display());
    let package: Value = serde_json::from_slice(&fs::read(&package).unwrap()).unwrap();
    println!(
        "cargo:rustc-env=WEB_VERSION={}",
        package["version"].as_str().unwrap()
    );
    let notes_path = root.join("native/assets/release-notes.json");
    println!("cargo:rerun-if-changed={}", notes_path.display());
    let notes: Value = serde_json::from_slice(&fs::read(&notes_path).unwrap()).unwrap();
    let mut sources = std::collections::BTreeSet::new();
    let releases = notes["releases"].as_array().unwrap().iter();
    for items in releases
        .map(|r| &r["items"])
        .chain(std::iter::once(&notes["unreleased"]["items"]))
    {
        for item in items.as_array().unwrap() {
            if let Some(src) = item["screenshot"]["src"].as_str() {
                sources.insert(src.to_string());
            }
        }
    }
    let mut out = String::from("pub static RELEASE_IMAGES: &[(&str, &[u8])] = &[\n");
    for src in sources {
        assert!(
            src.starts_with("/release-notes/") && !src.contains(".."),
            "unexpected screenshot path {src}"
        );
        let path = root.join("public").join(src.trim_start_matches('/'));
        assert!(
            path.is_file(),
            "missing release-note screenshot {}",
            path.display()
        );
        println!("cargo:rerun-if-changed={}", path.display());
        out.push_str(&format!(
            "    ({src:?}, include_bytes!({:?})),\n",
            path.display().to_string()
        ));
    }
    out.push_str("];\n");
    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("release_images.rs"),
        out,
    )
    .unwrap();
}

/// Embeds every published Come, Follow Me guide in the repository's catalog (`content/cfm/guides.json`).
fn write_guides(root: &std::path::Path) {
    let catalog = root.join("content/cfm/guides.json");
    println!("cargo:rerun-if-changed={}", catalog.display());
    let out = format!(
        "pub const GUIDE_CATALOG: &str = include_str!({:?});\n",
        catalog.display().to_string()
    );
    let mut files = String::from("pub const GUIDE_FILES: &[(&str, &str)] = &[\n");
    let entries: Value = serde_json::from_slice(&fs::read(&catalog).unwrap()).unwrap();
    let mut seen = std::collections::HashSet::new();
    for entry in entries.as_array().unwrap() {
        let slug = entry["slug"].as_str().unwrap();
        assert!(
            seen.insert(slug.to_string()),
            "guide {slug} is listed twice"
        );
        let path = root.join(format!("content/cfm/{slug}.md"));
        println!("cargo:rerun-if-changed={}", path.display());
        files.push_str(&format!(
            "    ({slug:?}, include_str!({:?})),\n",
            path.display().to_string()
        ));
    }
    files.push_str("];\n");
    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("guides.rs"),
        out + &files,
    )
    .unwrap();
    // The website's book art for the Library's volume pages (`getScriptureBookArt`).
    let art = root.join("public/art/books");
    println!("cargo:rerun-if-changed={}", art.display());
    let mut names: Vec<_> = fs::read_dir(&art)
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "webp"))
        .collect();
    names.sort();
    let mut books = String::from("pub static BOOK_ART: &[(&str, &[u8])] = &[\n");
    for path in names {
        let stem = path.file_stem().unwrap().to_str().unwrap().to_string();
        books.push_str(&format!(
            "    ({stem:?}, include_bytes!({:?})),\n",
            path.display().to_string()
        ));
    }
    books.push_str("];\n");
    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("book_art.rs"),
        books,
    )
    .unwrap();
}
