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
  conference?: string;
  year?: string;
  session?: string;
  href?: string;
  talkUrl?: string;
  watchUrl?: string;
  listenUrl?: string;
  talkId?: string;
};

export default function CitationsModal({ open, onClose, volume, book, chapter, verseStart, verseEnd }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talks, setTalks] = useState<CitationTalk[]>([]);
  const router = useRouter();

  const verseSpec = useMemo(() => (verseEnd && verseEnd > verseStart ? `${verseStart}-${verseEnd}` : String(verseStart)), [verseStart, verseEnd]);

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
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={() => !loading && onClose()} className="absolute inset-0 bg-black/30" />
      <div className="absolute left-3 right-3 sm:left-4 sm:right-4 bottom-0 rounded-t-2xl bg-background shadow-2xl border-t border-black/10 dark:border-white/15 p-4 space-y-3 max-h-[80vh] overflow-auto">
        <div className="h-1 w-10 bg-foreground/20 rounded-full mx-auto mb-1" />
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Citations for {book.replace(/-/g, " ")} {chapter}:{verseSpec}</h3>
          <button onClick={() => onClose()} className="px-3 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">Close</button>
        </div>
        {loading ? <p className="text-sm text-foreground/70">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!loading && !error && talks.length === 0 ? (
          <p className="text-sm text-foreground/70">No citations found.</p>
        ) : null}
        {talks.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {talks.map((t, idx) => (
              <li
                key={t.id ?? `${idx}-${t.title}`}
                className="relative border border-black/10 dark:border-white/15 rounded-lg p-3 bg-black/5 dark:bg-white/5 flex flex-col gap-2 group cursor-pointer"
                onClick={() => {
                  const external = t.watchUrl || t.listenUrl;
                  const talkId = t.talkId || (t.talkUrl ? (t.talkUrl.match(/talks_ajax\/(\d+)/)?.[1] ?? null) : null);
                  if (external) {
                    window.open(external, "_blank", "noopener,noreferrer");
                  } else if (talkId) {
                    router.push(`/talk/${talkId}`);
                    onClose();
                  } else if (t.talkUrl) {
                    window.open(t.talkUrl, "_blank", "noopener,noreferrer");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const external = t.watchUrl || t.listenUrl;
                    const talkId = t.talkId || (t.talkUrl ? (t.talkUrl.match(/talks_ajax\/(\d+)/)?.[1] ?? null) : null);
                    if (external) {
                      window.open(external, "_blank", "noopener,noreferrer");
                    } else if (talkId) {
                      router.push(`/talk/${talkId}`);
                      onClose();
                    } else if (t.talkUrl) {
                      window.open(t.talkUrl, "_blank", "noopener,noreferrer");
                    }
                  }
                }}
                role="button"
                tabIndex={0}
                title="Open talk"
              >
                <div className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-foreground/70">
                  {t.talkId || (t.talkUrl ? (t.talkUrl.match(/talks_ajax\/(\d+)/)?.[1] ?? "") : "")}
                </div>
                <div className="text-sm text-foreground/70">
                  {t.year ? <span className="mr-1">{t.year}</span> : null}
                  {t.session ? <span className="mr-1">{t.session}</span> : null}
                </div>
                <div className="font-semibold leading-snug">{t.title}</div>
                {t.speaker ? <div className="text-sm text-foreground/80">{t.speaker}</div> : null}
                <div className="flex items-center gap-2 pt-1">
                  {t.watchUrl ? (
                    <a
                      className="px-3 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 hover:bg-black/10 dark:hover:bg-white/10"
                      href={t.watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Watch"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Watch
                    </a>
                  ) : null}
                  {t.listenUrl ? (
                    <a
                      className="px-3 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 hover:bg-black/10 dark:hover:bg-white/10"
                      href={t.listenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Listen"
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
        <div className="pt-2 text-[11px] text-foreground/60">
          Data sourced from BYU Citation Index: <code>scriptures.byu.edu</code>
        </div>
      </div>
    </div>
  );
}


