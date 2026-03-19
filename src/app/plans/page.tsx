"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/lib/auth";

type StudyDashboard = {
  plan: {
    id: string;
    title: string;
    description: string | null;
    start_date: string;
    days_per_week: number;
    updated_at: string;
  } | null;
  today_key: string;
  streak_days: number;
  week_progress: {
    completed_days: number;
    target_days: number;
    days: Array<{ key: string; checked: boolean }>;
  };
};

function weekdayLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short" });
}

export default function PlansPage() {
  const { user, loading } = useAuth();
  const studyApi = (api as any).studyPlans;
  const dashboard = useQuery(studyApi.getDashboard, user ? {} : "skip") as StudyDashboard | undefined;
  const upsertPlan = useMutation(studyApi.upsertActivePlan);
  const checkInToday = useMutation(studyApi.checkInToday);
  const uncheckDate = useMutation(studyApi.uncheckDate);

  const [title, setTitle] = useState("My weekly study plan");
  const [description, setDescription] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [saving, setSaving] = useState(false);

  const completionPct = useMemo(() => {
    if (!dashboard?.week_progress.target_days) return 0;
    return Math.min(100, Math.round((dashboard.week_progress.completed_days / dashboard.week_progress.target_days) * 100));
  }, [dashboard]);

  if (loading) return <section className="py-10 text-sm text-foreground/70">Loading plans...</section>;
  if (!user) {
    return (
      <section className="mx-auto max-w-3xl py-10 space-y-3">
        <h1 className="text-2xl font-semibold">Weekly study plans</h1>
        <p className="text-sm text-foreground/70">Sign in to create a plan and track your study streak.</p>
        <Link href="/sign-in" className="inline-flex rounded-md border surface-button px-3 py-2 text-sm">
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl py-10 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Weekly study plans</h1>
        <p className="text-sm text-foreground/70">Set a weekly target and keep a daily streak as you study.</p>
      </header>

      <div className="rounded-lg border surface-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xs text-foreground/70">Current streak</div>
            <div className="text-2xl font-semibold">{dashboard?.streak_days ?? 0} day{(dashboard?.streak_days ?? 0) === 1 ? "" : "s"}</div>
          </div>
          <button
            onClick={() => {
              void checkInToday({});
            }}
            className="rounded-md bg-foreground text-background px-3 py-2 text-sm"
          >
            Mark today complete
          </button>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-foreground/70">
            This week: {dashboard?.week_progress.completed_days ?? 0}/{dashboard?.week_progress.target_days ?? 0}
          </div>
          <div className="h-2 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${completionPct}%` }} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {(dashboard?.week_progress.days ?? []).map((day) => (
              <button
                key={day.key}
                onClick={() => {
                  if (day.checked) {
                    void uncheckDate({ dateKey: day.key });
                  } else {
                    void checkInToday({ dateKey: day.key });
                  }
                }}
                className={`rounded-md border px-2 py-1 text-xs ${
                  day.checked ? "border-emerald-500/60 bg-emerald-500/15" : "surface-button"
                }`}
                title={day.key}
              >
                {weekdayLabel(day.key)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border surface-card p-4 space-y-3">
        <h2 className="text-lg font-semibold">{dashboard?.plan ? "Update active plan" : "Create your first plan"}</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Plan title"
          className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional description"
          className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-foreground/70">Target days / week</span>
          <input
            type="number"
            min={1}
            max={7}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
            className="w-16 rounded-md border surface-card-soft bg-transparent px-2 py-1"
          />
        </label>
        <div className="flex justify-end">
          <button
            onClick={async () => {
              setSaving(true);
              try {
                await upsertPlan({
                  title,
                  description: description || undefined,
                  daysPerWeek,
                });
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving || !title.trim()}
            className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save plan"}
          </button>
        </div>
      </div>
    </section>
  );
}
