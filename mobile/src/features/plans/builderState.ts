// The plan builder's state and rules, as the website's PlanBuilder.tsx keeps them (its form, quick starts, scope
// changes and pace), over the web's own pure planScope.ts and planSchedule.ts. Plain functions, so the screen and its
// tests share one copy of the rules.

import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";
import {
  EVERY_DAY,
  countReadingDaysBetween,
  normalizeReadingDays,
  parseDateKey,
  summarizePace,
  toDateKey,
  type PaceSummary,
  type PlanStepInput,
} from "@/features/plans/planSchedule";
import { autoTitleFromSelections, buildScopeSteps, isSameTarget, selectionsFromSteps, type PlanSelection, type PlanVolumeId } from "@/features/plans/planScope";
import { PLAN_VOLUME_IDS, findCatalogBook, getBookLabel } from "@/features/plans/scriptureCatalog";
import { isLdsVolume } from "../../storage/faithTradition";
import type { PlanDetailData, PlanWriteInput } from "./planData";

export type PaceDriver = "perDay" | "days" | "finishBy";

export type BuilderState = {
  selections: PlanSelection[];
  driver: PaceDriver;
  perDay: number;
  targetDays: number;
  finishBy: string;
  readingDays: boolean[];
  startDate: string;
  titleOverride: string | null;
};

export type ResolvedPace = { chaptersPerDay: number; summary: PaceSummary | null; issue: string | null };

export const VOLUME_TAB_LABELS: Record<PlanVolumeId, string> = {
  bookofmormon: "Book of Mormon",
  oldtestament: "Old Testament",
  newtestament: "New Testament",
  doctrineandcovenants: "D&C",
  pearl: "Pearl of Great Price",
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function freshState(now = new Date()): BuilderState {
  return { selections: [], driver: "perDay", perDay: 1, targetDays: 30, finishBy: "", readingDays: [...EVERY_DAY], startDate: toDateKey(now), titleOverride: null };
}

export function stateFromPlan(plan: PlanDetailData, now = new Date()): BuilderState {
  const selections = plan.selections && plan.selections.length > 0 ? plan.selections : selectionsFromSteps(plan.steps);
  const readingDays = [...normalizeReadingDays(plan.readingDays)];
  const startDate = plan.startDate ?? toDateKey(now);
  const chaptersPerDay = plan.chaptersPerDay ?? 1;
  const summary = summarizePace({ stepCount: plan.stepCount, chaptersPerDay, startDate, readingDays });
  return {
    selections,
    driver: "perDay",
    perDay: chaptersPerDay,
    targetDays: summary.dayCount,
    finishBy: summary.endDate ?? "",
    readingDays,
    startDate,
    titleOverride: plan.title === autoTitleFromSelections(selections) ? null : plan.title,
  };
}

export function resolvePace(state: BuilderState, stepCount: number): ResolvedPace {
  if (stepCount === 0) return { chaptersPerDay: Math.max(1, state.perDay), summary: null, issue: null };
  const readingDays = normalizeReadingDays(state.readingDays);
  const start = parseDateKey(state.startDate);
  if (!start) return { chaptersPerDay: Math.max(1, state.perDay), summary: null, issue: "Pick a start date." };
  let chaptersPerDay: number;
  if (state.driver === "perDay") {
    chaptersPerDay = clamp(Math.round(state.perDay), 1, stepCount);
  } else if (state.driver === "days") {
    chaptersPerDay = Math.ceil(stepCount / clamp(Math.round(state.targetDays), 1, stepCount));
  } else {
    const end = parseDateKey(state.finishBy);
    if (!end) return { chaptersPerDay: 1, summary: null, issue: "Pick a finish date." };
    const dayAfterEnd = new Date(end);
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
    const days = countReadingDaysBetween(start, dayAfterEnd, readingDays);
    if (days < 1) return { chaptersPerDay: 1, summary: null, issue: "The finish date needs at least one reading day after the start." };
    chaptersPerDay = Math.ceil(stepCount / days);
  }
  return { chaptersPerDay, summary: summarizePace({ stepCount, chaptersPerDay, startDate: state.startDate, readingDays }), issue: null };
}

export function describeFirstDay(steps: PlanStepInput[]): string {
  if (steps.length === 0) return "";
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (steps.length === 1) return first.label;
  if (first.book === last.book && first.volume === last.volume) return `${getBookLabel(first.volume, first.book)} ${first.chapter}–${last.chapter}`;
  return `${first.label} to ${last.label}`;
}

export type QuickStart = { id: string; label: string; hint: string; apply: (state: BuilderState) => BuilderState };

export const QUICK_STARTS: QuickStart[] = [
  {
    id: "bom-30",
    label: "Book of Mormon in 30 days",
    hint: "The whole book, about 8 chapters a day.",
    apply: (state) => ({ ...state, selections: [{ kind: "volume", volume: "bookofmormon" }], driver: "days", targetDays: 30, titleOverride: null }),
  },
  {
    id: "nt-quarter",
    label: "New Testament this quarter",
    hint: "Matthew to Revelation, 3 chapters a day.",
    apply: (state) => ({ ...state, selections: [{ kind: "volume", volume: "newtestament" }], driver: "perDay", perDay: 3, titleOverride: null }),
  },
  {
    id: "one-a-day",
    label: "One chapter a day",
    hint: "Keeps what you've picked, sets the pace to 1.",
    apply: (state) => ({ ...state, driver: "perDay", perDay: 1 }),
  },
  {
    id: "gospels",
    label: "Gospels only",
    hint: "Matthew, Mark, Luke, and John, one a day.",
    apply: (state) => ({
      ...state,
      selections: ["matthew", "mark", "luke", "john"].map((book) => ({ kind: "book" as const, volume: "newtestament", book })),
      driver: "perDay",
      perDay: 1,
      titleOverride: null,
    }),
  },
];

/** The quick starts this faith tradition shows (Other denominations: no Book of Mormon plan), as the web filters them. */
export function quickStartsFor(showLdsContent: boolean): QuickStart[] {
  return QUICK_STARTS.filter((quickStart) => showLdsContent || quickStart.id !== "bom-30");
}

/** The volumes the builder offers (Other denominations: the Bible only). */
export function planVolumesFor(showLdsContent: boolean): PlanVolumeId[] {
  return PLAN_VOLUME_IDS.filter((volume) => showLdsContent || !isLdsVolume(volume));
}

// ---- Scope changes (ScopeStep) ----

export function volumeSelected(selections: readonly PlanSelection[], volume: string): boolean {
  return selections.some((s) => s.kind === "volume" && normalizeScriptureVolume(s.volume) === volume);
}

export function findBookSelection(selections: readonly PlanSelection[], volume: string, book: string): PlanSelection | null {
  return selections.find((s) => s.kind !== "volume" && isSameTarget(s, { kind: "book", volume, book })) ?? null;
}

/** A whole volume on (replacing its books) or off. */
export function toggleVolume(selections: PlanSelection[], volume: PlanVolumeId): PlanSelection[] {
  if (volumeSelected(selections, volume)) return selections.filter((s) => !(s.kind === "volume" && normalizeScriptureVolume(s.volume) === volume));
  return [...selections.filter((s) => normalizeScriptureVolume(s.volume) !== volume), { kind: "volume", volume }];
}

export function addBook(selections: PlanSelection[], volume: string, book: string): PlanSelection[] {
  return findBookSelection(selections, volume, book) ? selections : [...selections, { kind: "book", volume, book }];
}

/** Replaces (or, with null, removes) a book's selection. */
export function replaceBookSelection(selections: PlanSelection[], volume: string, book: string, next: PlanSelection | null): PlanSelection[] {
  const index = selections.findIndex((s) => s.kind !== "volume" && isSameTarget(s, { kind: "book", volume, book }));
  if (index === -1) return selections;
  const copy = [...selections];
  if (next) copy[index] = next;
  else copy.splice(index, 1);
  return copy;
}

/** Narrows a book to chapters `from`–`to` (the whole book again when that covers it). */
export function setBookRange(selections: PlanSelection[], volume: string, book: string, from: number, to: number): PlanSelection[] {
  const entry = findCatalogBook(volume, book);
  if (!entry) return selections;
  const safeFrom = clamp(from, 1, entry.chapters);
  const safeTo = clamp(to, safeFrom, entry.chapters);
  return replaceBookSelection(
    selections,
    volume,
    book,
    safeFrom === 1 && safeTo === entry.chapters ? { kind: "book", volume, book } : { kind: "range", volume, book, from: safeFrom, to: safeTo },
  );
}

/** Weekday on/off, keeping at least one reading day. */
export function toggleWeekday(days: readonly boolean[], index: number): boolean[] {
  const next = [...days];
  next[index] = !next[index];
  return next.some(Boolean) ? next : [...days];
}

/** "2026-10-28" moved by `days` (an invalid key stays as it is). */
export function shiftDateKey(key: string, days: number): string {
  const date = parseDateKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

// ---- The form ----

export type BuilderForm = {
  steps: PlanStepInput[];
  pace: ResolvedPace;
  title: string;
  issues: string[];
  input: PlanWriteInput;
};

export function evaluateBuilder(state: BuilderState): BuilderForm {
  const steps = buildScopeSteps(state.selections);
  const pace = resolvePace(state, steps.length);
  const title = state.titleOverride ?? autoTitleFromSelections(state.selections);
  const issues: string[] = [];
  if (state.selections.length === 0) issues.push("Pick at least one volume, book, or chapter range.");
  if (!title.trim()) issues.push("Give the plan a title.");
  if (pace.issue && state.selections.length > 0) issues.push(pace.issue);
  return {
    steps,
    pace,
    title,
    issues,
    input: { title: title.trim(), steps, selections: state.selections, startDate: state.startDate, chaptersPerDay: pace.chaptersPerDay, readingDays: state.readingDays },
  };
}
