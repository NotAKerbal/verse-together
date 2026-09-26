import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireClerkId } from "./utils";

const chapterRefArgs = {
  volume: v.string(),
  book: v.string(),
  chapter: v.number(),
};

async function maybeClerkId(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

function assertChapterRef(args: { volume: string; book: string; chapter: number }) {
  if (!args.volume.trim() || !args.book.trim()) throw new Error("A volume and book are required");
  if (!Number.isInteger(args.chapter) || args.chapter < 1) throw new Error("Chapter must be a positive whole number");
}

export const getMyProgressForBook = query({
  args: { volume: v.string(), book: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return null;
    const rows = await ctx.db
      .query("chapterReads")
      .withIndex("by_user_book", (q) => q.eq("clerkId", clerkId).eq("volume", args.volume).eq("book", args.book))
      .collect();
    const position = await ctx.db
      .query("lastReadingPositions")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    let latestReadChapter: number | null = null;
    let latestReadAt = -Infinity;
    for (const row of rows) {
      if (row.readAt > latestReadAt) {
        latestReadAt = row.readAt;
        latestReadChapter = row.chapter;
      }
    }
    const currentChapter =
      position && position.volume === args.volume && position.book === args.book ? position.chapter : null;

    return {
      readChapters: rows.map((row) => row.chapter).sort((a, b) => a - b),
      latestReadChapter,
      currentChapter,
    };
  },
});

export const getMyProgressForVolume = query({
  args: { volume: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return null;
    const rows = await ctx.db
      .query("chapterReads")
      .withIndex("by_user_volume", (q) => q.eq("clerkId", clerkId).eq("volume", args.volume))
      .collect();
    const readCountByBook: Record<string, number> = {};
    for (const row of rows) {
      readCountByBook[row.book] = (readCountByBook[row.book] ?? 0) + 1;
    }
    return { readCountByBook };
  },
});

export const getLastPosition = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return null;
    const row = await ctx.db
      .query("lastReadingPositions")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!row) return null;
    return {
      volume: row.volume,
      book: row.book,
      chapter: row.chapter,
      verse: row.verse ?? null,
      updatedAt: row.updatedAt,
    };
  },
});

export const markChapterRead = mutation({
  args: chapterRefArgs,
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    assertChapterRef(args);
    const existing = await ctx.db
      .query("chapterReads")
      .withIndex("by_user_chapter", (q) =>
        q.eq("clerkId", clerkId).eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter)
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { readAt: now });
      return { id: existing._id };
    }
    const id = await ctx.db.insert("chapterReads", {
      clerkId,
      volume: args.volume,
      book: args.book,
      chapter: args.chapter,
      readAt: now,
    });
    return { id };
  },
});

export const unmarkChapterRead = mutation({
  args: chapterRefArgs,
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const existing = await ctx.db
      .query("chapterReads")
      .withIndex("by_user_chapter", (q) =>
        q.eq("clerkId", clerkId).eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter)
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const setLastPosition = mutation({
  args: { ...chapterRefArgs, verse: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    assertChapterRef(args);
    const verse = args.verse !== undefined && Number.isInteger(args.verse) && args.verse >= 1 ? args.verse : undefined;
    const now = Date.now();
    const existing = await ctx.db
      .query("lastReadingPositions")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    const payload = {
      volume: args.volume,
      book: args.book,
      chapter: args.chapter,
      verse,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ok: true };
    }
    await ctx.db.insert("lastReadingPositions", { clerkId, ...payload });
    return { ok: true };
  },
});
