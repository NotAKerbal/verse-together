// The unsaved new journal entry, kept on this device for its study's owner (the web keeps it in its provider,
// useEntryDraftStore.ts, so closing the composer never loses text; the app also outlives being killed or restarted).
// One draft per owner: this device's own study when signed out, each account by its id. A draft is only ever read
// back for the owner it was written for, so another account (or the signed-out study) never sees it, and a session
// whose owner isn't known yet ("blocked") has no draft at all.
//
// The draft keeps its request id for its whole life, so saving it again after a save whose outcome was lost (the
// app was closed between creating the entry and forgetting the draft) names the same entry instead of a second one.

import { accountNote } from "../../storage/accountStudy";
import { readJson, storage } from "../../storage/kv";
import { getStudySession, type StudySession } from "../../storage/studySession";
import { deviceStudy } from "../../storage/study";
import type { NoteSource } from "../../shared/web";

export const ENTRY_DRAFT_PREFIX = "vt_journal_entry_draft_v1:";

export type EntryRange = { start: number; end: number };

export type StoredEntryDraft = {
  version: 1;
  requestId: string;
  text: string;
  /** What the entry is linked to (and, with `reading`, what was read); null for a personal note. */
  source: NoteSource | null;
  reading: boolean;
  journalDate: string;
  /** The verses chosen for a logged scripture reading; null for the whole chapter. */
  range: EntryRange | null;
  /** The person changed the reading, range or day themselves. */
  edited: boolean;
  prompt?: string;
  verseCount?: number;
  updatedAt: string;
};

export type EntryDraftFields = Omit<StoredEntryDraft, "version" | "updatedAt">;

const JOURNAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whose draft the session shows: "device", "account:<id>", or null while the owner isn't known. */
export function draftOwner(session: StudySession = getStudySession()): string | null {
  if (session.mode === "device") return "device";
  if (session.mode === "account") return `account:${session.owner}`;
  return null;
}

function key(owner: string) {
  return `${ENTRY_DRAFT_PREFIX}${owner}`;
}

/** Something the person wrote or chose that would be lost: text, or a reading, range or day they set. */
export function isRecoverable(draft: Pick<StoredEntryDraft, "text" | "edited">): boolean {
  return draft.text.trim() !== "" || draft.edited;
}

function validSource(value: unknown): value is NoteSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<NoteSource>;
  return (
    typeof source.kind === "string" &&
    typeof source.label === "string" &&
    typeof source.href === "string" &&
    source.href.startsWith("/") &&
    !source.href.startsWith("//")
  );
}

function validRange(value: unknown): value is EntryRange | null {
  if (value === null) return true;
  const range = value as Partial<EntryRange> | undefined;
  return !!range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start! >= 1 && range.end! >= range.start!;
}

/** The owner's stored draft, or null when there is none (or it can't be read back as one). */
export function readEntryDraft(owner: string | null): StoredEntryDraft | null {
  if (!owner) return null;
  const value = readJson<Partial<StoredEntryDraft> | null>(key(owner), null);
  if (!value || value.version !== 1) return null;
  if (typeof value.requestId !== "string" || !value.requestId || typeof value.text !== "string") return null;
  if (typeof value.journalDate !== "string" || !JOURNAL_DATE.test(value.journalDate)) return null;
  if (value.source !== null && !validSource(value.source)) return null;
  if (!validRange(value.range ?? null)) return null;
  return {
    version: 1,
    requestId: value.requestId,
    text: value.text,
    source: value.source ?? null,
    reading: value.reading === true && !!value.source,
    journalDate: value.journalDate,
    range: value.range ?? null,
    edited: value.edited === true,
    prompt: typeof value.prompt === "string" ? value.prompt : undefined,
    verseCount: typeof value.verseCount === "number" ? value.verseCount : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * Keeps the draft for `owner` (or forgets it once nothing in it would be lost). Throws when storage refused the
 * write, so the editor can say the draft isn't kept rather than imply it is.
 */
export function writeEntryDraft(owner: string, draft: EntryDraftFields) {
  if (!isRecoverable(draft)) {
    clearEntryDraft(owner);
    return;
  }
  const stored: StoredEntryDraft = { version: 1, ...draft, updatedAt: new Date().toISOString() };
  storage().setItem(key(owner), JSON.stringify(stored));
}

export function clearEntryDraft(owner: string | null) {
  if (!owner) return;
  try {
    storage().removeItem(key(owner));
  } catch {}
}

/** An account's draft leaves the device (for the account provider when the account itself is deleted). */
export function forgetAccountEntryDraft(accountId: string) {
  clearEntryDraft(`account:${accountId}`);
}

/**
 * The entry a draft's request id already made in the session's study, or null. A draft is forgotten as soon as its
 * entry is saved, so one found here was saved just before the app stopped: it is not offered again.
 */
export function savedEntryFor(requestId: string, session: StudySession = getStudySession()): string | null {
  if (session.mode === "device") {
    const id = `device-${requestId}`;
    return deviceStudy.getSnapshot().notes.some((note) => note.id === id && note.owner === null) ? id : null;
  }
  if (session.mode === "account") {
    const view = accountNote(session.store.getSnapshot(), `pending-${requestId}`);
    return view ? view.id : null;
  }
  return null;
}
