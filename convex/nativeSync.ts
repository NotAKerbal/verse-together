import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { getViewerClerkId } from "./utils";
import {
  ANNOTATION_BODY_MAX,
  markColorsProblem,
  normalizeAnnotationBody,
  savedUnderlineColor,
  textMarksProblem,
} from "./annotationRules";
import { markColorValidator, verseTextMarkValidator } from "./markValidators";
import {
  chapterReadHistoryKey,
  deriveNoteTitle,
  isJournalDate,
  journalDateFromTimestamp,
  normalizeNoteSource,
  NOTE_MARKDOWN_MAX,
  noteSourceValidator,
  readingLogHistoryKey,
} from "./noteJournal";

// Production redacts plain errors to "Server Error", so everything the app must tell apart carries a code.
async function requireClerkId(ctx: MutationCtx): Promise<string> {
  const clerkId = await getViewerClerkId(ctx);
  if (!clerkId) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in again to keep syncing" });
  return clerkId;
}

/*
  Sync for the desktop app (native/src/sync.rs). The app keeps its own copy of the account's study and sends what
  changed on it since the last sync. Each call here applies exactly one item, completely or not at all (a Convex
  mutation is one transaction), and changes only the fields the app says it changed, so:
   - a highlight made in the app never overwrites a verse note written on the website (or the reverse),
   - clearing a note or the last mark in the app removes it on the account, and
   - a lost reply is safe to retry: sending the same state again leaves the same result.
  Notes keep the website's revision check: text based on an older revision is refused (REVISION_CONFLICT) and the
  app keeps both copies.
*/

/** One verse's state from the app: its marks (replaced as a whole), its note (replaced), or both. */
export const applyVerse = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verse: v.number(),
    marks: v.optional(
      v.object({
        highlightColor: v.union(v.null(), markColorValidator),
        underlineColor: v.union(v.null(), markColorValidator),
        textMarks: v.array(verseTextMarkValidator),
      })
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    if (!args.volume.trim() || !args.book.trim() || !Number.isInteger(args.chapter) || args.chapter < 1) {
      throw new ConvexError({ code: "INVALID", message: "Unknown chapter" });
    }
    if (!Number.isInteger(args.verse) || args.verse < 1 || args.verse > 1000) {
      throw new ConvexError({ code: "INVALID", message: "Unknown verse" });
    }
    if (args.marks === undefined && args.note === undefined) {
      throw new ConvexError({ code: "INVALID", message: "Nothing to change" });
    }
    const existing = await ctx.db
      .query("verseAnnotations")
      .withIndex("by_user_verse", (q) =>
        q.eq("clerkId", clerkId).eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter).eq("verse", args.verse)
      )
      .unique();
    const highlightColor = args.marks ? args.marks.highlightColor : existing?.highlightColor ?? null;
    const underlineColor = args.marks ? args.marks.underlineColor : savedUnderlineColor(existing);
    const textMarks = args.marks ? args.marks.textMarks : existing?.textMarks ?? [];
    const body = args.note !== undefined ? normalizeAnnotationBody(args.note) : existing?.body ?? "";
    const problem = markColorsProblem(highlightColor, underlineColor) ?? textMarksProblem(textMarks);
    if (problem) throw new ConvexError({ code: "INVALID", message: problem });
    if (body.length > ANNOTATION_BODY_MAX) throw new ConvexError({ code: "INVALID", message: "Annotation text is too long" });

    const now = Date.now();
    const keep = !!body || !!highlightColor || !!underlineColor || textMarks.length > 0;
    if (!keep) {
      if (existing) await ctx.db.delete(existing._id);
      return { removed: true, updatedAt: now };
    }
    // Patching undefined removes a field: no highlight, or no underline (and so no color), is its absence.
    const fields = {
      body,
      visibility: "private" as const,
      textMarks: textMarks.length ? textMarks : undefined,
      highlightColor: highlightColor ?? undefined,
      underline: underlineColor ? true : undefined,
      underlineColor: underlineColor ?? undefined,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("verseAnnotations", {
        clerkId,
        volume: args.volume,
        book: args.book,
        chapter: args.chapter,
        verse: args.verse,
        createdAt: now,
        ...fields,
      });
    }
    return { removed: false, updatedAt: now };
  },
});

/**
 * An existing journal note's changes from the app, in one transaction: its Markdown (checked against the revision
 * the app's copy is based on), and its day, source and whether it logs reading. Omitted parts are left as they are.
 */
export const saveJournalNote = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    markdownBody: v.optional(v.string()),
    expectedRevision: v.optional(v.number()),
    journalDate: v.optional(v.string()),
    source: v.optional(v.union(v.null(), noteSourceValidator)),
    logged: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.clerkId !== clerkId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "This note isn't in your journal any more" });
    }
    if (draft.status !== "draft") {
      throw new ConvexError({ code: "READ_ONLY", message: "Published notes can't be edited" });
    }
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now, lastActiveAt: now };
    let revision = draft.markdownRevision ?? 0;
    let markdown = typeof draft.markdownBody === "string" ? draft.markdownBody : null;
    if (args.markdownBody !== undefined) {
      if (args.markdownBody.length > NOTE_MARKDOWN_MAX) throw new ConvexError({ code: "INVALID", message: "This note is too long" });
      if (args.expectedRevision === undefined || args.expectedRevision !== revision) {
        throw new ConvexError({ code: "REVISION_CONFLICT", message: "This note changed since it was opened", currentRevision: revision });
      }
      revision += 1;
      markdown = args.markdownBody;
      Object.assign(patch, { markdownBody: markdown, markdownRevision: revision, title: deriveNoteTitle(markdown) });
    }
    if (args.journalDate !== undefined) {
      if (!isJournalDate(args.journalDate)) throw new ConvexError({ code: "INVALID", message: "Choose a valid day" });
      patch.journalDate = args.journalDate;
    } else if (!draft.journalDate) {
      patch.journalDate = journalDateFromTimestamp(draft.createdAt);
    }
    const source = args.source === undefined ? draft.source : args.source === null ? undefined : normalizeNoteSource(args.source);
    if (args.source !== undefined) patch.source = source;
    if (args.logged !== undefined) {
      if (args.logged && !source) throw new ConvexError({ code: "INVALID", message: "This entry has no reading source" });
      patch.readingAt = args.logged ? draft.readingAt ?? now : undefined;
    }
    const logged = args.logged ?? draft.readingAt !== undefined;
    if (!logged && markdown !== null && !markdown.trim()) {
      throw new ConvexError({ code: "INVALID", message: "Add a note or log reading" });
    }
    await ctx.db.patch(draft._id, patch);
    return { markdownRevision: revision, updatedAt: new Date(now).toISOString() };
  },
});

/** Deletes a journal note, as insights:deleteDraft does. A note that is already gone is not an error. */
export const deleteJournalNote = mutation({
  args: { draftId: v.id("insightDrafts") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.clerkId !== clerkId) return { deleted: false };
    if (draft.status === "published") throw new ConvexError({ code: "READ_ONLY", message: "Published notes can't be deleted" });
    const blocks = await ctx.db.query("insightDraftBlocks").withIndex("by_draft", (q) => q.eq("draftId", args.draftId)).collect();
    for (const block of blocks) await ctx.db.delete(block._id);
    const folder = await ctx.db
      .query("noteFolderAssignments")
      .withIndex("by_clerk_draft", (q) => q.eq("clerkId", clerkId).eq("draftId", args.draftId))
      .unique();
    if (folder) await ctx.db.delete(folder._id);
    // A late retry of its create, or the reading it was opened from, must not bring it back.
    for (const key of new Set([draft.entryRequestId, draft.readingHistoryKey].filter((k): k is string => !!k))) {
      await tombstone(ctx, clerkId, key);
    }
    await ctx.db.delete(args.draftId);
    return { deleted: true };
  },
});

async function tombstone(ctx: MutationCtx, clerkId: string, key: string) {
  const existing = await ctx.db
    .query("journalEntryDeletions")
    .withIndex("by_clerk_key", (q) => q.eq("clerkId", clerkId).eq("key", key))
    .first();
  if (!existing) await ctx.db.insert("journalEntryDeletions", { clerkId, key, deletedAt: Date.now() });
}

/**
 * Removes a reading from the history, as opening it as an entry and deleting that entry does on the website: the
 * reading row itself stays for chapter progress and plans, and listMyReadingLog stops listing it.
 */
export const removeReading = mutation({
  args: { readingId: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const id = ctx.db.normalizeId("readingLogs", args.readingId) ?? ctx.db.normalizeId("chapterReads", args.readingId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.clerkId !== clerkId) return { removed: false };
    const key = "requestId" in row ? readingLogHistoryKey(row) : chapterReadHistoryKey(row);
    const entry = await ctx.db
      .query("insightDrafts")
      .withIndex("by_clerk_entry_request", (q) => q.eq("clerkId", clerkId).eq("entryRequestId", key))
      .first();
    if (entry && entry.status !== "published") {
      const folder = await ctx.db
        .query("noteFolderAssignments")
        .withIndex("by_clerk_draft", (q) => q.eq("clerkId", clerkId).eq("draftId", entry._id))
        .unique();
      if (folder) await ctx.db.delete(folder._id);
      await ctx.db.delete(entry._id);
    }
    await tombstone(ctx, clerkId, key);
    return { removed: true };
  },
});
