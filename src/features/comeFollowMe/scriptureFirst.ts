import type { GuideContextBlock } from "../../lib/cfm/cfmGuide.ts";

type Verse = { verse: number; text: string };
export type ReadingGroup = { id: string; verses: Verse[]; context?: GuideContextBlock };

/**
 * Interleave complete scripture with the guide's original blocks. A verse is emitted exactly once, even
 * when two comments overlap or discuss different halves of it. Unmapped commentary stays in source order.
 */
export function readingGroups(verses: readonly Verse[], blocks: readonly GuideContextBlock[]): ReadingGroup[] {
  const groups: ReadingGroup[] = [];
  let cursor = 0;
  const takeThrough = (last: number) => {
    const start = cursor;
    while (cursor < verses.length && verses[cursor].verse <= last) cursor++;
    return verses.slice(start, cursor);
  };
  for (const context of blocks) {
    const passage = context.passage;
    if (!passage) {
      groups.push({ id: context.id, verses: [], context });
      continue;
    }
    const gap = takeThrough(passage.first - 1);
    if (gap.length) groups.push({ id: `verses-${gap[0].verse}`, verses: gap });
    groups.push({ id: context.id, verses: takeThrough(passage.last), context });
  }
  const tail = verses.slice(cursor);
  if (tail.length) groups.push({ id: `verses-${tail[0].verse}`, verses: tail });
  return groups;
}

export function verseRangeLabel(first: number, last: number): string {
  return first === last ? `Verse ${first}` : `Verses ${first}–${last}`;
}
