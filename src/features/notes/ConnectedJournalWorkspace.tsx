"use client";

// The /notes adapter: device storage when signed out, account journal when signed in, fed into
// the presentational JournalWorkspace. Entries are created (one unsaved entry draft, saved as note, reading or both)
// and opened through InsightBuilderProvider so the reader's panel and this page always agree on which note is
// current. An older reading opens as an editable entry the first time it is chosen (openReadingEntry). Which day and note are in view is
// this page's own state (journalView.ts): closing a note only clears the view, and nothing reactive reopens one.
// An opened note also takes one browser history entry (useJournalHistory), so Back closes it and Forward reopens it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import AccountControl from "@/components/AccountControl";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { useMyReadingLog } from "@/features/reading/useReadingProgress";
import JournalWorkspace from "./JournalWorkspace";
import JournalNoteEditor from "./JournalNoteEditor";
import JournalEntryComposer from "./JournalEntryComposer";
import type { ReadingLogOption } from "./ReadingChip";
import { restartEntryDraft } from "./entryDraft";
import { useJournalEntryActions } from "./useJournalEntryActions";
import {
  localDateKey,
  readingEntryFromRow,
  type JournalEntry,
  type JournalReadingEntry,
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
import { DEFAULT_JOURNAL_GOALS } from "@/lib/journalGoals";
import { deviceJournal, deviceStudy } from "./deviceStudy";
import { useDeviceStudy } from "./useDeviceStudy";
import DeviceSyncStatus from "./DeviceSyncStatus";

const MAX_LOG_CHOICES = 8;

function sourceKey(source: NoteSource) {
  return `${source.kind}|${source.href}|${source.label}`;
}

export default function ConnectedJournalWorkspace() {
  const { user, ready, loading } = useConvexSignedIn();
  const belowLg = useBelowLg();
  const { drafts, activeDraftId, activeNote, isLoading, switchDraft, updateEntryDraft } = useInsightBuilder();
  const { openReadingEntry } = useJournalEntryActions();
  const device = useDeviceStudy();
  const cloudJournal = useQuery(api.insights.listMyJournal, ready ? {} : "skip") as JournalEntry[] | undefined;
  const journal = useMemo(() => user ? cloudJournal : device.loaded ? deviceJournal(device.data) : undefined, [user, cloudJournal, device.loaded, device.data]);
  const readingLog = useMyReadingLog() as ReadingLogRow[] | undefined;
  const goals = useQuery(api.users.getJournalGoals, ready ? {} : "skip");
  const saveGoals = useMutation(api.users.saveJournalGoals);

  const [today, setToday] = useState(() => localDateKey());
  // Goals follow the local day even when the journal stays open across midnight or a week boundary.
  useEffect(() => {
    const refreshDay = () => setToday(localDateKey());
    const timer = window.setInterval(refreshDay, 60_000);
    document.addEventListener("visibilitychange", refreshDay);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshDay);
    };
  }, []);
  const [viewState, setViewState] = useState<JournalViewState>(null);
  // The selected day's New note shows the unsaved entry under it until it is saved or closed.
  const [composing, setComposing] = useState(false);
  const [reflectionPrompt, setReflectionPrompt] = useState<string | null>(null);
  const [openingReading, setOpeningReading] = useState(false);
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
  const go = useJournalHistory(view, { enabled: (ready || !user && device.loaded) && !isLoading, show: setViewState, select: selectFromHistory });
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
      // A reading that belongs to an entry is that entry, which the journal already lists: counted and shown once.
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
  // A deleted note closes like the X would, stepping back off its history entry, but only if it is still in
  // view: the calendar, a day or another note chosen while it was being deleted stays as it is.
  const onNoteDeleted = useCallback((noteId: string) => act({ type: "noteDeleted", noteId }), [act]);

  // A personal note for the day (it is written on this page, so there is no reading source to claim); an unsaved
  // entry that already holds something is kept as it is.
  const onNewNote = useCallback(
    (journalDate: string, prompt?: string) => {
      setCreateError(null);
      setReflectionPrompt(prompt ?? null);
      updateEntryDraft((draft) => restartEntryDraft(draft, { journalDate, source: null }));
      setComposing(true);
      act({ type: "selectDate", date: journalDate });
    },
    [updateEntryDraft, act]
  );
  // An untouched entry moves with the selected day.
  useEffect(() => {
    if (composing) updateEntryDraft((draft) => restartEntryDraft(draft, { journalDate: selectedDate, source: null }));
  }, [composing, selectedDate, updateEntryDraft]);

  const onEntrySaved = useCallback(
    (noteId: string, journalDate: string) => {
      setComposing(false);
      // The new entry is the provider's active note; show it, whatever is in view by now.
      go({ stage: "note", date: journalDate, noteId });
    },
    [go]
  );

  // The first opening makes the reading an editable entry (once, on the server), then it opens like any note.
  const onOpenReading = useCallback(
    async (entry: JournalReadingEntry) => {
      if (openingReading) return;
      setOpeningReading(true);
      setCreateError(null);
      try {
        const { id } = await openReadingEntry(entry.id);
        onOpenNote(String(id), entry.journal_date);
      } catch {
        setCreateError("This reading couldn't be opened. Check your connection and try again.");
      } finally {
        setOpeningReading(false);
      }
    },
    [openingReading, openReadingEntry, onOpenNote]
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

  // Signed in, but Convex finished without accepting the session (offline, or the token was refused).
  if (user && !ready) {
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
      onDeleted={onNoteDeleted}
      onDateChange={(date) => onOpenNote(openNote.id, date)}
      readingOptions={logOptions}
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
  const dayActions = composing ? (
    <section aria-label="New entry" className="panel-card rounded-[1.25rem] p-4">
      {reflectionPrompt ? <p className="mb-4 font-serif text-lg text-[color:var(--foreground-muted)]">{reflectionPrompt}</p> : null}
      <JournalEntryComposer
        options={logOptions}
        autoFocus={!belowLg}
        onSaved={onEntrySaved}
        heading={
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-extrabold tracking-[-0.02em]">New entry</h3>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="surface-button inline-flex h-11 items-center rounded-full border-2 px-4 text-sm font-semibold lg:h-9"
            >
              Close
            </button>
          </div>
        }
      />
      <p className="mt-2 text-xs text-[color:var(--foreground-muted)]">Closing keeps what you wrote here until you save it.</p>
    </section>
  ) : null;

  return (
    <>
    <DeviceSyncStatus />
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
      onOpenReading={(entry) => void onOpenReading(entry)}
      onCloseNote={onCloseNote}
      onShowCalendar={onShowCalendar}
      onNewNote={onNewNote}
      createError={createError}
      notePane={notePane}
      headerAccessory={<AccountControl variant="page" />}
      dayActions={dayActions}
      goalControls={user
        ? { goals: goals ?? DEFAULT_JOURNAL_GOALS, loading: goals === undefined, onSave: saveGoals }
        : { goals: device.data.journalGoals ?? DEFAULT_JOURNAL_GOALS, loading: !device.loaded,
            saveErrorMessage: "Your goals couldn't be saved on this device. Your changes are still here. Allow browser storage or free some space and try again.",
            onSave: async targets => deviceStudy.saveJournalGoals(targets) }}
    />
    </>
  );
}
