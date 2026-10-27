// Loads a Bible chapter's Joseph Smith Translation appendix excerpts from the Open Scripture API study helps.
// Only ids built from a validated book and chapter (or the fixed cross-chapter list) are ever requested, so
// the route can't be pointed at another URL. A 404 "entry not found" means the appendix has nothing for that
// entry; any other failure is an error, so the reader can tell "no excerpts" from "couldn't load".

import {
  JST_API_BASE,
  JST_MAX_ENTRY_BYTES,
  JST_UPSTREAM_TIMEOUT_MS,
  buildJstChapterExcerpts,
  jstChapterTarget,
  jstEntryIdsForChapter,
  type JstChapterExcerpts,
} from "./jst.ts";

type FetchLike = (input: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

export class JstUpstreamError extends Error {
  readonly timedOut: boolean;

  constructor(message: string, timedOut = false) {
    super(message);
    this.name = "JstUpstreamError";
    this.timedOut = timedOut;
  }
}

/** One appendix entry, or null when the source says it doesn't exist. */
export async function fetchJstEntry(
  id: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = JST_UPSTREAM_TIMEOUT_MS
): Promise<unknown | null> {
  if (!/^jst-[a-z0-9]+-\d+(?:-\d+)?$/.test(id)) throw new JstUpstreamError("Invalid JST entry id.");
  let response: Response;
  try {
    response = await fetchImpl(`${JST_API_BASE}/entry/${id}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      // The appendix doesn't change often; let Next's data cache keep entries for a day.
      next: { revalidate: 86400 },
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new JstUpstreamError(timedOut ? "The JST source took too long to respond." : "Could not reach the JST source.", timedOut);
  }

  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > JST_MAX_ENTRY_BYTES) throw new JstUpstreamError("JST entry was too large.");
  let text: string;
  try {
    // Bound actual bytes while reading, including chunked replies without Content-Length.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > JST_MAX_ENTRY_BYTES) {
            await reader.cancel();
            throw new JstUpstreamError("JST entry was too large.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof JstUpstreamError) throw error;
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new JstUpstreamError(timedOut ? "The JST source took too long to respond." : "Could not read the JST source.", timedOut);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }

  if (response.status === 404) {
    // The API's own "not found" answer is JSON with an error message; any other 404 is a broken path, not an absence.
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" &&
      (body as { error: string }).error === `Entry not found with id: ${id}`) return null;
    throw new JstUpstreamError("The JST source answered with an unexpected 404.");
  }
  if (!response.ok) throw new JstUpstreamError(`The JST source answered ${response.status}.`);
  if (!body || typeof body !== "object") throw new JstUpstreamError("The JST source sent an unreadable entry.");
  const entry = body as Record<string, unknown>;
  if (entry._id !== id || entry.type !== "jst" || !Array.isArray(entry.sections) || entry.sections.length === 0 ||
    entry.sections.some((section: unknown) => {
      if (!section || typeof section !== "object") return true;
      const value = section as Record<string, unknown>;
      return typeof value.label !== "string" || typeof value.compareReference !== "string" || !Array.isArray(value.verses) ||
        value.verses.some((verse: unknown) => {
          if (!verse || typeof verse !== "object") return true;
          const record = verse as Record<string, unknown>;
          return typeof record.text !== "string" || !record.text.trim() ||
            (typeof record.verseNumber !== "string" && typeof record.verseNumber !== "number");
        });
    })) {
    throw new JstUpstreamError("The JST source sent an unexpected entry.");
  }
  return body;
}

export type JstRouteResult = { status: number; body: JstChapterExcerpts | { error: string }; cacheControl: string };

/** GET /api/scriptures/jst?volume=…&book=…&chapter=… as plain data, so it can be tested without a server. */
export async function handleJstRequest(params: URLSearchParams, fetchImpl: FetchLike = fetch): Promise<JstRouteResult> {
  const target = jstChapterTarget(params.get("volume") ?? "", params.get("book") ?? "", params.get("chapter") ?? "");
  if (!target) {
    return { status: 400, body: { error: "JST excerpts are only available for a valid Old or New Testament chapter." }, cacheControl: "no-store" };
  }
  try {
    const entries = await Promise.all(jstEntryIdsForChapter(target).map((id) => fetchJstEntry(id, fetchImpl)));
    const excerpts = buildJstChapterExcerpts(target, entries.filter((entry) => entry !== null));
    return {
      status: 200,
      body: { volume: target.volume, book: target.book, chapter: target.chapter, excerpts },
      cacheControl: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    };
  } catch (error) {
    const timedOut = error instanceof JstUpstreamError && error.timedOut;
    return {
      status: timedOut ? 504 : 502,
      body: { error: error instanceof JstUpstreamError ? error.message : "Could not load JST excerpts." },
      cacheControl: "no-store",
    };
  }
}
