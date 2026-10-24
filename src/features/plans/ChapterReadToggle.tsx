"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { localDateKey, newRequestId } from "@/features/notes/journal";
import { useConvexSignedIn } from "@/features/notes/useConvexSignedIn";
import { useBookProgress, useReadingProgressActions } from "./useReadingProgress";

/** An unfinished completion attempt for one chapter; a retry reuses it so the server logs the reading once. */
export type ChapterMarkAttempt = { chapterKey: string; requestId: string; journalDate: string };

type Props = {
  volume: string;
  book: string;
  chapter: number;
  /** Keeps the unfinished attempt beyond this toggle's mount (e.g. a panel that unmounts when collapsed). */
  pendingRef?: MutableRefObject<ChapterMarkAttempt | null>;
};

export default function ChapterReadToggle({ volume, book, chapter, pendingRef }: Props) {
  const { user } = useConvexSignedIn();
  const progress = useBookProgress(volume, book);
  const { markChapterRead, unmarkChapterRead } = useReadingProgressActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;
  // One id per completion attempt: a retry after an error reuses it so the server logs the reading once.
  const ownRequestRef = useRef<ChapterMarkAttempt | null>(null);
  const markRequestRef = pendingRef ?? ownRequestRef;
  const chapterKey = `${volume}/${book}/${chapter}`;
  useEffect(() => {
    ownRequestRef.current = null;
  }, [userId, chapterKey]);

  if (!user) return null;

  const loading = progress === undefined;
  const isRead = progress?.readChapters.includes(chapter) ?? false;

  async function toggle() {
    if (pending || loading) return;
    setPending(true);
    setError(null);
    try {
      if (isRead) {
        await unmarkChapterRead({ volume, book, chapter });
      } else {
        const previous = markRequestRef.current;
        const attempt =
          previous && previous.chapterKey === chapterKey
            ? previous
            : { chapterKey, requestId: newRequestId(), journalDate: localDateKey() };
        markRequestRef.current = attempt;
        await markChapterRead({ volume, book, chapter }, { requestId: attempt.requestId, journalDate: attempt.journalDate });
        // The shared ref may now hold a newer attempt from another instance; only clear our own.
        if (markRequestRef.current === attempt) markRequestRef.current = null;
      }
    } catch {
      setError("Couldn't save that. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border-2 border-[color:var(--surface-border)] px-4 py-3 font-sans"
      style={{ background: isRead ? "var(--accent-mint)" : "var(--surface-card-soft)" }}
    >
      <div className="min-w-0">
        <p className="font-display text-[1.05rem] font-bold leading-tight">
          {isRead ? "Chapter read" : "Finished this chapter?"}
        </p>
        <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">
          {isRead ? "It counts toward your progress and plans." : "Mark it read to fill in your progress."}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-xs font-semibold" style={{ color: "var(--accent-coral)" }}>
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading || pending}
        aria-pressed={isRead}
        data-active={isRead ? "true" : "false"}
        className="surface-button inline-flex min-h-10 items-center gap-2 rounded-full border-2 px-4 text-sm disabled:opacity-60"
      >
        {isRead ? "Read ✓" : "Mark chapter as read"}
      </button>
    </div>
  );
}
