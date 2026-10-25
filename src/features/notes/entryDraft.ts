// The unsaved journal entry behind Log and New note: note text, the source it is linked to, whether it also logs
// reading of that source, and its day. Nothing is stored until it is saved, as one entry, by
// insights:createJournalEntry. Its request id lasts for the draft's lifetime, so every retry of a save whose result
// was lost names the same entry. Pure functions; the provider holds the draft so it survives closing the panel.

import { isSafeSourceHref, localDateKey, newRequestId, type NoteSource } from "./journal";

export type EntryDraft = {
  requestId: string;
  text: string;
  /** What the entry is linked to (and, with logReading, what was read); null for a personal note. */
  source: NoteSource | null;
  logReading: boolean;
  journalDate: string;
  /** The person changed the reading or day themselves. */
  edited: boolean;
};

/** Why the draft can't be saved yet (nothing was sent). */
export class EntryDraftProblem extends Error {}

/** A save whose entry had been deleted elsewhere meanwhile: the draft is kept, to be saved again as a new entry. */
export type EntryDraftSaveResult = { id: string } | { id: null; deleted: true };

export type EntryDefaults = { source?: NoteSource | null; logReading?: boolean; journalDate?: string };

const JOURNAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function freshEntryDraft(defaults: EntryDefaults = {}): EntryDraft {
  const source = defaults.source ?? null;
  return {
    requestId: newRequestId(),
    text: "",
    source,
    logReading: !!source && !!defaults.logReading,
    journalDate: defaults.journalDate ?? localDateKey(),
    edited: false,
  };
}

/** Nothing typed or chosen yet: it may be replaced or follow the page without losing anything. */
export function isPristineEntry(draft: EntryDraft): boolean {
  return draft.text === "" && !draft.edited;
}

/**
 * Opening Log or New note starts from the page's defaults, unless the draft already holds something, which is kept
 * (with its request id) so closing and reopening never loses text.
 */
export function restartEntryDraft(draft: EntryDraft, defaults: EntryDefaults): EntryDraft {
  if (!isPristineEntry(draft)) return draft;
  const next = freshEntryDraft(defaults);
  return { ...next, requestId: draft.requestId };
}

/**
 * An untouched draft follows the page in view (navigating with the panel open), keeping a reading choice the page
 * made; one with content, or a reading the person chose, stays put. The same page with another query or hash is
 * not a move.
 */
export function followEntrySource(draft: EntryDraft, source: NoteSource | null): EntryDraft {
  if (!isPristineEntry(draft) || !source) return draft;
  if (draft.source && sourcePage(draft.source) === sourcePage(source)) return draft;
  return { ...draft, source };
}

function sourcePage(source: NoteSource): string {
  return `${source.kind}|${source.href.split(/[?#]/)[0]}`;
}

/** Why the draft can't be saved yet, or null. */
export function entryDraftProblem(draft: EntryDraft): string | null {
  if (!draft.logReading && !draft.text.trim()) return "Write a note or log your reading first.";
  if (!JOURNAL_DATE.test(draft.journalDate)) return "Choose a day for this entry.";
  if (draft.logReading && !draft.source) return "Choose what you read.";
  return null;
}

/** insights:createJournalEntry's arguments for the draft. */
export function entryDraftInput(draft: EntryDraft) {
  return {
    journalDate: draft.journalDate,
    source: draft.source ?? undefined,
    markdownBody: draft.text,
    logReading: draft.logReading,
    requestId: draft.requestId,
  };
}

/**
 * A source naming the page in view takes the page's live query (a translation, say), without its hash: a chapter
 * reading links to the chapter. Sources for other pages are left alone.
 */
export function withLiveHref(source: NoteSource, location: { pathname: string; search: string }): NoteSource {
  if (source.href.split(/[?#]/)[0] !== location.pathname) return source;
  const href = `${location.pathname}${location.search}`;
  return isSafeSourceHref(href) ? { ...source, href } : source;
}
