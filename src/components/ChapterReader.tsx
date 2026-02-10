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
import { BIBLE_TRANSLATION_OPTIONS } from "@/lib/bibleCanon";

type Verse = { verse: number; text: string; footnotes?: Footnote[] };
type CompareChapter = { translation: string; verses: Verse[] };

type DiffSegment = {
  kind: "equal" | "change";
  primary: string[];
  compare: string[];
};

function normalizeCompareText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTranslationShortLabel(translationId: string | undefined): string {
  if (!translationId) return "UNKNOWN";
  return translationId.toUpperCase();
}

function tokenizeWords(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildLcsTable(sourceWords: string[], targetWords: string[]): number[][] {
  const rows = sourceWords.length;
  const cols = targetWords.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    Array(cols + 1).fill(0)
  );

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      if (sourceWords[i] === targetWords[j]) {
        table[i][j] = table[i + 1][j + 1] + 1;
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
  }
  return table;
}

function computeInlineDiffSegments(primaryText: string, compareText: string): DiffSegment[] {
  const primaryWords = tokenizeWords(primaryText);
  const compareWords = tokenizeWords(compareText);
  const primaryKeys = primaryWords.map(normalizeWord);
  const compareKeys = compareWords.map(normalizeWord);
  const table = buildLcsTable(primaryKeys, compareKeys);

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  let pendingPrimary: string[] = [];
  let pendingCompare: string[] = [];

  function flushPendingChange() {
    if (pendingPrimary.length === 0 && pendingCompare.length === 0) return;
    segments.push({
      kind: "change",
      primary: pendingPrimary,
      compare: pendingCompare,
    });
    pendingPrimary = [];
    pendingCompare = [];
  }

  function pushEqualWord(word: string) {
    const last = segments[segments.length - 1];
    if (last?.kind === "equal") {
      last.primary.push(word);
    } else {
      segments.push({ kind: "equal", primary: [word], compare: [word] });
    }
  }

  while (i < primaryWords.length || j < compareWords.length) {
    if (
      i < primaryWords.length &&
      j < compareWords.length &&
      primaryKeys[i] === compareKeys[j]
    ) {
      flushPendingChange();
      pushEqualWord(primaryWords[i]);
      i += 1;
      j += 1;
      continue;
    }

    if (
      i < primaryWords.length &&
      (j >= compareWords.length || table[i + 1][j] >= table[i][j + 1])
    ) {
      pendingPrimary.push(primaryWords[i]);
      i += 1;
    } else if (j < compareWords.length) {
      pendingCompare.push(compareWords[j]);
      j += 1;
    }
  }
  flushPendingChange();
  return segments;
}

function renderInlineDiff(
  primaryText: string,
  compareText: string,
  primaryColorClass: string,
  compareColorClass: string
): ReactNode {
  const segments = computeInlineDiffSegments(primaryText, compareText);
  return segments.map((segment, index) => {
    const prefix = index > 0 ? " " : "";
    if (segment.kind === "equal") {
      return <span key={`seg-eq-${index}`}>{prefix}{segment.primary.join(" ")}</span>;
    }
    const primaryChanged = segment.primary.join(" ");
    const compareChanged = segment.compare.join(" ");
    return (
      <span key={`seg-change-${index}`} className="inline-flex items-baseline gap-1.5 mx-0.5">
        {prefix}
        {primaryChanged ? (
          <span className={`px-0.5 ${primaryColorClass}`}>
            {primaryChanged}
          </span>
        ) : (
          <span className="text-foreground/35">-</span>
        )}
        <span className="text-foreground/40">/</span>
        {compareChanged ? (
          <span className={`px-0.5 ${compareColorClass}`}>
            {compareChanged}
          </span>
        ) : (
          <span className="text-foreground/35">-</span>
        )}
      </span>
    );
  });
}

export default function ChapterReader({
  volume,
  book,
  chapter,
  verses,
  reference,
  breadcrumbs,
  translationControls,
  prevHref,
  nextHref,
  primaryTranslation,
  compareChapters,
}: {
  volume: string;
  book: string;
  chapter: number;
  verses: Verse[];
  reference: string;
  breadcrumbs: Crumb[];
  translationControls?: ReactNode;
  prevHref?: string;
  nextHref?: string;
  primaryTranslation?: string;
  compareChapters?: CompareChapter[];
}) {
  const { user, getToken } = useAuth();
  const { appendScriptureBlock, openBuilder, activeDraftId, drafts, switchDraft, createDraft } = useInsightBuilder();
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

  function parseBrowseHref(
    href: string | undefined
  ): { volume: string; book: string; chapter: number; translation?: string } | null {
    if (!href) return null;
    const [pathname, query = ""] = href.split("?");
    const clean = pathname.split("#")[0];
    const parts = clean.split("/").filter(Boolean);
    const params = new URLSearchParams(query);
    const translation = params.get("translation") ?? undefined;
    // expect: ["browse", volume, book, chapter]
    if (parts.length >= 4 && parts[0] === "browse") {
      const vol = decodeURIComponent(parts[1] || "");
      const b = decodeURIComponent(parts[2] || "");
      const chStr = decodeURIComponent(parts[3] || "");
      const ch = Number(chStr);
      if (vol && b && Number.isFinite(ch)) return { volume: vol, book: b, chapter: ch, translation };
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
          const chap = await fetchChapter(nextInfo.volume, nextInfo.book, nextInfo.chapter, {
            translation: nextInfo.translation,
          });
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
          const chap = await fetchChapter(prevInfo.volume, prevInfo.book, prevInfo.chapter, {
            translation: prevInfo.translation,
          });
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
  const hasActiveInsight = !!activeDraftId;
  const availableInsights = useMemo(() => drafts.filter((d) => d.status === "draft"), [drafts]);
  const compareByTranslation = useMemo(() => {
    const nextMap = new Map<string, Map<number, string>>();
    (compareChapters ?? []).forEach((chapterData) => {
      if (!chapterData.translation) return;
      const byVerse = new Map<number, string>();
      chapterData.verses.forEach((item) => {
        byVerse.set(item.verse, item.text);
      });
      nextMap.set(chapterData.translation, byVerse);
    });
    return nextMap;
  }, [compareChapters]);
  const primaryTranslationLabel = formatTranslationShortLabel(primaryTranslation);
  const compareColorClasses = [
    "text-sky-700 dark:text-sky-300",
    "text-emerald-700 dark:text-emerald-300",
    "text-violet-700 dark:text-violet-300",
    "text-rose-700 dark:text-rose-300",
    "text-cyan-700 dark:text-cyan-300",
    "text-fuchsia-700 dark:text-fuchsia-300",
  ];
  const translationNameById = useMemo(() => {
    const next = new Map<string, string>();
    BIBLE_TRANSLATION_OPTIONS.forEach((option) => {
      next.set(option.id, option.label);
    });
    return next;
  }, []);
  const compareLegend = useMemo(
    () =>
      Array.from(compareByTranslation.keys()).map((translationId, index) => ({
        translationId,
        label: formatTranslationShortLabel(translationId),
        title: translationNameById.get(translationId) ?? translationId.toUpperCase(),
        colorClass: compareColorClasses[index % compareColorClasses.length],
      })),
    [compareByTranslation, translationNameById]
  );
  const hasCompareSelections = compareByTranslation.size > 0;

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

  async function onNewInsightFromActions() {
    if (!user) {
      alert("Please sign in to build insights.");
      return;
    }
    const createdId = await createDraft("New insight");
    if (!createdId) return;
    await switchDraft(createdId);
    openBuilder();
  }

  async function onLoadInsightsFromActions() {
    if (!user) {
      alert("Please sign in to build insights.");
      return;
    }
    const targetId = activeDraftId ?? availableInsights[0]?.id ?? null;
    if (!targetId) {
      await onNewInsightFromActions();
      return;
    }
    await switchDraft(targetId);
    openBuilder();
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
          {translationControls ? <div>{translationControls}</div> : null}
          <DesktopVerseActionList
            visible={!openFootnote}
            hasSelection={hasSelection}
            hasActiveInsight={hasActiveInsight}
            actionsEnabled={!!user}
            onClear={clearSelection}
            onInsight={() => {
              void onAddToInsight();
            }}
            onNewInsight={() => {
              void onNewInsightFromActions();
            }}
            onLoadInsights={() => {
              void onLoadInsightsFromActions();
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
              {hasCompareSelections ? (
                <div className="text-[11px] sm:text-xs text-foreground/60 flex flex-wrap items-center gap-2">
                  <span className="text-foreground/45">Key:</span>
                  <span
                    className="text-amber-700 dark:text-amber-300"
                    title={translationNameById.get(primaryTranslation ?? "") ?? primaryTranslationLabel}
                  >
                    {primaryTranslationLabel}
                  </span>
                  <span className="text-foreground/35">/</span>
                  {compareLegend.map((item, idx) => (
                    <span key={`legend-${item.translationId}`} className={item.colorClass} title={item.title}>
                      {idx > 0 ? ", " : ""}
                      {item.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </header>

          <ol
            className={`space-y-2 sm:space-y-3 ${prefs.fontFamily === "sans" ? "font-sans" : "font-serif"}`}
            style={{ fontSize: `${prefs.fontScale}rem` }}
          >
            {verses.map((v) => {
              const isSelected = selected.has(v.verse);
              const verseComparisons = Array.from(compareByTranslation.entries())
                .map(([translationId, byVerse]) => {
                  const text = byVerse.get(v.verse);
                  if (typeof text !== "string") return null;
                  const hasDifference = normalizeCompareText(text) !== normalizeCompareText(v.text);
                  if (!hasDifference) return null;
                  const legend = compareLegend.find((item) => item.translationId === translationId);
                  return {
                    key: translationId,
                    label: legend?.label ?? formatTranslationShortLabel(translationId),
                    compareText: text,
                    compareColorClass: legend?.colorClass ?? compareColorClasses[0],
                  };
                })
                .filter(
                  (item): item is { key: string; label: string; compareText: string; compareColorClass: string } =>
                    item !== null
                );
              return (
                <li
                  key={v.verse}
                  id={`v-${v.verse}`}
                  className={`leading-7 rounded-md px-3 py-2 -mx-2 my-2 ${
                    isSelected ? "bg-amber-200/50 dark:bg-amber-400/25 ring-1 ring-amber-600/30" : ""
                  }`}
                >
                  <button onClick={() => toggleVerse(v.verse)} className="text-left w-full">
                    <span className="mr-2 text-foreground/60 text-xs sm:text-sm align-top">{v.verse}</span>
                    {verseComparisons.length === 0 ? (
                      <span>{renderVerseText(v)}</span>
                    ) : prefs.comparisonView === "sideBySide" ? (
                      <span className="mt-1 block space-y-2">
                        {verseComparisons.map((comparison) => (
                          <span
                            key={`${v.verse}-${comparison.key}`}
                            className="block rounded-md border border-black/10 dark:border-white/15 p-2"
                          >
                            <span className="grid gap-2 md:grid-cols-2">
                              <span className="block rounded bg-black/[0.03] dark:bg-white/[0.05] px-2 py-1.5">
                                <span className="block text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                  {primaryTranslationLabel}
                                </span>
                                <span className="mt-0.5 block text-sm leading-6">{renderVerseText(v)}</span>
                              </span>
                              <span className="block rounded bg-black/[0.03] dark:bg-white/[0.05] px-2 py-1.5">
                                <span className={`block text-[10px] uppercase tracking-wide ${comparison.compareColorClass}`}>
                                  {comparison.label}
                                </span>
                                <span className="mt-0.5 block text-sm leading-6">{comparison.compareText}</span>
                              </span>
                            </span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-sm leading-6">
                        {verseComparisons.map((comparison, index) => (
                          <span key={`${v.verse}-${comparison.key}`} className="inline">
                            {index > 0 ? <span className="mx-2 text-foreground/35">|</span> : null}
                            {renderInlineDiff(
                              v.text,
                              comparison.compareText,
                              "text-amber-700 dark:text-amber-300",
                              comparison.compareColorClass
                            )}
                          </span>
                        ))}
                      </span>
                    )}
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
        hasActiveInsight={hasActiveInsight}
        actionsEnabled={!!user}
        onClear={clearSelection}
        onInsight={() => {
          void onAddToInsight();
        }}
        onNewInsight={() => {
          void onNewInsightFromActions();
        }}
        onLoadInsights={() => {
          void onLoadInsightsFromActions();
        }}
        onCitations={onOpenCitations}
        onExplore={onOpenExplore}
      />
    </section>
  );
}
