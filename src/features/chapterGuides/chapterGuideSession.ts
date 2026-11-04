import type { ChapterGuideSelectionState } from "@/lib/chapterGuideView";

export const CHAPTER_GUIDE_POLL_INTERVAL_MS = 15_000;

const REQUEST_FAILED = "We couldn’t start this chapter guide.";

export type ChapterGuideSession = {
  load: () => Promise<void>;
  request: () => Promise<{ error: string | null } | null>;
  dispose: () => void;
};

export function createChapterGuideSession(
  chapter: { volume: string; book: string; chapter: number },
  verseSpec: string,
  handlers: { onState: (state: ChapterGuideSelectionState) => void; onLoadFailed: () => void }
): ChapterGuideSession {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  let latestLoad = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function load() {
    latestLoad += 1;
    const loadId = latestLoad;
    const params = new URLSearchParams({ volume: chapter.volume, book: chapter.book, chapter: String(chapter.chapter), verses: verseSpec });
    try {
      const response = await fetch(`/api/chapter-guides?${params}`, { signal });
      if (!response.ok) throw new Error("Unable to load the chapter guide");
      const next = (await response.json()) as ChapterGuideSelectionState;
      if (signal.aborted || loadId !== latestLoad) return;
      handlers.onState(next);
      if (!next.generating) stopPolling();
      else if (pollTimer === null) pollTimer = setInterval(() => void load(), CHAPTER_GUIDE_POLL_INTERVAL_MS);
    } catch {
      if (!signal.aborted && loadId === latestLoad) handlers.onLoadFailed();
    }
  }

  async function request() {
    try {
      const response = await fetch("/api/chapter-guides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chapter),
        signal,
      });
      let error: string | null = null;
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        error = body?.error ?? REQUEST_FAILED;
      }
      if (signal.aborted) return null;
      await load();
      return signal.aborted ? null : { error };
    } catch {
      return signal.aborted ? null : { error: REQUEST_FAILED };
    }
  }

  return {
    load,
    request,
    dispose() {
      stopPolling();
      lifetime.abort();
    },
  };
}
