"use client";

// The chapter page around its text: the reader header, the simple-mode title and chapter links, and the empty text
// area that stands in for the verses until they arrive. ChapterReader draws its page with these, and
// ChapterReaderShell draws the same page before the chapter's route has arrived, so opening a chapter shows its
// page at once and only the text comes in later (fading in; see ChapterReader).

import { faBook, faEye, faEyeSlash, faGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Children, Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Crumb } from "./Breadcrumbs";
import { ChapterLink, usePageCoveredByChapterNavigation } from "./ChapterNavigation";
import { useReaderHeaderDock } from "./ReaderHeaderSlot";
import ReaderSearchButton from "./ReaderSearchButton";
import type { ReadingLogOption } from "@/features/notes/ReadingLogButton";
import { useBelowLg } from "@/features/notes/useBelowLg";
import { useConvexSignedIn } from "@/features/notes/useConvexSignedIn";
import { NewNoteLaunchError, useNewNoteLauncher } from "@/features/notes/useNewNoteLauncher";
import {
  useInsightBuilder,
  type ReaderChapter,
  type ReaderChapterRegistration,
} from "@/features/insights/InsightBuilderProvider";
import { useAuth } from "@/lib/auth";
import type { ChapterChrome } from "@/lib/browseRoutes";
import { useSimpleMode } from "@/lib/simpleMode";

/** A control in the chapter header's pill (see `.reader-toolbar` in globals.css). */
export const READER_HEADER_BUTTON_CLASS = "reader-toolbar-button";

type ChapterHeaderProps = {
  volume: string;
  book: string;
  chapter: number;
  reference: string;
  breadcrumbs: Crumb[];
  logOptions: ReadingLogOption[];
  /** Log offers the chapter's verses, so it waits for the text. */
  logReady: boolean;
  /** The settings button and its panel; without it the button is shown disabled. */
  settings?: ReactNode;
  atTop?: boolean;
  /** Rows under the controls (comparison key, notices). */
  children?: ReactNode;
};

/**
 * The header's trail: the volume, then the chapter itself, which opens the book's chapter list. The Library root is
 * left out (the navigation links it right beside the header) and the book is named by the reference.
 */
function headerCrumbs(breadcrumbs: Crumb[], volume: string, book: string) {
  const bookHref = `/browse/${volume}/${book}`;
  return {
    leading: breadcrumbs.slice(0, -1).filter((item) => item.href && item.href !== "/browse" && item.href !== bookHref),
    currentHref: breadcrumbs.find((item) => item.href === bookHref)?.href,
  };
}

/**
 * Opens the shared Log and Notes panel on Log: the desktop panel, or below lg the phone sheet, which opens on a new
 * note for the chapter (with its Log above it), as the desktop panel's New note does. While the panel shows Log, or
 * the sheet is open, it closes it. Signed out, it asks to sign in.
 */
function ReaderLogToggle({ reference, source }: { reference: string; source?: ReadingLogOption["source"] }) {
  const { user, promptSignIn } = useAuth();
  const { loading } = useConvexSignedIn();
  const belowLg = useBelowLg();
  const { isPanelOpen, isSheetOpen, panelView, openPanel, setPanelView, setSheetOpen, closeBuilder, createJournalNote } =
    useInsightBuilder();
  const expanded = !!user && (belowLg ? isSheetOpen : isPanelOpen && panelView === "log");
  const newNote = useNewNoteLauncher({
    scope: reference,
    // The header exists before the chapter text registers its source; use the chapter it already represents.
    create: () => createJournalNote(source ? { source } : undefined),
    open: () => {
      setPanelView("notes");
      setSheetOpen(true);
    },
  });

  function openLogOnly() {
    newNote.dismiss();
    setPanelView("log");
    setSheetOpen(true);
  }

  function toggle() {
    if (!user) {
      void promptSignIn();
      return;
    }
    if (belowLg) {
      if (isSheetOpen) setSheetOpen(false);
      else void newNote.launch();
    } else if (expanded) {
      closeBuilder();
    } else {
      openPanel("log");
    }
  }

  return (
    <>
      <button
        type="button"
        data-notebook-launcher
        onClick={toggle}
        disabled={loading}
        aria-expanded={expanded}
        aria-busy={newNote.pending || undefined}
        aria-label={newNote.pending ? `Starting a new note for ${reference}` : `Log and notes for ${reference}`}
        title="Log and notes"
        className={`${READER_HEADER_BUTTON_CLASS} reader-toolbar-log${newNote.pending ? " opacity-60" : ""}`}
      >
        <FontAwesomeIcon icon={faBook} className="h-3 w-3" aria-hidden="true" />
        <span className="reader-toolbar-log-label">Log</span>
      </button>
      {belowLg && newNote.error && !isSheetOpen
        ? createPortal(
            <NewNoteLaunchError
              message={newNote.error}
              onRetry={() => void newNote.launch()}
              onOpenLog={openLogOnly}
              onDismiss={newNote.dismiss}
            />,
            document.body
          )
        : null}
    </>
  );
}

/** Keeps the shared panel's Log view on this header's chapter while it is mounted (the latest mounted wins). */
function useRegisterReaderChapter(readerChapter: ReaderChapter) {
  const { registerReaderChapter } = useInsightBuilder();
  const registrationRef = useRef<ReaderChapterRegistration | null>(null);
  useEffect(() => {
    const registration = registerReaderChapter();
    registrationRef.current = registration;
    return () => {
      registrationRef.current = null;
      registration.unregister();
    };
  }, [registerReaderChapter]);
  useEffect(() => {
    registrationRef.current?.update(readerChapter);
  }, [readerChapter, registerReaderChapter]);
}

/**
 * The chapter's header: search, where the chapter sits, Log, simple mode and reader settings, in a pill matching the
 * floating navigation's. On wide screens it is drawn in the app header, to the right of the navigation (see
 * ReaderHeaderSlot); narrower screens keep it at the top of the page. The loaded reader and the page shown while a
 * chapter opens (ChapterReaderShell) both draw it here, and only one of them holds the app header at a time.
 */
export function ChapterHeader({
  volume,
  book,
  chapter,
  reference,
  breadcrumbs,
  logOptions,
  logReady,
  settings,
  atTop = true,
  children,
}: ChapterHeaderProps) {
  const [simpleMode, setSimpleMode] = useSimpleMode();
  const covered = usePageCoveredByChapterNavigation();
  const dock = useReaderHeaderDock(!simpleMode && !covered);
  const crumbs = useMemo(() => headerCrumbs(breadcrumbs, volume, book), [breadcrumbs, volume, book]);
  const hasNotes = Children.toArray(children).length > 0;
  const readerChapter = useMemo<ReaderChapter>(
    () => ({ volume, book, chapter, reference, logOptions, logReady }),
    [volume, book, chapter, reference, logOptions, logReady]
  );
  useRegisterReaderChapter(readerChapter);

  const toolbar = (
    <div role="group" aria-label={`${reference} reader controls`} className="reader-toolbar simple-hide">
      <div className="reader-toolbar-group reader-toolbar-nav">
        <ReaderSearchButton />
        <nav aria-label="Breadcrumb" className="reader-toolbar-crumbs">
          <ol>
            {crumbs.leading.map((item) => (
              <li key={item.href}>
                <Link href={item.href!} className="reader-toolbar-crumb" title={item.label}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              {crumbs.currentHref ? (
                <ChapterLink
                  href={crumbs.currentHref}
                  aria-current="page"
                  className="reader-toolbar-crumb"
                  title={`${reference}: choose a chapter`}
                >
                  {reference}
                </ChapterLink>
              ) : (
                <span aria-current="page" className="reader-toolbar-crumb" title={reference}>
                  {reference}
                </span>
              )}
            </li>
          </ol>
        </nav>
      </div>
      <div className="reader-toolbar-group reader-toolbar-actions">
        <ReaderLogToggle reference={reference} source={logOptions[0]?.source} />
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
          <button type="button" aria-label="Reader settings" title="Reader settings" disabled className={READER_HEADER_BUTTON_CLASS}>
            <FontAwesomeIcon icon={faGear} aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
  const notes = hasNotes ? <div className="reader-header-notes simple-hide">{children}</div> : null;

  if (dock.slot) {
    return createPortal(
      <>
        {toolbar}
        {notes}
      </>,
      dock.slot
    );
  }

  return (
    <header
      className={`reader-header-inline simple-hide sticky top-2 sm:top-[calc(var(--header-height)+0.5rem)] z-20 transition-all ${
        atTop ? "py-0" : "py-1"
      }`}
      data-dock-pending={dock.pending ? "true" : undefined}
    >
      {toolbar}
      {notes}
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
 * (all usable), with the text area empty. Reader settings are shown disabled, and Log's form waits for the text.
 * It never shows another chapter's actions: nothing here belongs to the page it replaces.
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
            chapter={chrome.chapter}
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
