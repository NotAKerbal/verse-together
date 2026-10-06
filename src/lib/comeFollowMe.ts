import { getBibleBookBySlug } from "./bibleCanon.ts";

export type ChapterRange = {
  volume: string;
  book: string;
  from: number;
  to: number;
};

export type ComeFollowMeWeek = {
  /** Monday, as a local YYYY-MM-DD key. */
  start: string;
  /** Sunday, as a local YYYY-MM-DD key. */
  end: string;
  /** The study block as printed in the manual, e.g. "Exodus 19–20; 24; 31–34". */
  block: string;
  refs: ChapterRange[];
  /** For weeks with no assigned chapters, somewhere fitting to read instead. */
  suggestion: { ref: ChapterRange; note: string } | null;
};

const PEARL_BOOKS: Record<string, { chapters: number }> = {
  moses: { chapters: 8 },
  abraham: { chapters: 5 },
};

const SPECIAL_WEEKS: Record<string, { ref: ChapterRange; note: string }> = {
  "Introduction to the Old Testament": {
    ref: { volume: "oldtestament", book: "genesis", from: 1, to: 1 },
    note: "Start at the beginning",
  },
  Easter: {
    ref: { volume: "oldtestament", book: "isaiah", from: 53, to: 53 },
    note: "Read about the Savior",
  },
  Christmas: {
    ref: { volume: "oldtestament", book: "isaiah", from: 9, to: 9 },
    note: "Read about the Savior",
  },
};

/** [start, end, block] for 2026. The first week begins in 2025. */
const SCHEDULE_2026: ReadonlyArray<readonly [string, string, string]> = [
  ["2025-12-29", "2026-01-04", "Introduction to the Old Testament"],
  ["2026-01-05", "2026-01-11", "Moses 1; Abraham 3"],
  ["2026-01-12", "2026-01-18", "Genesis 1–2; Moses 2–3; Abraham 4–5"],
  ["2026-01-19", "2026-01-25", "Genesis 3–4; Moses 4–5"],
  ["2026-01-26", "2026-02-01", "Genesis 5; Moses 6"],
  ["2026-02-02", "2026-02-08", "Moses 7"],
  ["2026-02-09", "2026-02-15", "Genesis 6–11; Moses 8"],
  ["2026-02-16", "2026-02-22", "Genesis 12–17; Abraham 1–2"],
  ["2026-02-23", "2026-03-01", "Genesis 18–23"],
  ["2026-03-02", "2026-03-08", "Genesis 24–33"],
  ["2026-03-09", "2026-03-15", "Genesis 37–41"],
  ["2026-03-16", "2026-03-22", "Genesis 42–50"],
  ["2026-03-23", "2026-03-29", "Exodus 1–6"],
  ["2026-03-30", "2026-04-05", "Easter"],
  ["2026-04-06", "2026-04-12", "Exodus 7–13"],
  ["2026-04-13", "2026-04-19", "Exodus 14–18"],
  ["2026-04-20", "2026-04-26", "Exodus 19–20; 24; 31–34"],
  ["2026-04-27", "2026-05-03", "Exodus 35–40; Leviticus 1; 4; 16; 19"],
  ["2026-05-04", "2026-05-10", "Numbers 11–14; 20–24; 27"],
  ["2026-05-11", "2026-05-17", "Deuteronomy 6–8; 15; 18; 29–30; 34"],
  ["2026-05-18", "2026-05-24", "Joshua 1–8; 23–24"],
  ["2026-05-25", "2026-05-31", "Judges 2–4; 6–8; 13–16"],
  ["2026-06-01", "2026-06-07", "Ruth; 1 Samuel 1–7"],
  ["2026-06-08", "2026-06-14", "1 Samuel 8–10; 13; 15–16"],
  ["2026-06-15", "2026-06-21", "1 Samuel 17–18; 24–26; 2 Samuel 5–7"],
  ["2026-06-22", "2026-06-28", "2 Samuel 11–12; 1 Kings 3; 6–9; 11"],
  ["2026-06-29", "2026-07-05", "1 Kings 12–13; 17–22"],
  ["2026-07-06", "2026-07-12", "2 Kings 2–7"],
  ["2026-07-13", "2026-07-19", "2 Kings 16–25"],
  ["2026-07-20", "2026-07-26", "2 Chronicles 14–20; 26; 30"],
  ["2026-07-27", "2026-08-02", "Ezra 1; 3–7; Nehemiah 2; 4–6; 8"],
  ["2026-08-03", "2026-08-09", "Esther"],
  ["2026-08-10", "2026-08-16", "Job 1–3; 12–14; 19; 21–24; 38–40; 42"],
  ["2026-08-17", "2026-08-23", "Psalms 1–2; 8; 19–33; 40; 46"],
  ["2026-08-24", "2026-08-30", "Psalms 49–51; 61–66; 69–72; 77–78; 85–86"],
  ["2026-08-31", "2026-09-06", "Psalms 102–3; 110; 116–19; 127–28; 135–39; 146–50"],
  ["2026-09-07", "2026-09-13", "Proverbs 1–4; 15–16; 22; 31; Ecclesiastes 1–3; 11–12"],
  ["2026-09-14", "2026-09-20", "Isaiah 1–12"],
  ["2026-09-21", "2026-09-27", "Isaiah 13–14; 22; 24–30; 35"],
  ["2026-09-28", "2026-10-04", "Isaiah 40–49"],
  ["2026-10-05", "2026-10-11", "Isaiah 50–57"],
  ["2026-10-12", "2026-10-18", "Isaiah 58–66"],
  ["2026-10-19", "2026-10-25", "Jeremiah 1–3; 7; 16–18; 20"],
  ["2026-10-26", "2026-11-01", "Jeremiah 31–33; 36–39; Lamentations 1; 3"],
  ["2026-11-02", "2026-11-08", "Ezekiel 1–3; 33–34; 36–37; 47"],
  ["2026-11-09", "2026-11-15", "Daniel 1–7"],
  ["2026-11-16", "2026-11-22", "Hosea 1–6; 10–14; Joel"],
  ["2026-11-23", "2026-11-29", "Amos; Obadiah; Jonah"],
  ["2026-11-30", "2026-12-06", "Micah; Nahum; Habakkuk; Zephaniah"],
  ["2026-12-07", "2026-12-13", "Haggai 1–2; Zechariah 1–4; 7–14"],
  ["2026-12-14", "2026-12-20", "Malachi"],
  ["2026-12-21", "2026-12-27", "Christmas"],
];

type BookInfo = { volume: string; book: string; chapters: number };

function lookupBook(name: string): BookInfo {
  const slug = name.toLowerCase().replace(/\s+/g, "");
  const pearl = PEARL_BOOKS[slug];
  if (pearl) return { volume: "pearl", book: slug, chapters: pearl.chapters };
  const bible = getBibleBookBySlug(slug);
  if (bible && bible.testament === "old") return { volume: "oldtestament", book: slug, chapters: bible.chapters };
  throw new Error(`Come, Follow Me: unknown book "${name}"`);
}

/** "102–3" means 102–103: the end shares the start's leading digits. */
function expandRangeEnd(from: number, to: number): number {
  if (to >= from) return to;
  const fromDigits = String(from);
  const toDigits = String(to);
  if (toDigits.length >= fromDigits.length) return to;
  return Number(fromDigits.slice(0, fromDigits.length - toDigits.length) + toDigits);
}

const PART_PATTERN = /^(?:([123]?\s*[A-Za-z][A-Za-z ]*?))?\s*(?:(\d+)(?:\s*[–—-]\s*(\d+))?)?$/;

/**
 * Expands a block like "Exodus 19–20; 24; 31–34" or "Ruth; 1 Samuel 1–7".
 * Parts are separated by ";". A part with no book continues the previous
 * book; a book with no numbers means the whole book.
 */
export function parseBlock(block: string): ChapterRange[] {
  const refs: ChapterRange[] = [];
  let current: BookInfo | null = null;
  for (const raw of block.split(";")) {
    const part = raw.trim();
    if (!part) continue;
    const match = PART_PATTERN.exec(part);
    if (!match) throw new Error(`Come, Follow Me: cannot parse "${part}" in "${block}"`);
    const [, name, fromText, toText] = match;
    if (name) current = lookupBook(name.trim());
    if (!current) throw new Error(`Come, Follow Me: "${part}" has no book in "${block}"`);
    const from = fromText ? Number(fromText) : 1;
    const to = toText ? expandRangeEnd(from, Number(toText)) : fromText ? from : current.chapters;
    if (from < 1 || to < from || to > current.chapters) {
      throw new Error(`Come, Follow Me: ${current.book} ${from}–${to} is out of range in "${block}"`);
    }
    refs.push({ volume: current.volume, book: current.book, from, to });
  }
  return refs;
}

export const COME_FOLLOW_ME_WEEKS: ReadonlyArray<ComeFollowMeWeek> = SCHEDULE_2026.map(([start, end, block]) => {
  const special = SPECIAL_WEEKS[block];
  return {
    start,
    end,
    block,
    refs: special ? [] : parseBlock(block),
    suggestion: special ?? null,
  };
});

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The week containing `date` (local time), or null outside the 2026 schedule. */
export function getComeFollowMeWeek(date: Date): ComeFollowMeWeek | null {
  const key = toLocalDateKey(date);
  return COME_FOLLOW_ME_WEEKS.find((week) => week.start <= key && key <= week.end) ?? null;
}

/** The week starting on a YYYY-MM-DD Monday key, or null when it is not in the schedule. */
export function getComeFollowMeWeekByStart(start: string): ComeFollowMeWeek | null {
  return COME_FOLLOW_ME_WEEKS.find((week) => week.start === start) ?? null;
}

/** The week `delta` steps away, or null past either end of the schedule. */
export function getAdjacentWeek(week: ComeFollowMeWeek, delta: 1 | -1): ComeFollowMeWeek | null {
  const index = COME_FOLLOW_ME_WEEKS.indexOf(week);
  if (index < 0) return null;
  return COME_FOLLOW_ME_WEEKS[index + delta] ?? null;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Aug 31 – Sep 6" */
export function formatWeekRange(week: ComeFollowMeWeek): string {
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const start = parseDateKey(week.start).toLocaleDateString(undefined, options);
  const end = parseDateKey(week.end).toLocaleDateString(undefined, options);
  return `${start} – ${end}`;
}
