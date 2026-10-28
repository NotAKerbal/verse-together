// Browser chapter loading: the bundled LDS text comes from IndexedDB or the static bundle first; only a chapter
// outside the bundle, or a Bible translation overlay, goes to the server (/api/scriptures/chapter). All loads go
// through one shared cache, so previews, prefetch, and overlays never fetch the same chapter twice at once.

import { isBibleVolume } from "@/lib/bibleCanon";
import {
  createChapterRequestCache,
  isSubstitutedTranslation,
  normalizeRequestTranslation,
  type ChapterRequest,
} from "@/lib/chapterRequestCache";
import type { ChapterResponse } from "@/lib/openscripture";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";

export type { ChapterRequest } from "@/lib/chapterRequestCache";

function canonicalRequest(request: ChapterRequest): ChapterRequest {
  const volume = normalizeScriptureVolume(request.volume);
  // Translation ids keep their case (some catalog ids are case-sensitive); only the cache key folds it.
  const translation = (request.translation ?? "").trim();
  const overlay = isBibleVolume(volume) && normalizeRequestTranslation(translation) !== "";
  return { volume, book: request.book, chapter: request.chapter, translation: overlay ? translation : undefined };
}

async function readLocalChapter(request: ChapterRequest): Promise<ChapterResponse | null> {
  try {
    const { readDesktopChapter } = await import("@/lib/desktop");
    const native = await readDesktopChapter(request.volume, request.book, request.chapter);
    if (native) return native;
  } catch {
    // Keep the existing browser/server fallback if the native layer is unavailable.
  }
  try {
    const { readBrowserScriptureChapter } = await import("@/lib/browserScriptureStorage");
    const local = await readBrowserScriptureChapter(request.volume, request.book, request.chapter);
    if (!local || local.verses.length === 0) return null;
    return {
      reference: local.reference,
      translation: isBibleVolume(request.volume) ? "lds" : undefined,
      verses: local.verses,
    };
  } catch {
    return null;
  }
}

async function loadChapterFromSources(request: ChapterRequest): Promise<ChapterResponse> {
  if (!request.translation) {
    const local = await readLocalChapter(request);
    if (local) return local;
  }

  const params = new URLSearchParams({
    volume: request.volume,
    book: request.book,
    chapter: String(request.chapter),
  });
  if (request.translation) params.set("translation", request.translation);
  const response = await fetch(`/api/scriptures/chapter?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Chapter request failed (${response.status})`);
  }
  const data = (await response.json()) as ChapterResponse;
  if (!Array.isArray(data?.verses) || data.verses.length === 0) {
    throw new Error("Chapter request returned no verses");
  }
  return data;
}

// A substituted overlay (the server fell back to another text) is returned to the callers waiting on it, so their
// notice still shows, but not kept: the next request retries the translation instead of repeating the fallback.
const chapterCache = createChapterRequestCache<ChapterResponse>(loadChapterFromSources, {
  maxEntries: 40,
  retain: (request, value) => !isSubstitutedTranslation(request.translation, value.translation),
});

export function loadChapter(request: ChapterRequest): Promise<ChapterResponse> {
  return chapterCache.load(canonicalRequest(request));
}

export function peekChapter(request: ChapterRequest): ChapterResponse | undefined {
  return chapterCache.peek(canonicalRequest(request));
}

export function primeChapter(request: ChapterRequest, value: ChapterResponse) {
  chapterCache.prime(canonicalRequest(request), value);
}
