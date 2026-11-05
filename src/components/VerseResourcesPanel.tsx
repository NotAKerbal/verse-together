"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ChapterGuideSection from "@/features/chapterGuides/ChapterGuideSection";
import { useChapterGuideSelection } from "@/features/chapterGuides/useChapterGuideSelection";
import { resourcePassageFromLink, type PassageTarget } from "@/features/comeFollowMe/passagePreview";
import type { VerseLessonResource } from "@/lib/cfm/verseResources";
import { chapterGuideHidesEmptyResources } from "@/lib/chapterGuideView";
import VerseResourceItem from "./VerseResourceItem";
import styles from "./VerseResourcesPanel.module.css";

// Keep the presentation aligned with the reader's Tailwind lg sidebar breakpoint.
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** Scripture a resource names opens in the scripture preview, as it does in the lesson. */
export type PreviewPassage = (target: PassageTarget, opener: HTMLElement) => void;

function subscribeToDesktop(listener: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function desktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

type ResultsProps = {
  reference: string;
  /** The reader's book: the lessons' own scripture anchors name passages of it. */
  lessonBook: { slug: string; volume: string };
  onPreviewPassage?: PreviewPassage;
  resources: VerseLessonResource[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  chapterGuide?: ReactNode;
  hideEmptyMessage?: boolean;
};

export function VerseResourcesResults({ reference, lessonBook, onPreviewPassage, resources, loading, error, onRetry, chapterGuide, hideEmptyMessage = false }: ResultsProps) {
  const searchHref = `https://www.google.com/search?${new URLSearchParams({ q: `Come Follow Me ${reference}` })}`;
  // One handler for every link in the results, the lessons' own HTML included. New tabs and windows stay the browser's.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onPreviewPassage || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link || !event.currentTarget.contains(link)) return;
    const passage = resourcePassageFromLink(link.getAttribute("href"), link.getAttribute("data-last"), lessonBook, link.textContent);
    if (!passage) return;
    event.preventDefault();
    onPreviewPassage(passage, link);
  };
  return (
    <div className={styles.results} onClick={onClick}>
      <section aria-label="Resources from our lessons" aria-busy={loading}>
        {loading ? <p role="status" className={styles.message}>Looking for resources for these verses…</p> : null}
        {error ? (
          <div role="alert" className={styles.message}>
            <p>We couldn’t load lesson resources. Try again or search the web below.</p>
            <button type="button" className={styles.link} onClick={onRetry}>Try again</button>
          </div>
        ) : null}
        {!loading && !error && resources.length === 0 && !hideEmptyMessage ? (
          <p className={styles.message}>No resources for these verses in our published lessons yet. Search the web for more Come, Follow Me resources.</p>
        ) : null}
        {!loading && !error && resources.length > 0 ? (
          <ul className={styles.resourceList}>
            {resources.map((resource) => <VerseResourceItem key={resource.id} resource={resource} previewsPassages={Boolean(onPreviewPassage)} />)}
          </ul>
        ) : null}
      </section>
      {chapterGuide}
      {!loading ? (
        <section className={styles.webSearch} aria-label="Search for more resources">
          <p>Find more resources for {reference}</p>
          <a className={styles.searchButton} href={searchHref} target="_blank" rel="noopener noreferrer">
            Search Come, Follow Me on the web <span aria-label="opens in a new tab">↗</span>
          </a>
        </section>
      ) : null}
    </div>
  );
}

export default function VerseResourcesPanel({ volume, book, chapter, verseSpec, reference, onPreviewPassage, onClose }: {
  volume: string;
  book: string;
  chapter: number;
  verseSpec: string;
  reference: string;
  onPreviewPassage?: PreviewPassage;
  onClose: () => void;
}) {
  const desktop = useSyncExternalStore(subscribeToDesktop, desktopSnapshot, () => null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ resources: VerseLessonResource[]; error: string | null } | null>(null);
  const chapterGuide = useChapterGuideSelection({ volume, book, chapter }, verseSpec);

  useEffect(() => {
    if (desktop !== false) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    function dismissOnEscape(event: KeyboardEvent) {
      // Escape with a dialog over the sidebar (a scripture preview) closes that dialog, not the sidebar.
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    }
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [desktop, onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ volume, book, chapter: String(chapter), verses: verseSpec });
    async function load() {
      try {
        const response = await fetch(`/api/resources?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load lesson resources");
        const data = await response.json() as { resources: VerseLessonResource[] };
        if (!Array.isArray(data.resources)) throw new Error("Invalid lesson resources");
        if (!controller.signal.aborted) setResult({ resources: data.resources, error: null });
      } catch {
        if (!controller.signal.aborted) setResult({ resources: [], error: "Unable to load lesson resources" });
      }
    }
    void load();
    return () => controller.abort();
  }, [volume, book, chapter, verseSpec, attempt]);

  const content = (
    <div className={styles.panel}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close resources">×</button>
      <VerseResourcesResults reference={reference} lessonBook={{ slug: book, volume }} onPreviewPassage={onPreviewPassage} resources={result?.resources ?? []} loading={result === null} error={result?.error ?? null} onRetry={() => { setResult(null); setAttempt((value) => value + 1); }} hideEmptyMessage={chapterGuideHidesEmptyResources(chapterGuide.state, chapterGuide.loadFailed)} chapterGuide={<ChapterGuideSection guide={chapterGuide} previewsPassages={Boolean(onPreviewPassage)} />} />
    </div>
  );

  if (desktop === null) return null;
  if (desktop) {
    return (
      <section className={styles.sidebar} aria-label={`Resources for ${reference}`}>
        {content}
      </section>
    );
  }
  // The reader's sidebar is hidden on small screens; portal the mobile dialog outside it.
  return createPortal(
    <dialog ref={dialogRef} className={styles.dialog} aria-label={`Resources for ${reference}`} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {content}
    </dialog>,
    document.body
  );
}
