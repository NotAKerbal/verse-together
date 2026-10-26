// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { clampFontScale, getViewerClerkId, requireClerkId } from "./utils";
import { markPresetsProblem, normalizeMarkPresets, readMarkPresets } from "./annotationRules";
import { markPresetValidator } from "./markValidators";

export const getReaderPreferences = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getViewerClerkId(ctx);
    if (!clerkId) return null;
    const row = await ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).unique();
    if (!row) return null;
    return {
      showFootnotes: row.showFootnotes,
      fontScale: row.fontScale,
      fontFamily: row.fontFamily,
      comparisonView: row.comparisonView === "sideBySide" ? "sideBySide" : "inline",
      textWidth: row.textWidth ?? "comfortable",
      markPresets: readMarkPresets(row),
    };
  },
});

export const saveReaderPreferences = mutation({
  args: {
    showFootnotes: v.boolean(),
    fontScale: v.number(),
    fontFamily: v.union(v.literal("serif"), v.literal("sans")),
    comparisonView: v.union(v.literal("inline"), v.literal("sideBySide")),
    textWidth: v.optional(v.union(v.literal("comfortable"), v.literal("wide"), v.literal("full"))),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const now = Date.now();
    const existing = await ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).unique();
    // Reader settings only: the mark presets are saved on their own (saveMarkPresets) and kept here.
    const payload = {
      showFootnotes: args.showFootnotes,
      fontScale: clampFontScale(args.fontScale),
      fontFamily: args.fontFamily,
      comparisonView: args.comparisonView,
      textWidth: args.textWidth ?? "comfortable",
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

const readerSettingsArgs = {
  showFootnotes: v.boolean(),
  fontScale: v.number(),
  fontFamily: v.union(v.literal("serif"), v.literal("sans")),
  comparisonView: v.union(v.literal("inline"), v.literal("sideBySide")),
  textWidth: v.optional(v.union(v.literal("comfortable"), v.literal("wide"), v.literal("full"))),
};

/**
 * Save the selection menu's mark presets (each a highlight or an underline in a color, optionally named), in
 * order, changing nothing else. A pair listed twice is kept once, at its first place; an empty list means no
 * quick buttons. Names are trimmed (an empty one is no name) and refused over MARK_PRESET_NAME_MAX.
 * With no preferences saved yet, the row starts from the reader settings the client has on this device
 * (readerDefaults), or the defaults.
 */
export const saveMarkPresets = mutation({
  args: {
    presets: v.array(markPresetValidator),
    readerDefaults: v.optional(v.object(readerSettingsArgs)),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const problem = markPresetsProblem(args.presets);
    if (problem) throw new Error(problem);
    const markPresets = normalizeMarkPresets(args.presets) ?? [];
    const now = Date.now();
    const existing = await ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId)).unique();
    if (existing) {
      // The earlier quick-mark choice has been carried over into the presets: drop it.
      await ctx.db.patch(existing._id, { markPresets, quickMarks: undefined, updatedAt: now });
      return { markPresets };
    }
    const reader = args.readerDefaults;
    await ctx.db.insert("readerPreferences", {
      clerkId,
      showFootnotes: reader?.showFootnotes ?? true,
      fontScale: clampFontScale(reader?.fontScale ?? 1),
      fontFamily: reader?.fontFamily ?? "serif",
      comparisonView: reader?.comparisonView ?? "inline",
      textWidth: reader?.textWidth ?? "comfortable",
      markPresets,
      updatedAt: now,
    });
    return { markPresets };
  },
});
