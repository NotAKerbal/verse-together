import { createChapterRequestCache, isSubstitutedTranslation, type ChapterRequest } from "@/lib/chapterRequestCache";
import { readJstResponse, type JstChapterTarget, type JstExcerpt } from "@/lib/jst";
import { WEB_ORIGIN } from "../../navigation/hrefs";
import { getJson, NetworkError } from "../explore/network";

const TIMEOUT_MS = 15000;

// ---- Comparison translations ----

export type ComparisonChapterResponse = { reference?: string; translation?: string; verses: Array<{ verse: number; text: string }> };

function readChapterResponse(body: unknown): ComparisonChapterResponse {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const verses = Array.isArray(record?.verses)
    ? (record.verses as unknown[]).flatMap((item) => {
        const verse = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
        return verse && Number.isInteger(verse.verse) && typeof verse.text === "string" && verse.text.trim()
          ? [{ verse: verse.verse as number, text: verse.text }]
          : [];
      })
    : [];
  if (verses.length === 0) throw new NetworkError("This translation has no verses for the chapter.", "format");
  return {
    reference: typeof record?.reference === "string" ? record.reference : undefined,
    translation: typeof record?.translation === "string" ? record.translation : undefined,
    verses,
  };
}

/** One chapter in another Bible translation, as the web reader's overlay loader reads it. */
export async function fetchComparisonChapter(request: ChapterRequest, signal?: AbortSignal): Promise<ComparisonChapterResponse> {
  const params = new URLSearchParams({ volume: request.volume, book: request.book, chapter: String(request.chapter) });
  if (request.translation) params.set("translation", request.translation);
  return readChapterResponse(await getJson<unknown>(`${WEB_ORIGIN}/api/scriptures/chapter?${params.toString()}`, TIMEOUT_MS, signal));
}

// The web's shared chapter cache rules: one request per chapter and translation at a time, successes kept for the
// session, and a substituted answer (the site fell back to another text) shown once but never kept.
export const comparisonChapters = createChapterRequestCache<ComparisonChapterResponse>((request) => fetchComparisonChapter(request), {
  maxEntries: 40,
  retain: (request, value) => !isSubstitutedTranslation(request.translation, value.translation),
});

// ---- Joseph Smith Translation excerpts ----

// Chapters already loaded this session, so going back to one shows its excerpts at once. Failures aren't kept.
const jstExcerpts = new Map<string, JstExcerpt[]>();

export function cachedJstExcerpts(key: string): JstExcerpt[] | undefined {
  return jstExcerpts.get(key);
}

export async function fetchJstExcerpts(target: JstChapterTarget, key: string, signal?: AbortSignal): Promise<JstExcerpt[]> {
  const params = new URLSearchParams({ volume: target.volume, book: target.book, chapter: String(target.chapter) });
  // A source failure keeps the route's own words ("The JST source took too long to respond.").
  const body = await getJson<unknown>(`${WEB_ORIGIN}/api/scriptures/jst?${params.toString()}`, TIMEOUT_MS, signal);
  const excerpts = readJstResponse(body, target);
  if (!excerpts) throw new NetworkError("The JST answer didn't match this chapter.", "format");
  jstExcerpts.set(key, excerpts);
  return excerpts;
}

export function clearStudyCaches() {
  jstExcerpts.clear();
  comparisonChapters.clear();
}
