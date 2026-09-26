import { QUICK_NAV_BOOKS, type QuickNavBook } from "@/lib/scriptureQuickNav";
import { normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "@/lib/scriptureVolumes";

export const PLAN_VOLUME_IDS = [
  "bookofmormon",
  "oldtestament",
  "newtestament",
  "doctrineandcovenants",
  "pearl",
] as const;

export type ChapterRef = { volume: string; book: string; chapter: number };

export function getCatalogBooks(volume: string): QuickNavBook[] {
  const canonical = normalizeScriptureVolume(volume);
  return QUICK_NAV_BOOKS.filter((entry) => entry.volume === canonical);
}

export function findCatalogBook(volume: string, book: string): QuickNavBook | null {
  const canonical = normalizeScriptureVolume(volume);
  return QUICK_NAV_BOOKS.find((entry) => entry.volume === canonical && entry.book === book) ?? null;
}

export function getChapterDelineation(volume: string): "Section" | "Chapter" {
  return normalizeScriptureVolume(volume) === "doctrineandcovenants" ? "Section" : "Chapter";
}

export function getBookLabel(volume: string, book: string): string {
  const entry = findCatalogBook(volume, book);
  if (!entry) return book.replace(/-/g, " ");
  return entry.book === "doctrineandcovenants" ? "D&C" : entry.label;
}

export function formatChapterLabel(ref: ChapterRef): string {
  return `${getBookLabel(ref.volume, ref.book)} ${ref.chapter}`;
}

export function getBookHref(volume: string, book: string): string {
  return `/browse/${toScriptureVolumeUrlSlug(volume)}/${book}`;
}

export function getChapterHref(ref: ChapterRef): string {
  return `${getBookHref(ref.volume, ref.book)}/${ref.chapter}`;
}
