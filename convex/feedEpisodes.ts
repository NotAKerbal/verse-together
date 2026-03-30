// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const listWatchedEpisodes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return [];
    const rows = await ctx.db
      .query("feedEpisodeWatches")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .collect();

    return rows.map((row: any) => ({
      episodeId: row.episodeId,
      feedId: row.feedId ?? null,
      source: row.source ?? null,
      title: row.title ?? null,
      publishedAt: row.publishedAt ?? null,
      watchedAt: row.watchedAt,
      updatedAt: row.updatedAt,
    }));
  },
});

export const getWatchedEpisodeIds = query({
  args: {
    episodeIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return [];

    const rows = await ctx.db
      .query("feedEpisodeWatches")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .collect();

    if (!args.episodeIds || args.episodeIds.length === 0) {
      return rows.map((row: any) => row.episodeId);
    }

    const requestedIds = new Set(args.episodeIds);
    return rows
      .map((row: any) => row.episodeId)
      .filter((episodeId: string) => requestedIds.has(episodeId));
  },
});

export const markEpisodeWatched = mutation({
  args: {
    episodeId: v.string(),
    feedId: v.optional(v.string()),
    source: v.optional(v.string()),
    title: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("feedEpisodeWatches")
      .withIndex("by_clerk_episode", (q: any) => q.eq("clerkId", clerkId).eq("episodeId", args.episodeId))
      .unique();

    const payload = {
      feedId: normalizeOptionalString(args.feedId),
      source: normalizeOptionalString(args.source),
      title: normalizeOptionalString(args.title),
      publishedAt: typeof args.publishedAt === "number" ? args.publishedAt : undefined,
      watchedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ok: true };
    }

    await ctx.db.insert("feedEpisodeWatches", {
      clerkId,
      episodeId: args.episodeId,
      ...payload,
    });
    return { ok: true };
  },
});

export const markEpisodeUnwatched = mutation({
  args: {
    episodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireClerkId(ctx);
    const existing = await ctx.db
      .query("feedEpisodeWatches")
      .withIndex("by_clerk_episode", (q: any) => q.eq("clerkId", clerkId).eq("episodeId", args.episodeId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { ok: true };
  },
});
