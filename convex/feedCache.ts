// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const releaseDatePrecision = v.union(v.literal("year"), v.literal("month"), v.literal("day"));

export const getShowPages = query({
  args: {
    requests: v.array(
      v.object({
        showId: v.string(),
        offset: v.number(),
        limit: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];

    for (const request of args.requests) {
      const show = await ctx.db
        .query("spotifyShowCache")
        .withIndex("by_show_id", (q: any) => q.eq("showId", request.showId))
        .unique();

      const allEpisodes = await ctx.db
        .query("spotifyEpisodeCache")
        .withIndex("by_show_release", (q: any) => q.eq("showId", request.showId))
        .order("desc")
        .collect();

      const slice = allEpisodes.slice(request.offset, request.offset + request.limit);
      results.push({
        showId: request.showId,
        show: show
          ? {
              showId: show.showId,
              name: show.name,
              publisher: show.publisher,
              description: show.description ?? null,
              externalUrl: show.externalUrl,
              imageUrl: show.imageUrl ?? null,
              totalEpisodes: show.totalEpisodes,
              nextOffset: typeof show.nextOffset === "number" ? show.nextOffset : null,
              fetchedAt: show.fetchedAt,
            }
          : null,
        cachedCount: allEpisodes.length,
        episodes: slice.map((episode: any) => ({
          episodeId: episode.episodeId,
          title: episode.title,
          description: episode.description ?? "",
          releaseDate: episode.releaseDate,
          releaseDatePrecision: episode.releaseDatePrecision,
          releaseDateSortKey: episode.releaseDateSortKey,
          durationMs: episode.durationMs,
          externalUrl: episode.externalUrl,
          imageUrl: episode.imageUrl ?? null,
          isPlayable: episode.isPlayable,
          isExternallyHosted: episode.isExternallyHosted,
        })),
      });
    }

    return results;
  },
});

export const upsertShowPage = mutation({
  args: {
    show: v.object({
      showId: v.string(),
      name: v.string(),
      publisher: v.string(),
      description: v.optional(v.string()),
      externalUrl: v.string(),
      imageUrl: v.optional(v.string()),
      totalEpisodes: v.number(),
    }),
    nextOffset: v.union(v.number(), v.null()),
    fetchedAt: v.number(),
    episodes: v.array(
      v.object({
        episodeId: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        releaseDate: v.string(),
        releaseDatePrecision: releaseDatePrecision,
        releaseDateSortKey: v.string(),
        durationMs: v.number(),
        externalUrl: v.string(),
        imageUrl: v.optional(v.string()),
        isPlayable: v.boolean(),
        isExternallyHosted: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingShow = await ctx.db
      .query("spotifyShowCache")
      .withIndex("by_show_id", (q: any) => q.eq("showId", args.show.showId))
      .unique();

    const showPayload = {
      showId: args.show.showId,
      name: args.show.name,
      publisher: args.show.publisher,
      description: args.show.description,
      externalUrl: args.show.externalUrl,
      imageUrl: args.show.imageUrl,
      totalEpisodes: args.show.totalEpisodes,
      nextOffset: args.nextOffset === null ? undefined : args.nextOffset,
      fetchedAt: args.fetchedAt,
      updatedAt: now,
    };

    if (existingShow) {
      await ctx.db.patch(existingShow._id, showPayload);
    } else {
      await ctx.db.insert("spotifyShowCache", showPayload);
    }

    for (const episode of args.episodes) {
      const existingEpisode = await ctx.db
        .query("spotifyEpisodeCache")
        .withIndex("by_show_episode", (q: any) =>
          q.eq("showId", args.show.showId).eq("episodeId", episode.episodeId)
        )
        .unique();

      const episodePayload = {
        showId: args.show.showId,
        episodeId: episode.episodeId,
        title: episode.title,
        description: episode.description,
        releaseDate: episode.releaseDate,
        releaseDatePrecision: episode.releaseDatePrecision,
        releaseDateSortKey: episode.releaseDateSortKey,
        durationMs: episode.durationMs,
        externalUrl: episode.externalUrl,
        imageUrl: episode.imageUrl,
        isPlayable: episode.isPlayable,
        isExternallyHosted: episode.isExternallyHosted,
        fetchedAt: args.fetchedAt,
        updatedAt: now,
      };

      if (existingEpisode) {
        await ctx.db.patch(existingEpisode._id, episodePayload);
      } else {
        await ctx.db.insert("spotifyEpisodeCache", episodePayload);
      }
    }

    return { ok: true };
  },
});
