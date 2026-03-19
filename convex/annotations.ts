// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

async function maybeClerkId(ctx: any): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

function normalizeBody(body: string): string {
  return body.trim().replace(/\s+/g, " ");
}

export const getChapterAnnotations = query({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
  },
  handler: async (ctx, args) => {
    const viewerClerkId = await maybeClerkId(ctx);
    const rows = await ctx.db
      .query("verseAnnotations")
      .withIndex("by_chapter_verse", (q: any) =>
        q.eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter)
      )
      .collect();

    const byVerse: Record<number, Array<{
      id: string;
      verse: number;
      body: string;
      visibility: "private";
      highlight_color: "yellow" | "blue" | "green" | "pink" | "purple" | null;
      user_id: string;
      is_mine: boolean;
      created_at: string;
      updated_at: string;
    }>> = {};

    for (const row of rows) {
      const isMine = !!viewerClerkId && row.clerkId === viewerClerkId;
      if (!isMine) continue;
      const verseRows = byVerse[row.verse] ?? [];
      verseRows.push({
        id: row._id,
        verse: row.verse,
        body: row.body,
        visibility: "private",
        highlight_color: row.highlightColor ?? null,
        user_id: row.clerkId,
        is_mine: isMine,
        created_at: toIso(row.createdAt),
        updated_at: toIso(row.updatedAt),
      });
      byVerse[row.verse] = verseRows;
    }

    for (const verseRows of Object.values(byVerse)) {
      verseRows.sort((a, b) => {
        if (a.is_mine && !b.is_mine) return -1;
        if (!a.is_mine && b.is_mine) return 1;
        return a.updated_at < b.updated_at ? 1 : -1;
      });
    }

    return { by_verse: byVerse };
  },
});

export const upsertVerseAnnotation = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verse: v.number(),
    body: v.string(),
    highlightColor: v.optional(
      v.union(
        v.literal("yellow"),
        v.literal("blue"),
        v.literal("green"),
        v.literal("pink"),
        v.literal("purple")
      )
    ),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const body = normalizeBody(args.body);
    if (!body) throw new Error("Annotation text is required");
    if (body.length > 1200) throw new Error("Annotation text is too long");
    const existing = await ctx.db
      .query("verseAnnotations")
      .withIndex("by_user_verse", (q: any) =>
        q
          .eq("clerkId", clerkId)
          .eq("volume", args.volume)
          .eq("book", args.book)
          .eq("chapter", args.chapter)
          .eq("verse", args.verse)
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        body,
        visibility: "private",
        highlightColor: args.highlightColor,
        updatedAt: now,
      });
      return { id: existing._id };
    }
    const id = await ctx.db.insert("verseAnnotations", {
      clerkId,
      volume: args.volume,
      book: args.book,
      chapter: args.chapter,
      verse: args.verse,
      body,
      visibility: "private",
      highlightColor: args.highlightColor,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const deleteVerseAnnotation = mutation({
  args: {
    annotationId: v.id("verseAnnotations"),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const row = await ctx.db.get(args.annotationId);
    if (!row || row.clerkId !== clerkId) throw new Error("Annotation not found");
    await ctx.db.delete(args.annotationId);
    return { ok: true };
  },
});
