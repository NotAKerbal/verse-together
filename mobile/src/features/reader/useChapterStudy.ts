// The web reader's loaders for what follows a chapter's text (useComparisonChapters.ts, useJstExcerpts.ts and the
// study paths fetch in ChapterReader.tsx), with the web's own pure state rules: each answer is tagged with the
// chapter (and translations) it was asked for, so a late answer for a chapter the reader has left is dropped, never
// shown. Leaving a chapter cancels its JST and study path requests; Try again asks again. Study paths are also tagged
// with the signed-in account they were researched for.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChapterStudyPath } from "@/lib/chapterInsights";
import { EMPTY_OVERLAY_STATE, overlayRequestKey, recordOverlayOutcome, summarizeOverlays, type OverlayState, type OverlaySummary } from "@/lib/comparisonOverlays";
import { EMPTY_JST_STATE, jstChapterTarget, jstRequestKey, recordJstOutcome, summarizeJst, type JstLoadState, type JstView } from "@/lib/jst";
import { useSiteAuth } from "../../account/siteAuth";
import { errorMessage } from "../explore/network";
import { cachedJstExcerpts, cachedStudyPaths, comparisonChapters, fetchJstExcerpts, fetchStudyPaths, studyPathsKey } from "./studyData";

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

export type StudyPathsState =
  | { status: "off" | "loading" }
  /** None cached, and the site is researching this chapter for the signed-in reader (it can take most of a minute). */
  | { status: "generating" }
  /** Nothing to show: none cached, or (`sign-in`) none cached and only a signed-in reader can have one researched. */
  | { status: "none"; reason?: "sign-in" }
  | { status: "failed"; message: string }
  | { status: "ready"; paths: ChapterStudyPath[] };

/**
 * A chapter's study paths, while `enabled` (Latter-day Saint content, once the text is on screen). Like the web
 * reader, a chapter with none cached is researched for a signed-in reader (as that account: siteAuth.ts). Unlike the
 * web, which hides every failure, a connection failure, timeout or failed research is kept apart from "nothing
 * cached" so it can be retried. Every answer is tagged with the chapter and account it was asked for: signing in,
 * out or into another account cancels the request and asks again, and a late answer for either is never shown.
 */
export function useChapterStudyPaths(volume: string, book: string, chapter: number, enabled: boolean): StudyPathsState & { retry: () => void } {
  const auth = useSiteAuth();
  const chapterKey = enabled ? studyPathsKey(volume, book, chapter) : "";
  const key = chapterKey ? `${chapterKey}#${auth?.owner ?? ""}` : "";
  const [result, setResult] = useState<{ key: string; state: StudyPathsState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cached = chapterKey ? cachedStudyPaths(chapterKey) : undefined;

  useEffect(() => {
    if (!key || cached) return;
    const controller = new AbortController();
    const settle = (state: StudyPathsState) => {
      if (!controller.signal.aborted) setResult({ key, state });
    };
    fetchStudyPaths(volume, book, chapter, controller.signal, { auth, onGenerating: () => settle({ status: "generating" }) }).then(settle, (error: unknown) => {
      const kind = error && typeof error === "object" && "kind" in error ? (error as { kind: string }).kind : "";
      // A malformed answer is "nothing to show"; the rest (no connection, too slow, research that failed) can be retried.
      if (kind !== "aborted") settle(kind === "format" ? { status: "none" } : { status: "failed", message: errorMessage(error) });
    });
    return () => controller.abort();
  }, [key, cached, volume, book, chapter, auth, attempt]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((value) => value + 1);
  }, [setResult, setAttempt]);

  return useMemo(() => {
    if (!key) return { status: "off", retry } as const;
    if (cached) return cached.length ? { status: "ready", paths: cached, retry } : { status: "none", retry };
    if (result?.key === key) return { ...result.state, retry };
    return { status: "loading", retry } as const;
  }, [key, cached, result, retry]);
}
