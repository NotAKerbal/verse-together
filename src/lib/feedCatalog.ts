import {
  fetchSpotifyShow,
  fetchSpotifyShowEpisodes,
  isSpotifyConfigured,
  type SpotifyEpisode,
} from "@/lib/spotify";

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
};

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

function episodeSortKey(episode: SpotifyEpisode) {
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

export async function getCuratedFeedSections(): Promise<{
  configured: boolean;
  sections: CuratedFeedSection[];
}> {
  const configured = isSpotifyConfigured();

  if (!configured) {
    return {
      configured,
      sections: curatedFeedSections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        sourceCount: section.items.length,
        episodes: [],
        errors: [],
      })),
    };
  }

  const fetchedSections: CuratedFeedSection[] = [];

  for (const section of curatedFeedSections) {
    const settledItems: Array<{
      episodes: Array<{ episode: CuratedFeedEpisode; sortKey: string }>;
      error: string | null;
    }> = [];

    for (const item of section.items) {
      try {
        const show = await fetchSpotifyShow(item.spotifyShowId);
        const episodes = await fetchSpotifyShowEpisodes(item.spotifyShowId);
        settledItems.push({
          episodes: episodes.map((episode) => ({
            episode: mapEpisode(episode, show, item.spotifyUrl, item.note ?? null),
            sortKey: episodeSortKey(episode),
          })),
          error: null,
        });
      } catch (error) {
        settledItems.push({
          episodes: [],
          error: error instanceof Error ? error.message : "Failed to load show",
        });
      }
    }

    const episodes = settledItems
      .flatMap((entry) => entry.episodes)
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey) || b.episode.id.localeCompare(a.episode.id))
      .map(({ episode }) => episode);

    fetchedSections.push({
      id: section.id,
      title: section.title,
      description: section.description,
      sourceCount: section.items.length,
      episodes,
      errors: settledItems.flatMap((entry) => (entry.error ? [entry.error] : [])),
    });
  }

  return {
    configured,
    sections: fetchedSections,
  };
}
