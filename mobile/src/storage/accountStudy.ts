// One signed-in account's study on this device: a read cache of what the account holds (its journal, the full text
// of its notes, reading log, goals, and the verse and guide annotations of chapters and guides opened here) and an
// outbox of changes made in the app that the account hasn't confirmed yet. Both are kept in SQLite under keys that
// name the account, so nothing of one account is ever read, shown or sent as another's, and both survive a restart.
//
// The outbox follows the web's journalOutbox.ts rules, persisted: every note save names the revision its text was
// based on, so a note changed on the website meanwhile is never overwritten; the save stops in "conflict" with the
// app's text kept until its owner chooses. A new entry keeps its request id, so retrying a create whose reply was
// lost names the same entry (insights:createJournalEntry is idempotent by request id). Verse notes keep the state
// they were edited from, and are merged field by field on sending (studySync.ts): a field the website changed too
// is a conflict, never overwritten.
//
// The screens read the account through the overlay functions at the end: the cache with the outbox applied, so a
// change shows at once and stays shown offline.

import {
  DEFAULT_UNDERLINE_COLOR,
  annotationChapter,
  applyVerseMarks,
  annotationProblem,
  deriveNoteTitle,
  markdownExcerpt,
  newRequestId,
  normalizeAnnotationBody,
  readingEntryFromRow,
  verseMarksProblem,
  NOTE_MARKDOWN_MAX,
  type AnnotationChapter,
  type AnnotationVerse,
  type GuideHighlight,
  type JournalAnnotationEntry,
  type JournalEntry,
  type JournalGoals,
  type JournalNoteDocument,
  type JournalNoteEntry,
  type MarkColor,
  type NoteSource,
  type ReadingLogRow,
  type VerseAnnotation,
  type VerseMarksPatch,
  type VerseTextMark,
} from "../shared/web";
import { storage, type StoragePort } from "./kv";

export const ACCOUNT_CACHE_PREFIX = "vt_account_study_v1:";
export const ACCOUNT_NOTE_PREFIX = "vt_account_note_v1:";
export const ACCOUNT_OUTBOX_PREFIX = "vt_account_outbox_v1:";
/** The account this device's saved session was last verified as (with that session's fingerprint), so its study shows (and queues) while offline. */
export const LAST_OWNER_KEY = "vt_account_last_owner_v1";

export type JournalRow = JournalNoteEntry | JournalAnnotationEntry;

/** A verse's own annotation, as the merge on sending compares it. */
export type VerseState = { id: string | null; body: string; highlightColor: MarkColor | null; underlineColor: MarkColor | null };

export type Conflict =
  /** The note changed in the account since the app's text was based on it. */
  | { kind: "revision"; serverRevision: number | null; serverText: string | null }
  /** The note is no longer in the account (deleted on the website or another device). */
  | { kind: "missing" }
  /** A new entry's create was refused: the entry it made was edited elsewhere since (ENTRY_CONFLICT). */
  | { kind: "entry"; id: string; journalDate: string }
  /** A verse's note or marks changed in the account, in a field the app changed too. */
  | { kind: "verse"; server: VerseState | null };

type OpBase = {
  opId: string;
  status: "pending" | "error" | "conflict";
  error: string | null;
  attempts: number;
  /** When an op that failed may be tried again (epoch ms). */
  retryAt: number | null;
  conflict: Conflict | null;
};

export type CreateOp = OpBase & {
  kind: "create";
  /** The id the app shows until the account names the entry. */
  localId: string;
  requestId: string;
  journalDate: string;
  source: NoteSource | null;
  markdownBody: string;
  logReading: boolean;
  createdAt: string;
  /** Sent at least once: the entry may exist in the account even if no reply came back. */
  sent: boolean;
  /** Deleted in the app after it may already have been created: delete it once its id is known. */
  deleteAfter: boolean;
};
export type SaveOp = OpBase & { kind: "save"; noteId: string; text: string; baseRevision: number };
export type ReadingOp = OpBase & { kind: "reading"; noteId: string; logged: boolean; source: NoteSource | null; journalDate: string };
export type DeleteOp = OpBase & { kind: "delete"; noteId: string };
export type MarksOp = OpBase & { kind: "marks"; chapter: AnnotationChapter; verses: number[]; patch: VerseMarksPatch };
export type VerseNoteOp = OpBase & {
  kind: "verseNote";
  target: AnnotationVerse;
  /** The verse as the editor opened it (null: nothing was saved on it). */
  base: VerseState | null;
  next: { body: string; highlightColor: MarkColor | null; underlineColor: MarkColor | null };
};
export type VerseDeleteOp = OpBase & { kind: "verseDelete"; target: AnnotationVerse; base: VerseState };
export type Op = CreateOp | SaveOp | ReadingOp | DeleteOp | MarksOp | VerseNoteOp | VerseDeleteOp;

export type AccountCache = {
  version: 1;
  journal: JournalRow[] | null;
  readingLog: ReadingLogRow[] | null;
  goalsLoaded: boolean;
  goals: JournalGoals | null;
  /** Notes whose full document is stored (each under its own key). */
  docIds: string[];
  /** The account's own annotations of each chapter opened here, by chapterKey. */
  chapters: Record<string, VerseAnnotation[]>;
  /** The account's annotated spans of each guide opened here. */
  guides: Record<string, GuideHighlight[]>;
};

export type Outbox = { version: 1; ops: Op[]; aliases: Record<string, string> };

export type AccountSnapshot = {
  owner: string;
  loadError: string | null;
  syncError: string | null;
  cache: AccountCache;
  docs: ReadonlyMap<string, JournalNoteDocument>;
  outbox: Outbox;
  /** The op being sent right now, if any (not persisted). */
  sending: string | null;
};

const EMPTY_CACHE: AccountCache = { version: 1, journal: null, readingLog: null, goalsLoaded: false, goals: null, docIds: [], chapters: {}, guides: {} };
const EMPTY_OUTBOX: Outbox = { version: 1, ops: [], aliases: {} };

/** The most recently opened chapters and guides are kept for offline reading; older ones are read again when opened. */
const CHAPTERS_KEPT = 400;
const GUIDES_KEPT = 120;

function recent<T>(entries: Record<string, T>, key: string, value: T, limit: number): Record<string, T> {
  const { [key]: _previous, ...rest } = entries;
  const keys = Object.keys(rest);
  const kept = keys.length >= limit ? Object.fromEntries(keys.slice(keys.length - limit + 1).map((name) => [name, rest[name]])) : rest;
  return { ...kept, [key]: value };
}

export function chapterKey(chapter: AnnotationChapter): string {
  const { volume, book, chapter: number } = annotationChapter(chapter.volume, chapter.book, chapter.chapter);
  return `${volume}/${book}/${number}`;
}

function ownerKey(prefix: string, owner: string) {
  return `${prefix}${encodeURIComponent(owner)}`;
}

function noteKey(owner: string, id: string) {
  return `${ACCOUNT_NOTE_PREFIX}${encodeURIComponent(owner)}:${encodeURIComponent(id)}`;
}

function readJsonFrom<T>(port: StoragePort, key: string): T | null {
  try {
    const raw = port.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function freshOp<K extends Op["kind"]>(kind: K): OpBase & { kind: K } {
  return { kind, opId: `op-${newRequestId()}`, status: "pending", error: null, attempts: 0, retryAt: null, conflict: null };
}

/** The id a note is known by now: a local id becomes the account's id once created (or a newer local id). */
export function resolveAlias(aliases: Record<string, string>, id: string): string {
  let current = id;
  for (let step = 0; step < 8 && aliases[current]; step++) current = aliases[current];
  return current;
}

/** The key that orders an op: changes to one note (or one chapter) are sent in the order they were made. */
export function opKey(op: Op, aliases: Record<string, string>): string {
  switch (op.kind) {
    case "create":
      return `note:${op.localId}`;
    case "save":
    case "reading":
    case "delete":
      return `note:${resolveAlias(aliases, op.noteId)}`;
    case "marks":
      return `chapter:${chapterKey(op.chapter)}`;
    case "verseNote":
    case "verseDelete":
      return `chapter:${chapterKey(op.target)}`;
  }
}

export function verseState(annotation: VerseAnnotation | null | undefined): VerseState | null {
  if (!annotation) return null;
  return {
    id: annotation.id,
    body: annotation.body ?? "",
    highlightColor: annotation.highlight_color ?? null,
    underlineColor: annotation.underline ? (annotation.underline_color ?? DEFAULT_UNDERLINE_COLOR) : null,
  };
}

/**
 * One account's cache and outbox. Writes reach storage before listeners hear of them; an outbox write that fails
 * throws, so the screen that asked for it can say the change wasn't saved. Once purged (sign-out, account deletion,
 * another account), the instance refuses every write: a reply still arriving for it changes nothing.
 */
export class AccountStudyStore {
  private snapshot: AccountSnapshot;
  private listeners = new Set<() => void>();
  disposed = false;

  constructor(
    readonly owner: string,
    private port: () => StoragePort = storage,
  ) {
    const cache = { ...EMPTY_CACHE, ...(readJsonFrom<AccountCache>(port(), ownerKey(ACCOUNT_CACHE_PREFIX, owner)) ?? {}) };
    if (cache.version !== 1 || !Array.isArray(cache.docIds) || !cache.chapters || typeof cache.chapters !== "object" || !cache.guides || typeof cache.guides !== "object" ||
      (cache.journal !== null && !Array.isArray(cache.journal)) || (cache.readingLog !== null && !Array.isArray(cache.readingLog))) Object.assign(cache, EMPTY_CACHE);
    let outbox: Outbox | null = null;
    let loadError: string | null = null;
    try {
      const raw = port().getItem(ownerKey(ACCOUNT_OUTBOX_PREFIX, owner));
      if (raw !== null) {
        outbox = JSON.parse(raw) as Outbox;
        if (!outbox || outbox.version !== 1 || !Array.isArray(outbox.ops) || !outbox.aliases || typeof outbox.aliases !== "object" ||
          !outbox.ops.every((op) => op && typeof op.opId === "string" && ["create", "save", "reading", "delete", "marks", "verseNote", "verseDelete"].includes(op.kind) && ["pending", "error", "conflict"].includes(op.status))) {
          throw new Error("Unreadable outbox");
        }
      }
    } catch {
      // Never replace unreadable unsynced work with an empty queue. Keep the original record for recovery.
      outbox = null;
      loadError = "Your saved account changes couldn't be read. No new changes will be saved or sent. Restart the app; keep this device's data if the problem continues.";
    }
    const docs = new Map<string, JournalNoteDocument>();
    for (const id of cache.docIds) {
      const doc = readJsonFrom<JournalNoteDocument>(port(), noteKey(owner, id));
      if (doc && doc.id === id) docs.set(id, doc);
    }
    this.snapshot = {
      owner,
      loadError,
      syncError: null,
      cache: { ...cache, docIds: [...docs.keys()] },
      docs,
      outbox: outbox?.version === 1 && Array.isArray(outbox.ops) ? { version: 1, ops: outbox.ops, aliases: outbox.aliases ?? {} } : EMPTY_OUTBOX,
      sending: null,
    };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(next: AccountSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  // ---- The read cache (best effort: a cache write that fails keeps the value in memory for this run) ----

  private writeCache(change: (cache: AccountCache) => AccountCache, docs = this.snapshot.docs) {
    if (this.disposed) return;
    const cache = change(this.snapshot.cache);
    try {
      this.port().setItem(ownerKey(ACCOUNT_CACHE_PREFIX, this.owner), JSON.stringify(cache));
    } catch {}
    this.emit({ ...this.snapshot, cache, docs });
  }

  setSyncError(message: string | null) {
    if (!this.disposed && this.snapshot.syncError !== message) this.emit({ ...this.snapshot, syncError: message });
  }

  setJournal(rows: JournalRow[]) {
    this.writeCache((cache) => ({ ...cache, journal: rows }));
  }

  setReadingLog(rows: ReadingLogRow[]) {
    this.writeCache((cache) => ({ ...cache, readingLog: rows }));
  }

  setGoals(goals: JournalGoals | null) {
    this.writeCache((cache) => ({ ...cache, goalsLoaded: true, goals }));
  }

  setChapter(chapter: AnnotationChapter, rows: VerseAnnotation[]) {
    const key = chapterKey(chapter);
    this.writeCache((cache) => ({ ...cache, chapters: recent(cache.chapters, key, rows, CHAPTERS_KEPT) }));
  }

  setGuide(guide: string, rows: GuideHighlight[]) {
    this.writeCache((cache) => ({ ...cache, guides: recent(cache.guides, guide, rows, GUIDES_KEPT) }));
  }

  /**
   * Stores a note's full document unless the one stored is at a later revision. Times aren't compared: this device's
   * clock may differ from the server's.
   */
  putDoc(doc: JournalNoteDocument) {
    if (this.disposed) return;
    const current = this.snapshot.docs.get(doc.id);
    if (current && current.markdown_revision > doc.markdown_revision) return;
    try {
      this.port().setItem(noteKey(this.owner, doc.id), JSON.stringify(doc));
    } catch {}
    const docs = new Map(this.snapshot.docs).set(doc.id, doc);
    this.writeCache((cache) => ({ ...cache, docIds: cache.docIds.includes(doc.id) ? cache.docIds : [...cache.docIds, doc.id] }), docs);
  }

  removeDocs(ids: readonly string[]) {
    if (this.disposed || !ids.length) return;
    const docs = new Map(this.snapshot.docs);
    for (const id of ids) {
      docs.delete(id);
      try {
        this.port().removeItem(noteKey(this.owner, id));
      } catch {}
    }
    const gone = new Set(ids);
    this.writeCache((cache) => ({ ...cache, docIds: cache.docIds.filter((id) => !gone.has(id)) }), docs);
  }

  /** Removes a deleted note from the cached journal and its document. */
  forgetNote(id: string) {
    this.removeDocs([id]);
    this.writeCache((cache) => ({ ...cache, journal: cache.journal?.filter((row) => row.kind !== "note" || row.id !== id) ?? null }));
  }

  /** A note the account has just confirmed, shown at once (the journal subscription replaces it). */
  provisionalEntry(row: JournalNoteEntry) {
    this.writeCache((cache) => {
      const journal = cache.journal ?? [];
      if (journal.some((entry) => entry.kind === "note" && entry.id === row.id)) return cache;
      return { ...cache, journal: [row, ...journal] };
    });
  }

  // ---- The outbox (each change is persisted before it is shown; a failed write throws) ----

  private writeOutbox(change: (outbox: Outbox) => Outbox) {
    if (this.disposed) throw new Error("You signed out, so this change wasn't saved.");
    if (this.snapshot.loadError) throw new Error(this.snapshot.loadError);
    const outbox = change(this.snapshot.outbox);
    if (outbox === this.snapshot.outbox) return;
    this.port().setItem(ownerKey(ACCOUNT_OUTBOX_PREFIX, this.owner), JSON.stringify(outbox));
    this.emit({ ...this.snapshot, outbox });
  }

  private updateOps(change: (ops: Op[]) => Op[]) {
    this.writeOutbox((outbox) => ({ ...outbox, ops: change(outbox.ops) }));
  }

  setSending(opId: string | null) {
    if (this.disposed || this.snapshot.sending === opId) return;
    this.emit({ ...this.snapshot, sending: opId });
  }

  resolveId(id: string) {
    return resolveAlias(this.snapshot.outbox.aliases, id);
  }

  findOp(opId: string) {
    return this.snapshot.outbox.ops.find((op) => op.opId === opId) ?? null;
  }

  replaceOp(opId: string, next: Op | null) {
    this.updateOps((ops) => (next ? ops.map((op) => (op.opId === opId ? next : op)) : ops.filter((op) => op.opId !== opId)));
  }

  /** A new entry, saved here at once and created in the account when connected. */
  enqueueCreate(input: { requestId?: string; markdownBody: string; journalDate: string; source: NoteSource | null; logReading: boolean }): { id: string } {
    if (input.markdownBody.length > NOTE_MARKDOWN_MAX) throw new Error("This note is too long.");
    if (!input.logReading && !input.markdownBody.trim()) throw new Error("Write a note or log reading before saving.");
    const requestId = input.requestId ?? newRequestId();
    const localId = `pending-${requestId}`;
    const existing = this.snapshot.outbox.ops.find((op): op is CreateOp => op.kind === "create" && op.requestId === requestId);
    if (existing) return { id: existing.localId };
    if (this.snapshot.outbox.aliases[localId]) return { id: this.snapshot.outbox.aliases[localId] };
    const op: CreateOp = {
      ...freshOp("create"),
      localId,
      requestId,
      journalDate: input.journalDate,
      source: input.source,
      markdownBody: input.markdownBody,
      logReading: input.logReading,
      createdAt: new Date().toISOString(),
      sent: false,
      deleteAfter: false,
    };
    this.updateOps((ops) => [...ops, op]);
    return { id: localId };
  }

  private pendingCreate(id: string) {
    return this.snapshot.outbox.ops.find((op): op is CreateOp => op.kind === "create" && op.localId === id) ?? null;
  }

  /**
   * Saves a note's text against the revision the editor loaded. A change already waiting for the note keeps its
   * own base (the editor loaded that text), so typing on never moves the base past a change made elsewhere.
   */
  enqueueSave(noteId: string, text: string, baseRevision: number) {
    if (text.length > NOTE_MARKDOWN_MAX) throw new Error("This note is too long.");
    const id = this.resolveId(noteId);
    const create = this.pendingCreate(id);
    if (create) {
      if (!create.logReading && !text.trim()) throw new Error("Add a note or log reading.");
      this.replaceOp(create.opId, { ...create, markdownBody: text });
      return;
    }
    if (this.snapshot.outbox.ops.some((op) => op.kind === "delete" && this.resolveId(op.noteId) === id)) throw new Error("This entry is being deleted.");
    const existing = this.snapshot.outbox.ops.find((op): op is SaveOp => op.kind === "save" && this.resolveId(op.noteId) === id);
    if (existing) {
      if (existing.text !== text) this.replaceOp(existing.opId, { ...existing, text, status: existing.status === "error" ? "pending" : existing.status, retryAt: null });
      return;
    }
    const doc = this.snapshot.docs.get(id);
    if (doc && doc.markdown_body === text && doc.markdown_revision === baseRevision) return;
    this.updateOps((ops) => [...ops, { ...freshOp("save"), noteId: id, text, baseRevision }]);
  }

  enqueueReading(noteId: string, reading: { source: NoteSource; journalDate: string } | null, currentText: string) {
    const id = this.resolveId(noteId);
    if (!reading && !currentText.trim()) throw new Error("Add a note before removing the reading.");
    const create = this.pendingCreate(id);
    if (create) {
      this.replaceOp(create.opId, {
        ...create,
        logReading: !!reading,
        source: reading?.source ?? create.source,
        journalDate: reading?.journalDate ?? create.journalDate,
      });
      return;
    }
    const existing = this.snapshot.outbox.ops.find((op): op is ReadingOp => op.kind === "reading" && this.resolveId(op.noteId) === id);
    const doc = this.snapshot.docs.get(id);
    const next: ReadingOp = {
      ...(existing ?? freshOp("reading")),
      kind: "reading",
      noteId: id,
      logged: !!reading,
      source: reading?.source ?? doc?.source ?? null,
      journalDate: reading?.journalDate ?? doc?.journal_date ?? "",
      status: "pending",
      error: null,
      retryAt: null,
    };
    if (existing) this.replaceOp(existing.opId, next);
    else this.updateOps((ops) => [...ops, next]);
  }

  /** Deletes a note: a create never sent is simply dropped; anything else is deleted in the account. */
  enqueueDelete(noteId: string) {
    const id = this.resolveId(noteId);
    const create = this.pendingCreate(id);
    this.updateOps((ops) => {
      const rest = ops.filter((op) => !((op.kind === "save" || op.kind === "reading") && this.resolveId(op.noteId) === id));
      if (create) {
        return create.sent
          ? rest.map((op) => (op.opId === create.opId ? { ...create, deleteAfter: true, status: create.status === "conflict" ? "pending" : create.status, conflict: null } : op))
          : rest.filter((op) => op.opId !== create.opId);
      }
      if (rest.some((op) => op.kind === "delete" && this.resolveId(op.noteId) === id)) return rest;
      return [...rest, { ...freshOp("delete"), noteId: id }];
    });
  }

  enqueueMarks(chapter: AnnotationChapter, verses: readonly number[], patch: VerseMarksPatch) {
    const unique = Array.from(new Set(verses));
    const problem = verseMarksProblem(unique, patch);
    if (problem) throw new Error(problem);
    const target = annotationChapter(chapter.volume, chapter.book, chapter.chapter);
    this.updateOps((ops) => [...ops, { ...freshOp("marks"), chapter: target, verses: unique, patch }]);
  }

  enqueueVerseNote(target: AnnotationVerse, base: VerseState | null, next: VerseNoteOp["next"]) {
    const verse = { ...annotationChapter(target.volume, target.book, target.chapter), verse: target.verse };
    const current = chapterAnnotations(this.snapshot, verse).get(verse.verse);
    const problem = annotationProblem(next.body, next.highlightColor ?? undefined, next.underlineColor !== null, current?.text_marks);
    if (problem) throw new Error(problem);
    this.updateOps((ops) => [...ops, { ...freshOp("verseNote"), target: verse, base, next }]);
  }

  enqueueVerseDelete(target: AnnotationVerse, base: VerseState) {
    const verse = { ...annotationChapter(target.volume, target.book, target.chapter), verse: target.verse };
    this.updateOps((ops) => [...ops, { ...freshOp("verseDelete"), target: verse, base }]);
  }

  // ---- Outcomes, recorded by the sync engine ----

  markSent(opId: string) {
    const op = this.findOp(opId);
    if (op?.kind === "create" && !op.sent) this.replaceOp(opId, { ...op, sent: true });
  }

  markFailed(opId: string, message: string, now = Date.now()) {
    const op = this.findOp(opId);
    if (!op) return;
    const attempts = op.attempts + 1;
    const delay = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attempts - 1, 6));
    this.replaceOp(opId, { ...op, status: "error", error: message, attempts, retryAt: now + delay });
  }

  markConflict(opId: string, conflict: Conflict) {
    const op = this.findOp(opId);
    if (op) this.replaceOp(opId, { ...op, status: "conflict", conflict, error: null, retryAt: null });
  }

  /** Every failed op is tried again now (Try again). */
  retryAll() {
    if (!this.snapshot.outbox.ops.some((op) => op.status === "error")) return;
    this.updateOps((ops) => ops.map((op) => (op.status === "error" ? { ...op, status: "pending", retryAt: null } : op)));
  }

  /**
   * The account created `create`'s entry as `id` at `revision` (null: unknown, the caller couldn't learn it). Anything
   * changed in the app while the create was on its way becomes a save (against that revision) or a reading change;
   * a delete made meanwhile becomes a delete of the new entry.
   */
  ackCreate(opId: string, sent: Pick<CreateOp, "markdownBody" | "journalDate" | "source" | "logReading">, id: string, revision: number | null) {
    const op = this.findOp(opId);
    if (!op || op.kind !== "create") return;
    const follow: Op[] = [];
    if (op.deleteAfter) follow.push({ ...freshOp("delete"), noteId: id });
    else {
      if (op.markdownBody !== sent.markdownBody) {
        follow.push(
          revision === null
            ? ({ ...freshOp("save"), noteId: id, text: op.markdownBody, baseRevision: 0, status: "conflict", conflict: { kind: "revision", serverRevision: null, serverText: sent.markdownBody } } as SaveOp)
            : { ...freshOp("save"), noteId: id, text: op.markdownBody, baseRevision: revision },
        );
      }
      const sameSource = JSON.stringify(op.source) === JSON.stringify(sent.source);
      if (op.journalDate !== sent.journalDate || op.logReading !== sent.logReading || !sameSource) {
        follow.push({ ...freshOp("reading"), noteId: id, logged: op.logReading, source: op.source, journalDate: op.journalDate });
      }
    }
    this.writeOutbox((outbox) => {
      const ops: Op[] = [];
      for (const item of outbox.ops) {
        if (item.opId === opId) ops.push(...follow);
        else if ((item.kind === "save" || item.kind === "reading" || item.kind === "delete") && item.noteId === op.localId) ops.push({ ...item, noteId: id });
        else ops.push(item);
      }
      return { ...outbox, ops, aliases: { ...outbox.aliases, [op.localId]: id } };
    });
    if (op.deleteAfter) return;
    const now = new Date().toISOString();
    if (revision !== null) {
      this.putDoc({
        id,
        title: deriveNoteTitle(sent.markdownBody),
        status: "draft",
        markdown_body: sent.markdownBody,
        markdown_revision: revision,
        markdown_canonical: true,
        journal_date: sent.journalDate,
        source: sent.source,
        reading_at: sent.logReading ? op.createdAt : null,
        created_at: op.createdAt,
        updated_at: now,
      });
    }
    this.provisionalEntry({
      kind: "note",
      id,
      title: deriveNoteTitle(sent.markdownBody),
      status: "draft",
      journal_date: sent.journalDate,
      source: sent.source,
      excerpt: markdownExcerpt(sent.markdownBody),
      has_reflection: !!sent.markdownBody.trim(),
      markdown_revision: revision ?? 0,
      markdown_canonical: true,
      reading_at: sent.logReading ? op.createdAt : null,
      read_only: false,
      author_label: "You",
      created_at: op.createdAt,
      updated_at: now,
    });
  }

  /** The account saved `text` for `noteId` at `revision`. Text typed meanwhile stays waiting, now on that revision. */
  ackSave(opId: string, text: string, revision: number) {
    const op = this.findOp(opId);
    if (!op || op.kind !== "save") return;
    const doc = this.snapshot.docs.get(op.noteId);
    // The server's own times arrive with the next read of the note.
    if (doc) this.putDoc({ ...doc, markdown_body: text, markdown_revision: revision, title: deriveNoteTitle(text), markdown_canonical: true });
    this.replaceOp(opId, op.text === text ? null : { ...op, baseRevision: revision, status: "pending", attempts: 0, error: null, retryAt: null, conflict: null });
  }

  ackDelete(opId: string) {
    const op = this.findOp(opId);
    if (!op || op.kind !== "delete") return;
    this.replaceOp(opId, null);
    this.forgetNote(op.noteId);
  }

  /** A chapter op the account applied: shown from the cache until the chapter's subscription brings it back. */
  ackChapterOp(opId: string) {
    const op = this.findOp(opId);
    if (!op || (op.kind !== "marks" && op.kind !== "verseNote" && op.kind !== "verseDelete")) return;
    const chapter = op.kind === "marks" ? op.chapter : op.target;
    const key = chapterKey(chapter);
    const rows = [...chapterAnnotations({ ...this.snapshot, outbox: { ...this.snapshot.outbox, ops: [op] } }, chapter).values()];
    this.updateOps((ops) => ops.filter((item) => item.opId !== opId));
    this.writeCache((cache) => ({ ...cache, chapters: { ...cache.chapters, [key]: rows } }));
  }

  /** The owner's choice after a conflict. */
  resolve(opId: string, choice: "keepMine" | "useTheirs" | "saveAsNew") {
    const op = this.findOp(opId);
    if (!op || (op.status !== "conflict" && choice !== "saveAsNew")) return;
    if (choice === "useTheirs") {
      if (op.kind === "create" && op.conflict?.kind === "entry") {
        const target = op.conflict.id;
        this.writeOutbox((outbox) => ({ ...outbox, ops: outbox.ops.filter((item) => item.opId !== opId), aliases: { ...outbox.aliases, [op.localId]: target } }));
        return;
      }
      this.replaceOp(opId, null);
      if (op.conflict?.kind === "missing" && "noteId" in op) this.forgetNote(this.resolveId(op.noteId));
      return;
    }
    if (choice === "keepMine") {
      if (op.kind === "save" && op.conflict?.kind === "revision" && op.conflict.serverRevision !== null) {
        this.replaceOp(opId, { ...op, baseRevision: op.conflict.serverRevision, status: "pending", conflict: null, attempts: 0, retryAt: null });
      } else if ((op.kind === "verseNote" || op.kind === "verseDelete") && op.conflict?.kind === "verse") {
        const server = op.conflict.server;
        if (op.kind === "verseDelete" && !server) this.replaceOp(opId, null);
        else if (op.kind === "verseDelete") this.replaceOp(opId, { ...op, base: server!, status: "pending", conflict: null, attempts: 0, retryAt: null });
        else this.replaceOp(opId, { ...op, base: server, status: "pending", conflict: null, attempts: 0, retryAt: null });
      }
      return;
    }
    // Save as a new entry: the app's text becomes a separate entry; the account's entry stays as it is.
    const text = op.kind === "save" ? op.text : op.kind === "create" ? op.markdownBody : null;
    if (text === null || (!text.trim() && !(op.kind === "create" && op.logReading))) return;
    const doc = op.kind === "save" ? this.snapshot.docs.get(op.noteId) : null;
    const create: CreateOp = {
      ...freshOp("create"),
      localId: "",
      requestId: newRequestId(),
      journalDate: op.kind === "create" ? op.journalDate : (doc?.journal_date ?? new Date().toISOString().slice(0, 10)),
      source: op.kind === "create" ? op.source : (doc?.source ?? null),
      markdownBody: text ?? "",
      logReading: op.kind === "create" ? op.logReading : false,
      createdAt: new Date().toISOString(),
      sent: false,
      deleteAfter: false,
    };
    create.localId = `pending-${create.requestId}`;
    this.writeOutbox((outbox) => ({
      ...outbox,
      ops: [...outbox.ops.filter((item) => item.opId !== opId), create],
      // The old local id now opens the new entry.
      aliases: op.kind === "create" ? { ...outbox.aliases, [op.localId]: create.localId } : outbox.aliases,
    }));
  }

  /** The new local id a conflict's "save as new" made, for reopening it. */
  latestLocalId() {
    const creates = this.snapshot.outbox.ops.filter((op): op is CreateOp => op.kind === "create");
    return creates[creates.length - 1]?.localId ?? null;
  }

  /** Forgets this account's cache (and, unless kept, its outbox) on the device, and stops this instance. */
  purge({ keepOutbox }: { keepOutbox: boolean }) {
    this.disposed = true;
    const port = this.port();
    for (const id of this.snapshot.cache.docIds) {
      try {
        port.removeItem(noteKey(this.owner, id));
      } catch {}
    }
    try {
      port.removeItem(ownerKey(ACCOUNT_CACHE_PREFIX, this.owner));
    } catch {}
    if (!keepOutbox || (!this.snapshot.loadError && this.snapshot.outbox.ops.length === 0)) {
      try {
        port.removeItem(ownerKey(ACCOUNT_OUTBOX_PREFIX, this.owner));
      } catch {}
    }
    this.listeners.clear();
  }
}

// ---- One store per account, for this run of the app ----

const stores = new Map<string, AccountStudyStore>();

export function accountStore(owner: string): AccountStudyStore {
  let store = stores.get(owner);
  if (!store || store.disposed) {
    store = new AccountStudyStore(owner);
    stores.set(owner, store);
  }
  return store;
}

/** Sign-out: the account's cached study leaves the device; changes not yet synced stay, for that account only. */
export function purgeAccountCache(owner: string, { keepOutbox }: { keepOutbox: boolean }) {
  const store = stores.get(owner) ?? new AccountStudyStore(owner);
  store.purge({ keepOutbox });
  stores.delete(owner);
}

/** Changes waiting for `owner` on this device (read without keeping the store open). */
export function unsyncedCount(owner: string): number {
  return accountStore(owner).getSnapshot().outbox.ops.length;
}

/** Tests: forget every open store. */
export function resetAccountStores() {
  stores.clear();
}

type LastOwner = { owner: string; session: string };

function readLastOwnerRecord(port: StoragePort): LastOwner | null {
  try {
    const raw = port.getItem(LAST_OWNER_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<LastOwner>) : null;
    return value && typeof value.owner === "string" && value.owner && typeof value.session === "string" && value.session ? (value as LastOwner) : null;
  } catch {
    return null;
  }
}

/**
 * The account `session` (the stored session's fingerprint, sessionBinding.ts) was last verified as, or null. A record
 * made for any other session (or none) is never returned: a new or unverified session sees no account's study.
 */
export function readLastOwner(session: string | null, port: StoragePort = storage()): string | null {
  if (!session) return null;
  const record = readLastOwnerRecord(port);
  return record && record.session === session ? record.owner : null;
}

/** The account recorded on this device, whichever session it was for (to forget its cache at sign-out). */
export function readRecordedOwner(port: StoragePort = storage()): string | null {
  return readLastOwnerRecord(port)?.owner ?? null;
}

export function writeLastOwner(record: LastOwner | null, port: StoragePort = storage()) {
  try {
    if (record) port.setItem(LAST_OWNER_KEY, JSON.stringify(record));
    else port.removeItem(LAST_OWNER_KEY);
  } catch {}
}

// ---- What the screens show: the cache with the outbox applied ----

function noteEntryFromCreate(op: CreateOp): JournalNoteEntry {
  return {
    kind: "note",
    id: op.localId,
    title: deriveNoteTitle(op.markdownBody),
    status: "draft",
    journal_date: op.journalDate,
    source: op.source,
    excerpt: markdownExcerpt(op.markdownBody),
    has_reflection: !!op.markdownBody.trim(),
    markdown_revision: 0,
    markdown_canonical: true,
    reading_at: op.logReading ? op.createdAt : null,
    read_only: false,
    author_label: "You",
    created_at: op.createdAt,
    updated_at: op.createdAt,
  };
}

function withNoteOps(entry: JournalNoteEntry, save: SaveOp | undefined, reading: ReadingOp | undefined, docReadingAt: string | null | undefined): JournalNoteEntry {
  let next = entry;
  if (save) next = { ...next, title: deriveNoteTitle(save.text), excerpt: markdownExcerpt(save.text), has_reflection: !!save.text.trim() };
  if (reading) {
    next = {
      ...next,
      source: reading.source ?? next.source,
      journal_date: reading.journalDate || next.journal_date,
      reading_at: reading.logged ? (next.reading_at ?? docReadingAt ?? new Date().toISOString()) : null,
    };
  }
  return next;
}

/** The account's journal as the Journal shows it, with changes not yet synced applied. Null before the first load. */
export function accountJournal(snapshot: AccountSnapshot): JournalEntry[] | null {
  const { cache, outbox } = snapshot;
  if (!cache.journal && !outbox.ops.some((op) => op.kind === "create")) return null;
  const resolve = (id: string) => resolveAlias(outbox.aliases, id);
  const saves = new Map<string, SaveOp>();
  const readings = new Map<string, ReadingOp>();
  const deleted = new Set<string>();
  for (const op of outbox.ops) {
    if (op.kind === "save") saves.set(resolve(op.noteId), op);
    else if (op.kind === "reading") readings.set(resolve(op.noteId), op);
    else if (op.kind === "delete") deleted.add(resolve(op.noteId));
  }
  const rows: JournalEntry[] = [];
  for (const row of cache.journal ?? []) {
    if (row.kind !== "note") {
      rows.push(row);
      continue;
    }
    if (deleted.has(row.id)) continue;
    rows.push(withNoteOps(row, saves.get(row.id), readings.get(row.id), snapshot.docs.get(row.id)?.reading_at));
  }
  for (const op of outbox.ops) {
    if (op.kind !== "create" || op.deleteAfter) continue;
    rows.push(noteEntryFromCreate(op));
  }
  // A reading that belongs to an entry is that entry, which the journal already lists.
  for (const row of cache.readingLog ?? []) if (!row.note_id) rows.push(readingEntryFromRow(row, "You"));
  return rows;
}

/** Full note text by id, for searching the journal (stored documents, with unsynced text applied). */
export function accountNoteBodies(snapshot: AccountSnapshot): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const [id, doc] of snapshot.docs) bodies.set(id, doc.markdown_body);
  for (const op of snapshot.outbox.ops) {
    if (op.kind === "save") bodies.set(resolveAlias(snapshot.outbox.aliases, op.noteId), op.text);
    else if (op.kind === "create") bodies.set(op.localId, op.markdownBody);
  }
  return bodies;
}

export type NoteSync =
  | { state: "synced" }
  | { state: "pending" | "sending" }
  | { state: "error"; error: string; opId: string }
  | { state: "conflict"; conflict: Conflict; opId: string; text: string | null };

export type AccountNoteView = {
  /** The id the account (or, until it is created, the app) knows the note by. */
  id: string;
  /** The note as the editor opens it: the stored document with unsynced changes applied. */
  doc: JournalNoteDocument | null;
  /** The revision an edit of `doc.markdown_body` is based on. */
  baseRevision: number;
  listed: boolean;
  deleting: boolean;
  sync: NoteSync;
};

/** One note as the editor shows it; null when it was never on this device and isn't in the account's journal. */
export function accountNote(snapshot: AccountSnapshot, rawId: string): AccountNoteView | null {
  const { outbox } = snapshot;
  // A chain of aliases (created, or a create replaced by "save as new") ends at the newest id.
  const finalId = resolveAlias(outbox.aliases, rawId);
  const ops = outbox.ops.filter((op) =>
    op.kind === "create" ? op.localId === finalId : (op.kind === "save" || op.kind === "reading" || op.kind === "delete") && resolveAlias(outbox.aliases, op.noteId) === finalId,
  );
  const create = ops.find((op): op is CreateOp => op.kind === "create");
  const save = ops.find((op): op is SaveOp => op.kind === "save");
  const reading = ops.find((op): op is ReadingOp => op.kind === "reading");
  const deleting = ops.some((op) => op.kind === "delete") || !!create?.deleteAfter;
  const listed = !!snapshot.cache.journal?.some((row) => row.kind === "note" && row.id === finalId);
  let doc: JournalNoteDocument | null = snapshot.docs.get(finalId) ?? null;
  let baseRevision = doc?.markdown_revision ?? 0;
  if (create) {
    doc = {
      id: finalId,
      title: deriveNoteTitle(create.markdownBody),
      status: "draft",
      markdown_body: create.markdownBody,
      markdown_revision: 0,
      markdown_canonical: true,
      journal_date: create.journalDate,
      source: create.source,
      reading_at: create.logReading ? create.createdAt : null,
      created_at: create.createdAt,
      updated_at: create.createdAt,
    };
    baseRevision = 0;
  }
  if (doc && save) {
    doc = { ...doc, markdown_body: save.text, title: deriveNoteTitle(save.text) };
    baseRevision = save.baseRevision;
  }
  if (doc && reading) {
    doc = {
      ...doc,
      source: reading.source ?? doc.source,
      journal_date: reading.journalDate || doc.journal_date,
      reading_at: reading.logged ? (doc.reading_at ?? new Date().toISOString()) : null,
    };
  }
  if (!doc && !listed && !ops.length) return null;
  const conflictOp = ops.find((op) => op.status === "conflict");
  const errorOp = ops.find((op) => op.status === "error");
  const sync: NoteSync = conflictOp
    ? { state: "conflict", conflict: conflictOp.conflict!, opId: conflictOp.opId, text: conflictOp.kind === "save" ? conflictOp.text : conflictOp.kind === "create" ? conflictOp.markdownBody : null }
    : errorOp
      ? { state: "error", error: errorOp.error ?? "This change hasn't synced yet.", opId: errorOp.opId }
      : ops.some((op) => op.opId === snapshot.sending)
        ? { state: "sending" }
        : ops.length
          ? { state: "pending" }
          : { state: "synced" };
  return { id: finalId, doc, baseRevision, listed, deleting, sync };
}

type MarkFields = { body: string; highlightColor?: MarkColor | null; underline?: boolean | null; underlineColor?: MarkColor | null; textMarks?: VerseTextMark[] };

function marksInput(row: VerseAnnotation): MarkFields {
  return { body: row.body, highlightColor: row.highlight_color, underline: row.underline, underlineColor: row.underline_color, textMarks: row.text_marks };
}

function pendingAnnotation(chapter: AnnotationChapter, verse: number, now: string): VerseAnnotation {
  return {
    id: `pending:${chapterKey(chapter)}:${verse}`,
    verse,
    body: "",
    visibility: "private",
    highlight_color: null,
    underline: false,
    underline_color: null,
    user_id: "me",
    is_mine: true,
    created_at: now,
    updated_at: now,
  };
}

/**
 * The account's own annotation on each verse of a chapter, with unsynced marks, notes and deletions applied by the
 * same rules the server applies (convex/annotationRules.ts), so a mark looks the same before and after it syncs.
 */
export function chapterAnnotations(snapshot: Pick<AccountSnapshot, "cache" | "outbox">, chapter: AnnotationChapter): Map<number, VerseAnnotation> {
  const key = chapterKey(chapter);
  const out = new Map<number, VerseAnnotation>();
  for (const row of snapshot.cache.chapters[key] ?? []) if (row.is_mine) out.set(row.verse, row);
  const now = new Date().toISOString();
  for (const op of snapshot.outbox.ops) {
    if (op.kind === "marks" && chapterKey(op.chapter) === key) {
      for (const verse of op.verses) {
        const existing = out.get(verse) ?? null;
        const next = applyVerseMarks(existing ? marksInput(existing) : null, op.patch, op.patch.ranges?.find((range) => range.verse === verse));
        if (!next.keep) {
          out.delete(verse);
          continue;
        }
        const base = existing ?? pendingAnnotation(op.chapter, verse, now);
        const row: VerseAnnotation = {
          ...base,
          highlight_color: next.highlightColor ?? null,
          underline: next.underline,
          underline_color: next.underlineColor ?? null,
          updated_at: now,
        };
        if (next.textMarks) row.text_marks = next.textMarks;
        else delete row.text_marks;
        out.set(verse, row);
      }
    } else if (op.kind === "verseNote" && chapterKey(op.target) === key) {
      const existing = out.get(op.target.verse);
      const { highlightColor, underlineColor } = op.next;
      // Saving note text keeps the verse's ranges; changing a whole-verse style replaces that kind (as the server does).
      const textMarks = existing?.text_marks?.filter((mark) =>
        mark.kind === "highlight"
          ? (existing.highlight_color ?? null) === highlightColor
          : (existing.underline ? (existing.underline_color ?? DEFAULT_UNDERLINE_COLOR) : null) === underlineColor,
      );
      const body = normalizeAnnotationBody(op.next.body);
      if (!body && !highlightColor && !underlineColor && !textMarks?.length) {
        out.delete(op.target.verse);
        continue;
      }
      const row: VerseAnnotation = {
        ...(existing ?? pendingAnnotation(op.target, op.target.verse, now)),
        body,
        highlight_color: highlightColor,
        underline: underlineColor !== null,
        underline_color: underlineColor,
        updated_at: now,
      };
      if (textMarks?.length) row.text_marks = textMarks;
      else delete row.text_marks;
      out.set(op.target.verse, row);
    } else if (op.kind === "verseDelete" && chapterKey(op.target) === key) {
      out.delete(op.target.verse);
    }
  }
  return out;
}

/** The chapter op waiting for one verse with a conflict, if any (shown where that verse's note is edited). */
export function verseConflict(snapshot: AccountSnapshot, target: AnnotationVerse): (VerseNoteOp | VerseDeleteOp) | null {
  const key = chapterKey(target);
  return (
    snapshot.outbox.ops.find(
      (op): op is VerseNoteOp | VerseDeleteOp =>
        (op.kind === "verseNote" || op.kind === "verseDelete") && op.status === "conflict" && chapterKey(op.target) === key && op.target.verse === target.verse,
    ) ?? null
  );
}

export type SyncSummary = { waiting: number; errors: number; conflicts: number; sending: boolean };

export function syncSummary(snapshot: AccountSnapshot): SyncSummary {
  let errors = 0;
  let conflicts = 0;
  for (const op of snapshot.outbox.ops) {
    if (op.status === "error") errors += 1;
    else if (op.status === "conflict") conflicts += 1;
  }
  return { waiting: snapshot.outbox.ops.length, errors, conflicts, sending: snapshot.sending !== null };
}
