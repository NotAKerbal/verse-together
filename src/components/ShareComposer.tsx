"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

type Verse = { verse: number; text: string };

export default function ShareComposer({
  volume,
  book,
  chapter,
  verses,
  reference,
}: {
  volume: string;
  book: string;
  chapter: number;
  verses: Verse[];
  reference: string;
}) {
  const { user } = useAuth();
  const [start, setStart] = useState<number>(verses?.[0]?.verse ?? 1);
  const [end, setEnd] = useState<number>(verses?.[0]?.verse ?? 1);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const selectedContent = useMemo(() => {
    if (!Array.isArray(verses)) return "";
    const s = Math.min(start, end);
    const e = Math.max(start, end);
    return verses
      .filter((v) => v.verse >= s && v.verse <= e)
      .map((v) => `${v.verse}. ${v.text}`)
      .join("\n");
  }, [verses, start, end]);

  async function createShare() {
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Please sign in to share.");
      const { error } = await supabase.from("scripture_shares").insert({
        volume,
        book,
        chapter,
        verse_start: Math.min(start, end),
        verse_end: Math.max(start, end),
        translation: null,
        note: note || null,
        content: selectedContent || null,
      });
      if (error) throw error;
      setOk("Shared!");
      setNote("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to share";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const minVerse = verses?.[0]?.verse ?? 1;
  const maxVerse = verses?.[verses.length - 1]?.verse ?? 1;

  if (!user) return null;
  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-medium">Share a highlight from {reference}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm w-24">
          <span className="mb-1 text-foreground/70">Start</span>
          <input
            type="number"
            min={minVerse}
            max={maxVerse}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm w-24">
          <span className="mb-1 text-foreground/70">End</span>
          <input
            type="number"
            min={minVerse}
            max={maxVerse}
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
            className="rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
          />
        </label>
        <div className="flex-1 min-w-[240px]">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-foreground/70">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-black/10 dark:border-white/15 bg-transparent px-3 py-2"
            />
          </label>
        </div>
        <button
          onClick={createShare}
          disabled={loading}
          className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Sharing…" : "Share"}
        </button>
      </div>
      {selectedContent ? (
        <pre className="whitespace-pre-wrap text-sm text-foreground/80 border border-black/10 dark:border-white/15 rounded-md p-3">{selectedContent}</pre>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm text-green-700">{ok}</p> : null}
    </section>
  );
}


