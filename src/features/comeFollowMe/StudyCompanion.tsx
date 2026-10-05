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
  buildSegments,
  guideToScripture,
  scriptureToGuide,
  ScrollOwnership,
  segmentAt,
  type GuideMarker,
  type Pane,
  type Segment,
} from "./scrollSync";
import styles from "./studyCompanion.module.css";

export type CompanionChapter = { chapter: number; verses: Array<{ verse: number; text: string }> };

type Props = {
  /** Guide HTML from the parser: escaped source text, safe links, and page-added art/sources only. */
  html: string;
  toc: TocItem[];
  passages: GuidePassage[];
  book: { label: string; slug: string; volume: string };
  chapters: CompanionChapter[];
};

/** guide: the guide alone (default). columns: guide and scripture side by side. strip: phone swipe. */
type Mode = "guide" | "columns" | "strip";

type SegmentMeta = { target: ScriptureTarget; label: string };

/** A reading position inside the guide that survives a layout change: a top-level block and how far into it. */
type GuideAnchor = { index: number; ratio: number };
/** The same for the scripture text: a verse (or chapter heading) id and how far into it. */
type ScriptureMark = { id: string; ratio: number };

/** Work to do once the DOM reflects a state change, in this order. */
type Pending = {
  guideAnchor?: GuideAnchor | null;
  restoreScripture?: boolean;
  guideTo?: string;
  scriptureTo?: ScriptureTarget;
  sync?: Pane;
  enterStrip?: boolean;
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
/** Gap left above an element an explicit navigation brings to the top. */
const LANDING_GAP = 12;
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

function focusWithoutScrolling(element: HTMLElement | null) {
  if (!element) return;
  if (!element.hasAttribute("tabindex") && !element.matches("a[href], button, input, select, textarea")) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
}

export default function StudyCompanion({ html, toc, passages, book, chapters }: Props) {
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

  // The guide alone is the default on every visit; nothing is remembered between visits.
  const [scriptureOn, setScriptureOn] = useState(false);
  const [side, setSide] = useState<CompanionSide>("guide");
  const [active, setActive] = useState<ScriptureTarget | null>(null);
  const [label, setLabel] = useState(`${book.label} ${firstChapter}`);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  // Server render and hydration assume desktop; phones settle on the strip right after.
  const desktop = useSyncExternalStore(subscribeDesktop, () => matches(DESKTOP_QUERY), () => true);
  const mode: Mode = !scriptureOn ? "guide" : desktop ? "columns" : "strip";

  const companionRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const guidePanelRef = useRef<HTMLElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const scriptureRef = useRef<HTMLElement>(null);
  const scriptureDocRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<Pending | null>(null);
  const ownershipRef = useRef(new ScrollOwnership());
  const segmentsRef = useRef<Segment<SegmentMeta>[] | null>(null);
  const segmentIndexRef = useRef(-1);
  const savedScriptureRef = useRef<ScriptureMark | null>(null);
  /** A side the strip is being scrolled to programmatically. */
  const heading = useRef<{ side: CompanionSide; timer: number } | null>(null);
  const guideHtml = useMemo(() => ({ __html: html }), [html]);

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
        const y = guideToScripture(list, guideY);
        if (y != null) scrollTo(scripture, "scripture", y - scriptureLine);
        noteSegment(list, guideY);
      } else {
        const y = scriptureToGuide(list, scripture.top() + scriptureLine);
        if (y == null) return;
        scrollTo(guide, "guide", y - guideLine);
        noteSegment(list, y);
      }
    },
    [guideBox, scriptureBox, segments, scrollTo, noteSegment]
  );

  const captureGuideAnchor = useCallback((): GuideAnchor | null => {
    const root = guideRef.current;
    if (!root) return null;
    const guide = guideBox();
    const line = guide.top() + guide.height() * READING_LINE;
    const blocks = guideBlocks(root);
    let index = -1;
    for (let i = 0; i < blocks.length; i += 1) {
      if (guide.offsetOf(blocks[i]) <= line) index = i;
      else break;
    }
    if (index < 0) return null;
    const height = blocks[index].getBoundingClientRect().height || 1;
    return { index, ratio: Math.min(1, Math.max(0, (line - guide.offsetOf(blocks[index])) / height)) };
  }, [guideBox]);

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

  // Carry out scheduled work once the DOM shows the new layout, before paint.
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    segmentsRef.current = null;
    segmentIndexRef.current = -1;
    const guide = guideBox();
    const scripture = scriptureBox();
    const root = guideRef.current;
    if (pending.enterStrip) companionRef.current?.scrollIntoView({ block: "start" });
    if (pending.guideAnchor && root) {
      const block = guideBlocks(root)[pending.guideAnchor.index];
      if (block) {
        const y = guide.offsetOf(block) + pending.guideAnchor.ratio * block.getBoundingClientRect().height;
        scrollTo(guide, "guide", y - guide.height() * READING_LINE);
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
      const { chapter, first } = pending.scriptureTo;
      const el = document.getElementById(first != null ? scriptureVerseId(book.slug, chapter, first) : scriptureAnchor(book.slug, chapter));
      if (el) scrollTo(scripture, "scripture", scripture.offsetOf(el) - LANDING_GAP);
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
    const markScripture = () => ownership.input("scripture", performance.now());
    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const type of inputs) {
      guideTarget.addEventListener(type, markGuide, { passive: true });
      scriptureEl.addEventListener(type, markScripture, { passive: true });
    }
    guideTarget.addEventListener("scroll", onGuideScroll, { passive: true });
    scriptureEl.addEventListener("scroll", onScriptureScroll, { passive: true });
    // Images, fonts, and width changes move anchors: measure again on the next pass.
    const invalidate = () => {
      segmentsRef.current = null;
    };
    const resize = new ResizeObserver(invalidate);
    if (guideRef.current) resize.observe(guideRef.current);
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

  const toggleScripture = () => {
    const guideAnchor = captureGuideAnchor();
    const phone = !matches(DESKTOP_QUERY);
    if (scriptureOn) {
      saveScripturePosition();
      const focusInside = !!scriptureRef.current?.contains(document.activeElement);
      setScriptureOn(false);
      setSide("guide");
      setReturnTo(null);
      schedule({ guideAnchor, focusToggle: focusInside });
    } else {
      setScriptureOn(true);
      if (phone) setSide("scripture");
      schedule({
        guideAnchor,
        restoreScripture: true,
        sync: "guide",
        enterStrip: phone,
        reveal: phone ? { side: "scripture", instant: false } : undefined,
      });
    }
  };

  const showScripture = useCallback(
    (raw: ScriptureTarget, options: { updateHash: boolean; fromGuide?: string | null; initial?: boolean }) => {
      const target = normalize(raw);
      if (!target) return;
      const phone = !matches(DESKTOP_QUERY);
      const entering = !scriptureOn;
      setActive(target);
      setScriptureOn(true);
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
        // A deep link into the scripture also brings the guide to its commentary; a click inside the
        // guide leaves the reader's place in the guide alone.
        sync: options.initial ? "scripture" : undefined,
        enterStrip: phone && entering,
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
    (id: string, options: { updateHash: boolean; initial?: boolean }) => {
      const element = document.getElementById(id);
      if (!element || !guideRef.current?.contains(element)) return;
      const target = targetFromGuideElement(element);
      if (target) setActive(target);
      if (options.updateHash) window.history.replaceState(null, "", `#${id}`);
      const strip = scriptureOn && !matches(DESKTOP_QUERY);
      if (strip) setSide("guide");
      schedule({
        guideTo: id,
        sync: scriptureOn ? "guide" : undefined,
        reveal: strip ? { side: "guide", instant: !!options.initial } : undefined,
        focusId: strip && !options.initial ? id : undefined,
      });
    },
    [schedule, scriptureOn]
  );

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

  const onGuideClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest("a");
    const root = guideRef.current;
    if (!link || !root || !root.contains(link)) return;
    const target = localScriptureTarget(link.getAttribute("href"), book, chapterNumbers);
    if (!target) return;
    event.preventDefault();
    showScripture(target, { updateHash: true, fromGuide: nearestGuideAnchor(root, link) });
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
    <div ref={companionRef} className={styles.companion} data-mode={mode}>
      <div ref={toolbarRef} className={styles.toolbar}>
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
        ) : null}
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
      </div>

      <div ref={stripRef} className={styles.layout} onScroll={onStripScroll}>
        <section ref={guidePanelRef} id="cfm-panel-guide" aria-label="Study guide" className={styles.guidePanel} inert={guideHidden}>
          <details className={styles.contents}>
            <summary>Contents</summary>
            <ol>
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`}>{item.text}</a>
                  {item.verses.length > 0 ? (
                    <ol>
                      {item.verses.map((verse) => (
                        <li key={verse.id}>
                          <a href={`#${verse.id}`}>
                            <span className={styles.contentsRef}>{verse.short}</span> {verse.text}
                          </a>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              ))}
            </ol>
          </details>
          <div ref={guideRef} className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={guideHtml} />
        </section>

        <section
          ref={scriptureRef}
          id="cfm-panel-scripture"
          aria-label={`Scripture: ${book.label} ${firstChapter}–${lastChapter}`}
          className={styles.scripturePanel}
          hidden={!scriptureOn}
          inert={scriptureHidden}
        >
          {returnTo && mode === "strip" ? (
            <button type="button" className={styles.backToGuide} onClick={() => showGuide(returnTo, { updateHash: true })}>
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
    </div>
  );
}
