"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function CitationsModal({
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
  const [resources, setResources] = useState<ScriptureResource[]>([]);

  const verseSpec = useMemo(() => (verseEnd && verseEnd > verseStart ? `${verseStart}-${verseEnd}` : String(verseStart)), [verseStart, verseEnd]);
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
          <ResourcesPanelContent resources={resources} />
        ) : null}
      </div>
    </div>
  );
}
