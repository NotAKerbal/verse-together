"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import Breadcrumbs, { Crumb } from "./Breadcrumbs";
import VerseActionBar, { type VerseActionAnchorRect } from "./VerseActionBar";
import CitationsModal from "./CitationsModal";
import CitationsSidebarPanel from "./CitationsSidebarPanel";
import ScriptureQuickNav from "./ScriptureQuickNav";
import LessonBrowserPanel from "./LessonBrowserPanel";
import WordStudyPanel from "./WordStudyPanel";
import { useAuth } from "@/lib/auth";
import FootnoteModal from "./FootnoteModal";
import type { Footnote } from "@/lib/openscripture";
import { fetchChapter } from "@/lib/openscripture";
import ReaderSettings from "./ReaderSettings";
import type { ReaderPreferences } from "@/lib/preferences";
import { getDefaultPreferences, loadPreferences, savePreferences, hasSeenTapToActionsHint, setSeenTapToActionsHint } from "@/lib/preferences";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { BIBLE_TRANSLATION_OPTIONS } from "@/lib/bibleCanon";
import { ensureBrowserScriptureStorage } from "@/lib/browserScriptureStorage";
import { api } from "../../convex/_generated/api";

type Verse = { verse: number; text: string; footnotes?: Footnote[] };
type CompareChapter = { translation: string; verses: Verse[] };
type VerseAnnotation = {
  id: string;
  verse: number;
  body: string;
  visibility: "private";
  highlight_color: "yellow" | "blue" | "green" | "pink" | "purple" | null;
  user_id: string;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
};

type AnnotationHighlightColor = "none" | "yellow" | "blue" | "green" | "pink" | "purple";
type SelectedVerse = { verse: number; text: string };
type ChapterSelectionState = {
  selectedText: string;
  selectedVerses: SelectedVerse[];
  selectedBounds: { start: number; end: number } | null;
  selectedWord: string;
  anchorRect: VerseActionAnchorRect | null;
};

type RangePoint = {
  node: Node;
  offset: number;
};

type WordSelection = {
  start: RangePoint;
  end: RangePoint;
};

type WordRange = {
  startWord: WordSelection;
  endWord: WordSelection;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type HandleKind = "start" | "end";

const MOBILE_SELECTION_EDGE_SCROLL_ZONE = 56;
const MOBILE_SELECTION_EDGE_SCROLL_STEP = 18;

function annotationHighlightClass(color: AnnotationHighlightColor) {
  if (color === "yellow") return "border-amber-500/40 bg-amber-500/7";
  if (color === "blue") return "border-sky-500/40 bg-sky-500/7";
  if (color === "green") return "border-emerald-500/40 bg-emerald-500/7";
  if (color === "pink") return "border-pink-500/40 bg-pink-500/7";
  if (color === "purple") return "border-violet-500/40 bg-violet-500/7";
  return "border-black/15 dark:border-white/20 bg-black/[0.015] dark:bg-white/[0.025]";
}

function extractFirstWord(value: string): string {
  const match = value.match(/[A-Za-z][A-Za-z'\-]*/);
  return match?.[0]?.toLowerCase() ?? "";
}

function extractSingleSelectedWord(value: string): string {
  const matches = value.match(/[A-Za-z][A-Za-z'\-]*/g) ?? [];
  return matches.length === 1 ? matches[0].toLowerCase() : "";
}

function normalizeSelectionText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function containsNode(container: HTMLElement, node: Node) {
  return node === container || container.contains(node);
}

function toAnchorRect(range: Range): VerseActionAnchorRect | null {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
  const fallbackRect = range.getBoundingClientRect();
  const rect = rects[0] ?? (fallbackRect.width > 0 || fallbackRect.height > 0 ? fallbackRect : null);
  if (!rect) return null;
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function buildSelectionStateFromRange(
  range: Range | null,
  container: HTMLOListElement | null,
  verses: Verse[]
): ChapterSelectionState | null {
  if (!range || !container) return null;
  if (!containsNode(container, range.startContainer) || !containsNode(container, range.endContainer)) {
    return null;
  }

  const selectedText = range.toString().replace(/\s+/g, " ").trim();
  if (!selectedText) return null;

  const selectedVerseNumbers = Array.from(container.querySelectorAll<HTMLElement>("[data-verse]"))
    .filter((element) => range.intersectsNode(element))
    .map((element) => Number(element.dataset.verse))
    .filter((verseNumber) => Number.isFinite(verseNumber));
  if (selectedVerseNumbers.length === 0) return null;

  const selectedVerseSet = new Set(selectedVerseNumbers);
  const selectedVerses = verses
    .filter((verse) => selectedVerseSet.has(verse.verse))
    .map((verse) => ({ verse: verse.verse, text: verse.text }));
  if (selectedVerses.length === 0) return null;

  return {
    selectedText,
    selectedVerses,
    selectedBounds: {
      start: Math.min(...selectedVerseNumbers),
      end: Math.max(...selectedVerseNumbers),
    },
    selectedWord: extractFirstWord(selectedText),
    anchorRect: toAnchorRect(range),
  };
}

function getChapterSelectionState(
  selection: Selection | null,
  container: HTMLOListElement | null,
  verses: Verse[]
): ChapterSelectionState | null {
  if (!selection || !container || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return buildSelectionStateFromRange(selection.getRangeAt(0), container, verses);
}

function samePoint(a: RangePoint, b: RangePoint) {
  return a.node === b.node && a.offset === b.offset;
}

function comparePoints(a: RangePoint, b: RangePoint): number {
  if (samePoint(a, b)) return 0;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range.collapsed ? 1 : -1;
}

function getCaretPointFromViewport(x: number, y: number): RangePoint | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos?.offsetNode) {
      return { node: pos.offsetNode, offset: pos.offset };
    }
  }

  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    if (range?.startContainer) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }

  return null;
}

function normalizeTextPoint(point: RangePoint): RangePoint | null {
  if (point.node.nodeType === Node.TEXT_NODE) return point;

  const baseNode = point.node;
  const childNodes = baseNode.childNodes;
  const forward = childNodes[Math.min(point.offset, childNodes.length - 1)] ?? null;
  const backward = childNodes[Math.max(0, point.offset - 1)] ?? null;
  const startNode = forward ?? backward;
  if (!startNode) return null;

  const walker = document.createTreeWalker(startNode, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode() as Text | null;
  if (!textNode) return null;
  return { node: textNode, offset: 0 };
}

function getWordSelectionFromPoint(x: number, y: number, container: HTMLOListElement | null): WordSelection | null {
  if (!container) return null;
  const target = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!target || !target.closest("[data-verse-selectable='true']") || !container.contains(target)) {
    return null;
  }

  const rawPoint = getCaretPointFromViewport(x, y);
  const point = rawPoint ? normalizeTextPoint(rawPoint) : null;
  if (!point || point.node.nodeType !== Node.TEXT_NODE) return null;

  const textNode = point.node as Text;
  const text = textNode.data;
  if (!text.trim()) return null;

  const isWordChar = (value: string) => /[A-Za-z0-9'\-]/.test(value);
  let index = Math.max(0, Math.min(point.offset, text.length));
  if (index >= text.length) index = text.length - 1;

  if (!isWordChar(text.charAt(index))) {
    if (index > 0 && isWordChar(text.charAt(index - 1))) {
      index -= 1;
    } else if (index + 1 < text.length && isWordChar(text.charAt(index + 1))) {
      index += 1;
    } else {
      return null;
    }
  }

  let start = index;
  let end = index;
  while (start > 0 && isWordChar(text.charAt(start - 1))) start -= 1;
  while (end + 1 < text.length && isWordChar(text.charAt(end + 1))) end += 1;

  return {
    start: { node: textNode, offset: start },
    end: { node: textNode, offset: end + 1 },
  };
}

function createRangeFromWordSelection(anchor: WordSelection, current: WordSelection): Range {
  const start = comparePoints(anchor.start, current.start) <= 0 ? anchor.start : current.start;
  const end = comparePoints(anchor.end, current.end) >= 0 ? anchor.end : current.end;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function normalizeWordRange(anchor: WordSelection, current: WordSelection): WordRange {
  return comparePoints(anchor.start, current.start) <= 0
    ? { startWord: anchor, endWord: current }
    : { startWord: current, endWord: anchor };
}

function createRangeFromWordRange(wordRange: WordRange): Range {
  const range = document.createRange();
  range.setStart(wordRange.startWord.start.node, wordRange.startWord.start.offset);
  range.setEnd(wordRange.endWord.end.node, wordRange.endWord.end.offset);
  return range;
}

function getHighlightRectsFromRange(range: Range): HighlightRect[] {
  return Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 || rect.height > 0)
    .map((rect) => ({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    }));
}

const ANNOTATION_HIGHLIGHT_OPTIONS: Array<{
  value: AnnotationHighlightColor;
  label: string;
  swatchClass: string;
}> = [
  { value: "none", label: "None", swatchClass: "bg-transparent border border-black/20 dark:border-white/25" },
  { value: "yellow", label: "Yellow", swatchClass: "bg-amber-400/80 border border-amber-500/80" },
  { value: "blue", label: "Blue", swatchClass: "bg-sky-400/80 border border-sky-500/80" },
  { value: "green", label: "Green", swatchClass: "bg-emerald-400/80 border border-emerald-500/80" },
  { value: "pink", label: "Pink", swatchClass: "bg-pink-400/80 border border-pink-500/80" },
  { value: "purple", label: "Purple", swatchClass: "bg-violet-400/80 border border-violet-500/80" },
];

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
  if (translationId.toLowerCase() === "lds") return "LDS";
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
  translationNotices,
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
  translationNotices?: string[];
  compareChapters?: CompareChapter[];
}) {
  const { user, getToken } = useAuth();
  const { appendScriptureBlock, openBuilder, activeDraftId, switchDraft, createDraft } = useInsightBuilder();
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("lessonId");
  const lessonMode = !!lessonId;
  const lessonsApi = (api as any).lessons;
  const annotationsApi = (api as any).annotations;
  const addLessonCard = useMutation(lessonsApi.addCard);
  const saveAnnotation = useMutation(annotationsApi.upsertVerseAnnotation);
  const removeAnnotation = useMutation(annotationsApi.deleteVerseAnnotation);
  const chapterAnnotationData = useQuery(annotationsApi.getChapterAnnotations, {
    volume,
    book,
    chapter,
  }) as { by_verse: Record<number, VerseAnnotation[]> } | undefined;
  const [prefs, setPrefs] = useState<ReaderPreferences>(getDefaultPreferences());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectionState, setSelectionState] = useState<ChapterSelectionState | null>(null);
  const router = useRouter();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTouchIdRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const lastEdgeScrollAtRef = useRef(0);
  const customSelectionAnchorRef = useRef<WordSelection | null>(null);
  const customSelectionActiveRef = useRef(false);
  const customWordRangeRef = useRef<WordRange | null>(null);
  const activeHandleRef = useRef<HandleKind | null>(null);
  const [openFootnote, setOpenFootnote] = useState<null | { footnote: string; verseText: string; highlightText?: string; verse: number; index: number }>(null);
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [animTargetX, setAnimTargetX] = useState<number | null>(null);
  const navHrefRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const [prevPreview, setPrevPreview] = useState<null | { reference: string; preview: string }>(null);
  const [nextPreview, setNextPreview] = useState<null | { reference: string; preview: string }>(null);
  const [openCitations, setOpenCitations] = useState(false);
  const [openExplorer, setOpenExplorer] = useState(false);
  const [isPointerSelecting, setIsPointerSelecting] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [jumpHighlightVerse, setJumpHighlightVerse] = useState<number | null>(null);
  const [annotationEditorVerse, setAnnotationEditorVerse] = useState<number | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationHighlightColor, setAnnotationHighlightColor] = useState<AnnotationHighlightColor>("none");
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [customMobileSelectionEnabled, setCustomMobileSelectionEnabled] = useState(false);
  const [isCustomTouchSelecting, setIsCustomTouchSelecting] = useState(false);
  const [customSelectionRects, setCustomSelectionRects] = useState<HighlightRect[]>([]);
  const jumpHighlightTimeout = useRef<number | null>(null);
  const overlayOpen = !!openFootnote || openCitations || openExplorer;
  const [showTapHint, setShowTapHint] = useState(false);
  const [lessonPanelOpen, setLessonPanelOpen] = useState(false);
  const layoutGridRef = useRef<HTMLDivElement | null>(null);
  const scriptureColumnRef = useRef<HTMLDivElement | null>(null);
  const verseListRef = useRef<HTMLOListElement | null>(null);
  const [desktopScriptureOffset, setDesktopScriptureOffset] = useState(0);

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
    void ensureBrowserScriptureStorage();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function syncCustomMobileSelectionMode() {
      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
      setCustomMobileSelectionEnabled(isCoarsePointer && window.innerWidth < 1024);
    }

    syncCustomMobileSelectionMode();
    window.addEventListener("resize", syncCustomMobileSelectionMode);
    return () => {
      window.removeEventListener("resize", syncCustomMobileSelectionMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isCustomTouchSelecting) return;

    function findTrackedTouch(event: TouchEvent) {
      if (longPressTouchIdRef.current == null) return event.changedTouches[0] ?? null;
      return Array.from(event.changedTouches).find((touch) => touch.identifier === longPressTouchIdRef.current) ?? null;
    }

    function onWindowTouchMove(event: TouchEvent) {
      if (!activeHandleRef.current && !customSelectionActiveRef.current) return;
      const touch = findTrackedTouch(event);
      if (!touch) return;
      event.preventDefault();
      updateCustomSelectionFromTouch(touch);
    }

    function finishCustomTouchInteraction() {
      if (activeHandleRef.current) {
        activeHandleRef.current = null;
      }
      if (customSelectionActiveRef.current) {
        customSelectionActiveRef.current = false;
      }
      setIsCustomTouchSelecting(false);
      longPressTouchIdRef.current = null;
      touchStartX.current = null;
      touchStartY.current = null;
      touchStartTime.current = null;
    }

    window.addEventListener("touchmove", onWindowTouchMove, { passive: false });
    window.addEventListener("touchend", finishCustomTouchInteraction);
    window.addEventListener("touchcancel", finishCustomTouchInteraction);

    return () => {
      window.removeEventListener("touchmove", onWindowTouchMove);
      window.removeEventListener("touchend", finishCustomTouchInteraction);
      window.removeEventListener("touchcancel", finishCustomTouchInteraction);
    };
  }, [isCustomTouchSelecting]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  function triggerSelectionHaptic(pattern: number | number[] = 8) {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(pattern);
  }

  function maybeAutoScrollDuringSelection(clientY: number) {
    if (typeof window === "undefined") return;
    const now = Date.now();
    if (now - lastEdgeScrollAtRef.current < 16) return;

    const viewportHeight = window.innerHeight;
    const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
    const currentScrollTop = window.scrollY;

    if (clientY <= MOBILE_SELECTION_EDGE_SCROLL_ZONE && currentScrollTop > 0) {
      window.scrollBy({ top: -MOBILE_SELECTION_EDGE_SCROLL_STEP, behavior: "auto" });
      lastEdgeScrollAtRef.current = now;
      return;
    }

    if (clientY >= viewportHeight - MOBILE_SELECTION_EDGE_SCROLL_ZONE && currentScrollTop < maxScrollTop) {
      window.scrollBy({ top: MOBILE_SELECTION_EDGE_SCROLL_STEP, behavior: "auto" });
      lastEdgeScrollAtRef.current = now;
    }
  }

  function applyCustomWordRange(nextWordRange: WordRange, options?: { haptic?: boolean }) {
    const range = createRangeFromWordRange(nextWordRange);
    const nextState = buildSelectionStateFromRange(range, verseListRef.current, verses);
    if (!nextState) return false;

    const prevWordRange = customWordRangeRef.current;
    customWordRangeRef.current = nextWordRange;
    setSelectionState(nextState);
    setCustomSelectionRects(getHighlightRectsFromRange(range));

    const changed =
      !prevWordRange ||
      !samePoint(prevWordRange.startWord.start, nextWordRange.startWord.start) ||
      !samePoint(prevWordRange.endWord.end, nextWordRange.endWord.end);
    if (changed && options?.haptic) {
      triggerSelectionHaptic();
    }
    return true;
  }

  function updateCustomSelectionFromTouch(activeTouch: { clientX: number; clientY: number } | null) {
    if (!activeTouch) return;

    if (activeHandleRef.current) {
      if (!customWordRangeRef.current) return;
      maybeAutoScrollDuringSelection(activeTouch.clientY);
      const currentWord = getWordSelectionFromPoint(activeTouch.clientX, activeTouch.clientY, verseListRef.current);
      if (!currentWord) return;

      if (activeHandleRef.current === "start") {
        if (comparePoints(currentWord.start, customWordRangeRef.current.endWord.start) > 0) return;
        void applyCustomWordRange(
          { startWord: currentWord, endWord: customWordRangeRef.current.endWord },
          { haptic: true }
        );
      } else {
        if (comparePoints(currentWord.start, customWordRangeRef.current.startWord.start) < 0) return;
        void applyCustomWordRange(
          { startWord: customWordRangeRef.current.startWord, endWord: currentWord },
          { haptic: true }
        );
      }
      return;
    }

    if (customSelectionActiveRef.current) {
      const anchor = customSelectionAnchorRef.current;
      if (!anchor) return;
      maybeAutoScrollDuringSelection(activeTouch.clientY);
      const currentWord = getWordSelectionFromPoint(activeTouch.clientX, activeTouch.clientY, verseListRef.current);
      if (!currentWord) return;
      const nextWordRange = normalizeWordRange(anchor, currentWord);
      void applyCustomWordRange(nextWordRange, { haptic: true });
    }
  }

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

  const selectedText = selectionState?.selectedText ?? "";
  const selectedVerses = selectionState?.selectedVerses ?? [];
  const hasSelection = selectedVerses.length > 0;
  const showMobileActionBar = !overlayOpen && hasSelection && !isPointerSelecting && !isCustomTouchSelecting;
  const singleSelectedWord = useMemo(() => extractSingleSelectedWord(selectedText), [selectedText]);
  const canExploreWord = hasSelection && !!singleSelectedWord;
  const showInsightAction = hasSelection && !canExploreWord;
  const hasSidebarPanelOpen = !!openFootnote || openCitations || (openExplorer && canExploreWord);
  const selectedBounds = selectionState?.selectedBounds ?? null;
  const selectionPopoverAnchor = selectionState?.anchorRect ?? null;
  const selectionCoversWholeVerses = useMemo(() => {
    if (!selectedVerses.length || !selectedText) return false;
    return normalizeSelectionText(selectedVerses.map((verse) => verse.text).join(" ")) === normalizeSelectionText(selectedText);
  }, [selectedText, selectedVerses]);
  const hasActiveNote = lessonMode ? true : !!activeDraftId;
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
    next.set("lds", "LDS Standard Works");
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
  const headerBreadcrumbs = useMemo(() => {
    if (!breadcrumbs?.length) return breadcrumbs;
    const leading = breadcrumbs.slice(0, -1).map((item) => ({ ...item }));
    return [...leading, { label: reference }];
  }, [breadcrumbs, reference]);
  const selectionReferenceLabel = useMemo(() => {
    if (!selectedBounds) return null;
    return `${book} ${chapter}:${selectedBounds.start}${selectedBounds.end !== selectedBounds.start ? `-${selectedBounds.end}` : ""}`;
  }, [book, chapter, selectedBounds]);
  const annotationsByVerse = useMemo(
    () => chapterAnnotationData?.by_verse ?? {},
    [chapterAnnotationData]
  );
  const myAnnotationByVerse = useMemo(() => {
    const out = new Map<number, VerseAnnotation>();
    Object.entries(annotationsByVerse).forEach(([verseKey, items]) => {
      const mine = (items ?? []).find((item) => item.is_mine);
      const verse = Number(verseKey);
      if (mine && Number.isFinite(verse)) out.set(verse, mine);
    });
    return out;
  }, [annotationsByVerse]);

  function openAnnotationEditor(verse: number) {
    const mine = myAnnotationByVerse.get(verse);
    setAnnotationEditorVerse(verse);
    setAnnotationText(mine?.body ?? "");
    setAnnotationHighlightColor((mine?.highlight_color as AnnotationHighlightColor | null) ?? "none");
  }

  async function onSaveAnnotation() {
    if (!annotationEditorVerse || !user) return;
    setAnnotationSaving(true);
    try {
      await saveAnnotation({
        volume,
        book,
        chapter,
        verse: annotationEditorVerse,
        body: annotationText,
        highlightColor: annotationHighlightColor === "none" ? undefined : annotationHighlightColor,
      });
      setAnnotationEditorVerse(null);
    } finally {
      setAnnotationSaving(false);
    }
  }

  function onOpenAnnotation() {
    if (!hasSelection) return;
    if (!selectedBounds) return;
    openAnnotationEditor(selectedBounds.start);
  }

  async function onDeleteAnnotation() {
    if (!annotationEditorVerse || !user) return;
    const mine = myAnnotationByVerse.get(annotationEditorVerse);
    if (!mine) {
      setAnnotationEditorVerse(null);
      return;
    }
    setAnnotationSaving(true);
    try {
      await removeAnnotation({ annotationId: mine.id as any });
      setAnnotationEditorVerse(null);
    } finally {
      setAnnotationSaving(false);
    }
  }

  useEffect(() => {
    setOpenCitations(false);
    setOpenExplorer(false);
  }, [hasSelection]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    function syncSelectionState() {
      if (customMobileSelectionEnabled || customSelectionActiveRef.current) return;
      const nextSelectionState = getChapterSelectionState(window.getSelection?.() ?? null, verseListRef.current, verses);
      setSelectionState((prev) => {
        if (
          prev?.selectedText === nextSelectionState?.selectedText &&
          prev?.selectedWord === nextSelectionState?.selectedWord &&
          prev?.selectedBounds?.start === nextSelectionState?.selectedBounds?.start &&
          prev?.selectedBounds?.end === nextSelectionState?.selectedBounds?.end &&
          prev?.selectedVerses.length === nextSelectionState?.selectedVerses.length &&
          prev?.selectedVerses.every((verse, index) => verse.verse === nextSelectionState?.selectedVerses[index]?.verse) &&
          prev?.anchorRect?.top === nextSelectionState?.anchorRect?.top &&
          prev?.anchorRect?.left === nextSelectionState?.anchorRect?.left &&
          prev?.anchorRect?.width === nextSelectionState?.anchorRect?.width &&
          prev?.anchorRect?.height === nextSelectionState?.anchorRect?.height
        ) {
          return prev;
        }
        if (nextSelectionState && showTapHint) {
          try { setSeenTapToActionsHint(); } catch {}
          setShowTapHint(false);
        }
        return nextSelectionState;
      });
    }

    syncSelectionState();
    document.addEventListener("selectionchange", syncSelectionState);
    window.addEventListener("resize", syncSelectionState);
    window.addEventListener("scroll", syncSelectionState, true);
    return () => {
      document.removeEventListener("selectionchange", syncSelectionState);
      window.removeEventListener("resize", syncSelectionState);
      window.removeEventListener("scroll", syncSelectionState, true);
    };
  }, [customMobileSelectionEnabled, showTapHint, verses]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function finishPointerSelection() {
      setIsPointerSelecting(false);
    }

    window.addEventListener("pointerup", finishPointerSelection);
    window.addEventListener("pointercancel", finishPointerSelection);

    return () => {
      window.removeEventListener("pointerup", finishPointerSelection);
      window.removeEventListener("pointercancel", finishPointerSelection);
    };
  }, []);

  useEffect(() => {
    if (!hasSelection || overlayOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (isCustomTouchSelecting || activeHandleRef.current || customSelectionActiveRef.current) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-selection-popover='true']")) return;
      if (target.closest("[data-selection-handle='true']")) return;
      if (target.closest("[data-verse-selectable='true']")) return;
      clearSelection();
    }

    function onTouchStartOutside(event: TouchEvent) {
      if (isCustomTouchSelecting || activeHandleRef.current || customSelectionActiveRef.current) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-selection-popover='true']")) return;
      if (target.closest("[data-selection-handle='true']")) return;
      if (target.closest("[data-verse-selectable='true']")) return;
      clearSelection();
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }

    let dismissedByScroll = false;
    function onScrollDismiss() {
      if (dismissedByScroll) return;
      dismissedByScroll = true;
      clearSelection();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("touchstart", onTouchStartOutside, true);
    window.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScrollDismiss, { passive: true });
    window.addEventListener("resize", onScrollDismiss, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("touchstart", onTouchStartOutside, true);
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScrollDismiss);
      window.removeEventListener("resize", onScrollDismiss);
    };
  }, [hasSelection, isCustomTouchSelecting, overlayOpen]);

  useEffect(() => {
    function syncTopState() {
      setIsAtTop(window.scrollY <= 8);
    }
    syncTopState();
    window.addEventListener("scroll", syncTopState, { passive: true });
    return () => window.removeEventListener("scroll", syncTopState);
  }, []);

  useLayoutEffect(() => {
    function updateDesktopScriptureOffset() {
      if (typeof window === "undefined" || window.innerWidth < 1024 || !hasSidebarPanelOpen) {
        setDesktopScriptureOffset(0);
        return;
      }
      const layoutGridEl = layoutGridRef.current;
      const scriptureColumnEl = scriptureColumnRef.current;
      if (!layoutGridEl || !scriptureColumnEl) {
        setDesktopScriptureOffset(0);
        return;
      }

      const style = window.getComputedStyle(layoutGridEl);
      const columnMatches = Array.from(style.gridTemplateColumns.matchAll(/(-?\d*\.?\d+)px/g));
      if (columnMatches.length < 2) {
        setDesktopScriptureOffset(0);
        return;
      }

      const sidebarWidth = Number(columnMatches[0][1]);
      const scriptureTrackWidth = Number(columnMatches[1][1]);
      const columnGap = Number.parseFloat(style.columnGap || "0") || 0;
      const scriptureWidth = scriptureColumnEl.getBoundingClientRect().width;
      const maxShiftWithinTrack = Math.max(0, (scriptureTrackWidth - scriptureWidth) / 2);
      const shiftNeededToCenter = (sidebarWidth + columnGap) / 2;
      const nextOffset = Math.round(Math.max(0, Math.min(shiftNeededToCenter, maxShiftWithinTrack)));
      setDesktopScriptureOffset((prev) => (Math.abs(prev - nextOffset) < 0.5 ? prev : nextOffset));
    }

    updateDesktopScriptureOffset();
    window.addEventListener("resize", updateDesktopScriptureOffset);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateDesktopScriptureOffset();
      });
      if (layoutGridRef.current) resizeObserver.observe(layoutGridRef.current);
      if (scriptureColumnRef.current) resizeObserver.observe(scriptureColumnRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateDesktopScriptureOffset);
      resizeObserver?.disconnect();
    };
  }, [hasSidebarPanelOpen, lessonPanelOpen]);

  useEffect(() => {
    function markJumpVerse(verse: number) {
      setJumpHighlightVerse(verse);
      if (jumpHighlightTimeout.current !== null) {
        window.clearTimeout(jumpHighlightTimeout.current);
      }
      jumpHighlightTimeout.current = window.setTimeout(() => {
        setJumpHighlightVerse(null);
        jumpHighlightTimeout.current = null;
      }, 1800);
    }

    function applyHashJump() {
      const hashMatch = window.location.hash.match(/^#v-(\d+)$/);
      if (!hashMatch) return;
      const verse = Number(hashMatch[1]);
      if (!Number.isFinite(verse) || verse <= 0) return;
      const target = document.getElementById(`v-${verse}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      markJumpVerse(verse);
    }

    function onQuickNavJump(event: Event) {
      const detail = (event as CustomEvent<{ verse?: number }>).detail;
      const verse = Number(detail?.verse);
      if (!Number.isFinite(verse) || verse <= 0) return;
      markJumpVerse(verse);
    }

    applyHashJump();
    window.addEventListener("hashchange", applyHashJump);
    window.addEventListener("quick-nav-jump", onQuickNavJump as EventListener);
    return () => {
      window.removeEventListener("hashchange", applyHashJump);
      window.removeEventListener("quick-nav-jump", onQuickNavJump as EventListener);
      if (jumpHighlightTimeout.current !== null) {
        window.clearTimeout(jumpHighlightTimeout.current);
      }
    };
  }, []);

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
        const isActiveFootnote = openFootnote?.verse === v.verse && openFootnote?.index === idx;
        parts.push(
          <span
            key={`fn-${v.verse}-${idx}-${start}-${displayEnd}`}
            className={`rounded px-0.5 cursor-pointer ${
              isActiveFootnote
                ? "bg-amber-300/70 dark:bg-amber-400/35"
                : "bg-sky-200/50 dark:bg-sky-400/25"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenCitations(false);
              setOpenExplorer(false);
              setOpenFootnote({
                footnote: fn.footnote,
                verseText: v.text,
                highlightText: highlighted,
                verse: v.verse,
                index: idx,
              });
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

    if (!customMobileSelectionEnabled || e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    if (!target?.closest("[data-verse-selectable='true']")) return;
    if (target.closest("[data-selection-handle='true']")) return;
    if (target.closest("button, a, input, textarea, select, [role='button']")) return;

    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }

    longPressTouchIdRef.current = t.identifier;
    longPressOriginRef.current = { x: t.clientX, y: t.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      const wordSelection = getWordSelectionFromPoint(t.clientX, t.clientY, verseListRef.current);
      if (!wordSelection) return;
      const nextWordRange = normalizeWordRange(wordSelection, wordSelection);

      customSelectionAnchorRef.current = wordSelection;
      customWordRangeRef.current = null;
      customSelectionActiveRef.current = true;
      setIsCustomTouchSelecting(true);
      if (!applyCustomWordRange(nextWordRange, { haptic: false })) return;
      if (showTapHint) {
        try { setSeenTapToActionsHint(); } catch {}
        setShowTapHint(false);
      }
      setOpenCitations(false);
      setOpenExplorer(false);
      window.getSelection?.()?.removeAllRanges();
      triggerSelectionHaptic(10);
      touchStartX.current = null;
      touchStartY.current = null;
      touchStartTime.current = null;
    }, 360);
  }

  function onTouchMove(e: React.TouchEvent) {
    const activeTouch = longPressTouchIdRef.current == null
      ? e.changedTouches[0]
      : Array.from(e.changedTouches).find((touch) => touch.identifier === longPressTouchIdRef.current) ?? e.changedTouches[0];

    if (activeHandleRef.current || customSelectionActiveRef.current) {
      e.preventDefault();
      updateCustomSelectionFromTouch(activeTouch);
      return;
    }

    if (customMobileSelectionEnabled && longPressTimerRef.current !== null && longPressOriginRef.current && activeTouch) {
      const dx = activeTouch.clientX - longPressOriginRef.current.x;
      const dy = activeTouch.clientY - longPressOriginRef.current.y;
      if (Math.hypot(dx, dy) > 10) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        longPressOriginRef.current = null;
        longPressTouchIdRef.current = null;
      }
    }

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
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;

    if (activeHandleRef.current) {
      activeHandleRef.current = null;
      setIsCustomTouchSelecting(false);
      longPressTouchIdRef.current = null;
      touchStartX.current = null;
      touchStartY.current = null;
      touchStartTime.current = null;
      return;
    }

    if (customSelectionActiveRef.current) {
      setIsCustomTouchSelecting(false);
      customSelectionActiveRef.current = false;
      longPressTouchIdRef.current = null;
      touchStartX.current = null;
      touchStartY.current = null;
      touchStartTime.current = null;
      return;
    }

    longPressTouchIdRef.current = null;
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
  const startHandleRect = customSelectionRects[0] ?? null;
  const endHandleRect = customSelectionRects[customSelectionRects.length - 1] ?? null;

  function clearSelection() {
    if (typeof window !== "undefined") {
      window.getSelection?.()?.removeAllRanges();
    }
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTouchIdRef.current = null;
    longPressOriginRef.current = null;
    customSelectionAnchorRef.current = null;
    customSelectionActiveRef.current = false;
    customWordRangeRef.current = null;
    activeHandleRef.current = null;
    setIsCustomTouchSelecting(false);
    setCustomSelectionRects([]);
    setSelectionState(null);
  }

  async function onAddToNote() {
    if (!user) {
      alert("Please sign in to build notes or lessons.");
      return;
    }
    if (!selectedBounds || !selectionReferenceLabel) return;
    const reference = selectionReferenceLabel;
    if (lessonMode && lessonId) {
      await addLessonCard({
        lessonId: lessonId as any,
        type: "notes",
        title: reference,
        body: selectedText || null,
        noteComponentType: "scripture",
        notesVisibility: "shared_readonly",
        scriptureRef: {
          volume,
          book,
          chapter,
          verseStart: selectedBounds.start,
          verseEnd: selectedBounds.end,
          reference,
        },
      });
      clearSelection();
      setLessonPanelOpen(true);
      return;
    }
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

  async function onNewNoteFromActions() {
    if (!user) {
      alert("Please sign in to build notes.");
      return;
    }
    if (lessonMode && lessonId) {
      await addLessonCard({
        lessonId: lessonId as any,
        type: "notes",
        title: "Lesson note",
        body: "",
        noteComponentType: "text",
        notesVisibility: "teacher_only",
      });
      setLessonPanelOpen(true);
      return;
    }
    const createdId = await createDraft("New note");
    if (!createdId) return;
    await switchDraft(createdId);
    openBuilder();
  }

  function onOpenCitations() {
    if (!selectedBounds) return;
    setOpenExplorer(false);
    setOpenCitations(true);
  }

  function onOpenExplore() {
    if (!canExploreWord) return;
    setOpenCitations(false);
    setOpenExplorer(true);
  }

  return (
    <section
      className={`space-y-4 pb-20 ${lessonMode && lessonPanelOpen ? "lg:pr-[380px] xl:pr-[440px] 2xl:pr-[500px]" : ""}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={
        customMobileSelectionEnabled && isCustomTouchSelecting
          ? ({ touchAction: "none" } as CSSProperties)
          : undefined
      }
    >
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

      <div
        ref={layoutGridRef}
        className={`lg:grid lg:items-start ${
          hasSidebarPanelOpen
            ? "lg:grid-cols-[24rem_minmax(0,1fr)] xl:grid-cols-[26rem_minmax(0,1fr)] 2xl:grid-cols-[28rem_minmax(0,1fr)] lg:gap-6 xl:gap-8"
            : "lg:grid-cols-1"
        }`}
      >
        <aside
          className={`hidden lg:block self-start sticky overflow-y-auto pr-1 space-y-3 ${
            isAtTop ? "top-2 max-h-[calc(100vh-1rem)]" : "top-4 max-h-[calc(100vh-2rem)]"
          }`}
        >
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
          {openExplorer && canExploreWord ? (
            <WordStudyPanel
              word={singleSelectedWord}
              panelId="word-study-panel-desktop"
              title="Explore Word"
            />
          ) : null}
          {openFootnote ? (
            <FootnoteModal
              open={true}
              variant="panel"
              onClose={() => setOpenFootnote(null)}
              footnote={openFootnote.footnote}
              verseText={openFootnote.verseText}
              highlightText={openFootnote.highlightText}
            />
          ) : null}
        </aside>
        <div
          onTransitionEnd={onTransitionEnd}
          style={{ transform: `translateX(${translateX}px)`, transition, willChange: "transform" }}
          className="relative w-full"
        >
          <div
            ref={scriptureColumnRef}
            className="relative w-full max-w-6xl mx-auto"
            style={
              hasSidebarPanelOpen && desktopScriptureOffset > 0
                ? { left: `-${desktopScriptureOffset}px` }
                : undefined
            }
          >
          <header
            className={`sticky top-0 z-10 ${
              isAtTop ? "py-0.5" : "py-3"
            }`}
          >
            <div className="relative flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex flex-1 items-center gap-2">
                  <ScriptureQuickNav
                    currentVolume={volume}
                    currentBook={book}
                    verses={verses.map((item) => ({ verse: item.verse, text: item.text }))}
                  />
                  <div className="inline-flex h-8 min-w-0 max-w-full flex-1 items-center rounded-lg border surface-card backdrop-blur px-2 sm:h-auto sm:flex-none sm:px-2.5 sm:py-1">
                    <div className="min-w-0 w-full text-xs sm:text-sm">
                      <Breadcrumbs items={headerBreadcrumbs} />
                    </div>
                  </div>
                </div>
                <button
                  aria-label="Reader settings"
                  title="Reader settings"
                  onClick={() => setSettingsOpen(true)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border surface-button shrink-0"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3.2" />
                    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 1 1-3.6 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 1 1 0-3.6h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1 1 0 0 0 1.1.2h0a1 1 0 0 0 .6-.9V4a1.8 1.8 0 1 1 3.6 0v.2a1 1 0 0 0 .6.9h0a1 1 0 0 0 1.1-.2l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1 1 0 0 0-.2 1.1v0a1 1 0 0 0 .9.6H20a1.8 1.8 0 1 1 0 3.6h-.2a1 1 0 0 0-.9.6v0Z" />
                  </svg>
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
              {translationNotices && translationNotices.length > 0 ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] sm:text-xs text-amber-900 dark:text-amber-200">
                  {translationNotices.map((notice) => (
                    <div key={notice}>{notice}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </header>

          <ol
            ref={verseListRef}
            onContextMenu={(event) => {
              if (customMobileSelectionEnabled) {
                event.preventDefault();
              }
            }}
            onPointerDown={(event) => {
              const target = event.target as HTMLElement | null;
              if (event.button !== 0 || !target?.closest("[data-verse-selectable='true']")) return;
              setIsPointerSelecting(true);
            }}
            className={`space-y-2 sm:space-y-3 ${prefs.fontFamily === "sans" ? "font-sans" : "font-serif"}`}
            style={{ fontSize: `${prefs.fontScale}rem` }}
          >
            {verses.map((v) => {
              const isJumpHighlighted = jumpHighlightVerse === v.verse;
              const myVerseAnnotation = myAnnotationByVerse.get(v.verse);
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
                  data-verse={v.verse}
                  data-verse-selectable="true"
                  className={`leading-7 rounded-md px-3 py-2 -mx-2 my-2 ${
                    isJumpHighlighted
                      ? "bg-sky-200/45 dark:bg-sky-400/20 ring-1 ring-sky-600/35 transition-colors duration-300"
                      : ""
                  }`}
                >
                  <div
                    className={`w-full text-left ${
                      customMobileSelectionEnabled
                        ? "select-none"
                        : "select-text selection:bg-amber-200/70 selection:text-foreground dark:selection:bg-amber-300/35"
                    }`}
                    data-verse-selectable="true"
                    style={
                      customMobileSelectionEnabled
                        ? ({
                            userSelect: "none",
                            WebkitUserSelect: "none",
                            WebkitTouchCallout: "none",
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    <span className="mr-2 select-none text-foreground/60 text-xs sm:text-sm align-top">{v.verse}</span>
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
                  </div>
                  {myVerseAnnotation ? (
                    <div
                      className={`mt-2 rounded-md border p-2 text-sm leading-6 ${annotationHighlightClass(
                        (myVerseAnnotation.highlight_color as AnnotationHighlightColor | null) ?? "none"
                      )}`}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-foreground/60">Your annotation</div>
                      <div className="mt-1 whitespace-pre-wrap">{myVerseAnnotation.body}</div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          </div>
        </div>
      </div>

      {customMobileSelectionEnabled && customSelectionRects.length > 0 && !selectionCoversWholeVerses ? (
        <div className="pointer-events-none fixed inset-0 z-30">
          {customSelectionRects.map((rect, index) => (
            <div
              key={`custom-selection-rect-${index}`}
              className="absolute rounded-sm bg-amber-300/45 dark:bg-amber-400/25"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }}
            />
          ))}
          {startHandleRect ? (
            <button
              type="button"
              aria-label="Adjust selection start"
              data-selection-handle="true"
              className="pointer-events-auto absolute h-8 w-8 -translate-x-1/2 bg-transparent"
              style={{
                left: startHandleRect.left,
                top: startHandleRect.top + startHandleRect.height - 3,
                touchAction: "none",
              }}
              onTouchStart={(event) => {
                const touch = event.changedTouches[0];
                activeHandleRef.current = "start";
                longPressTouchIdRef.current = touch.identifier;
      setIsCustomTouchSelecting(true);
      triggerSelectionHaptic(10);
      lastEdgeScrollAtRef.current = 0;
      event.preventDefault();
    }}
            >
              <span className="pointer-events-none absolute left-1/2 top-0 h-5 w-[2px] -translate-x-1/2 rounded-full bg-amber-600/90 dark:bg-amber-300/90" />
              <span className="pointer-events-none absolute left-1/2 top-4 h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-white/80 bg-amber-500 shadow-[0_2px_8px_rgba(0,0,0,0.18)] dark:border-black/20 dark:bg-amber-300" />
            </button>
          ) : null}
          {endHandleRect ? (
            <button
              type="button"
              aria-label="Adjust selection end"
              data-selection-handle="true"
              className="pointer-events-auto absolute h-8 w-8 -translate-x-1/2 bg-transparent"
              style={{
                left: endHandleRect.left + endHandleRect.width,
                top: endHandleRect.top + endHandleRect.height - 3,
                touchAction: "none",
              }}
              onTouchStart={(event) => {
                const touch = event.changedTouches[0];
                activeHandleRef.current = "end";
                longPressTouchIdRef.current = touch.identifier;
      setIsCustomTouchSelecting(true);
      triggerSelectionHaptic(10);
      lastEdgeScrollAtRef.current = 0;
      event.preventDefault();
    }}
            >
              <span className="pointer-events-none absolute left-1/2 top-0 h-5 w-[2px] -translate-x-1/2 rounded-full bg-amber-600/90 dark:bg-amber-300/90" />
              <span className="pointer-events-none absolute left-1/2 top-4 h-3.5 w-3.5 -translate-x-1/2 rounded-full border border-white/80 bg-amber-500 shadow-[0_2px_8px_rgba(0,0,0,0.18)] dark:border-black/20 dark:bg-amber-300" />
            </button>
          ) : null}
        </div>
      ) : null}

      {openExplorer && canExploreWord ? (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-50">
            <button aria-label="Close" onClick={() => setOpenExplorer(false)} className="absolute inset-0 bg-black/30" />
            <div className="absolute bottom-0 left-3 right-3 max-h-[80vh] overflow-hidden rounded-t-2xl border-t border-black/10 bg-background p-3 shadow-2xl dark:border-white/15 sm:left-4 sm:right-4 sm:p-4">
              <div className="mb-1 mx-auto h-1 w-10 rounded-full bg-foreground/20" />
              <WordStudyPanel
                word={singleSelectedWord}
                panelId="word-study-panel-mobile"
                title="Explore Word"
              />
            </div>
          </div>
        </div>
      ) : null}

      <ReaderSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        translationControls={translationControls}
        onChange={(next) => {
          setPrefs(next);
          void (async () => {
            const token = user ? await getToken({ template: "convex" }) : null;
            await savePreferences(user?.id ?? null, next, token);
          })();
        }}
      />

      {annotationEditorVerse ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-lg border surface-card-strong p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                Add annotation - Verse {annotationEditorVerse}
              </h2>
              <button
                onClick={() => setAnnotationEditorVerse(null)}
                className="rounded-md border surface-button px-2 py-1 text-sm"
              >
                Close
              </button>
            </div>
            {annotationsByVerse[annotationEditorVerse]?.length ? (
              <div className="max-h-40 overflow-auto rounded-md border surface-card-soft p-2 space-y-1.5 text-xs">
                {annotationsByVerse[annotationEditorVerse].map((row) => (
                  <div key={row.id} className="rounded border surface-card px-2 py-1.5">
                    <div className="text-[11px] text-foreground/60">
                      {row.is_mine ? "You" : "Saved note"}
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap">{row.body}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {!user ? (
              <p className="text-sm text-foreground/70">Sign in to add annotations.</p>
            ) : (
              <>
                <textarea
                  value={annotationText}
                  onChange={(e) => setAnnotationText(e.target.value)}
                  rows={4}
                  placeholder="Write a note tied to this verse..."
                  className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
                />
                <div className="space-y-1">
                  <div className="text-sm text-foreground/70">Highlight</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {ANNOTATION_HIGHLIGHT_OPTIONS.map((option) => {
                      const active = annotationHighlightColor === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setAnnotationHighlightColor(option.value)}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                            active ? "border-foreground bg-foreground text-background" : "surface-button"
                          }`}
                          aria-pressed={active}
                        >
                          <span className={`h-3 w-3 rounded-full ${option.swatchClass}`} />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {myAnnotationByVerse.get(annotationEditorVerse) ? (
                    <button
                      onClick={() => {
                        void onDeleteAnnotation();
                      }}
                      disabled={annotationSaving}
                      className="rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-700 dark:text-red-300 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  ) : null}
                  <button
                    onClick={() => {
                      void onSaveAnnotation();
                    }}
                    disabled={annotationSaving || !annotationText.trim()}
                    className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-60"
                  >
                    {annotationSaving ? "Saving..." : "Add annotation"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* One-time onboarding tooltip */}
      {showTapHint && !overlayOpen && !hasSelection ? (
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
                <div className="text-lg select-none" aria-hidden>Tip</div>
                <div className="flex-1">
                  Select passage text to see note, citation, and word study actions.
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
        <div className="lg:hidden">
          <FootnoteModal
            open={true}
            onClose={() => setOpenFootnote(null)}
            footnote={openFootnote.footnote}
            verseText={openFootnote.verseText}
            highlightText={openFootnote.highlightText}
          />
        </div>
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

      <VerseActionBar
        visible={showMobileActionBar}
        anchorRect={selectionPopoverAnchor}
        hasSelection={hasSelection}
        hasActiveInsight={hasActiveNote}
        showInsightAction={showInsightAction}
        showExplore={canExploreWord}
        targetLabel={lessonMode ? "Lesson" : "Note"}
        actionsEnabled={!!user}
        onInsight={() => {
          void onAddToNote();
        }}
        onNewInsight={() => {
          void onNewNoteFromActions();
        }}
        onAnnotation={onOpenAnnotation}
        onCitations={onOpenCitations}
        onExplore={onOpenExplore}
      />
      {lessonMode && lessonId ? (
        <LessonBrowserPanel lessonId={lessonId} open={lessonPanelOpen} onClose={() => setLessonPanelOpen(false)} />
      ) : null}
    </section>
  );
}
