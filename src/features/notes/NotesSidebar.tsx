"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronLeft, faExpand, faPlus } from "@fortawesome/free-solid-svg-icons";
import type { InsightDraftSummary } from "@/lib/appData";
import type { NotebookPanelView } from "@/features/insights/InsightBuilderProvider";
import { LightbulbBadge } from "@/features/insights/NoteMenus";
import JournalNoteEditor from "./JournalNoteEditor";
import { JournalNoteCard } from "./JournalNoteCard";
import { formatDayHeading, formatShortDayHeading, type JournalNoteDocument } from "./journal";

// Below lg these sit in the phone sheet, so they grow to touch-sized targets there.
const HEADER_ICON_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-button-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:h-8 lg:w-8";
const ACTION_BUTTON_CLASS =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-card)] disabled:opacity-50 lg:h-8 lg:px-3 lg:text-xs";

// The phone sheet's single header row fits 320px wide, so its New note button is narrower.
const SHEET_ACTION_BUTTON_CLASS =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--surface-button-active)] px-3 text-sm font-bold text-[color:var(--surface-button-active-text)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-card)] disabled:opacity-50";

const PANEL_VIEWS: ReadonlyArray<{ value: NotebookPanelView; label: string }> = [
  { value: "log", label: "Log" },
  { value: "notes", label: "Notes" },
];

export type NotesPanelNotes = {
  activeNoteId: string | null;
  activeNote: JournalNoteDocument | null;
  notes: InsightDraftSummary[];
  isLoading: boolean;
  onSelect: (id: string) => Promise<void>;
  onCreate: () => Promise<string | null>;
};

/** On a chapter page the panel holds Log beside Notes; `log` is that chapter's Log view. */
export type NotesCompanion = {
  view: NotebookPanelView;
  onViewChange: (view: NotebookPanelView) => void;
  log: ReactNode;
};

/** The Log | Notes switch, with the surface's own close control beside it. */
export function PanelViewTabs({
  view,
  onViewChange,
  closeButton,
}: {
  view: NotebookPanelView;
  onViewChange: (view: NotebookPanelView) => void;
  closeButton: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--surface-border)] px-4 py-2 font-sans">
      <div className="segmented-control min-w-0 flex-1" role="group" aria-label="Log or Notes">
        {PANEL_VIEWS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            data-active={view === value ? "true" : "false"}
            onClick={() => onViewChange(value)}
            className="segmented-control-button flex-1 text-sm"
          >
            {label}
          </button>
        ))}
      </div>
      {closeButton}
    </div>
  );
}

/**
 * A Notes surface, with Log beside it on chapter pages. Notes keeps its place in the tree either way, and stays
 * mounted (hidden, so out of the tab order and accessibility tree) while Log shows, so an open note's editor state
 * survives switching views or leaving the chapter. Log stays mounted too, keeping a half-filled log.
 */
export function NotesCompanionLayout({
  companion,
  closeButton,
  children,
}: {
  companion?: NotesCompanion;
  closeButton: ReactNode;
  children: ReactNode;
}) {
  const showLog = companion?.view === "log";
  return (
    <>
      {companion ? <PanelViewTabs view={companion.view} onViewChange={companion.onViewChange} closeButton={closeButton} /> : null}
      {companion ? <div className={showLog ? "flex min-h-0 flex-1 flex-col" : "hidden"}>{companion.log}</div> : null}
      <div className={showLog ? "hidden" : "flex min-h-0 flex-1 flex-col"}>{children}</div>
    </>
  );
}

/** Focus the reader's Log button, which opens the panel on chapter pages in place of the pill. */
export function focusNotesLauncher() {
  document.querySelector<HTMLElement>("[data-notebook-launcher]")?.focus();
}

/**
 * The phone Log sheet's parts around Notes: its one header row is the sheet's title (`titleId` names the dialog) with
 * Notes' actions and `closeButton`; below it, one scroll holds `log` and then Notes. `revealNotes` opens it at Notes.
 */
export type NotesSheetFrame = {
  titleId: string;
  log: ReactNode;
  closeButton: ReactNode;
  revealNotes: boolean;
};

/**
 * Notes' header and its dated list or the open note. The desktop sidebar and the phone Log sheet both show it;
 * `onCollapse` adds the header's collapse control when the surface has no other. On its own it fills the surface and
 * scrolls its own list; with `sheet` it shares the sheet's single header and sits below Log in the sheet's one scroll.
 */
export function NotesPanelContent({
  activeNoteId,
  activeNote,
  notes,
  isLoading,
  onSelect,
  onCreate,
  onCollapse,
  sheet,
}: NotesPanelNotes & { onCollapse?: () => void; sheet?: NotesSheetFrame }) {
  // Browsing does not clear the provider's active note. Reader actions selecting another note open it directly.
  const [browsingFor, setBrowsingFor] = useState<{ id: string | null } | null>(null);
  const browsing = !activeNoteId || browsingFor?.id === activeNoteId;
  const note = activeNote?.id === activeNoteId ? activeNote : null;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousView = useRef({ browsing, activeNoteId });
  const revealNotesRef = useRef(sheet?.revealNotes ?? false);
  const inSheet = Boolean(sheet);

  useEffect(() => {
    if (revealNotesRef.current) notesRef.current?.scrollIntoView({ block: "start" });
  }, []);

  // Controls disappear when switching views; put focus at the new content rather than leaving it on body.
  useEffect(() => {
    const previous = previousView.current;
    previousView.current = { browsing, activeNoteId };
    if (previous.browsing !== browsing || previous.activeNoteId !== activeNoteId) {
      // In the sheet, Log and Notes share one scroll: bring Notes to its top instead.
      if (inSheet) notesRef.current?.scrollIntoView({ block: "start" });
      else contentRef.current?.scrollTo({ top: 0 });
      contentRef.current?.focus({ preventScroll: true });
    }
  }, [browsing, activeNoteId, inSheet]);

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

  async function createNote() {
    setCreating(true);
    setError(null);
    try {
      const id = await onCreate();
      if (id) setBrowsingFor(null);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "The note could not be created.");
    } finally {
      setCreating(false);
    }
  }

  async function selectNote(id: string) {
    setError(null);
    // Selection updates the provider immediately; let the document's loading state take over.
    setBrowsingFor(null);
    try {
      await onSelect(id);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "The note could not be opened.");
    }
  }

  const showAllNotes = () => {
    setError(null);
    setBrowsingFor({ id: activeNoteId });
  };
  const newNoteButton = (
    <button
      type="button"
      onClick={() => void createNote()}
      disabled={creating}
      aria-label={creating ? "Creating note" : "New note"}
      className={sheet ? SHEET_ACTION_BUTTON_CLASS : ACTION_BUTTON_CLASS}
    >
      <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
      {creating ? (
        "Creating…"
      ) : sheet ? (
        // Narrow phones keep the header to one row.
        <span>
          New<span className="max-[359px]:hidden"> note</span>
        </span>
      ) : (
        "New note"
      )}
    </button>
  );
  const calendarLink = (
    <Link href="/notes" aria-label="Open Notes calendar" title="Open Notes calendar" className={HEADER_ICON_CLASS}>
      <FontAwesomeIcon icon={faExpand} className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
  const errorAlert = error ? (
    <p role="alert" className="px-4 pt-3 text-sm font-semibold wrap-anywhere text-[color:var(--accent-rubric)]">{error}</p>
  ) : null;
  const body = (
    <>
      {browsing ? (
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
            <p className="mt-1">Start a note linked to what you are reading. You can find it by day in the Notes calendar.</p>
          </div>
        )
      ) : note ? (
        <JournalNoteEditor key={note.id} note={note} />
      ) : isLoading ? (
        <p role="status" className="text-sm text-[color:var(--foreground-muted)]">Loading note…</p>
      ) : (
        <p role="status" className="text-sm text-[color:var(--foreground-muted)]">This note couldn’t be opened. Use the All notes back button to choose another, or start a new one.</p>
      )}
    </>
  );

  if (sheet) {
    return (
      <>
        <header className="flex shrink-0 items-center gap-1 border-b border-[color:var(--surface-border)] pb-1 pl-4 pr-2">
          {browsing ? null : (
            <button
              type="button"
              onClick={showAllNotes}
              aria-label="All notes"
              title="All notes"
              className={`${HEADER_ICON_CLASS} -ml-3`}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <h2 id={sheet.titleId} className="min-w-0 flex-1 truncate font-display text-lg font-extrabold tracking-[-0.02em]">
            Log
          </h2>
          {newNoteButton}
          {calendarLink}
          {sheet.closeButton}
        </header>
        {/* Log, then Notes, in one scroll: no view switching, and nothing below is cut off by an inner scroller.
            Notes is at least the scroller's height (definite: a flexed item of the fixed-height sheet), so revealNotes
            can bring its top to the top of the scroll even when it holds only a new, empty note. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          {sheet.log}
          <section ref={notesRef} aria-label="Notes" className="mt-4 min-h-full border-t border-[color:var(--surface-border)]">
            {errorAlert}
            <div ref={contentRef} tabIndex={-1} className="flex flex-col p-4 outline-none">
              {body}
            </div>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--surface-border)] px-4 py-3">
        <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold tracking-[-0.02em]">
          {browsing ? (
            <span className="flex h-11 items-center gap-2 lg:h-8">
              <LightbulbBadge size="sm" />
              Notes
            </span>
          ) : (
            <button
              type="button"
              onClick={showAllNotes}
              aria-label="All notes"
              title="All notes"
              className="-ml-1 flex h-11 items-center gap-2 rounded-full pl-1 pr-3 transition-colors hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:h-8"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center text-[color:var(--foreground-muted)]">
                <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" aria-hidden="true" />
              </span>
              Notes
            </button>
          )}
        </h2>
        {newNoteButton}
        <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-[color:var(--surface-border)]" />
        <div className="flex shrink-0 items-center gap-0.5">
          {calendarLink}
          {onCollapse ? <CollapseNotesButton onCollapse={onCollapse} /> : null}
        </div>
      </header>
      {errorAlert}
      <div ref={contentRef} tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 outline-none">
        {body}
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
 * Desktop reader companion. The provider owns note selection and saving across every Notes surface. Collapsed, it is
 * a pill, except on chapter pages (`companion`), where the reader's Log button opens it instead.
 */
export default function NotesSidebar({
  isOpen,
  onToggle,
  onCollapse,
  companion,
  ...notesProps
}: NotesPanelNotes & {
  isOpen: boolean;
  onToggle: () => void;
  onCollapse: () => void;
  companion?: NotesCompanion;
}) {
  const { activeNoteId, activeNote, notes } = notesProps;
  const activeTitle =
    notes.find((row) => row.id === activeNoteId)?.title || (activeNote?.id === activeNoteId ? activeNote?.title : null);
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
    if (companion) return null;
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
      aria-label={companion ? "Log and Notes" : "Notes"}
      className="simple-hide panel-card fixed bottom-4 right-4 top-[calc(var(--header-height)+0.5rem)] z-40 hidden w-[440px] flex-col overflow-hidden rounded-[20px] font-sans outline-none lg:flex xl:w-[480px]"
    >
      <NotesCompanionLayout
        companion={companion}
        closeButton={<CollapseNotesButton onCollapse={onCollapse} label="Collapse Log and Notes" />}
      >
        <NotesPanelContent {...notesProps} onCollapse={companion ? undefined : onCollapse} />
      </NotesCompanionLayout>
    </aside>
  );
}
