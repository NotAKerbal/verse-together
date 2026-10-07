"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { getChapterHref } from "@/features/plans/scriptureCatalog";
import {
  decodeFragment,
  localScriptureTarget,
  normalizeTarget,
  parseScriptureAnchor,
  scriptureAnchor,
  scriptureVerseId,
  type ScriptureTarget,
} from "@/lib/cfm/cfmAnchors";
import type { GuidePassage, TocItem } from "@/lib/cfm/cfmGuide";
import { sideAtScroll, type CompanionSide } from "./companionPanes";
import {
  alignAtReadingLine,
  buildSegments,
  followScripture,
  guideScrollTop,
  scriptureToGuide,
  startReverseFollow,
  ScrollOwnership,
  segmentAt,
  targetStart,
  type GuideMarker,
  type Pane,
  type ReverseFollow,
  type Segment,
} from "./scrollSync";
import { isDocked, paneScrolling, paneTakesWheel, redockScroll, trailingPull } from "./readerDock";
import ContentsNav, { ContentsOpener, type ContentsHandle } from "./ContentsNav";
import styles from "./studyCompanion.module.css";

export type CompanionChapter = { chapter: number; verses: Array<{ verse: number; text: string }> };

type Props = {
  /**
   * Guide HTML from the parser (escaped source text, safe links, and page-added art/sources only), split at
   * the guide's first chapter section. The introduction is read on its own, as ordinary page content, in
   * every layout; the reader HTML (every chapter, then the closing synthesis and sources) is the guide
   * side of the paired reader.
   */
  introductionHtml: string;
  readerHtml: string;
  toc: TocItem[];
  passages: GuidePassage[];
  book: { label: string; slug: string; volume: string };
  chapters: CompanionChapter[];
  /**
   * The page footer. It normally follows the companion; in the phone reader it closes the guide side
   * instead, so nothing trails the docked reader on the page.
   */
  footer?: ReactNode;
};

/**
 * Desktop: guide (the guide alone, default) or columns (guide and scripture side by side), under the
 * Show/Hide switch. Phones and small tablets: always the strip, guide first, scripture one swipe away.
 */
type Mode = "guide" | "columns" | "strip";

type SegmentMeta = { target: ScriptureTarget; label: string };

/**
 * A reading position inside the guide that survives a layout change: a top-level block of the introduction
 * or of the reader's guide, and how far into it.
 */
type GuideAnchor = { part: "introduction" | "reader"; index: number; ratio: number };
/** The same for the scripture text: a verse (or chapter heading) id and how far into it. */
type ScriptureMark = { id: string; ratio: number };

/** Work to do once the DOM reflects a state change, in this order. */
type Pending = {
  guideAnchor?: GuideAnchor | null;
  restoreScripture?: boolean;
  guideTo?: string;
  scriptureTo?: ScriptureTarget;
  sync?: Pane;
  reveal?: { side: CompanionSide; instant: boolean };
  focusId?: string;
  focusToggle?: boolean;
};

type ScrollBox = {
  top(): number;
  set(top: number): void;
  height(): number;
  max(): number;
  /** Offset of `node` in this scroller's content, measured from its visible top. */
  offsetOf(node: Element): number;
};

// Two columns from here up (keep in sync with studyCompanion.module.css); below it, a swipeable strip.
const DESKTOP_QUERY = "(min-width: 900px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** Both panes align at this fraction of their visible height, where the eye usually reads. */
const READING_LINE = 0.3;
/**
 * Gap left above an element an explicit navigation brings to the top, below the reading edge. It matches
 * the top padding of the guide and scripture columns, so landing on the first chapter docks the reader
 * exactly, with its heading just clear of the edge.
 */
const LANDING_GAP = 12;
/** The contents mark the entry whose heading has passed this far below the reading edge as current. */
const SECTION_LINE = 80;
const MARKERS = [
  "section.cfm-section > h2",
  "[data-cfm-passage]",
  "section.cfm-section[data-chapter] > h3:not([data-cfm-passage])",
].join(", ");

function matches(query: string) {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

function subscribeDesktop(notify: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

function typesetDashes(text: string): string {
  return text.replace(/--/g, "—");
}

function elementBox(el: HTMLElement): ScrollBox {
  return {
    top: () => el.scrollTop,
    set: (top) => {
      el.scrollTop = top;
    },
    height: () => el.clientHeight,
    max: () => Math.max(0, el.scrollHeight - el.clientHeight),
    offsetOf: (node) => node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop,
  };
}

/** The page itself, minus whatever sticky chrome covers its top (`covered`). */
function windowBox(covered: () => number): ScrollBox {
  return {
    top: () => window.scrollY,
    set: (top) => window.scrollTo(0, top),
    height: () => window.innerHeight - covered(),
    max: () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    offsetOf: (node) => node.getBoundingClientRect().top - covered() + window.scrollY,
  };
}

/** Height of the app's sticky header where it is shown (it is hidden on phones). */
function headerBottom(): number {
  const header = document.querySelector<HTMLElement>(".app-header");
  if (!header) return 0;
  const rect = header.getBoundingClientRect();
  return rect.height > 0 ? Math.max(0, rect.bottom) : 0;
}

/** The selection a commentary element stands for: its own passage, else its chapter section. */
function targetFromGuideElement(element: Element): ScriptureTarget | null {
  const passage = element.closest<HTMLElement>("[data-cfm-passage]");
  if (passage?.dataset.chapter && passage.dataset.first) {
    return {
      chapter: Number(passage.dataset.chapter),
      first: Number(passage.dataset.first),
      last: Number(passage.dataset.last ?? passage.dataset.first),
    };
  }
  const section = element.closest<HTMLElement>("section[data-chapter]");
  return section?.dataset.chapter ? { chapter: Number(section.dataset.chapter) } : null;
}

/** The nearest commentary anchor at or before `element`, so "Back to the guide" returns to the same place. */
function nearestGuideAnchor(root: HTMLElement, element: Element): string | null {
  let found: string | null = null;
  for (const candidate of root.querySelectorAll<HTMLElement>("h2[id], h3[id], p[id]")) {
    if (candidate === element || candidate.contains(element)) return candidate.id;
    if (candidate.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) found = candidate.id;
    else break;
  }
  return found;
}

/** Top-level blocks of the guide (paragraphs, headings, lists, tables, figures), in order. */
function guideBlocks(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(":scope > div > *, :scope > section > *"));
}

/** The block at content offset `line` of `box`, and how far into it. */
function blockAt(blocks: HTMLElement[], box: ScrollBox, line: number): { index: number; ratio: number } | null {
  let index = -1;
  for (let i = 0; i < blocks.length; i += 1) {
    if (box.offsetOf(blocks[i]) <= line) index = i;
    else break;
  }
  if (index < 0) return null;
  const height = blocks[index].getBoundingClientRect().height || 1;
  return { index, ratio: Math.min(1, Math.max(0, (line - box.offsetOf(blocks[index])) / height)) };
}

/** The page under the app header: where the introduction scrolls, in every layout. */
function pageBox(): ScrollBox {
  return windowBox(headerBottom);
}

function focusWithoutScrolling(element: HTMLElement | null) {
  if (!element) return;
  if (!element.hasAttribute("tabindex") && !element.matches("a[href], button, input, select, textarea")) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
}

export default function StudyCompanion({ introductionHtml, readerHtml, toc, passages, book, chapters, footer }: Props) {
  const chapterNumbers = useMemo(() => chapters.map((entry) => entry.chapter), [chapters]);
  const passageLabels = useMemo(() => new Map(passages.map((passage) => [passage.id, passage.label])), [passages]);
  const passagesByStart = useMemo(() => {
    const byStart = new Map<string, GuidePassage[]>();
    for (const passage of passages) {
      const key = `${passage.chapter}:${passage.first}`;
      byStart.set(key, [...(byStart.get(key) ?? []), passage]);
    }
    return byStart;
  }, [passages]);
  const firstChapter = chapters[0].chapter;
  const lastChapter = chapters[chapters.length - 1].chapter;

  // Desktop only: the guide alone is the default on every visit; nothing is remembered between visits.
  // Phones always have the scripture one swipe away, and leave this desktop choice alone.
  const [scriptureOn, setScriptureOn] = useState(false);
  const [side, setSide] = useState<CompanionSide>("guide");
  const [active, setActive] = useState<ScriptureTarget | null>(null);
  const [label, setLabel] = useState(`${book.label} ${firstChapter}`);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  // Server render and hydration assume desktop; phones settle on the strip right after.
  const desktop = useSyncExternalStore(subscribeDesktop, () => matches(DESKTOP_QUERY), () => true);
  const mode: Mode = !desktop ? "strip" : scriptureOn ? "columns" : "guide";

  // Arriving at desktop width resets the phone strip's side to the guide (and drops "Back to the guide"),
  // so the next time the strip renders, its first commit is already on the guide side. Adjusted during
  // render, the way React derives state from a changed input, so it commits with the desktop layout itself.
  // Only a change to desktop counts: a phone's hydration (server "desktop", then the phone's own) is a
  // change away from it, and must keep whatever side a scripture deep link has already chosen.
  const [renderedDesktop, setRenderedDesktop] = useState(desktop);
  if (renderedDesktop !== desktop) {
    setRenderedDesktop(desktop);
    if (desktop) {
      setSide("guide");
      setReturnTo(null);
    }
  }

  const introWrapRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const contentsRef = useRef<ContentsHandle>(null);
  const companionRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const guidePanelRef = useRef<HTMLElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const scriptureRef = useRef<HTMLElement>(null);
  const scriptureDocRef = useRef<HTMLDivElement>(null);
  const backToGuideRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef<Pending | null>(null);
  const ownershipRef = useRef(new ScrollOwnership());
  const segmentsRef = useRef<Segment<SegmentMeta>[] | null>(null);
  const segmentIndexRef = useRef(-1);
  /**
   * A hand-off waiting for the next scripture-driven pass: the scripture's scroll offset it starts from. The
   * guide then continues from wherever it is at that moment. Set where the last guide-driven sync left the
   * scripture (on scripture-mapped commentary only), and again where the scripture is when a layout change
   * interrupts a hand-off in progress; null otherwise, and after any explicit navigation.
   */
  const handoffRef = useRef<{ scripture: number } | null>(null);
  /** While the reader drives the scripture: the guide's carried offset (see followScripture), on the current layout. */
  const reverseRef = useRef<ReverseFollow | null>(null);
  const savedScriptureRef = useRef<ScriptureMark | null>(null);
  /** A side the strip is being scrolled to programmatically. */
  const heading = useRef<{ side: CompanionSide; timer: number } | null>(null);
  /** Which panes may scroll by themselves right now (see readerDock.ts); kept current by the geometry effect. */
  const paneScrollRef = useRef({ guide: false, scripture: false });
  /** Re-measure the reader geometry and docked state at once (after a programmatic page scroll). */
  const refreshDockRef = useRef<(() => void) | null>(null);
  /** The guide's reading position as of its last settled scroll, carried across a desktop/phone resize. */
  const lastGuideAnchorRef = useRef<GuideAnchor | null>(null);
  /** Whether the viewport was last settled at desktop width; null until the first commit. */
  const settledDesktopRef = useRef<boolean | null>(null);
  const introHtml = useMemo(() => ({ __html: introductionHtml }), [introductionHtml]);
  const guideHtml = useMemo(() => ({ __html: readerHtml }), [readerHtml]);
  /** Every contents entry, in document order (introduction, then the reader). */
  const tocIds = useMemo(() => toc.flatMap((item) => [item.id, ...item.verses.map((verse) => verse.id)]), [toc]);

  useEffect(() => {
    const pendingMove = heading;
    return () => {
      if (pendingMove.current) window.clearTimeout(pendingMove.current.timer);
    };
  }, []);

  const schedule = useCallback((pending: Pending) => {
    pendingRef.current = { ...pendingRef.current, ...pending };
    rerender();
  }, []);

  /** Where the guide scrolls in the current layout: its own side of the strip on phones, else the page. */
  const guideBox = useCallback((): ScrollBox => {
    if (mode === "strip" && guidePanelRef.current) return elementBox(guidePanelRef.current);
    return windowBox(() => headerBottom() + (toolbarRef.current?.offsetHeight ?? 0));
  }, [mode]);

  const scriptureBox = useCallback((): ScrollBox | null => {
    const el = scriptureRef.current;
    return el && !el.hidden ? elementBox(el) : null;
  }, []);

  /** How much of the scripture side's top the phones' sticky "Back to the guide" button covers. */
  const scriptureCovered = useCallback(() => {
    const back = backToGuideRef.current?.getBoundingClientRect();
    const panel = scriptureRef.current;
    return back && back.height > 0 && panel ? Math.max(0, back.bottom - panel.getBoundingClientRect().top) : 0;
  }, []);

  /** How much of the reader's bottom the phones' fixed bottom navigation covers (measured by the geometry effect). */
  const bottomCovered = useCallback(
    () => parseFloat(companionRef.current?.style.getPropertyValue("--cfm-bottom-clear") ?? "") || 0,
    []
  );

  const normalize = useCallback(
    (target: ScriptureTarget) => normalizeTarget(target, (chapter) => chapters.find((entry) => entry.chapter === chapter)?.verses.length),
    [chapters]
  );

  /** Programmatic scroll that the ownership tracker will recognize as ours. */
  const scrollTo = useCallback((box: ScrollBox, pane: Pane, raw: number) => {
    const target = Math.min(box.max(), Math.max(0, raw));
    if (Math.abs(target - box.top()) < 1) return;
    ownershipRef.current.expect(pane, target);
    box.set(target);
  }, []);

  /** Guide segments and their scripture spans, measured in the current layout (cached until it changes). */
  const segments = useCallback(
    (guide: ScrollBox, scripture: ScrollBox): Segment<SegmentMeta>[] => {
      if (segmentsRef.current) return segmentsRef.current;
      const root = guideRef.current;
      if (!root) return [];
      const verse = (chapter: number, number: number) => document.getElementById(scriptureVerseId(book.slug, chapter, number));
      const topOf = (el: Element) => scripture.offsetOf(el);
      const middleOf = (el: Element) => topOf(el) + el.getBoundingClientRect().height / 2;
      const endOf = (el: Element) => (el.nextElementSibling ? topOf(el.nextElementSibling) : topOf(el) + el.getBoundingClientRect().height);
      const markers: GuideMarker<SegmentMeta>[] = [];
      const chaptersWithPassages = new Set<number>();
      for (const el of root.querySelectorAll<HTMLElement>(MARKERS)) {
        const section = el.closest<HTMLElement>("section.cfm-section");
        const chapter = Number(section?.dataset.chapter) || 0;
        const top = guide.offsetOf(el);
        if (el.tagName === "H2") {
          const chapterHeading = chapter ? document.getElementById(scriptureAnchor(book.slug, chapter)) : null;
          const firstVerse = chapter ? verse(chapter, 1) : null;
          markers.push(
            chapterHeading && firstVerse
              ? {
                  top,
                  kind: "mapped",
                  scripture: { start: topOf(chapterHeading), end: topOf(firstVerse) },
                  meta: { target: { chapter }, label: `${book.label} ${chapter}` },
                }
              : { top, kind: "unmapped" }
          );
        } else if (el.hasAttribute("data-cfm-passage")) {
          const passageChapter = Number(el.dataset.chapter);
          const first = Number(el.dataset.first);
          const last = Number(el.dataset.last ?? el.dataset.first);
          const firstVerse = verse(passageChapter, first);
          const lastVerse = verse(passageChapter, last);
          if (!firstVerse || !lastVerse) continue;
          chaptersWithPassages.add(passageChapter);
          // Lettered halves split their shared verse: 57:11–13a ends, and 57:13b–14 starts, mid-verse 13.
          const start = el.dataset.firstHalf === "b" ? middleOf(firstVerse) : topOf(firstVerse);
          const end = el.dataset.lastHalf === "a" ? middleOf(lastVerse) : endOf(lastVerse);
          markers.push({
            top,
            kind: "mapped",
            scripture: { start, end: Math.max(start, end) },
            meta: {
              target: { chapter: passageChapter, first, last },
              label: `${book.label} ${passageLabels.get(el.id) ?? `${passageChapter}:${first}`}`,
            },
          });
        } else if (chapter && chaptersWithPassages.has(chapter)) {
          // "Christ in Isaiah 50", questions, cross-references: the chapter's verses have been read.
          markers.push({ top, kind: "hold", meta: { target: { chapter }, label: `${book.label} ${chapter}` } });
        }
        // Subsections before a chapter's first passage ("Chapter orientation") stay in its opening segment.
      }
      const guideEnd = guide.offsetOf(root) + root.getBoundingClientRect().height;
      segmentsRef.current = buildSegments(markers, guideEnd);
      return segmentsRef.current;
    },
    [book.label, book.slug, passageLabels]
  );

  /** Note which segment the guide is in, for the pager label and the verse highlight. */
  const noteSegment = useCallback((list: Segment<SegmentMeta>[], guideY: number) => {
    const index = segmentAt(list, guideY);
    if (index === segmentIndexRef.current) return;
    segmentIndexRef.current = index;
    const meta = index >= 0 ? list[index].meta : undefined;
    if (!meta) return;
    setActive(meta.target);
    setLabel(meta.label);
  }, []);

  /** One sync pass: move the other pane to match `from`. */
  const sync = useCallback(
    (from: Pane) => {
      const guide = guideBox();
      const scripture = scriptureBox();
      if (!scripture) return;
      const list = segments(guide, scripture);
      const guideLine = guide.height() * READING_LINE;
      const scriptureLine = scripture.height() * READING_LINE;
      if (from === "guide") {
        const guideY = guide.top() + guideLine;
        // A passage that fits in the pane is kept whole below its reading edge (see guideScrollTop).
        const view = { height: scripture.height(), top: scriptureCovered() + LANDING_GAP, bottom: bottomCovered() + LANDING_GAP };
        const y = guideScrollTop(list, guideY, scriptureLine, view, guideLine);
        if (y != null) scrollTo(scripture, "scripture", y);
        // The guide drives again: any carried offset from scripture driving ends here. Remember this placement,
        // so a reader who takes over the scripture next continues from it.
        reverseRef.current = null;
        handoffRef.current = y != null ? { scripture: scripture.top() } : null;
        noteSegment(list, guideY);
      } else {
        const raw = scriptureToGuide(list, scripture.top() + scriptureLine);
        if (raw == null) return;
        // The plain reverse map is not an inverse of a held placement: from one, the first scripture movement
        // would throw the guide to wherever the map reads, even backward. So a hand-off starts from where the
        // guide is now, measured on the current layout against where the scripture was before this movement,
        // and the guide then follows the scripture's movement from there (followScripture). Without a hand-off
        // (deep links, explicit targets, unmapped commentary) there is nothing to carry: the plain map applies.
        let state = reverseRef.current;
        if (!state) {
          const handoff = handoffRef.current;
          const from = handoff ? scriptureToGuide(list, handoff.scripture + scriptureLine) : null;
          state = from != null ? startReverseFollow(guide.top() + guideLine, from) : startReverseFollow(raw, raw);
          handoffRef.current = null;
        }
        const step = followScripture(state, raw);
        reverseRef.current = step.state;
        scrollTo(guide, "guide", step.guide - guideLine);
        noteSegment(list, step.guide);
      }
    },
    [guideBox, scriptureBox, segments, scrollTo, noteSegment, scriptureCovered, bottomCovered]
  );

  const captureGuideAnchor = useCallback((): GuideAnchor | null => {
    const intro = introRef.current;
    const companion = companionRef.current;
    // Until the page's reading line reaches the reader, the reading position is in the introduction.
    const page = pageBox();
    const pageLine = page.top() + page.height() * READING_LINE;
    if (intro && companion && pageLine < page.offsetOf(companion)) {
      const found = blockAt(guideBlocks(intro), page, pageLine);
      return found && { part: "introduction", ...found };
    }
    const root = guideRef.current;
    if (!root) return null;
    const guide = guideBox();
    const found = blockAt(guideBlocks(root), guide, guide.top() + guide.height() * READING_LINE);
    return found && { part: "reader", ...found };
  }, [guideBox]);

  /** Scroll the page itself (the introduction's scroller) so `top` is at the top of the area under the header. */
  const scrollPage = useCallback(
    (top: number) => {
      // On desktop the page is also the guide's scroller, so the sync must know this move is not the reader's.
      if (matches(DESKTOP_QUERY)) scrollTo(pageBox(), "guide", top);
      else window.scrollTo(0, Math.max(0, Math.min(top, pageBox().max())));
    },
    [scrollTo]
  );

  /**
   * The contents entry the reader is in: the last heading (or lead) that has passed SECTION_LINE below the
   * reading edge. The introduction is measured against the page; the reader's guide against its own column
   * on phones, and only once the reader has reached the reading edge there.
   */
  const locateSection = useCallback((): string | null => {
    const companion = companionRef.current;
    const intro = introRef.current;
    if (!companion) return null;
    const pageLine = headerBottom() + SECTION_LINE;
    let readerLine = pageLine + (toolbarRef.current?.offsetHeight ?? 0);
    if (mode === "strip") {
      const panel = guidePanelRef.current;
      readerLine =
        panel && companion.getBoundingClientRect().top <= pageLine
          ? panel.getBoundingClientRect().top + SECTION_LINE
          : Number.NEGATIVE_INFINITY;
    }
    let found: string | null = null;
    for (const id of tocIds) {
      const element = document.getElementById(id);
      if (!element) continue;
      const line = intro?.contains(element) ? pageLine : readerLine;
      if (element.getBoundingClientRect().top <= line) found = id;
      else break;
    }
    return found;
  }, [mode, tocIds]);

  const subscribeSection = useCallback(
    (notify: () => void) => {
      let frame = 0;
      const queue = () => {
        if (!frame) {
          frame = window.requestAnimationFrame(() => {
            frame = 0;
            notify();
          });
        }
      };
      const panel = mode === "strip" ? guidePanelRef.current : null;
      window.addEventListener("scroll", queue, { passive: true });
      window.addEventListener("resize", queue);
      panel?.addEventListener("scroll", queue, { passive: true });
      return () => {
        window.removeEventListener("scroll", queue);
        window.removeEventListener("resize", queue);
        panel?.removeEventListener("scroll", queue);
        if (frame) window.cancelAnimationFrame(frame);
      };
    },
    [mode]
  );

  /** Left edge of the reading region (page head, introduction, reader), which the contents rail stays clear of. */
  const contentLeft = useCallback(() => {
    const page = companionRef.current?.parentElement;
    const regions = [page?.querySelector<HTMLElement>(":scope > header"), introWrapRef.current, companionRef.current];
    let left = Number.POSITIVE_INFINITY;
    for (const region of regions) if (region) left = Math.min(left, region.getBoundingClientRect().left);
    return Number.isFinite(left) ? left : 0;
  }, []);

  const saveScripturePosition = useCallback(() => {
    const scripture = scriptureBox();
    const doc = scriptureDocRef.current;
    if (!scripture || !doc) return;
    const line = scripture.top() + scripture.height() * READING_LINE;
    let mark: ScriptureMark | null = null;
    for (const el of doc.querySelectorAll<HTMLElement>("h2[id], li[id]")) {
      const top = scripture.offsetOf(el);
      if (top > line) break;
      mark = { id: el.id, ratio: Math.min(1, (line - top) / (el.getBoundingClientRect().height || 1)) };
    }
    savedScriptureRef.current = mark;
  }, [scriptureBox]);

  /** Phones: bring a side into view. Its own vertical scroll position is untouched. */
  const revealSide = useCallback((next: CompanionSide, instant = false) => {
    setSide(next);
    const strip = stripRef.current;
    const panel = next === "guide" ? guidePanelRef.current : scriptureRef.current;
    if (!strip || !panel || matches(DESKTOP_QUERY)) return;
    // Until the strip arrives, its scroll events describe the side being left; don't let them flip back.
    if (heading.current) window.clearTimeout(heading.current.timer);
    const settle = () => {
      // If a swipe interrupted the move, trust wherever the strip actually came to rest.
      heading.current = null;
      setSide(sideAtScroll(strip.scrollLeft, strip.clientWidth));
    };
    heading.current = { side: next, timer: window.setTimeout(settle, 900) };
    strip.scrollTo({ left: panel.offsetLeft, behavior: instant || matches(REDUCED_MOTION_QUERY) ? "auto" : "smooth" });
  }, []);

  // Reader geometry and docking, while the scripture is shown. Declared before the pending-work effect
  // so each commit sizes the reader before anything scrolls. Everything is measured from the live page
  // (the app header, the bottom navigation, the toolbar, the viewport), never from constants.
  useLayoutEffect(() => {
    const companion = companionRef.current;
    const guidePanel = guidePanelRef.current;
    const scripturePanel = scriptureRef.current;
    if (!companion) return;
    const reset = () => {
      for (const name of ["--cfm-chrome-top", "--cfm-toolbar-h", "--cfm-vh", "--cfm-bottom-clear"]) {
        companion.style.removeProperty(name);
      }
      companion.style.marginBottom = "";
      delete companion.dataset.docked;
      guidePanel?.removeAttribute("data-pane-scroll");
      scripturePanel?.removeAttribute("data-pane-scroll");
      paneScrollRef.current = { guide: false, scripture: false };
      refreshDockRef.current = null;
    };
    if (mode === "guide") {
      reset();
      return;
    }

    let chromeTop = 0;
    let toolbarHeight = 0;
    let pull = 0;
    /** The viewport height the current geometry was measured for. */
    let measuredViewport = -1;
    /** The last evaluated dock state, and whether a viewport resize must restore it. */
    let docked = false;
    let redockAfterResize = false;
    const readerElement = () => (mode === "strip" ? companion : scripturePanel);
    const dockLine = () => (mode === "strip" ? chromeTop : chromeTop + toolbarHeight);
    // A viewport change (URL bar, rotation, on-screen keyboard closing) resizes the reader only after the
    // browser has already clamped the page to the old, shorter document, which can leave a docked reader
    // stranded part-way down. Remember that it was docked, so the next measurement can put it back.
    const noteViewportChange = () => {
      if (docked) redockAfterResize = true;
    };
    const applyDock = () => {
      const reader = readerElement();
      if (!reader) return;
      if (window.innerHeight !== measuredViewport) {
        // The geometry is stale: keep the docked intent and let the measurement decide.
        noteViewportChange();
        scheduleMeasure();
        return;
      }
      const root = document.documentElement;
      docked = isDocked({
        readerTop: reader.getBoundingClientRect().top,
        dockTop: dockLine(),
        scrollTop: window.scrollY,
        maxScroll: root.scrollHeight - window.innerHeight,
      });
      const panes = paneScrolling(mode, docked);
      paneScrollRef.current = panes;
      if (docked) companion.dataset.docked = "true";
      else delete companion.dataset.docked;
      guidePanel?.setAttribute("data-pane-scroll", panes.guide ? "on" : "off");
      scripturePanel?.setAttribute("data-pane-scroll", panes.scripture ? "on" : "off");
    };
    const measure = () => {
      const header = document.querySelector<HTMLElement>(".app-header");
      chromeTop = 0;
      if (header) {
        const style = getComputedStyle(header);
        // Only a header that stays on screen covers the top of the viewport.
        if (style.display !== "none" && (style.position === "sticky" || style.position === "fixed")) {
          chromeTop = header.getBoundingClientRect().height;
        }
      }
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Primary mobile navigation"]');
      const bottomClear =
        nav && getComputedStyle(nav).display !== "none" ? Math.max(0, window.innerHeight - nav.getBoundingClientRect().top) : 0;
      toolbarHeight = toolbarRef.current?.getBoundingClientRect().height ?? 0;
      companion.style.setProperty("--cfm-chrome-top", `${chromeTop}px`);
      companion.style.setProperty("--cfm-toolbar-h", `${toolbarHeight}px`);
      companion.style.setProperty("--cfm-vh", `${window.innerHeight}px`);
      companion.style.setProperty("--cfm-bottom-clear", `${bottomClear}px`);
      if (mode === "strip") {
        // End the page exactly at the reader's bottom edge, so docking is the page's own scroll limit.
        const next = trailingPull({
          documentHeight: document.documentElement.scrollHeight,
          readerBottom: companion.getBoundingClientRect().bottom + window.scrollY,
          currentPull: pull,
        });
        if (next !== pull) {
          pull = next;
          companion.style.marginBottom = pull ? `-${pull}px` : "";
        }
      }
      measuredViewport = window.innerHeight;
      const reader = readerElement();
      if (reader) {
        // Now that the reader and the page end match the new viewport, return a reader that was docked to
        // the dock line. Only the page moves; the panes' own scroll positions are untouched.
        const target = redockScroll({
          wasDocked: redockAfterResize,
          readerTop: reader.getBoundingClientRect().top,
          dockTop: dockLine(),
          scrollTop: window.scrollY,
          maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        });
        if (target != null) window.scrollTo(0, target);
      }
      redockAfterResize = false;
      applyDock();
    };

    let measureFrame = 0;
    let dockFrame = 0;
    function scheduleMeasure() {
      if (!measureFrame) {
        measureFrame = window.requestAnimationFrame(() => {
          measureFrame = 0;
          measure();
        });
      }
    }
    const scheduleDock = () => {
      if (!dockFrame) {
        dockFrame = window.requestAnimationFrame(() => {
          dockFrame = 0;
          // A pending measurement re-evaluates the dock itself, with geometry that matches the viewport.
          if (!measureFrame) applyDock();
        });
      }
    };
    const onViewportResize = () => {
      noteViewportChange();
      scheduleMeasure();
    };
    measure();
    refreshDockRef.current = measure;
    window.addEventListener("scroll", scheduleDock, { passive: true });
    window.addEventListener("resize", onViewportResize);
    window.visualViewport?.addEventListener("resize", onViewportResize);
    const resize = new ResizeObserver(scheduleMeasure);
    resize.observe(companion);
    if (toolbarRef.current) resize.observe(toolbarRef.current);
    const header = document.querySelector<HTMLElement>(".app-header");
    if (header) resize.observe(header);
    return () => {
      window.removeEventListener("scroll", scheduleDock);
      window.removeEventListener("resize", onViewportResize);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      resize.disconnect();
      if (measureFrame) window.cancelAnimationFrame(measureFrame);
      if (dockFrame) window.cancelAnimationFrame(dockFrame);
      reset();
    };
  }, [mode]);

  // A real resize across the desktop breakpoint: carry the guide's reading position into the new layout,
  // and bring the scripture along where it shows. Nothing scrolls the page or docks the reader. The first
  // render after hydration on a phone (server snapshot "desktop", then the phone's own) is not a resize.
  // Declared after the geometry effect, so the new layout is sized before the pending work below runs.
  useLayoutEffect(() => {
    const live = matches(DESKTOP_QUERY);
    if (settledDesktopRef.current === null) {
      settledDesktopRef.current = live;
      return;
    }
    if (desktop !== live || settledDesktopRef.current === desktop) return;
    settledDesktopRef.current = desktop;
    if (!desktop) {
      // The side state is already "guide" (reset when the desktop layout rendered); put the strip itself
      // there too, before paint, and drop any programmatic side change that was still in flight.
      if (heading.current) {
        window.clearTimeout(heading.current.timer);
        heading.current = null;
      }
      if (stripRef.current) stripRef.current.scrollLeft = 0;
    }
    pendingRef.current = {
      ...pendingRef.current,
      guideAnchor: lastGuideAnchorRef.current,
      sync: mode === "guide" ? undefined : "guide",
    };
  }, [desktop, mode]);

  // Carry out scheduled work once the DOM shows the new layout, before paint.
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    // Wait while the rendered layout does not match the viewport yet (a phone's first render after
    // hydration, or a resize React has not caught up with); that re-render follows immediately.
    if ((mode === "strip") !== !matches(DESKTOP_QUERY)) return;
    pendingRef.current = null;
    segmentsRef.current = null;
    segmentIndexRef.current = -1;
    // Explicit targets, deep links, the Show/Hide switch, and breakpoint changes start from the plain mapping:
    // no hand-off is carried (a guide-driven sync below may start a fresh one).
    handoffRef.current = null;
    reverseRef.current = null;
    const guide = guideBox();
    const scripture = scriptureBox();
    const root = guideRef.current;
    // Phones: any navigation into the reader docks it first, so neither side opens half off screen.
    // Restoring a reading position alone (a resize) leaves the page where it is.
    if (mode === "strip" && (pending.guideTo || pending.scriptureTo || pending.reveal)) {
      companionRef.current?.scrollIntoView({ block: "start" });
      refreshDockRef.current?.();
    }
    if (pending.guideAnchor) {
      const { part, index, ratio } = pending.guideAnchor;
      const intro = part === "introduction";
      const box = intro ? pageBox() : guide;
      const scope = intro ? introRef.current : root;
      const block = scope ? guideBlocks(scope)[index] : undefined;
      if (block) {
        const y = box.offsetOf(block) + ratio * block.getBoundingClientRect().height - box.height() * READING_LINE;
        if (intro) scrollPage(y);
        else scrollTo(guide, "guide", y);
      }
    }
    if (pending.restoreScripture && scripture && savedScriptureRef.current) {
      const el = document.getElementById(savedScriptureRef.current.id);
      if (el) {
        const y = scripture.offsetOf(el) + savedScriptureRef.current.ratio * el.getBoundingClientRect().height;
        scrollTo(scripture, "scripture", y - scripture.height() * READING_LINE);
      }
    }
    if (pending.guideTo) {
      const el = document.getElementById(pending.guideTo);
      if (el) scrollTo(guide, "guide", guide.offsetOf(el) - LANDING_GAP);
    }
    if (pending.scriptureTo && scripture) {
      const start = targetStart(pending.scriptureTo, passages);
      const el = document.getElementById(
        start.verse != null ? scriptureVerseId(book.slug, start.chapter, start.verse) : scriptureAnchor(book.slug, start.chapter)
      );
      if (el && pending.sync === "scripture") {
        // A deep link then brings the guide along: put the target's start on the reading line the sync
        // reads, so the guide lands on that verse's commentary, not on whatever sits 30% further down.
        const y = scripture.offsetOf(el) + (start.secondHalf ? el.getBoundingClientRect().height / 2 : 0);
        scrollTo(scripture, "scripture", alignAtReadingLine(y, scripture.height(), READING_LINE));
      } else if (el) {
        // On phones the sticky "Back to the guide" button covers the side's top; land below it.
        scrollTo(scripture, "scripture", scripture.offsetOf(el) - scriptureCovered() - LANDING_GAP);
      }
    }
    if (pending.sync && scripture) sync(pending.sync);
    if (pending.reveal) revealSide(pending.reveal.side, pending.reveal.instant);
    if (pending.focusId) focusWithoutScrolling(document.getElementById(pending.focusId));
    if (pending.focusToggle) toggleRef.current?.focus();
  });

  // Live sync, only while the scripture is shown.
  useEffect(() => {
    if (mode === "guide") return;
    const scriptureEl = scriptureRef.current;
    const guideEl = mode === "strip" ? guidePanelRef.current : null;
    if (!scriptureEl) return;
    const ownership = ownershipRef.current;
    const guideTarget: HTMLElement | Window = guideEl ?? window;
    let frame = 0;
    let driver: Pane | null = null;
    const queue = (pane: Pane) => {
      driver = pane;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const from = driver;
        driver = null;
        if (from) sync(from);
      });
    };
    const guideTop = () => (guideEl ? guideEl.scrollTop : window.scrollY);
    const onGuideScroll = () => {
      if (ownership.scrolled("guide", guideTop(), performance.now())) queue("guide");
    };
    const onScriptureScroll = () => {
      if (ownership.scrolled("scripture", scriptureEl.scrollTop, performance.now())) queue("scripture");
    };
    // Direct input says who the reader is moving. Listeners are passive: nothing is prevented.
    const markGuide = (event: Event) => {
      if (event.target instanceof Node && scriptureEl.contains(event.target)) return;
      ownership.input("guide", performance.now());
    };
    // Input over the scripture belongs to it only if the scripture will actually move: a pane that is
    // not docked yet, or a wheel turn past its end, scrolls the page (the guide, on desktop) instead.
    const markScripture = (event: Event) => {
      const scrollable = paneScrollRef.current.scripture;
      const takes =
        event.type === "wheel"
          ? paneTakesWheel(
              {
                scrollTop: scriptureEl.scrollTop,
                clientHeight: scriptureEl.clientHeight,
                scrollHeight: scriptureEl.scrollHeight,
                scrollable,
              },
              (event as WheelEvent).deltaY
            )
          : scrollable;
      ownership.input(takes ? "scripture" : "guide", performance.now());
    };
    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const type of inputs) {
      guideTarget.addEventListener(type, markGuide, { passive: true });
      scriptureEl.addEventListener(type, markScripture, { passive: true });
    }
    guideTarget.addEventListener("scroll", onGuideScroll, { passive: true });
    scriptureEl.addEventListener("scroll", onScriptureScroll, { passive: true });
    // Images, fonts, and width changes move anchors: measure again on the next pass. The introduction sits
    // above the reader on the page, so its height moves every page offset of the guide.
    // A carried offset was measured on the old layout too, so it is dropped. A hand-off in progress (waiting
    // for a takeover, or the reader driving the scripture) is not: it restarts from where the scripture is
    // now (already re-laid-out by the time this reads it), so the next scripture movement is re-anchored on
    // the new layout from wherever the guide is then, instead of falling back to the plain map with a jump.
    const invalidate = () => {
      segmentsRef.current = null;
      if (reverseRef.current || handoffRef.current) handoffRef.current = { scripture: scriptureEl.scrollTop };
      reverseRef.current = null;
    };
    invalidate();
    const resize = new ResizeObserver(invalidate);
    if (guideRef.current) resize.observe(guideRef.current);
    if (introRef.current) resize.observe(introRef.current);
    if (scriptureDocRef.current) resize.observe(scriptureDocRef.current);
    window.addEventListener("resize", invalidate);
    return () => {
      for (const type of inputs) {
        guideTarget.removeEventListener(type, markGuide);
        scriptureEl.removeEventListener(type, markScripture);
      }
      guideTarget.removeEventListener("scroll", onGuideScroll);
      scriptureEl.removeEventListener("scroll", onScriptureScroll);
      window.removeEventListener("resize", invalidate);
      resize.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mode, sync]);

  // Remember where the guide is once a scroll settles, for a resize across the breakpoint. By the time
  // the viewport crosses it, the CSS has already reflowed the old layout, so it cannot be measured then.
  // The page always scrolls the introduction; on phones the reader's guide scrolls its own side.
  useEffect(() => {
    const panel = mode === "strip" ? guidePanelRef.current : null;
    let timer = 0;
    const note = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if ((mode === "strip") === !matches(DESKTOP_QUERY)) lastGuideAnchorRef.current = captureGuideAnchor();
      }, 150);
    };
    window.addEventListener("scroll", note, { passive: true });
    panel?.addEventListener("scroll", note, { passive: true });
    return () => {
      window.removeEventListener("scroll", note);
      panel?.removeEventListener("scroll", note);
      window.clearTimeout(timer);
    };
  }, [mode, captureGuideAnchor]);

  // The reading edge: an opaque band of page paper over the app's transparent sticky header and, once the
  // reader's toolbar row sticks under it, over that row too. Text scrolling up then disappears at one clean
  // edge shared by the guide and the scripture column, instead of showing through between the header's
  // floating controls and the toolbar. Written straight to the DOM: it changes with every scroll.
  useEffect(() => {
    const edge = edgeRef.current;
    const toolbar = toolbarRef.current;
    const companion = companionRef.current;
    if (!edge || !toolbar || !companion) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const stickyTop = parseFloat(getComputedStyle(toolbar).top) || 0;
      const bar = toolbar.getBoundingClientRect();
      const stuck = bar.height > 0 && bar.top <= stickyTop + 0.5 && companion.getBoundingClientRect().top < stickyTop - 0.5;
      const bottom = Math.max(headerBottom(), stuck ? bar.bottom : 0);
      edge.style.height = `${bottom}px`;
      if (bottom > 0 && window.scrollY > 0) edge.dataset.scrolled = "true";
      else delete edge.dataset.scrolled;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(toolbar);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mode]);

  // Desktop only: the switch is not rendered in the phone strip.
  const toggleScripture = () => {
    const guideAnchor = captureGuideAnchor();
    if (scriptureOn) {
      saveScripturePosition();
      const focusInside = !!scriptureRef.current?.contains(document.activeElement);
      setScriptureOn(false);
      schedule({ guideAnchor, focusToggle: focusInside });
    } else {
      setScriptureOn(true);
      schedule({ guideAnchor, restoreScripture: true, sync: "guide" });
    }
  };

  const showScripture = useCallback(
    (
      raw: ScriptureTarget,
      options: { updateHash: boolean; fromGuide?: string | null; initial?: boolean; follow?: boolean }
    ) => {
      const target = normalize(raw);
      if (!target) return;
      const phone = !matches(DESKTOP_QUERY);
      // Phones always have the scripture; only the desktop layout changes when it opens.
      const entering = !phone && !scriptureOn;
      setActive(target);
      if (!phone) setScriptureOn(true);
      if (options.updateHash) {
        window.history.replaceState(null, "", `#${scriptureAnchor(book.slug, target.chapter, target.first, target.last)}`);
      }
      if (phone) {
        setSide("scripture");
        if (options.fromGuide !== undefined) setReturnTo(options.fromGuide);
      }
      schedule({
        guideAnchor: entering ? captureGuideAnchor() : undefined,
        scriptureTo: target,
        // A deep link into the scripture, or a reference clicked in the introduction (which is not beside
        // the scripture), also brings the guide to its commentary; a click inside the reader's guide leaves
        // the reader's place in the guide alone.
        sync: options.initial || options.follow ? "scripture" : undefined,
        reveal: phone ? { side: "scripture", instant: !!options.initial } : undefined,
        focusId:
          phone && !options.initial
            ? target.first != null
              ? scriptureVerseId(book.slug, target.chapter, target.first)
              : scriptureAnchor(book.slug, target.chapter)
            : undefined,
      });
    },
    [book.slug, captureGuideAnchor, normalize, schedule, scriptureOn]
  );

  const showGuide = useCallback(
    (id: string, options: { updateHash: boolean; initial?: boolean; focus?: boolean }) => {
      const element = document.getElementById(id);
      if (!element) return;
      const strip = !matches(DESKTOP_QUERY);
      if (introRef.current?.contains(element)) {
        // The introduction is page content: scroll the page to it, below the app header. The reader is left
        // as it is (on phones its strip goes back to the guide side, ready for the next visit).
        if (options.updateHash) window.history.replaceState(null, "", `#${id}`);
        if (strip) revealSide("guide", true);
        scrollPage(pageBox().offsetOf(element) - LANDING_GAP);
        if (options.focus || (strip && !options.initial)) focusWithoutScrolling(element);
        return;
      }
      if (!guideRef.current?.contains(element)) return;
      const target = targetFromGuideElement(element);
      if (target) setActive(target);
      if (options.updateHash) window.history.replaceState(null, "", `#${id}`);
      if (strip) setSide("guide");
      schedule({
        guideTo: id,
        sync: strip || scriptureOn ? "guide" : undefined,
        reveal: strip ? { side: "guide", instant: !!options.initial } : undefined,
        focusId: options.focus || (strip && !options.initial) ? id : undefined,
      });
    },
    [revealSide, schedule, scriptureOn, scrollPage]
  );

  /** A contents entry: the introduction scrolls the page; the reader lands on it below the toolbar. */
  const navigateToSection = useCallback((id: string) => showGuide(id, { updateHash: true, focus: true }), [showGuide]);
  const openContents = useCallback((opener: HTMLElement) => contentsRef.current?.open(opener), []);

  // Deep links: `#scripture-isaiah-53-v4` shows the scripture there; any commentary id scrolls the guide.
  const showScriptureRef = useRef(showScripture);
  const showGuideRef = useRef(showGuide);
  useEffect(() => {
    showScriptureRef.current = showScripture;
    showGuideRef.current = showGuide;
  }, [showScripture, showGuide]);
  useEffect(() => {
    const apply = (initial: boolean) => {
      // A malformed fragment ("#%") is ignored rather than crashing the page.
      const id = decodeFragment(window.location.hash);
      if (!id) return;
      const target = parseScriptureAnchor(id, book.slug);
      if (target) showScriptureRef.current(target, { updateHash: false, fromGuide: null, initial });
      else showGuideRef.current(id, { updateHash: false, initial });
    };
    apply(true);
    const onHashChange = () => apply(false);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [book.slug]);

  // Phones: a native horizontal swipe settles on a side; keep the indicator and inert state in step.
  const onStripScroll = () => {
    const strip = stripRef.current;
    if (!strip || mode !== "strip") return;
    const settled = sideAtScroll(strip.scrollLeft, strip.clientWidth);
    if (heading.current) {
      if (settled !== heading.current.side) return;
      window.clearTimeout(heading.current.timer);
      heading.current = null;
    }
    setSide(settled);
  };

  // Scripture references in the introduction or the reader's guide open the local scripture.
  const onGuideClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest("a");
    const root = event.currentTarget;
    if (!link || !root.contains(link)) return;
    const target = localScriptureTarget(link.getAttribute("href"), book, chapterNumbers);
    if (!target) return;
    event.preventDefault();
    showScripture(target, {
      updateHash: true,
      fromGuide: nearestGuideAnchor(root, link),
      follow: root === introRef.current,
    });
  };

  const onPagerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = event.key === "ArrowLeft" ? "guide" : "scripture";
    revealSide(next);
    document.getElementById(`cfm-show-${next}`)?.focus();
  };

  const guideHidden = mode === "strip" && side !== "guide";
  const scriptureHidden = mode === "strip" && side !== "scripture";
  const highlighted = (chapter: number, verse: number) =>
    active != null && active.chapter === chapter && active.first != null && verse >= active.first && verse <= (active.last ?? active.first);

  return (
    <>
      <div ref={edgeRef} className={styles.readingEdge} aria-hidden="true" />
      <ContentsNav
        toc={toc}
        handle={contentsRef}
        subscribe={subscribeSection}
        getActive={locateSection}
        contentLeft={contentLeft}
        layoutKey={mode}
        onNavigate={navigateToSection}
      />
      {introductionHtml ? (
        <div ref={introWrapRef} className={styles.introduction}>
          <ContentsOpener onOpen={openContents} />
          <div ref={introRef} className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={introHtml} />
        </div>
      ) : null}
      <div ref={companionRef} className={styles.companion} data-mode={mode}>
        <div ref={toolbarRef} className={styles.toolbar}>
          <ContentsOpener onOpen={openContents} />
          {mode === "strip" ? (
            <div className={styles.pager} role="group" aria-label="Study guide and scripture">
              <button
                id="cfm-show-guide"
                type="button"
                className={styles.pagerButton}
                aria-controls="cfm-panel-guide"
                aria-pressed={side === "guide"}
                onClick={() => revealSide("guide")}
                onKeyDown={onPagerKeyDown}
              >
                <span aria-hidden="true">‹ </span>Guide
              </button>
              <span className={styles.pagerDots} aria-hidden="true">
                <span data-on={side === "guide" ? "true" : undefined} />
                <span data-on={side === "scripture" ? "true" : undefined} />
              </span>
              <button
                id="cfm-show-scripture"
                type="button"
                className={styles.pagerButton}
                aria-controls="cfm-panel-scripture"
                aria-pressed={side === "scripture"}
                onClick={() => revealSide("scripture")}
                onKeyDown={onPagerKeyDown}
              >
                {label}
                <span aria-hidden="true"> ›</span>
              </button>
              <span className={styles.srOnly} aria-live="polite">
                {side === "guide" ? "Showing the study guide" : `Showing the scripture, ${label}`}
              </span>
            </div>
          ) : (
            <button
              ref={toggleRef}
              type="button"
              className={styles.toggle}
              aria-expanded={scriptureOn}
              aria-controls="cfm-panel-scripture"
              onClick={toggleScripture}
            >
              {scriptureOn ? "Hide scriptures" : "Show scriptures"}
            </button>
          )}
        </div>

        <div ref={stripRef} className={styles.layout} onScroll={onStripScroll}>
          <section ref={guidePanelRef} id="cfm-panel-guide" aria-label="Study guide" className={styles.guidePanel} inert={guideHidden}>
            <div ref={guideRef} className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={guideHtml} />
            {mode === "strip" ? footer : null}
          </section>

          <section
            ref={scriptureRef}
            id="cfm-panel-scripture"
            aria-label={`Scripture: ${book.label} ${firstChapter}–${lastChapter}`}
            className={styles.scripturePanel}
            hidden={mode === "guide"}
            inert={scriptureHidden}
          >
            {returnTo && mode === "strip" ? (
              <button ref={backToGuideRef} type="button" className={styles.backToGuide} onClick={() => showGuide(returnTo, { updateHash: true })}>
                <span aria-hidden="true">‹ </span>Back to the guide
              </button>
            ) : null}
            <div ref={scriptureDocRef} className={styles.scriptureDoc}>
              {chapters.map((entry) => (
                <section key={entry.chapter} className={styles.scriptureChapter} aria-labelledby={scriptureAnchor(book.slug, entry.chapter)}>
                  <h2 id={scriptureAnchor(book.slug, entry.chapter)} className={styles.chapterTitle}>
                    <span className={styles.chapterBook}>{book.label}</span>
                    <span className={styles.chapterNumber}>{entry.chapter}</span>
                  </h2>
                  <ol className={styles.verses}>
                    {entry.verses.map((verse) => (
                      <li
                        key={verse.verse}
                        id={scriptureVerseId(book.slug, entry.chapter, verse.verse)}
                        value={verse.verse}
                        data-active={highlighted(entry.chapter, verse.verse) ? "true" : undefined}
                      >
                        <span className={styles.verseNumber} aria-hidden="true">
                          {verse.verse}
                        </span>
                        <span className={styles.srOnly}>Verse {verse.verse}: </span>
                        {typesetDashes(verse.text)}
                        {(passagesByStart.get(`${entry.chapter}:${verse.verse}`) ?? []).map((passage) => (
                          <a
                            key={passage.id}
                            href={`#${passage.id}`}
                            className={styles.guideLink}
                            aria-label={`Read commentary on ${book.label} ${passage.label}`}
                            onClick={(event) => {
                              event.preventDefault();
                              showGuide(passage.id, { updateHash: true });
                            }}
                          >
                            Guide {passage.label}
                          </a>
                        ))}
                      </li>
                    ))}
                  </ol>
                  <p className={styles.readerLink}>
                    <Link href={getChapterHref({ volume: book.volume, book: book.slug, chapter: entry.chapter })}>
                      Open {book.label} {entry.chapter} in the reader
                    </Link>
                  </p>
                </section>
              ))}
            </div>
          </section>
        </div>
        {mode !== "strip" ? footer : null}
      </div>
    </>
  );
}
