"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";

function dollars(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

const PAUSE_REASONS: Record<string, string> = {
  not_activated: "Not switched on yet.",
  owner: "Paused by an owner.",
  repeated_failures: "Paused automatically after repeated failed guides.",
  reservation_exceeded: "Paused automatically because a call cost more than its reserved maximum. Check the prices in the docs before resuming.",
};

export default function ChapterGuideOwnerPanel({ siteSecretConfigured }: { siteSecretConfigured: boolean }) {
  const overview = useQuery(api.chapterGuides.getOwnerOverview, {});
  const setPaused = useMutation(api.chapterGuides.setPaused);
  const setMonthlyCap = useMutation(api.chapterGuides.setMonthlyCap);
  const [capInput, setCapInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (overview === undefined) return <p className="text-sm text-foreground/70">Loading…</p>;
  if (overview === null) return <p className="text-sm text-foreground/70">This page is only available to admins.</p>;

  const togglePaused = async () => {
    setError(null);
    try {
      await setPaused({ paused: !overview.paused });
    } catch {
      setError("That change wasn’t saved.");
    }
  };

  const saveCap = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await setMonthlyCap({ capDollars: Number(capInput) });
      setCapInput("");
    } catch {
      setError("Enter a cap between $0 and $100.");
    }
  };

  return (
    <div className="space-y-5 text-sm">
      <section className="panel-card rounded-[1.35rem] p-4 space-y-2">
        <h2 className="text-base font-semibold">Spending for {overview.periodKey} (UTC)</h2>
        <p>Spent: {dollars(overview.spentMicros)} · Reserved for running guides: {dollars(overview.reservedMicros)} · Cap: {dollars(overview.capMicros)}</p>
        <p className="text-foreground/70">This is the app’s own estimate from reported usage and the prices verified on {overview.pricesVerifiedOn}, not a limit the providers enforce. Research calls stay counted at their full reserved maximum. New guides stop {dollars(overview.marginMicros)} below the cap, and the cap can’t go above {dollars(overview.hardCapMicros)}. Compare it with each provider’s own billing page, and set a limit there too.</p>
        <form onSubmit={(event) => void saveCap(event)} className="flex flex-wrap items-center gap-2">
          <label htmlFor="chapter-guide-cap">Monthly cap in dollars</label>
          <input id="chapter-guide-cap" type="number" min="0" max="100" step="1" value={capInput} onChange={(event) => setCapInput(event.target.value)} className="w-24 rounded border px-2 py-1" required />
          <button type="submit" className="surface-button rounded-full border px-4 py-1.5">Save cap</button>
        </form>
      </section>

      <section className="panel-card rounded-[1.35rem] p-4 space-y-2">
        <h2 className="text-base font-semibold">Generation</h2>
        <p>{overview.paused ? `Paused. ${overview.pauseReason ? PAUSE_REASONS[overview.pauseReason] ?? "" : ""}` : "On. Signed-in readers can request new guides."}</p>
        <p className="text-foreground/70">Provider keys: {overview.keysConfigured ? "set" : "missing"} · Service secret in Convex: {overview.serviceSecretConfigured ? "set" : "missing"} · Service secret on the site: {siteSecretConfigured ? "set" : "missing"} · Failed guides in a row: {overview.consecutiveFailures}</p>
        <button type="button" onClick={() => void togglePaused()} className="surface-button rounded-full border px-4 py-1.5">
          {overview.paused ? "Resume generation" : "Pause generation"}
        </button>
        {error ? <p role="alert" className="text-foreground/70">{error}</p> : null}
      </section>

      <section className="panel-card rounded-[1.35rem] p-4 space-y-2">
        <h2 className="text-base font-semibold">Recent guides</h2>
        {overview.recentJobs.length === 0 ? <p className="text-foreground/70">None yet.</p> : (
          <ul className="space-y-1">
            {overview.recentJobs.map((job) => (
              <li key={job.id}>
                {job.reference}: {job.status}{job.status === "running" ? ` (${job.stage})` : ""}, {dollars(job.spentMicros)}{job.failureCode ? ` · ${job.failureCode}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
