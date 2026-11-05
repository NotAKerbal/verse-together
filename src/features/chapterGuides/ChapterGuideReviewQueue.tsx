"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ContinuationBlock, GuideReviewRole, ReviewContinuationResult } from "../../../convex/chapterGuides";

type ReviewDetail = NonNullable<FunctionReturnType<typeof api.chapterGuides.getReviewDetail>>;
type ReviewQueueItem = NonNullable<FunctionReturnType<typeof api.chapterGuides.getReviewQueue>>[number];

function dollars(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

function shortDate(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function countOf(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

const REVIEW_REASONS: Record<string, string> = {
  repair_unresolved: "The AI reviewer still had findings after the last allowed correction round.",
  repair_noop: "The writer’s last repair left a flagged section unchanged, so it wasn’t applied.",
  repair_out_of_scope: "The writer’s last repair changed a section nobody flagged, so it wasn’t applied.",
  repair_invalid: "The writer’s last repair didn’t pass validation, so it wasn’t applied.",
  repair_unparseable: "The writer’s last repair couldn’t be read, so it wasn’t applied.",
  review_rejected: "The AI reviewer returned more findings than a repair can take.",
  recheck_rejected: "The AI reviewer returned more findings than a repair can take.",
  review_invalid_target: "The AI reviewer’s findings name sections that aren’t in the guide.",
  recheck_invalid_target: "The AI reviewer’s findings name sections that aren’t in the guide.",
  recheck_unparseable: "The AI reviewer’s answer about the last repair couldn’t be read. These are the findings that repair addressed.",
};

const RESUME_STEPS: Record<string, string> = {
  repair: "It starts by sending this draft and these findings to the writer.",
  recheck: "It starts with a fresh review of this draft, because these findings can’t go straight to the writer.",
  review: "It starts with a fresh review of this draft, because these findings can’t go straight to the writer.",
};

const BLOCK_MESSAGES: Record<GuideReviewRole, Record<ContinuationBlock, string>> = {
  owner: {
    paused: "Generation is paused. Resume it above to continue this guide.",
    not_configured: "A provider key or the service secret is missing, so this can’t continue yet.",
    busy: "Other guides are running. Try again when one finishes.",
    budget_exhausted: "This month’s budget can’t hold this reservation.",
  },
  reviewer: {
    paused: "Generation is paused. An admin has to resume it before this guide can continue.",
    not_configured: "Generation isn’t available right now, so this can’t continue yet.",
    busy: "Other guides are running. Try again when one finishes.",
    budget_exhausted: "This month’s budget can’t hold this reservation.",
  },
};

const UNCONFIRMED_MESSAGES: Record<GuideReviewRole, string> = {
  owner: "We couldn’t confirm whether generation continued. Check the queue and recent jobs before trying again.",
  reviewer: "We couldn’t confirm whether generation continued. Check the queue before trying again.",
};

function reviewReason(code: string): string {
  return REVIEW_REASONS[code] ?? `An earlier continuation stopped before it finished (${code}). This is the last draft it saved.`;
}

function findingTargetLabel(target: string): string {
  if (target === "overview") return "Overview";
  if (target === "historical_context") return "Historical context";
  if (target === "limitations") return "Limitations";
  const insight = /^insight:(\d+)$/.exec(target);
  if (insight) return `Insight ${Number(insight[1]) + 1}`;
  const passage = /^passage:(\d+)-(\d+)$/.exec(target);
  if (passage) return passage[1] === passage[2] ? `Verse ${passage[1]}` : `Verses ${passage[1]}–${passage[2]}`;
  return target;
}

export function continuationMessage(result: ReviewContinuationResult, audience: GuideReviewRole): string {
  if (result.status === "started") return `Continuing. Up to ${dollars(result.reservedMicros)} is reserved, and readers now see its progress.`;
  if (result.status === "running") return "This guide is already running.";
  if (result.status === "already_published") return "A guide for this chapter is already saved, so this draft left the queue.";
  if (result.status === "stale") return "This guide changed since it was opened, so nothing was started. Check the latest draft and findings.";
  return BLOCK_MESSAGES[audience][result.reason];
}

function Paragraphs({ items }: { items: readonly string[] }) {
  return <>{items.map((item, index) => <p key={index}>{item}</p>)}</>;
}

function DraftView({ draft, sources }: Pick<ReviewDetail, "draft" | "sources">) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">{draft.title}</h4>
      <Paragraphs items={draft.overview} />
      <h5 className="font-semibold">Historical context</h5>
      <Paragraphs items={draft.historical_context.paragraphs} />
      {draft.significant_insights.map((insight, index) => (
        <div key={index} className="space-y-1">
          <h5 className="font-semibold">Insight {index + 1}: {insight.title} (verses {insight.verse_start}–{insight.verse_end})</h5>
          <Paragraphs items={insight.paragraphs} />
        </div>
      ))}
      {draft.passages.map((passage) => (
        <div key={passage.verse_start} className="space-y-1">
          <h5 className="font-semibold">Verses {passage.verse_start}–{passage.verse_end}: {passage.heading}</h5>
          <Paragraphs items={passage.original_meaning} />
          {passage.latter_day_saint_application.length > 0 ? <Paragraphs items={passage.latter_day_saint_application} /> : null}
          {passage.cross_references.length > 0 ? (
            <ul className="list-disc pl-5">
              {passage.cross_references.map((reference, index) => <li key={index}>{reference.reference}: {reference.note}</li>)}
            </ul>
          ) : null}
          <ul className="list-disc pl-5">
            {passage.questions.map((question, index) => <li key={index}>{question}</li>)}
          </ul>
        </div>
      ))}
      {draft.limitations.length > 0 ? (
        <>
          <h5 className="font-semibold">Limitations</h5>
          <Paragraphs items={draft.limitations} />
        </>
      ) : null}
      {sources.length > 0 ? (
        <>
          <h5 className="font-semibold">Research sources</h5>
          <ul className="list-disc pl-5">
            {sources.map((source) => (
              <li key={source.id}>
                {source.id}:{" "}
                {/^https?:\/\//i.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer noopener" className="underline">{source.title}</a> : source.title}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function FindingsView({ findings }: Pick<ReviewDetail, "findings">) {
  return (
    <div className="space-y-2">
      <p>{findings.summary}</p>
      <ol className="list-decimal space-y-2 pl-5">
        {findings.required_corrections.map((correction, index) => (
          <li key={index}>
            <p><span className="font-semibold">{findingTargetLabel(correction.target)}</span> ({correction.category}): {correction.issue}</p>
            <p className="text-foreground/70">Evidence: {correction.evidence}</p>
          </li>
        ))}
      </ol>
      {findings.unverifiable.length > 0 ? (
        <div>
          <p className="font-semibold">The AI reviewer couldn’t verify</p>
          <ul className="list-disc pl-5">
            {findings.unverifiable.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {findings.optional_improvements.length > 0 ? (
        <div>
          <p className="font-semibold">Optional improvements</p>
          <ul className="list-disc pl-5">
            {findings.optional_improvements.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ChapterGuideReviewDetail({ detail, audience, continuing, onContinue, onBack }: {
  detail: ReviewDetail;
  audience: GuideReviewRole;
  continuing: boolean;
  onContinue: () => void;
  onBack: () => void;
}) {
  const reserve = dollars(detail.continuationMicros);
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="surface-button rounded-full border px-4 py-1.5">Back to the queue</button>
      <h3 className="text-base font-semibold">{detail.reference}</h3>
      <p>{reviewReason(detail.reasonCode)}</p>
      <p className="text-foreground/70">{detail.spentMicros === null ? "" : `Spent so far: ${dollars(detail.spentMicros)} · `}Correction rounds so far: {detail.correctionRound} · Queued {shortDate(detail.queuedAt)}. Readers see only that this guide needs additional human review. They can’t see this draft or these findings, and nothing here is published.</p>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Outstanding findings ({detail.findingCount})</h3>
        <FindingsView findings={detail.findings} />
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Your decision</h3>
        <p>Continuing allows {countOf(detail.continuationRounds, "more correction round")} from this draft, up to {countOf(detail.continuationCalls, "provider call")}. {RESUME_STEPS[detail.resumeStage] ?? ""} Up to {reserve} is reserved now. Only what’s used is spent, and the rest is released when it stops. It’s published only if the AI reviewer clears it and it passes validation. Otherwise it comes back here.</p>
        <p className="text-foreground/70">To leave it queued, do nothing. That costs nothing, and readers keep seeing the human review message.</p>
        {detail.blockedBy ? <p role="status" className="text-foreground/70">{BLOCK_MESSAGES[audience][detail.blockedBy]}</p> : null}
        <button type="button" disabled={continuing || detail.blockedBy !== null} onClick={onContinue} className="surface-button rounded-full border px-4 py-1.5 disabled:opacity-60">
          {continuing ? "Continuing…" : `Continue generation (reserves up to ${reserve})`}
        </button>
      </section>

      {detail.history.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-base font-semibold">Earlier continuations</h3>
          <ul className="list-disc pl-5">
            {detail.history.map((entry) => (
              <li key={entry.continuation}>{shortDate(entry.createdAt)}: continued after round {entry.fromCorrectionRound}, allowing rounds through {entry.maxCorrectionRounds}, with up to {dollars(entry.reservedMicros)} reserved.</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Current draft</h3>
        <DraftView draft={detail.draft} sources={detail.sources} />
      </section>
    </div>
  );
}

export function ChapterGuideReviewList({ queue, onOpen }: { queue: readonly ReviewQueueItem[]; onOpen: (id: ReviewQueueItem["id"]) => void }) {
  if (queue.length === 0) return <p className="text-foreground/70">Nothing is waiting for review.</p>;
  return (
    <ul className="space-y-2">
      {queue.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-2">
          <span>{item.reference}: {countOf(item.findingCount, "open finding")}, {countOf(item.correctionRound, "correction round")}, {item.spentMicros === null ? "" : `${dollars(item.spentMicros)} spent, `}queued {shortDate(item.queuedAt)}</span>
          <button type="button" onClick={() => onOpen(item.id)} className="surface-button rounded-full border px-4 py-1.5">Review {item.reference}</button>
        </li>
      ))}
    </ul>
  );
}

export default function ChapterGuideReviewQueue({ audience }: { audience: GuideReviewRole }) {
  const queue = useQuery(api.chapterGuides.getReviewQueue, {});
  const [selectedId, setSelectedId] = useState<Id<"chapterGuideJobs"> | null>(null);
  const detail = useQuery(api.chapterGuides.getReviewDetail, selectedId ? { jobId: selectedId } : "skip");
  const continueReview = useMutation(api.chapterGuides.continueReview);
  const [continuing, setContinuing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!queue) {
    if (audience === "owner") return null;
    return <p className="text-sm text-foreground/70">{queue === undefined ? "Loading…" : "Reviews are only available to chapter guide reviewers and admins."}</p>;
  }

  const select = (id: ReviewQueueItem["id"] | null) => {
    setMessage(null);
    setSelectedId(id);
  };

  const submit = async () => {
    if (!detail || continuing) return;
    setContinuing(true);
    setMessage(null);
    try {
      setMessage(continuationMessage(await continueReview({ jobId: detail.id, queuedAt: detail.queuedAt }), audience));
    } catch {
      setMessage(UNCONFIRMED_MESSAGES[audience]);
    } finally {
      setContinuing(false);
    }
  };

  return (
    <section className="panel-card rounded-[1.35rem] p-4 space-y-3">
      <h2 className="text-base font-semibold">Needs review ({queue.length})</h2>
      {message ? <p role="status">{message}</p> : null}
      {selectedId !== null && detail === null ? <p className="text-foreground/70">That guide is no longer waiting for review.</p> : null}
      {selectedId !== null && detail === undefined ? <p className="text-foreground/70">Loading…</p> : null}
      {selectedId !== null && detail ? (
        <ChapterGuideReviewDetail detail={detail} audience={audience} continuing={continuing} onContinue={() => void submit()} onBack={() => select(null)} />
      ) : (
        <ChapterGuideReviewList queue={queue} onOpen={select} />
      )}
    </section>
  );
}
