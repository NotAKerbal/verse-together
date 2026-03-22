import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = path.join(
  process.cwd(),
  "public",
  "lds-scriptures-2020.12.08",
  "sqlite",
  "lds-scriptures-sqlite.db"
);
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "public", "scripture-data");
const DATASET_VERSION = "lds-scriptures-2020.12.08";

const VOLUME_SLUG_BY_SOURCE = {
  ot: "oldtestament",
  nt: "newtestament",
  bofm: "bookofmormon",
  "dc-testament": "doctrineandcovenants",
  pgp: "pearl",
};

function parseArgs(argv) {
  const args = { source: DEFAULT_DB_PATH, outDir: DEFAULT_OUTPUT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === "--source" || token === "-s") && argv[index + 1]) {
      args.source = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if ((token === "--out-dir" || token === "-o") && argv[index + 1]) {
      args.outDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
  }
  return args;
}

function parseSqlValues(raw) {
  const values = [];
  let current = "";
  let inString = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (char === "'") {
        if (raw[index + 1] === "'") {
          current += "'";
          index += 1;
        } else {
          inString = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === ",") {
      values.push(parseScalar(current.trim()));
      current = "";
      continue;
    }

    current += char;
  }

  values.push(parseScalar(current.trim()));
  return values;
}

function parseScalar(raw) {
  if (raw === "NULL") return null;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function slugifyBookTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function createEmptySourceState(hash, sourcePath, sourceType) {
  return {
    hash,
    sourcePath,
    sourceType,
    volumesById: new Map(),
    booksById: new Map(),
    chaptersById: new Map(),
    versesByChapterId: new Map(),
  };
}

function loadSourceDump(sourcePath) {
  const dump = readFileSync(sourcePath, "utf8");
  const hash = createHash("sha256").update(dump).digest("hex");
  const lines = dump.split(/\r?\n/);
  const state = createEmptySourceState(hash, sourcePath, "sqlite-dump");

  for (const line of lines) {
    if (!line.startsWith("INSERT INTO ")) continue;
    const match = line.match(/^INSERT INTO ([a-z_]+) VALUES\((.*)\);$/i);
    if (!match) continue;

    const [, tableName, rawValues] = match;
    const values = parseSqlValues(rawValues);

    if (tableName === "volumes") {
      const [id, title, longTitle, subtitle, shortTitle, sourceSlug] = values;
      state.volumesById.set(id, {
        id,
        title,
        longTitle,
        subtitle,
        shortTitle,
        sourceSlug,
      });
      continue;
    }

    if (tableName === "books") {
      const [id, volumeId, title, longTitle, subtitle, shortTitle, sourceSlug] = values;
      state.booksById.set(id, {
        id,
        volumeId,
        title,
        longTitle,
        subtitle,
        shortTitle,
        sourceSlug,
      });
      continue;
    }

    if (tableName === "chapters") {
      const [id, bookId, chapterNumber] = values;
      state.chaptersById.set(id, {
        id,
        bookId,
        chapterNumber,
      });
      continue;
    }

    if (tableName === "verses") {
      const [id, chapterId, verseNumber, scriptureText] = values;
      const verses = state.versesByChapterId.get(chapterId) ?? [];
      verses.push({
        id,
        verseNumber,
        scriptureText,
      });
      state.versesByChapterId.set(chapterId, verses);
    }
  }

  return state;
}

function loadSourceDatabase(sourcePath) {
  const dbBytes = readFileSync(sourcePath);
  const hash = createHash("sha256").update(dbBytes).digest("hex");
  const state = createEmptySourceState(hash, sourcePath, "sqlite-db");
  const db = new DatabaseSync(sourcePath, { readOnly: true });

  try {
    const volumes = db.prepare(
      "SELECT id, volume_title, volume_long_title, volume_subtitle, volume_short_title, volume_lds_url FROM volumes ORDER BY id"
    ).all();
    for (const row of volumes) {
      state.volumesById.set(row.id, {
        id: row.id,
        title: row.volume_title,
        longTitle: row.volume_long_title,
        subtitle: row.volume_subtitle,
        shortTitle: row.volume_short_title,
        sourceSlug: row.volume_lds_url,
      });
    }

    const books = db.prepare(
      "SELECT id, volume_id, book_title, book_long_title, book_subtitle, book_short_title, book_lds_url FROM books ORDER BY id"
    ).all();
    for (const row of books) {
      state.booksById.set(row.id, {
        id: row.id,
        volumeId: row.volume_id,
        title: row.book_title,
        longTitle: row.book_long_title,
        subtitle: row.book_subtitle,
        shortTitle: row.book_short_title,
        sourceSlug: row.book_lds_url,
      });
    }

    const chapters = db.prepare("SELECT id, book_id, chapter_number FROM chapters ORDER BY id").all();
    for (const row of chapters) {
      state.chaptersById.set(row.id, {
        id: row.id,
        bookId: row.book_id,
        chapterNumber: row.chapter_number,
      });
    }

    const verses = db.prepare(
      "SELECT id, chapter_id, verse_number, scripture_text FROM verses ORDER BY chapter_id, verse_number, id"
    ).all();
    for (const row of verses) {
      const items = state.versesByChapterId.get(row.chapter_id) ?? [];
      items.push({
        id: row.id,
        verseNumber: row.verse_number,
        scriptureText: row.scripture_text,
      });
      state.versesByChapterId.set(row.chapter_id, items);
    }
  } finally {
    db.close();
  }

  return state;
}

function loadSourceArtifact(sourcePath) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Source artifact not found: ${sourcePath}`);
  }
  if (sourcePath.toLowerCase().endsWith(".db")) {
    return loadSourceDatabase(sourcePath);
  }
  return loadSourceDump(sourcePath);
}

function assembleData(source) {
  const volumes = Array.from(source.volumesById.values()).sort((left, right) => left.id - right.id);
  const books = Array.from(source.booksById.values()).sort((left, right) => left.id - right.id);
  const chapters = Array.from(source.chaptersById.values()).sort((left, right) => left.id - right.id);

  const booksByVolumeId = new Map();
  for (const book of books) {
    const entries = booksByVolumeId.get(book.volumeId) ?? [];
    entries.push(book);
    booksByVolumeId.set(book.volumeId, entries);
  }

  const chaptersByBookId = new Map();
  for (const chapter of chapters) {
    const entries = chaptersByBookId.get(chapter.bookId) ?? [];
    entries.push(chapter);
    chaptersByBookId.set(chapter.bookId, entries);
  }

  const generatedFrom = path.relative(process.cwd(), source.sourcePath).replace(/\\/g, "/");
  const manifest = {
    version: DATASET_VERSION,
    generatedFrom,
    volumes: [],
    bookCount: 0,
    chapterCount: 0,
    verseCount: 0,
  };

  const volumeFiles = [];

  for (const volume of volumes) {
    const volumeSlug = VOLUME_SLUG_BY_SOURCE[volume.sourceSlug];
    if (!volumeSlug) {
      throw new Error(`No app volume slug mapping found for source volume "${volume.sourceSlug}".`);
    }

    const volumeBooks = booksByVolumeId.get(volume.id) ?? [];
    const manifestBooks = [];
    const compactBooks = {};
    let chapterTotal = 0;
    let verseTotal = 0;

    for (const book of volumeBooks) {
      const bookSlug = slugifyBookTitle(book.title);
      const chapterDelineation = volumeSlug === "doctrineandcovenants" ? "Section" : "Chapter";
      const bookChapters = (chaptersByBookId.get(book.id) ?? []).sort(
        (left, right) => left.chapterNumber - right.chapterNumber
      );
      const compactChapters = [];
      let bookVerseTotal = 0;

      for (const chapter of bookChapters) {
        const verses = (source.versesByChapterId.get(chapter.id) ?? []).sort(
          (left, right) => left.verseNumber - right.verseNumber
        );
        const chapterVerses = verses.map((verse) => ({
          verse: verse.verseNumber,
          text: verse.scriptureText,
        }));
        compactChapters.push({
          chapter: chapter.chapterNumber,
          verses: chapterVerses,
        });
        bookVerseTotal += chapterVerses.length;
        verseTotal += chapterVerses.length;
      }

      chapterTotal += bookChapters.length;
      compactBooks[bookSlug] = {
        book: bookSlug,
        title: book.title,
        longTitle: book.longTitle || null,
        subtitle: book.subtitle || null,
        shortTitle: book.shortTitle || null,
        chapterCount: bookChapters.length,
        chapters: compactChapters,
      };
      manifestBooks.push({
        book: bookSlug,
        title: book.title,
        longTitle: book.longTitle || null,
        subtitle: book.subtitle || null,
        shortTitle: book.shortTitle || null,
        chapterCount: bookChapters.length,
        verseCount: bookVerseTotal,
        chapterDelineation,
      });
    }

    const fileName = `${volumeSlug}.json`;
    const volumeEntry = {
      volume: volumeSlug,
      title: volume.title,
      longTitle: volume.longTitle || null,
      subtitle: volume.subtitle || null,
      shortTitle: volume.shortTitle || null,
      bundlePath: `/scripture-data/${fileName}`,
      bookCount: manifestBooks.length,
      chapterCount: chapterTotal,
      verseCount: verseTotal,
    };
    manifest.volumes.push(volumeEntry);
    manifest.bookCount += manifestBooks.length;
    manifest.chapterCount += chapterTotal;
    manifest.verseCount += verseTotal;

    volumeFiles.push({
      fileName,
      payload: {
        version: DATASET_VERSION,
        volume: volumeEntry,
        books: Object.values(compactBooks),
      },
    });
  }

  return { manifest, volumeFiles };
}

function writeOutput(outDir, manifest, volumeFiles) {
  mkdirSync(outDir, { recursive: true });

  writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const volumeFile of volumeFiles) {
    writeFileSync(path.join(outDir, volumeFile.fileName), JSON.stringify(volumeFile.payload));
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = loadSourceArtifact(args.source);
  const { manifest, volumeFiles } = assembleData(source);
  writeOutput(args.outDir, manifest, volumeFiles);

  const volumeSummary = manifest.volumes
    .map((volume) => `${volume.volume}:${volume.bookCount}b/${volume.chapterCount}c/${volume.verseCount}v`)
    .join(", ");

  console.log(`Wrote ${manifest.volumes.length} scripture volumes to ${path.relative(process.cwd(), args.outDir)}.`);
  console.log(volumeSummary);
}

main();
