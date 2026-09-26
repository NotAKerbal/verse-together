"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import ProgressBar from "./ProgressBar";
import PlansSignedOut from "./PlansSignedOut";
import { describePlanPace, describeReadingDays, normalizeReadingDays } from "./planSchedule";
import { useMyPlans, usePlanActions, type PlanSummary } from "./useReadingProgress";

const PRIMARY_LINK_CLASS =
  "inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-5 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)]";

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

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function PlanCard({ plan, onDelete, deleting }: { plan: PlanSummary; onDelete: () => void; deleting: boolean }) {
  const href = `/plans/${plan.id}`;
  const percent = plan.stepCount ? Math.round((plan.readCount / plan.stepCount) * 100) : 0;
  return (
    <li className="panel-card flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pill-tag px-2 py-0.5">{describeReadingDays(normalizeReadingDays(plan.readingDays))}</span>
            {percent === 100 ? (
              <span className="pill-tag px-2 py-0.5" style={{ background: "var(--accent-mint)" }}>
                Done
              </span>
            ) : null}
          </div>
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
      <div className="mt-auto flex flex-wrap gap-2">
        <Link href={href} className="surface-button inline-flex min-h-9 items-center rounded-full border-2 px-4 text-sm" data-tap>
          Open plan
        </Link>
        <Link href={`${href}/edit`} className="surface-button inline-flex min-h-9 items-center rounded-full border-2 px-4 text-sm" data-tap>
          Edit
        </Link>
      </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <h2 id="my-plans-heading" className="font-display text-[1.3rem] font-bold tracking-[-0.025em]">
          My plans
        </h2>
        <Link href="/plans/new" className={PRIMARY_LINK_CLASS} data-tap>
          <PlusIcon />
          New plan
        </Link>
      </div>
      {error ? (
        <p role="alert" className="px-1 text-sm font-semibold" style={{ color: "var(--accent-coral)" }}>
          {error}
        </p>
      ) : null}
      {!plans ? (
        <p className="panel-card-soft px-5 py-6 text-sm text-[color:var(--foreground-muted)]">Loading your plans…</p>
      ) : plans.length === 0 ? (
        <div className="panel-card-soft flex flex-col items-start gap-3 px-5 py-6">
          <p className="text-sm text-[color:var(--foreground-muted)]">
            No plans yet. Pick a volume, a few books, or a chapter range, set a pace, and it will show up here.
          </p>
          <Link href="/plans/new" className="surface-button inline-flex min-h-9 items-center rounded-full border-2 px-4 text-sm" data-tap>
            Build your first plan
          </Link>
        </div>
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
      {loading ? null : user ? <PlanList /> : <PlansSignedOut />}
    </section>
  );
}
