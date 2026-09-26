"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import ProgressBar from "./ProgressBar";
import PlansSignedOut from "./PlansSignedOut";
import {
  PLAN_TEMPLATE_LABELS,
  addDaysToKey,
  describePlanPace,
  formatDateKey,
  getPlanDayCount,
  getPlanDayIndex,
} from "./planSchedule";
import { getChapterHref } from "./scriptureCatalog";
import {
  usePlan,
  usePlanActions,
  useReadingProgressActions,
  type PlanDetailData,
  type PlanStepWithState,
} from "./useReadingProgress";

type DayGroup = {
  day: number;
  date: string | null;
  steps: PlanStepWithState[];
  isToday: boolean;
};

type Schedule = {
  todayTitle: string;
  todayNote: string | null;
  todaySteps: PlanStepWithState[];
  groups: DayGroup[] | null;
};

function buildSchedule(plan: PlanDetailData): Schedule {
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

  const dayCount = getPlanDayCount(plan.stepCount, cadence);
  const dayIndex = plan.startDate ? getPlanDayIndex(plan.startDate) : null;
  let activeDay: number | null = null;
  let todayTitle = "Up next";
  let todayNote: string | null = allReadNote;
  let todaySteps = unread.slice(0, cadence);

  if (plan.startDate && dayIndex !== null) {
    if (dayIndex < 0) {
      todayTitle = "Not started yet";
      todayNote = `Day 1 is ${formatDateKey(plan.startDate)}.`;
      todaySteps = plan.steps.slice(0, cadence);
    } else if (dayIndex >= dayCount) {
      todayTitle = "Schedule finished";
      todayNote = unread.length ? `${unread.length} ${unread.length === 1 ? "chapter" : "chapters"} still unread.` : allReadNote;
    } else {
      activeDay = dayIndex;
      todayTitle = `Day ${dayIndex + 1} of ${dayCount}`;
      todayNote = null;
      todaySteps = plan.steps.slice(dayIndex * cadence, (dayIndex + 1) * cadence);
    }
  }

  const groups: DayGroup[] = Array.from({ length: dayCount }, (_, day) => ({
    day,
    date: plan.startDate ? addDaysToKey(plan.startDate, day) : null,
    steps: plan.steps.slice(day * cadence, (day + 1) * cadence),
    isToday: activeDay === day,
  }));

  return { todayTitle, todayNote, todaySteps, groups };
}

function StepRow({
  step,
  pending,
  highlight,
  onToggle,
}: {
  step: PlanStepWithState;
  pending: boolean;
  highlight: boolean;
  onToggle: () => void;
}) {
  const isRead = !!step.readAt;
  return (
    <li
      className="flex items-center gap-3 rounded-[0.85rem] border-2 border-[color:var(--surface-border)] px-3 py-2"
      style={{ background: isRead ? "var(--accent-mint)" : highlight ? "var(--accent-note)" : "var(--surface-card)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={isRead}
        aria-label={`${isRead ? "Unmark" : "Mark"} ${step.label} as read`}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] text-[0.8rem] font-bold disabled:opacity-60"
        style={{
          background: isRead ? "var(--surface-button-active)" : "var(--surface-card)",
          color: isRead ? "var(--surface-button-active-text)" : "var(--foreground)",
        }}
      >
        {isRead ? "✓" : ""}
      </button>
      <Link href={getChapterHref(step)} className="min-w-0 flex-1 truncate text-sm font-semibold underline-offset-4 hover:underline">
        {step.label}
      </Link>
      {isRead ? (
        <span className="text-[0.66rem] font-bold uppercase tracking-[0.08em] text-[color:var(--foreground-muted)]">Read</span>
      ) : null}
    </li>
  );
}

export default function PlanDetail({ planId }: { planId: string }) {
  const { user, loading } = useAuth();
  const plan = usePlan(planId);
  const { markChapterRead, unmarkChapterRead } = useReadingProgressActions();
  const { deletePlan } = usePlanActions();
  const router = useRouter();
  const [pendingSteps, setPendingSteps] = useState<ReadonlySet<number>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schedule = useMemo(() => (plan ? buildSchedule(plan) : null), [plan]);

  async function toggleStep(step: PlanStepWithState) {
    if (pendingSteps.has(step.index)) return;
    setPendingSteps((prev) => new Set(prev).add(step.index));
    setError(null);
    try {
      if (step.readAt) {
        await unmarkChapterRead(step);
      } else {
        await markChapterRead(step);
      }
    } catch {
      setError("Couldn't update that chapter. Try again in a moment.");
    } finally {
      setPendingSteps((prev) => {
        const next = new Set(prev);
        next.delete(step.index);
        return next;
      });
    }
  }

  async function handleDelete() {
    if (!plan || deleting) return;
    if (!window.confirm(`Delete "${plan.title}"? Chapters you've marked read are kept.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePlan(plan.id);
      router.push("/plans");
    } catch {
      setError("Couldn't delete the plan. Try again in a moment.");
      setDeleting(false);
    }
  }

  let content: ReactNode;
  if (loading) {
    content = null;
  } else if (!user) {
    content = <PlansSignedOut />;
  } else if (plan === undefined) {
    content = <p className="panel-card-soft px-5 py-6 text-sm text-[color:var(--foreground-muted)]">Loading plan…</p>;
  } else if (plan === null || !schedule) {
    content = (
      <div className="panel-card flex flex-col items-start gap-3 p-5">
        <h1 className="font-display text-[1.3rem] font-bold">Plan not found</h1>
        <p className="text-sm text-[color:var(--foreground-muted)]">It may have been deleted, or the link is wrong.</p>
      </div>
    );
  } else {
    const percent = plan.stepCount ? Math.round((plan.readCount / plan.stepCount) * 100) : 0;
    const renderStep = (step: PlanStepWithState, highlight: boolean) => (
      <StepRow
        key={step.index}
        step={step}
        pending={pendingSteps.has(step.index)}
        highlight={highlight}
        onToggle={() => void toggleStep(step)}
      />
    );

    content = (
      <>
        <header className="page-hero space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill-tag px-2 py-0.5">{PLAN_TEMPLATE_LABELS[plan.template]}</span>
            <span className="pill-tag px-2 py-0.5" style={{ background: percent === 100 ? "var(--accent-mint)" : "var(--accent-primary)", color: "#17161a" }}>
              {percent}% read
            </span>
          </div>
          <h1 className="page-title">{plan.title}</h1>
          <p className="page-subtitle text-sm">{describePlanPace(plan)}</p>
          <ProgressBar value={plan.readCount} max={plan.stepCount} label={`${plan.readCount} of ${plan.stepCount} chapters read`} className="max-w-[28rem]" />
        </header>

        {error ? (
          <p role="alert" className="px-1 text-sm font-semibold" style={{ color: "var(--accent-coral)" }}>
            {error}
          </p>
        ) : null}

        <section className="panel-card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="plan-today-heading" style={{ background: "var(--surface-card-soft)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="plan-today-heading" className="font-display text-[1.2rem] font-bold tracking-[-0.025em]">
              {schedule.todayTitle}
            </h2>
            {schedule.todayNote ? (
              <p className="text-sm font-semibold text-[color:var(--foreground-muted)]">{schedule.todayNote}</p>
            ) : null}
          </div>
          {schedule.todaySteps.length > 0 ? (
            <ul className="flex flex-col gap-2">{schedule.todaySteps.map((step) => renderStep(step, true))}</ul>
          ) : null}
        </section>

        <section className="panel-card flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="plan-steps-heading">
          <h2 id="plan-steps-heading" className="font-display text-[1.2rem] font-bold tracking-[-0.025em]">
            All chapters
          </h2>
          {schedule.groups ? (
            schedule.groups.map((group) => (
              <section key={group.day} className="flex flex-col gap-2" aria-label={`Day ${group.day + 1}`}>
                <h3 className="flex flex-wrap items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-soft)]">
                  <span
                    className="rounded-full border-2 border-[color:var(--surface-border)] px-2 py-0.5 text-[color:var(--foreground)]"
                    style={{ background: group.isToday ? "var(--accent-primary)" : "var(--surface-card)", color: group.isToday ? "#17161a" : undefined }}
                  >
                    Day {group.day + 1}
                  </span>
                  {group.date ? <span>{formatDateKey(group.date)}</span> : null}
                  {group.isToday ? <span>Today</span> : null}
                </h3>
                <ul className="flex flex-col gap-2">{group.steps.map((step) => renderStep(step, group.isToday))}</ul>
              </section>
            ))
          ) : (
            <ul className="flex flex-col gap-2">{plan.steps.map((step) => renderStep(step, false))}</ul>
          )}
        </section>

        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="surface-button inline-flex min-h-9 items-center rounded-full border-2 px-4 text-sm disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete plan"}
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="page-shell py-4 sm:py-8">
      <div className="px-1">
        <Link href="/plans" className="surface-button inline-flex min-h-9 items-center rounded-full border-2 px-3 text-sm" data-tap>
          {"←"} All plans
        </Link>
      </div>
      {content}
    </section>
  );
}
