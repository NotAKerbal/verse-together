"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChapter, peekChapter } from "@/lib/chapterClient";
import {
  EMPTY_OVERLAY_STATE,
  overlayRequestKey,
  recordOverlayOutcome,
  summarizeOverlays,
  type OverlayState,
} from "@/lib/comparisonOverlays";

/**
 * Loads the requested comparison translations for a chapter in the browser, after the primary text is on screen.
 * Results for an earlier chapter or translation set are never shown: they are keyed and dropped on mismatch.
 */
export function useComparisonChapters(volume: string, book: string, chapter: number, translations: string[]) {
  const translationList = translations.join(",");
  const key = overlayRequestKey(volume, book, chapter, translations);
  const [state, setState] = useState<OverlayState>(EMPTY_OVERLAY_STATE);

  useEffect(() => {
    const requested = translationList ? translationList.split(",") : [];
    if (requested.length === 0) return;
    let active = true;
    requested.forEach((translation, index) => {
      loadChapter({ volume, book, chapter, translation }).then(
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
  }, [volume, book, chapter, translationList, key]);

  return useMemo(() => {
    const requested = translationList ? translationList.split(",") : [];
    return summarizeOverlays(requested, state, key, (translation) =>
      peekChapter({ volume, book, chapter, translation })
    );
  }, [state, key, translationList, volume, book, chapter]);
}
