// The Journal's data and writes, whoever's study is shown (studySession.ts): this device's study when signed out,
// the signed-in account's otherwise (its cache with unsynced changes applied, accountStudy.ts). The screens use only
// this, so the same calendar, day view, search, editor and reader marks work for both and never mix them.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { copySummary, readLedger } from "../account/guestCopy";
import {
  DEFAULT_JOURNAL_GOALS,
  RevisionConflictError,
  deviceJournal,
  journalGoalsProblem,
  type JournalEntry,
  type JournalGoals,
  type JournalNoteDocument,
  type JournalReadingEntry,
  type NoteSource,
} from "../shared/web";
import { accountJournal, accountNote, accountNoteBodies, syncSummary, type AccountSnapshot, type AccountStudyStore, type NoteSync, type SyncSummary } from "./accountStudy";
import { storage } from "./kv";
import { NOT_CONNECTED_MESSAGE, OFFLINE_WRITE_MESSAGE, getStudySession, useStudySession, type StudyMode, type StudySession } from "./studySession";
import { deviceStudy, useDeviceStudy } from "./study";

const noSubscribe = () => () => {};
const noSnapshot = () => null;

/** The account store's snapshot, or null when the device's study is shown. */
export function useAccountSnapshot(session: StudySession = getStudySession()): AccountSnapshot | null {
  const store = session.mode === "account" ? session.store : null;
  return useSyncExternalStore(store ? store.subscribe : noSubscribe, store ? store.getSnapshot : noSnapshot, store ? store.getSnapshot : noSnapshot);
}

/** Whether the account's Convex connection is up (null when there is no connection to have). */
export function useAccountOnline(session: StudySession): boolean | null {
  const sync = session.mode === "account" ? session.sync : null;
  const subscribe = useCallback((listener: () => void) => (sync ? sync.subscribeConnection(listener) : () => {}), [sync]);
  const read = useCallback(() => (sync ? sync.connected() : null), [sync]);
  return useSyncExternalStore(subscribe, read, read);
}

export type JournalData = {
  mode: StudyMode;
  /** "loading" until the account's journal has loaded once (cached journals show at once, also offline). */
  status: "ready" | "loading" | "unavailable";
  entries: JournalEntry[];
  /** Full note text by entry id, for search. */
  bodies: ReadonlyMap<string, string>;
  goals: JournalGoals;
  /** Signed in: study on this device that isn't in this account (shown again after signing out). */
  deviceOnly: number;
  sync: SyncSummary | null;
  /** Signed in: whether the account is connected now (null signed out, or before the session is verified). */
  online: boolean | null;
};

export function useJournalData(): JournalData {
  const session = useStudySession();
  const study = useDeviceStudy();
  const snapshot = useAccountSnapshot(session);
  const online = useAccountOnline(session);
  const owner = session.mode === "account" ? session.owner : null;
  return useMemo<JournalData>(() => {
    if (session.mode === "device") {
      return {
        mode: "device",
        status: "ready",
        entries: deviceJournal(study),
        bodies: new Map(study.notes.filter((note) => note.owner === null).map((note) => [note.id, note.markdown_body ?? ""])),
        goals: study.journalGoals ?? DEFAULT_JOURNAL_GOALS,
        deviceOnly: 0,
        sync: null,
        online: null,
      };
    }
    let deviceOnly = 0;
    if (owner) {
      try {
        deviceOnly = copySummary(study, readLedger(storage()), owner).toCopy;
      } catch {}
    }
    if (session.mode === "blocked" || !snapshot) {
      return { mode: session.mode, status: "unavailable", entries: [], bodies: new Map(), goals: DEFAULT_JOURNAL_GOALS, deviceOnly, sync: null, online: null };
    }
    const entries = accountJournal(snapshot);
    return {
      mode: "account",
      status: entries ? "ready" : snapshot.syncError ? "unavailable" : online === false || !session.sync ? "unavailable" : "loading",
      entries: entries ?? [],
      bodies: accountNoteBodies(snapshot),
      goals: snapshot.cache.goals ?? DEFAULT_JOURNAL_GOALS,
      deviceOnly,
      sync: syncSummary(snapshot),
      online: session.sync ? online : null,
    };
  }, [session, study, snapshot, online, owner]);
}

/** A note as the editor opens it: its text and the revision an edit of that text is based on. */
export type EditableNote = Pick<JournalNoteDocument, "id" | "title" | "markdown_body" | "journal_date" | "source" | "created_at" | "updated_at"> & {
  reading_at: string | null;
  /** The revision `markdown_body` is based on (device: the stored revision). */
  revision: number;
};

export type JournalNoteState =
  | { status: "ready"; note: EditableNote; mode: StudyMode; sync: NoteSync | null; deleting: boolean }
  | { status: "loading" | "missing" | "unavailable"; note: null; mode: StudyMode; sync: null; deleting: false };

export function useJournalNote(id: string): JournalNoteState {
  const session = useStudySession();
  const study = useDeviceStudy();
  const snapshot = useAccountSnapshot(session);
  const online = useAccountOnline(session);
  return useMemo<JournalNoteState>(() => {
    if (session.mode === "device") {
      const note = study.notes.find((row) => row.id === id && row.owner === null);
      if (!note) return { status: "missing", note: null, mode: "device", sync: null, deleting: false };
      return {
        status: "ready",
        mode: "device",
        sync: null,
        deleting: false,
        note: {
          id: note.id,
          title: note.title,
          markdown_body: note.markdown_body ?? "",
          revision: note.markdown_revision ?? 0,
          journal_date: note.journal_date!,
          source: note.source ?? null,
          reading_at: note.reading_at ?? null,
          created_at: note.created_at,
          updated_at: note.updated_at,
        },
      };
    }
    if (session.mode === "blocked" || !snapshot) return { status: "unavailable", note: null, mode: session.mode, sync: null, deleting: false };
    const view = accountNote(snapshot, id);
    if (!view) {
      const loaded = snapshot.cache.journal !== null;
      return { status: loaded ? "missing" : online && session.sync ? "loading" : "unavailable", note: null, mode: "account", sync: null, deleting: false };
    }
    if (!view.doc) return { status: online && session.sync && !snapshot.syncError ? "loading" : "unavailable", note: null, mode: "account", sync: null, deleting: false };
    const doc = view.doc;
    return {
      status: "ready",
      mode: "account",
      sync: view.sync,
      deleting: view.deleting,
      note: {
        id: view.id,
        title: doc.title,
        markdown_body: doc.markdown_body,
        revision: view.baseRevision,
        journal_date: doc.journal_date,
        source: doc.source,
        reading_at: doc.reading_at ?? null,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      },
    };
  }, [session, study, snapshot, online, id]);
}

type Writer = { mode: "device" } | { mode: "account"; store: AccountStudyStore; kick: () => void };

function writer(): Writer {
  const session = getStudySession();
  if (session.mode === "device") return { mode: "device" };
  if (session.mode === "blocked") throw new Error(session.reason === "deletion-pending" ? "Finish deleting your account in Settings, or sign out." : NOT_CONNECTED_MESSAGE);
  return { mode: "account", store: session.store, kick: () => session.sync?.kick() };
}

export type NewEntry = { requestId: string; markdownBody: string; journalDate: string; source: NoteSource | null; logReading: boolean };

/**
 * Journal writes. Each is synchronous and throws when nothing was saved: on this device it is the device store's
 * write; signed in, the change is saved in the account's outbox on this device and sent when connected.
 */
export const journalStudy = {
  create(input: NewEntry): { id: string } {
    const target = writer();
    if (target.mode === "device") {
      return deviceStudy.createNote({
        requestId: input.requestId,
        markdownBody: input.markdownBody,
        journalDate: input.journalDate,
        source: input.source ?? undefined,
        logReading: input.logReading,
      });
    }
    const created = target.store.enqueueCreate(input);
    target.kick();
    return created;
  },
  /** Saves text written on `baseRevision`. Device: returns the new revision (throws RevisionConflictError). */
  save(id: string, text: string, baseRevision: number): { revision: number | null } {
    const target = writer();
    if (target.mode === "device") return { revision: deviceStudy.saveNote(id, text, baseRevision).markdownRevision };
    target.store.enqueueSave(id, text, baseRevision);
    target.kick();
    return { revision: null };
  },
  setReading(id: string, reading: { source: NoteSource; journalDate: string } | null, currentText: string) {
    const target = writer();
    if (target.mode === "device") return deviceStudy.setReading(id, reading);
    target.store.enqueueReading(id, reading, currentText);
    target.kick();
  },
  remove(id: string) {
    const target = writer();
    if (target.mode === "device") return deviceStudy.remove("notes", id);
    target.store.enqueueDelete(id);
    target.kick();
  },
  /** After a conflict, the owner's choice. "saveAsNew" returns the new entry's id to open. */
  resolve(opId: string, choice: "keepMine" | "useTheirs" | "saveAsNew"): string | null {
    const target = writer();
    if (target.mode === "device") return null;
    target.store.resolve(opId, choice);
    target.kick();
    return choice === "saveAsNew" ? target.store.latestLocalId() : null;
  },
  retry() {
    const target = writer();
    if (target.mode === "device") return;
    target.store.retryAll();
    target.kick();
  },
  /** Opens an older logged reading as an editable entry (online: the account makes the entry). */
  async openReading(entry: JournalReadingEntry): Promise<string> {
    const session = getStudySession();
    if (session.mode !== "account") throw new Error(NOT_CONNECTED_MESSAGE);
    if (!session.sync) throw new Error(OFFLINE_WRITE_MESSAGE);
    const result = await session.sync.call<{ id: string }>("openReadingEntry", { readingId: entry.id });
    return String(result.id);
  },
  async saveGoals(goals: JournalGoals): Promise<void> {
    const problem = journalGoalsProblem(goals);
    if (problem) throw new Error(problem);
    const session = getStudySession();
    if (session.mode === "device") return deviceStudy.saveJournalGoals(goals);
    if (session.mode !== "account") throw new Error(NOT_CONNECTED_MESSAGE);
    if (!session.sync) throw new Error(OFFLINE_WRITE_MESSAGE);
    await session.sync.call("saveJournalGoals", { studyDays: goals.studyDays, reflections: goals.reflections });
    const now = getStudySession();
    if (now.mode === "account" && now.store === session.store) session.store.setGoals(goals);
  },
};

export { RevisionConflictError };
