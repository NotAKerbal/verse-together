"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import AccountControl from "@/components/AccountControl";
import { useAuth } from "@/lib/auth";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";
import PlansSignedOut from "./PlansSignedOut";
import {
  EVERY_DAY,
  WEEKDAY_LABELS,
  countReadingDaysBetween,
  countReadingDaysPerWeek,
  formatShortDateKey,
  normalizeReadingDays,
  parseDateKey,
  pluralize,
  summarizePace,
  toDateKey,
  type PaceSummary,
  type PlanStepInput,
} from "./planSchedule";
import {
  VOLUME_SHORT_LABELS,
  autoTitleFromSelections,
  buildScopeSteps,
  countSelectionChapters,
  describeSelection,
  getVolumeChapterCount,
  isSameTarget,
  selectionsFromSteps,
  type PlanSelection,
  type PlanVolumeId,
} from "./planScope";
import { PLAN_VOLUME_IDS, findCatalogBook, getBookLabel, getCatalogBooks, getChapterDelineation } from "./scriptureCatalog";
import { usePlan, usePlanActions, type PlanDetailData } from "./useReadingProgress";

/* ---------- state ---------- */

type PaceDriver = "perDay" | "days" | "finishBy";

type BuilderState = {
  selections: PlanSelection[];
  driver: PaceDriver;
  perDay: number;
  targetDays: number;
  finishBy: string;
  readingDays: boolean[];
  startDate: string;
  titleOverride: string | null;
};

type ResolvedPace = {
  chaptersPerDay: number;
  summary: PaceSummary | null;
  issue: string | null;
};

const VOLUME_TAB_LABELS: Record<PlanVolumeId, string> = {
  bookofmormon: "Book of Mormon",
  oldtestament: "Old Testament",
  newtestament: "New Testament",
  doctrineandcovenants: "D&C",
  pearl: "Pearl of Great Price",
};

const INPUT_CLASS = "soft-input w-full px-3 py-2 text-sm font-semibold text-[color:var(--foreground)]";
const PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-5 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)] disabled:opacity-60";
const CHIP_BASE_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border-2 border-[color:var(--surface-border)] px-3 py-1.5 text-sm font-semibold transition-colors";

function freshState(): BuilderState {
  return {
    selections: [],
    driver: "perDay",
    perDay: 1,
    targetDays: 30,
    finishBy: "",
    readingDays: [...EVERY_DAY],
    startDate: toDateKey(new Date()),
    titleOverride: null,
  };
}

function stateFromPlan(plan: PlanDetailData): BuilderState {
  const selections = plan.selections && plan.selections.length > 0 ? plan.selections : selectionsFromSteps(plan.steps);
  const readingDays = [...normalizeReadingDays(plan.readingDays)];
  const startDate = plan.startDate ?? toDateKey(new Date());
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolvePace(state: BuilderState, stepCount: number): ResolvedPace {
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
    if (days < 1) {
      return { chaptersPerDay: 1, summary: null, issue: "The finish date needs at least one reading day after the start." };
    }
    chaptersPerDay = Math.ceil(stepCount / days);
  }

  return {
    chaptersPerDay,
    summary: summarizePace({ stepCount, chaptersPerDay, startDate: state.startDate, readingDays }),
    issue: null,
  };
}

function describeFirstDay(steps: PlanStepInput[]): string {
  if (steps.length === 0) return "";
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (steps.length === 1) return first.label;
  if (first.book === last.book && first.volume === last.volume) {
    return `${getBookLabel(first.volume, first.book)} ${first.chapter}–${last.chapter}`;
  }
  return `${first.label} to ${last.label}`;
}

/* ---------- quick starts ---------- */

type QuickStart = {
  id: string;
  label: string;
  hint: string;
  apply: (state: BuilderState) => BuilderState;
};

const QUICK_STARTS: QuickStart[] = [
  {
    id: "bom-30",
    label: "Book of Mormon in 30 days",
    hint: "The whole book, about 8 chapters a day.",
    apply: (state) => ({
      ...state,
      selections: [{ kind: "volume", volume: "bookofmormon" }],
      driver: "days",
      targetDays: 30,
      titleOverride: null,
    }),
  },
  {
    id: "nt-quarter",
    label: "New Testament this quarter",
    hint: "Matthew to Revelation, 3 chapters a day.",
    apply: (state) => ({
      ...state,
      selections: [{ kind: "volume", volume: "newtestament" }],
      driver: "perDay",
      perDay: 3,
      titleOverride: null,
    }),
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
      selections: ["matthew", "mark", "luke", "john"].map((book) => ({ kind: "book", volume: "newtestament", book })),
      driver: "perDay",
      perDay: 1,
      titleOverride: null,
    }),
  },
];

/* ---------- small pieces ---------- */

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function StepHeading({ number, title, hint }: { number: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="icon-chip h-9 w-9 shrink-0 rounded-full font-display text-[1.05rem] font-extrabold">{number}</span>
      <div className="min-w-0">
        <h2 className="font-display text-[1.25rem] font-bold leading-tight tracking-[-0.025em]">{title}</h2>
        <p className="text-sm text-[color:var(--foreground-muted)]">{hint}</p>
      </div>
    </div>
  );
}

function SubLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const className = "text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-soft)]";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <p className={className}>{children}</p>
  );
}

function Stepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const buttonClass =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold leading-none hover:bg-[color:var(--surface-button-hover)] disabled:opacity-40 disabled:hover:bg-transparent";

  function commit(next: number) {
    if (Number.isFinite(next)) onChange(clamp(Math.round(next), min, max));
  }

  return (
    <div className="inline-flex items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-0.5 shadow-[var(--surface-shadow-soft)]">
      <button type="button" className={buttonClass} aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => commit(value - 1)}>
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(parsed)) commit(parsed);
        }}
        onBlur={() => setDraft(null)}
        className="w-16 bg-transparent text-center font-display text-[1.15rem] font-extrabold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" className={buttonClass} aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => commit(value + 1)}>
        +
      </button>
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[0.85rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] px-3 py-2">
      <p className="font-display text-[1.25rem] font-extrabold leading-tight tracking-[-0.03em] tabular-nums">{value}</p>
      <p className="text-[0.66rem] font-bold uppercase tracking-[0.08em] text-[color:var(--foreground-muted)]">{label}</p>
    </div>
  );
}

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul role="alert" className="flex flex-col gap-1 rounded-[0.85rem] border-2 border-[color:var(--surface-border)] px-3 py-2 text-sm font-semibold" style={{ background: "var(--accent-coral)", color: "#17161a" }}>
      {issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  );
}

/* ---------- step 1: scope ---------- */

function ScopeStep({
  selections,
  onChange,
}: {
  selections: PlanSelection[];
  onChange: (next: PlanSelection[]) => void;
}) {
  const [activeVolume, setActiveVolume] = useState<PlanVolumeId>("bookofmormon");
  const [narrowing, setNarrowing] = useState<{ volume: string; book: string } | null>(null);

  const volumeSelected = (volume: string) => selections.some((s) => s.kind === "volume" && normalizeScriptureVolume(s.volume) === volume);
  const findBookSelection = (volume: string, book: string) =>
    selections.find((s) => s.kind !== "volume" && isSameTarget(s, { kind: "book", volume, book })) ?? null;

  function toggleVolume(volume: PlanVolumeId) {
    if (volumeSelected(volume)) {
      onChange(selections.filter((s) => !(s.kind === "volume" && normalizeScriptureVolume(s.volume) === volume)));
      return;
    }
    const withoutBooks = selections.filter((s) => normalizeScriptureVolume(s.volume) !== volume);
    onChange([...withoutBooks, { kind: "volume", volume }]);
    if (narrowing && normalizeScriptureVolume(narrowing.volume) === volume) setNarrowing(null);
  }

  function tapBook(volume: string, book: string) {
    const existing = findBookSelection(volume, book);
    if (!existing) {
      onChange([...selections, { kind: "book", volume, book }]);
      setNarrowing(null);
      return;
    }
    setNarrowing((prev) => (prev && prev.volume === volume && prev.book === book ? null : { volume, book }));
  }

  function replaceBookSelection(volume: string, book: string, next: PlanSelection | null) {
    const index = selections.findIndex((s) => s.kind !== "volume" && isSameTarget(s, { kind: "book", volume, book }));
    if (index === -1) return;
    const copy = [...selections];
    if (next) copy[index] = next;
    else copy.splice(index, 1);
    onChange(copy);
  }

  function setRange(volume: string, book: string, from: number, to: number) {
    const entry = findCatalogBook(volume, book);
    if (!entry) return;
    const safeFrom = clamp(from, 1, entry.chapters);
    const safeTo = clamp(to, safeFrom, entry.chapters);
    if (safeFrom === 1 && safeTo === entry.chapters) {
      replaceBookSelection(volume, book, { kind: "book", volume, book });
    } else {
      replaceBookSelection(volume, book, { kind: "range", volume, book, from: safeFrom, to: safeTo });
    }
  }

  const activeVolumeSelected = volumeSelected(activeVolume);
  const books = getCatalogBooks(activeVolume);
  const narrowingEntry = narrowing ? findCatalogBook(narrowing.volume, narrowing.book) : null;
  const narrowingSelection = narrowing ? findBookSelection(narrowing.volume, narrowing.book) : null;
  const showStrip = narrowing && narrowingEntry && narrowingSelection && normalizeScriptureVolume(narrowing.volume) === activeVolume;
  const stripFrom = narrowingSelection?.kind === "range" ? (narrowingSelection.from ?? 1) : 1;
  const stripTo = narrowingSelection?.kind === "range" ? (narrowingSelection.to ?? stripFrom) : (narrowingEntry?.chapters ?? 1);

  return (
    <section className="panel-card flex flex-col gap-5 p-4 sm:p-5" aria-labelledby="scope-heading">
      <div id="scope-heading">
        <StepHeading number={1} title="What to read" hint="Tap a whole volume, or pick books and narrow any of them to a chapter range. Everything reads in the order you add it." />
      </div>

      <div className="flex flex-col gap-2">
        <SubLabel>Whole volume</SubLabel>
        <div className="flex flex-wrap gap-2">
          {PLAN_VOLUME_IDS.map((volume) => {
            const on = volumeSelected(volume);
            return (
              <button
                key={volume}
                type="button"
                onClick={() => toggleVolume(volume)}
                aria-pressed={on}
                className={CHIP_BASE_CLASS}
                style={{ background: on ? "var(--accent-mint)" : "var(--surface-card)" }}
              >
                {on ? <CheckIcon /> : null}
                {VOLUME_SHORT_LABELS[volume]}
                <span className="text-xs font-bold text-[color:var(--foreground-muted)]">{getVolumeChapterCount(volume)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SubLabel>Or pick books</SubLabel>
        <div className="segmented-control w-fit max-w-full flex-wrap" role="group" aria-label="Volume to pick books from">
          {PLAN_VOLUME_IDS.map((volume) => (
            <button
              key={volume}
              type="button"
              aria-pressed={activeVolume === volume}
              data-active={activeVolume === volume ? "true" : "false"}
              onClick={() => setActiveVolume(volume)}
              className="segmented-control-button text-sm"
            >
              {VOLUME_TAB_LABELS[volume]}
            </button>
          ))}
        </div>

        {activeVolumeSelected ? (
          <p className="text-sm font-semibold text-[color:var(--foreground-muted)]">
            The whole {VOLUME_SHORT_LABELS[activeVolume]} is in this plan. Untap it above to pick individual books.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2" role="group" aria-label={`${VOLUME_SHORT_LABELS[activeVolume]} books`}>
          {books.map((entry) => {
            const selection = activeVolumeSelected ? null : findBookSelection(entry.volume, entry.book);
            const range = selection && selection.kind === "range" ? selection : null;
            const narrowed = range !== null;
            const isOpen = narrowing?.volume === entry.volume && narrowing?.book === entry.book;
            const background = activeVolumeSelected
              ? "var(--accent-mint)"
              : narrowed
                ? "var(--accent-primary)"
                : selection
                  ? "var(--accent-sky-soft)"
                  : "var(--surface-card)";
            return (
              <button
                key={entry.book}
                type="button"
                disabled={activeVolumeSelected}
                aria-pressed={activeVolumeSelected || !!selection}
                aria-expanded={selection ? isOpen : undefined}
                onClick={() => tapBook(entry.volume, entry.book)}
                className={`${CHIP_BASE_CLASS} disabled:cursor-not-allowed disabled:opacity-70 ${isOpen ? "shadow-[var(--surface-shadow-soft)]" : ""}`}
                style={{ background, color: narrowed ? "#17161a" : undefined }}
              >
                {entry.label}
                <span className="text-xs font-bold tabular-nums" style={{ color: narrowed ? "#17161a" : "var(--foreground-muted)" }}>
                  {range ? `${range.from}–${range.to}` : entry.chapters}
                </span>
              </button>
            );
          })}
        </div>

        {showStrip && narrowingEntry ? (
          <div
            className="flex flex-col gap-3 rounded-[1rem] border-2 border-[color:var(--surface-border)] p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
            style={{ background: "var(--accent-note)" }}
          >
            <p className="text-sm font-bold">
              Narrow {narrowingEntry.label}
              <span className="block text-xs font-semibold text-[color:var(--foreground-muted)]">
                {getChapterDelineation(narrowingEntry.volume)}s 1–{narrowingEntry.chapters}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <SubLabel htmlFor="narrow-from">From</SubLabel>
                <Stepper
                  key={`${narrowingEntry.book}-from`}
                  id="narrow-from"
                  label={`first ${getChapterDelineation(narrowingEntry.volume).toLowerCase()}`}
                  value={stripFrom}
                  min={1}
                  max={narrowingEntry.chapters}
                  onChange={(from) => setRange(narrowingEntry.volume, narrowingEntry.book, from, Math.max(from, stripTo))}
                />
              </div>
              <div className="flex items-center gap-2">
                <SubLabel htmlFor="narrow-to">To</SubLabel>
                <Stepper
                  key={`${narrowingEntry.book}-to`}
                  id="narrow-to"
                  label={`last ${getChapterDelineation(narrowingEntry.volume).toLowerCase()}`}
                  value={stripTo}
                  min={stripFrom}
                  max={narrowingEntry.chapters}
                  onChange={(to) => setRange(narrowingEntry.volume, narrowingEntry.book, stripFrom, to)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {narrowingSelection?.kind === "range" ? (
                <button
                  type="button"
                  onClick={() => setRange(narrowingEntry.volume, narrowingEntry.book, 1, narrowingEntry.chapters)}
                  className="surface-button inline-flex min-h-9 items-center rounded-full border-2 px-3 text-sm"
                >
                  Whole book
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  replaceBookSelection(narrowingEntry.volume, narrowingEntry.book, null);
                  setNarrowing(null);
                }}
                className="surface-button inline-flex min-h-9 items-center rounded-full border-2 px-3 text-sm"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setNarrowing(null)}
                className="inline-flex min-h-9 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-3 text-sm font-bold text-[color:var(--surface-button-active-text)]"
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- step 2: pace ---------- */

function PaceStep({
  state,
  pace,
  stepCount,
  onChange,
}: {
  state: BuilderState;
  pace: ResolvedPace;
  stepCount: number;
  onChange: (patch: Partial<BuilderState>) => void;
}) {
  const summary = pace.summary;
  const cards: Array<{ driver: PaceDriver; label: string; value: string; note: string }> = [
    {
      driver: "perDay",
      label: "Chapters per day",
      value: summary ? String(summary.chaptersPerDay) : "–",
      note: "Fix the daily amount",
    },
    {
      driver: "days",
      label: "Reading days",
      value: summary ? String(summary.dayCount) : "–",
      note: "Fix how many sittings",
    },
    {
      driver: "finishBy",
      label: "Finish by",
      value: summary?.endDate ? formatShortDateKey(summary.endDate) : "–",
      note: "Fix the end date",
    },
  ];
  const readingDayCount = countReadingDaysPerWeek(state.readingDays);

  function toggleWeekday(index: number) {
    const next = [...state.readingDays];
    next[index] = !next[index];
    if (!next.some(Boolean)) return;
    onChange({ readingDays: next });
  }

  return (
    <section className="panel-card flex flex-col gap-5 p-4 sm:p-5" aria-labelledby="pace-heading">
      <div id="pace-heading">
        <StepHeading number={2} title="How fast" hint="Choose the one number you care about. The other two follow from it." />
      </div>

      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Pace driver">
        {cards.map((card) => {
          const active = state.driver === card.driver;
          return (
            <button
              key={card.driver}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ driver: card.driver })}
              className="flex flex-col items-start gap-0.5 rounded-[1rem] border-2 border-[color:var(--surface-border)] px-4 py-3 text-left transition-colors"
              style={{
                background: active ? "var(--accent-primary)" : "var(--surface-card)",
                color: active ? "#17161a" : undefined,
                boxShadow: active ? "var(--surface-shadow-soft)" : undefined,
              }}
            >
              <span className="text-[0.66rem] font-bold uppercase tracking-[0.08em]" style={{ color: active ? "#17161a" : "var(--foreground-soft)" }}>
                {card.label}
              </span>
              <span className="font-display text-[1.5rem] font-extrabold leading-tight tracking-[-0.03em] tabular-nums">{card.value}</span>
              <span className="text-xs font-semibold" style={{ color: active ? "rgba(23,22,26,0.7)" : "var(--foreground-muted)" }}>
                {active ? "Driving the schedule" : card.note}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {state.driver === "perDay" ? (
          <>
            <SubLabel htmlFor="pace-per-day">Chapters per day</SubLabel>
            <Stepper id="pace-per-day" label="chapters per day" value={state.perDay} min={1} max={Math.max(1, stepCount)} onChange={(perDay) => onChange({ perDay })} />
          </>
        ) : state.driver === "days" ? (
          <>
            <SubLabel htmlFor="pace-days">Reading days</SubLabel>
            <Stepper id="pace-days" label="reading days" value={state.targetDays} min={1} max={Math.max(1, stepCount)} onChange={(targetDays) => onChange({ targetDays })} />
            {summary && summary.dayCount !== state.targetDays && stepCount > 0 ? (
              <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">
                At {summary.chaptersPerDay} a day it actually wraps up in {pluralize(summary.dayCount, "reading day")}.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <SubLabel htmlFor="pace-finish">Finish by</SubLabel>
            <input
              id="pace-finish"
              type="date"
              min={state.startDate || undefined}
              className={`${INPUT_CLASS} max-w-[14rem]`}
              value={state.finishBy}
              onChange={(event) => onChange({ finishBy: event.target.value })}
            />
          </>
        )}
        {pace.issue ? (
          <p className="text-sm font-semibold" style={{ color: "var(--accent-coral)" }}>
            {pace.issue}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <SubLabel>Reading days · {readingDayCount === 7 ? "every day" : `${readingDayCount} a week`}</SubLabel>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reading days of the week">
            {WEEKDAY_LABELS.map((label, index) => {
              const on = state.readingDays[index];
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleWeekday(index)}
                  className="inline-flex h-10 w-12 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] text-xs font-bold"
                  style={{
                    background: on ? "var(--surface-button-active)" : "var(--surface-card)",
                    color: on ? "var(--surface-button-active-text)" : "var(--foreground-muted)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SubLabel htmlFor="pace-start">Start date</SubLabel>
          <input
            id="pace-start"
            type="date"
            className={`${INPUT_CLASS} sm:w-[12rem]`}
            value={state.startDate}
            onChange={(event) => onChange({ startDate: event.target.value })}
          />
        </div>
      </div>
    </section>
  );
}

/* ---------- summary sticky ---------- */

function SummaryCard({
  mode,
  title,
  autoTitle,
  selections,
  steps,
  pace,
  readingDays,
  issues,
  serverError,
  saving,
  onTitleChange,
  onRemoveSelection,
}: {
  mode: "create" | "edit";
  title: string;
  autoTitle: boolean;
  selections: PlanSelection[];
  steps: PlanStepInput[];
  pace: ResolvedPace;
  readingDays: boolean[];
  issues: string[];
  serverError: string | null;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onRemoveSelection: (index: number) => void;
}) {
  const summary = pace.summary;
  const perWeek = countReadingDaysPerWeek(readingDays);
  const firstDay = summary ? describeFirstDay(steps.slice(0, summary.chaptersPerDay)) : "";
  const preview = summary
    ? `Day 1 is ${firstDay}. ${pluralize(summary.calendarDays ?? summary.dayCount, "calendar day")} with ${perWeek === 7 ? "reading every day" : `${perWeek} reading ${perWeek === 1 ? "day" : "days"} a week`}.`
    : "Pick something to read and the schedule will fill in here.";

  return (
    <div className="sticky-note flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="plan-title" className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-muted)]">
          Plan title{autoTitle ? " · auto" : ""}
        </label>
        <input
          id="plan-title"
          type="text"
          maxLength={120}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="w-full border-0 border-b-2 border-[color:var(--surface-border)] bg-transparent pb-1 font-display text-[1.35rem] font-extrabold leading-tight tracking-[-0.03em] outline-none placeholder:text-[color:var(--foreground-soft)]"
          placeholder="Name this plan"
        />
      </div>

      {selections.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selections in reading order">
          {selections.map((selection, index) => {
            const label = describeSelection(selection);
            return (
              <li
                key={`${selection.kind}-${selection.volume}-${selection.book ?? ""}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] py-0.5 pl-2.5 pr-0.5 text-xs font-bold"
              >
                <span>{label}</span>
                <span className="text-[color:var(--foreground-muted)]">{countSelectionChapters(selection)}</span>
                <button
                  type="button"
                  onClick={() => onRemoveSelection(index)}
                  aria-label={`Remove ${label}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] hover:bg-[color:var(--surface-button-hover)]"
                >
                  <CloseIcon />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-[color:var(--foreground-muted)]">Nothing picked yet.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <StatTile value={String(steps.length)} label="Chapters" />
        <StatTile value={summary ? String(summary.chaptersPerDay) : "–"} label="Per reading day" />
        <StatTile value={summary ? String(summary.dayCount) : "–"} label="Reading days" />
        <StatTile value={summary?.endDate ? formatShortDateKey(summary.endDate) : "–"} label="Finishes" />
      </div>

      <p className="text-sm font-semibold leading-snug">{preview}</p>

      <IssueList issues={issues} />
      {serverError ? (
        <p role="alert" className="text-sm font-semibold" style={{ color: "var(--accent-coral)" }}>
          {serverError}
        </p>
      ) : null}

      <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASS}>
        {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Start this plan"}
      </button>
      {mode === "edit" ? (
        <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">
          Chapters you&apos;ve already read stay read. Only the schedule is rebuilt.
        </p>
      ) : null}
    </div>
  );
}

function QuickStarts({ onPick }: { onPick: (quickStart: QuickStart) => void }) {
  return (
    <section className="panel-card flex flex-col gap-3 p-4" aria-labelledby="quick-starts-heading">
      <h2 id="quick-starts-heading" className="font-display text-[1.05rem] font-bold tracking-[-0.025em]">
        Quick starts
      </h2>
      <ul className="flex flex-col gap-2">
        {QUICK_STARTS.map((quickStart) => (
          <li key={quickStart.id}>
            <button
              type="button"
              onClick={() => onPick(quickStart)}
              className="surface-button flex w-full flex-col items-start rounded-[0.85rem] border-2 px-3 py-2 text-left"
            >
              <span className="text-sm font-bold">{quickStart.label}</span>
              <span className="text-xs font-semibold text-[color:var(--foreground-muted)]">{quickStart.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">These fill in the builder. Tweak anything before you start.</p>
    </section>
  );
}

/* ---------- form ---------- */

function PlanBuilderForm({ plan }: { plan: PlanDetailData | null }) {
  const router = useRouter();
  const { createPlan, updatePlan } = usePlanActions();
  const [state, setState] = useState<BuilderState>(() => (plan ? stateFromPlan(plan) : freshState()));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const mode = plan ? "edit" : "create";
  const steps = useMemo(() => buildScopeSteps(state.selections), [state.selections]);
  const pace = useMemo(() => resolvePace(state, steps.length), [state, steps.length]);
  const title = state.titleOverride ?? autoTitleFromSelections(state.selections);

  const issues: string[] = [];
  if (state.selections.length === 0) issues.push("Pick at least one volume, book, or chapter range.");
  if (!title.trim()) issues.push("Give the plan a title.");
  if (pace.issue && state.selections.length > 0) issues.push(pace.issue);

  function patch(next: Partial<BuilderState>) {
    setState((prev) => ({ ...prev, ...next }));
    setServerError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setAttempted(true);
    if (issues.length > 0) return;
    setSaving(true);
    setServerError(null);
    const input = {
      title: title.trim(),
      steps,
      selections: state.selections,
      startDate: state.startDate,
      chaptersPerDay: pace.chaptersPerDay,
      readingDays: state.readingDays,
    };
    try {
      if (plan) {
        await updatePlan(plan.id, input);
        router.push(`/plans/${plan.id}`);
      } else {
        const { id } = await createPlan({ ...input, template: "custom" });
        router.push(`/plans/${id}`);
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message.replace(/^Uncaught Error:\s*/, "") : "Couldn't save the plan.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start" noValidate>
      <div className="flex flex-col gap-6">
        <ScopeStep selections={state.selections} onChange={(selections) => patch({ selections })} />
        <PaceStep state={state} pace={pace} stepCount={steps.length} onChange={patch} />
      </div>
      <aside className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--header-height)_+_1rem)]">
        <SummaryCard
          mode={mode}
          title={title}
          autoTitle={state.titleOverride === null}
          selections={state.selections}
          steps={steps}
          pace={pace}
          readingDays={state.readingDays}
          issues={attempted ? issues : []}
          serverError={serverError}
          saving={saving}
          onTitleChange={(value) => patch({ titleOverride: value })}
          onRemoveSelection={(index) => patch({ selections: state.selections.filter((_, i) => i !== index) })}
        />
        <QuickStarts onPick={(quickStart) => setState((prev) => quickStart.apply(prev))} />
      </aside>
    </form>
  );
}

/* ---------- page ---------- */

export default function PlanBuilder({ planId }: { planId?: string }) {
  const { user, loading } = useAuth();
  const plan = usePlan(planId ?? null);
  const editing = !!planId;

  let content: ReactNode;
  if (loading) {
    content = null;
  } else if (!user) {
    content = <PlansSignedOut />;
  } else if (editing && plan === undefined) {
    content = <p className="panel-card-soft px-5 py-6 text-sm text-[color:var(--foreground-muted)]">Loading plan…</p>;
  } else if (editing && plan === null) {
    content = (
      <div className="panel-card flex flex-col items-start gap-3 p-5">
        <h2 className="font-display text-[1.3rem] font-bold">Plan not found</h2>
        <p className="text-sm text-[color:var(--foreground-muted)]">It may have been deleted, or the link is wrong.</p>
      </div>
    );
  } else {
    content = <PlanBuilderForm key={plan?.id ?? "new"} plan={editing ? (plan ?? null) : null} />;
  }

  return (
    <section className="page-shell py-4 sm:py-8">
      <div className="flex items-center justify-between gap-3 px-1">
        <Link href={editing ? `/plans/${planId}` : "/plans"} className="surface-button inline-flex min-h-9 items-center rounded-full border-2 px-3 text-sm" data-tap>
          {"←"} {editing ? "Back to plan" : "All plans"}
        </Link>
        <AccountControl variant="page" />
      </div>
      <header className="page-hero space-y-3">
        <div className="page-eyebrow">Study plans</div>
        <h1 className="page-title">{editing ? "Edit plan" : "New plan"}</h1>
        <p className="page-subtitle text-sm">
          {editing
            ? "Change what you're reading or how fast. Your read chapters stay put."
            : "Two steps: what to read, then how fast. A whole volume, a handful of books, or one chapter range, it all works."}
        </p>
      </header>
      {content}
    </section>
  );
}
