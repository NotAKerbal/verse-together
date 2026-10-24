import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { isBibleVolume } from "@/lib/bibleCanon";
import { createLocalScriptureStore, type LocalVolumeBundle } from "@/lib/localScriptureStore";
import { scriptureCatalog, type CatalogBook } from "@/lib/scriptureCatalog";
import { QUICK_NAV_BOOKS } from "@/lib/scriptureQuickNav";

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

const SCRIPTURE_DATA_DIR = path.join(process.cwd(), "public", "scripture-data");

const QUICK_NAV_BY_BOOK = new Map(QUICK_NAV_BOOKS.map((book) => [`${book.volume}:${book.book}`, book]));

/** Verse text, read one volume at a time and only when a chapter in it is requested. */
const localStore = createLocalScriptureStore(
  scriptureCatalog,
  async (volume) =>
    JSON.parse(
      await readFile(path.join(SCRIPTURE_DATA_DIR, path.basename(volume.bundlePath)), "utf8")
    ) as LocalVolumeBundle,
  (volume) => (isBibleVolume(volume) ? "lds" : undefined)
);

function toBrowseBook(book: CatalogBook): LocalBrowseBook {
  const restoration = !isBibleVolume(book.volume);
  return {
    id: book.book,
    label: book.label,
    chapters: book.chapterCount,
    chapterDelineation: book.chapterDelineation,
    chapterVerseCounts: book.verseCounts,
    titleShort: book.shortTitle ?? undefined,
    titleOfficial: book.longTitle ?? undefined,
    subtitle: book.subtitle,
    abbreviations: restoration
      ? QUICK_NAV_BY_BOOK.get(`${book.volume}:${book.book}`)?.abbreviations ?? [book.label]
      : [book.shortTitle ?? book.title],
  };
}

export async function getLocalLdsChapter(
  volume: string,
  book: string,
  chapter: number
): Promise<LocalChapterResponse | null> {
  // The catalog answers misses without reading any verse bundle.
  return await localStore.getChapter(volume, book, chapter);
}

export async function getLocalLdsBook(volume: string, book: string): Promise<LocalBookResponse | null> {
  const entry = scriptureCatalog.getBook(volume, book);
  if (!entry) return null;
  return {
    _id: entry.book,
    title: entry.label,
    titleShort: entry.shortTitle ?? undefined,
    titleOfficial: entry.longTitle ?? undefined,
    subtitle: entry.subtitle,
    chapterDelineation: entry.chapterDelineation,
    chapters: Array.from({ length: entry.chapterCount }, (_, index) => ({ _id: `${entry.book}-${index + 1}` })),
  };
}

export async function getLocalLdsBooks(volume: string): Promise<LocalBrowseBook[]> {
  return scriptureCatalog.getBooks(volume).map(toBrowseBook);
}

export async function getLocalLdsVolumes(): Promise<LocalVolumeSummary[]> {
  return scriptureCatalog.volumes.map((volume) => ({
    id: volume.volume,
    label: volume.title,
    shortLabel:
      volume.volume === "doctrineandcovenants" ? `${volume.chapterCount} sections` : `${volume.bookCount} books`,
    bookCount: volume.bookCount,
    chapterCount: volume.chapterCount,
  }));
}

export async function findLocalLdsBook(book: string): Promise<{ volume: string; book: LocalBrowseBook } | null> {
  const entry = scriptureCatalog.findBook(book);
  if (!entry) return null;
  return { volume: entry.volume, book: toBrowseBook(entry) };
}
