import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

const resourceTypeValidator = v.union(
  v.literal("verse"),
  v.literal("verse_range"),
  v.literal("chapter"),
  v.literal("chapter_range")
);

const coverageValidator = v.object({
  book: v.string(),
  bookEnd: v.optional(v.string()),
  bookOrder: v.optional(v.number()),
  bookEndOrder: v.optional(v.number()),
  resourceType: resourceTypeValidator,
  chapterStart: v.number(),
  chapterEnd: v.number(),
  verseStart: v.optional(v.number()),
  verseEnd: v.optional(v.number()),
});

type ResourceCoverage = {
  book: string;
  bookEnd?: string;
  bookOrder?: number;
  bookEndOrder?: number;
  resourceType: "verse" | "verse_range" | "chapter" | "chapter_range";
  chapterStart: number;
  chapterEnd: number;
  verseStart?: number;
  verseEnd?: number;
};

function normalizeCoverages(row: {
  book: string;
  bookEnd?: string;
  bookOrder?: number;
  bookEndOrder?: number;
  resourceType: ResourceCoverage["resourceType"];
  chapterStart: number;
  chapterEnd: number;
  verseStart?: number;
  verseEnd?: number;
  coverages?: ResourceCoverage[];
}): ResourceCoverage[] {
  if (Array.isArray(row.coverages) && row.coverages.length > 0) {
    return row.coverages;
  }

  return [
    {
      book: row.book,
      bookEnd: row.bookEnd,
      bookOrder: row.bookOrder,
      bookEndOrder: row.bookEndOrder,
      resourceType: row.resourceType,
      chapterStart: row.chapterStart,
      chapterEnd: row.chapterEnd,
      verseStart: row.verseStart,
      verseEnd: row.verseEnd,
    },
  ];
}

function selectionMatchesCoverage(
  args: {
    book: string;
    bookOrder?: number;
    chapter: number;
    verseStart: number;
    verseEnd: number;
  },
  coverage: ResourceCoverage
) {
  const rangeStartOrder = coverage.bookOrder ?? args.bookOrder ?? 0;
  const rangeEndOrder = coverage.bookEndOrder ?? coverage.bookOrder ?? rangeStartOrder;
  const currentOrder = args.bookOrder ?? 0;
  const matchesBook = coverage.book === args.book;
  const matchesCrossBook =
    typeof args.bookOrder === "number" &&
    typeof coverage.bookOrder === "number" &&
    currentOrder >= rangeStartOrder &&
    currentOrder <= rangeEndOrder;

  if (!matchesBook && !matchesCrossBook) return false;

  const isRangeStartBook = args.book === coverage.book || !matchesCrossBook || currentOrder === rangeStartOrder;
  const isRangeEndBook =
    args.book === (coverage.bookEnd ?? coverage.book) || !matchesCrossBook || currentOrder === rangeEndOrder;
  const chapterLowerBound = isRangeStartBook ? coverage.chapterStart : 1;
  const chapterUpperBound = isRangeEndBook ? coverage.chapterEnd : Number.POSITIVE_INFINITY;
  if (chapterLowerBound > args.chapter || chapterUpperBound < args.chapter) return false;

  if (coverage.resourceType === "chapter" || coverage.resourceType === "chapter_range") return true;
  if (coverage.book !== args.book) return false;
  if (typeof coverage.verseStart !== "number" || typeof coverage.verseEnd !== "number") return false;
  return coverage.verseStart <= args.verseEnd && coverage.verseEnd >= args.verseStart;
}

async function isAdminUser(ctx: any, clerkId: string): Promise<boolean> {
  const user = await ctx.db.query("users").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).unique();
  return user?.isAdmin === true;
}

export const listForSelection = query({
  args: {
    volume: v.string(),
    book: v.string(),
    bookOrder: v.optional(v.number()),
    chapter: v.number(),
    verseStart: v.number(),
    verseEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("scriptureResources")
      .withIndex("by_volume", (q: any) => q.eq("volume", args.volume))
      .collect();

    return rows
      .map((row) => {
        const normalized = normalizeCoverages(row);
        const matchedScopes = normalized.filter((coverage) => selectionMatchesCoverage(args, coverage));
        return matchedScopes.length > 0 ? { row, normalized, matchedScopes } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => b.row.updatedAt - a.row.updatedAt)
      .map(({ row, normalized, matchedScopes }) => {
        const coverages = normalized.map((coverage) => ({
          book: coverage.book,
          bookEnd: coverage.bookEnd ?? coverage.book,
          bookOrder: coverage.bookOrder,
          bookEndOrder: coverage.bookEndOrder,
          resourceType: coverage.resourceType,
          chapterStart: coverage.chapterStart,
          chapterEnd: coverage.chapterEnd,
          verseStart: coverage.verseStart ?? null,
          verseEnd: coverage.verseEnd ?? null,
        }));
        const matched = matchedScopes.map((coverage) => ({
          book: coverage.book,
          bookEnd: coverage.bookEnd ?? coverage.book,
          bookOrder: coverage.bookOrder,
          bookEndOrder: coverage.bookEndOrder,
          resourceType: coverage.resourceType,
          chapterStart: coverage.chapterStart,
          chapterEnd: coverage.chapterEnd,
          verseStart: coverage.verseStart ?? null,
          verseEnd: coverage.verseEnd ?? null,
        }));

        return {
          id: String(row._id),
          title: row.title,
          description: row.description ?? null,
          url: row.url ?? null,
          coverages,
          matchedScopes: matched,
        };
      });
  },
});

export const create = mutation({
  args: {
    volume: v.string(),
    book: v.optional(v.string()),
    bookEnd: v.optional(v.string()),
    bookOrder: v.optional(v.number()),
    bookEndOrder: v.optional(v.number()),
    resourceType: v.optional(resourceTypeValidator),
    coverages: v.optional(v.array(coverageValidator)),
    title: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    chapterStart: v.optional(v.number()),
    chapterEnd: v.optional(v.number()),
    verseStart: v.optional(v.number()),
    verseEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    if (!(await isAdminUser(ctx, clerkId))) {
      throw new Error("Only admins can add resources");
    }

    const coverages =
      args.coverages && args.coverages.length > 0
        ? args.coverages
        : args.book &&
            args.resourceType &&
            typeof args.chapterStart === "number" &&
            typeof args.chapterEnd === "number"
          ? [
              {
                book: args.book,
                bookEnd: args.bookEnd,
                bookOrder: args.bookOrder,
                bookEndOrder: args.bookEndOrder,
                resourceType: args.resourceType,
                chapterStart: args.chapterStart,
                chapterEnd: args.chapterEnd,
                verseStart: args.verseStart,
                verseEnd: args.verseEnd,
              },
            ]
          : [];

    if (coverages.length === 0) {
      throw new Error("At least one coverage selection is required");
    }

    const primaryCoverage = coverages[0];
    const now = Date.now();
    await ctx.db.insert("scriptureResources", {
      volume: args.volume,
      book: primaryCoverage.book,
      bookEnd: primaryCoverage.bookEnd,
      bookOrder: primaryCoverage.bookOrder,
      bookEndOrder: primaryCoverage.bookEndOrder,
      resourceType: primaryCoverage.resourceType,
      coverages,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      url: args.url?.trim() || undefined,
      chapterStart: primaryCoverage.chapterStart,
      chapterEnd: primaryCoverage.chapterEnd,
      verseStart: primaryCoverage.verseStart,
      verseEnd: primaryCoverage.verseEnd,
      createdByClerkId: clerkId,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true };
  },
});
