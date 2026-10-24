"use client";

// The chapter page around its text: the reader header, the simple-mode title and chapter links, and the empty text
// area that stands in for the verses until they arrive. ChapterReader draws its page with these, and
// ChapterReaderShell draws the same page before the chapter's route has arrived, so opening a chapter shows its
// page at once and only the text comes in later (fading in; see ChapterReader).

import { faEye, faEyeSlash, faGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Breadcrumbs, { type Crumb } from "./Breadcrumbs";
import { ChapterLink } from "./ChapterNavigation";
import ScriptureQuickNav from "./ScriptureQuickNav";
import ReadingLogButton, { type ReadingLogOption } from "@/features/notes/ReadingLogButton";
import type { ChapterChrome } from "@/lib/browseRoutes";
import { useSimpleMode } from "@/lib/simpleMode";

export const READER_HEADER_BUTTON_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border surface-card-soft text-foreground transition-[background-color,border-color,color] duration-200 ease-out hover:border-[color:var(--surface-button-hover)] hover:bg-[color:var(--surface-button-hover)] hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30";

type VerseItem = { verse: number; text: string };

type ChapterHeaderProps = {
  volume: string;
  book: string;
  reference: string;
  breadcrumbs: Crumb[];
  /** The loaded text, for the quick-nav's in-chapter matches; empty until it arrives. */
  verses?: VerseItem[];
  logOptions: ReadingLogOption[];
  /** Log offers the chapter's verses, so it waits for the text. */
  logReady: boolean;
  /** The settings button and its panel; without it the button is shown disabled. */
  settings?: ReactNode;
  atTop?: boolean;
  /** Rows under the controls (comparison key, notices). */
  children?: ReactNode;
};

export function ChapterHeader({
  volume,
  book,
  reference,
  breadcrumbs,
  verses,
  logOptions,
  logReady,
  settings,
  atTop = true,
  children,
}: ChapterHeaderProps) {
  const [simpleMode, setSimpleMode] = useSimpleMode();
  const headerBreadcrumbs = useMemo(() => {
    if (!breadcrumbs?.length) return breadcrumbs;
    const leading = breadcrumbs.slice(0, -1).map((item) => ({ ...item }));
    return [...leading, { label: reference }];
  }, [breadcrumbs, reference]);

  return (
    <header className={`simple-hide sticky top-2 sm:top-[calc(var(--header-height)+0.5rem)] z-20 transition-all ${atTop ? "py-0" : "py-1"}`}>
      <div className="panel-card-strong relative flex flex-col gap-1 rounded-[1.15rem] px-3 py-2 sm:px-4">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex flex-1 items-center gap-2 pl-0.5 sm:gap-3 sm:pl-1">
            <ScriptureQuickNav currentVolume={volume} currentBook={book} verses={verses} />
            <div className="inline-flex h-8 min-w-0 max-w-full flex-1 items-center rounded-lg border surface-card-soft px-2 sm:h-auto sm:flex-none sm:px-2.5 sm:py-1">
              <div className="min-w-0 w-full text-xs sm:text-sm">
                <Breadcrumbs items={headerBreadcrumbs} />
              </div>
            </div>
          </div>
          <ReadingLogButton
            variant="compact"
            label="Log"
            ariaLabel={`Log reading of ${reference}`}
            followLocation
            options={logOptions}
            disabled={!logReady}
          />
          <button
            type="button"
            aria-label={simpleMode ? "Turn simple mode off" : "Turn simple mode on"}
            title={simpleMode ? "Turn simple mode off" : "Turn simple mode on"}
            aria-pressed={simpleMode}
            onClick={() => setSimpleMode(!simpleMode)}
            className={READER_HEADER_BUTTON_CLASS}
          >
            <FontAwesomeIcon icon={simpleMode ? faEyeSlash : faEye} aria-hidden="true" className="h-4 w-4" />
          </button>
          {settings ?? (
            <button
              type="button"
              aria-label="Reader settings"
              title="Reader settings"
              disabled
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border surface-card-soft text-foreground opacity-50"
            >
              <FontAwesomeIcon icon={faGear} aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}

// The page shown before a chapter's route arrives and the reader's own text area each stand in for the same
// wait, one after the other; it is announced once.
let lastAnnouncement: { message: string; at: number } | null = null;

/**
 * The empty text area while a chapter's text is on its way. Nothing is drawn; screen readers are told the chapter
 * is loading. The status region is mounted empty and filled after, so it is announced, and it goes away (rather
 * than staying busy) when the text arrives.
 */
export function ChapterTextPending({ reference }: { reference: string }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = `Loading ${reference}…`;
      const now = Date.now();
      if (lastAnnouncement && lastAnnouncement.message === next && now - lastAnnouncement.at < 3000) return;
      lastAnnouncement = { message: next, at: now };
      setMessage(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reference]);
  return (
    <div className="min-h-[60vh]" data-chapter-text-pending>
      <p role="status" className="sr-only">
        {message}
      </p>
    </div>
  );
}

function ChapterTextError({ reference }: { reference: string }) {
  const router = useRouter();
  return (
    <div role="alert" className="panel-card rounded-[1.35rem] p-4 text-sm text-[color:var(--foreground-muted)]">
      <p>{reference} couldn&rsquo;t be loaded.</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-3 inline-flex h-8 items-center rounded-lg border surface-card-soft px-3 text-xs font-bold text-foreground hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
      >
        Try again
      </button>
    </div>
  );
}

type ChapterTextBoundaryProps = {
  /** The text being shown; a new one (e.g. after Try again) clears the failure. */
  resetKey: unknown;
  reference: string;
  children: ReactNode;
};

/**
 * Keeps a failed text load inside the text area: the page around it (header, breadcrumbs, chapter links) stays
 * usable, with a way to try again, instead of the whole page giving way to an error.
 */
export class ChapterTextBoundary extends Component<ChapterTextBoundaryProps, { failed: boolean; resetKey: unknown }> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: ChapterTextBoundaryProps, state: { failed: boolean; resetKey: unknown }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  render() {
    return this.state.failed ? <ChapterTextError reference={this.props.reference} /> : this.props.children;
  }
}

/** Previous/Next chapter links, shown in simple mode. */
export function ChapterSimpleNav({ prevHref, nextHref }: { prevHref?: string; nextHref?: string }) {
  return (
    <nav className="simple-only reader-simple-nav" aria-label="Chapter navigation">
      {prevHref ? <ChapterLink href={prevHref}>&larr; Previous</ChapterLink> : <span />}
      {nextHref ? <ChapterLink href={nextHref}>Next &rarr;</ChapterLink> : <span />}
    </nav>
  );
}

/** The scripture source a chapter's Log button records. */
export function chapterLogOptions(
  chrome: Pick<ChapterChrome, "volumeSlug" | "book" | "chapter">,
  reference: string,
  href: string,
  verseCount?: number
): ReadingLogOption[] {
  return [
    {
      source: { kind: "scripture", label: reference, href, volume: chrome.volumeSlug, book: chrome.book, chapter: chrome.chapter },
      verseCount,
    },
  ];
}

/**
 * A chapter's page before its route has arrived: the reader's real header, breadcrumbs, title, and chapter links
 * (all usable), with the text area empty. Controls that need the chapter itself (Log, reader settings) are shown
 * disabled. It never shows another chapter's actions: nothing here belongs to the page it replaces.
 */
export function ChapterReaderShell({ chrome }: { chrome: ChapterChrome }) {
  const logOptions = useMemo(() => chapterLogOptions(chrome, chrome.reference, chrome.pathname), [chrome]);
  return (
    <article className="page-shell">
      <section className="space-y-4 pb-20" data-chapter-shell>
        <div className="reader-column relative mx-auto w-full max-w-6xl">
          <ChapterHeader
            volume={chrome.volumeSlug}
            book={chrome.book}
            reference={chrome.reference}
            breadcrumbs={chrome.breadcrumbs}
            logOptions={logOptions}
            logReady={false}
          />
          <h1 className="simple-only reader-simple-title">{chrome.reference}</h1>
          <ChapterTextPending reference={chrome.reference} />
          <ChapterSimpleNav prevHref={chrome.prevHref} nextHref={chrome.nextHref} />
        </div>
      </section>
    </article>
  );
}
