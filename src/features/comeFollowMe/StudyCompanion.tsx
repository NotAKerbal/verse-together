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
import {
  guideSectionAt,
  returnsToGuide,
  ScriptureDeparture,
  scripturePositionAt,
  sideAtScroll,
  type CompanionSide,
  type ScriptureMark,
  type StripInput,
} from "./companionPanes";
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
import { useGuideHighlights } from "./useGuideHighlights";
import { useScriptureAnnotations } from "./useScriptureAnnotations";
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
  /** The guide's week start (its route key), which identifies the guide for the reader's guide highlights. */
  weekStart: string;
  /**
   * The page footer. It normally follows the companion; in the phone reader it closes the guide side
   * instead, so nothing trails the docked reader on the page.
   */
  footer?: ReactNode;
};

/**
 * Desktop: columns, the guide and the scripture always side by side. Phones and small tablets: the strip,
 * guide first, scripture one swipe away. There is no switch between them; the viewport decides.
 */
type Mode = "columns" | "strip";

type SegmentMeta = { target: ScriptureTarget; label: string };

/**
 * A reading position inside the guide that survives a layout change: a top-level block of the introduction
 * or of the reader's guide, and how far into it.
 */
type GuideAnchor = { part: "introduction" | "reader"; index: number; ratio: number };

/** Work to do once the DOM reflects a state change, in this order. */
type Pending = {
  guideAnchor?: GuideAnchor | null;
  guideTo?: string;
  scriptureTo?: ScriptureTarget;
  sync?: Pane;
  reveal?: { side: CompanionSide; instant: boolean };
  focusId?: string;
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
 * Gap left above an element an explicit navigation brings to the top, below the measured chrome (the app
 * header, plus the reader's toolbar row where one shows). It matches the top padding of the guide and
 * scripture columns, so landing on the first chapter docks the reader exactly, with its heading just clear.
 */
const LANDING_GAP = 12;
/** The contents mark the entry whose heading has passed this far below the measured chrome as current. */
const SECTION_LINE = 80;
/** A strip movement this soon after the reader's last touch, wheel turn, or key on it is their swipe. */
const STRIP_INPUT_MS = 400;
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

/**
 * A text selection in `root`, or a modal dialog open on the page (annotations, guide highlights, contents):
 * a horizontal movement then is part of selecting or editing, not the reader turning to the other side.
 */
function busyWithin(root: HTMLElement | null): boolean {
  if (document.querySelector("dialog[open]")) return true;
  const selection = window.getSelection();
  if (!root || !selection || selection.isCollapsed) return false;
  return [selection.anchorNode, selection.focusNode].some((node) => node != null && root.contains(node));
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

export default function StudyCompanion({ introductionHtml, readerHtml, toc, passages, book, chapters, weekStart, footer }: Props) {
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

  const [side, setSide] = useState<CompanionSide>("guide");
  const [active, setActive] = useState<ScriptureTarget | null>(null);
  const [label, setLabel] = useState(`${book.label} ${firstChapter}`);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  // Server render and hydration assume desktop; phones settle on the strip right after.
  const desktop = useSyncExternalStore(subscribeDesktop, () => matches(DESKTOP_QUERY), () => true);
  const mode: Mode = desktop ? "columns" : "strip";

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

  const introRef = useRef<HTMLDivElement>(null);
  const contentsRef = useRef<ContentsHandle>(null);
  const companionRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
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
  /** A side the strip is being scrolled to programmatically. */
  const heading = useRef<{ side: CompanionSide; timer: number } | null>(null);
  /** Phones: the strip's first movement away from a scripture side it rested on. */
  const departureRef = useRef(new ScriptureDeparture());
  /** Phones: fingers on the strip, and when the reader last touched, turned, or keyed it. */
  const stripInputRef = useRef<StripInput>({ touches: 0, at: Number.NEGATIVE_INFINITY });
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
  const annotations = useScriptureAnnotations(book, chapterNumbers, scriptureDocRef);
  const guideHighlights = useGuideHighlights(weekStart, introRef, guideRef);

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

  /**
   * Where the guide scrolls in the current layout: its own side of the strip on phones, else the page, under
   * the app header and the guide column's own toolbar row, both measured live (the row is zero-height
   * wherever it has nothing to show). The scripture column has no toolbar row: it measures its own pane.
   */
  const guideBox = useCallback((): ScrollBox => {
    if (mode === "strip" && guidePanelRef.current) return elementBox(guidePanelRef.current);
    return windowBox(() => headerBottom() + (toolbarRef.current?.offsetHeight ?? 0));
  }, [mode]);

  const scriptureBox = useCallback((): ScrollBox | null => {
    const el = scriptureRef.current;
    return el ? elementBox(el) : null;
  }, []);

  /**
   * Where reading starts inside the docked scripture pane, from its top. On desktop the pane's own scroller
   * runs up to the viewport top, exactly like the page-scrolled guide beside it, so its text passes under and
   * between the transparent app header's floating controls; that header (measured) is where reading starts.
   * On phones the strip side starts below its pager row, with nothing floating over it.
   * This is a reading and landing measure only: the pane still clips at its real top edge.
   */
  const scriptureReadingTop = useCallback(() => (mode === "columns" ? headerBottom() : 0), [mode]);

  /**
   * How much of the scripture pane's top an explicit landing or a held passage keeps clear of: the reading top,
   * or on phones the sticky "Back to the guide" button where it shows.
   */
  const scriptureCovered = useCallback(() => {
    const back = backToGuideRef.current?.getBoundingClientRect();
    const panel = scriptureRef.current;
    const backCover = back && back.height > 0 && panel ? Math.max(0, back.bottom - panel.getBoundingClientRect().top) : 0;
    return Math.max(scriptureReadingTop(), backCover);
  }, [scriptureReadingTop]);

  /** The scripture pane's reading line: READING_LINE of the way down the part of it below its reading top. */
  const scriptureLineOf = useCallback(
    (scripture: ScrollBox) => {
      const top = scriptureReadingTop();
      return top + (scripture.height() - top) * READING_LINE;
    },
    [scriptureReadingTop]
  );

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
      const scriptureLine = scriptureLineOf(scripture);
      if (from === "guide") {
        const guideY = guide.top() + guideLine;
        // A passage that fits in the pane is kept whole, clear of the pane's top and bottom (see guideScrollTop).
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
    [guideBox, scriptureBox, segments, scrollTo, noteSegment, scriptureCovered, bottomCovered, scriptureLineOf]
  );

  /**
   * Phones, turning from the scripture back to the guide: the guide opens at the start of the commentary for
   * the verse on the scripture's reading line (its passage, or its chapter's opening), just below the side's
   * top, instead of wherever the live sync's proportional mapping, a deep link, or the reader's own guide
   * reading left it. Every return does this, the first after a deep link or a reference included. The
   * scripture stays where it is, and its next movement continues the guide from here (a hand-off), so
   * nothing jumps back. Repeating it with the scripture unmoved lands on the same place, so it scrolls nothing.
   */
  const openGuideAtScripture = useCallback(() => {
    if (mode !== "strip" || matches(DESKTOP_QUERY)) return;
    if (busyWithin(companionRef.current)) return;
    const scripture = scriptureBox();
    const root = guideRef.current;
    if (!scripture || !root) return;
    const line = scripture.top() + scriptureLineOf(scripture);
    // Each chapter's heading, then its verses, in document order; measuring stops at the first one below the line.
    const marks: ScriptureMark[] = [];
    const below = () => marks.length > 0 && marks[marks.length - 1].top > line;
    for (const entry of chapters) {
      for (const verse of [null, ...entry.verses.map((item) => item.verse)]) {
        const el = document.getElementById(
          verse == null ? scriptureAnchor(book.slug, entry.chapter) : scriptureVerseId(book.slug, entry.chapter, verse)
        );
        if (!el) continue;
        const height = verse == null ? 0 : el.getBoundingClientRect().height;
        marks.push({ chapter: entry.chapter, verse, top: scripture.offsetOf(el), height });
        if (below()) break;
      }
      if (below()) break;
    }
    const position = scripturePositionAt(marks, { scrollTop: scripture.top(), line });
    if (!position) return;
    const section = guideSectionAt(position, passages);
    const el =
      section.kind === "passage"
        ? document.getElementById(section.id)
        : root.querySelector<HTMLElement>(`section.cfm-section[data-chapter="${section.chapter}"] > h2`);
    if (!el || !root.contains(el)) return;
    const guide = guideBox();
    scrollTo(guide, "guide", guide.offsetOf(el) - LANDING_GAP);
    reverseRef.current = null;
    handoffRef.current = { scripture: scripture.top() };
    // The pager label and verse highlight name the section landed on (1px inside it, past any rounding).
    noteSegment(segments(guide, scripture), guide.offsetOf(el) + 1);
  }, [mode, scriptureBox, scriptureLineOf, chapters, book.slug, passages, guideBox, scrollTo, noteSegment, segments]);

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
   * measured chrome. The introduction is measured against the page; the reader's guide against its own
   * column on phones, and only once the reader has reached the top there.
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

  /**
   * Left edge the reading region (page head, introduction, reader, one column) has when centered in the app's
   * main column, which the contents rail sizes itself to stay clear of. Computed, not read off the region:
   * while the rail shows, the region moves over to center beside it (see .page in the CSS), and sizing the
   * rail from where that leaves it would feed back. The column's width is the same either way.
   */
  const contentLeft = useCallback(() => {
    const companion = companionRef.current;
    const main = companion?.parentElement?.parentElement;
    if (!companion || !main) return 0;
    const box = main.getBoundingClientRect();
    const style = getComputedStyle(main);
    const left = box.left + parseFloat(style.paddingLeft);
    const right = box.right - parseFloat(style.paddingRight);
    return (left + right - companion.getBoundingClientRect().width) / 2;
  }, []);

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

  // Reader geometry and docking. Declared before the pending-work effect so each commit sizes the reader
  // before anything scrolls. Everything is measured from the live page (the app header, the bottom
  // navigation, the toolbar row, which may be zero-height, and the viewport), never from constants.
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

    let chromeTop = 0;
    let toolbarHeight = 0;
    let pull = 0;
    /** The viewport height the current geometry was measured for. */
    let measuredViewport = -1;
    /** The last evaluated dock state, and whether a viewport resize must restore it. */
    let docked = false;
    let redockAfterResize = false;
    // Phones dock the whole reader (pager row first) under the app header where one shows. Desktop docks the
    // scripture column at the viewport top, its real clipping edge, the same edge the page-scrolled guide
    // has; the transparent app header floats over both columns alike.
    const readerElement = () => (mode === "strip" ? companion : scripturePanel);
    const dockLine = () => (mode === "strip" ? chromeTop : 0);
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
      departureRef.current.reset();
    }
    pendingRef.current = { ...pendingRef.current, guideAnchor: lastGuideAnchorRef.current, sync: "guide" };
  }, [desktop]);

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
    // Explicit targets, deep links, and breakpoint changes start from the plain mapping: no hand-off is
    // carried (a guide-driven sync below may start a fresh one).
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
    if (pending.guideTo) {
      const el = document.getElementById(pending.guideTo);
      if (el) scrollTo(guide, "guide", guide.offsetOf(el) - LANDING_GAP);
    }
    /** The scripture target, where its reading starts inside it, and the pane scroll its landing asked for. */
    let landing: { el: HTMLElement; lead: number; requested: number } | null = null;
    if (pending.scriptureTo && scripture) {
      const start = targetStart(pending.scriptureTo, passages);
      const el = document.getElementById(
        start.verse != null ? scriptureVerseId(book.slug, start.chapter, start.verse) : scriptureAnchor(book.slug, start.chapter)
      );
      if (el) {
        // A second-half target (57:13b–14) starts halfway down its verse, not at the verse's top.
        const lead = start.secondHalf ? el.getBoundingClientRect().height / 2 : 0;
        const y = scripture.offsetOf(el) + lead;
        let requested: number;
        if (pending.sync === "scripture") {
          // A deep link then brings the guide along: put the target's start on the reading line the sync
          // reads, so the guide lands on that verse's commentary, not on whatever sits 30% further down.
          // (The line is measured below the pane's reading top, so both offsets are taken from there.)
          const top = scriptureReadingTop();
          requested = alignAtReadingLine(y - top, scripture.height() - top, READING_LINE);
        } else {
          // Land the target's verse below whatever covers the pane's top: the app header on desktop, the Back
          // button on phones.
          requested = scripture.offsetOf(el) - scriptureCovered() - LANDING_GAP;
        }
        scrollTo(scripture, "scripture", requested);
        landing = { el, lead, requested };
      }
    }
    if (pending.sync && scripture) sync(pending.sync);
    const panel = scriptureRef.current;
    const layout = stripRef.current;
    // Only a genuine start-of-scripture target: its landing asked for a scroll above the pane's first pixel
    // (so the pane could not place it), and the pane's own native scroll is in fact still at 0.
    if (mode === "columns" && landing && landing.requested < 1 && panel && layout && panel.scrollTop < 1) {
      // Desktop: a target at the very start of the scripture (its first chapter heading) cannot be scrolled clear
      // of the app header inside the pane: the pane is already at the top of its own scroll, and while it is
      // docked its top is the viewport top. Only the page can show it, and only by leaving the reader undocked.
      // So the page goes to the reader's natural origin: the pane's top at the measured header bottom (lower
      // if the target needs more room to clear it by LANDING_GAP). The guide, which is the page, then shows
      // the start of the same chapter beside it, and a guide-driven pass settles the panes' sync state there.
      const header = headerBottom();
      const targetTop = landing.el.getBoundingClientRect().top + landing.lead;
      if (targetTop < header + LANDING_GAP) {
        // The target's offset inside the pane (the pane is at scroll 0), and the pane's natural document top:
        // the layout row it starts, which is not sticky.
        const offset = targetTop - panel.getBoundingClientRect().top;
        const paneTop = Math.max(header, header + LANDING_GAP - offset);
        scrollPage(layout.getBoundingClientRect().top + window.scrollY - paneTop);
        sync("guide");
      }
    }
    if (pending.reveal) revealSide(pending.reveal.side, pending.reveal.instant);
    if (pending.focusId) focusWithoutScrolling(document.getElementById(pending.focusId));
  });

  // Live sync between the guide and the scripture.
  useEffect(() => {
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

  // Phones: note the reader's own input on the strip, so a swipe can be told from the strip re-snapping
  // after a resize or rotation, which moves it with no one touching it. Listeners are passive. A change
  // to the strip's own width is measured into the departure tracker as it happens, so the re-snap that
  // follows is never taken for a swipe, however recent the reader's last touch or wheel turn was.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || mode !== "strip") return;
    const input = stripInputRef.current;
    const departure = departureRef.current;
    const note = (event: Event) => {
      input.at = performance.now();
      if ("touches" in event) input.touches = (event as TouchEvent).touches.length;
    };
    const types = ["touchstart", "touchmove", "touchend", "touchcancel", "wheel", "pointerdown", "keydown"] as const;
    for (const type of types) strip.addEventListener(type, note, { passive: true });
    const resize = new ResizeObserver(() => departure.resized(strip.scrollLeft, strip.scrollWidth - strip.clientWidth));
    resize.observe(strip);
    return () => {
      for (const type of types) strip.removeEventListener(type, note);
      resize.disconnect();
      input.touches = 0;
    };
  }, [mode]);

  const showScripture = useCallback(
    (
      raw: ScriptureTarget,
      options: { updateHash: boolean; fromGuide?: string | null; initial?: boolean; follow?: boolean }
    ) => {
      const target = normalize(raw);
      if (!target) return;
      const phone = !matches(DESKTOP_QUERY);
      setActive(target);
      if (options.updateHash) {
        window.history.replaceState(null, "", `#${scriptureAnchor(book.slug, target.chapter, target.first, target.last)}`);
      }
      if (phone) {
        setSide("scripture");
        if (options.fromGuide !== undefined) setReturnTo(options.fromGuide);
      }
      schedule({
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
    [book.slug, normalize, schedule]
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
        sync: "guide",
        reveal: strip ? { side: "guide", instant: !!options.initial } : undefined,
        focusId: options.focus || (strip && !options.initial) ? id : undefined,
      });
    },
    [revealSide, schedule, scrollPage]
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
      // A scripture deep link brings the guide to its commentary whether it opens the page or arrives later
      // on the same page (a changed fragment, back/forward), so the two panes never show different chapters.
      if (target) showScriptureRef.current(target, { updateHash: false, fromGuide: null, initial, follow: true });
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
    // The reader's own swipe off the scripture: place the guide at its first movement, while the guide is
    // still all but out of view, so it slides in already at the commentary's start. Once per departure; a
    // programmatic move (heading) or a movement with nobody on the strip only uses the departure up, and a
    // re-snap to a new strip width is not a departure at all (see ScriptureDeparture).
    const departed = departureRef.current.scrolled(strip.scrollLeft, strip.scrollWidth - strip.clientWidth);
    if (returnsToGuide(departed, !!heading.current, stripInputRef.current, performance.now(), STRIP_INPUT_MS)) {
      openGuideAtScripture();
    }
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

  // The pager's way from the scripture back to the guide opens the guide just as a swipe does.
  const turnToGuide = () => {
    if (side === "scripture" && !heading.current) openGuideAtScripture();
    revealSide("guide");
  };

  const onPagerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = event.key === "ArrowLeft" ? "guide" : "scripture";
    if (next === "guide") turnToGuide();
    else revealSide(next);
    document.getElementById(`cfm-show-${next}`)?.focus();
  };

  const guideHidden = mode === "strip" && side !== "guide";
  const scriptureHidden = mode === "strip" && side !== "scripture";
  const highlighted = (chapter: number, verse: number) =>
    active != null && active.chapter === chapter && active.first != null && verse >= active.first && verse <= (active.last ?? active.first);

  // The reader's sticky toolbar row. Phones: the pager row across the top of the whole strip. Desktop: only
  // the compact Contents button, at the top of the guide column alone (hidden, and zero-height, where the
  // contents rail shows), so the scripture column beside it starts level with the guide column.
  const toolbar = (
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
            onClick={turnToGuide}
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
      ) : null}
    </div>
  );

  return (
    <>
      <ContentsNav
        toc={toc}
        handle={contentsRef}
        subscribe={subscribeSection}
        getActive={locateSection}
        contentLeft={contentLeft}
        layoutKey={mode}
        onNavigate={navigateToSection}
      />
      {annotations.layer}
      {guideHighlights.layer}
      {introductionHtml ? (
        <div className={styles.introduction}>
          <ContentsOpener onOpen={openContents} />
          <div ref={introRef} className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={introHtml} />
        </div>
      ) : null}
      <div ref={companionRef} className={styles.companion} data-mode={mode}>
        {mode === "strip" ? toolbar : null}

        <div ref={stripRef} className={styles.layout} onScroll={onStripScroll}>
          <section ref={guidePanelRef} id="cfm-panel-guide" aria-label="Study guide" className={styles.guidePanel} inert={guideHidden}>
            {mode === "columns" ? toolbar : null}
            <div ref={guideRef} className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={guideHtml} />
            {mode === "strip" ? footer : null}
          </section>

          <section
            ref={scriptureRef}
            id="cfm-panel-scripture"
            aria-label={`Scripture: ${book.label} ${firstChapter}–${lastChapter}`}
            className={styles.scripturePanel}
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
                    {entry.verses.map((verse, index) => (
                      <li
                        key={verse.verse}
                        id={scriptureVerseId(book.slug, entry.chapter, verse.verse)}
                        value={verse.verse}
                        data-active={highlighted(entry.chapter, verse.verse) ? "true" : undefined}
                        {...annotations.verseAttributes(entry.chapter, verse.verse)}
                      >
                        {/* The verse number doubles as the verse's annotate button (same box, same text). */}
                        <span className={styles.verseNumber} {...annotations.verseNumberProps(entry.chapter, verse.verse, index === 0)}>
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
