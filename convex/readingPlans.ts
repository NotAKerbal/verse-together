import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireClerkId } from "./utils";

const MAX_STEPS = 2000;
const MAX_TITLE = 120;
const MAX_LABEL = 80;
const MAX_SELECTIONS = 200;

const planStepValidator = v.object({
  volume: v.string(),
  book: v.string(),
  chapter: v.number(),
  label: v.string(),
});

const planSelectionValidator = v.object({
  kind: v.union(v.literal("volume"), v.literal("book"), v.literal("range")),
  volume: v.string(),
  book: v.optional(v.string()),
  from: v.optional(v.number()),
  to: v.optional(v.number()),
});

const planTemplateValidator = v.union(v.literal("bom-30"), v.literal("book-daily"), v.literal("custom"));

type PlanStep = { volume: string; book: string; chapter: number; label: string };
type PlanSelection = { kind: "volume" | "book" | "range"; volume: string; book?: string; from?: number; to?: number };

function chapterKey(step: { volume: string; book: string; chapter: number }): string {
  return `${step.volume}:${step.book}:${step.chapter}`;
}

async function maybeClerkId(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

async function loadReadMap(ctx: QueryCtx, clerkId: string): Promise<Map<string, number>> {
  const rows = await ctx.db
    .query("chapterReads")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .collect();
  const map = new Map<string, number>();
  for (const row of rows) map.set(chapterKey(row), row.readAt);
  return map;
}

function normalizeDateKey(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error("Start date must look like YYYY-MM-DD");
  return trimmed;
}

function normalizeSteps(steps: PlanStep[]): PlanStep[] {
  if (steps.length === 0) throw new Error("A plan needs at least one chapter");
  if (steps.length > MAX_STEPS) throw new Error(`A plan can hold at most ${MAX_STEPS} chapters`);
  const seen = new Set<string>();
  const out: PlanStep[] = [];
  for (const step of steps) {
    const volume = step.volume.trim();
    const book = step.book.trim();
    const label = step.label.trim().slice(0, MAX_LABEL);
    if (!volume || !book || !label) throw new Error("Every step needs a volume, book, and label");
    if (!Number.isInteger(step.chapter) || step.chapter < 1) throw new Error("Chapters must be positive whole numbers");
    const key = chapterKey({ volume, book, chapter: step.chapter });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ volume, book, chapter: step.chapter, label });
  }
  return out;
}

function normalizeSelections(selections: PlanSelection[] | undefined): PlanSelection[] | undefined {
  if (!selections) return undefined;
  if (selections.length > MAX_SELECTIONS) throw new Error(`A plan can hold at most ${MAX_SELECTIONS} selections`);
  return selections.map((selection): PlanSelection => {
    const volume = selection.volume.trim();
    if (!volume) throw new Error("Every selection needs a volume");
    if (selection.kind === "volume") return { kind: "volume", volume };
    const book = (selection.book ?? "").trim();
    if (!book) throw new Error("Book selections need a book");
    if (selection.kind === "book") return { kind: "book", volume, book };
    const from = selection.from ?? 1;
    const to = selection.to ?? from;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
      throw new Error("Chapter ranges must run from a lower chapter to a higher one");
    }
    return { kind: "range", volume, book, from, to };
  });
}

function normalizeReadingDays(days: boolean[] | undefined): boolean[] | undefined {
  if (!days) return undefined;
  if (days.length !== 7) throw new Error("Reading days must list all seven weekdays");
  if (!days.some(Boolean)) throw new Error("Pick at least one reading day");
  if (days.every(Boolean)) return undefined;
  return days;
}

/** Validates and trims the fields shared by create and update. */
function normalizePlanInput(input: {
  title: string;
  steps: PlanStep[];
  selections?: PlanSelection[];
  startDate?: string;
  chaptersPerDay?: number;
  readingDays?: boolean[];
}) {
  const title = input.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new Error("Give the plan a title");
  const steps = normalizeSteps(input.steps);
  const selections = normalizeSelections(input.selections);
  const startDate = normalizeDateKey(input.startDate);
  const chaptersPerDay =
    input.chaptersPerDay !== undefined ? Math.max(1, Math.min(steps.length, Math.round(input.chaptersPerDay))) : undefined;
  const readingDays = normalizeReadingDays(input.readingDays);
  return { title, steps, selections, startDate, chaptersPerDay, readingDays };
}

async function loadOwnedPlan(ctx: MutationCtx, planId: Id<"readingPlans">): Promise<Doc<"readingPlans">> {
  const clerkId = await requireClerkId(ctx);
  const plan = await ctx.db.get(planId);
  if (!plan || plan.clerkId !== clerkId) throw new Error("Plan not found");
  return plan;
}

function summarizePlan(plan: Doc<"readingPlans">, readMap: Map<string, number>) {
  let readCount = 0;
  for (const step of plan.steps) {
    if (readMap.has(chapterKey(step))) readCount += 1;
  }
  return {
    id: plan._id,
    title: plan.title,
    template: plan.template,
    stepCount: plan.steps.length,
    readCount,
    startDate: plan.startDate ?? null,
    chaptersPerDay: plan.chaptersPerDay ?? null,
    readingDays: plan.readingDays ?? null,
    selections: plan.selections ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export const listMyPlans = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return null;
    const plans = await ctx.db
      .query("readingPlans")
      .withIndex("by_clerk_created", (q) => q.eq("clerkId", clerkId))
      .order("desc")
      .collect();
    if (plans.length === 0) return [];
    const readMap = await loadReadMap(ctx, clerkId);
    return plans.map((plan) => summarizePlan(plan, readMap));
  },
});

export const getPlan = query({
  args: { planId: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return null;
    const planId = ctx.db.normalizeId("readingPlans", args.planId);
    if (!planId) return null;
    const plan = await ctx.db.get(planId);
    if (!plan || plan.clerkId !== clerkId) return null;
    const readMap = await loadReadMap(ctx, clerkId);
    return {
      ...summarizePlan(plan, readMap),
      steps: plan.steps.map((step, index) => ({
        ...step,
        index,
        readAt: readMap.get(chapterKey(step)) ?? null,
      })),
    };
  },
});

export const createPlan = mutation({
  args: {
    title: v.string(),
    template: planTemplateValidator,
    steps: v.array(planStepValidator),
    selections: v.optional(v.array(planSelectionValidator)),
    startDate: v.optional(v.string()),
    chaptersPerDay: v.optional(v.number()),
    readingDays: v.optional(v.array(v.boolean())),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const normalized = normalizePlanInput(args);
    const now = Date.now();
    const id: Id<"readingPlans"> = await ctx.db.insert("readingPlans", {
      clerkId,
      template: args.template,
      ...normalized,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

/**
 * Replaces the plan's scope, steps, pace, and title. Read state lives in
 * `chapterReads`, so chapters already read stay read; only the schedule is rebuilt.
 */
export const updatePlan = mutation({
  args: {
    planId: v.id("readingPlans"),
    title: v.string(),
    steps: v.array(planStepValidator),
    selections: v.optional(v.array(planSelectionValidator)),
    startDate: v.optional(v.string()),
    chaptersPerDay: v.optional(v.number()),
    readingDays: v.optional(v.array(v.boolean())),
  },
  handler: async (ctx, args) => {
    const plan = await loadOwnedPlan(ctx, args.planId);
    const normalized = normalizePlanInput(args);
    await ctx.db.replace(plan._id, {
      clerkId: plan.clerkId,
      // Once a plan has been through the builder it is fully described by its selections.
      template: "custom",
      ...normalized,
      createdAt: plan.createdAt,
      updatedAt: Date.now(),
    });
    return { id: plan._id };
  },
});

export const deletePlan = mutation({
  args: { planId: v.id("readingPlans") },
  handler: async (ctx, args) => {
    const plan = await loadOwnedPlan(ctx, args.planId);
    await ctx.db.delete(plan._id);
    return { ok: true };
  },
});
