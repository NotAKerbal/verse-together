// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";
import {
  annotationProblem,
  GUIDE_HIGHLIGHTS_PER_GUIDE,
  GUIDE_KEY_PATTERN,
  guideHighlightProblem,
  normalizeAnnotationBody,
  sameGuideAnchor,
} from "./annotationRules";

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

async function maybeClerkId(ctx: any): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
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
    // A note, a highlight, or both; a highlight alone is stored with an empty body.
    const problem = annotationProblem(args.body, args.highlightColor);
    if (problem) throw new Error(problem);
    const body = normalizeAnnotationBody(args.body);
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

// Study-guide highlights: private spans of a Come, Follow Me guide's prose (anchors: convex/annotationRules.ts).

const guideHighlightColor = v.union(
  v.literal("yellow"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("pink"),
  v.literal("purple")
);

/** The viewer's own highlights in one guide; nothing at all for a signed-out viewer. */
export const getGuideHighlights = query({
  args: { guide: v.string() },
  handler: async (ctx, args) => {
    const viewerClerkId = await maybeClerkId(ctx);
    if (!viewerClerkId || !GUIDE_KEY_PATTERN.test(args.guide)) return [];
    const rows = await ctx.db
      .query("guideHighlights")
      .withIndex("by_user_guide", (q) => q.eq("clerkId", viewerClerkId).eq("guide", args.guide))
      .collect();
    return rows.map((row) => ({
      id: row._id,
      guide: row.guide,
      part: row.part,
      startBlock: row.startBlock,
      startOffset: row.startOffset,
      endBlock: row.endBlock,
      endOffset: row.endOffset,
      exact: row.exact,
      prefix: row.prefix,
      suffix: row.suffix,
      highlightColor: row.highlightColor,
      updatedAt: toIso(row.updatedAt),
    }));
  },
});

/** Highlight a span; highlighting the same span again changes its color instead of adding a second one. */
export const saveGuideHighlight = mutation({
  args: {
    guide: v.string(),
    part: v.union(v.literal("introduction"), v.literal("reader")),
    startBlock: v.string(),
    startOffset: v.number(),
    endBlock: v.string(),
    endOffset: v.number(),
    exact: v.string(),
    prefix: v.string(),
    suffix: v.string(),
    highlightColor: guideHighlightColor,
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const problem = guideHighlightProblem(args);
    if (problem) throw new Error(problem);
    const rows = await ctx.db
      .query("guideHighlights")
      .withIndex("by_user_guide", (q) => q.eq("clerkId", clerkId).eq("guide", args.guide))
      .collect();
    const now = Date.now();
    const existing = rows.find((row) => sameGuideAnchor(row, args));
    if (existing) {
      await ctx.db.patch(existing._id, { highlightColor: args.highlightColor, updatedAt: now });
      return { id: existing._id };
    }
    if (rows.length >= GUIDE_HIGHLIGHTS_PER_GUIDE) throw new Error("Too many highlights in this guide");
    const id = await ctx.db.insert("guideHighlights", { clerkId, ...args, createdAt: now, updatedAt: now });
    return { id };
  },
});

/** Change one of the viewer's guide highlights to another color. */
export const updateGuideHighlight = mutation({
  args: { highlightId: v.id("guideHighlights"), highlightColor: guideHighlightColor },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const row = await ctx.db.get(args.highlightId);
    if (!row || row.clerkId !== clerkId) throw new Error("Highlight not found");
    await ctx.db.patch(args.highlightId, { highlightColor: args.highlightColor, updatedAt: Date.now() });
    return { id: args.highlightId };
  },
});

/** Remove one of the viewer's guide highlights. */
export const deleteGuideHighlight = mutation({
  args: { highlightId: v.id("guideHighlights") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const row = await ctx.db.get(args.highlightId);
    if (!row || row.clerkId !== clerkId) throw new Error("Highlight not found");
    await ctx.db.delete(args.highlightId);
    return { ok: true };
  },
});
