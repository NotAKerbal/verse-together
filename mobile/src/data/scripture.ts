// Scripture text from the repository's checked-in, app-native dataset (public/scripture-data/*.json, generated
// from the LDS scriptures SQLite artifact by scripts/generateScriptureData.mjs). Each volume is bundled with the
// app and parsed the first time it is opened, so reading works offline and nothing is fetched.

import { normalizeScriptureVolume } from "../shared/web";

export type Verse = { verse: number; text: string };
export type BundleChapter = { chapter: number; verses: Verse[] };
export type BundleBook = {
  book: string;
  title: string;
  longTitle: string | null;
  subtitle: string | null;
  shortTitle: string | null;
  chapterCount: number;
  chapters: BundleChapter[];
};
export type VolumeBundle = { version: string; volume: { volume: string; title: string }; books: BundleBook[] };

export const VOLUME_IDS = ["oldtestament", "newtestament", "bookofmormon", "doctrineandcovenants", "pearl"] as const;
export type VolumeId = (typeof VOLUME_IDS)[number];

const LOADERS: Record<VolumeId, () => VolumeBundle> = {
  oldtestament: () => require("../../../public/scripture-data/oldtestament.json"),
  newtestament: () => require("../../../public/scripture-data/newtestament.json"),
  bookofmormon: () => require("../../../public/scripture-data/bookofmormon.json"),
  doctrineandcovenants: () => require("../../../public/scripture-data/doctrineandcovenants.json"),
  pearl: () => require("../../../public/scripture-data/pearl.json"),
};

type IndexedVolume = { bundle: VolumeBundle; books: Map<string, BundleBook> };
const cache = new Map<VolumeId, IndexedVolume>();

export function isVolumeId(value: string): value is VolumeId {
  return (VOLUME_IDS as readonly string[]).includes(value);
}

/** A volume's bundle (accepting URL slugs such as "dnc"), or null for an unknown volume. */
export function loadVolume(volume: string): IndexedVolume | null {
  const id = normalizeScriptureVolume(volume);
  if (!isVolumeId(id)) return null;
  let entry = cache.get(id);
  if (!entry) {
    const bundle = LOADERS[id]();
    entry = { bundle, books: new Map(bundle.books.map((book) => [book.book, book])) };
    cache.set(id, entry);
  }
  return entry;
}

export type ChapterText = { volume: VolumeId; book: BundleBook; chapter: number; verses: Verse[] };

/** One chapter's verses, or null when the volume, book or chapter does not exist. */
export function getChapter(volume: string, book: string, chapter: number): ChapterText | null {
  const entry = loadVolume(volume);
  if (!entry || !Number.isInteger(chapter) || chapter < 1) return null;
  const bundleBook = entry.books.get(book);
  const found = bundleBook?.chapters.find((candidate) => candidate.chapter === chapter);
  if (!bundleBook || !found) return null;
  return { volume: entry.bundle.volume.volume as VolumeId, book: bundleBook, chapter, verses: found.verses };
}

/**
 * Loads a chapter off the current frame, so a screen can draw its header first. The first open of a large
 * volume (the Old Testament is 3.6 MB of text) parses it once.
 */
export function loadChapterAsync(volume: string, book: string, chapter: number): Promise<ChapterText | null> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(getChapter(volume, book, chapter));
      } catch (error) {
        reject(error);
      }
    }, 0);
  });
}

/** Typesets the source's double hyphens as em dashes, as the web reader does. */
export function typesetDashes(text: string): string {
  return text.replace(/--/g, "—");
}
