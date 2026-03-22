"use client";

import { useEffect, useMemo, useState } from "react";
import ResourcesPanelContent from "./ResourcesPanelContent";
import ResourcesManagerSidebar from "./ResourcesManagerSidebar";

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

type ScriptureResource = {
  id: string;
  resourceType: "verse" | "verse_range" | "chapter" | "chapter_range";
  title: string;
  description: string | null;
  url: string | null;
  chapterStart: number;
  chapterEnd: number;
  verseStart: number | null;
  verseEnd: number | null;
};

export default function CitationsSidebarPanel({ open, onClose, volume, book, chapter, verseStart, verseEnd }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talks, setTalks] = useState<CitationTalk[]>([]);
  const [resources, setResources] = useState<ScriptureResource[]>([]);
  const [canManageResources, setCanManageResources] = useState(false);

  const verseSpec = useMemo(
    () => (verseEnd && verseEnd > verseStart ? `${verseStart}-${verseEnd}` : String(verseStart)),
    [verseStart, verseEnd]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/citations?volume=${encodeURIComponent(volume)}&book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(String(chapter))}&verses=${encodeURIComponent(verseSpec)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed ${res.status}`);
      const data = (await res.json()) as { talks: CitationTalk[]; resources: ScriptureResource[]; canManageResources?: boolean };
      setTalks(Array.isArray(data?.talks) ? data.talks : []);
      setResources(Array.isArray(data?.resources) ? data.resources : []);
      setCanManageResources(Boolean(data?.canManageResources));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resources");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, volume, book, chapter, verseSpec]);

  if (!open) return null;

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 bg-background/60 backdrop-blur p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Resources</h3>
        <button onClick={onClose} className="px-2.5 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">
          Close
        </button>
      </div>
      <p className="text-sm text-foreground/70">{book.replace(/-/g, " ")} {chapter}:{verseSpec}</p>
      {loading ? <p className="text-sm text-foreground/70">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error ? (
        <ResourcesPanelContent
          talks={talks}
          resources={resources}
        />
      ) : null}
      {!loading && !error && canManageResources ? (
        <ResourcesManagerSidebar
          volume={volume}
          book={book}
          chapter={chapter}
          verseStart={verseStart}
          verseEnd={verseEnd ?? verseStart}
          onCreated={() => void load()}
        />
      ) : null}
    </div>
  );
}
