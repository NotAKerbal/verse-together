import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  budgetPeriodKey,
  type ChapterGuideModel,
  type ChapterGuideStage,
  DAY_MS,
  effectiveMonthlyCapMicros,
  FAILURE_COOLDOWN_MS,
  FAILURES_BEFORE_AUTO_PAUSE,
  HARD_MONTHLY_CAP_MICROS,
  isValidTokenUsage,
  jobReservationMicros,
  MAX_ACTIVE_JOBS,
  MAX_CHAPTER_BYTES,
  MAX_CHAPTER_VERSES,
  MAX_JOBS_PER_DAY,
  MAX_USER_JOBS_PER_DAY,
  MAX_USER_JOBS_PER_MONTH,
  MICROS_PER_DOLLAR,
  MONTH_WINDOW_MS,
  nextPeriodExposure,
  PRICES_VERIFIED_ON,
  RESERVATION_MARGIN_MICROS,
  reservationFits,
  RETRY_DELAY_MS,
  secretsMatch,
  STAGE_LEASE_GRACE_MS,
  STAGE_MAX_ATTEMPTS,
  STAGE_MODELS,
  STAGE_TIMEOUT_MS,
  stageMaxCostMicros,
  stageMaxInputBytes,
  stageMaxOutputTokens,
  usageCostMicros,
  utf8Bytes,
} from "./chapterGuideBudget";
import {
  chapterGuideContentValidator,
  chapterGuideProvenanceValidator,
  chapterGuideSourceValidator,
  chapterGuideStageValidator,
  chapterGuideUsageValidator,
  chapterVerseValidator,
} from "./chapterGuideValidators";
import { getViewerClerkId, requireClerkId } from "./utils";

const WORKER_START_GRACE_MS = 5 * 60 * 1000;
const CODES_WITHOUT_COOLDOWN = new Set(["paused", "budget_stopped", "not_configured"]);

export type GuideAvailability = "available" | "paused" | "not_configured" | "budget_exhausted" | "cooldown" | "busy";

export type GenerationRequestResult =
  | { status: "ready" }
  | { status: "generating" }
  | { status: "started" }
  | { status: "unavailable"; reason: GuideAvailability | "user_limit" | "daily_limit" };

function providerKeysConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim());
}

function serviceSecretConfigured(): boolean {
  return Boolean(process.env.CHAPTER_GUIDE_SERVICE_SECRET?.trim());
}

async function readSettings(ctx: QueryCtx) {
  return await ctx.db
    .query("chapterGuideSettings")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .unique();
}

async function readPeriod(ctx: QueryCtx, periodKey: string) {
  return await ctx.db
    .query("chapterGuideBudgetPeriods")
    .withIndex("by_period", (q) => q.eq("periodKey", periodKey))
    .unique();
}

async function isPaused(ctx: QueryCtx): Promise<boolean> {
  const settings = await readSettings(ctx);
  return !settings || settings.paused;
}

async function capMicros(ctx: QueryCtx): Promise<number> {
  return effectiveMonthlyCapMicros((await readSettings(ctx))?.monthlyCapMicros);
}

async function periodCanHold(ctx: QueryCtx, periodKey: string, requestedMicros: number): Promise<boolean> {
  const period = await readPeriod(ctx, periodKey);
  return reservationFits({
    capMicros: await capMicros(ctx),
    spentMicros: period?.spentMicros ?? 0,
    reservedMicros: period?.reservedMicros ?? 0,
    requestedMicros,
  });
}

async function latestChapterJob(ctx: QueryCtx, volume: string, book: string, chapter: number) {
  return await ctx.db
    .query("chapterGuideJobs")
    .withIndex("by_chapter_created", (q) => q.eq("volume", volume).eq("book", book).eq("chapter", chapter))
    .order("desc")
    .first();
}

async function readGuide(ctx: QueryCtx, volume: string, book: string, chapter: number, scriptureHash: string) {
  return await ctx.db
    .query("chapterGuides")
    .withIndex("by_chapter_hash", (q) =>
      q.eq("volume", volume).eq("book", book).eq("chapter", chapter).eq("scriptureHash", scriptureHash)
    )
    .first();
}

function isInCooldown(job: Doc<"chapterGuideJobs"> | null, now: number): boolean {
  if (!job || job.status !== "failed" || job.finishedAt === undefined) return false;
  if (job.failureCode && CODES_WITHOUT_COOLDOWN.has(job.failureCode)) return false;
  return now - job.finishedAt < FAILURE_COOLDOWN_MS;
}

async function runningJobCount(ctx: QueryCtx, limit: number): Promise<number> {
  const running = await ctx.db
    .query("chapterGuideJobs")
    .withIndex("by_status_lease", (q) => q.eq("status", "running"))
    .take(limit);
  return running.length;
}

async function requireOwner(ctx: MutationCtx): Promise<void> {
  const clerkId = await requireClerkId(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
  if (user?.isAdmin !== true) throw new Error("Forbidden");
}

async function upsertSettings(
  ctx: MutationCtx,
  patch: Partial<Pick<Doc<"chapterGuideSettings">, "paused" | "pauseReason" | "monthlyCapMicros" | "consecutiveFailures">>
): Promise<void> {
  const settings = await readSettings(ctx);
  if (settings) {
    await ctx.db.patch(settings._id, { ...patch, updatedAt: Date.now() });
    return;
  }
  await ctx.db.insert("chapterGuideSettings", {
    key: "global",
    paused: true,
    pauseReason: "not_activated",
    consecutiveFailures: 0,
    ...patch,
    updatedAt: Date.now(),
  });
}

export const getChapterState = query({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    scriptureHash: v.string(),
    verseCount: v.number(),
    chapterBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const guide = await readGuide(ctx, args.volume, args.book, args.chapter, args.scriptureHash);
    const job = await latestChapterJob(ctx, args.volume, args.book, args.chapter);
    const generating = job?.status === "running" ? { stage: job.stage, startedAt: job.createdAt } : null;
    const published = guide
      ? {
          reference: guide.reference,
          content: guide.content,
          sources: guide.sources,
          provenance: guide.provenance,
          generatedAt: guide.generatedAt,
        }
      : null;
    if (guide || generating) return { guide: published, generating, availability: null };

    const now = Date.now();
    let availability: GuideAvailability = "available";
    if (!providerKeysConfigured() || !serviceSecretConfigured()) availability = "not_configured";
    else if (await isPaused(ctx)) availability = "paused";
    else if (isInCooldown(job, now)) availability = "cooldown";
    else if ((await runningJobCount(ctx, MAX_ACTIVE_JOBS)) >= MAX_ACTIVE_JOBS) availability = "busy";
    else if (!(await periodCanHold(ctx, budgetPeriodKey(now), jobReservationMicros(args.verseCount, args.chapterBytes)))) {
      availability = "budget_exhausted";
    }
    return { guide: null, generating: null, availability };
  },
});

export const requestGeneration = mutation({
  args: {
    serviceSecret: v.string(),
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    reference: v.string(),
    scriptureHash: v.string(),
    verses: v.array(chapterVerseValidator),
  },
  handler: async (ctx, args): Promise<GenerationRequestResult> => {
    const expectedSecret = process.env.CHAPTER_GUIDE_SERVICE_SECRET?.trim();
    if (!expectedSecret) return { status: "unavailable", reason: "not_configured" };
    if (!secretsMatch(expectedSecret, args.serviceSecret)) throw new Error("Forbidden");
    const clerkId = await requireClerkId(ctx);

    const chapterBytes = utf8Bytes(args.verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n"));
    if (args.verses.length === 0 || args.verses.length > MAX_CHAPTER_VERSES || chapterBytes > MAX_CHAPTER_BYTES) {
      throw new Error("Invalid chapter");
    }

    if (await readGuide(ctx, args.volume, args.book, args.chapter, args.scriptureHash)) return { status: "ready" };
    const latest = await latestChapterJob(ctx, args.volume, args.book, args.chapter);
    if (latest?.status === "running") return { status: "generating" };

    const now = Date.now();
    if (!providerKeysConfigured()) return { status: "unavailable", reason: "not_configured" };
    if (await isPaused(ctx)) return { status: "unavailable", reason: "paused" };
    if (isInCooldown(latest, now)) return { status: "unavailable", reason: "cooldown" };
    if ((await runningJobCount(ctx, MAX_ACTIVE_JOBS)) >= MAX_ACTIVE_JOBS) return { status: "unavailable", reason: "busy" };

    const userRequests = await ctx.db
      .query("chapterGuideRequests")
      .withIndex("by_clerk_created", (q) => q.eq("clerkId", clerkId).gt("createdAt", now - MONTH_WINDOW_MS))
      .take(MAX_USER_JOBS_PER_MONTH);
    if (userRequests.length >= MAX_USER_JOBS_PER_MONTH) return { status: "unavailable", reason: "user_limit" };
    if (userRequests.filter((row) => row.createdAt > now - DAY_MS).length >= MAX_USER_JOBS_PER_DAY) {
      return { status: "unavailable", reason: "user_limit" };
    }
    const recentJobs = await ctx.db
      .query("chapterGuideJobs")
      .withIndex("by_created", (q) => q.gt("createdAt", now - DAY_MS))
      .take(MAX_JOBS_PER_DAY);
    if (recentJobs.length >= MAX_JOBS_PER_DAY) return { status: "unavailable", reason: "daily_limit" };

    const periodKey = budgetPeriodKey(now);
    const requestedMicros = jobReservationMicros(args.verses.length, chapterBytes);
    if (!(await periodCanHold(ctx, periodKey, requestedMicros))) return { status: "unavailable", reason: "budget_exhausted" };

    await adjustPeriod(ctx, periodKey, { reservedMicros: requestedMicros });
    const jobId = await ctx.db.insert("chapterGuideJobs", {
      volume: args.volume,
      book: args.book,
      chapter: args.chapter,
      reference: args.reference,
      scriptureHash: args.scriptureHash,
      verses: args.verses,
      chapterBytes,
      status: "running",
      stage: "research",
      stageAttempts: { research: 0, write: 0, review: 0, repair: 0, recheck: 0 },
      periodKey,
      reservedInitialMicros: requestedMicros,
      reservedRemainingMicros: requestedMicros,
      spentMicros: 0,
      leaseExpiresAt: now + WORKER_START_GRACE_MS,
      createdAt: now,
    });
    await ctx.db.insert("chapterGuideRequests", { clerkId, jobId, createdAt: now });
    await ctx.scheduler.runAfter(0, internal.chapterGuideWorker.runStage, { jobId });
    return { status: "started" };
  },
});

async function adjustPeriod(
  ctx: MutationCtx,
  periodKey: string,
  change: { spentMicros?: number; reservedMicros?: number }
): Promise<void> {
  const period = await readPeriod(ctx, periodKey);
  const spentMicros = (period?.spentMicros ?? 0) + (change.spentMicros ?? 0);
  const reservedMicros = Math.max(0, (period?.reservedMicros ?? 0) + (change.reservedMicros ?? 0));
  if (period) await ctx.db.patch(period._id, { spentMicros, reservedMicros, updatedAt: Date.now() });
  else await ctx.db.insert("chapterGuideBudgetPeriods", { periodKey, spentMicros, reservedMicros, updatedAt: Date.now() });
}

async function moveReservationToPeriod(
  ctx: MutationCtx,
  job: Doc<"chapterGuideJobs">,
  periodKey: string
): Promise<Doc<"chapterGuideJobs"> | null> {
  if (!(await periodCanHold(ctx, periodKey, job.reservedRemainingMicros))) return null;
  await adjustPeriod(ctx, job.periodKey, { reservedMicros: -job.reservedRemainingMicros });
  await adjustPeriod(ctx, periodKey, { reservedMicros: job.reservedRemainingMicros });
  await ctx.db.patch(job._id, { periodKey });
  return { ...job, periodKey };
}

async function chargeJob(
  ctx: MutationCtx,
  job: Doc<"chapterGuideJobs">,
  actualMicros: number
): Promise<Doc<"chapterGuideJobs">> {
  const released = Math.min(actualMicros, job.reservedRemainingMicros);
  await adjustPeriod(ctx, job.periodKey, { spentMicros: actualMicros, reservedMicros: -released });
  const patch = {
    spentMicros: job.spentMicros + actualMicros,
    reservedRemainingMicros: job.reservedRemainingMicros - released,
  };
  await ctx.db.patch(job._id, patch);
  return { ...job, ...patch };
}

async function finishJob(
  ctx: MutationCtx,
  job: Doc<"chapterGuideJobs">,
  status: "succeeded" | "failed",
  failureCode?: string
): Promise<void> {
  const now = Date.now();
  await adjustPeriod(ctx, job.periodKey, { reservedMicros: -job.reservedRemainingMicros });
  await ctx.db.patch(job._id, {
    status,
    failureCode,
    reservedRemainingMicros: 0,
    activeAttemptId: undefined,
    verses: [],
    research: undefined,
    draft: undefined,
    review: undefined,
    writerFeedback: undefined,
    finishedAt: now,
  });
  const settings = await readSettings(ctx);
  if (!settings) return;
  if (status === "succeeded") {
    await ctx.db.patch(settings._id, { consecutiveFailures: 0, updatedAt: now });
    return;
  }
  if (failureCode && CODES_WITHOUT_COOLDOWN.has(failureCode)) return;
  const failures = settings.consecutiveFailures + 1;
  if (failures >= FAILURES_BEFORE_AUTO_PAUSE && !settings.paused) {
    await ctx.db.patch(settings._id, {
      consecutiveFailures: failures,
      paused: true,
      pauseReason: "repeated_failures",
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch(settings._id, { consecutiveFailures: failures, updatedAt: now });
}

export type StagePlan =
  | { kind: "stop" }
  | {
      kind: "run";
      attemptId: Id<"chapterGuideAttempts">;
      stage: ChapterGuideStage;
      attempt: number;
      model: ChapterGuideModel;
      maxInputBytes: number;
      maxOutputTokens: number;
      timeoutMs: number;
      leaseExpiresAt: number;
      reference: string;
      verses: Array<{ verse: number; text: string }>;
      research: unknown;
      draft: unknown;
      review: unknown;
      writerFeedback: string[];
    };

export const beginStage = internalMutation({
  args: { jobId: v.id("chapterGuideJobs") },
  handler: async (ctx, { jobId }): Promise<StagePlan> => {
    const stored = await ctx.db.get(jobId);
    if (!stored || stored.status !== "running" || stored.activeAttemptId) return { kind: "stop" };
    const now = Date.now();
    if (await isPaused(ctx)) {
      await finishJob(ctx, stored, "failed", "paused");
      return { kind: "stop" };
    }
    const currentPeriodKey = budgetPeriodKey(now);
    const job = stored.periodKey === currentPeriodKey ? stored : await moveReservationToPeriod(ctx, stored, currentPeriodKey);
    if (!job) {
      await finishJob(ctx, stored, "failed", "budget_stopped");
      return { kind: "stop" };
    }
    const period = await readPeriod(ctx, job.periodKey);
    const cap = await capMicros(ctx);
    if (!period || period.spentMicros + period.reservedMicros > cap) {
      await finishJob(ctx, job, "failed", "budget_stopped");
      return { kind: "stop" };
    }
    const stage = job.stage;
    const attempt = job.stageAttempts[stage] + 1;
    if (attempt > STAGE_MAX_ATTEMPTS[stage]) {
      await finishJob(ctx, job, "failed", `${stage}_attempts_exhausted`);
      return { kind: "stop" };
    }
    const maxCostMicros = stageMaxCostMicros(stage, job.verses.length, job.chapterBytes);
    if (maxCostMicros > job.reservedRemainingMicros) {
      await finishJob(ctx, job, "failed", "reservation_short");
      return { kind: "stop" };
    }
    const leaseExpiresAt = now + STAGE_TIMEOUT_MS[stage] + STAGE_LEASE_GRACE_MS;
    const carryoverPeriodKey = nextPeriodExposure(now, leaseExpiresAt);
    if (carryoverPeriodKey) {
      if (!(await periodCanHold(ctx, carryoverPeriodKey, maxCostMicros))) {
        await finishJob(ctx, job, "failed", "budget_stopped");
        return { kind: "stop" };
      }
      await adjustPeriod(ctx, carryoverPeriodKey, { reservedMicros: maxCostMicros });
    }
    const model = STAGE_MODELS[stage];
    const attemptId = await ctx.db.insert("chapterGuideAttempts", {
      jobId,
      stage,
      attempt,
      model,
      maxCostMicros,
      periodKey: job.periodKey,
      ...(carryoverPeriodKey ? { carryoverPeriodKey, carryoverMicros: maxCostMicros } : {}),
      status: "started",
      startedAt: now,
    });
    await ctx.db.patch(jobId, {
      activeAttemptId: attemptId,
      stageAttempts: { ...job.stageAttempts, [stage]: attempt },
      leaseExpiresAt,
    });
    return {
      kind: "run",
      attemptId,
      stage,
      attempt,
      model,
      maxInputBytes: stageMaxInputBytes(stage, job.chapterBytes),
      maxOutputTokens: stageMaxOutputTokens(stage, job.verses.length),
      timeoutMs: STAGE_TIMEOUT_MS[stage],
      leaseExpiresAt,
      reference: job.reference,
      verses: job.verses,
      research: job.research,
      draft: job.draft,
      review: job.review,
      writerFeedback: job.writerFeedback ?? [],
    };
  },
});

const chargeValidator = v.union(
  v.object({ source: v.literal("reported"), usage: chapterGuideUsageValidator }),
  v.object({ source: v.literal("no_charge") }),
  v.object({ source: v.literal("held_at_maximum"), usage: v.optional(chapterGuideUsageValidator) })
);

const outcomeValidator = v.union(
  v.object({
    kind: v.literal("next"),
    stage: chapterGuideStageValidator,
    research: v.optional(v.any()),
    draft: v.optional(v.any()),
    review: v.optional(v.any()),
  }),
  v.object({
    kind: v.literal("publish"),
    content: chapterGuideContentValidator,
    sources: v.array(chapterGuideSourceValidator),
    provenance: chapterGuideProvenanceValidator,
  }),
  v.object({ kind: v.literal("retry"), code: v.string(), feedback: v.optional(v.array(v.string())) }),
  v.object({ kind: v.literal("fail"), code: v.string() })
);

async function settleAttempt(
  ctx: MutationCtx,
  attempt: Doc<"chapterGuideAttempts">,
  job: Doc<"chapterGuideJobs">,
  charge: { costSource: Doc<"chapterGuideAttempts">["costSource"]; actualMicros: number; usage?: Doc<"chapterGuideAttempts">["usage"] },
  errorCode?: string
): Promise<Doc<"chapterGuideJobs">> {
  await ctx.db.patch(attempt._id, {
    status: "settled",
    costSource: charge.costSource,
    actualMicros: charge.actualMicros,
    usage: charge.usage,
    errorCode,
    settledAt: Date.now(),
  });
  const charged = await chargeJob(ctx, job, charge.actualMicros);
  if (attempt.carryoverPeriodKey) {
    const settledInLaterPeriod = budgetPeriodKey(Date.now()) !== attempt.periodKey;
    await adjustPeriod(ctx, attempt.carryoverPeriodKey, {
      spentMicros: settledInLaterPeriod ? charge.actualMicros : 0,
      reservedMicros: -(attempt.carryoverMicros ?? 0),
    });
  }
  if (charge.actualMicros > attempt.maxCostMicros) {
    await upsertSettings(ctx, { paused: true, pauseReason: "reservation_exceeded" });
  }
  return charged;
}

export const completeStage = internalMutation({
  args: {
    attemptId: v.id("chapterGuideAttempts"),
    charge: chargeValidator,
    outcome: outcomeValidator,
  },
  handler: async (ctx, { attemptId, charge, outcome }): Promise<void> => {
    const attempt = await ctx.db.get(attemptId);
    if (!attempt || attempt.status !== "started") return;
    const job = await ctx.db.get(attempt.jobId);
    if (!job || job.status !== "running" || job.activeAttemptId !== attemptId) return;

    const usage = charge.source !== "no_charge" && charge.usage && isValidTokenUsage(charge.usage) ? charge.usage : undefined;
    const reportedMicros = usage ? usageCostMicros(attempt.model as ChapterGuideModel, usage) : 0;
    const costSource = charge.source === "reported" && !usage ? "held_at_maximum" : charge.source;
    const actualMicros =
      costSource === "no_charge" ? 0 : costSource === "reported" ? reportedMicros : Math.max(attempt.maxCostMicros, reportedMicros);
    const errorCode = outcome.kind === "retry" || outcome.kind === "fail" ? outcome.code : undefined;
    const charged = await settleAttempt(ctx, attempt, job, { costSource, actualMicros, usage }, errorCode);
    const now = Date.now();

    if (outcome.kind === "fail") {
      await finishJob(ctx, charged, "failed", outcome.code);
      return;
    }
    if (outcome.kind === "retry") {
      if (charged.stageAttempts[attempt.stage] >= STAGE_MAX_ATTEMPTS[attempt.stage]) {
        await finishJob(ctx, charged, "failed", outcome.code);
        return;
      }
      await ctx.db.patch(charged._id, {
        activeAttemptId: undefined,
        writerFeedback: outcome.feedback ?? charged.writerFeedback,
        leaseExpiresAt: now + RETRY_DELAY_MS + WORKER_START_GRACE_MS,
      });
      await ctx.scheduler.runAfter(RETRY_DELAY_MS, internal.chapterGuideWorker.runStage, { jobId: charged._id });
      return;
    }
    if (outcome.kind === "next") {
      await ctx.db.patch(charged._id, {
        activeAttemptId: undefined,
        stage: outcome.stage,
        writerFeedback: undefined,
        leaseExpiresAt: now + WORKER_START_GRACE_MS,
        ...(outcome.research !== undefined ? { research: outcome.research } : {}),
        ...(outcome.draft !== undefined ? { draft: outcome.draft } : {}),
        ...(outcome.review !== undefined ? { review: outcome.review } : {}),
      });
      await ctx.scheduler.runAfter(0, internal.chapterGuideWorker.runStage, { jobId: charged._id });
      return;
    }

    const existing = await readGuide(ctx, charged.volume, charged.book, charged.chapter, charged.scriptureHash);
    if (!existing) {
      await ctx.db.insert("chapterGuides", {
        volume: charged.volume,
        book: charged.book,
        chapter: charged.chapter,
        reference: charged.reference,
        scriptureHash: charged.scriptureHash,
        content: outcome.content,
        sources: outcome.sources,
        provenance: outcome.provenance,
        generatedAt: now,
      });
    }
    await finishJob(ctx, charged, "succeeded");
  },
});

export const sweepStaleJobs = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ swept: number }> => {
    const now = Date.now();
    const stale = await ctx.db
      .query("chapterGuideJobs")
      .withIndex("by_status_lease", (q) => q.eq("status", "running").lt("leaseExpiresAt", now))
      .take(25);
    for (const job of stale) {
      let current = job;
      const attempt = job.activeAttemptId ? await ctx.db.get(job.activeAttemptId) : null;
      if (attempt?.status === "started") {
        current = await settleAttempt(
          ctx,
          attempt,
          job,
          { costSource: "held_at_maximum", actualMicros: attempt.maxCostMicros },
          "worker_lost"
        );
      }
      await finishJob(ctx, current, "failed", "worker_lost");
    }
    return { swept: stale.length };
  },
});

export const retireGuide = internalMutation({
  args: { volume: v.string(), book: v.string(), chapter: v.number(), scriptureHash: v.string() },
  handler: async (ctx, args): Promise<{ removed: boolean }> => {
    const guide = await readGuide(ctx, args.volume, args.book, args.chapter, args.scriptureHash);
    if (!guide) return { removed: false };
    await ctx.db.delete(guide._id);
    return { removed: true };
  },
});

export const getOwnerOverview = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getViewerClerkId(ctx);
    if (!clerkId) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (user?.isAdmin !== true) return null;

    const now = Date.now();
    const periodKey = budgetPeriodKey(now);
    const period = await readPeriod(ctx, periodKey);
    const settings = await readSettings(ctx);
    const recent = await ctx.db.query("chapterGuideJobs").withIndex("by_created").order("desc").take(20);
    return {
      periodKey,
      spentMicros: period?.spentMicros ?? 0,
      reservedMicros: period?.reservedMicros ?? 0,
      capMicros: effectiveMonthlyCapMicros(settings?.monthlyCapMicros),
      hardCapMicros: HARD_MONTHLY_CAP_MICROS,
      marginMicros: RESERVATION_MARGIN_MICROS,
      paused: !settings || settings.paused,
      pauseReason: settings ? settings.pauseReason ?? null : "not_activated",
      consecutiveFailures: settings?.consecutiveFailures ?? 0,
      keysConfigured: providerKeysConfigured(),
      serviceSecretConfigured: serviceSecretConfigured(),
      pricesVerifiedOn: PRICES_VERIFIED_ON,
      recentJobs: recent.map((job) => ({
        id: job._id,
        reference: job.reference,
        status: job.status,
        stage: job.stage,
        spentMicros: job.spentMicros,
        reservedRemainingMicros: job.reservedRemainingMicros,
        failureCode: job.failureCode ?? null,
        createdAt: job.createdAt,
      })),
    };
  },
});

export const setPaused = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx, { paused }): Promise<{ ok: true }> => {
    await requireOwner(ctx);
    await upsertSettings(ctx, paused ? { paused: true, pauseReason: "owner" } : { paused: false, pauseReason: undefined, consecutiveFailures: 0 });
    return { ok: true };
  },
});

export const setMonthlyCap = mutation({
  args: { capDollars: v.number() },
  handler: async (ctx, { capDollars }): Promise<{ ok: true }> => {
    await requireOwner(ctx);
    const capInMicros = Math.floor(capDollars * MICROS_PER_DOLLAR);
    if (!Number.isFinite(capDollars) || capDollars < 0 || capInMicros > HARD_MONTHLY_CAP_MICROS) {
      throw new Error("The monthly cap must be between $0 and $100.");
    }
    await upsertSettings(ctx, { monthlyCapMicros: capInMicros });
    return { ok: true };
  },
});
