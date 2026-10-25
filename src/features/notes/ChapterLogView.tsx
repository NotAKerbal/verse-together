"use client";

import { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import ChapterReadToggle from "@/features/plans/ChapterReadToggle";
import { useInsightBuilder, type ReaderChapter } from "@/features/insights/InsightBuilderProvider";
import { ReadingLogForm } from "./ReadingLogButton";

/**
 * A chapter page's Log: mark the chapter read, or log a reading of it (a reread, part of it, another day) in the
 * private reading history. It always shows the chapter the page now shows. `panel` fills and scrolls the desktop
 * panel's Log view; `flow` is the top of the phone Log sheet, above Notes in one scroll, with the reading form folded
 * away until asked for.
 */
export default function ChapterLogView({
  chapter,
  layout = "panel",
}: {
  chapter: ReaderChapter;
  layout?: "panel" | "flow";
}) {
  const titleId = useId();
  // The panel unmounts when collapsed; the provider keeps the unfinished attempt for a retry after reopening.
  const { readerLogPendingRef, readerMarkPendingRef } = useInsightBuilder();
  const toggle = (
    <ChapterReadToggle
      volume={chapter.volume}
      book={chapter.book}
      chapter={chapter.chapter}
      pendingRef={readerMarkPendingRef}
    />
  );

  if (layout === "flow") {
    return (
      <div className="space-y-3 px-4 pt-3 font-sans">
        <h3 className="font-display text-base font-extrabold tracking-[-0.02em]">{chapter.reference}</h3>
        {toggle}
        {/* Closed, it stays mounted, so a half-filled form survives folding it. */}
        <details className="group rounded-[1rem] border-2 border-[color:var(--surface-border)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[0.875rem] px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] [&::-webkit-details-marker]:hidden">
            <span className="flex-1">Log reading</span>
            <FontAwesomeIcon
              icon={faChevronDown}
              className="h-3 w-3 text-[color:var(--foreground-muted)] transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="px-4 pb-3">
            <ReadingLogForm
              options={chapter.logOptions}
              followLocation
              disabled={!chapter.logReady}
              pendingRef={readerLogPendingRef}
            />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 font-sans">
      <h2 className="font-display text-lg font-extrabold tracking-[-0.02em]">{chapter.reference}</h2>
      {toggle}
      <section aria-labelledby={titleId} className="rounded-[1rem] border-2 border-[color:var(--surface-border)] px-4 py-3">
        <ReadingLogForm
          titleId={titleId}
          options={chapter.logOptions}
          followLocation
          disabled={!chapter.logReady}
          pendingRef={readerLogPendingRef}
        />
      </section>
    </div>
  );
}
