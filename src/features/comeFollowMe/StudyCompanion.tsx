"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
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
  passagesOverlapping,
  scriptureAnchor,
  scriptureVerseId,
  type ScriptureTarget,
} from "@/lib/cfm/cfmAnchors";
import type { GuidePassage, TocItem } from "@/lib/cfm/cfmGuide";
import { sideAtScroll, type CompanionSide } from "./companionPanes";
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

type PendingScroll = {
  side: CompanionSide;
  id: string;
  /** Move keyboard focus there too: the side the reader came from is about to become inert. */
  focus: boolean;
};

// Two columns from here up (keep in sync with studyCompanion.module.css); below it, a swipeable strip.
const DESKTOP_QUERY = "(min-width: 900px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

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

function rangeLabel(target: ScriptureTarget): string {
  if (target.first == null) return "";
  return target.last != null && target.last > target.first ? `:${target.first}–${target.last}` : `:${target.first}`;
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

/** Scroll `scroller` (not the window) so `element` sits just below its top edge. */
function scrollWithin(scroller: HTMLElement, element: HTMLElement, gap = 12) {
  const offset = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTo({ top: scroller.scrollTop + offset - gap });
}

function focusWithoutScrolling(element: HTMLElement) {
  if (!element.hasAttribute("tabindex") && !element.matches("a[href], button, input, select, textarea")) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
}

export default function StudyCompanion({ html, toc, passages, book, chapters }: Props) {
  const chapterNumbers = useMemo(() => chapters.map((entry) => entry.chapter), [chapters]);
  const [selection, setSelection] = useState<ScriptureTarget>({ chapter: chapters[0].chapter });
  const [showWholeChapter, setShowWholeChapter] = useState(false);
  const [side, setSide] = useState<CompanionSide>("guide");
  const [follow, setFollow] = useState(true);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  // Server render and hydration assume two columns, so nothing starts out inert.
  const desktop = useSyncExternalStore(subscribeDesktop, () => matches(DESKTOP_QUERY), () => true);
  const companionRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const scripturePanelRef = useRef<HTMLDivElement>(null);
  const guidePanelRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<PendingScroll | null>(null);
  /** A side the strip is being scrolled to programmatically. */
  const heading = useRef<{ side: CompanionSide; timer: number } | null>(null);
  const guideHtml = useMemo(() => ({ __html: html }), [html]);
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useEffect(() => {
    const pendingMove = heading;
    return () => {
      if (pendingMove.current) window.clearTimeout(pendingMove.current.timer);
    };
  }, []);

  const current = chapters.find((entry) => entry.chapter === selection.chapter) ?? chapters[0];
  const verseCount = current.verses.length;
  const hasRange = selection.first != null;
  const first = selection.first ?? 1;
  const last = Math.min(selection.last ?? selection.first ?? verseCount, verseCount);
  const visibleVerses =
    hasRange && !showWholeChapter ? current.verses.filter((verse) => verse.verse >= first && verse.verse <= last) : current.verses;
  const covering = hasRange ? passagesOverlapping(passages, selection) : [];
  const scriptureLabel = `${book.label} ${current.chapter}${hasRange ? rangeLabel({ chapter: current.chapter, first, last }) : ""}`;

  const normalize = useCallback(
    (target: ScriptureTarget) => normalizeTarget(target, (chapter) => chapters.find((entry) => entry.chapter === chapter)?.verses.length),
    [chapters]
  );

  /** Phones: bring a side into view. Its own vertical scroll position is untouched. */
  const revealSide = useCallback((next: CompanionSide, instant = false) => {
    setSide(next);
    const strip = stripRef.current;
    const panel = next === "guide" ? guidePanelRef.current : scripturePanelRef.current;
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

  const showScripture = useCallback(
    (raw: ScriptureTarget, options: { updateHash: boolean; fromGuide?: string | null; instant?: boolean }) => {
      const target = normalize(raw);
      if (!target) return;
      setSelection(target);
      const onPhone = !matches(DESKTOP_QUERY);
      pendingScroll.current = {
        side: "scripture",
        id: target.first != null ? scriptureVerseId(book.slug, target.chapter, target.first) : scriptureAnchor(book.slug, target.chapter),
        focus: onPhone && !options.instant,
      };
      if (options.updateHash) {
        window.history.replaceState(null, "", `#${scriptureAnchor(book.slug, target.chapter, target.first, target.last)}`);
      }
      if (onPhone) {
        if (options.fromGuide !== undefined) setReturnTo(options.fromGuide);
        revealSide("scripture", options.instant);
      }
    },
    [book.slug, normalize, revealSide]
  );

  const showGuide = useCallback(
    (id: string, options: { updateHash: boolean; instant?: boolean }) => {
      const element = document.getElementById(id);
      if (!element || !guideRef.current?.contains(element)) return;
      const target = targetFromGuideElement(element);
      if (target) setSelection(target);
      if (options.updateHash) window.history.replaceState(null, "", `#${id}`);
      const onPhone = !matches(DESKTOP_QUERY);
      pendingScroll.current = { side: "guide", id, focus: onPhone && !options.instant };
      if (onPhone) revealSide("guide", options.instant);
    },
    [revealSide]
  );

  // Deep links: `#scripture-isaiah-53-v4` opens the scripture, any commentary id opens the guide there.
  useEffect(() => {
    const apply = (initial: boolean) => {
      // A malformed fragment ("#%") is ignored rather than crashing the page.
      const id = decodeFragment(window.location.hash);
      if (!id) return;
      const target = parseScriptureAnchor(id, book.slug);
      if (target) showScripture(target, { updateHash: false, fromGuide: null, instant: initial });
      else showGuide(id, { updateHash: false, instant: initial });
      // Phones: a deep link lands with the companion filling the screen.
      if (initial && !matches(DESKTOP_QUERY)) companionRef.current?.scrollIntoView({ block: "start" });
    };
    apply(true);
    const onHashChange = () => apply(false);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [book.slug, showGuide, showScripture]);

  // Perform the scroll a navigation asked for, once the newly selected verses are in the DOM.
  useEffect(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    pendingScroll.current = null;
    const element = document.getElementById(pending.id);
    if (!element) return;
    const onDesktop = matches(DESKTOP_QUERY);
    if (pending.side === "scripture" && scripturePanelRef.current) {
      // The scripture side always scrolls on its own, beside or behind the guide.
      scrollWithin(scripturePanelRef.current, element);
    } else if (!onDesktop && guidePanelRef.current) {
      scrollWithin(guidePanelRef.current, element);
    } else {
      // Desktop: the guide is the page, so the window scrolls.
      element.scrollIntoView({ block: "start" });
    }
    if (pending.focus) focusWithoutScrolling(element);
  });

  // Desktop: as the guide scrolls past a passage, show that passage's verses beside it.
  useEffect(() => {
    const root = guideRef.current;
    if (!follow || !root || !desktop) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const target = hit ? targetFromGuideElement(hit.target) : null;
        const previous = selectionRef.current;
        if (!target || (previous.chapter === target.chapter && previous.first === target.first && previous.last === target.last)) {
          return;
        }
        setSelection(target);
        pendingScroll.current = {
          side: "scripture",
          id: target.first != null ? scriptureVerseId(book.slug, target.chapter, target.first) : scriptureAnchor(book.slug, target.chapter),
          focus: false,
        };
      },
      { rootMargin: "-18% 0px -70% 0px" }
    );
    root.querySelectorAll("[data-cfm-passage], section[data-chapter] > h2").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [follow, desktop, book.slug]);

  // Phones: a native horizontal swipe settles on a side; keep the indicator and inert state in step.
  const onStripScroll = () => {
    const strip = stripRef.current;
    if (!strip || desktop) return;
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

  const selectChapter = (chapter: number) => showScripture({ chapter }, { updateHash: true });
  const selectFrom = (value: string) => {
    if (!value) return showScripture({ chapter: selection.chapter }, { updateHash: true });
    const from = Number(value);
    showScripture({ chapter: selection.chapter, first: from, last: Math.max(from, selection.last ?? from) }, { updateHash: true });
  };
  const selectTo = (value: string) => {
    showScripture({ chapter: selection.chapter, first, last: Number(value) }, { updateHash: true });
  };

  // Phones show one side at a time; the other stays in the DOM but out of focus order and the a11y tree.
  const guideHidden = !desktop && side !== "guide";
  const scriptureHidden = !desktop && side !== "scripture";

  return (
    <div ref={companionRef} className={styles.companion}>
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
          {scriptureLabel}
          <span aria-hidden="true"> ›</span>
        </button>
        <span className={styles.srOnly} aria-live="polite">
          {desktop ? "" : side === "guide" ? "Showing the study guide" : `Showing ${scriptureLabel}`}
        </span>
      </div>

      <div ref={stripRef} className={styles.strip} onScroll={onStripScroll}>
        <section
          ref={scripturePanelRef}
          id="cfm-panel-scripture"
          aria-label={`Scripture: ${scriptureLabel}`}
          className={styles.scripturePanel}
          inert={scriptureHidden}
        >
          <div className={styles.paneControls}>
            <nav aria-label={`${book.label} chapters`} className={styles.chapterNav}>
              {chapterNumbers.map((chapter) => (
                <a
                  key={chapter}
                  href={`#${scriptureAnchor(book.slug, chapter)}`}
                  aria-current={chapter === selection.chapter ? "true" : undefined}
                  className={styles.chapterButton}
                  onClick={(event) => {
                    event.preventDefault();
                    selectChapter(chapter);
                  }}
                >
                  {chapter}
                </a>
              ))}
            </nav>
            <div className={styles.rangeRow}>
              <label>
                <span>Verses</span>
                <select value={hasRange ? String(first) : ""} onChange={(event) => selectFrom(event.target.value)}>
                  <option value="">All</option>
                  {current.verses.map((verse) => (
                    <option key={verse.verse} value={verse.verse}>
                      {verse.verse}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>to</span>
                <select value={hasRange ? String(last) : ""} disabled={!hasRange} onChange={(event) => selectTo(event.target.value)}>
                  {!hasRange ? <option value="">–</option> : null}
                  {current.verses
                    .filter((verse) => verse.verse >= first)
                    .map((verse) => (
                      <option key={verse.verse} value={verse.verse}>
                        {verse.verse}
                      </option>
                    ))}
                </select>
              </label>
              {hasRange ? (
                <button type="button" className={styles.textButton} onClick={() => setShowWholeChapter((value) => !value)}>
                  {showWholeChapter ? "Selected verses only" : "Whole chapter"}
                </button>
              ) : null}
              <label className={styles.followToggle}>
                <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
                <span>Follow the guide</span>
              </label>
            </div>
          </div>

          <h2 id={scriptureAnchor(book.slug, current.chapter)} className={styles.paneTitle}>
            <span className={styles.paneBook}>{book.label}</span>
            <span className={styles.paneChapter}>
              {current.chapter}
              {hasRange ? <span className={styles.paneRange}>{rangeLabel({ chapter: current.chapter, first, last })}</span> : null}
            </span>
          </h2>

          {returnTo && !desktop ? (
            <button type="button" className={styles.backToGuide} onClick={() => showGuide(returnTo, { updateHash: true })}>
              <span aria-hidden="true">‹ </span>Back to the guide
            </button>
          ) : null}

          {covering.length > 0 ? (
            <p className={styles.covering}>
              <span>Commentary</span>
              {covering.map((passage) => (
                <a
                  key={passage.id}
                  href={`#${passage.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    showGuide(passage.id, { updateHash: true });
                  }}
                >
                  {passage.label}
                </a>
              ))}
            </p>
          ) : null}

          <ol className={styles.verses}>
            {visibleVerses.map((verse) => {
              const selected = hasRange && verse.verse >= first && verse.verse <= last;
              const starts = passages.filter((passage) => passage.chapter === current.chapter && passage.first === verse.verse);
              return (
                <li
                  key={verse.verse}
                  id={scriptureVerseId(book.slug, current.chapter, verse.verse)}
                  value={verse.verse}
                  data-selected={selected && showWholeChapter ? "true" : undefined}
                >
                  <span className={styles.verseNumber} aria-hidden="true">
                    {verse.verse}
                  </span>
                  <span className={styles.srOnly}>Verse {verse.verse}: </span>
                  {typesetDashes(verse.text)}
                  {starts.map((passage) => (
                    <a
                      key={passage.id}
                      href={`#${passage.id}`}
                      className={styles.guideChip}
                      aria-label={`Read commentary on ${book.label} ${passage.label}`}
                      onClick={(event) => {
                        event.preventDefault();
                        showGuide(passage.id, { updateHash: true });
                      }}
                    >
                      Guide · {passage.label}
                    </a>
                  ))}
                </li>
              );
            })}
          </ol>

          {hasRange && !showWholeChapter && verseCount > visibleVerses.length ? (
            <button type="button" className={styles.textButton} onClick={() => setShowWholeChapter(true)}>
              Show all {verseCount} verses of {book.label} {current.chapter}
            </button>
          ) : null}

          <p className={styles.readerLink}>
            <Link href={`${getChapterHref({ volume: book.volume, book: book.slug, chapter: current.chapter })}#v-${first}`}>
              Open {book.label} {current.chapter} in the reader
            </Link>
          </p>
        </section>

        <section
          ref={guidePanelRef}
          id="cfm-panel-guide"
          aria-label="Study guide"
          className={styles.guidePanel}
          inert={guideHidden}
        >
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
      </div>
    </div>
  );
}
