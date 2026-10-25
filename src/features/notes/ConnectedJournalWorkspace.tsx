"use client";

// The /notes page's adapter: the signed-in user's real journal, reading history and active note, fed into
// the presentational JournalWorkspace. Notes are created and opened through InsightBuilderProvider so the
// reader's sidebar and this page always agree on which note is current. Which day and note are in view is
// this page's own state (journalView.ts): closing a note only clears the view, and nothing reactive reopens one.
// An opened note also takes one browser history entry (useJournalHistory), so Back closes it and Forward reopens it.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import AccountControl from "@/components/AccountControl";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { useMyReadingLog } from "@/features/plans/useReadingProgress";
import { useJournalEntryActions } from "./useJournalEntryActions";
import JournalWorkspace from "./JournalWorkspace";
import JournalNoteEditor from "./JournalNoteEditor";
import JournalLogButton, { type ReadingLogOption } from "./JournalLogButton";
import {
  localDateKey,
  readingEntryFromRow,
  type JournalEntry,
  type NoteSource,
  type ReadingLogRow,
} from "./journal";
import {
  nextJournalView,
  resolveJournalView,
  type JournalViewAction,
  type JournalViewState,
} from "./journalView";
import { useBelowLg } from "./useBelowLg";
import { useConvexSignedIn } from "./useConvexSignedIn";
import { useJournalHistory } from "./useJournalHistory";
import SignInLink from "@/features/auth/SignInLink";

const MAX_LOG_CHOICES = 8;

function sourceKey(source: NoteSource) {
  return `${source.kind}|${source.href}|${source.label}`;
}

export default function ConnectedJournalWorkspace() {
  const { user, ready, loading } = useConvexSignedIn();
  const { openReadingEntry } = useJournalEntryActions();
  const belowLg = useBelowLg();
  const { drafts, activeDraftId, activeNote, isLoading, switchDraft, createJournalNote } = useInsightBuilder();
  const journal = useQuery(api.insights.listMyJournal, ready ? {} : "skip") as JournalEntry[] | undefined;
  const readingLog = useMyReadingLog() as ReadingLogRow[] | undefined;

  const [today] = useState(() => localDateKey());
  const [viewState, setViewState] = useState<JournalViewState>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Arriving fresh shows the calendar on today; the provider's active note opens only when chosen.
  const view = useMemo(
    () => resolveJournalView(viewState, { today, activeNoteId: activeDraftId }),
    [viewState, today, activeDraftId]
  );
  const selectedDate = view.date;

  // Back or Forward onto a note's entry: open it in the provider too, if it is still this person's note.
  // Otherwise nothing is switched and the view falls back to that day's chooser (resolveJournalView).
  const selectFromHistory = useCallback(
    (noteId: string) => {
      if (noteId === activeDraftId || !drafts.some((draft) => draft.id === noteId)) return;
      void switchDraft(noteId);
    },
    [activeDraftId, drafts, switchDraft]
  );
  const go = useJournalHistory(view, { enabled: ready && !isLoading, show: setViewState, select: selectFromHistory });
  // Every action starts from the view on screen, so arriving and then acting never depends on stale state.
  const act = useCallback((action: JournalViewAction) => go((current) => nextJournalView(current, action)), [go]);

  // The server's label for the signed-in user, as it appears on their own notes; else their account name.
  const viewerLabel = useMemo(() => {
    const own = journal?.find((entry) => entry.kind === "note");
    if (own && own.kind === "note" && own.author_label) return own.author_label;
    return user?.fullName || user?.email || "You";
  }, [journal, user?.fullName, user?.email]);

  const entries = useMemo<JournalEntry[]>(
    () => [
      ...(journal ?? []).filter((entry) => entry.kind !== "reading"),
      ...(readingLog ?? []).filter((row) => !row.note_id).map((row) => readingEntryFromRow(row, viewerLabel)),
    ],
    [journal, readingLog, viewerLabel]
  );

  // Only the note the view names, and only once its document has loaded.
  const openNote = view.noteId !== null && activeNote?.id === view.noteId ? activeNote : null;
  const openNoteLoading = view.noteId !== null && !openNote && isLoading;

  // What can be logged from here: sources this person actually has — the open note's, the selected day's,
  // then their recent reading history. Nothing is suggested that they haven't been to.
  const logOptions = useMemo<ReadingLogOption[]>(() => {
    const seen = new Set<string>();
    const out: ReadingLogOption[] = [];
    function add(source: NoteSource | null | undefined) {
      if (!source || out.length >= MAX_LOG_CHOICES) return;
      const key = sourceKey(source);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ source });
    }
    add(openNote?.source);
    for (const entry of entries) if (entry.journal_date === selectedDate) add(entry.source);
    for (const row of readingLog ?? []) add(row.source);
    return out;
  }, [openNote?.source, entries, selectedDate, readingLog]);

  const onOpenNote = useCallback(
    (noteId: string, journalDate: string) => {
      act({ type: "openNote", noteId, date: journalDate });
      if (noteId !== activeDraftId) void switchDraft(noteId);
    },
    [act, activeDraftId, switchDraft]
  );
  const onSelectDate = useCallback((date: string) => act({ type: "selectDate", date }), [act]);
  const onCloseNote = useCallback(() => act({ type: "closeNote" }), [act]);
  const onShowCalendar = useCallback(() => act({ type: "showCalendar" }), [act]);

  const onNewNote = useCallback(
    async (journalDate: string) => {
      setCreating(true);
      setCreateError(null);
      try {
        // Written on the Notes page itself, so there is no reading source to claim.
        const noteId = await createJournalNote({ journalDate, source: null });
        // The new note becomes the provider's active note; show it, whatever is in view by now.
        if (noteId) go({ stage: "note", date: journalDate, noteId });
      } catch (error) {
        setCreateError(error instanceof Error && error.message ? error.message : "The note could not be created.");
      } finally {
        setCreating(false);
      }
    },
    [createJournalNote, go]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p role="status" className="text-sm text-[color:var(--foreground-muted)]">
          Loading notes…
        </p>
        <AccountControl variant="page" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AccountControl variant="page" />
        <div className="panel-card mx-auto flex max-w-xl flex-col items-center gap-4 rounded-[1.5rem] px-6 py-8 text-center">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">Sign in to use your journal</h1>
            <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">
              Keep notes and reading together in a private journal, organized by day.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/browse" className="surface-button inline-flex h-10 items-center rounded-full border-2 px-4 text-sm">
              Browse scriptures
            </Link>
            <SignInLink
              returnTo="/notes"
              className="inline-flex h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)]"
            />
          </div>
        </div>
      </>
    );
  }

  // Signed in, but Convex finished without accepting the session (offline, or the token was refused).
  if (!ready) {
    return (
      <>
        <AccountControl variant="page" />
        <div
          role="alert"
          className="panel-card mx-auto flex max-w-xl flex-col items-center gap-4 rounded-[1.5rem] px-6 py-8 text-center"
        >
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">Couldn&apos;t connect to your notes</h1>
            <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">
              You&apos;re signed in, but your account couldn&apos;t be connected to the notes service. Check your
              connection and reload, or sign out and back in from the account menu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)]"
          >
            Reload
          </button>
        </div>
      </>
    );
  }

  const activeEntry = journal?.find((entry) => entry.kind === "note" && entry.id === activeDraftId);
  const authorLabel = activeEntry && activeEntry.kind === "note" ? activeEntry.author_label : viewerLabel;

  const notePane = openNote ? (
    <JournalNoteEditor
      key={openNote.id}
      note={openNote}
      authorLabel={authorLabel}
      showDate={false}
      onClose={onCloseNote}
      onDateChange={date => onOpenNote(openNote.id, date)}
    />
  ) : openNoteLoading ? (
    <p role="status" className="text-sm text-[color:var(--foreground-muted)]">
      Loading note…
    </p>
  ) : view.noteId !== null ? (
    <p role="alert" className="text-sm text-[color:var(--foreground-muted)]">
      This note couldn&apos;t be opened here.
    </p>
  ) : null;

  const historyLoaded = journal !== undefined && readingLog !== undefined;
  const dayActions = !historyLoaded ? null : (
    <JournalLogButton
      key={selectedDate}
      options={logOptions}
      defaultDate={selectedDate}
      onLogged={onSelectDate}
    />
  );

  return (
    <JournalWorkspace
      layout={belowLg ? "phone" : "desktop"}
      status={historyLoaded ? "ready" : "loading"}
      entries={entries}
      today={today}
      stage={view.stage}
      selectedDate={selectedDate}
      onSelectDate={onSelectDate}
      selectedKey={view.noteId !== null ? `note:${view.noteId}` : null}
      onOpenNote={onOpenNote}
      onOpenReading={async (entry) => {
        setCreateError(null);
        try {
          const { id } = await openReadingEntry(entry.id);
          onOpenNote(id, entry.journal_date);
        } catch { setCreateError("This entry couldn't be opened. Try again."); }
      }}
      onCloseNote={onCloseNote}
      onShowCalendar={onShowCalendar}
      onNewNote={(journalDate) => void onNewNote(journalDate)}
      creating={creating}
      createError={createError}
      notePane={notePane}
      headerAccessory={<AccountControl variant="page" />}
      dayActions={dayActions}
    />
  );
}
