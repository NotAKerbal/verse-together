"use client";

import { useEffect, useMemo, useState } from "react";
import ResourcesPanelContent from "./ResourcesPanelContent";

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

export default function CitationsModal({ open, onClose, volume, book, chapter, verseStart, verseEnd }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talks, setTalks] = useState<CitationTalk[]>([]);
  const [resources, setResources] = useState<ScriptureResource[]>([]);

  const verseSpec = useMemo(() => (verseEnd && verseEnd > verseStart ? `${verseStart}-${verseEnd}` : String(verseStart)), [verseStart, verseEnd]);

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
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={() => !loading && onClose()} className="absolute inset-0 bg-black/30" />
      <div className="absolute left-3 right-3 sm:left-4 sm:right-4 bottom-0 rounded-t-2xl bg-background shadow-2xl border-t border-black/10 dark:border-white/15 p-4 space-y-3 max-h-[85vh] overflow-auto">
        <div className="h-1 w-10 bg-foreground/20 rounded-full mx-auto mb-1" />
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Resources for {book.replace(/-/g, " ")} {chapter}:{verseSpec}</h3>
          <button onClick={() => onClose()} className="px-3 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">Close</button>
        </div>
        {loading ? <p className="text-sm text-foreground/70">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!loading && !error ? (
          <ResourcesPanelContent
            talks={talks}
            resources={resources}
          />
        ) : null}
      </div>
    </div>
  );
}
