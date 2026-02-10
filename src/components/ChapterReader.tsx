"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Breadcrumbs, { Crumb } from "./Breadcrumbs";
import VerseActionBar from "./VerseActionBar";
import DesktopVerseActionList from "./DesktopVerseActionList";
import CitationsModal from "./CitationsModal";
import VerseExplorer from "./VerseExplorer";
import CitationsSidebarPanel from "./CitationsSidebarPanel";
import VerseExplorerSidebarPanel from "./VerseExplorerSidebarPanel";
import { useAuth } from "@/lib/auth";
import FootnoteModal from "./FootnoteModal";
import type { Footnote } from "@/lib/openscripture";
import { fetchChapter } from "@/lib/openscripture";
import ReaderSettings from "./ReaderSettings";
import type { ReaderPreferences } from "@/lib/preferences";
import { getDefaultPreferences, loadPreferences, savePreferences, hasSeenTapToActionsHint, setSeenTapToActionsHint } from "@/lib/preferences";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";

type Verse = { verse: number; text: string; footnotes?: Footnote[] };

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
  const { user, getToken } = useAuth();
  const { appendScriptureBlock, openBuilder } = useInsightBuilder();
  const [prefs, setPrefs] = useState<ReaderPreferences>(getDefaultPreferences());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const router = useRouter();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number | null>(null);
  const [openFootnote, setOpenFootnote] = useState<null | { footnote: string; verseText: string; highlightText?: string }>(null);
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [animTargetX, setAnimTargetX] = useState<number | null>(null);
  const navHrefRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const [prevPreview, setPrevPreview] = useState<null | { reference: string; preview: string }>(null);
  const [nextPreview, setNextPreview] = useState<null | { reference: string; preview: string }>(null);
  const [openCitations, setOpenCitations] = useState(false);
  const [openExplorer, setOpenExplorer] = useState(false);
  const overlayOpen = !!openFootnote || openCitations || openExplorer;
  const [showTapHint, setShowTapHint] = useState(false);

  function parseBrowseHref(href: string | undefined): { volume: string; book: string; chapter: number } | null {
    if (!href) return null;
    const clean = href.split("?")[0].split("#")[0];
    const parts = clean.split("/").filter(Boolean);
    // expect: ["browse", volume, book, chapter]
    if (parts.length >= 4 && parts[0] === "browse") {
      const vol = decodeURIComponent(parts[1] || "");
      const b = decodeURIComponent(parts[2] || "");
      const chStr = decodeURIComponent(parts[3] || "");
      const ch = Number(chStr);
      if (vol && b && Number.isFinite(ch)) return { volume: vol, book: b, chapter: ch };
    }
    return null;
  }

  useEffect(() => {
    let cancelled = false;
    async function prefetch() {
      const nextInfo = parseBrowseHref(nextHref);
      const prevInfo = parseBrowseHref(prevHref);
      try {
        if (nextInfo) {
          const chap = await fetchChapter(nextInfo.volume, nextInfo.book, nextInfo.chapter);
          if (!cancelled) {
            const text = chap.verses.slice(0, 3).map(v => `${v.verse}. ${v.text}`).join("\n");
            setNextPreview({ reference: chap.reference, preview: text });
          }
        } else {
          setNextPreview(null);
        }
      } catch {
        if (!cancelled) setNextPreview(null);
      }
      try {
        if (prevInfo) {
          const chap = await fetchChapter(prevInfo.volume, prevInfo.book, prevInfo.chapter);
          if (!cancelled) {
            const text = chap.verses.slice(0, 3).map(v => `${v.verse}. ${v.text}`).join("\n");
            setPrevPreview({ reference: chap.reference, preview: text });
          }
        } else {
          setPrevPreview(null);
        }
      } catch {
        if (!cancelled) setPrevPreview(null);
      }
    }
    prefetch();
    return () => {
      cancelled = true;
    };
  }, [nextHref, prevHref]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = user ? await getToken({ template: "convex" }) : null;
      const loaded = await loadPreferences(user?.id ?? null, token);
      if (!alive) return;
      setPrefs(loaded);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, getToken]);

  useEffect(() => {
    // Show one-time hint on first use
    try {
      if (!hasSeenTapToActionsHint()) {
        setShowTapHint(true);
      }
    } catch {
      // ignore
    }
  }, []);

  function toggleVerse(n: number) {
    if (showTapHint) {
      try { setSeenTapToActionsHint(); } catch {}
      setShowTapHint(false);
    }
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
  const hasSelection = selected.size > 0;
  const selectedBounds = useMemo(() => {
    if (!hasSelection) return null;
    const verseList = Array.from(selected);
    return {
      start: Math.min(...verseList),
      end: Math.max(...verseList),
    };
  }, [hasSelection, selected]);

  const selectedFirstWord = useMemo(() => {
    // Prefer DOM text selection when available
    if (typeof window !== "undefined") {
      const sel = window.getSelection?.();
      const raw = sel ? String(sel.toString()) : "";
      const trimmed = raw.trim();
      if (trimmed) {
        const mSel = trimmed.match(/[A-Za-z][A-Za-z'\-]*/);
        if (mSel?.[0]) return mSel[0].toLowerCase();
      }
    }
    const picked = verses.filter((v) => selected.has(v.verse));
    const text = picked.map((v) => v.text).join(" ");
    const m = text.match(/[A-Za-z][A-Za-z'\-]*/);
    return m?.[0]?.toLowerCase() ?? "";
  }, [verses, selected]);

  // first/last verse values not currently used

  function renderVerseText(v: Verse) {
    if (!prefs.showFootnotes) return v.text;
    const fns = v.footnotes ?? [];
    if (!fns || fns.length === 0) return v.text;
    const parts: Array<ReactNode> = [];
    const sorted = fns
      .slice()
      .filter((f) => typeof f.start === "number" && typeof f.end === "number")
      .sort((a, b) => (a.start! - b.start!));
    let cursor = 0;
    sorted.forEach((fn, idx) => {
      const start = Math.max(0, Math.min(v.text.length, fn.start ?? 0));
      const originalEnd = Math.max(start, Math.min(v.text.length - 1, (fn.end ?? start)));
      if (start > cursor) {
        parts.push(v.text.slice(cursor, start));
      }
      let displayEnd = originalEnd;
      let trailing = "";
      while (displayEnd >= start && /\s/.test(v.text.charAt(displayEnd))) {
        trailing = v.text.charAt(displayEnd) + trailing;
        displayEnd -= 1;
      }
      if (displayEnd >= start) {
        const highlighted = v.text.slice(start, displayEnd + 1);
        parts.push(
          <span
            key={`fn-${v.verse}-${idx}-${start}-${displayEnd}`}
            className="bg-sky-200/50 dark:bg-sky-400/25 rounded px-0.5 cursor-pointer ring-1 ring-sky-600/20"
            onClick={(e) => {
              e.stopPropagation();
              setOpenFootnote({ footnote: fn.footnote, verseText: v.text, highlightText: highlighted });
            }}
            role="button"
            aria-label="Show footnote"
          >
            {highlighted}
          </span>
        );
      }
      if (trailing) {
        parts.push(trailing);
      }
      cursor = originalEnd + 1;
    });
    if (cursor < v.text.length) {
      parts.push(v.text.slice(cursor));
    }
    return <>{parts}</>;
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.changedTouches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    touchStartTime.current = Date.now();
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    const horizontalEnough = Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2;
    if (!horizontalEnough) return;
    setIsDragging(true);
    const hasPrev = !!prevHref;
    const hasNext = !!nextHref;
    const direction = dx < 0 ? -1 : 1;
    const allowed = (direction < 0 && hasNext) || (direction > 0 && hasPrev);
    const maxDrag = typeof window !== "undefined" ? Math.max(120, Math.floor(window.innerWidth * 0.92)) : 120;
    const clamp = allowed ? maxDrag : 24;
    const clamped = Math.max(-clamp, Math.min(clamp, dx));
    setDragDx(clamped);
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
    let targetHref: string | null = null;
    let slideX = 0;
    if (horizontalEnough && velocityOk) {
      if (dx < 0 && nextHref) {
        targetHref = nextHref;
        slideX = -window.innerWidth;
      } else if (dx > 0 && prevHref) {
        targetHref = prevHref;
        slideX = window.innerWidth;
      }
    }
    if (targetHref) {
      navHrefRef.current = targetHref;
      leavingRef.current = true;
      setAnimTargetX(slideX);
    } else {
      setAnimTargetX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    touchStartTime.current = null;
  }

  function onTransitionEnd() {
    if (leavingRef.current && navHrefRef.current) {
      const href = navHrefRef.current;
      navHrefRef.current = null;
      leavingRef.current = false;
      router.push(href);
      return;
    }
    setAnimTargetX(null);
    setIsDragging(false);
    setDragDx(0);
  }

  const translateX = animTargetX !== null ? animTargetX : isDragging ? dragDx : 0;
  const progress = Math.min(1, Math.max(0, Math.abs(translateX) / (typeof window !== "undefined" ? Math.max(120, Math.floor(window.innerWidth * 0.92)) : 120)));
  const overlayOpacity = progress * 0.9; // fade-in intensity
  const transition = animTargetX !== null ? "transform 240ms ease-out" : isDragging ? "none" : undefined;

  function clearSelection() {
    setSelected(new Set());
  }

  async function onAddToInsight() {
    if (!user) {
      alert("Please sign in to build insights.");
      return;
    }
    if (!selectedBounds) return;
    const reference = `${book} ${chapter}:${selectedBounds.start}${selectedBounds.end !== selectedBounds.start ? `-${selectedBounds.end}` : ""}`;
    await appendScriptureBlock({
      volume,
      book,
      chapter,
      verseStart: selectedBounds.start,
      verseEnd: selectedBounds.end,
      reference,
      text: selectedText || null,
    });
    openBuilder();
    clearSelection();
  }

  function onOpenCitations() {
    if (!selectedBounds) return;
    setOpenExplorer(false);
    setOpenCitations(true);
  }

  function onOpenExplore() {
    if (!selectedBounds) return;
    setOpenCitations(false);
    setOpenExplorer(true);
  }

  return (
    <section className="space-y-4 pb-20" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Preview overlay behind the sliding content */}
      {isDragging || animTargetX !== null ? (
        <div className="pointer-events-none fixed inset-0 z-0">
          {/* Right swipe shows previous title */}
          {translateX > 0 && prevPreview ? (
            <div className="absolute inset-0 flex items-start justify-start">
              <div className="m-3 sm:m-4 rounded-md border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-3 py-2 shadow"
                   style={{ opacity: overlayOpacity }}>
                <div className="text-base sm:text-xl font-semibold">{prevPreview.reference}</div>
              </div>
            </div>
          ) : null}
          {/* Left swipe shows next title */}
          {translateX < 0 && nextPreview ? (
            <div className="absolute inset-0 flex items-start justify-end">
              <div className="m-3 sm:m-4 rounded-md border border-black/10 dark:border-white/15 bg-background/80 backdrop-blur px-3 py-2 shadow text-right"
                   style={{ opacity: overlayOpacity }}>
                <div className="text-base sm:text-xl font-semibold">{nextPreview.reference}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] xl:grid-cols-[26rem_minmax(0,1fr)] 2xl:grid-cols-[28rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:gap-8">
        <aside className="hidden lg:block self-start sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1 space-y-3">
          <DesktopVerseActionList
            visible={!openFootnote}
            hasSelection={hasSelection}
            actionsEnabled={!!user}
            onClear={clearSelection}
            onInsight={() => {
              void onAddToInsight();
            }}
            onCitations={onOpenCitations}
            onExplore={onOpenExplore}
          />
          {openCitations && selectedBounds ? (
            <CitationsSidebarPanel
              open={true}
              onClose={() => setOpenCitations(false)}
              volume={volume}
              book={book}
              chapter={chapter}
              verseStart={selectedBounds.start}
              verseEnd={selectedBounds.end}
            />
          ) : null}
          {openExplorer ? (
            <VerseExplorerSidebarPanel
              open={true}
              onClose={() => setOpenExplorer(false)}
              verses={verses.filter((v) => selected.has(v.verse)).map((v) => ({ verse: v.verse, text: v.text }))}
            />
          ) : null}
        </aside>
        <div
          onTransitionEnd={onTransitionEnd}
          style={{ transform: `translateX(${translateX}px)`, transition, willChange: "transform" }}
          className="relative w-full"
        >
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-black/5 dark:border-white/10 py-2">
            <div className="relative flex flex-col gap-1">
              <div className="text-xs sm:text-sm pr-10">
                <Breadcrumbs items={breadcrumbs} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-base sm:text-xl font-semibold">{reference}</h1>
                <button
                  aria-label="Reader settings"
                  title="Reader settings"
                  onClick={() => setSettingsOpen(true)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  ⚙
                </button>
              </div>
            </div>
          </header>

          <ol
            className={`space-y-2 sm:space-y-3 ${prefs.fontFamily === "sans" ? "font-sans" : "font-serif"}`}
            style={{ fontSize: `${prefs.fontScale}rem` }}
          >
            {verses.map((v) => {
              const isSelected = selected.has(v.verse);
              return (
                <li
                  key={v.verse}
                  className={`leading-7 rounded-md px-3 py-2 -mx-2 my-2 ${
                    isSelected ? "bg-amber-200/50 dark:bg-amber-400/25 ring-1 ring-amber-600/30" : ""
                  }`}
                >
                  <button onClick={() => toggleVerse(v.verse)} className="text-left w-full">
                    <span className="mr-2 text-foreground/60 text-xs sm:text-sm align-top">{v.verse}</span>
                    <span>{renderVerseText(v)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <ReaderSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        onChange={(next) => {
          setPrefs(next);
          void (async () => {
            const token = user ? await getToken({ template: "convex" }) : null;
            await savePreferences(user?.id ?? null, next, token);
          })();
        }}
      />

      {/* One-time onboarding tooltip */}
      {showTapHint && !overlayOpen && selected.size === 0 ? (
        <div
          className="fixed inset-x-0 z-40 pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        >
          <div className="mx-auto max-w-3xl px-3 sm:px-4 pointer-events-auto">
            <div
              className="mx-auto w-full sm:w-auto sm:inline-block rounded-md border border-black/10 dark:border-white/15 bg-background/90 backdrop-blur px-3 py-2 shadow"
              style={{ maxWidth: "28rem" }}
              role="dialog"
              aria-live="polite"
            >
              <div className="text-sm flex items-start gap-3">
                <div className="text-lg select-none" aria-hidden>👉</div>
                <div className="flex-1">
                  Tap a scripture to view available actions.
                </div>
                <button
                  onClick={() => {
                    try { setSeenTapToActionsHint(); } catch {}
                    setShowTapHint(false);
                  }}
                  className="ml-2 text-sm px-2 py-1 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {openFootnote ? (
        <FootnoteModal
          open={true}
          onClose={() => setOpenFootnote(null)}
          footnote={openFootnote.footnote}
          verseText={openFootnote.verseText}
          highlightText={openFootnote.highlightText}
        />
      ) : null}

      {openCitations && selectedBounds ? (
        <div className="lg:hidden">
          <CitationsModal
            open={true}
            onClose={() => setOpenCitations(false)}
            volume={volume}
            book={book}
            chapter={chapter}
            verseStart={selectedBounds.start}
            verseEnd={selectedBounds.end}
          />
        </div>
      ) : null}

      {openExplorer ? (
        <div className="lg:hidden">
          <VerseExplorer
            open={true}
            onClose={() => setOpenExplorer(false)}
            verses={verses.filter((v) => selected.has(v.verse)).map((v) => ({ verse: v.verse, text: v.text }))}
          />
        </div>
      ) : null}

      {/* dictionary and etymology now live inside VerseExplorer */}

      <VerseActionBar
        visible={hasSelection && !overlayOpen}
        actionsEnabled={!!user}
        onClear={clearSelection}
        onInsight={() => {
          void onAddToInsight();
        }}
        onCitations={onOpenCitations}
        onExplore={onOpenExplore}
      />
    </section>
  );
}
