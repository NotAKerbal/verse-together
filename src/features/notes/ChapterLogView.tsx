"use client";

import { useId } from "react";
import ChapterReadToggle from "@/features/plans/ChapterReadToggle";
import { useInsightBuilder, type ReaderChapter } from "@/features/insights/InsightBuilderProvider";
import { ReadingLogForm } from "./ReadingLogButton";

/**
 * The Log view of a chapter page's Log and Notes panel: mark the chapter read, or log a reading of it (a reread,
 * part of it, another day) in the private reading history. It always shows the chapter the page now shows.
 */
export default function ChapterLogView({ chapter }: { chapter: ReaderChapter }) {
  const titleId = useId();
  // The panel unmounts when collapsed; the provider keeps the unfinished attempt for a retry after reopening.
  const { readerLogPendingRef, readerMarkPendingRef } = useInsightBuilder();
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 font-sans">
      <h2 className="font-display text-lg font-extrabold tracking-[-0.02em]">{chapter.reference}</h2>
      <ChapterReadToggle
        volume={chapter.volume}
        book={chapter.book}
        chapter={chapter.chapter}
        pendingRef={readerMarkPendingRef}
      />
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
