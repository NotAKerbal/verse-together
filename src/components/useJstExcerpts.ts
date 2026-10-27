"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_JST_STATE,
  jstChapterTarget,
  jstRequestKey,
  readJstResponse,
  recordJstOutcome,
  summarizeJst,
  type JstExcerpt,
  type JstLoadState,
  type JstView,
} from "@/lib/jst";

// Chapters already loaded this session, so going back to one shows its excerpts at once. Failures aren't kept.
const loadedExcerpts = new Map<string, JstExcerpt[]>();

/**
 * A Bible chapter's Joseph Smith Translation excerpts, requested only while `enabled` and only for the Old or New
 * Testament. Answers are keyed by chapter: one that arrives after the reader has moved on is dropped, never shown.
 */
export function useJstExcerpts(
  volume: string,
  book: string,
  chapter: number,
  enabled: boolean
): JstView & { retry: () => void } {
  const target = useMemo(() => (enabled ? jstChapterTarget(volume, book, chapter) : null), [enabled, volume, book, chapter]);
  const key = jstRequestKey(target);
  const [state, setState] = useState<JstLoadState>(EMPTY_JST_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!target || !key || loadedExcerpts.has(key)) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ volume: target.volume, book: target.book, chapter: String(target.chapter) });
    fetch(`/api/scriptures/jst?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : `Request failed (${response.status}).`;
          throw new Error(message);
        }
        const excerpts = readJstResponse(body, target);
        if (!excerpts) throw new Error("The JST response didn't match this chapter.");
        loadedExcerpts.set(key, excerpts);
        if (!controller.signal.aborted) setState((prev) => recordJstOutcome(prev, key, { status: "ready", excerpts }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error && error.message ? error.message : "Could not load JST excerpts.";
        setState((prev) => recordJstOutcome(prev, key, { status: "failed", message }));
      });
    return () => controller.abort();
  }, [target, key, attempt]);

  const retry = useCallback(() => {
    setState(EMPTY_JST_STATE);
    setAttempt((value) => value + 1);
  }, []);

  return useMemo(() => ({ ...summarizeJst(key, state, loadedExcerpts.get(key)), retry }), [key, state, retry]);
}
