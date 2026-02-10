// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { clampFontScale, requireClerkId } from "./utils";

export const getReaderPreferences = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return null;
    const row = await ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject)).unique();
    if (!row) return null;
    return {
      showFootnotes: row.showFootnotes,
      fontScale: row.fontScale,
      fontFamily: row.fontFamily,
      comparisonView: row.comparisonView === "sideBySide" ? "sideBySide" : "inline",
    };
  },
});

export const saveReaderPreferences = mutation({
  args: {
    showFootnotes: v.boolean(),
    fontScale: v.number(),
    fontFamily: v.union(v.literal("serif"), v.literal("sans")),
    comparisonView: v.union(v.literal("inline"), v.literal("sideBySide")),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const now = Date.now();
    const existing = await ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).unique();
    const payload = {
      showFootnotes: args.showFootnotes,
      fontScale: clampFontScale(args.fontScale),
      fontFamily: args.fontFamily,
      comparisonView: args.comparisonView,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ok: true };
    }
    await ctx.db.insert("readerPreferences", { clerkId, ...payload });
    return { ok: true };
  },
});
