import { useCallback, useEffect, useMemo, useState } from "react";
import { EMPTY_OVERLAY_STATE, overlayRequestKey, recordOverlayOutcome, summarizeOverlays, type OverlayState, type OverlaySummary } from "@/lib/comparisonOverlays";
import { EMPTY_JST_STATE, jstChapterTarget, jstRequestKey, recordJstOutcome, summarizeJst, type JstLoadState, type JstView } from "@/lib/jst";
import { errorMessage } from "../explore/network";
import { cachedJstExcerpts, comparisonChapters, fetchJstExcerpts } from "./studyData";

const NONE: string[] = [];

/**
 * A Bible chapter's comparison translations, requested once `translations` is non-empty (the reader passes them
 * only once its own text is on screen). Each settles on its own; a failed one is named in `translationNotices`.
 */
export function useComparisonOverlays(volume: string, book: string, chapter: number, translations: string[]): OverlaySummary & { retry: () => void } {
  const list = translations.join(",");
  const key = overlayRequestKey(volume, book, chapter, translations);
  const [state, setState] = useState<OverlayState>(EMPTY_OVERLAY_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const requested = list ? list.split(",") : NONE;
    if (requested.length === 0) return;
    let active = true;
    requested.forEach((translation, index) => {
      comparisonChapters.load({ volume, book, chapter, translation }).then(
        (data) => {
          if (active) setState((prev) => recordOverlayOutcome(prev, key, index, { status: "ready", chapter: data }));
        },
        () => {
          if (active) setState((prev) => recordOverlayOutcome(prev, key, index, { status: "failed" }));
        }
      );
    });
    return () => {
      active = false;
    };
  }, [volume, book, chapter, list, key, attempt]);

  const retry = useCallback(() => {
    setState(EMPTY_OVERLAY_STATE);
    setAttempt((value) => value + 1);
  }, [setState, setAttempt]);

  return useMemo(() => {
    const requested = list ? list.split(",") : NONE;
    const summary = summarizeOverlays(requested, state, key, (translation) => comparisonChapters.peek({ volume, book, chapter, translation }));
    return { ...summary, retry };
  }, [state, key, list, volume, book, chapter, retry]);
}

/** A Bible chapter's Joseph Smith Translation excerpts, requested only while `enabled` (useJstExcerpts.ts). */
export function useJstChapter(volume: string, book: string, chapter: number, enabled: boolean): JstView & { retry: () => void } {
  const target = useMemo(() => (enabled ? jstChapterTarget(volume, book, chapter) : null), [enabled, volume, book, chapter]);
  const key = jstRequestKey(target);
  const [state, setState] = useState<JstLoadState>(EMPTY_JST_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!target || !key || cachedJstExcerpts(key)) return;
    const controller = new AbortController();
    fetchJstExcerpts(target, key, controller.signal).then(
      (excerpts) => {
        if (!controller.signal.aborted) setState((prev) => recordJstOutcome(prev, key, { status: "ready", excerpts }));
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState((prev) => recordJstOutcome(prev, key, { status: "failed", message: errorMessage(error) }));
      }
    );
    return () => controller.abort();
  }, [target, key, attempt]);

  const retry = useCallback(() => {
    setState(EMPTY_JST_STATE);
    setAttempt((value) => value + 1);
  }, [setState, setAttempt]);

  return useMemo(() => ({ ...summarizeJst(key, state, cachedJstExcerpts(key)), retry }), [key, state, retry]);
}
