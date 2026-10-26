// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewerClerkId, requireClerkId } from "./utils";
import {
  annotationProblem,
  applyVerseMarks,
  nextUnderlineColor,
  savedUnderlineColor,
  underlineProblem,
  verseMarksProblem,
  GUIDE_HIGHLIGHTS_PER_GUIDE,
  GUIDE_KEY_PATTERN,
  guideHighlightProblem,
  normalizeAnnotationBody,
  sameGuideAnchor,
} from "./annotationRules";
import { markColorValidator } from "./markValidators";

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

async function maybeClerkId(ctx: any): Promise<string | null> {
  return await getViewerClerkId(ctx);
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
      highlight_color: "red" | "yellow" | "blue" | "green" | "pink" | "purple" | null;
      underline: boolean;
      underline_color: "red" | "yellow" | "blue" | "green" | "pink" | "purple" | null;
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
        underline: row.underline === true,
        // Null when not underlined; an underline saved before underlines had colors is red.
        underline_color: savedUnderlineColor(row),
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
    highlightColor: v.optional(markColorValidator),
    // Omitted by clients from before underlines existed: an update then keeps the verse's saved underline.
    underline: v.optional(v.boolean()),
    // Omitted by clients from before underlines had colors: an update then keeps the saved underline's color
    // (an added underline is red). Naming a color underlines the verse in it.
    underlineColor: v.optional(markColorValidator),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const existing = await ctx.db
      .query("verseAnnotations")
      .withIndex("by_user_verse", (q) =>
        q
          .eq("clerkId", clerkId)
          .eq("volume", args.volume)
          .eq("book", args.book)
          .eq("chapter", args.chapter)
          .eq("verse", args.verse)
      )
      .unique();
    const conflict = underlineProblem(args);
    if (conflict) throw new Error(conflict);
    const underlineColor = nextUnderlineColor(existing, args) ?? undefined;
    const underline = underlineColor !== undefined;
    // Any mix of a note, a highlight, and an underline; a mark alone is stored with an empty body.
    const problem = annotationProblem(args.body, args.highlightColor, underline);
    if (problem) throw new Error(problem);
    const body = normalizeAnnotationBody(args.body);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        body,
        visibility: "private",
        highlightColor: args.highlightColor,
        // Stored only when true; patching undefined removes the field.
        underline: underline || undefined,
        underlineColor,
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
      underline: underline || undefined,
      underlineColor,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

/**
 * Quick marks from the selection menu: set or remove a highlight and/or an underline (in a color) on each
 * selected verse in one transaction. Only the named marks change; each verse's note (and any mark not named)
 * stays exactly as saved, so a stale client can't overwrite a note, and changing an underline's color never
 * touches the highlight. A verse left with no note and no mark has its row removed.
 */
export const setVerseMarks = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verses: v.array(v.number()),
    // Omitted: leave each verse's highlight as it is. Null: remove it.
    highlightColor: v.optional(v.union(v.null(), markColorValidator)),
    // False: remove each verse's underline. True (callers from before underlines had colors): underline each
    // verse, keeping a saved underline's color, or red.
    underline: v.optional(v.boolean()),
    // Underline each verse in this color (adding it, or changing a saved underline's color).
    underlineColor: v.optional(markColorValidator),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const verses = Array.from(new Set(args.verses));
    const patch = { highlightColor: args.highlightColor, underline: args.underline, underlineColor: args.underlineColor };
    const problem = verseMarksProblem(verses, patch);
    if (problem) throw new Error(problem);
    const now = Date.now();
    let changed = 0;
    for (const verse of verses) {
      const existing = await ctx.db
        .query("verseAnnotations")
        .withIndex("by_user_verse", (q: any) =>
          q
            .eq("clerkId", clerkId)
            .eq("volume", args.volume)
            .eq("book", args.book)
            .eq("chapter", args.chapter)
            .eq("verse", verse)
        )
        .unique();
      const next = applyVerseMarks(existing, patch);
      if (existing) {
        if (!next.keep) {
          await ctx.db.delete(existing._id);
          changed += 1;
        } else if (
          (existing.highlightColor ?? undefined) !== next.highlightColor ||
          (savedUnderlineColor(existing) ?? undefined) !== next.underlineColor
        ) {
          // Patching undefined removes a field: no highlight, or no underline (and so no color), is its absence.
          await ctx.db.patch(existing._id, {
            highlightColor: next.highlightColor,
            underline: next.underline || undefined,
            underlineColor: next.underlineColor,
            updatedAt: now,
          });
          changed += 1;
        }
      } else if (next.keep) {
        await ctx.db.insert("verseAnnotations", {
          clerkId,
          volume: args.volume,
          book: args.book,
          chapter: args.chapter,
          verse,
          body: "",
          visibility: "private",
          highlightColor: next.highlightColor,
          underline: next.underline || undefined,
          underlineColor: next.underlineColor,
          createdAt: now,
          updatedAt: now,
        });
        changed += 1;
      }
    }
    return { changed };
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
