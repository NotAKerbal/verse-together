// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

export const getFeed = query({
  args: {},
  handler: async (ctx) => {
    const shares = await ctx.db.query("scriptureShares").withIndex("by_created_at").order("desc").take(50);
    const out = [];
    for (const share of shares) {
      const comments = await ctx.db.query("scriptureComments").withIndex("by_share", (q: any) => q.eq("shareId", share._id)).collect();
      const reactions = await ctx.db.query("scriptureReactions").withIndex("by_share", (q: any) => q.eq("shareId", share._id)).collect();
      out.push({
        id: share._id,
        user_id: share.clerkId,
        volume: share.volume,
        book: share.book,
        chapter: share.chapter,
        verse_start: share.verseStart,
        verse_end: share.verseEnd,
        translation: share.translation ?? null,
        note: share.note ?? null,
        content: share.content ?? null,
        created_at: toIso(share.createdAt),
        reaction_count: reactions.length,
        comment_count: comments.length,
      });
    }
    out.sort((a, b) => b.reaction_count - a.reaction_count || (a.created_at < b.created_at ? 1 : -1));
    return out;
  },
});

export const createShare = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verseStart: v.number(),
    verseEnd: v.number(),
    translation: v.optional(v.string()),
    note: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const id = await ctx.db.insert("scriptureShares", {
      clerkId,
      volume: args.volume,
      book: args.book,
      chapter: args.chapter,
      verseStart: Math.min(args.verseStart, args.verseEnd),
      verseEnd: Math.max(args.verseStart, args.verseEnd),
      translation: args.translation,
      note: args.note,
      content: args.content,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const getComments = query({
  args: { shareId: v.id("scriptureShares") },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("scriptureComments").withIndex("by_share", (q: any) => q.eq("shareId", args.shareId)).collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, 10).map((r) => ({
      id: r._id,
      body: r.body,
      created_at: toIso(r.createdAt),
      user_id: r.clerkId,
      visibility: r.visibility,
    }));
  },
});

export const createComment = mutation({
  args: {
    shareId: v.id("scriptureShares"),
    body: v.string(),
    visibility: v.union(v.literal("public"), v.literal("friends")),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("scriptureComments", {
      shareId: args.shareId,
      clerkId,
      body: args.body.trim(),
      visibility: args.visibility,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const updateComment = mutation({
  args: { commentId: v.id("scriptureComments"), body: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const row = await ctx.db.get(args.commentId);
    if (!row || row.clerkId !== clerkId) throw new Error("Not allowed");
    await ctx.db.patch(args.commentId, { body: args.body.trim(), updatedAt: Date.now() });
    return { ok: true };
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("scriptureComments") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const row = await ctx.db.get(args.commentId);
    if (!row || row.clerkId !== clerkId) throw new Error("Not allowed");
    await ctx.db.delete(args.commentId);
    return { ok: true };
  },
});

export const getReactionCount = query({
  args: { shareId: v.id("scriptureShares") },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("scriptureReactions").withIndex("by_share", (q: any) => q.eq("shareId", args.shareId)).collect();
    return rows.length;
  },
});

export const toggleReaction = mutation({
  args: { shareId: v.id("scriptureShares"), reaction: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const existing = await ctx.db
      .query("scriptureReactions")
      .withIndex("by_share_user_reaction", (q: any) =>
        q.eq("shareId", args.shareId).eq("clerkId", clerkId).eq("reaction", args.reaction)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { toggledOn: false };
    }
    await ctx.db.insert("scriptureReactions", {
      shareId: args.shareId,
      clerkId,
      reaction: args.reaction,
      createdAt: Date.now(),
    });
    return { toggledOn: true };
  },
});

export const getChapterActivity = query({
  args: { volume: v.string(), book: v.string(), chapter: v.number() },
  handler: async (ctx, args) => {
    const shares = await ctx.db
      .query("scriptureShares")
      .withIndex("by_chapter", (q: any) => q.eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter))
      .collect();
    if (shares.length === 0) {
      return { verseIndicators: {}, verseComments: {}, names: {} };
    }
    const shareIds = shares.map((s) => s._id);
    const comments = (
      await Promise.all(
        shareIds.map((id) => ctx.db.query("scriptureComments").withIndex("by_share", (q: any) => q.eq("shareId", id)).collect())
      )
    ).flat();
    const reactions = (
      await Promise.all(
        shareIds.map((id) => ctx.db.query("scriptureReactions").withIndex("by_share", (q: any) => q.eq("shareId", id)).collect())
      )
    ).flat();

    const commentsByShare: Record<string, number> = {};
    const likesByShare: Record<string, number> = {};
    for (const c of comments) commentsByShare[c.shareId] = (commentsByShare[c.shareId] ?? 0) + 1;
    for (const r of reactions) likesByShare[r.shareId] = (likesByShare[r.shareId] ?? 0) + 1;

    const verseIndicators: Record<number, { comments: number; likes: number }> = {};
    const verseComments: Record<number, Array<{ id: string; user_id: string; body: string; created_at: string }>> = {};
    for (const share of shares) {
      const commentCount = commentsByShare[share._id] ?? 0;
      const likeCount = likesByShare[share._id] ?? 0;
      const related = comments
        .filter((c) => c.shareId === share._id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 3);
      for (let verse = share.verseStart; verse <= share.verseEnd; verse += 1) {
        verseIndicators[verse] = {
          comments: (verseIndicators[verse]?.comments ?? 0) + commentCount,
          likes: (verseIndicators[verse]?.likes ?? 0) + likeCount,
        };
        const current = verseComments[verse] ?? [];
        for (const c of related) {
          current.push({
            id: c._id,
            user_id: c.clerkId,
            body: c.body,
            created_at: toIso(c.createdAt),
          });
        }
        const deduped = Array.from(new Map(current.map((x) => [x.id, x])).values()).sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1
        );
        verseComments[verse] = deduped.slice(0, 3);
      }
    }

    const userIds = Array.from(new Set(comments.map((c) => c.clerkId)));
    const names: Record<string, string> = {};
    for (const clerkId of userIds) {
      const row = await ctx.db.query("users").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).unique();
      if (row?.displayName) names[clerkId] = row.displayName;
    }
    return { verseIndicators, verseComments, names };
  },
});

export const getAccountData = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await requireClerkId(ctx);
    const friendships = [
      ...(await ctx.db.query("friendships").withIndex("by_requester", (q: any) => q.eq("requesterClerkId", clerkId)).collect()),
      ...(await ctx.db.query("friendships").withIndex("by_addressee", (q: any) => q.eq("addresseeClerkId", clerkId)).collect()),
    ];
    friendships.sort((a, b) => b.createdAt - a.createdAt);

    const comments = (await ctx.db.query("scriptureComments").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).collect())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
    const shareIds = Array.from(new Set(comments.map((c) => c.shareId)));
    const shares = await Promise.all(shareIds.map((id) => ctx.db.get(id)));
    const sharesMap: Record<string, any> = {};
    shares.forEach((s) => {
      if (!s) return;
      sharesMap[s._id] = {
        id: s._id,
        book: s.book,
        chapter: s.chapter,
        verse_start: s.verseStart,
        verse_end: s.verseEnd,
        translation: s.translation ?? null,
        content: s.content ?? null,
      };
    });

    const friendIds = Array.from(
      new Set(
        friendships.map((f) => (f.requesterClerkId === clerkId ? f.addresseeClerkId : f.requesterClerkId))
      )
    );
    const names: Record<string, string> = {};
    for (const id of friendIds) {
      const user = await ctx.db.query("users").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", id)).unique();
      if (user?.displayName) names[id] = user.displayName;
    }

    return {
      friends: friendships.map((f) => ({
        id: f._id,
        requester_id: f.requesterClerkId,
        addressee_id: f.addresseeClerkId,
        status: f.status,
      })),
      myComments: comments.map((c) => ({
        id: c._id,
        body: c.body,
        created_at: toIso(c.createdAt),
        share_id: c.shareId,
        visibility: c.visibility,
      })),
      names,
      shares: sharesMap,
    };
  },
});

export const sendFriendRequest = mutation({
  args: { targetClerkId: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    if (args.targetClerkId === clerkId) throw new Error("You cannot add yourself");
    const now = Date.now();
    const existing = [
      ...(await ctx.db.query("friendships").withIndex("by_requester", (q: any) => q.eq("requesterClerkId", clerkId)).collect()),
      ...(await ctx.db.query("friendships").withIndex("by_addressee", (q: any) => q.eq("addresseeClerkId", clerkId)).collect()),
    ].find(
      (f) =>
        (f.requesterClerkId === clerkId && f.addresseeClerkId === args.targetClerkId) ||
        (f.requesterClerkId === args.targetClerkId && f.addresseeClerkId === clerkId)
    );
    if (existing) throw new Error("Friendship already exists");
    await ctx.db.insert("friendships", {
      requesterClerkId: clerkId,
      addresseeClerkId: args.targetClerkId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const updateFriendshipStatus = mutation({
  args: { friendshipId: v.id("friendships"), status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("blocked")) },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const row = await ctx.db.get(args.friendshipId);
    if (!row || (row.requesterClerkId !== clerkId && row.addresseeClerkId !== clerkId)) {
      throw new Error("Not allowed");
    }
    await ctx.db.patch(args.friendshipId, { status: args.status, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const removeFriendship = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const row = await ctx.db.get(args.friendshipId);
    if (!row || (row.requesterClerkId !== clerkId && row.addresseeClerkId !== clerkId)) {
      throw new Error("Not allowed");
    }
    await ctx.db.delete(args.friendshipId);
    return { ok: true };
  },
});
