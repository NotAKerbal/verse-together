"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { getChapterHref } from "@/features/plans/scriptureCatalog";
import {
  decodeFragment,
  localScriptureTarget,
  parseScriptureAnchor,
  passagesOverlapping,
  scriptureAnchor,
  scriptureVerseId,
  type ScriptureTarget,
} from "@/lib/cfm/cfmAnchors";
import type { GuidePassage, TocItem } from "@/lib/cfm/cfmGuide";
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

type Tab = "guide" | "scripture";
type PendingScroll = { target: Tab; id: string };

// Matches the lg breakpoint where both columns sit side by side.
const DESKTOP_QUERY = "(min-width: 1024px)";

function isDesktop() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
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

/** The nearest commentary anchor at or before `element`, so "Back to guide" returns to the same place. */
function nearestGuideAnchor(root: HTMLElement, element: Element): string | null {
  let found: string | null = null;
  for (const candidate of root.querySelectorAll<HTMLElement>("h2[id], h3[id], p[id]")) {
    if (candidate === element || candidate.contains(element)) return candidate.id;
    if (candidate.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) found = candidate.id;
    else break;
  }
  return found;
}

export default function StudyCompanion({ html, toc, passages, book, chapters }: Props) {
  const chapterNumbers = useMemo(() => chapters.map((entry) => entry.chapter), [chapters]);
  const [selection, setSelection] = useState<ScriptureTarget>({ chapter: chapters[0].chapter });
  const [showWholeChapter, setShowWholeChapter] = useState(false);
  const [tab, setTab] = useState<Tab>("guide");
  const [follow, setFollow] = useState(true);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<PendingScroll | null>(null);
  const guideHtml = useMemo(() => ({ __html: html }), [html]);
  const selectionRef = useRef(selection);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const current = chapters.find((entry) => entry.chapter === selection.chapter) ?? chapters[0];
  const verseCount = current.verses.length;
  const hasRange = selection.first != null;
  const first = selection.first ?? 1;
  const last = Math.min(selection.last ?? selection.first ?? verseCount, verseCount);
  const visibleVerses =
    hasRange && !showWholeChapter ? current.verses.filter((verse) => verse.verse >= first && verse.verse <= last) : current.verses;
  const covering = hasRange ? passagesOverlapping(passages, selection) : [];

  /** Clamp to real verses; an out-of-range verse falls back to the whole chapter. */
  const normalize = useCallback(
    (target: ScriptureTarget): ScriptureTarget | null => {
      const chapter = chapters.find((entry) => entry.chapter === target.chapter);
      if (!chapter) return null;
      if (target.first == null) return { chapter: target.chapter };
      const count = chapter.verses.length;
      if (target.first < 1 || target.first > count) return { chapter: target.chapter };
      return { chapter: target.chapter, first: target.first, last: Math.min(target.last ?? target.first, count) };
    },
    [chapters]
  );

  const showScripture = useCallback(
    (raw: ScriptureTarget, options: { updateHash: boolean; fromGuide?: string | null }) => {
      const target = normalize(raw);
      if (!target) return;
      setSelection(target);
      pendingScroll.current = {
        target: "scripture",
        id: target.first != null ? scriptureVerseId(book.slug, target.chapter, target.first) : scriptureAnchor(book.slug, target.chapter),
      };
      if (options.updateHash) {
        window.history.replaceState(null, "", `#${scriptureAnchor(book.slug, target.chapter, target.first, target.last)}`);
      }
      if (!isDesktop()) {
        setTab("scripture");
        if (options.fromGuide !== undefined) setReturnTo(options.fromGuide);
      }
    },
    [book.slug, normalize]
  );

  const showGuide = useCallback((id: string, options: { updateHash: boolean }) => {
    const element = document.getElementById(id);
    if (!element || !guideRef.current?.contains(element)) return;
    const target = targetFromGuideElement(element);
    if (target) setSelection(target);
    if (options.updateHash) window.history.replaceState(null, "", `#${id}`);
    pendingScroll.current = { target: "guide", id };
    setTab("guide");
  }, []);

  // Deep links: `#scripture-isaiah-53-v4` opens the scripture, any commentary id opens the guide there.
  useEffect(() => {
    const apply = () => {
      // A malformed fragment ("#%") is ignored rather than crashing the page.
      const id = decodeFragment(window.location.hash);
      if (!id) return;
      const target = parseScriptureAnchor(id, book.slug);
      if (target) showScripture(target, { updateHash: false, fromGuide: null });
      else showGuide(id, { updateHash: false });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [book.slug, showGuide, showScripture]);

  // Perform the scroll a navigation asked for, once the newly selected verses are in the DOM.
  useEffect(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    pendingScroll.current = null;
    const element = document.getElementById(pending.id);
    if (!element) return;
    const pane = paneRef.current;
    if (pending.target === "scripture" && pane && isDesktop()) {
      // Desktop: the pane scrolls on its own beside the guide, so the reader keeps their place.
      const offset = element.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      pane.scrollTo({ top: pane.scrollTop + offset - 12 });
    } else {
      element.scrollIntoView({ block: "start" });
    }
  });

  // Desktop: as the guide scrolls past a passage, show that passage's verses beside it.
  useEffect(() => {
    const root = guideRef.current;
    if (!follow || !root) return;
    const query = window.matchMedia(DESKTOP_QUERY);
    let observer: IntersectionObserver | null = null;
    const start = () => {
      observer?.disconnect();
      observer = null;
      if (!query.matches) return;
      observer = new IntersectionObserver(
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
            target: "scripture",
            id: target.first != null ? scriptureVerseId(book.slug, target.chapter, target.first) : scriptureAnchor(book.slug, target.chapter),
          };
        },
        { rootMargin: "-18% 0px -70% 0px" }
      );
      root.querySelectorAll("[data-cfm-passage], section[data-chapter] > h2").forEach((element) => observer?.observe(element));
    };
    start();
    query.addEventListener("change", start);
    return () => {
      observer?.disconnect();
      query.removeEventListener("change", start);
    };
  }, [follow, book.slug]);

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

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: Tab = tab === "guide" ? "scripture" : "guide";
    setTab(next);
    document.getElementById(`cfm-tab-${next}`)?.focus();
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

  return (
    <div className={styles.companion}>
      <div className={styles.tabs} role="tablist" aria-label="Study companion view">
        {(["guide", "scripture"] as const).map((value) => (
          <button
            key={value}
            id={`cfm-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={`cfm-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(value)}
            onKeyDown={onTabKeyDown}
          >
            {value === "guide" ? "Study guide" : `Scripture · ${book.label} ${selection.chapter}${rangeLabel(selection)}`}
          </button>
        ))}
      </div>

      <div className={styles.columns}>
        <div
          id="cfm-panel-scripture"
          role="tabpanel"
          aria-labelledby="cfm-tab-scripture"
          className={styles.scripturePanel}
          data-active={tab === "scripture"}
        >
          <div ref={paneRef} className={styles.pane}>
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
                  <select
                    value={hasRange ? String(last) : ""}
                    disabled={!hasRange}
                    onChange={(event) => selectTo(event.target.value)}
                  >
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
                    {showWholeChapter ? "Show selected verses only" : "Show whole chapter"}
                  </button>
                ) : null}
                <label className={styles.followToggle}>
                  <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
                  <span>Follow the guide</span>
                </label>
              </div>
            </div>

            <h2 id={scriptureAnchor(book.slug, current.chapter)} className={styles.paneTitle}>
              {book.label} {current.chapter}
              {hasRange ? <span className={styles.paneRange}>{rangeLabel({ chapter: current.chapter, first, last })}</span> : null}
            </h2>

            {returnTo ? (
              <button type="button" className={styles.backToGuide} onClick={() => showGuide(returnTo, { updateHash: true })}>
                <span aria-hidden="true">←</span> Back to the guide
              </button>
            ) : null}

            {covering.length > 0 ? (
              <p className={styles.covering}>
                <span>Commentary:</span>
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
          </div>
        </div>

        <div
          id="cfm-panel-guide"
          role="tabpanel"
          aria-labelledby="cfm-tab-guide"
          className={styles.guidePanel}
          data-active={tab === "guide"}
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
        </div>
      </div>
    </div>
  );
}
