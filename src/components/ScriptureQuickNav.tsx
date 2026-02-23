"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getQuickNavSuggestions } from "@/lib/scriptureQuickNav";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";

type VerseItem = { verse: number; text: string };

type Props = {
  currentVolume?: string;
  currentBook?: string;
  verses?: VerseItem[];
  className?: string;
};

function isReferenceLike(value: string): boolean {
  return /\d/.test(value);
}

const verseLengthMemoryCache = new Map<string, number[]>();

function parseBrowseLocation(pathname: string): { volume?: string; book?: string } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "browse") return {};
  return { volume: parts[1], book: parts[2] };
}

function makeCacheKey(volume: string, book: string): string {
  return `quick-nav-meta:${volume}:${book}`;
}

export default function ScriptureQuickNav({ currentVolume, currentBook, verses = [], className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chapterVerseCounts, setChapterVerseCounts] = useState<number[] | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const locationData = useMemo(() => parseBrowseLocation(pathname), [pathname]);
  const activeVolume = normalizeScriptureVolume(currentVolume ?? locationData.volume ?? "");
  const activeBook = currentBook ?? locationData.book;

  const quickSuggestions = useMemo(() => getQuickNavSuggestions(query, 14), [query]);
  const filteredSuggestions = useMemo(() => {
    if (!chapterVerseCounts || !activeVolume || !activeBook) return quickSuggestions;
    return quickSuggestions.filter((item) => {
      if (!item.verse) return true;
      if (item.volume !== activeVolume || item.book !== activeBook) return true;
      const maxVerse = chapterVerseCounts[item.chapter - 1] ?? 0;
      if (maxVerse <= 0) return true;
      return item.verse <= maxVerse;
    });
  }, [quickSuggestions, chapterVerseCounts, activeVolume, activeBook]);

  const chapterMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !verses.length || isReferenceLike(needle)) return [];
    return verses
      .filter((item) => item.text.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [query, verses]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!activeVolume || !activeBook) return;
    const volumeForFetch = activeVolume;
    const bookForFetch = activeBook;
    const key = makeCacheKey(volumeForFetch, bookForFetch);
    const inMemory = verseLengthMemoryCache.get(key);
    if (inMemory && inMemory.length > 0) {
      setChapterVerseCounts(inMemory);
      return;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { expiresAt?: number; verseCounts?: number[] };
        if ((parsed.expiresAt ?? 0) > Date.now() && Array.isArray(parsed.verseCounts)) {
          verseLengthMemoryCache.set(key, parsed.verseCounts);
          setChapterVerseCounts(parsed.verseCounts);
          return;
        }
      }
    } catch {
      // Ignore cache parse errors and fetch fresh metadata.
    }

    let cancelled = false;
    async function fetchChapterMeta() {
      try {
        const res = await fetch(
          `/api/tools/quick-nav?volume=${encodeURIComponent(volumeForFetch)}&book=${encodeURIComponent(bookForFetch)}`,
          { cache: "force-cache" }
        );
        if (!res.ok) return;
        const payload = (await res.json()) as { verseCounts?: number[] };
        if (!Array.isArray(payload.verseCounts)) return;
        if (cancelled) return;
        verseLengthMemoryCache.set(key, payload.verseCounts);
        setChapterVerseCounts(payload.verseCounts);
        try {
          window.localStorage.setItem(
            key,
            JSON.stringify({
              expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
              verseCounts: payload.verseCounts,
            })
          );
        } catch {
          // Ignore storage failures.
        }
      } catch {
        // Best effort cache fill only.
      }
    }
    void fetchChapterMeta();
    return () => {
      cancelled = true;
    };
  }, [activeVolume, activeBook]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  function navigateTo(href: string, targetVolume: string) {
    const nextUrl = new URL(href, window.location.origin);
    const currentParams = new URLSearchParams(window.location.search);
    const currentTranslation = currentParams.get("translation");
    const lessonId = currentParams.get("lessonId");
    const compare = currentParams.getAll("compare");
    if (lessonId) {
      nextUrl.searchParams.set("lessonId", lessonId);
    }
    if ((targetVolume === "oldtestament" || targetVolume === "newtestament") && currentTranslation) {
      nextUrl.searchParams.set("translation", currentTranslation);
      compare.forEach((value) => nextUrl.searchParams.append("compare", value));
    }
    router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    setOpen(false);
    setQuery("");
  }

  function jumpToVerse(verse: number) {
    const targetId = `v-${verse}`;
    if (pathname.includes("/browse/") && document.getElementById(targetId)) {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${targetId}`);
      window.dispatchEvent(new CustomEvent("quick-nav-jump", { detail: { verse } }));
      setOpen(false);
      return;
    }
    router.push(`${window.location.pathname}${window.location.search}#${targetId}`);
    window.dispatchEvent(new CustomEvent("quick-nav-jump", { detail: { verse } }));
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        aria-label="Quick scripture navigation"
        title="Quick scripture navigation"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md border surface-card backdrop-blur"
      >
        🔎
      </button>

      {open ? (
        <div className="absolute left-0 top-10 z-40 w-[min(28rem,88vw)] rounded-lg border surface-card p-2 shadow-xl backdrop-blur">
          <div className="space-y-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chapter or jump (ex: j151, 1 ne 3:7)"
              className="w-full rounded-md border border-black/10 dark:border-white/15 bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            {query.trim() ? (
              <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
                {filteredSuggestions.length > 0 ? (
                  <div className="space-y-1">
                    <div className="px-1 text-[11px] uppercase tracking-wide text-foreground/60">Quick Jump</div>
                    {filteredSuggestions.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => navigateTo(item.href, item.volume)}
                        className="w-full rounded-md border border-transparent px-2.5 py-2 text-left text-sm hover:border-black/10 hover:bg-black/5 dark:hover:border-white/15 dark:hover:bg-white/10"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {verses.length > 0 && chapterMatches.length > 0 ? (
                  <div className="space-y-1">
                    <div className="px-1 text-[11px] uppercase tracking-wide text-foreground/60">Current Chapter</div>
                    {chapterMatches.map((item) => (
                      <button
                        key={`chapter-${item.verse}`}
                        type="button"
                        onClick={() => jumpToVerse(item.verse)}
                        className="w-full rounded-md border border-transparent px-2.5 py-2 text-left text-sm hover:border-black/10 hover:bg-black/5 dark:hover:border-white/15 dark:hover:bg-white/10"
                      >
                        <span className="text-foreground/60">{item.verse}</span>
                        <span className="mx-2 text-foreground/35">-</span>
                        <span className="text-foreground/85">{item.text.slice(0, 88)}{item.text.length > 88 ? "..." : ""}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {filteredSuggestions.length === 0 && chapterMatches.length === 0 ? (
                  <div className="rounded-md border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5 px-2.5 py-2 text-sm text-foreground/70">
                    No matches found.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5 px-2.5 py-2 text-xs text-foreground/70">
                Type an abbreviation or compact ref. Example: <span className="font-medium">j151</span>, <span className="font-medium">john15:1</span>, <span className="font-medium">1 ne 3</span>.
                {currentVolume ? ` Current volume: ${currentVolume}.` : ""}
                <div className="mt-1 text-foreground/60">
                  Note: cross-chapter verse search is still limited and may miss some matches.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
