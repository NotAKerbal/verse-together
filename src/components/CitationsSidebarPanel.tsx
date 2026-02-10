"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  open: boolean;
  onClose: () => void;
  volume: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
};

type CitationTalk = {
  id?: string;
  title: string;
  speaker?: string;
  year?: string;
  session?: string;
  talkUrl?: string;
  watchUrl?: string;
  listenUrl?: string;
  talkId?: string;
};

export default function CitationsSidebarPanel({ open, onClose, volume, book, chapter, verseStart, verseEnd }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talks, setTalks] = useState<CitationTalk[]>([]);
  const router = useRouter();

  const verseSpec = useMemo(
    () => (verseEnd && verseEnd > verseStart ? `${verseStart}-${verseEnd}` : String(verseStart)),
    [verseStart, verseEnd]
  );

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      setTalks([]);
      try {
        const url = `/api/citations?volume=${encodeURIComponent(volume)}&book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(String(chapter))}&verses=${encodeURIComponent(verseSpec)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const j: { error?: string } = await res.json().catch(() => ({}) as { error?: string });
          throw new Error(j?.error || `Request failed ${res.status}`);
        }
        const data = (await res.json()) as { talks: CitationTalk[] };
        if (!alive) return;
        setTalks(Array.isArray(data?.talks) ? data.talks : []);
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "Failed to load citations";
        setError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, volume, book, chapter, verseSpec]);

  if (!open) return null;

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 bg-background/60 backdrop-blur p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Citations</h3>
        <button onClick={onClose} className="px-2.5 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">
          Close
        </button>
      </div>
      <p className="text-sm text-foreground/70">
        {book.replace(/-/g, " ")} {chapter}:{verseSpec}
      </p>
      {loading ? <p className="text-sm text-foreground/70">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error && talks.length === 0 ? <p className="text-sm text-foreground/70">No citations found.</p> : null}
      {talks.length > 0 ? (
        <ul className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
          {talks.map((t, idx) => (
            <li
              key={t.id ?? `${idx}-${t.title}`}
              className="relative border border-black/10 dark:border-white/15 rounded-lg p-3 bg-black/5 dark:bg-white/5 flex flex-col gap-2 group cursor-pointer"
              onClick={() => {
                const talkId = t.talkId || (t.talkUrl ? (t.talkUrl.match(/talks_ajax\/(\d+)/)?.[1] ?? null) : null);
                if (talkId) {
                  router.push(`/talk/${talkId}`);
                } else if (t.talkUrl) {
                  window.open(t.talkUrl, "_blank", "noopener,noreferrer");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const talkId = t.talkId || (t.talkUrl ? (t.talkUrl.match(/talks_ajax\/(\d+)/)?.[1] ?? null) : null);
                  if (talkId) {
                    router.push(`/talk/${talkId}`);
                  } else if (t.talkUrl) {
                    window.open(t.talkUrl, "_blank", "noopener,noreferrer");
                  }
                }
              }}
              role="button"
              tabIndex={0}
              title="Open talk"
            >
              <div className="text-xs text-foreground/70">
                {t.year ? <span className="mr-1">{t.year}</span> : null}
                {t.session ? <span className="mr-1">{t.session}</span> : null}
              </div>
              <div className="text-sm font-semibold leading-snug">{t.title}</div>
              {t.speaker ? <div className="text-sm text-foreground/80">{t.speaker}</div> : null}
              <div className="flex items-center gap-1.5 pt-0.5">
                {t.watchUrl ? (
                  <a
                    className="px-2.5 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 hover:bg-black/10 dark:hover:bg-white/10"
                    href={t.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Watch
                  </a>
                ) : null}
                {t.listenUrl ? (
                  <a
                    className="px-2.5 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 hover:bg-black/10 dark:hover:bg-white/10"
                    href={t.listenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Listen
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
