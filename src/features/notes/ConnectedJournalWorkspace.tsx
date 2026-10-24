"use client";

// The /notes page's adapter: the signed-in user's real journal, reading history and active note, fed into
// the presentational JournalWorkspace. Notes are created and opened through InsightBuilderProvider so the
// reader's sidebar and this page always agree on which note is current.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { SignInButton } from "@clerk/nextjs";
import { api } from "../../../convex/_generated/api";
import AccountControl from "@/components/AccountControl";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { useMyReadingLog } from "@/features/plans/useReadingProgress";
import JournalWorkspace from "./JournalWorkspace";
import JournalNoteEditor from "./JournalNoteEditor";
import ReadingLogButton, { type ReadingLogOption } from "./ReadingLogButton";
import {
  localDateKey,
  readingEntryFromRow,
  type JournalEntry,
  type NoteSource,
  type ReadingLogRow,
} from "./journal";
import { useBelowLg } from "./useBelowLg";
import { useConvexSignedIn } from "./useConvexSignedIn";

const MAX_LOG_CHOICES = 8;

function sourceKey(source: NoteSource) {
  return `${source.kind}|${source.href}|${source.label}`;
}

export default function ConnectedJournalWorkspace() {
  const { user, ready, loading } = useConvexSignedIn();
  const belowLg = useBelowLg();
  const { drafts, activeDraftId, activeNote, isLoading, switchDraft, createJournalNote } = useInsightBuilder();
  const journal = useQuery(api.insights.listMyJournal, ready ? {} : "skip") as JournalEntry[] | undefined;
  const readingLog = useMyReadingLog() as ReadingLogRow[] | undefined;

  const [today] = useState(() => localDateKey());
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Arriving from the reader's sidebar opens on the current note's own day.
  const activeSummaryDate = useMemo(() => {
    const row = drafts.find((draft) => draft.id === activeDraftId) as { journal_date?: string } | undefined;
    return row?.journal_date ?? null;
  }, [drafts, activeDraftId]);
  const selectedDate = chosenDate ?? activeSummaryDate ?? today;

  // The server's label for the signed-in user, as it appears on their own notes; else their account name.
  const viewerLabel = useMemo(() => {
    const own = journal?.find((entry) => entry.kind === "note");
    if (own && own.kind === "note" && own.author_label) return own.author_label;
    return user?.fullName || user?.email || "You";
  }, [journal, user?.fullName, user?.email]);

  const entries = useMemo<JournalEntry[]>(
    () => [
      ...(journal ?? []).filter((entry) => entry.kind !== "reading"),
      ...(readingLog ?? []).map((row) => readingEntryFromRow(row, viewerLabel)),
    ],
    [journal, readingLog, viewerLabel]
  );

  // The open note is shown only on its own day; choosing another day never leaves it in view.
  const openNote = activeNote && activeNote.journal_date === selectedDate ? activeNote : null;
  const openNoteLoading = !openNote && !!activeDraftId && isLoading && activeSummaryDate === selectedDate;

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
      setChosenDate(journalDate);
      if (noteId !== activeDraftId) void switchDraft(noteId);
    },
    [activeDraftId, switchDraft]
  );

  const onNewNote = useCallback(
    async (journalDate: string) => {
      setCreating(true);
      setCreateError(null);
      try {
        // Written on the Notes page itself, so there is no reading source to claim.
        await createJournalNote({ journalDate, source: null });
        setChosenDate(journalDate);
      } catch (error) {
        setCreateError(error instanceof Error && error.message ? error.message : "The note could not be created.");
      } finally {
        setCreating(false);
      }
    },
    [createJournalNote]
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
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">Sign in to use Notes</h1>
            <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">
              Your notes are kept as a private journal, by day, linked to the chapters and guides you wrote them from.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/browse" className="surface-button inline-flex h-10 items-center rounded-full border-2 px-4 text-sm">
              Browse scriptures
            </Link>
            <SignInButton mode="modal">
              <button className="inline-flex h-10 items-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-button-active)] px-4 text-sm font-bold text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)]">
                Sign in
              </button>
            </SignInButton>
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
    <JournalNoteEditor key={openNote.id} note={openNote} authorLabel={authorLabel} />
  ) : openNoteLoading ? (
    <p role="status" className="text-sm text-[color:var(--foreground-muted)]">
      Loading note…
    </p>
  ) : null;

  const historyLoaded = journal !== undefined && readingLog !== undefined;
  const dayActions = !historyLoaded ? null : logOptions.length > 0 ? (
    <ReadingLogButton
      key={selectedDate}
      options={logOptions}
      defaultDate={selectedDate}
      onLogged={setChosenDate}
    />
  ) : (
    <span className="text-xs text-[color:var(--foreground-muted)]">
      Log reading from{" "}
      <Link href="/browse" className="font-semibold underline underline-offset-2">
        Browse
      </Link>{" "}
      or{" "}
      <Link href="/come-follow-me" className="font-semibold underline underline-offset-2">
        Come, Follow Me
      </Link>
    </span>
  );

  return (
    <JournalWorkspace
      layout={belowLg ? "phone" : "desktop"}
      status={historyLoaded ? "ready" : "loading"}
      entries={entries}
      today={today}
      selectedDate={selectedDate}
      onSelectDate={setChosenDate}
      selectedKey={openNote ? `note:${openNote.id}` : null}
      onOpenNote={onOpenNote}
      onNewNote={(journalDate) => void onNewNote(journalDate)}
      creating={creating}
      createError={createError}
      notePane={notePane}
      headerAccessory={<AccountControl variant="page" />}
      dayActions={dayActions}
    />
  );
}
