import { namedVersePassages } from "../src/lib/cfm/cfmScriptures.mjs";
import { chapterKey, passageTarget, passageTitle, type PassageTarget } from "../src/features/comeFollowMe/passagePreview.ts";
import { MAX_EVIDENCE_BYTES, utf8Bytes } from "./chapterGuideBudget";
import { type ChapterGuideContent, guideProse } from "./chapterGuideContent";

export const MAX_EVIDENCE_REFERENCES = 40;
export const MAX_EVIDENCE_CHAPTERS = 24;
export const MAX_EVIDENCE_VERSES_PER_REFERENCE = 30;
const MAX_REFERENCE_CHARS = 120;
const MAX_CHAPTER_RESPONSE_BYTES = 512 * 1024;
const EVIDENCE_TIMEOUT_MS = 8_000;

export type EvidenceRequest = {
  reference: string;
  volume: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
};

export type CrossReferenceEvidence =
  | { reference: string; status: "supplied"; canonical_reference: string; verses: Array<{ verse: number; text: string }> }
  | { reference: string; status: "invalid_reference" | "unavailable" | "not_supplied" };

type ChapterVerses = Array<{ verse: number; text: string }>;

function coordinates(request: EvidenceRequest): string {
  return `${request.volume}/${request.book}/${request.chapter}/${request.verse_start}-${request.verse_end}`;
}

export function guideEvidenceRequests(guide: ChapterGuideContent, chapterReference: string): EvidenceRequest[] {
  const structured = guide.passages.flatMap((passage) =>
    passage.cross_references.map(({ reference, volume, book, chapter, verse_start, verse_end }) => ({
      reference,
      volume,
      book,
      chapter,
      verse_start,
      verse_end,
    }))
  );
  const named = guideProse(guide).flatMap((paragraph) =>
    namedVersePassages(paragraph).map(({ reference, volume, book, chapter, first, last }) => ({
      reference,
      volume,
      book,
      chapter,
      verse_start: first,
      verse_end: last,
    }))
  );
  const seen = new Set<string>();
  return [...structured, ...named].filter((request) => {
    if (request.reference.startsWith(`${chapterReference}:`)) return false;
    const key = coordinates(request);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scriptureSiteOrigin(siteUrl: string | undefined): string | null {
  try {
    const url = new URL(siteUrl?.trim() ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

function readChapterVerses(body: string): ChapterVerses | null {
  try {
    const parsed = JSON.parse(body) as { verses?: unknown };
    if (!Array.isArray(parsed.verses)) return null;
    const verses = parsed.verses as Array<{ verse?: unknown; text?: unknown }>;
    if (!verses.every((item) => Number.isInteger(item?.verse) && typeof item?.text === "string")) return null;
    return verses as ChapterVerses;
  } catch {
    return null;
  }
}

async function fetchChapter(origin: string, target: PassageTarget, fetcher: typeof fetch): Promise<ChapterVerses | null> {
  const query = new URLSearchParams({ volume: target.volume, book: target.book, chapter: String(target.chapter) });
  try {
    const response = await fetcher(`${origin}/api/scriptures/lds-chapter?${query}`, {
      redirect: "error",
      signal: AbortSignal.timeout(EVIDENCE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.text();
    return utf8Bytes(body) <= MAX_CHAPTER_RESPONSE_BYTES ? readChapterVerses(body) : null;
  } catch {
    return null;
  }
}

export async function lookupCrossReferenceEvidence(
  requests: readonly EvidenceRequest[],
  siteUrl: string | undefined,
  fetcher: typeof fetch = fetch
): Promise<CrossReferenceEvidence[]> {
  const entries = requests.slice(0, MAX_EVIDENCE_REFERENCES).map((request) => ({
    reference: request.reference.slice(0, MAX_REFERENCE_CHARS),
    target: passageTarget(request.volume, request.book, request.chapter, request.verse_start, request.verse_end),
  }));
  const origin = scriptureSiteOrigin(siteUrl);
  const chapters = new Map<string, PassageTarget>();
  for (const { target } of entries) {
    if (!target || chapters.size >= MAX_EVIDENCE_CHAPTERS) continue;
    if (!chapters.has(chapterKey(target))) chapters.set(chapterKey(target), target);
  }
  const loaded = new Map<string, ChapterVerses | null>(
    origin
      ? await Promise.all(
          Array.from(chapters, async ([key, target]) => [key, await fetchChapter(origin, target, fetcher)] as const)
        )
      : []
  );

  const results: CrossReferenceEvidence[] = entries.map(({ reference, target }) => {
    if (!target) return { reference, status: "invalid_reference" };
    const key = chapterKey(target);
    if (!chapters.has(key)) return { reference, status: "not_supplied" };
    const verses = loaded.get(key);
    if (!verses) return { reference, status: "unavailable" };
    const first = target.first as number;
    const last = target.last as number;
    const count = last - first + 1;
    const selected = verses.filter((item) => item.verse >= first && item.verse <= last);
    if (selected.length !== count) return { reference, status: "invalid_reference" };
    if (count > MAX_EVIDENCE_VERSES_PER_REFERENCE) return { reference, status: "not_supplied" };
    return { reference, status: "supplied", canonical_reference: passageTitle(target), verses: selected };
  });
  return fitEvidenceBound(results);
}

function fitEvidenceBound(results: readonly CrossReferenceEvidence[]): CrossReferenceEvidence[] {
  const entryBytes = (entry: CrossReferenceEvidence) => utf8Bytes(JSON.stringify(entry)) + 1;
  const withoutText = (entry: CrossReferenceEvidence): CrossReferenceEvidence =>
    entry.status === "supplied" ? { reference: entry.reference, status: "not_supplied" } : entry;
  let total = 2;
  const stubs: CrossReferenceEvidence[] = [];
  for (const entry of results) {
    const stub = withoutText(entry);
    if (total + entryBytes(stub) > MAX_EVIDENCE_BYTES) break;
    total += entryBytes(stub);
    stubs.push(stub);
  }
  return stubs.map((stub, index) => {
    const entry = results[index]!;
    if (entry.status !== "supplied") return stub;
    const added = entryBytes(entry) - entryBytes(stub);
    if (total + added > MAX_EVIDENCE_BYTES) return stub;
    total += added;
    return entry;
  });
}
