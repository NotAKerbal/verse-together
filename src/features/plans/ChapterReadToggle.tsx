"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useBookProgress, useReadingProgressActions } from "./useReadingProgress";

type Props = {
  volume: string;
  book: string;
  chapter: number;
};

export default function ChapterReadToggle({ volume, book, chapter }: Props) {
  const { user } = useAuth();
  const progress = useBookProgress(volume, book);
  const { markChapterRead, unmarkChapterRead, setLastPosition } = useReadingProgressActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    setLastPosition({ volume, book, chapter }).catch(() => {
      // Position tracking is best-effort; the reader should never surface this.
    });
  }, [userId, volume, book, chapter, setLastPosition]);

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
        await markChapterRead({ volume, book, chapter });
      }
    } catch {
      setError("Couldn't save that. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border-2 border-[color:var(--surface-border)] px-4 py-3 font-sans shadow-[var(--surface-shadow-soft)]"
      style={{ background: isRead ? "var(--accent-mint)" : "var(--surface-card)", fontSize: "1rem" }}
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
