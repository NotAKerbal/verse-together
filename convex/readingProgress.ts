import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireClerkId } from "./utils";
import { normalizeScriptureVolume } from "../src/lib/scriptureVolumes";
import {
  isJournalDate,
  journalDateFromTimestamp,
  normalizeNoteSource,
  noteSourceValidator,
  requestIdProblem,
  scriptureSource,
  type NoteSource,
} from "./noteJournal";

const chapterRefArgs = {
  volume: v.string(),
  book: v.string(),
  chapter: v.number(),
};

type ReadingLogEntry = {
  id: string;
  kind: "log" | "legacy_chapter_read";
  origin: "chapter_mark" | "manual" | "legacy";
  source: NoteSource;
  journal_date: string;
  read_at: string;
  created_at: string;
  request_id: string | null;
};

function assertJournalDate(journalDate: string) {
  if (!isJournalDate(journalDate)) throw new Error("Journal date must be a real YYYY-MM-DD date");
}

function assertRequestId(requestId: string) {
  const problem = requestIdProblem(requestId);
  if (problem) throw new Error(problem);
}

async function findLogByRequest(ctx: MutationCtx, clerkId: string, requestId: string) {
  return await ctx.db
    .query("readingLogs")
    .withIndex("by_clerk_request", (q) => q.eq("clerkId", clerkId).eq("requestId", requestId))
    .first();
}

function looseBookKey(book: string): string {
  return book.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sameChapter(source: NoteSource, row: Doc<"chapterReads">): boolean {
  return (
    source.kind === "scripture" &&
    source.volume !== undefined &&
    source.book !== undefined &&
    source.chapter === row.chapter &&
    normalizeScriptureVolume(source.volume) === normalizeScriptureVolume(row.volume) &&
    looseBookKey(source.book) === looseBookKey(row.book)
  );
}

/**
 * Before a chapterReads row is overwritten or deleted, keeps its read in the history as a chapter-mark log
 * unless a chapter mark already covers it (the same rule listMyReadingLog uses for legacy entries). The
 * requestId is derived from the row and its readAt, so the same old read is never snapshotted twice.
 */
async function preserveLegacyChapterRead(ctx: MutationCtx, clerkId: string, row: Doc<"chapterReads">) {
  const logs = await ctx.db
    .query("readingLogs")
    .withIndex("by_clerk_day", (q) => q.eq("clerkId", clerkId))
    .collect();
  const covered = logs.some(
    (log) => log.origin === "chapter_mark" && log.readAt >= row.readAt && sameChapter(log.source, row)
  );
  if (covered) return;
  const requestId = `legacy-chapter-read:${row._id}:${row.readAt}`;
  if (await findLogByRequest(ctx, clerkId, requestId)) return;
  await ctx.db.insert("readingLogs", {
    clerkId,
    source: scriptureSource({ volume: row.volume, book: row.book, chapter: row.chapter }),
    journalDate: journalDateFromTimestamp(row.readAt),
    readAt: row.readAt,
    createdAt: Date.now(),
    requestId,
    origin: "chapter_mark",
  });
}

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

/**
 * Marks a whole chapter complete (latest read time per chapter, as before). With a requestId it also appends
 * one reading-history entry; a retry with the same requestId changes nothing and returns the earlier result.
 */
export const markChapterRead = mutation({
  args: { ...chapterRefArgs, journalDate: v.optional(v.string()), requestId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    assertChapterRef(args);
    if (args.journalDate !== undefined) {
      assertJournalDate(args.journalDate);
      if (args.requestId === undefined) throw new Error("A request id is required to log reading history");
    }
    if (args.requestId !== undefined) assertRequestId(args.requestId);

    const existing = await ctx.db
      .query("chapterReads")
      .withIndex("by_user_chapter", (q) =>
        q.eq("clerkId", clerkId).eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter)
      )
      .unique();

    if (args.requestId !== undefined) {
      const logged = await findLogByRequest(ctx, clerkId, args.requestId);
      if (logged) {
        // A retry: the first attempt already marked and logged; don't bump readAt or re-mark after an unmark.
        return { id: existing?._id ?? null, logId: logged._id, duplicate: true };
      }
    }

    const now = Date.now();
    let id: Id<"chapterReads">;
    if (existing) {
      await preserveLegacyChapterRead(ctx, clerkId, existing);
      await ctx.db.patch(existing._id, { readAt: now });
      id = existing._id;
    } else {
      id = await ctx.db.insert("chapterReads", {
        clerkId,
        volume: args.volume,
        book: args.book,
        chapter: args.chapter,
        readAt: now,
      });
    }
    if (args.requestId === undefined) return { id };

    const logId = await ctx.db.insert("readingLogs", {
      clerkId,
      source: scriptureSource({ volume: args.volume, book: args.book, chapter: args.chapter }),
      journalDate: args.journalDate ?? journalDateFromTimestamp(now),
      readAt: now,
      createdAt: now,
      requestId: args.requestId,
      origin: "chapter_mark",
    });
    return { id, logId, duplicate: false };
  },
});

/**
 * Records a reading (a guide, a page, or part of a chapter) in the history without marking any chapter
 * complete. Idempotent per requestId.
 */
export const logReading = mutation({
  args: { source: noteSourceValidator, journalDate: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    assertJournalDate(args.journalDate);
    assertRequestId(args.requestId);
    const source = normalizeNoteSource(args.source);
    const logged = await findLogByRequest(ctx, clerkId, args.requestId);
    if (logged) return { id: logged._id, duplicate: true };
    const now = Date.now();
    const id = await ctx.db.insert("readingLogs", {
      clerkId,
      source,
      journalDate: args.journalDate,
      readAt: now,
      createdAt: now,
      requestId: args.requestId,
      origin: "manual",
    });
    return { id, duplicate: false };
  },
});

/**
 * The signed-in user's reading history, newest first. A chapter's chapterReads row (its latest completion)
 * is included as a legacy entry unless a logged chapter mark already covers that read; earlier rereads that
 * were never logged are not invented.
 */
export const listMyReadingLog = query({
  args: {},
  handler: async (ctx): Promise<ReadingLogEntry[]> => {
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return [];
    const logs = await ctx.db
      .query("readingLogs")
      .withIndex("by_clerk_day", (q) => q.eq("clerkId", clerkId))
      .collect();
    const chapterReads = await ctx.db
      .query("chapterReads")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .collect();

    const entries: ReadingLogEntry[] = logs.map((row) => ({
      id: row._id,
      kind: "log",
      origin: row.origin,
      source: row.source,
      journal_date: row.journalDate,
      read_at: new Date(row.readAt).toISOString(),
      created_at: new Date(row.createdAt).toISOString(),
      request_id: row.requestId,
    }));

    const chapterMarks = logs.filter((row) => row.origin === "chapter_mark");
    for (const row of chapterReads) {
      const covered = chapterMarks.some((log) => log.readAt >= row.readAt && sameChapter(log.source, row));
      if (covered) continue;
      entries.push({
        id: row._id,
        kind: "legacy_chapter_read",
        origin: "legacy",
        source: scriptureSource({ volume: row.volume, book: row.book, chapter: row.chapter }),
        journal_date: journalDateFromTimestamp(row.readAt),
        read_at: new Date(row.readAt).toISOString(),
        created_at: new Date(row.readAt).toISOString(),
        request_id: null,
      });
    }

    entries.sort((a, b) => {
      if (a.journal_date !== b.journal_date) return a.journal_date < b.journal_date ? 1 : -1;
      return a.read_at < b.read_at ? 1 : a.read_at > b.read_at ? -1 : 0;
    });
    return entries;
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
    if (existing) {
      await preserveLegacyChapterRead(ctx, clerkId, existing);
      await ctx.db.delete(existing._id);
    }
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
