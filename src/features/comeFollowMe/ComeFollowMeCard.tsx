"use client";

import Link from "next/link";
import { useState } from "react";
import { getStudyGuideHref, hasStudyGuide } from "@/features/comeFollowMe/guideIndex";
import ChapterChip from "@/features/plans/ChapterChip";
import { findCatalogBook, getBookLabel, getChapterHref } from "@/features/plans/scriptureCatalog";
import { useBookProgress } from "@/features/plans/useReadingProgress";
import {
  formatWeekRange,
  getAdjacentWeek,
  getComeFollowMeWeek,
  type ChapterRange,
  type ComeFollowMeWeek,
} from "@/lib/comeFollowMe";

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

function describeRange(range: ChapterRange): string {
  const book = getBookLabel(range.volume, range.book);
  const wholeBook = range.from === 1 && range.to === findCatalogBook(range.volume, range.book)?.chapters;
  if (wholeBook) return book;
  return range.from === range.to ? `${book} ${range.from}` : `${book} ${range.from}–${range.to}`;
}

type BookGroup = { volume: string; book: string; ranges: ChapterRange[] };

/** Groups a week's ranges by book so each book needs only one progress query. */
function groupByBook(ranges: ChapterRange[]): BookGroup[] {
  const groups: BookGroup[] = [];
  for (const range of ranges) {
    const last = groups[groups.length - 1];
    if (last && last.volume === range.volume && last.book === range.book) {
      last.ranges.push(range);
    } else {
      groups.push({ volume: range.volume, book: range.book, ranges: [range] });
    }
  }
  return groups;
}

/** One chip per range of a single book; one progress query per book, skipped when signed out. */
function BookChips({ volume, book, ranges }: BookGroup) {
  const progress = useBookProgress(volume, book);
  const read = new Set(progress?.readChapters ?? []);
  return (
    <>
      {ranges.map((range) => {
        let allRead = read.size > 0;
        for (let chapter = range.from; allRead && chapter <= range.to; chapter += 1) {
          allRead = read.has(chapter);
        }
        return (
          <li key={`${range.book}-${range.from}`} className="max-w-full">
            <ChapterChip
              href={getChapterHref({ volume: range.volume, book: range.book, chapter: range.from })}
              label={describeRange(range)}
              read={allRead}
            />
          </li>
        );
      })}
    </>
  );
}

const ARROW_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] text-[color:var(--foreground)] hover:bg-[color:var(--surface-button-hover)] disabled:opacity-40 disabled:hover:bg-[color:var(--surface-card)]";

export default function ComeFollowMeCard() {
  const [currentWeek] = useState(() => getComeFollowMeWeek(new Date()));
  const [week, setWeek] = useState<ComeFollowMeWeek | null>(currentWeek);

  if (!currentWeek || !week) return null;

  const isCurrent = week === currentWeek;
  const previous = getAdjacentWeek(week, -1);
  const next = getAdjacentWeek(week, 1);
  const ranges = week.refs.length > 0 ? week.refs : week.suggestion ? [week.suggestion.ref] : [];

  return (
    <article
      className="sticky-note -rotate-1 flex h-full flex-col gap-3 p-4 sm:p-5"
      style={{ background: "var(--accent-sky-soft)" }}
      aria-labelledby="come-follow-me-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-muted)]">
            Come, Follow Me{isCurrent ? " · This week" : ""}
          </p>
          <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">{formatWeekRange(week)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className={ARROW_CLASS}
            aria-label="Previous week"
            disabled={!previous}
            onClick={() => previous && setWeek(previous)}
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            className={ARROW_CLASS}
            aria-label="Next week"
            disabled={!next}
            onClick={() => next && setWeek(next)}
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      <h2 id="come-follow-me-heading" className="font-display text-[1.35rem] font-extrabold leading-tight tracking-[-0.03em]">
        {week.block}
      </h2>

      {week.suggestion ? (
        <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">{week.suggestion.note}</p>
      ) : null}

      <ul className="flex flex-wrap gap-2" aria-label="This week's chapters">
        {groupByBook(ranges).map((group) => (
          <BookChips key={`${week.start}-${group.volume}-${group.book}`} {...group} />
        ))}
      </ul>

      {hasStudyGuide(week.start) ? (
        <Link
          href={getStudyGuideHref(week.start)}
          className="self-start text-xs font-bold underline decoration-2 underline-offset-4 hover:decoration-[color:var(--accent-secondary)]"
        >
          Study guide with scripture side by side
        </Link>
      ) : null}

      {!isCurrent ? (
        <button
          type="button"
          onClick={() => setWeek(currentWeek)}
          className="surface-button mt-auto inline-flex min-h-8 items-center self-start rounded-full border-2 px-3 text-xs"
        >
          Back to this week
        </button>
      ) : null}
    </article>
  );
}
