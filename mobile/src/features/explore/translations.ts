// Bible translation comparison (the web reader's translations, from the public HelloAO Bible API) through the web's
// own client (src/lib/helloaoApi.ts). Only Bible chapters have translations to compare.

import { fetchAvailableHelloaoTranslations, fetchHelloaoChapter, type HelloaoTranslation } from "@/lib/helloaoApi";
import { getBibleBookBySlug } from "@/lib/bibleCanon";
import { withTimeout } from "./network";

export type { HelloaoTranslation };

let catalog: Promise<HelloaoTranslation[]> | null = null;

export function loadTranslations(): Promise<HelloaoTranslation[]> {
  catalog ??= withTimeout(fetchAvailableHelloaoTranslations(), 15000).catch((error) => {
    catalog = null;
    throw error instanceof Error && error.message.includes("too long") ? error : new Error("Couldn't load the translation list. Check your connection and try again.");
  });
  return catalog;
}

export function canCompare(volume: string, book: string): boolean {
  return (volume === "oldtestament" || volume === "newtestament") && !!getBibleBookBySlug(book);
}

export async function loadComparison(book: string, chapter: number, translationId: string) {
  try {
    return await withTimeout(fetchHelloaoChapter(book, chapter, translationId), 15000);
  } catch (error) {
    throw error instanceof Error && error.message.includes("too long") ? error : new Error("Couldn't load this chapter in that translation. Check your connection and try again.");
  }
}

export function normalizeCompareText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Translations to offer: English first, then the rest, each language's own name shown. */
export function sortTranslations(list: HelloaoTranslation[], query: string): HelloaoTranslation[] {
  const q = query.trim().toLowerCase();
  return list
    .filter((item) => !q || [item.id, item.name, item.englishName, item.languageEnglishName, item.languageName].some((field) => field?.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.language === "eng") - Number(a.language === "eng") || (a.englishName ?? a.name).localeCompare(b.englishName ?? b.name));
}
