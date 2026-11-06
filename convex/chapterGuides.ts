import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  budgetPeriodKey,
  type ChapterGuideModel,
  type ChapterGuideStage,
  CONTINUATION_CORRECTION_ROUNDS,
  continuationCalls,
  continuationReservationMicros,
  DAY_MS,
  effectiveMonthlyCapMicros,
  FAILURE_COOLDOWN_MS,
  FAILURES_BEFORE_AUTO_PAUSE,
  HARD_MONTHLY_CAP_MICROS,
  isCorrectionStage,
  isValidTokenUsage,
  jobReservationMicros,
  LEGACY_CORRECTION_ROUNDS,
  MAX_ACTIVE_JOBS,
  MAX_CHAPTER_BYTES,
  MAX_CHAPTER_VERSES,
  MAX_CORRECTION_ROUNDS,
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
  type ChapterGuideContent,
  correctionsFitBound,
  type GuideCorrection,
  type GuideReview,
  invalidCorrectionTargets,
  MAX_REQUIRED_CORRECTIONS,
  type ResearchPacket,
} from "./chapterGuideContent";
import {
  chapterGuideContentValidator,
  chapterGuideProvenanceValidator,
  chapterGuideSourceValidator,
  chapterGuideStageValidator,
  chapterGuideUsageValidator,
  chapterVerseValidator,
} from "./chapterGuideValidators";
import { getViewerClerkId, requireClerkId, requireViewerUser } from "./utils";

const WORKER_START_GRACE_MS = 5 * 60 * 1000;
const CODES_WITHOUT_COOLDOWN = new Set(["paused", "budget_stopped", "not_configured", "superseded"]);
const CODES_FOR_HUMAN_REVIEW = new Set([
  "repair_unresolved",
  "repair_noop",
  "repair_out_of_scope",
  "repair_invalid",
  "repair_unparseable",
  "review_rejected",
  "review_invalid_target",
  "recheck_rejected",
  "recheck_invalid_target",
  "recheck_unparseable",
]);
const MAX_REVIEW_QUEUE_ROWS = 100;

export type GuideAvailability = "available" | "paused" | "not_configured" | "budget_exhausted" | "cooldown" | "busy" | "needs_review";

export type GenerationRequestResult =
  | { status: "ready" }
  | { status: "generating" }
  | { status: "started" }
  | { status: "unavailable"; reason: GuideAvailability | "user_limit" | "daily_limit" };

export type ContinuationBlock = "paused" | "not_configured" | "budget_exhausted" | "busy";

export type GuideReviewRole = "owner" | "reviewer";

export type ReviewContinuationResult =
  | { status: "started"; reservedMicros: number }
  | { status: "running" }
  | { status: "stale" }
  | { status: "already_published" }
  | { status: "unavailable"; reason: ContinuationBlock };

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

function cooldownDetails(job: Doc<"chapterGuideJobs"> | null) {
  if (!job || job.finishedAt === undefined) return null;
  return { retryAt: job.finishedAt + FAILURE_COOLDOWN_MS, failedStage: job.stage };
}

type CorrectionState = Pick<Doc<"chapterGuideJobs">, "stage" | "correctionRound" | "maxCorrectionRounds">;

function correctionRoundOf(job: CorrectionState): number {
  return job.correctionRound ?? (isCorrectionStage(job.stage) ? 1 : 0);
}

function correctionRoundLimit(job: CorrectionState): number {
  return job.maxCorrectionRounds ?? LEGACY_CORRECTION_ROUNDS;
}

function generatingDetails(job: Doc<"chapterGuideJobs">) {
  const base = { stage: job.stage, startedAt: job.resumedAt ?? job.createdAt };
  if (!isCorrectionStage(job.stage)) return base;
  return { ...base, correctionRound: correctionRoundOf(job), maxCorrectionRounds: correctionRoundLimit(job) };
}

async function runningJobCount(ctx: QueryCtx, limit: number): Promise<number> {
  const running = await ctx.db
    .query("chapterGuideJobs")
    .withIndex("by_status_lease", (q) => q.eq("status", "running"))
    .take(limit);
  return running.length;
}

async function readGuideReviewRole(ctx: QueryCtx, clerkId: string): Promise<GuideReviewRole | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
  if (user?.isAdmin === true) return "owner";
  return user?.isChapterGuideReviewer === true ? "reviewer" : null;
}

async function requireOwner(ctx: MutationCtx): Promise<string> {
  const clerkId = await requireClerkId(ctx);
  if ((await readGuideReviewRole(ctx, clerkId)) !== "owner") throw new Error("Forbidden");
  return clerkId;
}

async function requireGuideReviewAccess(ctx: MutationCtx): Promise<string> {
  const clerkId = await requireClerkId(ctx);
  if (!(await readGuideReviewRole(ctx, clerkId))) throw new Error("Forbidden");
  return clerkId;
}

async function viewerGuideReviewRole(ctx: QueryCtx): Promise<GuideReviewRole | null> {
  const clerkId = await getViewerClerkId(ctx);
  return clerkId ? await readGuideReviewRole(ctx, clerkId) : null;
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
    const generating = job?.status === "running" ? generatingDetails(job) : null;
    const heldForReview = job?.status === "needs_review" && job.scriptureHash === args.scriptureHash;
    const published = guide
      ? {
          reference: guide.reference,
          content: guide.content,
          sources: guide.sources,
          provenance: guide.provenance,
          generatedAt: guide.generatedAt,
        }
      : null;
    if (guide || generating) return { guide: published, generating, availability: null, cooldown: null };
    if (heldForReview) return { guide: null, generating: null, availability: "needs_review" as const, cooldown: null };

    const now = Date.now();
    let availability: GuideAvailability = "available";
    if (!providerKeysConfigured() || !serviceSecretConfigured()) availability = "not_configured";
    else if (await isPaused(ctx)) availability = "paused";
    else if (isInCooldown(job, now)) availability = "cooldown";
    else if ((await runningJobCount(ctx, MAX_ACTIVE_JOBS)) >= MAX_ACTIVE_JOBS) availability = "busy";
    else if (!(await periodCanHold(ctx, budgetPeriodKey(now), jobReservationMicros(args.verseCount, args.chapterBytes)))) {
      availability = "budget_exhausted";
    }
    return { guide: null, generating: null, availability, cooldown: availability === "cooldown" ? cooldownDetails(job) : null };
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
    const viewer = await requireViewerUser(ctx);
    const clerkId = viewer.clerkId;

    const chapterBytes = utf8Bytes(args.verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n"));
    if (args.verses.length === 0 || args.verses.length > MAX_CHAPTER_VERSES || chapterBytes > MAX_CHAPTER_BYTES) {
      throw new Error("Invalid chapter");
    }

    if (await readGuide(ctx, args.volume, args.book, args.chapter, args.scriptureHash)) return { status: "ready" };
    const latest = await latestChapterJob(ctx, args.volume, args.book, args.chapter);
    if (latest?.status === "running") return { status: "generating" };
    if (latest?.status === "needs_review" && latest.scriptureHash === args.scriptureHash) {
      return { status: "unavailable", reason: "needs_review" };
    }

    const now = Date.now();
    if (!providerKeysConfigured()) return { status: "unavailable", reason: "not_configured" };
    if (await isPaused(ctx)) return { status: "unavailable", reason: "paused" };
    if (isInCooldown(latest, now)) return { status: "unavailable", reason: "cooldown" };
    if ((await runningJobCount(ctx, MAX_ACTIVE_JOBS)) >= MAX_ACTIVE_JOBS) return { status: "unavailable", reason: "busy" };

    if (viewer.unlimitedChapterGuideGeneration !== true && (await reachedUserLimit(ctx, clerkId, now))) {
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

    if (latest?.status === "needs_review") await finishJob(ctx, latest, "failed", "superseded");
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
      maxCorrectionRounds: MAX_CORRECTION_ROUNDS,
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

async function reachedUserLimit(ctx: QueryCtx, clerkId: string, now: number): Promise<boolean> {
  const userRequests = await ctx.db
    .query("chapterGuideRequests")
    .withIndex("by_clerk_created", (q) => q.eq("clerkId", clerkId).gt("createdAt", now - MONTH_WINDOW_MS))
    .take(MAX_USER_JOBS_PER_MONTH);
  if (userRequests.length >= MAX_USER_JOBS_PER_MONTH) return true;
  return userRequests.filter((row) => row.createdAt > now - DAY_MS).length >= MAX_USER_JOBS_PER_DAY;
}

type GenerationAllowanceError =
  | "invalid_email"
  | "auth_user_missing"
  | "auth_user_unverified"
  | "account_not_linked"
  | "auth_user_linked_to_multiple_rows";

type GenerationAllowanceAccount =
  | { error: GenerationAllowanceError }
  | { email: string; authUserId: string; user: Doc<"users"> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function findSignedInAccountByEmail(ctx: QueryCtx, rawEmail: string): Promise<GenerationAllowanceAccount> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { error: "invalid_email" };
  const authUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  })) as { _id: string; emailVerified: boolean } | null;
  if (!authUser) return { error: "auth_user_missing" };
  if (!authUser.emailVerified) return { error: "auth_user_unverified" };
  const authUserId = String(authUser._id);
  const linked = await ctx.db
    .query("users")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId))
    .take(2);
  if (linked.length > 1) return { error: "auth_user_linked_to_multiple_rows" };
  const user = linked[0];
  if (!user) return { error: "account_not_linked" };
  return { email, authUserId, user };
}

function allowanceSummary(account: { email: string; authUserId: string; user: Doc<"users"> }, unlimited: boolean) {
  return {
    ok: true as const,
    email: account.email,
    authUserId: account.authUserId,
    ownerKey: account.user.clerkId,
    unlimitedChapterGuideGeneration: unlimited,
  };
}

export const getGenerationAllowance = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const account = await findSignedInAccountByEmail(ctx, args.email);
    if ("error" in account) return { ok: false as const, error: account.error };
    return allowanceSummary(account, account.user.unlimitedChapterGuideGeneration === true);
  },
});

export const setUnlimitedGeneration = internalMutation({
  args: { email: v.string(), unlimited: v.boolean() },
  handler: async (ctx, args) => {
    const account = await findSignedInAccountByEmail(ctx, args.email);
    if ("error" in account) return { ok: false as const, error: account.error };
    const previous = account.user.unlimitedChapterGuideGeneration === true;
    if (previous !== args.unlimited) {
      await ctx.db.patch(account.user._id, {
        unlimitedChapterGuideGeneration: args.unlimited ? true : undefined,
        updatedAt: Date.now(),
      });
    }
    return { ...allowanceSummary(account, args.unlimited), previous };
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
    reviewCode: undefined,
    reviewQueuedAt: undefined,
    finishedAt: now,
  });
  const settings = await readSettings(ctx);
  if (!settings) return;
  if (status === "succeeded") {
    await ctx.db.patch(settings._id, { consecutiveFailures: 0, updatedAt: now });
    return;
  }
  await recordFailure(ctx, failureCode);
}

async function recordFailure(ctx: MutationCtx, failureCode: string | undefined): Promise<void> {
  const settings = await readSettings(ctx);
  if (!settings) return;
  if (failureCode && CODES_WITHOUT_COOLDOWN.has(failureCode)) return;
  const now = Date.now();
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

function findingsCanBeRepaired(draft: ChapterGuideContent, findings: GuideReview): boolean {
  const corrections = findings.required_corrections;
  return corrections.length <= MAX_REQUIRED_CORRECTIONS && correctionsFitBound(corrections) && invalidCorrectionTargets(draft, corrections).length === 0;
}

function findingsWithinBound(findings: GuideReview): GuideReview {
  const kept: GuideCorrection[] = [];
  for (const correction of findings.required_corrections.slice(0, MAX_REQUIRED_CORRECTIONS)) {
    if (!correctionsFitBound([...kept, correction])) break;
    kept.push(correction);
  }
  return { ...findings, required_corrections: kept };
}

function reviewResumeStage(job: Doc<"chapterGuideJobs">, latestFindings: GuideReview | undefined): ChapterGuideStage {
  const reviewerJustAnswered = job.stage === "recheck" && latestFindings !== undefined;
  return reviewerJustAnswered && findingsCanBeRepaired(job.draft as ChapterGuideContent, latestFindings) ? "repair" : job.stage;
}

async function stopJob(ctx: MutationCtx, job: Doc<"chapterGuideJobs">, code: string, latestFindings?: GuideReview): Promise<void> {
  const findings = latestFindings ?? job.review;
  const hasArtifacts = job.verses.length > 0 && job.research !== undefined && job.draft !== undefined && findings !== undefined;
  const contentNeedsPerson = CODES_FOR_HUMAN_REVIEW.has(code);
  if (!hasArtifacts || !(contentNeedsPerson || (job.continuations ?? 0) > 0)) {
    await finishJob(ctx, job, "failed", code);
    return;
  }
  await adjustPeriod(ctx, job.periodKey, { reservedMicros: -job.reservedRemainingMicros });
  await ctx.db.patch(job._id, {
    status: "needs_review",
    stage: reviewResumeStage(job, latestFindings),
    review: findings,
    reviewCode: code,
    reviewQueuedAt: Date.now(),
    reservedRemainingMicros: 0,
    activeAttemptId: undefined,
    writerFeedback: undefined,
  });
  if (!contentNeedsPerson) await recordFailure(ctx, code);
}

export type StagePlan =
  | { kind: "stop" }
  | {
      kind: "run";
      attemptId: Id<"chapterGuideAttempts">;
      stage: ChapterGuideStage;
      attempt: number;
      correctionRound: number;
      maxCorrectionRounds: number;
      initialRequiredCorrections: number | null;
      continuation: number;
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
      await stopJob(ctx, stored, "paused");
      return { kind: "stop" };
    }
    const currentPeriodKey = budgetPeriodKey(now);
    const job = stored.periodKey === currentPeriodKey ? stored : await moveReservationToPeriod(ctx, stored, currentPeriodKey);
    if (!job) {
      await stopJob(ctx, stored, "budget_stopped");
      return { kind: "stop" };
    }
    const period = await readPeriod(ctx, job.periodKey);
    const cap = await capMicros(ctx);
    if (!period || period.spentMicros + period.reservedMicros > cap) {
      await stopJob(ctx, job, "budget_stopped");
      return { kind: "stop" };
    }
    const stage = job.stage;
    const attempt = job.stageAttempts[stage] + 1;
    if (attempt > STAGE_MAX_ATTEMPTS[stage]) {
      await stopJob(ctx, job, `${stage}_attempts_exhausted`);
      return { kind: "stop" };
    }
    const maxCostMicros = stageMaxCostMicros(stage, job.verses.length, job.chapterBytes);
    if (maxCostMicros > job.reservedRemainingMicros) {
      await stopJob(ctx, job, "reservation_short");
      return { kind: "stop" };
    }
    const leaseExpiresAt = now + STAGE_TIMEOUT_MS[stage] + STAGE_LEASE_GRACE_MS;
    const carryoverPeriodKey = nextPeriodExposure(now, leaseExpiresAt);
    if (carryoverPeriodKey) {
      if (!(await periodCanHold(ctx, carryoverPeriodKey, maxCostMicros))) {
        await stopJob(ctx, job, "budget_stopped");
        return { kind: "stop" };
      }
      await adjustPeriod(ctx, carryoverPeriodKey, { reservedMicros: maxCostMicros });
    }
    const model = STAGE_MODELS[stage];
    const correctionRound = correctionRoundOf(job);
    const attemptId = await ctx.db.insert("chapterGuideAttempts", {
      jobId,
      stage,
      attempt,
      ...(isCorrectionStage(stage) ? { correctionRound } : {}),
      ...(job.continuations ? { continuation: job.continuations } : {}),
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
      correctionRound,
      maxCorrectionRounds: correctionRoundLimit(job),
      initialRequiredCorrections: job.initialRequiredCorrections ?? null,
      continuation: job.continuations ?? 0,
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
  v.object({ kind: v.literal("retry"), code: v.string(), feedback: v.optional(v.array(v.string())), review: v.optional(v.any()) }),
  v.object({ kind: v.literal("fail"), code: v.string(), review: v.optional(v.any()) })
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
      await stopJob(ctx, charged, outcome.code, outcome.review as GuideReview | undefined);
      return;
    }
    if (outcome.kind === "retry") {
      if (charged.stageAttempts[attempt.stage] >= STAGE_MAX_ATTEMPTS[attempt.stage]) {
        await stopJob(ctx, charged, outcome.code, outcome.review as GuideReview | undefined);
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
      const correctionRound = correctionRoundOf(charged) + 1;
      if (outcome.stage === "repair" && correctionRound > correctionRoundLimit(charged)) {
        await stopJob(ctx, charged, "repair_unresolved", outcome.review as GuideReview | undefined);
        return;
      }
      await ctx.db.patch(charged._id, {
        activeAttemptId: undefined,
        stage: outcome.stage,
        writerFeedback: undefined,
        leaseExpiresAt: now + WORKER_START_GRACE_MS,
        ...(outcome.stage === "repair"
          ? { correctionRound, stageAttempts: { ...charged.stageAttempts, repair: 0, recheck: 0 } }
          : {}),
        ...(attempt.stage === "review" && outcome.review !== undefined
          ? { initialRequiredCorrections: (outcome.review as GuideReview).required_corrections.length }
          : {}),
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
      await stopJob(ctx, current, "worker_lost");
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
    if ((await viewerGuideReviewRole(ctx)) !== "owner") return null;

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

function reviewQueueItem(job: Doc<"chapterGuideJobs">, role: GuideReviewRole) {
  return {
    id: job._id,
    reference: job.reference,
    queuedAt: job.reviewQueuedAt ?? 0,
    reasonCode: job.reviewCode ?? "",
    resumeStage: job.stage,
    correctionRound: correctionRoundOf(job),
    continuations: job.continuations ?? 0,
    findingCount: (job.review as GuideReview | undefined)?.required_corrections.length ?? 0,
    spentMicros: role === "owner" ? job.spentMicros : null,
    continuationRounds: CONTINUATION_CORRECTION_ROUNDS,
    continuationCalls: continuationCalls(job.stage),
    continuationMicros: continuationReservationMicros(job.stage, job.verses.length, job.chapterBytes),
  };
}

async function continuationBlock(ctx: QueryCtx, job: Doc<"chapterGuideJobs">, periodKey: string): Promise<ContinuationBlock | null> {
  if (!providerKeysConfigured() || !serviceSecretConfigured()) return "not_configured";
  if (await isPaused(ctx)) return "paused";
  if ((await runningJobCount(ctx, MAX_ACTIVE_JOBS)) >= MAX_ACTIVE_JOBS) return "busy";
  const requestedMicros = continuationReservationMicros(job.stage, job.verses.length, job.chapterBytes);
  return (await periodCanHold(ctx, periodKey, requestedMicros)) ? null : "budget_exhausted";
}

export const getReviewQueue = query({
  args: {},
  handler: async (ctx) => {
    const role = await viewerGuideReviewRole(ctx);
    if (!role) return null;
    const held = await ctx.db
      .query("chapterGuideJobs")
      .withIndex("by_status_lease", (q) => q.eq("status", "needs_review"))
      .take(MAX_REVIEW_QUEUE_ROWS);
    return held.map((job) => reviewQueueItem(job, role)).sort((left, right) => left.queuedAt - right.queuedAt);
  },
});

export const getReviewDetail = query({
  args: { jobId: v.id("chapterGuideJobs") },
  handler: async (ctx, { jobId }) => {
    const role = await viewerGuideReviewRole(ctx);
    if (!role) return null;
    const job = await ctx.db.get(jobId);
    if (job?.status !== "needs_review") return null;
    const continuations = await ctx.db
      .query("chapterGuideContinuations")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .collect();
    return {
      ...reviewQueueItem(job, role),
      blockedBy: await continuationBlock(ctx, job, budgetPeriodKey(Date.now())),
      draft: job.draft as ChapterGuideContent,
      findings: job.review as GuideReview,
      sources: (job.research as ResearchPacket).sources,
      history: continuations.map((row) => ({
        continuation: row.continuation,
        createdAt: row.createdAt,
        queueCode: row.queueCode,
        fromCorrectionRound: row.fromCorrectionRound,
        maxCorrectionRounds: row.maxCorrectionRounds,
        reservedMicros: row.reservedMicros,
      })),
    };
  },
});

export const continueReview = mutation({
  args: { jobId: v.id("chapterGuideJobs"), queuedAt: v.number() },
  handler: async (ctx, { jobId, queuedAt }): Promise<ReviewContinuationResult> => {
    const continuedByClerkId = await requireGuideReviewAccess(ctx);
    const job = await ctx.db.get(jobId);
    if (job?.status === "running") return { status: "running" };
    if (job?.status !== "needs_review" || job.reviewQueuedAt !== queuedAt) return { status: "stale" };
    if (await readGuide(ctx, job.volume, job.book, job.chapter, job.scriptureHash)) {
      await finishJob(ctx, job, "failed", "superseded");
      return { status: "already_published" };
    }

    const now = Date.now();
    const periodKey = budgetPeriodKey(now);
    const blockedBy = await continuationBlock(ctx, job, periodKey);
    if (blockedBy) return { status: "unavailable", reason: blockedBy };

    const findings = job.review as GuideReview;
    const correctionRound = correctionRoundOf(job);
    const continuation = (job.continuations ?? 0) + 1;
    const maxCorrectionRounds = correctionRound + CONTINUATION_CORRECTION_ROUNDS;
    const reservedMicros = continuationReservationMicros(job.stage, job.verses.length, job.chapterBytes);
    await adjustPeriod(ctx, periodKey, { reservedMicros });
    await ctx.db.insert("chapterGuideContinuations", {
      jobId,
      continuation,
      continuedByClerkId,
      queueCode: job.reviewCode ?? "",
      resumeStage: job.stage,
      fromCorrectionRound: correctionRound,
      maxCorrectionRounds,
      periodKey,
      reservedMicros,
      findings,
      createdAt: now,
    });
    await ctx.db.patch(jobId, {
      status: "running",
      continuations: continuation,
      resumedAt: now,
      correctionRound: job.stage === "repair" ? correctionRound + 1 : correctionRound,
      maxCorrectionRounds,
      stageAttempts: { ...job.stageAttempts, review: 0, repair: 0, recheck: 0 },
      review: job.stage === "recheck" ? findingsWithinBound(findings) : findings,
      reviewCode: undefined,
      reviewQueuedAt: undefined,
      periodKey,
      reservedRemainingMicros: reservedMicros,
      leaseExpiresAt: now + WORKER_START_GRACE_MS,
    });
    await ctx.scheduler.runAfter(0, internal.chapterGuideWorker.runStage, { jobId });
    return { status: "started", reservedMicros };
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
