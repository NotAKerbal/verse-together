"use client";

import DeviceSyncStatus from "./DeviceSyncStatus";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faExpand, faPlus } from "@fortawesome/free-solid-svg-icons";
import type { NotebookPanelView } from "@/features/insights/InsightBuilderProvider";
import { LightbulbBadge } from "@/features/insights/NoteMenus";
import JournalEntryComposer from "./JournalEntryComposer";
import JournalNoteEditor from "./JournalNoteEditor";
import type { ReadingOption } from "./ReadingChip";
import type { JournalNoteDocument } from "./journal";

// Touch-sized below lg, where the panel is the phone sheet.
const HEADER_ICON_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-button-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:h-9 lg:w-9";
// Keep the header in one row even on a 320px phone.
const ACTION_BUTTON_CLASS =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--surface-button-active)] px-3 text-sm font-bold text-[color:var(--surface-button-active-text)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-card)] disabled:opacity-50 lg:h-9 lg:text-xs";

export type NotesPanelNotes = {
  activeNoteId: string | null;
  activeNote: JournalNoteDocument | null;
  isLoading: boolean;
};

/** The surface around the panel: its close control, and the id its title gives the surface's label. */
export type NotesPanelFrame = {
  titleId?: string;
  closeButton: ReactNode;
};

/** Focus the reader's Log button, which opens the panel on chapter pages in place of the pill. */
export function focusNotesLauncher() {
  document.querySelector<HTMLElement>("[data-notebook-launcher]")?.focus();
}

/**
 * One journal on desktop and mobile: log reading first, then expand into a Markdown note.
 * Saved entries remain available in the full Journal calendar.
 */
export function NotesPanelContent({
  activeNoteId,
  activeNote,
  isLoading,
  view,
  onViewChange,
  onNewEntry,
  readingOptions,
  frame,
  autoFocus = false,
}: NotesPanelNotes & {
  view: NotebookPanelView;
  onViewChange: (view: NotebookPanelView) => void;
  /** Open the unsaved entry, keeping any draft already in progress. */
  onNewEntry: () => void;
  readingOptions: ReadingOption[];
  frame: NotesPanelFrame;
  autoFocus?: boolean;
}) {
  const composing = view === "log" || !activeNoteId;
  const note = activeNote?.id === activeNoteId ? activeNote : null;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const shown = composing ? "new" : `note:${activeNoteId}`;
  const previousShown = useRef(shown);

  // Controls disappear when switching views; put focus at the new content rather than leaving it on body.
  useEffect(() => {
    if (previousShown.current === shown) return;
    previousShown.current = shown;
    scrollRef.current?.scrollTo({ top: 0 });
    contentRef.current?.focus({ preventScroll: true });
  }, [shown]);

  const body = composing ? (
    <JournalEntryComposer
      options={readingOptions}
      followPage
      readingFirst
      autoFocus={autoFocus}
      onSaved={() => onViewChange("notes")}
    />
  ) : note ? (
    <JournalNoteEditor key={note.id} note={note} readingOptions={readingOptions} readingFirst />
  ) : isLoading ? (
    <p role="status" className="text-sm text-[color:var(--foreground-muted)]">Loading note…</p>
  ) : (
    <p role="status" className="text-sm text-[color:var(--foreground-muted)]">This entry couldn’t be opened. Open the Journal calendar to choose another, or start a new one.</p>
  );

  return (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b border-[color:var(--surface-border)] py-1 pl-4 pr-2 lg:py-2">
        <h2
          id={frame.titleId}
          className="flex min-w-0 flex-1 items-center gap-2 truncate font-display text-lg font-extrabold tracking-[-0.02em]"
        >
          <span className="truncate">Journal</span>
        </h2>
        <button type="button" onClick={onNewEntry} disabled={composing} aria-label="New entry" className={ACTION_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
          <span>New<span className="max-[359px]:hidden"> entry</span></span>
        </button>
        <Link href="/notes" aria-label="Open Journal calendar" title="Open Journal calendar" className={HEADER_ICON_CLASS}>
          <FontAwesomeIcon icon={faExpand} className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        {frame.closeButton}
      </header>
      {/* The Markdown editor fills the panel, with one scroll on desktop and mobile. */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div ref={contentRef} tabIndex={-1} className="flex flex-1 flex-col gap-4 p-4 outline-none">
          <DeviceSyncStatus />
          {body}
        </div>
      </div>
    </>
  );
}

function CollapseNotesButton({ onCollapse, label = "Collapse Journal" }: { onCollapse: () => void; label?: string }) {
  return (
    <button type="button" onClick={onCollapse} aria-label={label} title={label} className={HEADER_ICON_CLASS}>
      <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/**
 * The desktop Journal panel: nonmodal beside the page, which keeps room for it on chapter pages (`readerLog`). The
 * provider owns note selection and saving across every surface. Collapsed it is a pill, except on chapter pages,
 * where the reader's Log button opens it instead.
 */
export default function NotesSidebar({
  isOpen,
  onToggle,
  onCollapse,
  readerLog,
  renderContent,
  activeTitle,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onCollapse: () => void;
  readerLog: boolean;
  renderContent: (frame: NotesPanelFrame) => ReactNode;
  /** The active note's title, for the collapsed pill. */
  activeTitle: string | null;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(isOpen);

  useEffect(() => {
    if (wasOpen.current === isOpen) return;
    wasOpen.current = isOpen;
    if (isOpen) panelRef.current?.focus();
    else if (pillRef.current) pillRef.current.focus();
    else focusNotesLauncher();
  }, [isOpen]);

  if (!isOpen) {
    if (readerLog) return null;
    return (
      <button
        ref={pillRef}
        type="button"
        onClick={onToggle}
        aria-label={activeTitle ? `Open Journal: ${activeTitle}` : "Open Journal"}
        className="simple-hide fixed bottom-4 right-4 z-40 hidden h-11 max-w-[16rem] items-center gap-2 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] pl-1.5 pr-4 text-sm font-bold text-foreground shadow-[var(--surface-shadow-soft)] hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:inline-flex"
      >
        <LightbulbBadge size="sm" />
        <span className="truncate">{activeTitle || "Journal"}</span>
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="Journal"
      data-notes-panel={readerLog ? "reader" : "page"}
      className="simple-hide panel-card fixed bottom-4 right-4 top-[calc(var(--header-height)+0.5rem)] z-40 hidden w-[440px] flex-col overflow-hidden rounded-[20px] font-sans outline-none lg:flex xl:w-[480px]"
    >
      {renderContent({ closeButton: <CollapseNotesButton onCollapse={onCollapse} label="Collapse Journal" /> })}
    </aside>
  );
}
