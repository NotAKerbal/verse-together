// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

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
      .withIndex("by_ref", (q: any) => q.eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter))
      .unique();
  },
});

export const upsertChapterInsight = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    reference: v.string(),
    scriptureHash: v.string(),
    promptVersion: v.number(),
    paths: v.array(insightPath),
    generatedAt: v.number(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    await requireClerkId(ctx);
    const existing = await ctx.db
      .query("chapterInsightCache")
      .withIndex("by_ref", (q: any) => q.eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter))
      .unique();
    const payload = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ok: true };
    }
    await ctx.db.insert("chapterInsightCache", payload);
    return { ok: true };
  },
});

export const upsertChapterInsightBatch = mutation({
  args: { entries: v.array(chapterInsightEntry) },
  handler: async (ctx, { entries }) => {
    await requireClerkId(ctx);
    const updatedAt = Date.now();
    for (const entry of entries) {
      const existing = await ctx.db
        .query("chapterInsightCache")
        .withIndex("by_ref", (q: any) =>
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
