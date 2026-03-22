import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

function isAdminClerkId(clerkId: string): boolean {
  const raw = process.env.ADMIN_CLERK_IDS ?? "";
  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return ids.includes(clerkId);
}

export const listForSelection = query({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verseStart: v.number(),
    verseEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("scriptureResources")
      .withIndex("by_volume_book", (q: any) => q.eq("volume", args.volume).eq("book", args.book))
      .collect();

    return rows
      .filter((row) => {
        if (row.chapterStart > args.chapter || row.chapterEnd < args.chapter) return false;
        if (row.resourceType === "chapter" || row.resourceType === "chapter_range") return true;
        if (typeof row.verseStart !== "number" || typeof row.verseEnd !== "number") return false;
        return row.verseStart <= args.verseEnd && row.verseEnd >= args.verseStart;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        id: String(row._id),
        resourceType: row.resourceType,
        title: row.title,
        description: row.description ?? null,
        url: row.url ?? null,
        chapterStart: row.chapterStart,
        chapterEnd: row.chapterEnd,
        verseStart: row.verseStart ?? null,
        verseEnd: row.verseEnd ?? null,
      }));
  },
});

export const create = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    resourceType: v.union(v.literal("verse"), v.literal("verse_range"), v.literal("chapter"), v.literal("chapter_range")),
    title: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    chapterStart: v.number(),
    chapterEnd: v.number(),
    verseStart: v.optional(v.number()),
    verseEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    if (!isAdminClerkId(clerkId)) {
      throw new Error("Only admins can add resources");
    }

    const now = Date.now();
    await ctx.db.insert("scriptureResources", {
      volume: args.volume,
      book: args.book,
      resourceType: args.resourceType,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      url: args.url?.trim() || undefined,
      chapterStart: args.chapterStart,
      chapterEnd: args.chapterEnd,
      verseStart: args.verseStart,
      verseEnd: args.verseEnd,
      createdByClerkId: clerkId,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true };
  },
});
