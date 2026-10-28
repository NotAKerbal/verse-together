// What a new journal entry starts with when it is opened from somewhere (the reader's Log, a verse selection's
// Add to journal, a lesson's Add note, the journal's Write a reflection). Nothing is stored until Save entry.

import type { NoteSource } from "../../shared/web";

export type DraftIntent = {
  source: NoteSource | null;
  body: string;
  /** Log reading of the source with the entry. */
  reading: boolean;
  journalDate?: string;
  /** A reflection prompt shown above the writer. */
  prompt?: string;
  /** Verses the source's chapter has, for the reading range choice. */
  verseCount?: number;
};

let pending: DraftIntent | null = null;

export function setDraftIntent(intent: DraftIntent) {
  pending = intent;
}

/** The intent for the composer being opened, once. */
export function takeDraftIntent(): DraftIntent | null {
  const intent = pending;
  pending = null;
  return intent;
}

export function peekDraftIntent(): DraftIntent | null {
  return pending;
}
