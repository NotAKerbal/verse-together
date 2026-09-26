import { findCatalogBook, formatChapterLabel, getCatalogBooks } from "./scriptureCatalog";

export type PlanTemplate = "bom-30" | "book-daily" | "custom";

export type PlanStepInput = {
  volume: string;
  book: string;
  chapter: number;
  label: string;
};

export type ChapterRange = {
  volume: string;
  book: string;
  from: number;
  to: number;
};

/** Seven flags, Monday first. */
export type ReadingDays = readonly boolean[];

const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const EVERY_DAY: ReadingDays = [true, true, true, true, true, true, true];

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

export function formatDateKey(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatShortDateKey(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/* ---------- reading days ---------- */

/** Any missing or malformed value means "every day". */
export function normalizeReadingDays(days: readonly boolean[] | null | undefined): ReadingDays {
  if (!days || days.length !== 7 || !days.some(Boolean)) return EVERY_DAY;
  return days;
}

export function countReadingDaysPerWeek(days: ReadingDays): number {
  return days.filter(Boolean).length;
}

/** Monday-first index for a JS date (getDay is Sunday-first). */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function isReadingDay(date: Date, days: ReadingDays): boolean {
  return days[weekdayIndex(date)] === true;
}

/** "Every day", "Weekdays", "Mon, Wed, Fri", "6 days a week". */
export function describeReadingDays(days: ReadingDays): string {
  const count = countReadingDaysPerWeek(days);
  if (count === 7) return "Every day";
  const on = WEEKDAY_LABELS.filter((_, index) => days[index]);
  if (count === 5 && !days[5] && !days[6]) return "Weekdays";
  if (count === 2 && days[5] && days[6]) return "Weekends";
  if (count <= 3) return on.join(", ");
  return `${count} days a week`;
}

/** Date of the zero-based `n`th reading day on or after `start`. */
export function nthReadingDate(start: Date, n: number, days: ReadingDays): Date {
  const perWeek = countReadingDaysPerWeek(days);
  let cursor = startOfDay(start);
  while (!isReadingDay(cursor, days)) cursor = addDays(cursor, 1);
  if (n <= 0) return cursor;
  const weeks = Math.floor(n / perWeek);
  let remaining = n % perWeek;
  cursor = addDays(cursor, weeks * 7);
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isReadingDay(cursor, days)) remaining -= 1;
  }
  return cursor;
}

export function getPlanDayDate(startDate: string, dayIndex: number, days: ReadingDays): string | null {
  const start = parseDateKey(startDate);
  if (!start) return null;
  return toDateKey(nthReadingDate(start, dayIndex, days));
}

/** Number of reading days in [from, to), counting `from` but not `to`. Zero when `to` is not after `from`. */
export function countReadingDaysBetween(from: Date, to: Date, days: ReadingDays): number {
  const span = calendarDaysBetween(from, to);
  if (span <= 0) return 0;
  const perWeek = countReadingDaysPerWeek(days);
  const weeks = Math.floor(span / 7);
  let count = weeks * perWeek;
  let cursor = addDays(startOfDay(from), weeks * 7);
  for (let i = weeks * 7; i < span; i += 1) {
    if (isReadingDay(cursor, days)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/**
 * Zero-based reading-day index for `now`: the number of reading days that fall
 * before today. On a reading day this is the day being read; on a rest day it
 * is the index of the next reading day. Negative before the start date.
 */
export function getPlanDayIndex(startDate: string, days: ReadingDays = EVERY_DAY, now: Date = new Date()): number | null {
  const start = parseDateKey(startDate);
  if (!start) return null;
  const today = startOfDay(now);
  const span = calendarDaysBetween(start, today);
  if (span < 0) return span;
  return countReadingDaysBetween(start, today, days);
}

export function getPlanDayCount(stepCount: number, chaptersPerDay: number): number {
  return Math.max(1, Math.ceil(stepCount / Math.max(1, chaptersPerDay)));
}

export type PaceSummary = {
  chaptersPerDay: number;
  dayCount: number;
  /** Date key of the first reading day, or null without a start date. */
  firstDate: string | null;
  /** Date key of the last reading day, or null without a start date. */
  endDate: string | null;
  /** Calendar days from the start date through the end date, inclusive. */
  calendarDays: number | null;
};

export function summarizePace(input: {
  stepCount: number;
  chaptersPerDay: number;
  startDate: string | null;
  readingDays: ReadingDays;
}): PaceSummary {
  const chaptersPerDay = Math.max(1, Math.round(input.chaptersPerDay));
  const dayCount = getPlanDayCount(input.stepCount, chaptersPerDay);
  const start = input.startDate ? parseDateKey(input.startDate) : null;
  if (!start) return { chaptersPerDay, dayCount, firstDate: null, endDate: null, calendarDays: null };
  const first = nthReadingDate(start, 0, input.readingDays);
  const end = nthReadingDate(start, dayCount - 1, input.readingDays);
  return {
    chaptersPerDay,
    dayCount,
    firstDate: toDateKey(first),
    endDate: toDateKey(end),
    calendarDays: calendarDaysBetween(start, end) + 1,
  };
}

/* ---------- step builders ---------- */

export function buildRangeSteps(range: ChapterRange): PlanStepInput[] {
  const book = findCatalogBook(range.volume, range.book);
  if (!book) return [];
  const from = Math.max(1, Math.min(book.chapters, Math.floor(range.from)));
  const to = Math.max(from, Math.min(book.chapters, Math.floor(range.to)));
  const steps: PlanStepInput[] = [];
  for (let chapter = from; chapter <= to; chapter += 1) {
    const ref = { volume: book.volume, book: book.book, chapter };
    steps.push({ ...ref, label: formatChapterLabel(ref) });
  }
  return steps;
}

export function buildBookSteps(volume: string, book: string): PlanStepInput[] {
  const entry = findCatalogBook(volume, book);
  if (!entry) return [];
  return buildRangeSteps({ volume: entry.volume, book: entry.book, from: 1, to: entry.chapters });
}

export function buildVolumeSteps(volume: string): PlanStepInput[] {
  return getCatalogBooks(volume).flatMap((book) => buildBookSteps(book.volume, book.book));
}

export function dedupeSteps(steps: PlanStepInput[]): PlanStepInput[] {
  const seen = new Set<string>();
  const out: PlanStepInput[] = [];
  for (const step of steps) {
    const key = `${step.volume}:${step.book}:${step.chapter}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(step);
  }
  return out;
}

/* ---------- descriptions ---------- */

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function describePlanPace(plan: {
  stepCount: number;
  chaptersPerDay: number | null;
  startDate: string | null;
  readingDays?: readonly boolean[] | null;
}): string {
  const chapters = pluralize(plan.stepCount, "chapter");
  if (!plan.chaptersPerDay) return `${chapters} · read at your own pace`;
  const readingDays = normalizeReadingDays(plan.readingDays);
  const pace = summarizePace({
    stepCount: plan.stepCount,
    chaptersPerDay: plan.chaptersPerDay,
    startDate: plan.startDate,
    readingDays,
  });
  const cadence = `${pace.chaptersPerDay} a day · ${pluralize(pace.dayCount, "reading day")}`;
  if (!pace.firstDate || !pace.endDate) return `${chapters} · ${cadence}`;
  return `${chapters} · ${cadence} · ${formatDateKey(pace.firstDate)} to ${formatDateKey(pace.endDate)}`;
}

/* ---------- today's reading ---------- */

export type PlanDayGroup<Step> = {
  day: number;
  date: string | null;
  steps: Step[];
  isToday: boolean;
};

export type PlanSchedule<Step> = {
  /** "Day 3 of 30", "Up next", "Rest day", "Not started yet" or "Schedule finished". */
  todayTitle: string;
  todayNote: string | null;
  todaySteps: Step[];
  /** One group per reading day, or null for plans without a cadence. */
  groups: PlanDayGroup<Step>[] | null;
};

/** What to read today, and the whole plan grouped by day, from the plan's cadence and calendar. */
export function buildPlanSchedule<Step extends { readAt: number | null }>(
  plan: {
    steps: Step[];
    stepCount: number;
    chaptersPerDay: number | null;
    startDate: string | null;
    readingDays?: readonly boolean[] | null;
  },
  now: Date = new Date()
): PlanSchedule<Step> {
  const cadence = plan.chaptersPerDay;
  const unread = plan.steps.filter((step) => !step.readAt);
  const allReadNote = unread.length === 0 ? "Every chapter is read." : null;

  if (!cadence) {
    return {
      todayTitle: "Up next",
      todayNote: allReadNote,
      todaySteps: unread.slice(0, 1),
      groups: null,
    };
  }

  const readingDays = normalizeReadingDays(plan.readingDays);
  const dayCount = getPlanDayCount(plan.stepCount, cadence);
  const stepsForDay = (day: number) => plan.steps.slice(day * cadence, (day + 1) * cadence);
  const dayIndex = plan.startDate ? getPlanDayIndex(plan.startDate, readingDays, now) : null;
  let activeDay: number | null = null;
  let todayTitle = "Up next";
  let todayNote: string | null = allReadNote;
  let todaySteps = unread.slice(0, cadence);

  if (plan.startDate && dayIndex !== null) {
    if (dayIndex < 0) {
      const firstDate = getPlanDayDate(plan.startDate, 0, readingDays) ?? plan.startDate;
      todayTitle = "Not started yet";
      todayNote = `Day 1 is ${formatDateKey(firstDate)}.`;
      todaySteps = stepsForDay(0);
    } else if (dayIndex >= dayCount) {
      todayTitle = "Schedule finished";
      todayNote = unread.length ? `${pluralize(unread.length, "chapter")} still unread.` : allReadNote;
    } else if (!isReadingDay(now, readingDays)) {
      const nextDate = getPlanDayDate(plan.startDate, dayIndex, readingDays);
      todayTitle = "Rest day";
      todayNote = `Day ${dayIndex + 1} is ${nextDate ? formatDateKey(nextDate) : "next"}.`;
      todaySteps = stepsForDay(dayIndex);
    } else {
      activeDay = dayIndex;
      todayTitle = `Day ${dayIndex + 1} of ${dayCount}`;
      todayNote = null;
      todaySteps = stepsForDay(dayIndex);
    }
  }

  const groups: PlanDayGroup<Step>[] = Array.from({ length: dayCount }, (_, day) => ({
    day,
    date: plan.startDate ? getPlanDayDate(plan.startDate, day, readingDays) : null,
    steps: stepsForDay(day),
    isToday: activeDay === day,
  }));

  return { todayTitle, todayNote, todaySteps, groups };
}
