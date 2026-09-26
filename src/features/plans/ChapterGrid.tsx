"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useBookProgress } from "./useReadingProgress";

type Props = {
  volume: string;
  book: string;
  chapterCount: number;
  delineation: string;
  compact: boolean;
};

export default function ChapterGrid({ volume, book, chapterCount, delineation, compact }: Props) {
  const progress = useBookProgress(volume, book);
  const readSet = useMemo(() => new Set(progress?.readChapters ?? []), [progress]);
  const currentChapter = progress?.currentChapter ?? progress?.latestReadChapter ?? null;

  if (chapterCount === 0) {
    return <p className="panel-card p-4 text-sm text-[color:var(--foreground-muted)]">No chapter list available.</p>;
  }

  return (
    <ul className="browse-chapter-grid" data-compact={compact ? "true" : "false"}>
      {Array.from({ length: chapterCount }, (_, index) => index + 1).map((chapterNumber) => {
        const isRead = readSet.has(chapterNumber);
        const isCurrent = currentChapter === chapterNumber;
        const status = isCurrent ? (isRead ? "read, current" : "current") : isRead ? "read" : null;
        const referenceLabel = `${delineation} ${chapterNumber}${status ? ` (${status})` : ""}`;

        return (
          <li key={chapterNumber}>
            <Link
              href={`/browse/${volume}/${book}/${chapterNumber}`}
              className="interactive-card group flex min-h-[3.4rem] items-center justify-center rounded-[0.85rem] border-2 border-[color:var(--surface-border)] px-2 py-2 text-center font-display text-[1.15rem] font-bold tracking-[-0.02em] shadow-[var(--surface-shadow-soft)]"
              style={{
                background: isCurrent ? "var(--accent-primary)" : isRead ? "var(--accent-mint)" : "var(--surface-card)",
                color: isCurrent ? "#17161a" : "var(--foreground)",
              }}
              aria-label={referenceLabel}
              title={referenceLabel}
              data-read={isRead ? "true" : "false"}
              data-current={isCurrent ? "true" : "false"}
              data-tap
            >
              {chapterNumber}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
