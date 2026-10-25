"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrashCan, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useInsightBuilder, useNoteOutboxEntry } from "@/features/insights/InsightBuilderProvider";
import type { OutboxEntry } from "./journalOutbox";
import { formatDayHeading, formatTime, type JournalNoteDocument } from "./journal";
import LazyMarkdownEditor from "./LazyMarkdownEditor";
import ReadingChip, { type ReadingOption } from "./ReadingChip";
import { useJournalEntryActions } from "./useJournalEntryActions";
import NoteMarkdown from "./NoteMarkdown";
import { NoteSourceLine } from "./NoteSourceLine";

// 44px touch targets below lg (the phone sheet and journal), the compact size beside the desktop reader.
const SMALL_BUTTON_CLASS =
  "surface-button inline-flex h-11 items-center rounded-full border-2 px-4 text-sm font-bold lg:h-8 lg:px-3 lg:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] disabled:opacity-50";
const DELETE_CONFIRM_CLASS =
  "inline-flex h-11 items-center rounded-full border-2 border-[color:var(--accent-rubric)] bg-[color:var(--accent-rubric)] px-4 text-sm font-bold lg:h-8 lg:px-3 lg:text-xs text-[color:var(--surface-button-active-text)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-card)] aria-disabled:cursor-wait aria-disabled:opacity-70";

type DeleteStep = "idle" | "confirming" | "deleting" | "failed";

/**
 * "Delete note" and its confirmation. Nothing is deleted until the second, explicit choice; while the request
 * runs the controls hold their place, and a failure keeps the note (and its text) open with a way to retry.
 */
function DeleteNoteControl({ onDelete, logsReading }: { onDelete: () => Promise<void>; logsReading: boolean }) {
  const [step, setStep] = useState<DeleteStep>("idle");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const focusTrigger = useRef(false);
  const titleId = useId();
  const deleting = step === "deleting";

  useEffect(() => {
    if (step === "confirming") cancelRef.current?.focus();
    if (step === "idle" && focusTrigger.current) {
      focusTrigger.current = false;
      triggerRef.current?.focus();
    }
  }, [step]);

  const cancel = () => {
    if (deleting) return;
    focusTrigger.current = true;
    setStep("idle");
  };

  const confirm = async () => {
    if (deleting) return;
    setStep("deleting");
    try {
      await onDelete();
      // Deleted: the surface closes the note, which unmounts this.
    } catch {
      setStep("failed");
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    // Handled here, so a surrounding sheet doesn't close on the same key.
    event.preventDefault();
    cancel();
  };

  if (step === "idle") {
    return (
      <button ref={triggerRef} type="button" onClick={() => setStep("confirming")} className={`${SMALL_BUTTON_CLASS} gap-1.5`}>
        <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" aria-hidden="true" />
        Delete note
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-busy={deleting}
      onKeyDown={onKeyDown}
      className="w-full space-y-2 rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] p-3 text-sm"
    >
      <p id={titleId} className="font-semibold">
        Delete this note?
      </p>
      <p className="text-xs text-[color:var(--foreground-muted)]">
        {logsReading
          ? "It and its reading will be removed from your notes, calendar and reading history. Chapters you marked read stay read. This can't be undone."
          : "It will be removed from your notes and calendar. This can't be undone."}
      </p>
      {step === "failed" ? (
        <p role="alert" className="text-xs font-semibold text-[color:var(--accent-rubric)]">
          The note couldn&apos;t be deleted. Your text is still here; check your connection and try again.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {/* aria-disabled rather than disabled keeps focus on it while the request runs. */}
        <button type="button" aria-disabled={deleting} onClick={() => void confirm()} className={DELETE_CONFIRM_CLASS}>
          {deleting ? "Deleting…" : step === "failed" ? "Try again" : "Delete note"}
        </button>
        <button ref={cancelRef} type="button" disabled={deleting} onClick={cancel} className={SMALL_BUTTON_CLASS}>
          Cancel
        </button>
      </div>
      <p role="status" className="sr-only">
        {deleting ? "Deleting note…" : ""}
      </p>
    </div>
  );
}

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
  onDeleted,
  onDateChange,
  readingOptions = [],
}: {
  note: JournalNoteDocument;
  authorLabel?: string;
  /** False where the surrounding page already shows the note's day (the Notes calendar). */
  showDate?: boolean;
  /** Closes the note's view (the X at its upper right); unmounting then saves anything still unsaved. */
  onClose?: () => void;
  /**
   * Called once the note has been deleted (the provider has already cleared it as the active note), so the surface
   * can leave its view. It may arrive after another note was opened, so check that the deleted one is in view.
   */
  onDeleted?: (noteId: string) => void;
  /** The entry's reading moved it to another day. */
  onDateChange?: (journalDate: string) => void;
  /** Other passages the reading chip can switch to (the page in view); the entry's own source is always offered. */
  readingOptions?: ReadingOption[];
}) {
  const { journalOutbox, deleteDraft } = useInsightBuilder();
  const { setEntryReading } = useJournalEntryActions();
  const entry = useNoteOutboxEntry(journalOutbox, note.id);
  const readOnly = note.status !== "draft";
  // Published notes stay: they may be shared, and the server refuses to delete them.
  const canDelete = note.status !== "published";
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

  const deleteNote = useCallback(async () => {
    await deleteDraft(noteId);
    onDeleted?.(noteId);
  }, [deleteDraft, noteId, onDeleted]);

  const created = new Date(note.created_at).toISOString();
  const reading = note.reading_at && note.source ? { source: note.source, journalDate: note.journal_date } : null;

  return (
    <article className="flex min-h-0 flex-1 flex-col gap-3" aria-label={note.title || "Note"}>
      <header className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            {showDate ? (
              <p className="pt-0.5 text-xs font-bold uppercase tracking-[0.08em] text-[color:var(--accent-rubric)]">
                <time dateTime={note.journal_date}>{formatDayHeading(note.journal_date)}</time>
              </p>
            ) : null}
            <NoteSourceLine source={note.source} authorLabel={authorLabel} time={created} />
            {readOnly && !reading ? null : (
              <ReadingChip
                value={reading}
                options={note.source ? [{ source: note.source }, ...readingOptions] : readingOptions}
                defaultDate={note.journal_date}
                // Removing reading checks the saved text, so the chip waits for typing to be saved.
                disabled={readOnly || (entry !== undefined && entry.status !== "saved")}
                canRemove={!!text.trim()}
                onChange={async (next) => {
                  await setEntryReading(note.id, next);
                  if (next && next.journalDate !== note.journal_date) onDateChange?.(next.journalDate);
                }}
              />
            )}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close note"
              title="Close note"
              className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 lg:h-9 lg:w-9 items-center justify-center rounded-full text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-button-hover)] hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
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
          <LazyMarkdownEditor
            key={noteId}
            value={text}
            onChange={onChange}
            ariaLabel={note.title || "Note"}
            placeholder={reading ? "Add a note (optional)…" : "Write a note…"}
          />
        )}
      </div>

      {readOnly && !canDelete ? null : (
        <footer className="flex min-h-6 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {readOnly ? null : (
              <SaveState
                entry={entry}
                onRetry={() => journalOutbox.retry(noteId)}
                onCopy={() => void copyText()}
                copyNotice={copyNotice}
              />
            )}
          </div>
          {canDelete ? <DeleteNoteControl onDelete={deleteNote} logsReading={!!note.reading_at} /> : null}
        </footer>
      )}
    </article>
  );
}
