"use client";

import { useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Breadcrumbs, { Crumb } from "./Breadcrumbs";
import VerseActionBar from "./VerseActionBar";

type Verse = { verse: number; text: string };

export default function ChapterReader({
  volume,
  book,
  chapter,
  verses,
  reference,
  breadcrumbs,
  prevHref,
  nextHref,
}: {
  volume: string;
  book: string;
  chapter: number;
  verses: Verse[];
  reference: string;
  breadcrumbs: Crumb[];
  prevHref?: string;
  nextHref?: string;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const router = useRouter();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number | null>(null);

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

  function onTouchStart(e: React.TouchEvent) {
    const t = e.changedTouches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    touchStartTime.current = Date.now();
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null || touchStartTime.current == null) return;
    const t = e.changedTouches[0];
    const dx = (t.clientX - touchStartX.current);
    const dy = (t.clientY - touchStartY.current);
    const dt = Date.now() - touchStartTime.current;
    // Basic horizontal swipe detection
    const distanceThreshold = 48; // px
    const velocityOk = dt < 800;
    const horizontalEnough = Math.abs(dx) > distanceThreshold && Math.abs(dx) > Math.abs(dy) * 1.3;
    if (horizontalEnough && velocityOk) {
      if (dx < 0 && nextHref) {
        router.push(nextHref);
      } else if (dx > 0 && prevHref) {
        router.push(prevHref);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
    touchStartTime.current = null;
  }

  return (
    <section className="space-y-4 pb-20" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-black/5 dark:border-white/10 py-2">
        <div className="flex flex-col gap-1">
          <div className="text-xs sm:text-sm">
            <Breadcrumbs items={breadcrumbs} />
          </div>
          <h1 className="text-base sm:text-xl font-semibold">{reference}</h1>
        </div>
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

      <VerseActionBar
        visible={selected.size > 0}
        onClear={() => setSelected(new Set())}
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
    </section>
  );
}
