"use client";

import { useState } from "react";
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
  const { markChapterRead, unmarkChapterRead } = useReadingProgressActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--surface-border)] pb-3">
      <div className="min-w-0">
        <div id="chapter-read-label" className="text-xs font-medium tracking-wide text-foreground/80">
          Chapter read
        </div>
        <div className="text-[11px] text-foreground/60">Counts toward your progress and plans.</div>
        {error ? (
          <div role="alert" className="mt-1 text-[11px] font-semibold" style={{ color: "var(--accent-coral)" }}>
            {error}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isRead}
        aria-labelledby="chapter-read-label"
        className="marker-switch disabled:opacity-60"
        onClick={() => void toggle()}
        disabled={loading || pending}
      >
        <span className="marker-switch-knob" aria-hidden="true" />
      </button>
    </div>
  );
}
