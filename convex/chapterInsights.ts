import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

const insightSource = v.object({
  title: v.string(),
  url: v.string(),
  format: v.optional(v.union(v.literal("article"), v.literal("video"))),
});
const scriptureLink = v.object({
  reference: v.string(),
  volume: v.string(),
  book: v.string(),
  chapter: v.number(),
  verse_start: v.number(),
  verse_end: v.number(),
});
const insightPath = v.object({
  kind: v.union(
    v.literal("cross_reference"),
    v.literal("doctrinal_context"),
    v.literal("historical_context"),
    v.literal("word_or_phrase"),
    v.literal("textual_pattern"),
    v.literal("open_question")
  ),
  verse_numbers: v.array(v.number()),
  title: v.string(),
  direction: v.string(),
  why: v.string(),
  look_for: v.array(v.string()),
  sources: v.array(insightSource),
  scripture_links: v.optional(v.array(scriptureLink)),
});

const chapterInsightEntry = v.object({
  volume: v.string(),
  book: v.string(),
  chapter: v.number(),
  reference: v.string(),
  scriptureHash: v.string(),
  promptVersion: v.number(),
  paths: v.array(insightPath),
  generatedAt: v.number(),
  signature: v.string(),
});

export const getChapterInsight = query({
  args: { volume: v.string(), book: v.string(), chapter: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chapterInsightCache")
      .withIndex("by_ref", (q) => q.eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter))
      .unique();
  },
});

export const upsertChapterInsightBatch = internalMutation({
  args: { entries: v.array(chapterInsightEntry) },
  handler: async (ctx, { entries }) => {
    const updatedAt = Date.now();
    for (const entry of entries) {
      const existing = await ctx.db
        .query("chapterInsightCache")
        .withIndex("by_ref", (q) =>
          q.eq("volume", entry.volume).eq("book", entry.book).eq("chapter", entry.chapter)
        )
        .unique();
      const payload = { ...entry, updatedAt };
      if (existing) await ctx.db.patch(existing._id, payload);
      else await ctx.db.insert("chapterInsightCache", payload);
    }
    return { ok: true, count: entries.length };
  },
});
