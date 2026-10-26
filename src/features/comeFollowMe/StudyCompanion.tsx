"use client";

import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { createRef, useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { chapterLogOptions, READER_HEADER_BUTTON_CLASS } from "@/components/ChapterReaderChrome";
import { useReaderHeaderDock } from "@/components/ReaderHeaderSlot";
import { useInsightBuilder, type ReaderChapter, type ReaderChapterRegistration } from "@/features/insights/InsightBuilderProvider";
import type { NoteSource } from "@/features/notes/journal";
import JournalLogButton from "@/features/notes/JournalLogButton";
import { getChapterHref } from "@/features/plans/scriptureCatalog";
import { decodeFragment, localScriptureTarget, normalizeTarget, parseScriptureAnchor, scriptureAnchor, scriptureVerseId } from "@/lib/cfm/cfmAnchors";
import type { GuideContextBlock, GuideReaderSection, TocItem } from "@/lib/cfm/cfmGuide";
import ContentsNav, { ContentsOpener, type ContentsHandle } from "./ContentsNav";
import { usePassagePreview } from "./PassagePreview.tsx";
import { passageFromLink, type PassageTarget } from "./passagePreview.ts";
import { readingGroups, verseRangeLabel } from "./scriptureFirst";
import { useGuideHighlights } from "./useGuideHighlights";
import { useScriptureAnnotations } from "./useScriptureAnnotations";
import styles from "./studyCompanion.module.css";

export type CompanionChapter = { chapter: number; verses: Array<{ verse: number; text: string }> };

type Props = {
  introductionHtml: string;
  readerHtml: string;
  readerSections: GuideReaderSection[];
  closingHtml: string;
  toc: TocItem[];
  book: { label: string; slug: string; volume: string };
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

export default function StudyCompanion({ introductionHtml, readerHtml, readerSections, closingHtml, toc, book, chapters, weekStart, guideSource, footer }: Props) {
  const introRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const scriptureDocRef = useRef<HTMLDivElement>(null);
  const contentsRef = useRef<ContentsHandle>(null);
  const dock = useReaderHeaderDock(true, true);
  const { registerReaderChapter } = useInsightBuilder();
  const chapterNumbers = useMemo(() => chapters.map((entry) => entry.chapter), [chapters]);
  const sectionByChapter = useMemo(() => new Map(readerSections.filter((section) => section.chapter != null).map((section) => [section.chapter!, section])), [readerSections]);
  const groupsByChapter = useMemo(() => new Map(chapters.map((chapter) => [chapter.chapter, readingGroups(chapter.verses, sectionByChapter.get(chapter.chapter)?.blocks ?? [])])), [chapters, sectionByChapter]);

  // Only original guide HTML enters the highlight index. Scripture and disclosure labels must not shift
  // saved text anchors. Keep chapter headings and context fragments in the original source order.
  const guideRoots = useMemo(() => new Map(readerSections.flatMap((section) => [section.id, ...section.blocks.flatMap((block) => block.previewEnd ? [block.id, `${block.id}-more`] : [block.id])]).map((id) => [id, createRef<HTMLDivElement>()])), [readerSections]);
  const highlightReader = useMemo(() => [...guideRoots.values(), fallbackRef, closingRef], [guideRoots]);
  const guideHighlights = useGuideHighlights(weekStart, introRef, highlightReader, "scripture-first");
  const annotations = useScriptureAnnotations(book, chapterNumbers, scriptureDocRef);
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
  const logChapter = activeChapter?.number ? Number(activeChapter.number) : chapters[0].chapter;
  const logReference = `${book.label} ${logChapter}`;
  const readerChapter = useMemo<ReaderChapter>(() => {
    const chapterOptions = (chapter: CompanionChapter) => chapterLogOptions(
      { volumeSlug: book.volume, book: book.slug, chapter: chapter.chapter },
      `${book.label} ${chapter.chapter}`,
      getChapterHref({ volume: book.volume, book: book.slug, chapter: chapter.chapter }),
      chapter.verses.length,
    );
    return {
      volume: book.volume, book: book.slug, chapter: logChapter, reference: logReference,
      logOptions: [
        ...chapterOptions(chapters.find((entry) => entry.chapter === logChapter) ?? chapters[0]),
        { source: guideSource },
        ...chapters.filter((entry) => entry.chapter !== logChapter).flatMap(chapterOptions),
      ],
      logReady: true,
    };
  }, [book.volume, book.slug, book.label, chapters, guideSource, logChapter, logReference]);
  const registrationRef = useRef<ReaderChapterRegistration | null>(null);
  useEffect(() => {
    const registration = registerReaderChapter();
    registrationRef.current = registration;
    return () => { registrationRef.current = null; registration.unregister(); };
  }, [registerReaderChapter]);
  useEffect(() => { registrationRef.current?.update(readerChapter); }, [readerChapter, registerReaderChapter]);

  const navigate = useCallback((id: string, updateHash = true, focus = true) => {
    const parsed = parseScriptureAnchor(id, book.slug);
    const target = parsed ? normalizeTarget(parsed, (chapter) => chapters.find((entry) => entry.chapter === chapter)?.verses.length) : null;
    if (parsed && !target) return;
    const element = document.getElementById(target ? scriptureAnchor(book.slug, target.chapter, target.first) : id);
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
  }, [book.slug, chapters]);
  useEffect(() => {
    const apply = () => {
      const id = decodeFragment(window.location.hash);
      if (id) navigate(id, false, false);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [navigate]);

  const previewLocal = useMemo(() => ({ volume: book.volume, book: book.slug, chapters }), [book.volume, book.slug, chapters]);
  const besideGuide = useCallback((target: PassageTarget) => target.volume === book.volume && target.book === book.slug && chapterNumbers.includes(target.chapter), [book.volume, book.slug, chapterNumbers]);
  const showBesideGuide = useCallback((target: PassageTarget) => navigate(scriptureAnchor(book.slug, target.chapter, target.first, target.last)), [book.slug, navigate]);
  const restoreScroll = useCallback((top: number) => window.scrollTo({ top, behavior: "instant" }), []);
  const preview = usePassagePreview({ local: previewLocal, besideGuide, showBesideGuide, restoreScroll, showBesideLabel: "Go to this passage" });
  const onGuideClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link || !event.currentTarget.contains(link)) return;
    const href = link.getAttribute("href");
    const local = localScriptureTarget(href, book, chapterNumbers);
    if (local) {
      event.preventDefault();
      navigate(scriptureAnchor(book.slug, local.chapter, local.first, local.last));
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
        <div ref={guideRoots.get(block.id)} className={styles.contextFragment} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: block.previewEnd ? block.html.slice(0, block.previewEnd) : block.html }} />
        {block.previewEnd ? (
          <details className={styles.fullCommentary}>
            <summary><span className={styles.moreCollapsed}>Read full commentary</span><span className={styles.moreExpanded}>Show less commentary</span></summary>
            <div ref={guideRoots.get(`${block.id}-more`)} className={styles.contextFragment} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: block.html.slice(block.previewEnd) }} />
          </details>
        ) : null}
      </div>
    </details>
  );
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
      {guideHighlights.layer}
      {preview.layer}
      {introductionHtml ? (
        <details className={styles.guideOverview}>
          <summary><Chevron /><span>Before you read<span className={styles.disclosureHint}>Historical background and this week&apos;s insights</span></span></summary>
          <div ref={introRef} className={`${styles.guide} ${styles.overviewBody}`} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: introductionHtml }} />
        </details>
      ) : null}
      <div ref={scriptureDocRef} className={styles.scriptureFirst} aria-label="Scripture with expandable context">
        <p className={styles.readerInvitation}>Read the scriptures. Open the context as you go.</p>
        {readerSections.length === 0 ? <div ref={fallbackRef} className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: readerHtml }} /> : null}
        {chapters.map((chapter) => {
          const section = sectionByChapter.get(chapter.chapter);
          const groups = groupsByChapter.get(chapter.chapter) ?? [];
          const sectionIndex = section ? readerSections.indexOf(section) : -1;
          const following: GuideReaderSection[] = [];
          for (let index = sectionIndex + 1; sectionIndex >= 0 && index < readerSections.length; index++) {
            if (readerSections[index].chapter != null) break;
            following.push(readerSections[index]);
          }
          return (
            <section key={chapter.chapter} id={scriptureAnchor(book.slug, chapter.chapter)} data-chapter={chapter.chapter} className={styles.readingChapter} aria-label={`${book.label} ${chapter.chapter}`}>
              {section ? <div ref={guideRoots.get(section.id)} className={`${styles.guide} ${styles.readingChapterHead}`} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: section.headingHtml }} /> : <h2 className={styles.plainChapterTitle}>{book.label} {chapter.chapter}</h2>}
              {groups.map((group) => (
                <div key={group.id} className={group.verses.length ? styles.readingPassage : styles.contextOnly}>
                  {group.verses.length ? (
                    <>
                      <p className={styles.passageEyebrow}>{verseRangeLabel(group.verses[0].verse, group.verses[group.verses.length - 1].verse)}</p>
                      <ol className={`${styles.verses} ${styles.readingVerses}`} start={group.verses[0].verse}>
                        {group.verses.map((verse) => (
                          <li key={verse.verse} id={scriptureVerseId(book.slug, chapter.chapter, verse.verse)} value={verse.verse} {...annotations.verseAttributes(chapter.chapter, verse.verse)}>
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
              <p className={styles.fullChapterLink}><Link href={getChapterHref({ volume: book.volume, book: book.slug, chapter: chapter.chapter })}>Open {book.label} {chapter.chapter} in the reader</Link></p>
              {following.map((extra) => <div key={extra.id} className={styles.interChapter}><div ref={guideRoots.get(extra.id)} className={styles.guide} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: extra.headingHtml }} />{extra.blocks.map(context)}</div>)}
            </section>
          );
        })}
      </div>
      <div className={styles.scriptureFirstFooter}>
        {closingHtml ? <details className={styles.guideOverview}><summary><Chevron /><span>More from this guide<span className={styles.disclosureHint}>Connections, study questions, and sources</span></span></summary><div ref={closingRef} className={`${styles.guide} ${styles.closingGuide} ${styles.overviewBody}`} onClick={onGuideClick} dangerouslySetInnerHTML={{ __html: closingHtml }} /></details> : null}
        {footer}
      </div>
      {dock.slot ? createPortal(actions, dock.slot) : null}
    </>
  );
}
