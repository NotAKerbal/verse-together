// Shared in-memory cache for chapter loads in the browser. Every caller asking for the same chapter (the reader's
// swipe previews, idle prefetch, comparison overlays) shares one in-flight promise and, once it settles, its
// value. Failures, and values the caller says not to retain, are dropped so a later request retries. Pure (no DOM,
// no fetch), so the rules are testable.

export type ChapterRequest = {
  volume: string;
  book: string;
  chapter: number;
  /** Omitted, empty, or "lds" for the bundled text. */
  translation?: string;
};

export function normalizeRequestTranslation(translation: string | undefined): string {
  const value = (translation ?? "").trim().toLowerCase();
  return value === "lds" ? "" : value;
}

/**
 * True when an overlay request for `requested` was answered with a different text (e.g. the LDS/KJV fallback after
 * the translation API failed). Such answers are shown with a notice but never cached as the requested translation.
 */
export function isSubstitutedTranslation(requested: string | undefined, actual: string | undefined): boolean {
  const wanted = normalizeRequestTranslation(requested);
  if (!wanted) return false;
  return (actual ?? "").trim().toLowerCase() !== wanted;
}

export function chapterRequestKey(request: ChapterRequest): string {
  const translation = normalizeRequestTranslation(request.translation);
  return `${request.volume}/${request.book}/${request.chapter}${translation ? `?t=${translation}` : ""}`;
}

type Entry<T> = {
  promise: Promise<T>;
  settled: boolean;
  value?: T;
};

export type ChapterRequestCache<T> = {
  /** The shared load for this chapter: an existing in-flight or settled entry, or a new one. */
  load(request: ChapterRequest): Promise<T>;
  /** The settled value, if any (never waits). */
  peek(request: ChapterRequest): T | undefined;
  /** Record a value the caller already has, e.g. the server-rendered chapter. */
  prime(request: ChapterRequest, value: T): void;
  size(): number;
  clear(): void;
};

export function createChapterRequestCache<T>(
  loader: (request: ChapterRequest) => Promise<T>,
  {
    maxEntries = 40,
    retain = () => true,
  }: {
    maxEntries?: number;
    /**
     * Whether a loaded value is kept once settled. A value that is not is still delivered to every caller that
     * shared the in-flight request, but the next load starts afresh.
     */
    retain?: (request: ChapterRequest, value: T) => boolean;
  } = {}
): ChapterRequestCache<T> {
  const entries = new Map<string, Entry<T>>();

  function touch(key: string, entry: Entry<T>) {
    entries.delete(key);
    entries.set(key, entry);
  }

  // Evict least recently used settled entries; in-flight ones are kept so their callers still share them.
  function prune() {
    if (entries.size <= maxEntries) return;
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries) break;
      if (entry.settled) entries.delete(key);
    }
  }

  return {
    load(request) {
      const key = chapterRequestKey(request);
      const existing = entries.get(key);
      if (existing) {
        touch(key, existing);
        return existing.promise;
      }
      const entry = { settled: false } as Entry<T>;
      entry.promise = Promise.resolve()
        .then(() => loader(request))
        .then(
          (value) => {
            if (!retain(request, value)) {
              if (entries.get(key) === entry) entries.delete(key);
              return value;
            }
            entry.settled = true;
            entry.value = value;
            prune();
            return value;
          },
          (error: unknown) => {
            if (entries.get(key) === entry) entries.delete(key);
            throw error;
          }
        );
      entries.set(key, entry);
      prune();
      return entry.promise;
    },
    peek(request) {
      const entry = entries.get(chapterRequestKey(request));
      return entry?.settled ? entry.value : undefined;
    },
    prime(request, value) {
      if (!retain(request, value)) return;
      const key = chapterRequestKey(request);
      const existing = entries.get(key);
      if (existing?.settled) {
        touch(key, existing);
        return;
      }
      entries.set(key, { promise: Promise.resolve(value), settled: true, value });
      prune();
    },
    size: () => entries.size,
    clear: () => entries.clear(),
  };
}

export type ScheduleIdle = (callback: () => void) => () => void;

/**
 * Runs best-effort tasks one at a time, each in its own idle slot, until done or cancelled. Returns the cancel
 * function: tasks not yet started never run (a task already running finishes, but nothing follows it).
 */
export function runIdleQueue(tasks: Array<() => unknown>, scheduleIdle: ScheduleIdle): () => void {
  let cancelled = false;
  let cancelScheduled: (() => void) | null = null;
  let index = 0;

  const step = () => {
    if (cancelled || index >= tasks.length) return;
    cancelScheduled = scheduleIdle(() => {
      cancelScheduled = null;
      if (cancelled) return;
      const task = tasks[index];
      index += 1;
      Promise.resolve()
        .then(task)
        .catch(() => {
          // Prefetching is best-effort.
        })
        .finally(step);
    });
  };

  step();
  return () => {
    cancelled = true;
    cancelScheduled?.();
    cancelScheduled = null;
  };
}
