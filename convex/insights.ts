// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

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
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
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

export const listMyDrafts = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await requireClerkId(ctx);
    const drafts = await ctx.db
      .query("insightDrafts")
      .withIndex("by_clerk_last_active", (q: any) => q.eq("clerkId", clerkId))
      .order("desc")
      .collect();
    return drafts.map((d) => ({
      id: d._id,
      title: d.title,
      status: d.status,
      visibility: d.visibility ?? "private",
      tags: d.tags ?? [],
      created_at: toIso(d.createdAt),
      updated_at: toIso(d.updatedAt),
      last_active_at: toIso(d.lastActiveAt),
    }));
  },
});

export const getDraft = query({
  args: { draftId: v.id("insightDrafts") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    const blocks = await ctx.db
      .query("insightDraftBlocks")
      .withIndex("by_draft_order", (q: any) => q.eq("draftId", args.draftId))
      .collect();
    return {
      id: draft._id,
      title: draft.title,
      status: draft.status,
      visibility: draft.visibility ?? "private",
      tags: draft.tags ?? [],
      created_at: toIso(draft.createdAt),
      updated_at: toIso(draft.updatedAt),
      last_active_at: toIso(draft.lastActiveAt),
      blocks: blocks.map((b) => ({
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
        created_at: toIso(b.createdAt),
        updated_at: toIso(b.updatedAt),
      })),
    };
  },
});

export const getSharedDraft = query({
  args: { draftId: v.id("insightDrafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");
    const viewerClerkId = await maybeClerkId(ctx);
    const visible = await canViewInsight(ctx, draft, viewerClerkId, true);
    if (!visible) throw new Error("You do not have access to this insight");

    const author = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", draft.clerkId))
      .unique();
    const blocks = await ctx.db
      .query("insightDraftBlocks")
      .withIndex("by_draft_order", (q: any) => q.eq("draftId", args.draftId))
      .collect();

    return {
      id: draft._id,
      user_id: draft.clerkId,
      author_name: author?.displayName ?? null,
      title: draft.title,
      status: draft.status,
      visibility: draft.visibility ?? "private",
      tags: draft.tags ?? [],
      updated_at: toIso(draft.updatedAt),
      blocks: blocks.map((b) => ({
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
      })),
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
    const id = await ctx.db.insert("insightDraftBlocks", {
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
    });
    await ctx.db.patch(args.draftId, { updatedAt: now, lastActiveAt: now });
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
    const id = await ctx.db.insert("insightDraftBlocks", {
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
    });
    await ctx.db.patch(args.draftId, { updatedAt: now, lastActiveAt: now });
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
    await ctx.db.patch(draft._id, { updatedAt: now, lastActiveAt: now });
    return { ok: true };
  },
});

export const removeBlock = mutation({
  args: { blockId: v.id("insightDraftBlocks") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const { block, draft } = await getBlockOrThrow(ctx, args.blockId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be edited");
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
    await ctx.db.patch(draft._id, { updatedAt: now, lastActiveAt: now });
    return { ok: true };
  },
});

export const reorderBlocks = mutation({
  args: { draftId: v.id("insightDrafts"), blockIds: v.array(v.id("insightDraftBlocks")) },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const draft = await getDraftOrThrow(ctx, args.draftId, clerkId);
    if (draft.status !== "draft") throw new Error("Only draft insights can be edited");
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
    await ctx.db.patch(args.draftId, { updatedAt: now, lastActiveAt: now });
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
    if (blocks.length === 0) throw new Error("Add at least one block before publishing");
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
      blockCount: blocks.length,
      createdAt: draft.createdAt,
      updatedAt: now,
      publishedAt: now,
    });
    await Promise.all(
      blocks.map((b) =>
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
        blocks: blocks.map((b) => ({
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
        })),
      });
    }
    return out;
  },
});
