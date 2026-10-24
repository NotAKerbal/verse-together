// Comparison translations for the reader, loaded after the primary text renders. Each overlay settles on its own;
// outcomes are tagged with the chapter+translations key they were requested for, so a late answer for a previous
// chapter or translation set is ignored rather than shown. Pure, so the race rules are testable.

export type ComparisonChapter = {
  translation?: string;
  verses: Array<{ verse: number; text: string }>;
};

export type OverlayOutcome = { status: "ready"; chapter: ComparisonChapter } | { status: "failed" };

export type OverlayState = {
  key: string;
  outcomes: Array<OverlayOutcome | undefined>;
};

export type OverlaySummary = {
  compareChapters: Array<{ translation: string; verses: ComparisonChapter["verses"] }>;
  translationNotices: string[];
  pendingTranslations: string[];
};

export const EMPTY_OVERLAY_STATE: OverlayState = { key: "", outcomes: [] };

export function overlayRequestKey(volume: string, book: string, chapter: number, translations: string[]): string {
  return `${volume}/${book}/${chapter}|${translations.join(",")}`;
}

/** Record one overlay's outcome; a different key starts from an empty set, discarding the previous chapter's. */
export function recordOverlayOutcome(
  state: OverlayState,
  key: string,
  index: number,
  outcome: OverlayOutcome
): OverlayState {
  const outcomes = state.key === key ? state.outcomes.slice() : [];
  outcomes[index] = outcome;
  return { key, outcomes };
}

export function summarizeOverlays(
  translations: string[],
  state: OverlayState,
  key: string,
  cached?: (translation: string) => ComparisonChapter | undefined
): OverlaySummary {
  const outcomes = state.key === key ? state.outcomes : [];
  const summary: OverlaySummary = { compareChapters: [], translationNotices: [], pendingTranslations: [] };

  translations.forEach((requested, index) => {
    let outcome = outcomes[index];
    if (!outcome) {
      const hit = cached?.(requested);
      if (hit) outcome = { status: "ready", chapter: hit };
    }
    if (!outcome) {
      summary.pendingTranslations.push(requested);
      return;
    }
    if (outcome.status === "failed") {
      summary.translationNotices.push(`Could not load overlay translation "${requested.toUpperCase()}".`);
      return;
    }
    const actual = (outcome.chapter.translation ?? "").toLowerCase();
    if (actual && actual !== requested.toLowerCase()) {
      summary.translationNotices.push(
        `Overlay translation "${requested.toUpperCase()}" was unavailable, showing "${actual.toUpperCase()}" instead.`
      );
    }
    summary.compareChapters.push({ translation: outcome.chapter.translation ?? "", verses: outcome.chapter.verses });
  });

  return summary;
}
