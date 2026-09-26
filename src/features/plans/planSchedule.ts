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

const DAY_MS = 24 * 60 * 60 * 1000;

export const PLAN_TEMPLATE_LABELS: Record<PlanTemplate, string> = {
  "bom-30": "Book of Mormon in 30 days",
  "book-daily": "One chapter a day",
  custom: "Custom",
};

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

export function addDaysToKey(key: string, days: number): string | null {
  const date = parseDateKey(key);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function formatDateKey(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Zero-based day of the plan for `now`; negative before the start date. */
export function getPlanDayIndex(startDate: string, now: Date = new Date()): number | null {
  const start = parseDateKey(startDate);
  if (!start) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - start.getTime()) / DAY_MS);
}

export function getPlanDayCount(stepCount: number, chaptersPerDay: number): number {
  return Math.max(1, Math.ceil(stepCount / Math.max(1, chaptersPerDay)));
}

export function getStepDay(index: number, chaptersPerDay: number): number {
  return Math.floor(index / Math.max(1, chaptersPerDay));
}

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

export const BOM_THIRTY_DAY_STEPS = buildVolumeSteps("bookofmormon");
export const BOM_THIRTY_DAY_CHAPTERS_PER_DAY = Math.ceil(BOM_THIRTY_DAY_STEPS.length / 30);

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

export function describePlanPace(plan: {
  stepCount: number;
  chaptersPerDay: number | null;
  startDate: string | null;
}): string {
  const chapters = `${plan.stepCount} ${plan.stepCount === 1 ? "chapter" : "chapters"}`;
  if (!plan.chaptersPerDay) return `${chapters} · read at your own pace`;
  const dayCount = getPlanDayCount(plan.stepCount, plan.chaptersPerDay);
  const pace = `${plan.chaptersPerDay} a day · ${dayCount} ${dayCount === 1 ? "day" : "days"}`;
  if (!plan.startDate) return `${chapters} · ${pace}`;
  const endDate = addDaysToKey(plan.startDate, dayCount - 1);
  return `${chapters} · ${pace} · ${formatDateKey(plan.startDate)} to ${endDate ? formatDateKey(endDate) : "?"}`;
}
