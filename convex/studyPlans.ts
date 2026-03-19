// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

function toDateKey(input: Date): string {
  const y = input.getUTCFullYear();
  const m = String(input.getUTCMonth() + 1).padStart(2, "0");
  const d = String(input.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function startOfUtcWeek(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay(); // 0 Sunday .. 6 Saturday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + mondayOffset);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function normalizeText(value: string | undefined, max = 220): string | undefined {
  const out = (value ?? "").trim();
  if (!out) return undefined;
  return out.slice(0, max);
}

async function getActivePlan(ctx: any, clerkId: string) {
  return await ctx.db
    .query("studyPlans")
    .withIndex("by_clerk_active", (q: any) => q.eq("clerkId", clerkId).eq("active", true))
    .first();
}

export const getDashboard = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await requireClerkId(ctx);
    const activePlan = await getActivePlan(ctx, clerkId);
    const now = new Date();
    const todayKey = toDateKey(now);
    const weekStart = startOfUtcWeek(now);
    const weekDays = Array.from({ length: 7 }, (_, idx) => toDateKey(addDays(weekStart, idx)));

    if (!activePlan) {
      return {
        plan: null,
        today_key: todayKey,
        streak_days: 0,
        week_progress: { completed_days: 0, target_days: 0, days: weekDays.map((key) => ({ key, checked: false })) },
      };
    }

    const checkins = await ctx.db.query("studyPlanCheckins").withIndex("by_plan", (q: any) => q.eq("planId", activePlan._id)).collect();
    const checkinSet = new Set(checkins.map((row) => row.dateKey));

    let streakDays = 0;
    let cursor = parseDateKey(todayKey);
    while (checkinSet.has(toDateKey(cursor))) {
      streakDays += 1;
      cursor = addDays(cursor, -1);
    }

    const weekChecked = weekDays.filter((day) => checkinSet.has(day));
    return {
      plan: {
        id: activePlan._id,
        title: activePlan.title,
        description: activePlan.description ?? null,
        start_date: activePlan.startDate,
        days_per_week: activePlan.daysPerWeek,
        updated_at: toIso(activePlan.updatedAt),
      },
      today_key: todayKey,
      streak_days: streakDays,
      week_progress: {
        completed_days: weekChecked.length,
        target_days: activePlan.daysPerWeek,
        days: weekDays.map((key) => ({ key, checked: checkinSet.has(key) })),
      },
    };
  },
});

export const upsertActivePlan = mutation({
  args: {
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    daysPerWeek: v.number(),
    startDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const title = normalizeText(args.title, 180) ?? "My weekly study plan";
    const description = normalizeText(args.description, 2000);
    const daysPerWeek = Math.max(1, Math.min(7, Math.round(args.daysPerWeek)));
    const startDate = normalizeText(args.startDate, 10) ?? toDateKey(new Date());

    const plans = await ctx.db.query("studyPlans").withIndex("by_clerk", (q: any) => q.eq("clerkId", clerkId)).collect();
    const now = Date.now();
    for (const plan of plans) {
      if (plan.active) await ctx.db.patch(plan._id, { active: false, updatedAt: now });
    }

    const existing = plans.find((plan) => !plan.active);
    if (existing) {
      await ctx.db.patch(existing._id, {
        title,
        description,
        daysPerWeek,
        startDate,
        active: true,
        updatedAt: now,
      });
      return { id: existing._id };
    }

    const id = await ctx.db.insert("studyPlans", {
      clerkId,
      title,
      description,
      daysPerWeek,
      startDate,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const checkInToday = mutation({
  args: {
    dateKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const plan = await getActivePlan(ctx, clerkId);
    if (!plan) throw new Error("Create a study plan first");
    const dateKey = normalizeText(args.dateKey, 10) ?? toDateKey(new Date());
    const existing = await ctx.db
      .query("studyPlanCheckins")
      .withIndex("by_plan_date", (q: any) => q.eq("planId", plan._id).eq("dateKey", dateKey))
      .unique();
    if (existing) return { ok: true };
    await ctx.db.insert("studyPlanCheckins", {
      clerkId,
      planId: plan._id,
      dateKey,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const uncheckDate = mutation({
  args: {
    dateKey: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const plan = await getActivePlan(ctx, clerkId);
    if (!plan) return { ok: true };
    const row = await ctx.db
      .query("studyPlanCheckins")
      .withIndex("by_plan_date", (q: any) => q.eq("planId", plan._id).eq("dateKey", args.dateKey))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return { ok: true };
  },
});
