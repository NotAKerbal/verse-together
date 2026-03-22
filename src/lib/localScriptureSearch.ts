import {
  ensureBrowserScriptureStorage,
  getBrowserScriptureStorageStatus,
  resolveBrowserScriptureReference,
  searchBrowserScriptures,
  type ScriptureStorageStatus,
} from "@/lib/browserScriptureStorage";
import { getQuickNavSuggestions } from "@/lib/scriptureQuickNav";
import { getScriptureVolumeLabel } from "@/lib/scriptureVolumes";

const MAX_REFERENCE_RESULTS = 8;
const MAX_VERSE_RESULTS = 40;

export type SearchStoreStatus = "idle" | "loading" | "ready" | "error";

export type LocalScriptureReferenceResult = {
  id: string;
  label: string;
  href: string;
  volumeTitle: string;
  chapterNumber: number;
  verseNumber?: number;
};

export type LocalScriptureVerseResult = {
  id: string;
  reference: string;
  shortReference: string;
  text: string;
  snippet: string;
  href: string;
  volumeTitle: string;
  chapterNumber: number;
  verseNumber: number;
};

export type LocalScriptureSearchResults = {
  referenceResults: LocalScriptureReferenceResult[];
  verseResults: LocalScriptureVerseResult[];
};

let loadPromise: Promise<ScriptureStorageStatus> | null = null;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitTerms(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}

function queryLooksLikeReference(query: string): boolean {
  return /\d/.test(query);
}

function buildReferenceResults(query: string): LocalScriptureReferenceResult[] {
  if (!queryLooksLikeReference(query)) return [];

  return getQuickNavSuggestions(query, MAX_REFERENCE_RESULTS).map((suggestion) => ({
    id: suggestion.key,
    label: suggestion.label,
    href: suggestion.href,
    volumeTitle: getScriptureVolumeLabel(suggestion.volume),
    chapterNumber: suggestion.chapter,
    verseNumber: suggestion.verse,
  }));
}

function createSnippet(text: string, query: string): string {
  const compactText = text.replace(/\s+/g, " ").trim();
  const normalizedText = normalizeText(compactText);
  const normalizedQuery = normalizeText(query);
  const terms = splitTerms(query);
  let matchIndex = normalizedQuery ? normalizedText.indexOf(normalizedQuery) : -1;

  if (matchIndex < 0) {
    for (const term of terms) {
      matchIndex = normalizedText.indexOf(term);
      if (matchIndex >= 0) break;
    }
  }

  if (matchIndex < 0) {
    return compactText.length > 180 ? `${compactText.slice(0, 177).trimEnd()}...` : compactText;
  }

  const roughStart = Math.max(0, matchIndex - 52);
  const roughEnd = Math.min(compactText.length, matchIndex + Math.max(normalizedQuery.length, 24) + 76);
  const start = roughStart > 0 ? compactText.indexOf(" ", roughStart) + 1 : 0;
  const endSpace = compactText.lastIndexOf(" ", roughEnd);
  const end = endSpace > start ? endSpace : roughEnd;
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compactText.length ? "..." : "";
  return `${prefix}${compactText.slice(start, end).trim()}${suffix}`;
}

function toSearchStoreStatus(status: ScriptureStorageStatus): SearchStoreStatus {
  if (status.source === "bundle") return "ready";
  if (status.state === "error") return "error";
  if (status.state === "ready" || status.state === "bundle-only") return "ready";
  if (status.state === "installing") return "loading";
  return "idle";
}

export async function getLocalScriptureStoreStatus(): Promise<SearchStoreStatus> {
  const status = await getBrowserScriptureStorageStatus();
  return toSearchStoreStatus(status);
}

export async function loadLocalScriptureStore(): Promise<SearchStoreStatus> {
  if (!loadPromise) {
    loadPromise = ensureBrowserScriptureStorage().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }

  const status = await loadPromise;
  return toSearchStoreStatus(status);
}

export async function searchLocalScriptures(query: string): Promise<LocalScriptureSearchResults> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      referenceResults: [],
      verseResults: [],
    };
  }

  const terms = splitTerms(trimmed);
  if (terms.length === 0) {
    return {
      referenceResults: [],
      verseResults: [],
    };
  }

  const referenceResults = buildReferenceResults(trimmed);
  const verseMatches = queryLooksLikeReference(trimmed)
    ? await resolveBrowserScriptureReference(trimmed, { limit: MAX_VERSE_RESULTS })
    : [];
  const fallbackVerseMatches =
    verseMatches.length > 0 ? verseMatches : await searchBrowserScriptures(trimmed, { limit: MAX_VERSE_RESULTS });

  return {
    referenceResults,
    verseResults: fallbackVerseMatches.map((record) => ({
      id: `${record.volume}:${record.book}:${record.chapter}:${record.verse}`,
      reference: record.reference,
      shortReference: record.reference,
      text: record.text,
      snippet: createSnippet(record.text, trimmed),
      href: `/browse/${record.volume}/${record.book}/${record.chapter}#v-${record.verse}`,
      volumeTitle: record.volumeTitle,
      chapterNumber: record.chapter,
      verseNumber: record.verse,
    })),
  };
}
