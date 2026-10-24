"use client";

import ChapterChip from "@/features/plans/ChapterChip";
import { findCatalogBook, getBookLabel, getChapterHref } from "@/features/plans/scriptureCatalog";
import { useBookProgress } from "@/features/plans/useReadingProgress";
import type { ChapterRange } from "@/lib/comeFollowMe";

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

type Props = {
  ranges: ChapterRange[];
  /** Keys the progress queries to the week, so switching weeks never mixes chips. */
  weekStart: string;
  label?: string;
  className?: string;
};

/** The week's reading as chapter chips, each linking to its first chapter and tinted once read. */
export default function LessonChapters({ ranges, weekStart, label = "This week's chapters", className }: Props) {
  if (ranges.length === 0) return null;
  return (
    <ul className={`flex min-w-0 flex-wrap gap-2 ${className ?? ""}`} aria-label={label}>
      {groupByBook(ranges).map((group) => (
        <BookChips key={`${weekStart}-${group.volume}-${group.book}`} {...group} />
      ))}
    </ul>
  );
}
