import {
  fetchSpotifyShow,
  fetchSpotifyShowEpisodesPage,
  isSpotifyConfigured,
  type SpotifyEpisode,
} from "@/lib/spotify";
import { convexMutation, convexQuery } from "@/lib/convexHttp";

export type CuratedFeedSectionConfig = {
  id: string;
  title: string;
  description: string;
  items: Array<{
    spotifyShowId: string;
    spotifyUrl: string;
    note?: string;
  }>;
};

export type CuratedFeedEpisode = {
  id: string;
  spotifyShowId: string;
  spotifyShowName: string;
  spotifyShowPublisher: string;
  spotifyShowUrl: string;
  spotifyShowNote: string | null;
  title: string;
  description: string;
  releaseDate: string;
  releaseDatePrecision: "year" | "month" | "day";
  durationMs: number;
  externalUrl: string;
  embedUrl: string;
  imageUrl: string | null;
  isPlayable: boolean;
};

export type CuratedFeedSection = {
  id: string;
  title: string;
  description: string;
  sourceCount: number;
  episodes: CuratedFeedEpisode[];
  errors: string[];
  nextOffsets: Record<string, number | null>;
  hasMore: boolean;
};

export type CuratedFeedSectionSummary = {
  id: string;
  title: string;
  description: string;
  sourceCount: number;
};

type CachedShowPage = {
  showId: string;
  show: {
    showId: string;
    name: string;
    publisher: string;
    description: string | null;
    externalUrl: string;
    imageUrl: string | null;
    totalEpisodes: number;
    nextOffset: number | null;
    fetchedAt: number;
  } | null;
  cachedCount: number;
  episodes: Array<{
    episodeId: string;
    title: string;
    description: string;
    releaseDate: string;
    releaseDatePrecision: "year" | "month" | "day";
    releaseDateSortKey: string;
    durationMs: number;
    externalUrl: string;
    imageUrl: string | null;
    isPlayable: boolean;
    isExternallyHosted: boolean;
  }>;
};

const SECTION_PAGE_SIZE = 12;

export const curatedFeedSections: CuratedFeedSectionConfig[] = [
  {
    id: "come-follow-me",
    title: "Come Follow Me",
    description: "Weekly study companions focused on the current Come, Follow Me rhythm.",
    items: [
      {
        spotifyShowId: "15G9TTz8yLp0dQyEcBQ8BY",
        spotifyUrl: "https://open.spotify.com/show/15G9TTz8yLp0dQyEcBQ8BY?si=d040804d43d44018",
      },
      {
        spotifyShowId: "38RjwSIpdErIv0bXx5RZ5M",
        spotifyUrl: "https://open.spotify.com/show/38RjwSIpdErIv0bXx5RZ5M?si=9e86eae1c06a4720",
      },
      {
        spotifyShowId: "4abrPCNkIUsPwFtqqHWGRf",
        spotifyUrl: "https://open.spotify.com/show/4abrPCNkIUsPwFtqqHWGRf?si=5ed882d610934936",
      },
      {
        spotifyShowId: "5izcI0usbokwDftpKjKqBl",
        spotifyUrl: "https://open.spotify.com/show/5izcI0usbokwDftpKjKqBl?si=58701c7237844f21",
      },
      {
        spotifyShowId: "4Mb0kn04Y994Fi8mENdVb1",
        spotifyUrl: "https://open.spotify.com/show/4Mb0kn04Y994Fi8mENdVb1?si=0436635a45f64efe",
      },
    ],
  },
  {
    id: "other",
    title: "Other",
    description: "Additional long-form voices and reference listening outside the weekly study sequence.",
    items: [
      {
        spotifyShowId: "6ofIPhD0k2tmggrEDKcLU8",
        spotifyUrl: "https://open.spotify.com/show/6ofIPhD0k2tmggrEDKcLU8?si=02369fe3a89449d1",
      },
      {
        spotifyShowId: "4Mb0kn04Y994Fi8mENdVb1",
        spotifyUrl: "https://open.spotify.com/show/4Mb0kn04Y994Fi8mENdVb1?si=0436635a45f64efe",
      },
      {
        spotifyShowId: "1gLrB5vC2N25zL9pG3FVUB",
        spotifyUrl: "https://open.spotify.com/show/1gLrB5vC2N25zL9pG3FVUB?si=1267d57087cb4f52",
      },
    ],
  },
];

export function getCuratedFeedSectionSummaries(): CuratedFeedSectionSummary[] {
  return curatedFeedSections.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    sourceCount: section.items.length,
  }));
}

function episodeSortKey(episode: { releaseDateSortKey: string; releaseDate: string }) {
  return episode.releaseDateSortKey || episode.releaseDate;
}

function mapEpisode(
  episode: SpotifyEpisode,
  show: Awaited<ReturnType<typeof fetchSpotifyShow>>,
  showUrl: string,
  note: string | null
): CuratedFeedEpisode {
  return {
    id: episode.id,
    spotifyShowId: show.id,
    spotifyShowName: show.name,
    spotifyShowPublisher: show.publisher,
    spotifyShowUrl: showUrl,
    spotifyShowNote: note,
    title: episode.name,
    description: episode.description,
    releaseDate: episode.releaseDate,
    releaseDatePrecision: episode.releaseDatePrecision,
    durationMs: episode.durationMs,
    externalUrl: episode.externalUrl,
    embedUrl: `https://open.spotify.com/embed/episode/${episode.id}?utm_source=generator&theme=0`,
    imageUrl: episode.images[1]?.url || episode.images[0]?.url || show.images[1]?.url || show.images[0]?.url || null,
    isPlayable: episode.isPlayable && !episode.isExternallyHosted,
  };
}

function mapCachedEpisode(
  episode: CachedShowPage["episodes"][number],
  show: NonNullable<CachedShowPage["show"]>,
  showUrl: string,
  note: string | null
): CuratedFeedEpisode {
  return {
    id: episode.episodeId,
    spotifyShowId: show.showId,
    spotifyShowName: show.name,
    spotifyShowPublisher: show.publisher,
    spotifyShowUrl: showUrl,
    spotifyShowNote: note,
    title: episode.title,
    description: episode.description,
    releaseDate: episode.releaseDate,
    releaseDatePrecision: episode.releaseDatePrecision,
    durationMs: episode.durationMs,
    externalUrl: episode.externalUrl,
    embedUrl: `https://open.spotify.com/embed/episode/${episode.episodeId}?utm_source=generator&theme=0`,
    imageUrl: episode.imageUrl || show.imageUrl || null,
    isPlayable: episode.isPlayable && !episode.isExternallyHosted,
  };
}

export async function getCuratedFeedSectionPage(
  sectionId: string,
  offsets?: Record<string, number | null>
): Promise<{
  configured: boolean;
  section: CuratedFeedSection;
}> {
  const configured = isSpotifyConfigured();
  const section = curatedFeedSections.find((entry) => entry.id === sectionId);
  if (!section) {
    throw new Error(`Unknown feed section: ${sectionId}`);
  }

  if (!configured) {
    return {
      configured,
      section: {
        id: section.id,
        title: section.title,
        description: section.description,
        sourceCount: section.items.length,
        episodes: [],
        errors: [],
        nextOffsets: Object.fromEntries(section.items.map((item) => [item.spotifyShowId, 0])),
        hasMore: false,
      },
    };
  }

  const requests = section.items.map((item) => ({
    showId: item.spotifyShowId,
    offset: offsets?.[item.spotifyShowId] ?? 0,
    limit: SECTION_PAGE_SIZE,
  }));

  let cachedPages = await convexQuery<CachedShowPage[]>("feedCache:getShowPages", { requests });

  const settledItems: Array<{
    episodes: Array<{ episode: CuratedFeedEpisode; sortKey: string }>;
    error: string | null;
    spotifyShowId: string;
    nextOffset: number | null;
  }> = [];

  for (const [index, item] of section.items.entries()) {
    const cachedPage = cachedPages[index];
    const request = requests[index];
    try {
      let pageData = cachedPage;

      const hasRequestedSlice =
        pageData?.show &&
        (
          pageData.cachedCount >= request.offset + request.limit ||
          (pageData.show.nextOffset === null && pageData.cachedCount > request.offset)
        );

      if (!hasRequestedSlice) {
        const [show, page] = await Promise.all([
          fetchSpotifyShow(item.spotifyShowId),
          fetchSpotifyShowEpisodesPage(item.spotifyShowId, {
            offset: request.offset,
            limit: SECTION_PAGE_SIZE,
          }),
        ]);
        const fetchedAt = Date.now();
        await convexMutation("feedCache:upsertShowPage", {
          show: {
            showId: show.id,
            name: show.name,
            publisher: show.publisher,
            description: show.description || undefined,
            externalUrl: show.externalUrl,
            imageUrl: show.images[0]?.url || undefined,
            totalEpisodes: show.totalEpisodes,
          },
          nextOffset: page.nextOffset,
          fetchedAt,
          episodes: page.episodes.map((episode) => ({
            episodeId: episode.id,
            title: episode.name,
            description: episode.description || undefined,
            releaseDate: episode.releaseDate,
            releaseDatePrecision: episode.releaseDatePrecision,
            releaseDateSortKey: episode.releaseDateSortKey,
            durationMs: episode.durationMs,
            externalUrl: episode.externalUrl,
            imageUrl: episode.images[0]?.url || undefined,
            isPlayable: episode.isPlayable,
            isExternallyHosted: episode.isExternallyHosted,
          })),
        });

        const refreshed = await convexQuery<CachedShowPage[]>("feedCache:getShowPages", {
          requests: [request],
        });
        pageData = refreshed[0];
      }

      if (!pageData?.show) {
        throw new Error(`Feed cache for ${item.spotifyShowId} is empty`);
      }

      settledItems.push({
        spotifyShowId: item.spotifyShowId,
        nextOffset: pageData.show.nextOffset,
        episodes: pageData.episodes.map((episode) => ({
          episode: mapCachedEpisode(episode, pageData.show!, item.spotifyUrl, item.note ?? null),
          sortKey: episodeSortKey(episode),
        })),
        error: null,
      });
    } catch (error) {
      settledItems.push({
        spotifyShowId: item.spotifyShowId,
        nextOffset: null,
        episodes: [],
        error: error instanceof Error ? error.message : "Failed to load show",
      });
    }
  }

  const episodes = settledItems
    .flatMap((entry) => entry.episodes)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey) || b.episode.id.localeCompare(a.episode.id))
    .map(({ episode }) => episode);

  const nextOffsets = Object.fromEntries(
    settledItems.map((entry) => [entry.spotifyShowId, entry.nextOffset])
  );

  return {
    configured,
    section: {
      id: section.id,
      title: section.title,
      description: section.description,
      sourceCount: section.items.length,
      episodes,
      errors: settledItems.flatMap((entry) => (entry.error ? [entry.error] : [])),
      nextOffsets,
      hasMore: settledItems.some((entry) => entry.nextOffset !== null),
    },
  };
}
