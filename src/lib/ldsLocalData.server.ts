import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { BIBLE_BOOKS } from "@/lib/bibleCanon";

export type LocalChapterResponse = {
  reference: string;
  translation?: string;
  verses: Array<{
    verse: number;
    text: string;
  }>;
};

export type LocalBookResponse = {
  _id: string;
  title: string;
  titleShort?: string;
  titleOfficial?: string;
  subtitle?: string | null;
  summary?: string;
  chapterDelineation?: string;
  chapters: Array<{
    _id: string;
    summary?: string;
  }>;
};

type IndexedData = {
  chapters: Map<string, LocalChapterResponse>;
  books: Map<string, LocalBookResponse>;
  booksByVolume: Map<string, LocalBrowseBook[]>;
  volumes: LocalVolumeSummary[];
  booksFlat: LocalBrowseBook[];
};

export type LocalBrowseBook = {
  id: string;
  label: string;
  chapters: number;
  chapterDelineation: string;
  chapterVerseCounts: number[];
  titleShort?: string;
  titleOfficial?: string;
  subtitle?: string | null;
  abbreviations: string[];
};

export type LocalVolumeSummary = {
  id: string;
  label: string;
  shortLabel: string;
  bookCount: number;
  chapterCount: number;
};

type ManifestVolume = {
  volume: string;
  title: string;
  longTitle?: string;
  subtitle?: string | null;
  shortTitle?: string;
  bundlePath: string;
  bookCount: number;
  chapterCount: number;
  verseCount: number;
};

type ManifestFile = {
  version: string;
  generatedFrom: string;
  volumes: ManifestVolume[];
  bookCount: number;
  chapterCount: number;
  verseCount: number;
};

type BundleVerse = {
  verse: number;
  text: string;
};

type BundleChapter = {
  chapter: number;
  verses: BundleVerse[];
};

type BundleBook = {
  book: string;
  title: string;
  longTitle?: string;
  subtitle?: string | null;
  shortTitle?: string;
  chapterCount: number;
  chapters: BundleChapter[];
};

type VolumeBundle = {
  version: string;
  volume: ManifestVolume;
  books: BundleBook[];
};

const SCRIPTURE_DATA_DIR = path.join(process.cwd(), "public", "scripture-data");
const MANIFEST_PATH = path.join(SCRIPTURE_DATA_DIR, "manifest.json");
const VOLUME_ORDER = ["bookofmormon", "oldtestament", "newtestament", "doctrineandcovenants", "pearl"] as const;

const BIBLE_BOOK_BY_LABEL = new Map(BIBLE_BOOKS.map((book) => [book.label, book.slug]));

const RESTORATION_BOOK_META: Record<string, { id: string; label: string; abbreviations: string[] }> = {
  "1 Nephi": { id: "1nephi", label: "1 Nephi", abbreviations: ["1 Ne"] },
  "2 Nephi": { id: "2nephi", label: "2 Nephi", abbreviations: ["2 Ne"] },
  Jacob: { id: "jacob", label: "Jacob", abbreviations: ["Jacob"] },
  Enos: { id: "enos", label: "Enos", abbreviations: ["Enos"] },
  Jarom: { id: "jarom", label: "Jarom", abbreviations: ["Jarom"] },
  Omni: { id: "omni", label: "Omni", abbreviations: ["Omni"] },
  "Words of Mormon": { id: "wordsofmormon", label: "Words of Mormon", abbreviations: ["W of M", "Words of Mormon"] },
  Mosiah: { id: "mosiah", label: "Mosiah", abbreviations: ["Mosiah"] },
  Alma: { id: "alma", label: "Alma", abbreviations: ["Alma"] },
  Helaman: { id: "helaman", label: "Helaman", abbreviations: ["Hel"] },
  "3 Nephi": { id: "3nephi", label: "3 Nephi", abbreviations: ["3 Ne"] },
  "4 Nephi": { id: "4nephi", label: "4 Nephi", abbreviations: ["4 Ne"] },
  Mormon: { id: "mormon", label: "Mormon", abbreviations: ["Morm", "Mormon"] },
  Ether: { id: "ether", label: "Ether", abbreviations: ["Ether"] },
  Moroni: { id: "moroni", label: "Moroni", abbreviations: ["Moro", "Moroni"] },
  "Doctrine and Covenants": {
    id: "doctrineandcovenants",
    label: "Doctrine and Covenants",
    abbreviations: ["D&C", "DC", "Doctrine and Covenants"],
  },
  Moses: { id: "moses", label: "Moses", abbreviations: ["Moses"] },
  Abraham: { id: "abraham", label: "Abraham", abbreviations: ["Abr", "Abraham"] },
  "Joseph Smith--Matthew": {
    id: "josephsmithmatthew",
    label: "Joseph Smith-Matthew",
    abbreviations: ["JSM", "JS-M", "Joseph Smith-Matthew"],
  },
  "Joseph Smith--History": {
    id: "josephsmithhistory",
    label: "Joseph Smith-History",
    abbreviations: ["JSH", "JS-H", "Joseph Smith-History"],
  },
  "Articles of Faith": { id: "articlesoffaith", label: "Articles of Faith", abbreviations: ["A of F", "AOF"] },
};

function chapterKey(volume: string, book: string, chapter: number): string {
  return `${volume}:${book}:${chapter}`;
}

function bookKey(volume: string, book: string): string {
  return `${volume}:${book}`;
}

let dataPromise: Promise<IndexedData> | null = null;

function getChapterDelineation(volume: string) {
  return volume === "doctrineandcovenants" ? "Section" : "Chapter";
}

function resolveBookMeta(volume: string, book: BundleBook) {
  if (volume === "oldtestament" || volume === "newtestament") {
    const slug = BIBLE_BOOK_BY_LABEL.get(book.title);
    if (!slug) return null;
    return { id: slug, label: book.title, abbreviations: [book.shortTitle ?? book.title] };
  }
  return RESTORATION_BOOK_META[book.title] ?? null;
}

async function buildIndex(): Promise<IndexedData> {
  const manifestRaw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestRaw) as ManifestFile;
  const chapters = new Map<string, LocalChapterResponse>();
  const books = new Map<string, LocalBookResponse>();
  const booksByVolume = new Map<string, LocalBrowseBook[]>();
  const booksFlat: LocalBrowseBook[] = [];

  for (const volumeEntry of manifest.volumes) {
    const bundlePath = path.join(SCRIPTURE_DATA_DIR, path.basename(volumeEntry.bundlePath));
    const bundleRaw = await readFile(bundlePath, "utf8");
    const bundle = JSON.parse(bundleRaw) as VolumeBundle;
    const chapterDelineation = getChapterDelineation(volumeEntry.volume);
    const browseBooks: LocalBrowseBook[] = [];

    for (const bundleBook of bundle.books) {
      const resolved = resolveBookMeta(volumeEntry.volume, bundleBook);
      if (!resolved) continue;

      const chapterVerseCounts = bundleBook.chapters.map((chapter) => chapter.verses.length);
      const browseBook: LocalBrowseBook = {
        id: resolved.id,
        label: resolved.label,
        chapters: bundleBook.chapterCount,
        chapterDelineation,
        chapterVerseCounts,
        titleShort: bundleBook.shortTitle,
        titleOfficial: bundleBook.longTitle,
        subtitle: bundleBook.subtitle ?? null,
        abbreviations: resolved.abbreviations,
      };
      browseBooks.push(browseBook);
      booksFlat.push(browseBook);

      books.set(
        bookKey(volumeEntry.volume, resolved.id),
        {
          _id: resolved.id,
          title: resolved.label,
          titleShort: bundleBook.shortTitle,
          titleOfficial: bundleBook.longTitle,
          subtitle: bundleBook.subtitle ?? null,
          chapterDelineation,
          chapters: bundleBook.chapters.map((chapter) => ({
            _id: `${resolved.id}-${chapter.chapter}`,
          })),
        }
      );

      for (const bundleChapter of bundleBook.chapters) {
        chapters.set(chapterKey(volumeEntry.volume, resolved.id, bundleChapter.chapter), {
          reference: `${resolved.label} ${bundleChapter.chapter}`,
          translation: volumeEntry.volume === "oldtestament" || volumeEntry.volume === "newtestament" ? "lds" : undefined,
          verses: bundleChapter.verses.map((verse) => ({
            verse: verse.verse,
            text: verse.text,
          })),
        });
      }
    }

    booksByVolume.set(volumeEntry.volume, browseBooks);
  }

  const manifestVolumesById = new Map(manifest.volumes.map((volume) => [volume.volume, volume]));
  const volumes: LocalVolumeSummary[] = VOLUME_ORDER.flatMap((volumeId) => {
    const volume = manifestVolumesById.get(volumeId);
    if (!volume) return [];
    return [{
      id: volume.volume,
      label: volume.title,
      shortLabel:
        volume.volume === "doctrineandcovenants"
          ? `${volume.chapterCount} sections`
          : `${volume.bookCount} books`,
      bookCount: volume.bookCount,
      chapterCount: volume.chapterCount,
    }];
  });

  return { chapters, books, booksByVolume, volumes, booksFlat };
}

async function getIndexedData(): Promise<IndexedData> {
  if (!dataPromise) {
    dataPromise = buildIndex();
  }
  return await dataPromise;
}

export async function getLocalLdsChapter(
  volume: string,
  book: string,
  chapter: number
): Promise<LocalChapterResponse | null> {
  const data = await getIndexedData();
  return data.chapters.get(chapterKey(volume, book, chapter)) ?? null;
}

export async function getLocalLdsBook(volume: string, book: string): Promise<LocalBookResponse | null> {
  const data = await getIndexedData();
  return data.books.get(bookKey(volume, book)) ?? null;
}

export async function getLocalLdsBooks(volume: string): Promise<LocalBrowseBook[]> {
  const data = await getIndexedData();
  return data.booksByVolume.get(volume) ?? [];
}

export async function getLocalLdsVolumes(): Promise<LocalVolumeSummary[]> {
  const data = await getIndexedData();
  return data.volumes;
}

export async function findLocalLdsBook(book: string): Promise<{ volume: string; book: LocalBrowseBook } | null> {
  const data = await getIndexedData();
  for (const [volume, books] of data.booksByVolume.entries()) {
    const match = books.find((entry) => entry.id === book);
    if (match) {
      return { volume, book: match };
    }
  }
  return null;
}
