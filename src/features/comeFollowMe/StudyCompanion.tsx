"use client";

import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { createRef, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { chapterLogOptions, READER_HEADER_BUTTON_CLASS } from "@/components/ChapterReaderChrome";
import { useReaderHeaderDock } from "@/components/ReaderHeaderSlot";
import { useInsightBuilder, type ReaderChapter, type ReaderChapterRegistration } from "@/features/insights/InsightBuilderProvider";
import type { NoteSource } from "@/features/notes/journal";
import JournalLogButton from "@/features/notes/JournalLogButton";
import { getChapterHref } from "@/features/reading/scriptureCatalog";
import { decodeFragment, normalizeTarget, parseRangeAnchor, rangeAnchor, rangeBooks, rangeEntry, rangeScriptureTarget, scriptureAnchor, scriptureVerseId, type RangeChapter } from "@/lib/cfm/cfmAnchors";
import type { GuideContextBlock, GuideReaderSection, TocItem } from "@/lib/cfm/cfmGuide";
import ContentsNav, { ContentsOpener, type ContentsHandle } from "./ContentsNav";
import { usePassagePreview } from "./PassagePreview.tsx";
import { passageFromLink, type PassageTarget } from "./passagePreview.ts";
import { readingGroups, verseRangeLabel } from "./scriptureFirst";
import { useGuideHighlights } from "./useGuideHighlights";
import { useScriptureAnnotations } from "./useScriptureAnnotations";
import styles from "./studyCompanion.module.css";

export type CompanionChapter = RangeChapter & { verses: Array<{ verse: number; text: string }> };

type Props = {
  introductionHtml: string;
  readerHtml: string;
  readerSections: GuideReaderSection[];
  closingHtml: string;
  toc: TocItem[];
  chapters: CompanionChapter[];
  weekStart: string;
  guideSource: NoteSource & { kind: "guide" };
  footer?: ReactNode;
};

/** One page scroller at every width. Context expands without moving another document. */
function subscribePage(notify: () => void) {
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; notify(); });
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  document.addEventListener("toggle", schedule, true);
  return () => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("toggle", schedule, true);
    if (frame) window.cancelAnimationFrame(frame);
  };
}

function headerBottom() {
  return Math.max(0, document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0);
}

function typesetDashes(text: string) {
  return text.replace(/--/g, "—");
}

function Chevron() {
  return <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" className={styles.contextChevron} />;
}

function contextLabel(block: GuideContextBlock) {
  const passage = block.passage;
  if (!passage) return "Chapter context";
  const verses = passage.label.replace(/^.*?:/, "");
  return `Context for ${passage.first === passage.last && !/[–-]/.test(verses) ? "verse" : "verses"} ${verses}`;
}

type ScriptureAnnotations = ReturnType<typeof useScriptureAnnotations>;

/** Each book keeps its annotations scoped to its own scripture identity and document. */
function LaterBookScripture({ chapters, layerHost, render }: {
  chapters: CompanionChapter[];
  layerHost: HTMLElement | null;
  render: (chapters: CompanionChapter[], annotations: ScriptureAnnotations) => ReactNode;
}) {
  const docRef = useRef<HTMLDivElement>(null);
  const book = useMemo(() => ({ label: chapters[0].book, slug: chapters[0].slug, volume: chapters[0].volume }), [chapters]);
  const numbers = useMemo(() => chapters.map((entry) => entry.chapter), [chapters]);
  const annotations = useScriptureAnnotations(book, numbers, docRef);
  return <><div ref={docRef}>{render(chapters, annotations)}</div>{layerHost ? createPortal(annotations.layer, layerHost) : null}</>;
}

export default function StudyCompanion({ introductionHtml, readerHtml, readerSections, closingHtml, toc, chapters, weekStart, guideSource, footer }: Props) {
  const introRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const scriptureDocRef = useRef<HTMLDivElement>(null);
  const firstBookRef = useRef<HTMLDivElement>(null);
  const [layerHost, setLayerHost] = useState<HTMLDivElement | null>(null);
  const contentsRef = useRef<ContentsHandle>(null);
  const dock = useReaderHeaderDock(true, true);
  const { registerReaderChapter } = useInsightBuilder();
  const scriptureBooks = useMemo(() => rangeBooks(chapters), [chapters]);
  const book = useMemo(() => ({ label: chapters[0].book, slug: chapters[0].slug, volume: chapters[0].volume }), [chapters]);
  const chapterNumbers = useMemo(() => scriptureBooks[0].map((entry) => entry.chapter), [scriptureBooks]);
  const mixed = scriptureBooks.length > 1;
  const sectionByChapter = useMemo(() => new Map(readerSections.filter((section) => section.chapter != null).map((section) => [section.chapter!, section])), [readerSections]);
  const groupsByChapter = useMemo(() => new Map(chapters.map((chapter) => [chapter.key, readingGroups(chapter.verses, sectionByChapter.get(chapter.key)?.blocks ?? [])])), [chapters, sectionByChapter]);

  // Only original guide HTML enters the highlight index. Scripture and disclosure labels must not shift
  // saved text anchors. Keep chapter headings and context fragments in the original source order.
  const guideRoots = useMemo(() => new Map(readerSections.flatMap((section) => [section.id, ...section.blocks.flatMap((block) => block.previewEnd ? [block.id, `${block.id}-more`] : [block.id])]).map((id) => [id, createRef<HTMLDivElement>()])), [readerSections]);
  const highlightReader = useMemo(() => [...guideRoots.values(), fallbackRef, closingRef], [guideRoots]);
  const guideHighlights = useGuideHighlights(weekStart, introRef, highlightReader, "scripture-first", guideSource);
  const annotations = useScriptureAnnotations(book, chapterNumbers, mixed ? firstBookRef : scriptureDocRef);
  const tocIds = useMemo(() => toc.flatMap((item) => [item.id, ...item.verses.map((verse) => verse.id)]), [toc]);

  const getActive = useCallback(() => {
    const line = headerBottom() + 100;
    let current: string | null = null;
    for (const id of tocIds) {
      const target = document.getElementById(id);
      if (!target) continue;
      const visible = target.getClientRects().length ? target : target.closest<HTMLDetailsElement>("details[data-context]")?.querySelector("summary");
      if (visible && visible.getBoundingClientRect().top <= line) current = id;
    }
    return current;
  }, [tocIds]);
  const activeId = useSyncExternalStore(subscribePage, getActive, () => null);
  const activeIndex = toc.findIndex((item) => item.id === activeId || item.verses.some((verse) => verse.id === activeId));
  const activeChapter = toc.slice(0, activeIndex + 1).findLast((item) => item.number != null);
  const logEntry = chapters.find((entry) => entry.chapter === Number(activeChapter?.number) && entry.book === activeChapter?.book) ?? chapters[0];
  const logReference = `${logEntry.book} ${logEntry.chapter}`;
  const readerChapter = useMemo<ReaderChapter>(() => {
    const chapterOptions = (chapter: CompanionChapter) => chapterLogOptions(
      { volumeSlug: chapter.volume, book: chapter.slug, chapter: chapter.chapter },
      `${chapter.book} ${chapter.chapter}`,
      getChapterHref({ volume: chapter.volume, book: chapter.slug, chapter: chapter.chapter }),
      chapter.verses.length,
    );
    return {
      volume: logEntry.volume, book: logEntry.slug, chapter: logEntry.chapter, reference: logReference,
      logOptions: [
        ...chapterOptions(logEntry),
        { source: guideSource },
        ...chapters.filter((entry) => entry.key !== logEntry.key).flatMap(chapterOptions),
      ],
      logReady: true,
    };
  }, [chapters, guideSource, logEntry, logReference]);
  const registrationRef = useRef<ReaderChapterRegistration | null>(null);
  useEffect(() => {
    const registration = registerReaderChapter();
    registrationRef.current = registration;
    return () => { registrationRef.current = null; registration.unregister(); };
  }, [registerReaderChapter]);
  useEffect(() => { registrationRef.current?.update(readerChapter); }, [readerChapter, registerReaderChapter]);

  const navigate = useCallback((id: string, updateHash = true, focus = true) => {
    const parsed = parseRangeAnchor(id, chapters);
    const target = parsed ? normalizeTarget(parsed, (chapter) => rangeEntry(chapters, chapter)?.verses.length) : null;
    if (parsed && !target) return;
    const element = document.getElementById(target ? rangeAnchor(chapters, { ...target, last: undefined })! : id);
    if (!element) return;
    let parent = element.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    if (updateHash) window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: Math.max(0, window.scrollY + element.getBoundingClientRect().top - headerBottom() - 20), behavior: "instant" });
    if (focus) {
      if (!element.matches("a[href], button, summary, [tabindex]")) element.tabIndex = -1;
      element.focus({ preventScroll: true });
    }
  }, [chapters]);
  useEffect(() => {
    const apply = () => {
      const id = decodeFragment(window.location.hash);
      if (id) navigate(id, false, false);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [navigate]);

  const previewLocal = useMemo(() => chapters.map((entry) => ({ volume: entry.volume, book: entry.slug, chapter: entry.chapter, verses: entry.verses })), [chapters]);
  const besideGuide = useCallback((target: PassageTarget) => chapters.some((entry) => entry.volume === target.volume && entry.slug === target.book && entry.chapter === target.chapter), [chapters]);
  const showBesideGuide = useCallback((target: PassageTarget) => navigate(scriptureAnchor(target.book, target.chapter, target.first, target.last)), [navigate]);
  const restoreScroll = useCallback((top: number) => window.scrollTo({ top, behavior: "instant" }), []);
  const preview = usePassagePreview({ local: previewLocal, besideGuide, showBesideGuide, restoreScroll, showBesideLabel: "Go to this passage" });
  const onGuideClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link || !event.currentTarget.contains(link)) return;
    const href = link.getAttribute("href");
    const local = rangeScriptureTarget(href, chapters);
    if (local) {
      event.preventDefault();
      navigate(rangeAnchor(chapters, local)!);
      return;
    }
    const passage = passageFromLink(href, link.getAttribute("data-last"), book, link.textContent);
    if (passage) { event.preventDefault(); preview.open(passage, link); }
    else if (href?.startsWith("#")) {
      const id = decodeFragment(href);
      if (id && document.getElementById(id)) { event.preventDefault(); navigate(id); }
    }
  };
  const openContents = useCallback((opener: HTMLElement) => contentsRef.current?.open(opener), []);
  const navigateToSection = useCallback((id: string) => navigate(id), [navigate]);
  const contentLeft = useCallback(() => 0, []);
  const context = (block: GuideContextBlock) => (
    <details key={block.id} className={styles.contextDisclosure} data-context={block.id}>
      <summary><Chevron /><span>{contextLabel(block)}</span></summary>
      <div className={`${styles.guide} ${styles.contextBody}`}>
        <div ref={guideRoots.get(block.id)} data-cfm-selection="guide" className={styles.contextFragment} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: block.previewEnd ? block.html.slice(0, block.previewEnd) : block.html }} />
        {block.previewEnd ? (
          <details className={styles.fullCommentary}>
            <summary><span className={styles.moreCollapsed}>Read full commentary</span><span className={styles.moreExpanded}>Show less commentary</span></summary>
            <div ref={guideRoots.get(`${block.id}-more`)} data-cfm-selection="guide" className={styles.contextFragment} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: block.html.slice(block.previewEnd) }} />
          </details>
        ) : null}
      </div>
    </details>
  );
  const renderChapters = (entries: CompanionChapter[], annotations: ScriptureAnnotations) => entries.map((chapter) => {
    const section = sectionByChapter.get(chapter.key);
    const groups = groupsByChapter.get(chapter.key) ?? [];
    const sectionIndex = section ? readerSections.indexOf(section) : -1;
    const following: GuideReaderSection[] = [];
    for (let index = sectionIndex + 1; sectionIndex >= 0 && index < readerSections.length; index++) {
      if (readerSections[index].chapter != null) break;
      following.push(readerSections[index]);
    }
    return (
      <section key={chapter.key} id={scriptureAnchor(chapter.slug, chapter.chapter)} data-chapter={chapter.key} className={styles.readingChapter} aria-label={`${chapter.book} ${chapter.chapter}`}>
        {section ? <div ref={guideRoots.get(section.id)} data-cfm-selection="guide" className={`${styles.guide} ${styles.readingChapterHead}`} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: section.headingHtml }} /> : <h2 className={styles.plainChapterTitle}>{chapter.book} {chapter.chapter}</h2>}
        {groups.map((group) => (
          <div key={group.id} className={group.verses.length ? styles.readingPassage : styles.contextOnly}>
            {group.verses.length ? (
              <>
                <p className={styles.passageEyebrow}>{verseRangeLabel(group.verses[0].verse, group.verses[group.verses.length - 1].verse)}</p>
                <ol className={`${styles.verses} ${styles.readingVerses}`} start={group.verses[0].verse}>
                  {group.verses.map((verse) => (
                    <li key={verse.verse} id={scriptureVerseId(chapter.slug, chapter.chapter, verse.verse)} value={verse.verse} data-cfm-selection="scripture" {...annotations.verseAttributes(chapter.chapter, verse.verse)}>
                      <span className={styles.verseNumber} {...annotations.verseNumberProps(chapter.chapter, verse.verse, verse.verse === chapter.verses[0].verse)}>{verse.verse}</span>
                      <span className={styles.srOnly}>Verse {verse.verse}: </span>
                      {annotations.verseText(chapter.chapter, verse.verse, verse.text, typesetDashes)}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
            {group.context ? context(group.context) : null}
          </div>
        ))}
        <p className={styles.fullChapterLink}><Link href={getChapterHref({ volume: chapter.volume, book: chapter.slug, chapter: chapter.chapter })}>Open {chapter.book} {chapter.chapter} in the reader</Link></p>
        {following.map((extra) => <div key={extra.id} className={styles.interChapter}><div ref={guideRoots.get(extra.id)} data-cfm-selection="guide" className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: extra.headingHtml }} />{extra.blocks.map(context)}</div>)}
      </section>
    );
  });
  const actions = (
    <div role="group" aria-label="Study guide controls" className="reader-toolbar guide-header-actions">
      <ContentsOpener onOpen={openContents} />
      <JournalLogButton reference={logReference} source={readerChapter.logOptions[0]?.source ?? null} className={`${READER_HEADER_BUTTON_CLASS} reader-toolbar-log`} labelClassName="reader-toolbar-log-label guide-header-label" />
    </div>
  );

  return (
    <>
      <ContentsNav toc={toc} handle={contentsRef} subscribe={subscribePage} getActive={getActive} contentLeft={contentLeft} layoutKey="scripture-first" onNavigate={navigateToSection} />
      {annotations.layer}
      {mixed ? <div ref={setLayerHost} style={{ display: "contents" }} /> : null}
      {guideHighlights.layer}
      {preview.layer}
      {/* The introduction and closing sections remain visible and share the scripture's reading width. */}
      {introductionHtml ? (
        <div className={styles.introduction}>
          <div ref={introRef} data-cfm-selection="guide" className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: introductionHtml }} />
        </div>
      ) : null}
      <div ref={scriptureDocRef} className={styles.scriptureFirst} aria-label="Scripture with expandable context">
        <p className={styles.readerInvitation}>Read the scriptures. Open the context as you go.</p>
        {readerSections.length === 0 ? <div ref={fallbackRef} data-cfm-selection="guide" className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: readerHtml }} /> : null}
        {mixed ? <div ref={firstBookRef}>{renderChapters(scriptureBooks[0], annotations)}</div> : renderChapters(scriptureBooks[0], annotations)}
        {scriptureBooks.slice(1).map((group) => <LaterBookScripture key={group[0].slug} chapters={group} layerHost={layerHost} render={renderChapters} />)}
      </div>
      <div className={styles.afterReader}>
        {closingHtml ? (
          <div className={styles.closing}>
            <div ref={closingRef} data-cfm-selection="guide" className={`${styles.guide} ${styles.closingGuide}`} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: closingHtml }} />
          </div>
        ) : null}
        {footer}
      </div>
      {dock.slot ? createPortal(actions, dock.slot) : null}
    </>
  );
}
