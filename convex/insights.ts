// @ts-nocheck
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getViewerClerkId, requireClerkId } from "./utils";
import {
  appendMarkdownChunk,
  blocksToMarkdown,
  blockToMarkdown,
  DEFAULT_NOTE_TITLE,
  deriveNoteTitle,
  inferSourceFromBlocks,
  isJournalDate,
  journalDateFromTimestamp,
  markdownExcerpt,
  normalizeNoteSource,
  NOTE_MARKDOWN_MAX,
  noteSourceValidator,
  chapterReadHistoryKey,
  entryContentFingerprint,
  isHistoryKey,
  readingLogHistoryKey,
  requestIdProblem,
  scriptureSource,
} from "./noteJournal";

import { scriptureLinksForChapter } from "./noteScriptureLinks";

const insightBlockType = v.union(v.literal("scripture"), v.literal("text"), v.literal("quote"), v.literal("dictionary"));
const insightVisibility = v.union(
  v.literal("private"),
  v.literal("friends"),
  v.literal("link"),
  v.literal("public")
);
const scriptureRefValidator = v.object({
  volume: v.string(),
  book: v.string(),
  chapter: v.number(),
  verseStart: v.number(),
  verseEnd: v.number(),
  reference: v.string(),
});
const dictionaryMetaValidator = v.object({
  edition: v.union(v.literal("1828"), v.literal("1844"), v.literal("1913"), v.literal("ETY")),
  word: v.string(),
  heading: v.optional(v.string()),
  pronounce: v.optional(v.string()),
});

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

// Whether an entry logs reading. Owner read paths only: shared and published views never include it.
function readingAtIso(draft: { readingAt?: number }): string | null {
  return draft.readingAt === undefined ? null : toIso(draft.readingAt);
}

async function findEntryByKey(ctx: QueryCtx, clerkId: string, key: string) {
  return await ctx.db
    .query("insightDrafts")
    .withIndex("by_clerk_entry_request", (q) => q.eq("clerkId", clerkId).eq("entryRequestId", key))
    .first();
}

async function wasEntryDeleted(ctx: QueryCtx, clerkId: string, key: string): Promise<boolean> {
  const row = await ctx.db
    .query("journalEntryDeletions")
    .withIndex("by_clerk_key", (q) => q.eq("clerkId", clerkId).eq("key", key))
    .first();
  return row !== null;
}

// A short preview of the first text block, for note lists.
function draftExcerpt(blocks: any[]): string | null {
  const first = blocks.find((b) => b.type === "text" && (b.text ?? "").trim());
  if (!first) return null;
  const text = String(first.text).replace(/\s+/g, " ").trim();
  return text.length > 220 ? `${text.slice(0, 220).trimEnd()}...` : text;
}

// Distinct scripture references in block order, for reference chips and sorting.
function draftScriptureRefs(blocks: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const reference = block.scriptureRef?.reference?.trim();
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    out.push(reference);
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.slice(0, 20);
}

async function maybeClerkId(ctx: any): Promise<string | null> {
  return await getViewerClerkId(ctx);
}

async function areFriends(ctx: any, a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const outgoing = await ctx.db
    .query("friendships")
    .withIndex("by_requester", (q: any) => q.eq("requesterClerkId", a))
    .collect();
  if (outgoing.some((f: any) => f.addresseeClerkId === b && f.status === "accepted")) return true;
  const incoming = await ctx.db
    .query("friendships")
    .withIndex("by_addressee", (q: any) => q.eq("addresseeClerkId", a))
    .collect();
  return incoming.some((f: any) => f.requesterClerkId === b && f.status === "accepted");
}

async function canViewInsight(ctx: any, insight: any, viewerClerkId: string | null, allowLink: boolean): Promise<boolean> {
  if (viewerClerkId && viewerClerkId === insight.clerkId) return true;
  if (insight.visibility === "public") return true;
  if (insight.visibility === "link") return allowLink;
  if (insight.visibility === "friends") {
    if (!viewerClerkId) return false;
    return await areFriends(ctx, viewerClerkId, insight.clerkId);
  }
  return false;
}

async function getDraftOrThrow(ctx: any, draftId: any, clerkId: string) {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.clerkId !== clerkId) {
    throw new Error("Draft not found");
  }
  return draft;
}

async function getBlockOrThrow(ctx: any, blockId: any, clerkId: string) {
  const block = await ctx.db.get(blockId);
  if (!block) throw new Error("Block not found");
  const draft = await ctx.db.get(block.draftId);
  if (!draft || draft.clerkId !== clerkId) {
    throw new Error("Not allowed");
  }
  return { block, draft };
}

async function draftBlocks(ctx: any, draftId: any) {
  return await ctx.db
    .query("insightDraftBlocks")
    .withIndex("by_draft_order", (q: any) => q.eq("draftId", draftId))
    .collect();
}

// A note is Markdown-backed once it has a stored body (even an empty one).
function hasCanonicalMarkdown(draft: any): boolean {
  return typeof draft.markdownBody === "string";
}

function noteMarkdown(draft: any, blocks: any[]): string {
  return hasCanonicalMarkdown(draft) ? draft.markdownBody : blocksToMarkdown(draft.title, blocks);
}

function nextRevision(draft: any): number {
  return (draft.markdownRevision ?? 0) + 1;
}

function assertNotMarkdownBacked(draft: any) {
  if (hasCanonicalMarkdown(draft)) {
    throw new Error("This note is edited as text now; change it in the note body instead");
  }
}

// Markdown, revision, journal date and source of a draft, for every read path. Older notes get a projection
// of their blocks, their creation day, and a source only when a block actually references one.
function noteJournalFields(draft: any, blocks: any[]) {
  return {
    markdown_body: noteMarkdown(draft, blocks),
    markdown_revision: draft.markdownRevision ?? 0,
    markdown_canonical: hasCanonicalMarkdown(draft),
    journal_date: draft.journalDate ?? journalDateFromTimestamp(draft.createdAt),
    source: draft.source ?? inferSourceFromBlocks(blocks) ?? null,
  };
}

// Old clients render blocks, so a Markdown-backed note is shown to them as one text block holding the
// current body rather than its stale block snapshot.
function canonicalTextBlock(id: string, markdownBody: string, createdAt: number, updatedAt: number) {
  return {
    id: `${id}:markdown`,
    order: 0,
    type: "text",
    text: markdownBody,
    highlight_text: null,
    highlight_word_indices: [],
    link_url: null,
    scripture_ref: null,
    dictionary_meta: null,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt),
  };
}

function publicBlock(b: any) {
  return {
    id: b._id,
    order: b.order,
    type: b.type,
    text: b.text ?? null,
    highlight_text: b.highlightText ?? null,
    highlight_word_indices: b.highlightWordIndices ?? [],
    link_url: b.linkUrl ?? null,
    scripture_ref: b.scriptureRef ?? null,
    dictionary_meta: b.dictionaryMeta
      ? {
          edition: b.dictionaryMeta.edition,
          word: b.dictionaryMeta.word,
          heading: b.dictionaryMeta.heading ?? null,
          pronounce: b.dictionaryMeta.pronounce ?? null,
        }
      : null,
  };
}

// After a new block row is stored on a Markdown-backed note, its Markdown is appended to the body so the
// body and the block snapshot never disagree about what was added.
async function appendBlockToMarkdown(ctx: any, draft: any, block: any, now: number) {
  const patch: Record<string, unknown> = {
    updatedAt: now,
    lastActiveAt: now,
    markdownRevision: nextRevision(draft),
  };
  if (hasCanonicalMarkdown(draft)) {
    patch.markdownBody = appendMarkdownChunk(draft.markdownBody, blockToMarkdown(block));
    if (patch.markdownBody.length > NOTE_MARKDOWN_MAX) throw new Error("This note is too long");
  }
  await ctx.db.patch(draft._id, patch);
}

export const listMyDrafts = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return [];
    const drafts = await ctx.db
      .query("insightDrafts")
      .withIndex("by_clerk_last_active", (q: any) => q.eq("clerkId", clerkId))
      .order("desc")
      .collect();
    const rows = [];
    for (const d of drafts) {
      const blocks = await draftBlocks(ctx, d._id);
      // Summaries leave out the full body (up to NOTE_MARKDOWN_MAX each); getDraft returns it.
      const { markdown_body: _body, ...journal } = noteJournalFields(d, blocks);
      rows.push({
        id: d._id,
        title: d.title,
        status: d.status,
        visibility: d.visibility ?? "private",
        tags: d.tags ?? [],
        created_at: toIso(d.createdAt),
        updated_at: toIso(d.updatedAt),
        last_active_at: toIso(d.lastActiveAt),
        block_count: blocks.length,
        excerpt: hasCanonicalMarkdown(d) ? markdownExcerpt(d.markdownBody) : draftExcerpt(blocks),
        scripture_refs: draftScriptureRefs(blocks),
        ...journal,
        reading_at: readingAtIso(d),
      });
    }
    return rows;
  },
});

export const getDraft = query({
  args: { draftId: v.id("insightDrafts") },
  handler: async (ctx, args) => {
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return null;
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    const blocks = await draftBlocks(ctx, args.draftId);
    return {
      id: draft._id,
      title: draft.title,
      status: draft.status,
      visibility: draft.visibility ?? "private",
      tags: draft.tags ?? [],
      created_at: toIso(draft.createdAt),
      updated_at: toIso(draft.updatedAt),
      last_active_at: toIso(draft.lastActiveAt),
      ...noteJournalFields(draft, blocks),
      reading_at: readingAtIso(draft),
      // The owner sees the real block rows (a retained snapshot once markdown_canonical is true).
      blocks: blocks.map((b) => ({
        ...publicBlock(b),
        created_at: toIso(b.createdAt),
        updated_at: toIso(b.updatedAt),
      })),
    };
  },
});

export const listMyScriptureRefsForChapter = query({
  args: { volume: v.string(), book: v.string(), chapter: v.number() },
  handler: async (ctx, args) => {
    // Signed-out viewers simply get no markers (no auth error while the token is still loading).
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return [];
    const drafts = await ctx.db
      .query("insightDrafts")
      .withIndex("by_clerk_last_active", (q: any) => q.eq("clerkId", clerkId))
      .order("desc")
      .collect();
    const out: Array<{
      draftId: string;
      draftTitle: string;
      verseStart: number;
      verseEnd: number;
      status: "draft" | "published";
    }> = [];
    for (const draft of drafts) {
      if (draft.status !== "draft" && draft.status !== "published") continue;
      const seen = new Set<string>();
      const push = (verseStart: number, verseEnd: number) => {
        const start = Math.min(verseStart, verseEnd);
        const end = Math.max(verseStart, verseEnd);
        const key = `${start}-${end}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ draftId: draft._id, draftTitle: draft.title, verseStart: start, verseEnd: end, status: draft.status });
      };
      // Recovery blocks stop supplying markers once the editable Markdown becomes canonical.
      const blocks = hasCanonicalMarkdown(draft) ? [] : await draftBlocks(ctx, draft._id);
      for (const ref of scriptureLinksForChapter(noteMarkdown(draft, blocks), draft.source, args)) {
        push(ref.verseStart, ref.verseEnd);
      }
    }
    return out;
  },
});

export const getSharedDraft = query({
  args: { draftId: v.id("insightDrafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) return null;
    const viewerClerkId = await maybeClerkId(ctx);
    const visible = await canViewInsight(ctx, draft, viewerClerkId, true);
    // An active shared-note subscription can lose access during sign-out or revocation.
    // Withdraw the content without throwing through the page's React tree.
    if (!visible) return null;

    const author = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", draft.clerkId))
      .unique();
    const blocks = await draftBlocks(ctx, args.draftId);

    return {
      id: draft._id,
      user_id: draft.clerkId,
      author_name: author?.displayName ?? null,
      title: draft.title,
      status: draft.status,
      visibility: draft.visibility ?? "private",
      tags: draft.tags ?? [],
      updated_at: toIso(draft.updatedAt),
      ...noteJournalFields(draft, blocks),
      blocks: hasCanonicalMarkdown(draft)
        ? [canonicalTextBlock(String(draft._id), draft.markdownBody, draft.createdAt, draft.updatedAt)]
        : blocks.map(publicBlock),
    };
  },
});

export const createDraft = mutation({
  args: {
    title: v.optional(v.string()),
    visibility: v.optional(insightVisibility),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const now = Date.now();
    const title = (args.title ?? "").trim() || "Untitled insight";
    const id = await ctx.db.insert("insightDrafts", {
      clerkId,
      title,
      status: "draft",
      visibility: args.visibility ?? "private",
      tags: normalizeTags(args.tags),
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });
    return { id };
  },
});

/** A new private, Markdown-backed journal note for a day, optionally tied to where it was written from. */
export const createJournalNote = mutation({
  args: {
    journalDate: v.string(),
    source: v.optional(noteSourceValidator),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    if (!isJournalDate(args.journalDate)) throw new Error("Journal date must be a real YYYY-MM-DD date");
    const source = args.source ? normalizeNoteSource(args.source) : undefined;
    const now = Date.now();
    const id = await ctx.db.insert("insightDrafts", {
      clerkId,
      title: DEFAULT_NOTE_TITLE,
      status: "draft",
      visibility: "private",
      tags: [],
      markdownBody: "",
      markdownRevision: 0,
      journalDate: args.journalDate,
      source,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });
    return { id, markdownRevision: 0 };
  },
});

/**
 * One private journal entry with note text, reading, or both, created atomically. A retry with the same request
 * id returns the same entry; while nothing has edited that entry since, the retry's content replaces it, so an
 * edit made before retrying a lost response isn't dropped. Replacing the text bumps its revision, so an editor
 * opened on the earlier text can't save over it. Once the entry has been edited, a retry with other content is
 * refused (ENTRY_CONFLICT) rather than overwriting those edits or reporting its own content as saved. An entry
 * deleted meanwhile stays deleted.
 */
export const createJournalEntry = mutation({
  args: {
    journalDate: v.string(),
    source: v.optional(noteSourceValidator),
    markdownBody: v.string(),
    logReading: v.boolean(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    if (!isJournalDate(args.journalDate)) throw new Error("Journal date must be a real YYYY-MM-DD date");
    const problem = requestIdProblem(args.requestId);
    if (problem || isHistoryKey(args.requestId)) throw new Error(problem ?? "Invalid request id");
    if (args.markdownBody.length > NOTE_MARKDOWN_MAX) throw new Error("This note is too long");
    if (!args.logReading && !args.markdownBody.trim()) throw new Error("Add a note or log reading");
    const source = args.source ? normalizeNoteSource(args.source) : undefined;
    if (args.logReading && !source) throw new Error("Choose what you read");

    if (await wasEntryDeleted(ctx, clerkId, args.requestId)) return { id: null, duplicate: true, deleted: true };
    const now = Date.now();
    const content = {
      title: deriveNoteTitle(args.markdownBody),
      markdownBody: args.markdownBody,
      journalDate: args.journalDate,
      source,
    };
    const fingerprint = entryContentFingerprint({ ...content, logReading: args.logReading });
    const existing = await findEntryByKey(ctx, clerkId, args.requestId);
    if (existing) {
      const current =
        existing.markdownBody !== undefined && existing.journalDate !== undefined
          ? entryContentFingerprint({
              markdownBody: existing.markdownBody,
              journalDate: existing.journalDate,
              source: existing.source,
              logReading: existing.readingAt !== undefined,
            })
          : null;
      // Untouched: no note revision past the one this request left, and the entry still holds exactly what this
      // request last wrote. The content is compared, not the clock, so a reading edit landing in the create's own
      // millisecond still counts as an edit. An entry without a fingerprint can't show that and is treated as edited.
      const requestRevision = existing.entryRequestRevision ?? 0;
      const untouched =
        (existing.markdownRevision ?? 0) === requestRevision &&
        existing.updatedAt === existing.createdAt &&
        current !== null &&
        current === existing.entryRequestFingerprint;
      if (untouched && existing.status === "draft") {
        // New text is a new revision: an editor still holding the earlier text (another window that loaded the
        // entry before this retry) is refused rather than saving over it. The same text keeps the revision, so
        // repeating a request stays idempotent and leaves open editors alone.
        const revision = args.markdownBody === existing.markdownBody ? requestRevision : requestRevision + 1;
        await ctx.db.patch(existing._id, {
          ...content,
          readingAt: args.logReading ? existing.readingAt ?? existing.createdAt : undefined,
          markdownRevision: revision,
          entryRequestFingerprint: fingerprint,
          entryRequestRevision: revision,
        });
        return { id: existing._id, duplicate: true, deleted: false };
      }
      // Edited since (here or in another window). Repeating what this request last wrote, or matching what the
      // entry now holds, is the same save. Anything else would either drop the caller's changes or overwrite the
      // later edits, so it is refused, naming the entry; the client keeps its text to save as a separate entry.
      if (fingerprint === existing.entryRequestFingerprint || fingerprint === current) {
        return { id: existing._id, duplicate: true, deleted: false };
      }
      throw new ConvexError({
        code: "ENTRY_CONFLICT",
        message: "This entry changed since it was first saved",
        id: existing._id,
        journalDate: existing.journalDate ?? journalDateFromTimestamp(existing.createdAt),
      });
    }
    const id = await ctx.db.insert("insightDrafts", {
      clerkId,
      status: "draft",
      visibility: "private",
      tags: [],
      ...content,
      markdownRevision: 0,
      readingAt: args.logReading ? now : undefined,
      entryRequestId: args.requestId,
      entryRequestFingerprint: fingerprint,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });
    return { id, duplicate: false, deleted: false };
  },
});

/**
 * Opens an older reading (a readingLogs row, or a chapterReads completion shown as legacy history) as an editable
 * entry, once: it keeps the reading's day, source and time. The original row stays as it is, so chapter progress
 * and plans don't change; listMyReadingLog stops listing it on its own.
 */
export const openReadingEntry = mutation({
  args: { readingId: v.union(v.id("readingLogs"), v.id("chapterReads")) },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const row = await ctx.db.get(args.readingId);
    if (!row || row.clerkId !== clerkId) throw new Error("Reading not found");
    const isLog = "requestId" in row;
    const historyKey = isLog ? readingLogHistoryKey(row) : chapterReadHistoryKey(row);
    const existing = await findEntryByKey(ctx, clerkId, historyKey);
    if (existing) return { id: existing._id };
    if (await wasEntryDeleted(ctx, clerkId, historyKey)) throw new Error("Reading not found");
    const now = Date.now();
    const id = await ctx.db.insert("insightDrafts", {
      clerkId,
      title: DEFAULT_NOTE_TITLE,
      status: "draft",
      visibility: "private",
      tags: [],
      markdownBody: "",
      markdownRevision: 0,
      source: isLog ? row.source : scriptureSource(row),
      journalDate: isLog ? row.journalDate : journalDateFromTimestamp(row.readAt),
      readingAt: row.readAt,
      readingHistoryKey: historyKey,
      entryRequestId: historyKey,
      createdAt: row.readAt,
      updatedAt: now,
      lastActiveAt: now,
    });
    return { id };
  },
});

/**
 * Logs, edits (passage, verses, day) or removes the reading on an entry. The note text and its revision are left
 * alone, as are chapter completion and plans. An entry keeps its first reading time while the reading is edited.
 * Removing the reading from an entry with no note text is refused: delete the entry instead.
 */
export const setJournalReading = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    logged: v.boolean(),
    source: v.optional(noteSourceValidator),
    journalDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft entries can be edited");
    if (args.journalDate !== undefined && !isJournalDate(args.journalDate)) throw new Error("Choose a valid reading date");
    const blocks = await draftBlocks(ctx, draft._id);
    const source = args.source ? normalizeNoteSource(args.source) : draft.source ?? inferSourceFromBlocks(blocks);
    if (args.logged && !source) throw new Error("This entry has no reading source");
    if (!args.logged && !noteMarkdown(draft, blocks).trim()) throw new Error("Add a note before removing the reading");
    await ctx.db.patch(draft._id, {
      source: source ?? undefined,
      journalDate: args.journalDate ?? draft.journalDate ?? journalDateFromTimestamp(draft.createdAt),
      readingAt: args.logged ? draft.readingAt ?? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Stores the note body exactly as given (whitespace and empty bodies included). The first save of an older
 * note makes Markdown canonical; its block rows are kept untouched as a snapshot. A save naming any revision
 * other than the current one is refused so a stale editor cannot overwrite newer content.
 */
export const saveJournalNote = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    markdownBody: v.string(),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft notes can be edited");
    if (args.markdownBody.length > NOTE_MARKDOWN_MAX) throw new Error("This note is too long");
    if (!Number.isInteger(args.expectedRevision) || args.expectedRevision < 0) {
      throw new Error("Invalid revision");
    }
    const currentRevision = draft.markdownRevision ?? 0;
    if (args.expectedRevision !== currentRevision) {
      throw new ConvexError({
        code: "REVISION_CONFLICT",
        message: "This note changed since it was opened",
        currentRevision,
      });
    }
    const now = Date.now();
    const revision = currentRevision + 1;
    const title = deriveNoteTitle(args.markdownBody);
    const patch: Record<string, unknown> = {
      markdownBody: args.markdownBody,
      markdownRevision: revision,
      title,
      updatedAt: now,
      lastActiveAt: now,
    };
    // Fix the projected journal date and inferred source in place, so they stay put after conversion.
    if (!draft.journalDate) patch.journalDate = journalDateFromTimestamp(draft.createdAt);
    if (!draft.source) {
      const inferred = inferSourceFromBlocks(await draftBlocks(ctx, draft._id));
      if (inferred) patch.source = inferred;
    }
    await ctx.db.patch(draft._id, patch);
    return { ok: true, markdownRevision: revision, title };
  },
});

/**
 * The signed-in user's journal: their notes (any status) and, as read-only legacy activity, their verse
 * annotations that have note text. Highlight-only annotations are not journal entries.
 */
export const listMyJournal = query({
  args: {},
  handler: async (ctx) => {
    // A live subscription re-runs as soon as sign-out deletes the session: answer empty, never throw.
    const clerkId = await maybeClerkId(ctx);
    if (!clerkId) return [];
    const me = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
      .unique();
    const authorLabel = me?.displayName?.trim() || "You";

    const entries = [];
    const drafts = await ctx.db
      .query("insightDrafts")
      .withIndex("by_clerk_last_active", (q: any) => q.eq("clerkId", clerkId))
      .collect();
    for (const draft of drafts) {
      const blocks = await draftBlocks(ctx, draft._id);
      const fields = noteJournalFields(draft, blocks);
      entries.push({
        kind: "note",
        id: draft._id,
        title: draft.title,
        status: draft.status,
        visibility: draft.visibility ?? "private",
        journal_date: fields.journal_date,
        source: fields.source,
        reading_at: readingAtIso(draft),
        excerpt: markdownExcerpt(fields.markdown_body),
        has_reflection: !!fields.markdown_body.trim(),
        markdown_revision: fields.markdown_revision,
        markdown_canonical: fields.markdown_canonical,
        read_only: false,
        author_label: authorLabel,
        created_at: toIso(draft.createdAt),
        updated_at: toIso(draft.updatedAt),
      });
    }

    const annotations = await ctx.db
      .query("verseAnnotations")
      .withIndex("by_user_chapter", (q: any) => q.eq("clerkId", clerkId))
      .collect();
    for (const row of annotations) {
      if (!row.body?.trim()) continue;
      entries.push({
        kind: "verse_annotation",
        id: row._id,
        title: null,
        body: row.body,
        journal_date: journalDateFromTimestamp(row.createdAt),
        source: scriptureSource({
          volume: row.volume,
          book: row.book,
          chapter: row.chapter,
          verseStart: row.verse,
          verseEnd: row.verse,
        }),
        highlight_color: row.highlightColor ?? null,
        read_only: true,
        author_label: authorLabel,
        created_at: toIso(row.createdAt),
        updated_at: toIso(row.updatedAt),
      });
    }

    entries.sort((a, b) => {
      if (a.journal_date !== b.journal_date) return a.journal_date < b.journal_date ? 1 : -1;
      return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
    });
    return entries;
  },
});

export const setActiveDraft = mutation({
  args: { draftId: v.id("insightDrafts") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    await getDraftOrThrow(ctx, args.draftId, clerkId);
    const now = Date.now();
    await ctx.db.patch(args.draftId, { lastActiveAt: now, updatedAt: now });
    return { ok: true };
  },
});

export const renameDraft = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be renamed");
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    await ctx.db.patch(args.draftId, {
      title,
      updatedAt: Date.now(),
      // An older note's projection starts with its title, so renaming it changes the projected Markdown.
      ...(hasCanonicalMarkdown(draft) ? {} : { markdownRevision: nextRevision(draft) }),
    });
    return { ok: true };
  },
});

export const saveDraftSettings = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    title: v.optional(v.string()),
    visibility: v.optional(insightVisibility),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be edited");
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Title is required");
      patch.title = title;
      if (!hasCanonicalMarkdown(draft) && title !== draft.title) patch.markdownRevision = nextRevision(draft);
    }
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.tags !== undefined) patch.tags = normalizeTags(args.tags);
    await ctx.db.patch(args.draftId, patch);
    return { ok: true };
  },
});

export const deleteDraft = mutation({
  args: { draftId: v.id("insightDrafts") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status === "published") throw new Error("Published insights cannot be deleted");
    const blocks = await ctx.db
      .query("insightDraftBlocks")
      .withIndex("by_draft", (q: any) => q.eq("draftId", args.draftId))
      .collect();
    await Promise.all(blocks.map((b) => ctx.db.delete(b._id)));
    const folderAssignment = await ctx.db
      .query("noteFolderAssignments")
      .withIndex("by_clerk_draft", (q: any) => q.eq("clerkId", clerkId).eq("draftId", args.draftId))
      .unique();
    if (folderAssignment) await ctx.db.delete(folderAssignment._id);
    // Remember what the entry stood for, so neither a late retry of its create nor the older reading it was
    // opened from (still stored for history and progress) brings it back.
    const keys = new Set([draft.entryRequestId, draft.readingHistoryKey].filter((key): key is string => !!key));
    for (const key of keys) {
      if (!(await wasEntryDeleted(ctx, clerkId, key))) {
        await ctx.db.insert("journalEntryDeletions", { clerkId, key, deletedAt: Date.now() });
      }
    }
    await ctx.db.delete(args.draftId);
    return { ok: true };
  },
});

export const addBlock = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    type: insightBlockType,
    text: v.optional(v.string()),
    highlightText: v.optional(v.string()),
    highlightWordIndices: v.optional(v.array(v.number())),
    linkUrl: v.optional(v.string()),
    scriptureRef: v.optional(scriptureRefValidator),
    dictionaryMeta: v.optional(dictionaryMetaValidator),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be edited");
    const now = Date.now();
    const blocks = await ctx.db
      .query("insightDraftBlocks")
      .withIndex("by_draft_order", (q: any) => q.eq("draftId", args.draftId))
      .collect();
    const nextOrder = blocks.length > 0 ? blocks[blocks.length - 1].order + 1 : 0;
    const block = {
      draftId: args.draftId,
      order: nextOrder,
      type: args.type,
      text: args.text?.trim() || undefined,
      highlightText: args.highlightText?.trim() || undefined,
      highlightWordIndices: args.highlightWordIndices,
      linkUrl: args.linkUrl?.trim() || undefined,
      scriptureRef: args.scriptureRef,
      dictionaryMeta: args.dictionaryMeta
        ? {
            edition: args.dictionaryMeta.edition,
            word: args.dictionaryMeta.word.trim(),
            heading: args.dictionaryMeta.heading?.trim() || undefined,
            pronounce: args.dictionaryMeta.pronounce?.trim() || undefined,
          }
        : undefined,
      createdAt: now,
      updatedAt: now,
    };
    const id = await ctx.db.insert("insightDraftBlocks", block);
    await appendBlockToMarkdown(ctx, draft, block, now);
    return { id };
  },
});

export const appendScriptureBlock = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verseStart: v.number(),
    verseEnd: v.number(),
    reference: v.string(),
    text: v.optional(v.string()),
    highlightText: v.optional(v.string()),
    highlightWordIndices: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be edited");
    const now = Date.now();
    const blocks = await ctx.db
      .query("insightDraftBlocks")
      .withIndex("by_draft_order", (q: any) => q.eq("draftId", args.draftId))
      .collect();
    const nextOrder = blocks.length > 0 ? blocks[blocks.length - 1].order + 1 : 0;
    const block = {
      draftId: args.draftId,
      order: nextOrder,
      type: "scripture",
      text: args.text?.trim() || undefined,
      highlightText: args.highlightText?.trim() || undefined,
      highlightWordIndices: args.highlightWordIndices,
      scriptureRef: {
        volume: args.volume,
        book: args.book,
        chapter: args.chapter,
        verseStart: Math.min(args.verseStart, args.verseEnd),
        verseEnd: Math.max(args.verseStart, args.verseEnd),
        reference: args.reference,
      },
      createdAt: now,
      updatedAt: now,
    };
    const id = await ctx.db.insert("insightDraftBlocks", block);
    await appendBlockToMarkdown(ctx, draft, block, now);
    return { id };
  },
});

export const updateBlock = mutation({
  args: {
    blockId: v.id("insightDraftBlocks"),
    text: v.optional(v.string()),
    highlightText: v.optional(v.string()),
    highlightWordIndices: v.optional(v.array(v.number())),
    linkUrl: v.optional(v.string()),
    scriptureRef: v.optional(scriptureRefValidator),
    dictionaryMeta: v.optional(dictionaryMetaValidator),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const { block, draft } = await getBlockOrThrow(ctx, args.blockId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be edited");
    assertNotMarkdownBacked(draft);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.text !== undefined) patch.text = args.text.trim() || undefined;
    if (args.highlightText !== undefined) patch.highlightText = args.highlightText.trim() || undefined;
    if (args.highlightWordIndices !== undefined) patch.highlightWordIndices = args.highlightWordIndices;
    if (args.linkUrl !== undefined) patch.linkUrl = args.linkUrl.trim() || undefined;
    if (args.scriptureRef !== undefined) patch.scriptureRef = args.scriptureRef;
    if (args.dictionaryMeta !== undefined) {
      patch.dictionaryMeta = args.dictionaryMeta
        ? {
            edition: args.dictionaryMeta.edition,
            word: args.dictionaryMeta.word.trim(),
            heading: args.dictionaryMeta.heading?.trim() || undefined,
            pronounce: args.dictionaryMeta.pronounce?.trim() || undefined,
          }
        : undefined;
    }
    await ctx.db.patch(block._id, patch);
    const now = Date.now();
    // The revision moves with the projection, so a Markdown save based on the old projection conflicts.
    await ctx.db.patch(draft._id, { updatedAt: now, lastActiveAt: now, markdownRevision: nextRevision(draft) });
    return { ok: true };
  },
});

export const removeBlock = mutation({
  args: { blockId: v.id("insightDraftBlocks") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const { block, draft } = await getBlockOrThrow(ctx, args.blockId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be edited");
    assertNotMarkdownBacked(draft);
    await ctx.db.delete(block._id);
    const remaining = await ctx.db
      .query("insightDraftBlocks")
      .withIndex("by_draft_order", (q: any) => q.eq("draftId", draft._id))
      .collect();
    const now = Date.now();
    await Promise.all(
      remaining.map((item, idx) =>
        item.order === idx ? null : ctx.db.patch(item._id, { order: idx, updatedAt: now })
      )
    );
    await ctx.db.patch(draft._id, { updatedAt: now, lastActiveAt: now, markdownRevision: nextRevision(draft) });
    return { ok: true };
  },
});

export const reorderBlocks = mutation({
  args: { draftId: v.id("insightDrafts"), blockIds: v.array(v.id("insightDraftBlocks")) },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be edited");
    assertNotMarkdownBacked(draft);
    const currentBlocks = await ctx.db
      .query("insightDraftBlocks")
      .withIndex("by_draft", (q: any) => q.eq("draftId", args.draftId))
      .collect();
    const currentIds = new Set(currentBlocks.map((b) => String(b._id)));
    if (currentBlocks.length !== args.blockIds.length) throw new Error("All blocks must be included");
    for (const id of args.blockIds) {
      if (!currentIds.has(String(id))) throw new Error("Invalid block order");
    }
    const now = Date.now();
    await Promise.all(args.blockIds.map((id, idx) => ctx.db.patch(id, { order: idx, updatedAt: now })));
    await ctx.db.patch(args.draftId, { updatedAt: now, lastActiveAt: now, markdownRevision: nextRevision(draft) });
    return { ok: true };
  },
});

export const publishDraft = mutation({
  args: {
    draftId: v.id("insightDrafts"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    visibility: v.optional(insightVisibility),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Insight has already been published");
    const blocks = await ctx.db
      .query("insightDraftBlocks")
      .withIndex("by_draft_order", (q: any) => q.eq("draftId", args.draftId))
      .collect();
    const canonical = hasCanonicalMarkdown(draft);
    if (canonical) {
      if (!draft.markdownBody.trim()) throw new Error("Write something before publishing");
    } else if (blocks.length === 0) {
      throw new Error("Add at least one block before publishing");
    }
    const now = Date.now();
    const title = (args.title ?? draft.title).trim();
    if (!title) throw new Error("Title is required");
    const summary = args.summary?.trim() || undefined;
    const visibility = args.visibility ?? draft.visibility ?? "private";
    const tags = args.tags !== undefined ? normalizeTags(args.tags) : draft.tags ?? [];
    const insightId = await ctx.db.insert("publishedInsights", {
      draftId: draft._id,
      clerkId,
      title,
      summary,
      visibility,
      tags,
      // A Markdown-backed note publishes only its current body (as one text block below); its retained draft
      // block snapshot stays on the draft and is never copied into the publication.
      ...(canonical
        ? {
            markdownBody: draft.markdownBody,
            markdownRevision: draft.markdownRevision ?? 0,
            journalDate: draft.journalDate ?? journalDateFromTimestamp(draft.createdAt),
            source: draft.source ?? inferSourceFromBlocks(blocks) ?? undefined,
          }
        : {}),
      blockCount: canonical ? 1 : blocks.length,
      createdAt: draft.createdAt,
      updatedAt: now,
      publishedAt: now,
    });
    if (canonical) {
      await ctx.db.insert("publishedInsightBlocks", {
        insightId,
        order: 0,
        type: "text",
        text: draft.markdownBody,
        createdAt: now,
        updatedAt: now,
      });
    }
    await Promise.all(
      (canonical ? [] : blocks).map((b) =>
        ctx.db.insert("publishedInsightBlocks", {
          insightId,
          order: b.order,
          type: b.type,
          text: b.text,
          highlightText: b.highlightText,
          highlightWordIndices: b.highlightWordIndices,
          linkUrl: b.linkUrl,
          scriptureRef: b.scriptureRef,
          dictionaryMeta: b.dictionaryMeta,
          createdAt: now,
          updatedAt: now,
        })
      )
    );
    await ctx.db.patch(draft._id, {
      status: "published",
      title,
      visibility,
      tags,
      updatedAt: now,
      lastActiveAt: now,
    });
    return { id: insightId };
  },
});

export const getPublishedInsightsFeed = query({
  args: {},
  handler: async (ctx) => {
    const viewerClerkId = await maybeClerkId(ctx);
    const rows = await ctx.db
      .query("publishedInsights")
      .withIndex("by_published_at")
      .order("desc")
      .take(50);
    const out = [];
    for (const row of rows) {
      const visible = await canViewInsight(ctx, row, viewerClerkId, false);
      if (!visible) continue;
      const author = await ctx.db.query("users").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", row.clerkId)).unique();
      const blocks = await ctx.db
        .query("publishedInsightBlocks")
        .withIndex("by_insight_order", (q: any) => q.eq("insightId", row._id))
        .collect();
      out.push({
        id: row._id,
        user_id: row.clerkId,
        author_name: author?.displayName ?? null,
        title: row.title,
        summary: row.summary ?? null,
        visibility: row.visibility ?? "private",
        tags: row.tags ?? [],
        block_count: row.blockCount,
        published_at: toIso(row.publishedAt),
        markdown_body: typeof row.markdownBody === "string" ? row.markdownBody : null,
        markdown_revision: row.markdownRevision ?? null,
        journal_date: row.journalDate ?? null,
        source: row.source ?? null,
        blocks:
          typeof row.markdownBody === "string"
            ? [canonicalTextBlock(String(row._id), row.markdownBody, row.createdAt, row.updatedAt)]
            : blocks.map(publicBlock),
      });
    }
    return out;
  },
});

/** Imports a saved device entry once, keeping its journal day, timestamps and reading together. */
export const importDeviceNote = mutation({
  args: { deviceId: v.string(), expectedOwner: v.string(), markdownBody: v.string(), journalDate: v.string(), source: v.optional(noteSourceValidator),
    createdAt: v.number(), updatedAt: v.number(), readingAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    if (clerkId !== args.expectedOwner) throw new Error("The signed-in account changed before import");
    if (requestIdProblem(args.deviceId) || !isJournalDate(args.journalDate) || args.markdownBody.length > NOTE_MARKDOWN_MAX) throw new Error("Invalid device note");
    const receipt = await ctx.db.query("deviceStudyImports").withIndex("by_owner_device", q => q.eq("clerkId", clerkId).eq("deviceId", args.deviceId)).unique();
    if (receipt) return { id: ctx.db.normalizeId("insightDrafts", receipt.recordId)! };
    const source = args.source ? normalizeNoteSource(args.source) : undefined;
    if (args.readingAt !== undefined && !source) throw new Error("Choose what you read");
    if (![args.createdAt, args.updatedAt, args.readingAt ?? 0].every(value => Number.isFinite(value) && value >= 0 && value <= Date.now() + 86400000)) throw new Error("Invalid device timestamps");
    const id = await ctx.db.insert("insightDrafts", { clerkId, status: "draft", visibility: "private", tags: [],
      title: deriveNoteTitle(args.markdownBody), markdownBody: args.markdownBody, markdownRevision: 0,
      journalDate: args.journalDate, source, readingAt: args.readingAt, createdAt: args.createdAt, updatedAt: args.updatedAt, lastActiveAt: args.updatedAt });
    await ctx.db.insert("deviceStudyImports", { clerkId, deviceId: args.deviceId, recordId: id });
    return { id };
  },
});
