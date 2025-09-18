"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Verse = { verse: number; text: string };

export default function ChapterReader({
  volume,
  book,
  chapter,
  verses,
  reference,
  prevHref,
  nextHref,
}: {
  volume: string;
  book: string;
  chapter: number;
  verses: Verse[];
  reference: string;
  prevHref?: string;
  nextHref?: string;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggleVerse(n: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  }

  // range selection removed from UI for simplicity

  const selectedText = useMemo(() => {
    const picked = verses.filter((v) => selected.has(v.verse));
    return picked.map((v) => `${v.verse}. ${v.text}`).join("\n");
  }, [verses, selected]);

  // first/last verse values not currently used

  return (
    <section className="space-y-4">
      <header className="sticky top-[56px] z-10 bg-background/80 backdrop-blur border-b border-black/5 dark:border-white/10 py-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base sm:text-xl font-semibold">{reference}</h1>
          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
            {prevHref ? (
              <Link href={prevHref} className="underline underline-offset-4">Previous</Link>
            ) : (
              <span className="text-foreground/50">Previous</span>
            )}
            <span className="text-foreground/30">•</span>
            {nextHref ? (
              <Link href={nextHref} className="underline underline-offset-4">Next</Link>
            ) : (
              <span className="text-foreground/50">Next</span>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
            title="Clear selection"
            className="inline-flex items-center justify-center rounded-full border border-black/10 dark:border-white/15 w-8 h-8 text-lg leading-none hover:bg-black/5 dark:hover:bg-white/10"
          >
            ×
          </button>

          <div className="ml-auto flex items-center gap-2">
            <ActionButtons
              disabled={selected.size === 0}
              onShare={async () => {
                const s = Math.min(...Array.from(selected));
                const e = Math.max(...Array.from(selected));
                const { data: session } = await supabase.auth.getSession();
                if (!session.session) {
                  alert("Please sign in to share.");
                  return;
                }
                await supabase.from("scripture_shares").insert({
                  volume,
                  book,
                  chapter,
                  verse_start: s,
                  verse_end: e,
                  translation: null,
                  note: null,
                  content: selectedText || null,
                });
                alert("Shared!");
              }}
              onLike={async () => {
                const { data: session } = await supabase.auth.getSession();
                if (!session.session) {
                  alert("Please sign in to react.");
                  return;
                }
                // Like for the first selected verse range as a share-less quick reaction is ambiguous.
                // Encourage share flow then like on feed; keep as no-op here for now.
                alert("Tip: Share selection, then like it on the home feed.");
              }}
              onComment={async () => {
                const { data: session } = await supabase.auth.getSession();
                if (!session.session) {
                  alert("Please sign in to comment.");
                  return;
                }
                const text = prompt("Add a quick comment about your selection:")?.trim();
                if (!text) return;
                // Create a share to attach comments to
                const s = Math.min(...Array.from(selected));
                const e = Math.max(...Array.from(selected));
                const { data, error } = await supabase
                  .from("scripture_shares")
                  .insert({
                    volume,
                    book,
                    chapter,
                    verse_start: s,
                    verse_end: e,
                    translation: null,
                    note: null,
                    content: selectedText || null,
                  })
                  .select("id")
                  .single();
                if (error || !data) return alert(error?.message ?? "Failed creating share");
                const shareId = (data as { id: string }).id;
                const { error: e2 } = await supabase
                  .from("scripture_comments")
                  .insert({ share_id: shareId, body: text });
                if (e2) return alert(e2.message);
                alert("Comment posted on your new share!");
              }}
            />
          </div>
        </div>

        {selectedText ? (
          <div className="mt-2 text-xs sm:text-sm text-foreground/70 line-clamp-2">{selectedText}</div>
        ) : null}
      </header>

      <ol className="space-y-2 sm:space-y-3">
        {verses.map((v) => {
          const isSelected = selected.has(v.verse);
          return (
            <li key={v.verse} className={`leading-7 rounded-md px-2 -mx-2 ${isSelected ? "bg-amber-200/50 dark:bg-amber-400/25 ring-1 ring-amber-600/30" : ""}`}>
              <button
                onClick={() => toggleVerse(v.verse)}
                className="text-left w-full"
              >
                <span className="mr-2 text-foreground/60 text-xs sm:text-sm align-top">{v.verse}</span>
                <span>{v.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ActionButtons({ disabled, onShare, onLike, onComment }: { disabled: boolean; onShare: () => void; onLike: () => void; onComment: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onShare}
        disabled={disabled}
        className="inline-flex items-center rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        Share
      </button>
      <button
        onClick={onLike}
        disabled={disabled}
        className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
      >
        ❤ Like
      </button>
      <button
        onClick={onComment}
        disabled={disabled}
        className="inline-flex items-center rounded-md border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
      >
        💬 Comment
      </button>
    </div>
  );
}


