"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/lib/auth";
import type { CuratedFeedEpisode, CuratedFeedSection } from "@/lib/feedCatalog";

type Props = {
  configured: boolean;
  sections: CuratedFeedSection[];
};

function formatEpisodeDate(value: string, precision: CuratedFeedEpisode["releaseDatePrecision"]) {
  if (!value) return "Date unavailable";
  if (precision === "year") return value;
  if (precision === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}-01T00:00:00Z`));
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export default function CuratedFeed({ configured, sections }: Props) {
  const { user, loading, promptSignIn } = useAuth();
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");
  const [pendingWatchedById, setPendingWatchedById] = useState<Record<string, boolean>>({});
  const allEpisodeIds = sections.flatMap((section) => section.episodes.map((episode) => episode.id));
  const watchedEpisodeIds = useQuery(api.feedEpisodes.getWatchedEpisodeIds, {
    episodeIds: allEpisodeIds,
  }) as string[] | undefined;
  const markEpisodeWatched = useMutation(api.feedEpisodes.markEpisodeWatched);
  const markEpisodeUnwatched = useMutation(api.feedEpisodes.markEpisodeUnwatched);

  useEffect(() => {
    if (!sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sections[0]?.id ?? "");
    }
  }, [activeSectionId, sections]);

  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null;
  const watchedSet = new Set(watchedEpisodeIds ?? []);

  async function toggleWatched(episode: CuratedFeedEpisode) {
    if (!user) {
      void promptSignIn();
      return;
    }

    setPendingWatchedById((current) => ({ ...current, [episode.id]: true }));
    try {
      if (watchedSet.has(episode.id)) {
        await markEpisodeUnwatched({ episodeId: episode.id });
      } else {
        const publishedAt = Date.parse(episode.releaseDate);
        await markEpisodeWatched({
          episodeId: episode.id,
          feedId: activeSection?.id,
          source: episode.spotifyShowName,
          title: episode.title,
          publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
        });
      }
    } finally {
      setPendingWatchedById((current) => {
        const next = { ...current };
        delete next[episode.id];
        return next;
      });
    }
  }

  async function handleEpisodeOpen(episode: CuratedFeedEpisode) {
    if (!user || watchedSet.has(episode.id)) {
      return;
    }

    setPendingWatchedById((current) => ({ ...current, [episode.id]: true }));
    try {
      const publishedAt = Date.parse(episode.releaseDate);
      await markEpisodeWatched({
        episodeId: episode.id,
        feedId: activeSection?.id,
        source: episode.spotifyShowName,
        title: episode.title,
        publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
      });
    } finally {
      setPendingWatchedById((current) => {
        const next = { ...current };
        delete next[episode.id];
        return next;
      });
    }
  }

  return (
    <div className="space-y-5">
      <header className="page-hero overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-[38%] opacity-80"
          style={{
            background:
              "radial-gradient(circle at 70% 30%, color-mix(in oklab, var(--accent-primary) 34%, transparent), transparent 42%), radial-gradient(circle at 40% 70%, color-mix(in oklab, var(--accent-tertiary) 24%, transparent), transparent 48%)",
          }}
        />
        <div className="relative max-w-3xl space-y-3">
          <div className="page-eyebrow">Feed</div>
          <h1 className="page-title">Study listening, split by cadence</h1>
          <p className="page-subtitle text-sm">
            Choose a tab and open episodes directly in Spotify. Watched episodes are tracked for signed-in users so the feed stays useful as a study queue.
          </p>
          {!configured ? (
            <div className="rounded-[1.25rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-4 py-3 text-sm text-[color:var(--foreground-muted)]">
              Spotify credentials are missing, so the tabs are ready but live episode metadata is unavailable. Add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to populate the feed.
            </div>
          ) : null}
          {!loading && !user ? (
            <div className="rounded-[1.25rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-4 py-3 text-sm text-[color:var(--foreground-muted)]">
              Sign in to save watched episodes across devices.
            </div>
          ) : null}
        </div>
      </header>

      <section className="panel-card-strong rounded-[1.7rem] p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => {
            const isActive = section.id === activeSection?.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSectionId(section.id)}
                className="surface-button inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium"
                data-active={isActive ? "true" : "false"}
              >
                {section.title}
                <span className="ml-2 text-xs text-[color:var(--foreground-soft)]">
                  {section.episodes.length}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activeSection ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <div className="page-eyebrow">{activeSection.title}</div>
              <h2 className="text-2xl font-semibold tracking-[-0.035em]">{activeSection.title}</h2>
              <p className="max-w-3xl text-sm leading-6 text-[color:var(--foreground-muted)]">
                {activeSection.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="page-meta">{activeSection.sourceCount} sources</span>
              <span className="page-meta">{activeSection.episodes.length} episodes</span>
            </div>
          </div>

          {activeSection.errors.length > 0 ? (
            <div className="rounded-[1.25rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-4 py-3 text-sm text-[color:var(--foreground-muted)]">
              Some sources could not be loaded, so this tab may be incomplete right now.
            </div>
          ) : null}

          {activeSection.episodes.length === 0 ? (
            <div className="rounded-[1.45rem] border border-dashed border-[color:var(--surface-border)] px-5 py-10 text-center text-sm text-[color:var(--foreground-muted)]">
              No episodes are available in this tab yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {activeSection.episodes.map((episode, index) => {
                const isWatched = watchedSet.has(episode.id);
                const isPendingWatched = pendingWatchedById[episode.id] === true;
                const durationLabel = formatDuration(episode.durationMs);

                return (
                  <article
                    key={episode.id}
                    className="relative overflow-hidden rounded-[1.45rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-4 shadow-[var(--surface-shadow-soft)]"
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-70"
                      style={{
                        background:
                          index % 2 === 0
                            ? "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 12%, transparent), transparent)"
                            : "linear-gradient(180deg, color-mix(in oklab, var(--accent-tertiary) 12%, transparent), transparent)",
                      }}
                    />
                    <a
                      href={episode.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => void handleEpisodeOpen(episode)}
                      className="relative block space-y-4"
                    >
                      <div className="flex items-start gap-4">
                        <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[1rem] border border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] sm:h-20 sm:w-20">
                          {episode.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={episode.imageUrl} alt={episode.spotifyShowName} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.18em] text-[color:var(--foreground-soft)]">
                              Audio
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="page-meta text-[11px]">{formatEpisodeDate(episode.releaseDate, episode.releaseDatePrecision)}</span>
                            {durationLabel ? <span className="page-meta text-[11px]">{durationLabel}</span> : null}
                            {isWatched ? <span className="page-meta text-[11px]">Watched</span> : null}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold leading-tight tracking-[-0.03em]">
                              {episode.title}
                            </h3>
                            <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
                              {episode.spotifyShowName} • {episode.spotifyShowPublisher}
                            </p>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">
                        {episode.description
                          ? truncate(episode.description, 220)
                          : "Spotify did not provide a description for this episode."}
                      </p>

                      {episode.spotifyShowNote ? (
                        <div className="text-xs text-[color:var(--foreground-soft)]">{episode.spotifyShowNote}</div>
                      ) : null}
                    </a>

                    <div className="relative mt-4 flex flex-wrap items-center gap-2">
                      {isWatched ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void toggleWatched(episode);
                          }}
                          className="surface-button inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm"
                          disabled={isPendingWatched}
                        >
                          {isPendingWatched ? "Saving…" : "Mark Unwatched"}
                        </button>
                      ) : (
                        <span className="text-xs text-[color:var(--foreground-soft)]">
                          Open in Spotify to mark watched
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
