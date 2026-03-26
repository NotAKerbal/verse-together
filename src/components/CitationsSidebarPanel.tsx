"use client";

import { useEffect, useMemo, useState } from "react";
import type { CitationTalk } from "@/lib/citations";
import type { CitationsResponse, ScriptureResource } from "@/lib/citationsApi";
import ResourcesPanelContent from "./ResourcesPanelContent";

type Props = {
  open: boolean;
  onClose: () => void;
  volume: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  selectedVerses?: number[];
  selectedText?: string;
};

export default function CitationsSidebarPanel({
  open,
  onClose,
  volume,
  book,
  chapter,
  verseStart,
  verseEnd,
  selectedVerses,
  selectedText,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talks, setTalks] = useState<CitationTalk[]>([]);
  const [resources, setResources] = useState<ScriptureResource[]>([]);

  const verseSpec = useMemo(
    () => (verseEnd && verseEnd > verseStart ? `${verseStart}-${verseEnd}` : String(verseStart)),
    [verseStart, verseEnd]
  );
  const selectedVerseSpec = useMemo(() => (selectedVerses ?? []).join(","), [selectedVerses]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        volume,
        book,
        chapter: String(chapter),
        verses: verseSpec,
      });
      if (selectedVerseSpec) params.set("selectedVerses", selectedVerseSpec);
      if (selectedText) params.set("selectedText", selectedText);
      const url = `/api/citations?${params.toString()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed ${res.status}`);
      const data = (await res.json()) as CitationsResponse;
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
  }, [open, volume, book, chapter, verseSpec, selectedText, selectedVerseSpec]);

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
    </div>
  );
}
