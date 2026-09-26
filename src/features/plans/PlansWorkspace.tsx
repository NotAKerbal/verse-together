"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { getScriptureVolumeLabel } from "@/lib/scriptureVolumes";
import ProgressBar from "./ProgressBar";
import PlansSignedOut from "./PlansSignedOut";
import {
  BOM_THIRTY_DAY_CHAPTERS_PER_DAY,
  BOM_THIRTY_DAY_STEPS,
  PLAN_TEMPLATE_LABELS,
  buildBookSteps,
  buildRangeSteps,
  dedupeSteps,
  describePlanPace,
  toDateKey,
  type ChapterRange,
  type PlanStepInput,
  type PlanTemplate,
} from "./planSchedule";
import { PLAN_VOLUME_IDS, findCatalogBook, getBookLabel, getCatalogBooks } from "./scriptureCatalog";
import { useMyPlans, usePlanActions, type PlanSummary } from "./useReadingProgress";

const TEMPLATE_ORDER: PlanTemplate[] = ["bom-30", "book-daily", "custom"];
const INPUT_CLASS = "soft-input w-full px-3 py-2 text-sm font-semibold text-[color:var(--foreground)]";

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function firstBookOf(volume: string): string {
  return getCatalogBooks(volume)[0]?.book ?? "";
}

function describeRange(range: ChapterRange): string {
  const bookLabel = getBookLabel(range.volume, range.book);
  return range.from === range.to ? `${bookLabel} ${range.from}` : `${bookLabel} ${range.from}–${range.to}`;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1">
      <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-soft)]">{label}</span>
      {children}
    </label>
  );
}

function BookSelect({
  idPrefix,
  volume,
  book,
  onVolumeChange,
  onBookChange,
}: {
  idPrefix: string;
  volume: string;
  book: string;
  onVolumeChange: (volume: string) => void;
  onBookChange: (book: string) => void;
}) {
  const books = getCatalogBooks(volume);
  return (
    <>
      <Field label="Volume" htmlFor={`${idPrefix}-volume`}>
        <select id={`${idPrefix}-volume`} className={INPUT_CLASS} value={volume} onChange={(event) => onVolumeChange(event.target.value)}>
          {PLAN_VOLUME_IDS.map((id) => (
            <option key={id} value={id}>
              {getScriptureVolumeLabel(id)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Book" htmlFor={`${idPrefix}-book`}>
        <select id={`${idPrefix}-book`} className={INPUT_CLASS} value={book} onChange={(event) => onBookChange(event.target.value)}>
          {books.map((entry) => (
            <option key={entry.book} value={entry.book}>
              {entry.label} ({entry.chapters})
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

function PlanCard({ plan, onDelete, deleting }: { plan: PlanSummary; onDelete: () => void; deleting: boolean }) {
  const href = `/plans/${plan.id}`;
  return (
    <li className="panel-card flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="pill-tag px-2 py-0.5">{PLAN_TEMPLATE_LABELS[plan.template]}</span>
          <h3 className="mt-2 font-display text-[1.2rem] font-bold leading-tight tracking-[-0.025em]">
            <Link href={href} className="underline-offset-4 hover:underline">
              {plan.title}
            </Link>
          </h3>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete plan ${plan.title}`}
          title="Delete plan"
          className="surface-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 disabled:opacity-60"
        >
          <TrashIcon />
        </button>
      </div>
      <ProgressBar value={plan.readCount} max={plan.stepCount} label={`${plan.readCount} of ${plan.stepCount} chapters read`} />
      <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">{describePlanPace(plan)}</p>
      <Link
        href={href}
        className="surface-button mt-auto inline-flex min-h-9 w-fit items-center rounded-full border-2 px-4 text-sm"
        data-tap
      >
        Open plan
      </Link>
    </li>
  );
}

function PlanList() {
  const plans = useMyPlans();
  const { deletePlan } = usePlanActions();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(plan: PlanSummary) {
    if (!window.confirm(`Delete "${plan.title}"? Chapters you've marked read are kept.`)) return;
    setDeletingId(plan.id);
    setError(null);
    try {
      await deletePlan(plan.id);
    } catch {
      setError("Couldn't delete that plan. Try again in a moment.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="page-section" aria-labelledby="my-plans-heading">
      <h2 id="my-plans-heading" className="font-display px-1 text-[1.3rem] font-bold tracking-[-0.025em]">
        My plans
      </h2>
      {error ? (
        <p role="alert" className="px-1 text-sm font-semibold" style={{ color: "var(--accent-coral)" }}>
          {error}
        </p>
      ) : null}
      {!plans ? (
        <p className="panel-card-soft px-5 py-6 text-sm text-[color:var(--foreground-muted)]">Loading your plans…</p>
      ) : plans.length === 0 ? (
        <p className="panel-card-soft px-5 py-6 text-sm text-[color:var(--foreground-muted)]">
          No plans yet. Start one below and it will show up here.
        </p>
      ) : (
        <ul className="browse-grid">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} deleting={deletingId === plan.id} onDelete={() => void handleDelete(plan)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CreatePlanPanel() {
  const router = useRouter();
  const { createPlan } = usePlanActions();
  const [template, setTemplateState] = useState<PlanTemplate>("bom-30");
  const [startDate, setStartDate] = useState(() => toDateKey(new Date()));
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [dailyVolume, setDailyVolume] = useState("bookofmormon");
  const [dailyBook, setDailyBook] = useState(() => firstBookOf("bookofmormon"));
  const [customVolume, setCustomVolume] = useState("bookofmormon");
  const [customBook, setCustomBook] = useState(() => firstBookOf("bookofmormon"));
  const [customFrom, setCustomFrom] = useState(1);
  const [customTo, setCustomTo] = useState(() => findCatalogBook("bookofmormon", firstBookOf("bookofmormon"))?.chapters ?? 1);
  const [ranges, setRanges] = useState<ChapterRange[]>([]);
  const [chaptersPerDay, setChaptersPerDay] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customBookEntry = findCatalogBook(customVolume, customBook);
  const customMax = customBookEntry?.chapters ?? 1;

  function setTemplate(next: PlanTemplate) {
    setTemplateState(next);
    setTitleOverride(null);
    setError(null);
  }

  function changeDailyVolume(volume: string) {
    setDailyVolume(volume);
    setDailyBook(firstBookOf(volume));
    setTitleOverride(null);
  }

  function changeDailyBook(book: string) {
    setDailyBook(book);
    setTitleOverride(null);
  }

  function changeCustomBook(volume: string, book: string) {
    setCustomVolume(volume);
    setCustomBook(book);
    setCustomFrom(1);
    setCustomTo(findCatalogBook(volume, book)?.chapters ?? 1);
  }

  function addRange() {
    if (!customBookEntry) return;
    const from = Math.max(1, Math.min(customMax, customFrom));
    const to = Math.max(from, Math.min(customMax, customTo));
    setRanges((prev) => [...prev, { volume: customBookEntry.volume, book: customBookEntry.book, from, to }]);
    setError(null);
  }

  const draft = useMemo<{ steps: PlanStepInput[]; chaptersPerDay: number; defaultTitle: string }>(() => {
    if (template === "bom-30") {
      return {
        steps: BOM_THIRTY_DAY_STEPS,
        chaptersPerDay: BOM_THIRTY_DAY_CHAPTERS_PER_DAY,
        defaultTitle: "Book of Mormon in 30 days",
      };
    }
    if (template === "book-daily") {
      return {
        steps: buildBookSteps(dailyVolume, dailyBook),
        chaptersPerDay: 1,
        defaultTitle: `${getBookLabel(dailyVolume, dailyBook)}, one chapter a day`,
      };
    }
    return {
      steps: dedupeSteps(ranges.flatMap(buildRangeSteps)),
      chaptersPerDay: Math.max(1, Math.round(chaptersPerDay)),
      defaultTitle: "Custom plan",
    };
  }, [template, dailyVolume, dailyBook, ranges, chaptersPerDay]);

  const title = titleOverride ?? draft.defaultTitle;
  const summary = describePlanPace({
    stepCount: draft.steps.length,
    chaptersPerDay: draft.steps.length ? draft.chaptersPerDay : null,
    startDate: startDate || null,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (draft.steps.length === 0) {
      setError("Add at least one chapter to the plan.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { id } = await createPlan({
        title,
        template,
        steps: draft.steps,
        startDate: startDate || undefined,
        chaptersPerDay: draft.chaptersPerDay,
      });
      router.push(`/plans/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Uncaught Error:\s*/, "") : "Couldn't create the plan.");
      setSaving(false);
    }
  }

  return (
    <section className="page-section" aria-labelledby="create-plan-heading">
      <h2 id="create-plan-heading" className="font-display px-1 text-[1.3rem] font-bold tracking-[-0.025em]">
        Start a plan
      </h2>
      <form onSubmit={handleSubmit} className="panel-card flex flex-col gap-5 p-4 sm:p-5">
        <div className="segmented-control w-fit max-w-full flex-wrap" role="group" aria-label="Plan template">
          {TEMPLATE_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTemplate(option)}
              data-active={template === option ? "true" : "false"}
              aria-pressed={template === option}
              className="segmented-control-button text-sm"
            >
              {PLAN_TEMPLATE_LABELS[option]}
            </button>
          ))}
        </div>

        {template === "bom-30" ? (
          <p className="text-sm text-[color:var(--foreground-muted)]">
            All {BOM_THIRTY_DAY_STEPS.length} chapters, {BOM_THIRTY_DAY_CHAPTERS_PER_DAY} a day, from 1 Nephi to Moroni.
          </p>
        ) : null}

        {template === "book-daily" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <BookSelect
              idPrefix="daily"
              volume={dailyVolume}
              book={dailyBook}
              onVolumeChange={changeDailyVolume}
              onBookChange={changeDailyBook}
            />
          </div>
        ) : null}

        {template === "custom" ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_5rem_5rem_auto] sm:items-end">
              <BookSelect
                idPrefix="custom"
                volume={customVolume}
                book={customBook}
                onVolumeChange={(volume) => changeCustomBook(volume, firstBookOf(volume))}
                onBookChange={(book) => changeCustomBook(customVolume, book)}
              />
              <Field label="From" htmlFor="custom-from">
                <input
                  id="custom-from"
                  type="number"
                  min={1}
                  max={customMax}
                  className={INPUT_CLASS}
                  value={customFrom}
                  onChange={(event) => setCustomFrom(Number(event.target.value) || 1)}
                />
              </Field>
              <Field label="To" htmlFor="custom-to">
                <input
                  id="custom-to"
                  type="number"
                  min={1}
                  max={customMax}
                  className={INPUT_CLASS}
                  value={customTo}
                  onChange={(event) => setCustomTo(Number(event.target.value) || 1)}
                />
              </Field>
              <button
                type="button"
                onClick={addRange}
                className="surface-button inline-flex min-h-10 items-center justify-center rounded-full border-2 px-4 text-sm"
              >
                Add chapters
              </button>
            </div>
            {ranges.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Chapters in this plan">
                {ranges.map((range, index) => (
                  <li
                    key={`${range.volume}-${range.book}-${range.from}-${range.to}-${index}`}
                    className="inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--surface-border)] py-1 pl-3 pr-1 text-sm font-semibold"
                    style={{ background: "var(--accent-sky-soft)" }}
                  >
                    {describeRange(range)}
                    <button
                      type="button"
                      onClick={() => setRanges((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`Remove ${describeRange(range)}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)]"
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[color:var(--foreground-muted)]">
                Pick a book and a chapter range, then add it. Add as many ranges as you like; they read in the order you add them.
              </p>
            )}
            <div className="max-w-[12rem]">
              <Field label="Chapters per day" htmlFor="custom-cadence">
                <input
                  id="custom-cadence"
                  type="number"
                  min={1}
                  className={INPUT_CLASS}
                  value={chaptersPerDay}
                  onChange={(event) => setChaptersPerDay(Math.max(1, Number(event.target.value) || 1))}
                />
              </Field>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Field label="Title" htmlFor="plan-title">
            <input
              id="plan-title"
              type="text"
              className={INPUT_CLASS}
              value={title}
              maxLength={120}
              onChange={(event) => setTitleOverride(event.target.value)}
            />
          </Field>
          <Field label="Start date (optional)" htmlFor="plan-start">
            <input
              id="plan-start"
              type="date"
              className={INPUT_CLASS}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[color:var(--surface-border)] pt-4">
          <p className="text-sm font-semibold text-[color:var(--foreground-muted)]">{summary}</p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-5 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)] disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create plan"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-semibold" style={{ color: "var(--accent-coral)" }}>
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

export default function PlansWorkspace() {
  const { user, loading } = useAuth();

  return (
    <section className="page-shell py-4 sm:py-8">
      <header className="page-hero space-y-3">
        <div className="page-eyebrow">Study plans</div>
        <h1 className="page-title">Plans</h1>
        <p className="page-subtitle text-sm">
          Line up chapters, pace them across days, and watch the book and chapter grids fill in as you read.
        </p>
      </header>
      {loading ? null : user ? (
        <>
          <PlanList />
          <CreatePlanPanel />
        </>
      ) : (
        <PlansSignedOut />
      )}
    </section>
  );
}
