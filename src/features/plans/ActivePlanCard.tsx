"use client";

import Link from "next/link";
import { useMemo } from "react";
import ChapterChip from "./ChapterChip";
import ProgressBar from "./ProgressBar";
import { buildPlanSchedule } from "./planSchedule";
import { getChapterHref } from "./scriptureCatalog";
import { useMyPlans, usePlan, type PlanSummary } from "./useReadingProgress";

function ArrowIcon() {
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
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function pickMostRecent(plans: PlanSummary[]): PlanSummary | null {
  let best: PlanSummary | null = null;
  for (const plan of plans) {
    if (!best || (plan.updatedAt ?? plan.createdAt) > (best.updatedAt ?? best.createdAt)) best = plan;
  }
  return best;
}

/** Today's chapters from the most recently updated plan. Renders nothing when signed out or without plans. */
export default function ActivePlanCard() {
  const plans = useMyPlans();
  const active = useMemo(() => (plans ? pickMostRecent(plans) : null), [plans]);
  const plan = usePlan(active?.id ?? null);
  const schedule = useMemo(() => (plan ? buildPlanSchedule(plan) : null), [plan]);

  if (!plans || !plan || !schedule) return null;

  const headingId = `active-plan-${plan.id}`;

  return (
    <article
      className="panel-card flex h-full flex-col gap-3 p-4 sm:p-5"
      style={{ background: "var(--accent-note)" }}
      aria-labelledby={headingId}
    >
      <Link href={`/plans/${plan.id}`} className="group flex items-start justify-between gap-3 text-[color:var(--foreground)]" data-tap>
        <div className="min-w-0">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-muted)]">
            Your plan · {schedule.todayTitle}
          </p>
          <h2 id={headingId} className="font-display truncate text-[1.35rem] font-extrabold leading-tight tracking-[-0.03em]">
            {plan.title}
          </h2>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] transition-transform duration-150 group-hover:translate-x-0.5">
          <ArrowIcon />
        </span>
      </Link>

      {schedule.todayNote ? (
        <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">{schedule.todayNote}</p>
      ) : null}

      <ProgressBar value={plan.readCount} max={plan.stepCount} label={`${plan.readCount} of ${plan.stepCount} chapters read`} />

      {schedule.todaySteps.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Today's chapters">
          {schedule.todaySteps.map((step) => (
            <li key={step.index} className="max-w-full">
              <ChapterChip href={getChapterHref(step)} label={step.label} read={!!step.readAt} />
            </li>
          ))}
        </ul>
      ) : null}

      {plans.length > 1 ? (
        <Link href="/plans" className="mt-auto self-start text-xs font-bold underline-offset-4 hover:underline">
          {plans.length} plans
        </Link>
      ) : null}
    </article>
  );
}
