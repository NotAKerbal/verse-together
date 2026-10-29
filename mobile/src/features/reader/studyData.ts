// What the web reader loads after a chapter's text, from the Verse Together site's public API (the same routes and
// response shapes the web reader reads): comparison translations of a Bible chapter (/api/scriptures/chapter),
// its Joseph Smith Translation excerpts (/api/scriptures/jst) and the chapter's study paths (/api/insights/chapter).
// Each request has a time limit and can be cancelled; a failure is never cached, so Try again asks again, and an
// answer that doesn't match the request is rejected rather than shown. Researching study paths for a chapter none
// are cached for is the one request sent as the signed-in account (src/account/siteAuth.ts).

import { CHAPTER_INSIGHT_KINDS, type ChapterStudyPath } from "@/lib/chapterInsights";
import { createChapterRequestCache, isSubstitutedTranslation, type ChapterRequest } from "@/lib/chapterRequestCache";
import { readJstResponse, type JstChapterTarget, type JstExcerpt } from "@/lib/jst";
import { SiteAuthError, type SiteAuth } from "../../account/siteAuth";
import { WEB_ORIGIN } from "../../navigation/hrefs";
import { getJson, NetworkError, withTimeout } from "../explore/network";

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

// ---- Chapter study paths ----

const studyPaths = new Map<string, ChapterStudyPath[]>();

export function studyPathsKey(volume: string, book: string, chapter: number): string {
  return `${volume}/${book}/${chapter}`;
}

export function cachedStudyPaths(key: string): ChapterStudyPath[] | undefined {
  return studyPaths.get(key);
}

const KINDS = new Set<string>(CHAPTER_INSIGHT_KINDS);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && !!item.trim()) : []);

/** The paths of an /api/insights/chapter answer that are complete enough to show; anything else is dropped. */
export function readStudyPaths(body: unknown): ChapterStudyPath[] {
  const list = body && typeof body === "object" ? (body as { paths?: unknown }).paths : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): ChapterStudyPath[] => {
    if (!item || typeof item !== "object") return [];
    const path = item as Record<string, unknown>;
    const verseNumbers = Array.isArray(path.verse_numbers) ? path.verse_numbers.filter((verse): verse is number => Number.isInteger(verse) && (verse as number) > 0) : [];
    if (typeof path.kind !== "string" || !KINDS.has(path.kind) || verseNumbers.length === 0) return [];
    if (typeof path.title !== "string" || !path.title.trim() || typeof path.direction !== "string") return [];
    const sources = Array.isArray(path.sources)
      ? path.sources.flatMap((source) => {
          const value = source && typeof source === "object" ? (source as Record<string, unknown>) : null;
          return value && typeof value.url === "string" && /^https:\/\//.test(value.url) && typeof value.title === "string"
            ? [{ title: value.title, url: value.url, format: value.format === "video" ? ("video" as const) : ("article" as const) }]
            : [];
        })
      : [];
    const links = Array.isArray(path.scripture_links)
      ? path.scripture_links.flatMap((link) => {
          const value = link && typeof link === "object" ? (link as Record<string, unknown>) : null;
          return value &&
            typeof value.reference === "string" &&
            typeof value.volume === "string" &&
            typeof value.book === "string" &&
            Number.isInteger(value.chapter) &&
            Number.isInteger(value.verse_start) &&
            Number.isInteger(value.verse_end)
            ? [{ reference: value.reference, volume: value.volume, book: value.book, chapter: value.chapter as number, verse_start: value.verse_start as number, verse_end: value.verse_end as number }]
            : [];
        })
      : [];
    return [
      {
        kind: path.kind as ChapterStudyPath["kind"],
        verse_numbers: verseNumbers,
        title: path.title,
        direction: path.direction,
        why: typeof path.why === "string" ? path.why : "",
        look_for: strings(path.look_for),
        sources,
        scripture_links: links,
      },
    ];
  });
}

export type StudyPathsResult =
  | { status: "ready"; paths: ChapterStudyPath[] }
  /** None to show: none cached and the site won't research one now (`sign-in`: only for a signed-in reader). */
  | { status: "none"; reason?: "sign-in" };

/** Researching a chapter (a paid web search on the site, which itself waits up to 45 seconds) gets longer. */
export const GENERATE_TIMEOUT_MS = 75000;

const cancelled = () => new NetworkError("The request was cancelled.", "aborted");

/** One POST to the study paths route; a failure to connect, a timeout or a cancel throws, any HTTP answer returns. */
async function postStudyPaths(
  send: (signal: AbortSignal) => Promise<Response>,
  ms: number,
  signal?: AbortSignal
): Promise<{ response: Response; body: unknown; parsed: boolean }> {
  if (signal?.aborted) throw cancelled();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel);
  try {
    let response: Response;
    try {
      response = await withTimeout(send(controller.signal), ms, cancel);
    } catch (error) {
      if (signal?.aborted) throw cancelled();
      if (error instanceof NetworkError || error instanceof SiteAuthError) throw error;
      throw new NetworkError("Couldn't connect. Check your internet connection and try again.", "offline");
    }
    let body: unknown = null;
    let parsed = true;
    try {
      body = await withTimeout(response.json() as Promise<unknown>, TIMEOUT_MS, cancel);
    } catch (error) {
      if (signal?.aborted) throw cancelled();
      if (error instanceof NetworkError && error.kind === "timeout") throw error;
      parsed = false;
    }
    if (signal?.aborted) throw cancelled();
    return { response, body, parsed };
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

function routeMessage(body: unknown): string | null {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return typeof error === "string" && error.trim() ? error : null;
}

/**
 * A chapter's study paths, as the web reader asks for them. The site answers from its cache without an account. A
 * chapter with none cached is researched only for a signed-in reader: with `auth` (the verified account's SiteAuth),
 * the same request is sent again as that account, to its own site, and `onGenerating` says the slower research has
 * begun. Its answer counts only while that account is still the one signed in; otherwise the request reports
 * itself cancelled and nothing is kept.
 */
export async function fetchStudyPaths(
  volume: string,
  book: string,
  chapter: number,
  signal?: AbortSignal,
  { auth = null, onGenerating }: { auth?: SiteAuth | null; onGenerating?: () => void } = {}
): Promise<StudyPathsResult> {
  const key = studyPathsKey(volume, book, chapter);
  const payload = JSON.stringify({ volume, book, chapter });
  const headers = { accept: "application/json", "content-type": "application/json" };
  const keep = (body: unknown): StudyPathsResult => {
    const paths = readStudyPaths(body);
    studyPaths.set(key, paths);
    return paths.length ? { status: "ready", paths } : { status: "none" };
  };

  const cache = await postStudyPaths(
    (requestSignal) => fetch(`${WEB_ORIGIN}/api/insights/chapter`, { method: "POST", headers, body: payload, signal: requestSignal }),
    TIMEOUT_MS,
    signal
  );
  if (cache.response.ok) {
    if (!cache.parsed) throw new NetworkError("The study paths answer couldn't be read.", "format");
    return keep(cache.body);
  }
  // Anything but "sign in to research it" means the site has nothing to give for this chapter now.
  if (cache.response.status !== 401) return { status: "none" };
  if (!auth || !auth.live()) return { status: "none", reason: "sign-in" };

  onGenerating?.();
  let research: Awaited<ReturnType<typeof postStudyPaths>>;
  try {
    research = await postStudyPaths(
      (requestSignal) => auth.fetch("/api/insights/chapter", { method: "POST", headers, body: payload, signal: requestSignal }),
      GENERATE_TIMEOUT_MS,
      signal
    );
  } catch (error) {
    if (error instanceof SiteAuthError) {
      if (error.reason === "changed") throw cancelled();
      throw new NetworkError(error.message, "http", 401);
    }
    if (error instanceof NetworkError && error.kind === "timeout") {
      throw new NetworkError("Researching this chapter took too long. Try again in a moment.", "timeout");
    }
    throw error;
  }
  // Signed out or into another account while the research ran: its answer isn't this reader's to show.
  if (!auth.live()) throw cancelled();
  if (research.response.ok) {
    if (!research.parsed) throw new NetworkError("The study paths answer couldn't be read.", "format");
    return keep(research.body);
  }
  const status = research.response.status;
  // Not configured on this site, or a chapter it doesn't have: nothing to retry.
  if (status === 503 || status === 404 || status === 400) return { status: "none" };
  const message =
    status === 401 || status === 403
      ? "Verse Together couldn't confirm your sign-in, so this chapter wasn't researched. Try again."
      : (routeMessage(research.body) ?? "Study paths couldn't be researched right now.") + " Try again.";
  throw new NetworkError(message, "http", status);
}

/** Forget this session's loaded excerpts and paths (tests). */
export function clearStudyCaches() {
  jstExcerpts.clear();
  studyPaths.clear();
  comparisonChapters.clear();
}
