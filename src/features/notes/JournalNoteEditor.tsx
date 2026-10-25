"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { useInsightBuilder, useNoteOutboxEntry } from "@/features/insights/InsightBuilderProvider";
import type { OutboxEntry } from "./journalOutbox";
import { formatDayHeading, formatTime, type JournalNoteDocument } from "./journal";
import ReadingChip from "./ReadingChip";
import { useJournalEntryActions } from "./useJournalEntryActions";
import LazyMarkdownEditor from "./LazyMarkdownEditor";
import NoteMarkdown from "./NoteMarkdown";
import { NoteSourceLine } from "./NoteSourceLine";

const SMALL_BUTTON_CLASS =
  "surface-button inline-flex h-8 items-center rounded-full border-2 px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50";

function SaveState({
  entry,
  onRetry,
  onCopy,
  copyNotice,
}: {
  entry: OutboxEntry | undefined;
  onRetry: () => void;
  onCopy: () => void;
  copyNotice: string | null;
}) {
  if (!entry) return null;
  if (entry.status === "saved") {
    return (
      <p role="status" className="text-xs text-[color:var(--foreground-soft)]">
        Saved{entry.savedAt ? ` at ${formatTime(new Date(entry.savedAt).toISOString())}` : ""}
      </p>
    );
  }
  if (entry.status === "pending") {
    return (
      <p role="status" className="text-xs text-[color:var(--foreground-soft)]">
        Unsaved changes
      </p>
    );
  }
  if (entry.status === "saving") {
    return (
      <p role="status" className="text-xs text-[color:var(--foreground-soft)]">
        Saving…
      </p>
    );
  }
  if (entry.status === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[color:var(--accent-rubric)]">Not saved: {entry.error}</span>
        <button type="button" onClick={onRetry} className={SMALL_BUTTON_CLASS}>
          Retry
        </button>
        <button type="button" onClick={onCopy} className={SMALL_BUTTON_CLASS}>
          Copy my text
        </button>
        {copyNotice ? <span>{copyNotice}</span> : null}
      </div>
    );
  }
  return null;
}

/**
 * The Markdown body of one note. Edits go to the provider's outbox, which keeps them across note switches,
 * navigation and reactive server updates, and saves them against the revision they were typed on.
 */
export default function JournalNoteEditor({
  note,
  authorLabel = "You",
  showDate = true,
  onClose,
  onDateChange,
}: {
  note: JournalNoteDocument;
  authorLabel?: string;
  /** False where the surrounding page already shows the note's day (the Notes calendar). */
  showDate?: boolean;
  /** Closes the note's view (the X at its upper right); unmounting then saves anything still unsaved. */
  onClose?: () => void;
  onDateChange?: (date: string) => void;
}) {
  const { journalOutbox } = useInsightBuilder();
  const { setEntryReading } = useJournalEntryActions();
  const entry = useNoteOutboxEntry(journalOutbox, note.id);
  const readOnly = note.status !== "draft";
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const noteId = note.id;

  // A clean local copy older than the server's (another tab or device saved) gives way to the server text.
  const serverIsNewer = entry?.status === "saved" && note.markdown_revision > entry.baseRevision;
  const text = entry && !serverIsNewer ? entry.text : note.markdown_body;

  useEffect(() => {
    if (serverIsNewer) journalOutbox.discard(noteId);
  }, [serverIsNewer, journalOutbox, noteId]);

  const revisionRef = useRef(note.markdown_revision);
  useEffect(() => {
    revisionRef.current = note.markdown_revision;
  }, [note.markdown_revision]);

  const onChange = useCallback(
    (value: string) => journalOutbox.edit(noteId, value, revisionRef.current),
    [journalOutbox, noteId]
  );

  // Leaving the note (switching, collapsing, navigating) saves what was typed instead of waiting.
  useEffect(() => () => journalOutbox.flush(noteId), [journalOutbox, noteId]);

  const copyText = useCallback(async () => {
    const value = journalOutbox.get(noteId)?.text ?? "";
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice("Copied.");
    } catch {
      setCopyNotice("Copy failed; select the text in the editor and copy it.");
    }
  }, [journalOutbox, noteId]);

  const created = new Date(note.created_at).toISOString();

  return (
    <article className="flex min-h-0 flex-1 flex-col gap-3" aria-label={note.title || "Note"}>
      <header className="space-y-1.5">
        {showDate ? (
          <p className="pt-0.5 text-xs font-bold uppercase tracking-[0.08em] text-[color:var(--accent-rubric)]">
            <time dateTime={note.journal_date}>{formatDayHeading(note.journal_date)}</time>
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <NoteSourceLine source={note.source} authorLabel={authorLabel} time={created} verb="Logged" />
          </div>
          <div className="max-w-[50%] shrink-0">
            <ReadingChip
              align="end"
              value={note.reading_at && note.source ? { source: note.source, journalDate: note.journal_date } : null}
              options={note.source ? [{ source: note.source }] : []}
              defaultDate={note.journal_date}
              disabled={readOnly || (entry !== undefined && entry.status !== "saved")}
              canRemove={!!text.trim()}
              onChange={async reading => {
                await setEntryReading(note.id, !!reading, reading ?? undefined);
                if (reading && reading.journalDate !== note.journal_date) onDateChange?.(reading.journalDate);
              }}
            />
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close note"
              title="Close note"
              className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-button-hover)] hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {readOnly ? (
          <p className="inline-flex rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-mint)] px-3 py-1 text-xs font-bold">
            {note.status === "published" ? "Published · read-only" : "Archived · read-only"}
          </p>
        ) : null}
        {!readOnly && !note.markdown_canonical ? (
          <p className="text-xs text-[color:var(--foreground-soft)]">
            This older note is shown as text. Editing it saves it as text; its original pieces are kept.
          </p>
        ) : null}
      </header>

      {entry?.status === "conflict" ? (
        <div
          role="alert"
          className="space-y-2 rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--accent-note)] p-3 text-sm"
        >
          <p className="font-semibold">This note was changed somewhere else, so your edits were not saved.</p>
          <p className="text-xs">Your text is still here. Copy it, then load the latest version or save yours over it.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyText()} className={SMALL_BUTTON_CLASS}>
              Copy my text
            </button>
            <button type="button" onClick={() => journalOutbox.discard(noteId)} className={SMALL_BUTTON_CLASS}>
              Load the latest version
            </button>
            {entry.conflictRevision !== null ? (
              <button type="button" onClick={() => journalOutbox.keepMine(noteId)} className={SMALL_BUTTON_CLASS}>
                Save mine over it
              </button>
            ) : null}
            {copyNotice ? <span className="self-center text-xs">{copyNotice}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1" onBlur={() => journalOutbox.flush(noteId)}>
        {readOnly ? (
          text.trim() ? (
            <NoteMarkdown markdown={text} />
          ) : (
            <p className="text-sm text-[color:var(--foreground-muted)]">This note is empty.</p>
          )
        ) : (
          <LazyMarkdownEditor key={noteId} value={text} onChange={onChange} ariaLabel={note.title === "Untitled note" ? "Entry note" : note.title || "Entry note"} />
        )}
      </div>

      {readOnly ? null : (
        <footer className="min-h-6">
          <SaveState
            entry={entry}
            onRetry={() => journalOutbox.retry(noteId)}
            onCopy={() => void copyText()}
            copyNotice={copyNotice}
          />
        </footer>
      )}
    </article>
  );
}
