"use client";

import DeviceSyncStatus from "./DeviceSyncStatus";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronLeft, faExpand, faPlus } from "@fortawesome/free-solid-svg-icons";
import type { InsightDraftSummary } from "@/lib/appData";
import type { NotebookPanelView } from "@/features/insights/InsightBuilderProvider";
import { LightbulbBadge } from "@/features/insights/NoteMenus";
import JournalEntryComposer from "./JournalEntryComposer";
import JournalNoteEditor from "./JournalNoteEditor";
import { JournalNoteCard } from "./JournalNoteCard";
import type { ReadingOption } from "./ReadingChip";
import { formatDayHeading, formatShortDayHeading, type JournalNoteDocument } from "./journal";

// Touch-sized below lg, where the panel is the phone sheet.
const HEADER_ICON_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-button-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:h-9 lg:w-9";
// The header is one row at 320px wide, so New note is narrow there.
const ACTION_BUTTON_CLASS =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--surface-button-active)] px-3 text-sm font-bold text-[color:var(--surface-button-active-text)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-card)] disabled:opacity-50 lg:h-9 lg:text-xs";

export type NotesPanelNotes = {
  activeNoteId: string | null;
  activeNote: JournalNoteDocument | null;
  notes: InsightDraftSummary[];
  isLoading: boolean;
  onSelect: (id: string) => Promise<void>;
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
 * The Log panel, the same in the phone sheet and the desktop sidebar: one compact header row (All notes or back,
 * the title, New note, the calendar, close) above one scroll. `view` "log" is the unsaved entry (its reading chip,
 * writer, day and Save); "notes" is the saved notes by day, or the open one with its reading chip.
 */
export function NotesPanelContent({
  activeNoteId,
  activeNote,
  notes,
  isLoading,
  onSelect,
  view,
  onViewChange,
  onNewEntry,
  readingOptions,
  frame,
  autoFocus = false,
}: NotesPanelNotes & {
  view: NotebookPanelView;
  onViewChange: (view: NotebookPanelView) => void;
  /** New note: the unsaved entry, from this page's defaults unless it already holds something. */
  onNewEntry: () => void;
  readingOptions: ReadingOption[];
  frame: NotesPanelFrame;
  autoFocus?: boolean;
}) {
  // Browsing does not clear the provider's active note. Reader actions selecting another note open it directly.
  const [browsingFor, setBrowsingFor] = useState<{ id: string | null } | null>(null);
  const composing = view === "log";
  const browsing = !composing && (!activeNoteId || browsingFor?.id === activeNoteId);
  const note = activeNote?.id === activeNoteId ? activeNote : null;
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const shown = composing ? "log" : browsing ? "list" : `note:${activeNoteId}`;
  const previousShown = useRef(shown);

  // Controls disappear when switching views; put focus at the new content rather than leaving it on body.
  useEffect(() => {
    if (previousShown.current === shown) return;
    previousShown.current = shown;
    scrollRef.current?.scrollTo({ top: 0 });
    contentRef.current?.focus({ preventScroll: true });
  }, [shown]);

  const days = useMemo(() => {
    const groups = new Map<string, InsightDraftSummary[]>();
    for (const row of notes) {
      const day = row.journal_date ?? row.created_at.slice(0, 10);
      const group = groups.get(day) ?? [];
      group.push(row);
      groups.set(day, group);
    }
    return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([day, rows]) => ({
      day,
      rows: rows.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }));
  }, [notes]);

  async function selectNote(id: string) {
    setError(null);
    // Selection updates the provider immediately; let the document's loading state take over.
    setBrowsingFor(null);
    onViewChange("notes");
    try {
      await onSelect(id);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "The note could not be opened.");
    }
  }

  function showAllNotes() {
    setError(null);
    setBrowsingFor({ id: activeNoteId });
    onViewChange("notes");
  }

  function newEntry() {
    setError(null);
    onNewEntry();
  }

  const body = composing ? (
    <JournalEntryComposer
      options={readingOptions}
      followPage
      autoFocus={autoFocus}
      onSaved={() => {
        setBrowsingFor(null);
        onViewChange("notes");
      }}
    />
  ) : browsing ? (
    notes.length > 0 ? (
      <div className="space-y-5">
        {days.map(({ day, rows }) => (
          <section key={day} aria-label={formatDayHeading(day)} className="space-y-2.5">
            <h3 className="font-display text-base font-extrabold tracking-[-0.02em]">
              <time dateTime={day}>{formatShortDayHeading(day)}</time>
            </h3>
            <ul className="space-y-2.5">
              {rows.map((row) => (
                <JournalNoteCard
                  key={row.id}
                  note={{ ...row, source: row.source ?? null, excerpt: row.excerpt ?? null, author_label: "You" }}
                  selected={row.id === activeNoteId}
                  onOpen={() => void selectNote(row.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    ) : isLoading ? (
      <p role="status" className="text-sm text-[color:var(--foreground-muted)]">Loading notes…</p>
    ) : (
      <div className="rounded-[1rem] border-2 border-dashed border-[color:var(--surface-border)] px-4 py-5 text-sm text-[color:var(--foreground-muted)]">
        <p className="font-semibold text-foreground">No notes yet</p>
        <p className="mt-1">Write a note or log your reading with New note. You can find it by day in the Journal calendar.</p>
      </div>
    )
  ) : note ? (
    <JournalNoteEditor key={note.id} note={note} readingOptions={readingOptions} />
  ) : isLoading ? (
    <p role="status" className="text-sm text-[color:var(--foreground-muted)]">Loading note…</p>
  ) : (
    <p role="status" className="text-sm text-[color:var(--foreground-muted)]">This note couldn’t be opened. Use the All notes back button to choose another, or start a new one.</p>
  );

  return (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b border-[color:var(--surface-border)] py-1 pl-4 pr-2 lg:py-2">
        {browsing ? null : (
          <button
            type="button"
            onClick={showAllNotes}
            aria-label="All notes"
            title="All notes"
            className={`${HEADER_ICON_CLASS} -ml-3 lg:-ml-2`}
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <h2
          id={frame.titleId}
          className="flex min-w-0 flex-1 items-center gap-2 truncate font-display text-lg font-extrabold tracking-[-0.02em]"
        >
          {composing ? null : (
            <span className="hidden lg:inline-flex">
              <LightbulbBadge size="sm" />
            </span>
          )}
          <span className="truncate">{composing ? "Log" : "Notes"}</span>
        </h2>
        {composing ? null : (
          <button type="button" onClick={newEntry} aria-label="New note" className={ACTION_BUTTON_CLASS}>
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
            <span>
              New<span className="max-[359px]:hidden"> note</span>
            </span>
          </button>
        )}
        <Link href="/notes" aria-label="Open Journal calendar" title="Open Journal calendar" className={HEADER_ICON_CLASS}>
          <FontAwesomeIcon icon={faExpand} className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        {frame.closeButton}
      </header>
      {/* One scroll for everything below the header, so nothing is cut off by an inner scroller. The content fills at
          least its height, so an open note's footer (Delete note) sits at the bottom rather than under a short editor. */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {error ? (
          <p role="alert" className="shrink-0 px-4 pt-3 text-sm font-semibold wrap-anywhere text-[color:var(--accent-rubric)]">{error}</p>
        ) : null}
        <div ref={contentRef} tabIndex={-1} className="flex flex-1 flex-col gap-4 p-4 outline-none">
          <DeviceSyncStatus />
          {body}
        </div>
      </div>
    </>
  );
}

function CollapseNotesButton({ onCollapse, label = "Collapse Notes" }: { onCollapse: () => void; label?: string }) {
  return (
    <button type="button" onClick={onCollapse} aria-label={label} title={label} className={HEADER_ICON_CLASS}>
      <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/**
 * The desktop Log panel: nonmodal beside the page, which keeps room for it on chapter pages (`readerLog`). The
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
        aria-label={activeTitle ? `Open Notes: ${activeTitle}` : "Open Notes"}
        className="simple-hide fixed bottom-4 right-4 z-40 hidden h-11 max-w-[16rem] items-center gap-2 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] pl-1.5 pr-4 text-sm font-bold text-foreground shadow-[var(--surface-shadow-soft)] hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:inline-flex"
      >
        <LightbulbBadge size="sm" />
        <span className="truncate">{activeTitle || "Notes"}</span>
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label={readerLog ? "Log and notes" : "Notes"}
      data-notes-panel={readerLog ? "reader" : "page"}
      className="simple-hide panel-card fixed bottom-4 right-4 top-[calc(var(--header-height)+0.5rem)] z-40 hidden w-[440px] flex-col overflow-hidden rounded-[20px] font-sans outline-none lg:flex xl:w-[480px]"
    >
      {renderContent({ closeButton: <CollapseNotesButton onCollapse={onCollapse} label="Collapse Log and notes" /> })}
    </aside>
  );
}
