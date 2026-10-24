"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faExpand, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useInsightBuilder } from "./InsightBuilderProvider";
import { ICON_BUTTON_CLASS, LightbulbBadge } from "./NoteMenus";
import JournalNoteEditor from "@/features/notes/JournalNoteEditor";
import { useBelowLg } from "@/features/notes/useBelowLg";

const ACTION_BUTTON_CLASS =
  "surface-button inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50";

type DraftRow = { id: string; title: string; status: string; journal_date?: string };

// ---------------------------------------------------------------------------
// Desktop: the note beside the reader, or the collapsed pill
// ---------------------------------------------------------------------------

function DesktopNotebook() {
  const { isPanelOpen, togglePanel, closeBuilder, activeDraftId, activeNote, drafts, isLoading, switchDraft, createDraft } =
    useInsightBuilder();
  const activeTitle = drafts.find((draft) => draft.id === activeDraftId)?.title ?? null;
  const panelRef = useRef<HTMLElement | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(isPanelOpen);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep keyboard focus sensible when the panel expands or collapses.
  useEffect(() => {
    if (wasOpenRef.current === isPanelOpen) return;
    wasOpenRef.current = isPanelOpen;
    if (isPanelOpen) panelRef.current?.focus();
    else pillRef.current?.focus();
  }, [isPanelOpen]);

  async function onCreate() {
    setCreating(true);
    setError(null);
    try {
      await createDraft();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "The note could not be created.");
    } finally {
      setCreating(false);
    }
  }

  if (!isPanelOpen) {
    return (
      <button
        ref={pillRef}
        type="button"
        onClick={togglePanel}
        aria-label={activeTitle ? `Open the notebook: ${activeTitle}` : "Open the notebook"}
        className="simple-hide fixed bottom-4 right-4 z-40 hidden h-11 max-w-[16rem] items-center gap-2 rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] pl-1.5 pr-4 text-sm font-bold text-foreground shadow-[var(--surface-shadow-soft)] hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] lg:inline-flex"
      >
        <LightbulbBadge size="md" className="h-8 w-8" />
        <span className="truncate">{activeTitle ?? "Notebook"}</span>
      </button>
    );
  }

  const rows = drafts as DraftRow[];

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="Notebook"
      className="simple-hide fixed bottom-4 right-4 top-[calc(var(--header-height)+0.5rem)] z-40 hidden w-[440px] flex-col overflow-hidden rounded-[20px] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] shadow-[var(--surface-shadow)] outline-none lg:flex xl:w-[480px]"
    >
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-[color:var(--surface-border)] bg-[color:var(--accent-note)] px-3 py-2.5 font-sans">
        <LightbulbBadge />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Open note</span>
          <select
            value={activeDraftId ?? ""}
            onChange={(event) => {
              if (event.target.value) void switchDraft(event.target.value);
            }}
            className="soft-input h-9 w-full truncate px-3 text-sm font-bold"
            style={{ borderRadius: 999 }}
          >
            {activeDraftId ? null : <option value="">{rows.length ? "Choose a note" : "No notes yet"}</option>}
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {`${row.title || "Untitled note"}${row.journal_date ? ` · ${row.journal_date}` : ""}${
                  row.status === "draft" ? "" : " (read-only)"
                }`}
              </option>
            ))}
          </select>
        </label>
        <Link href="/notes" aria-label="Open in the Notes calendar" title="Open in the Notes calendar" className={ICON_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faExpand} className="h-4 w-4" aria-hidden="true" />
        </Link>
        <button type="button" onClick={closeBuilder} aria-label="Collapse the notebook" title="Collapse" className={ICON_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 font-sans">
        {activeNote ? (
          <JournalNoteEditor key={activeNote.id} note={activeNote} />
        ) : isLoading && activeDraftId ? (
          <p role="status" className="text-sm text-[color:var(--foreground-muted)]">
            Loading note…
          </p>
        ) : (
          <div className="m-auto max-w-xs text-center">
            <p className="font-display text-base font-extrabold tracking-[-0.02em]">No note open</p>
            <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
              Choose one above, or start a new note linked to what you are reading.
            </p>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card-soft)] px-3 py-2.5 font-sans">
        <button type="button" onClick={() => void onCreate()} disabled={creating} className={ACTION_BUTTON_CLASS}>
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden="true" />
          {creating ? "Creating…" : "New note"}
        </button>
        {error ? (
          <p role="alert" className="min-w-0 flex-1 truncate text-xs font-semibold text-[color:var(--accent-rubric)]" title={error}>
            {error}
          </p>
        ) : null}
      </footer>
    </aside>
  );
}

// ---------------------------------------------------------------------------

export default function NotebookPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const { canUseInsights, isMobileOpen, dismissMobile } = useInsightBuilder();
  const belowLg = useBelowLg();
  const onNotesPage = pathname === "/notes" || pathname.startsWith("/notes/");

  // Reader actions ask for the notebook with isMobileOpen. Below lg there is no sheet any more: the note opens
  // full-screen on /notes (the provider already made it active). Only the phone flag is cleared, so the
  // desktop panel's remembered state is untouched.
  useEffect(() => {
    if (!isMobileOpen || belowLg === null) return;
    dismissMobile();
    if (belowLg && canUseInsights && !onNotesPage) router.push("/notes");
  }, [isMobileOpen, belowLg, canUseInsights, onNotesPage, dismissMobile, router]);

  if (!canUseInsights || onNotesPage || belowLg !== false) return null;
  return <DesktopNotebook />;
}
