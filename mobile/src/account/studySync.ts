// Keeps one signed-in account's study on this device in step with the account (accountStudy.ts holds it). Runs only
// while the session is verified and its Convex client is open; one engine per client, disposed with it, so a reply
// arriving after sign-out or for another account is dropped (and the store it would have written to refuses it).
//
// Reading: the journal (insights:listMyJournal), reading log and goals are subscribed while signed in; each note's
// full text (insights:getDraft) is fetched a few at a time whenever the journal shows it changed, so the editor and
// search work offline; a chapter's or guide's annotations are subscribed while a screen shows them.
//
// Writing: the outbox is sent one change at a time, in order, while connected. Each change is safe to send again
// after a lost reply: creates name their request id, note saves their base revision (a refusal is checked against
// the note itself, so the app's own earlier save isn't taken for someone else's), verse notes are merged field by
// field with what the account holds now, and deletes check whether the note is already gone. Mutations are never
// abandoned on a timer (the Convex client delivers them once reconnected), so nothing is sent twice concurrently.

import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import {
  normalizeAnnotationBody,
  readGuideHighlight,
  type AnnotationChapter,
  type GuideHighlight,
  type JournalGoals,
  type JournalNoteDocument,
  type ReadingLogRow,
  type VerseAnnotation,
} from "../shared/web";
import {
  chapterKey,
  opKey,
  verseState,
  type AccountStudyStore,
  type CreateOp,
  type JournalRow,
  type Op,
  type VerseState,
} from "../storage/accountStudy";
import type { StudySyncPort } from "../storage/studySession";
import { readCreatedEntry, studyApi, type VerseAnnotationRow } from "./api";

/** The few client calls the engine makes; ConvexReactClient through convexSyncClient, or a fake in tests. */
export type SyncClient = {
  watch(ref: unknown, args: Record<string, unknown>, onValue: (value: unknown) => void, onError?: () => void): () => void;
  query(ref: unknown, args: Record<string, unknown>): Promise<unknown>;
  mutation(ref: unknown, args: Record<string, unknown>): Promise<unknown>;
  connected(): boolean;
  onConnectionChange(listener: () => void): () => void;
};

export function convexSyncClient(client: ConvexReactClient): SyncClient {
  const anyClient = client as unknown as {
    watchQuery(ref: unknown, args: unknown): { onUpdate(cb: () => void): () => void; localQueryResult(): unknown };
    query?(ref: unknown, args: unknown): Promise<unknown>;
    mutation(ref: unknown, args: unknown): Promise<unknown>;
    connectionState(): { isWebSocketConnected: boolean };
    subscribeToConnectionState?(cb: () => void): () => void;
  };
  const read = (watch: { localQueryResult(): unknown }) => {
    try {
      return watch.localQueryResult();
    } catch {
      // A query that failed on the server keeps the last cached value; the next update replaces it.
      return undefined;
    }
  };
  return {
    watch(ref, args, onValue, onError) {
      const watch = anyClient.watchQuery(ref, args);
      const deliver = () => {
        try {
          const value = watch.localQueryResult();
          if (value !== undefined) onValue(value);
        } catch { onError?.(); }
      };
      const stop = watch.onUpdate(deliver);
      deliver();
      return stop;
    },
    query(ref, args) {
      if (anyClient.query) return anyClient.query(ref, args);
      // A one-time read through a subscription (clients without query()).
      return new Promise((resolve) => {
        const watch = anyClient.watchQuery(ref, args);
        let stop: (() => void) | null = null;
        const check = () => {
          const value = read(watch);
          if (value === undefined) return;
          stop?.();
          resolve(value);
        };
        stop = watch.onUpdate(check);
        check();
      });
    },
    mutation: (ref, args) => anyClient.mutation(ref, args),
    connected: () => anyClient.connectionState().isWebSocketConnected,
    onConnectionChange(listener) {
      if (anyClient.subscribeToConnectionState) return anyClient.subscribeToConnectionState(listener);
      const timer = setInterval(listener, 3000);
      return () => clearInterval(timer);
    },
  };
}

const READ_TIMEOUT_MS = 20_000;
const DOC_CONCURRENCY = 3;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for the connection")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function errorCode(error: unknown): { code?: string; currentRevision?: unknown; id?: unknown; journalDate?: unknown } | null {
  if (error instanceof ConvexError) return (error.data ?? null) as never;
  // A ConvexError from another copy of the convex package (tests, or a bundled duplicate) still carries its data.
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === "object" ? (data as never) : null;
}

const SYNC_FAILED = "This change is saved on this device but hasn't reached your account yet. It will try again.";

function isNoteDocument(value: unknown): value is JournalNoteDocument {
  const doc = value as JournalNoteDocument | null;
  return !!doc && typeof doc === "object" && typeof doc.id === "string" && typeof doc.markdown_body === "string" && typeof doc.markdown_revision === "number";
}

function chapterRows(value: unknown): VerseAnnotation[] | null {
  const data = value as { by_verse?: Record<string, VerseAnnotationRow[]> } | null;
  if (!data || typeof data !== "object" || !data.by_verse || typeof data.by_verse !== "object") return null;
  const rows: VerseAnnotation[] = [];
  for (const list of Object.values(data.by_verse)) {
    const mine = (Array.isArray(list) ? list : []).find((row) => row && row.is_mine);
    if (mine && Number.isInteger(mine.verse)) rows.push(mine as VerseAnnotation);
  }
  return rows;
}

function sameMarks(a: VerseState | null, b: VerseState | null) {
  return (a?.highlightColor ?? null) === (b?.highlightColor ?? null) && (a?.underlineColor ?? null) === (b?.underlineColor ?? null);
}

export class StudySync implements StudySyncPort {
  private disposed = false;
  private stops: Array<() => void> = [];
  private processing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private docQueue = new Set<string>();
  private docRunning = 0;
  private docRetry: ReturnType<typeof setTimeout> | null = null;
  private chapterWatches = new Map<string, { count: number; stop: () => void }>();
  private guideWatches = new Map<string, { count: number; stop: () => void }>();
  private connectionListeners = new Set<() => void>();

  constructor(
    readonly owner: string,
    private store: AccountStudyStore,
    private client: SyncClient,
  ) {}

  private live() {
    return !this.disposed && !this.store.disposed;
  }

  start() {
    this.stops.push(
      this.client.watch(studyApi.listMyJournal, {}, (value) => {
        if (this.live() && Array.isArray(value)) {
          this.store.setSyncError(null);
          this.onJournal(value as JournalRow[]);
        }
      }, () => {
        if (this.live()) this.store.setSyncError("Your account journal couldn't be loaded. Check your connection and try again from Settings.");
      }),
      this.client.watch(studyApi.listMyReadingLog, {}, (value) => {
        if (this.live() && Array.isArray(value)) this.store.setReadingLog(value as ReadingLogRow[]);
      }),
      this.client.watch(studyApi.getJournalGoals, {}, (value) => {
        if (this.live() && (value === null || (typeof value === "object" && value))) this.store.setGoals(value as JournalGoals | null);
      }),
      this.client.onConnectionChange(() => {
        if (!this.live()) return;
        this.connectionListeners.forEach((listener) => listener());
        if (this.client.connected()) this.kick();
      }),
    );
    this.kick();
    return this;
  }

  dispose() {
    this.disposed = true;
    this.stops.forEach((stop) => stop());
    this.stops = [];
    this.chapterWatches.forEach((watch) => watch.stop());
    this.chapterWatches.clear();
    this.guideWatches.forEach((watch) => watch.stop());
    this.guideWatches.clear();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.docRetry) clearTimeout(this.docRetry);
    this.connectionListeners.clear();
  }

  connected() {
    return this.live() && this.client.connected();
  }

  subscribeConnection(listener: () => void) {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  // ---- Reading ----

  private onJournal(rows: JournalRow[]) {
    this.store.setJournal(rows);
    this.queueStaleDocs(rows);
  }

  /** Queues every listed note whose stored text is missing or older than the journal shows. */
  private queueStaleDocs(rows: JournalRow[]) {
    const snapshot = this.store.getSnapshot();
    const listed = new Set<string>();
    for (const row of rows) {
      if (row.kind !== "note") continue;
      listed.add(row.id);
      const doc = snapshot.docs.get(row.id);
      if (!doc || doc.markdown_revision !== row.markdown_revision || doc.updated_at !== row.updated_at) this.docQueue.add(row.id);
    }
    // Notes gone from the account leave the device too, unless a change to them is still waiting (its owner decides).
    const waiting = new Set(snapshot.outbox.ops.map((op) => opKey(op, snapshot.outbox.aliases)));
    const gone = [...snapshot.docs.keys()].filter((id) => !listed.has(id) && !waiting.has(`note:${id}`));
    this.store.removeDocs(gone);
    this.pumpDocs();
  }

  /** Fetches queued note documents, a few at a time, until every listed note's text is current. */
  private pumpDocs() {
    while (this.live() && this.docRunning < DOC_CONCURRENCY && this.docQueue.size) {
      const id = this.docQueue.values().next().value as string;
      this.docQueue.delete(id);
      this.docRunning += 1;
      void this.fetchDoc(id)
        .then((doc) => {
          // A read that failed (offline, a timeout) is tried again a little later, so no note stays without its text.
          if (!doc && this.live() && !this.docRetry) {
            this.docRetry = setTimeout(() => {
              this.docRetry = null;
              const journal = this.store.getSnapshot().cache.journal;
              if (this.live() && journal) this.queueStaleDocs(journal);
            }, 15_000);
          }
        })
        .finally(() => {
          this.docRunning -= 1;
          this.pumpDocs();
        });
    }
  }

  private async fetchDoc(id: string): Promise<JournalNoteDocument | null> {
    try {
      const value = await withTimeout(this.client.query(studyApi.getDraft, { draftId: id }), READ_TIMEOUT_MS);
      if (!this.live()) return null;
      if (isNoteDocument(value)) {
        this.store.putDoc(value);
        return value;
      }
    } catch {
      if (this.live()) this.store.setSyncError("Some account note text couldn't be downloaded. It will try again; saved changes remain on this device.");
    }
    return null;
  }

  private async noteListed(id: string): Promise<boolean | null> {
    try {
      const rows = await withTimeout(this.client.query(studyApi.listMyJournal, {}), READ_TIMEOUT_MS);
      if (!Array.isArray(rows)) return null;
      return (rows as JournalRow[]).some((row) => row.kind === "note" && row.id === id);
    } catch {
      return null;
    }
  }

  watchChapter(chapter: AnnotationChapter) {
    const key = chapterKey(chapter);
    const existing = this.chapterWatches.get(key);
    if (existing) existing.count += 1;
    else if (this.live()) {
      const [volume, book, number] = key.split("/");
      const target = { volume, book, chapter: Number(number) };
      const stop = this.client.watch(studyApi.getChapterAnnotations, target, (value) => {
        const rows = chapterRows(value);
        if (this.live() && rows) this.store.setChapter(target, rows);
      });
      this.chapterWatches.set(key, { count: 1, stop });
    }
    return () => {
      const watch = this.chapterWatches.get(key);
      if (!watch) return;
      watch.count -= 1;
      if (watch.count <= 0) {
        watch.stop();
        this.chapterWatches.delete(key);
      }
    };
  }

  watchGuide(guide: string) {
    const existing = this.guideWatches.get(guide);
    if (existing) existing.count += 1;
    else if (this.live()) {
      const stop = this.client.watch(studyApi.getGuideHighlights, { guide }, (value) => {
        if (!this.live() || !Array.isArray(value)) return;
        const rows = value.map(readGuideHighlight).filter((row): row is GuideHighlight => !!row && row.guide === guide);
        this.store.setGuide(guide, rows);
      }, () => {
        if (this.live()) this.store.setSyncError("Guide annotations couldn't be loaded. Check your connection and try again from Settings.");
      });
      this.guideWatches.set(guide, { count: 1, stop });
    }
    return () => {
      const watch = this.guideWatches.get(guide);
      if (!watch) return;
      watch.count -= 1;
      if (watch.count <= 0) {
        watch.stop();
        this.guideWatches.delete(guide);
      }
    };
  }

  /** Online-only calls (no outbox): refused offline, and given up on after a timeout. */
  async call<T>(name: "openReadingEntry" | "saveJournalGoals" | "setGuideAnnotation" | "deleteGuideHighlight" | "getGuideHighlights" | "getMyProgressForBook", args: Record<string, unknown>): Promise<T> {
    const loadError = this.store.getSnapshot().loadError;
    const read = name === "getGuideHighlights" || name === "getMyProgressForBook";
    if (loadError && !read) throw new Error(loadError);
    if (!this.connected()) throw new Error("You're offline. Connect to the internet and try again.");
    const ref = studyApi[name];
    const promise = read ? this.client.query(ref, args) : this.client.mutation(ref, args);
    const result = await withTimeout(promise, READ_TIMEOUT_MS);
    if (!this.live()) throw new Error("You signed out, so this change wasn't saved.");
    return result as T;
  }

  // ---- Writing ----

  kick() {
    if (!this.live() || this.store.getSnapshot().loadError) return;
    void this.process().catch(() => {
      // Storage may refuse an acknowledgement or retry status too. The persisted op is still there;
      // don't turn that failure into an unhandled rejection or pretend the queue was cleared.
      if (this.live()) this.store.setSyncError("Sync couldn't update this device's saved changes. Keep the app's data and try again after checking device storage.");
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.live() && this.client.connected()) {
        const op = this.nextReady();
        if (!op) break;
        this.store.setSending(op.opId);
        try {
          await this.run(op);
        } catch {
          if (this.live() && this.store.findOp(op.opId)) this.store.markFailed(op.opId, SYNC_FAILED);
        } finally {
          if (this.live()) this.store.setSending(null);
        }
      }
    } finally {
      this.processing = false;
      this.scheduleRetry();
    }
  }

  /** The first change that may go now: not behind a stuck change to the same note or chapter, and not waiting to retry. */
  private nextReady(now = Date.now()): Op | null {
    const { ops, aliases } = this.store.getSnapshot().outbox;
    const blocked = new Set<string>();
    for (const op of ops) {
      const key = opKey(op, aliases);
      if (blocked.has(key)) continue;
      const ready = op.status === "pending" || (op.status === "error" && (op.retryAt ?? 0) <= now);
      if (ready) return op;
      blocked.add(key);
    }
    return null;
  }

  private scheduleRetry() {
    if (!this.live()) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const times = this.store
      .getSnapshot()
      .outbox.ops.filter((op) => op.status === "error" && op.retryAt !== null)
      .map((op) => op.retryAt!);
    if (!times.length) return;
    const delay = Math.max(1000, Math.min(...times) - Date.now());
    this.retryTimer = setTimeout(() => this.kick(), delay);
  }

  private async run(op: Op) {
    switch (op.kind) {
      case "create":
        return this.runCreate(op);
      case "save":
        return this.runSave(op.opId, op.noteId, op.text, op.baseRevision);
      case "reading":
        return this.runReading(op.opId);
      case "delete":
        return this.runDelete(op.opId, op.noteId);
      case "marks":
        return this.runMarks(op.opId);
      case "verseNote":
      case "verseDelete":
        return this.runVerse(op.opId);
    }
  }

  private async runCreate(op: CreateOp) {
    const sent = { markdownBody: op.markdownBody, journalDate: op.journalDate, source: op.source, logReading: op.logReading };
    this.store.markSent(op.opId);
    let reply: ReturnType<typeof readCreatedEntry>;
    try {
      reply = readCreatedEntry(
        await this.client.mutation(studyApi.createJournalEntry, {
          journalDate: sent.journalDate,
          ...(sent.source ? { source: sent.source } : {}),
          markdownBody: sent.markdownBody,
          logReading: sent.logReading,
          requestId: op.requestId,
        }),
      );
    } catch (error) {
      if (!this.live()) return;
      const data = errorCode(error);
      if (data?.code === "ENTRY_CONFLICT" && typeof data.id === "string" && typeof data.journalDate === "string") {
        this.store.markConflict(op.opId, { kind: "entry", id: data.id, journalDate: data.journalDate });
        return;
      }
      throw error;
    }
    if (!this.live()) return;
    if (!reply.id) {
      // Deleted in the account after an earlier try created it.
      const latest = this.store.findOp(op.opId);
      if (latest?.kind === "create" && latest.deleteAfter) this.store.replaceOp(op.opId, null);
      else this.store.markConflict(op.opId, { kind: "missing" });
      return;
    }
    let revision = reply.revision;
    if (revision === null) {
      // An older backend doesn't say which revision this content is at: read the entry, and take its revision only
      // if it still holds exactly what was sent (never later edits as this text's base).
      const doc = await this.fetchDoc(reply.id);
      if (!this.live()) return;
      if (doc && doc.markdown_body === sent.markdownBody) revision = doc.markdown_revision;
    }
    this.store.ackCreate(op.opId, sent, reply.id, revision);
  }

  private async runSave(opId: string, rawId: string, text: string, baseRevision: number) {
    const noteId = this.store.resolveId(rawId);
    let revision: number | null = null;
    try {
      const result = await this.client.mutation(studyApi.saveJournalNote, { draftId: noteId, markdownBody: text, expectedRevision: baseRevision });
      if (!this.live()) return;
      const reported = (result as { markdownRevision?: unknown } | null)?.markdownRevision;
      revision = typeof reported === "number" ? reported : null;
      if (revision === null) {
        // Not reported: learn it from the note, and only if the note holds exactly this text.
        const doc = await this.fetchDoc(noteId);
        if (!this.live()) return;
        if (!doc || doc.markdown_body !== text) {
          this.store.markConflict(opId, { kind: "revision", serverRevision: doc?.markdown_revision ?? null, serverText: doc?.markdown_body ?? null });
          return;
        }
        revision = doc.markdown_revision;
      }
    } catch (error) {
      if (!this.live()) return;
      const data = errorCode(error);
      if (data?.code === "REVISION_CONFLICT") {
        // Maybe this app's own earlier save, whose reply was lost: the note then holds exactly this text.
        const doc = await this.fetchDoc(noteId);
        if (!this.live()) return;
        if (doc && doc.markdown_body === text) {
          this.store.ackSave(opId, text, doc.markdown_revision);
          return;
        }
        const current = typeof data.currentRevision === "number" ? data.currentRevision : null;
        this.store.markConflict(opId, { kind: "revision", serverRevision: doc?.markdown_revision ?? current, serverText: doc?.markdown_body ?? null });
        return;
      }
      if ((await this.noteListed(noteId)) === false) {
        if (this.live()) this.store.markConflict(opId, { kind: "missing" });
        return;
      }
      throw error;
    }
    this.store.ackSave(opId, text, revision);
  }

  private async runReading(opId: string) {
    const op = this.store.findOp(opId);
    if (op?.kind !== "reading") return;
    const noteId = this.store.resolveId(op.noteId);
    try {
      await this.client.mutation(studyApi.setJournalReading, {
        draftId: noteId,
        logged: op.logged,
        ...(op.source ? { source: op.source } : {}),
        ...(op.journalDate ? { journalDate: op.journalDate } : {}),
      });
    } catch (error) {
      if (!this.live()) return;
      if ((await this.noteListed(noteId)) === false) {
        if (this.live()) this.store.markConflict(opId, { kind: "missing" });
        return;
      }
      throw error;
    }
    if (!this.live()) return;
    const latest = this.store.findOp(opId);
    // Changed again while on its way: the newer choice is sent next.
    if (latest?.kind === "reading" && latest.logged === op.logged && latest.journalDate === op.journalDate && JSON.stringify(latest.source) === JSON.stringify(op.source)) {
      this.store.replaceOp(opId, null);
    }
    void this.fetchDoc(noteId);
  }

  private async runDelete(opId: string, rawId: string) {
    const noteId = this.store.resolveId(rawId);
    try {
      await this.client.mutation(studyApi.deleteDraft, { draftId: noteId });
    } catch (error) {
      if (!this.live()) return;
      // Already gone (deleted elsewhere, or this app's earlier try whose reply was lost) is what was asked for.
      if ((await this.noteListed(noteId)) !== false) throw error;
    }
    if (this.live()) this.store.ackDelete(opId);
  }

  private async runMarks(opId: string) {
    const op = this.store.findOp(opId);
    if (op?.kind !== "marks") return;
    await this.client.mutation(studyApi.setVerseMarks, { ...op.chapter, verses: op.verses, ...op.patch });
    if (this.live()) this.store.ackChapterOp(opId);
  }

  /** The account's own annotation on one verse right now. */
  private async serverVerse(chapter: AnnotationChapter, verse: number): Promise<{ row: VerseAnnotation | null; state: VerseState | null }> {
    const value = await withTimeout(this.client.query(studyApi.getChapterAnnotations, { volume: chapter.volume, book: chapter.book, chapter: chapter.chapter }), READ_TIMEOUT_MS);
    const rows = chapterRows(value);
    if (!rows) throw new Error("Unexpected reply from the annotations service.");
    if (this.live()) this.store.setChapter(chapter, rows);
    const row = rows.find((item) => item.verse === verse) ?? null;
    return { row, state: verseState(row) };
  }

  /**
   * A verse's note editor save or delete, merged with what the account holds now: each field the app changed is
   * written; a field the account changed meanwhile (to something else) is a conflict; the rest stays as saved there.
   */
  private async runVerse(opId: string) {
    const op = this.store.findOp(opId);
    if (op?.kind !== "verseNote" && op?.kind !== "verseDelete") return;
    const { row, state: server } = await this.serverVerse(op.target, op.target.verse);
    if (!this.live()) return;
    const body = (value: string | undefined | null) => normalizeAnnotationBody(value ?? "");
    if (op.kind === "verseDelete") {
      if (!row) {
        this.store.ackChapterOp(opId);
        return;
      }
      if (body(server!.body) !== body(op.base.body) || !sameMarks(server, op.base)) {
        this.store.markConflict(opId, { kind: "verse", server });
        return;
      }
      await this.client.mutation(studyApi.deleteVerseAnnotation, { annotationId: row.id });
      if (this.live()) this.store.ackChapterOp(opId);
      return;
    }
    const base = op.base;
    const mine = op.next;
    const changed = {
      body: body(mine.body) !== body(base?.body),
      highlight: mine.highlightColor !== (base?.highlightColor ?? null),
      underline: mine.underlineColor !== (base?.underlineColor ?? null),
    };
    const theirs = {
      body: body(server?.body) !== body(base?.body),
      highlight: (server?.highlightColor ?? null) !== (base?.highlightColor ?? null),
      underline: (server?.underlineColor ?? null) !== (base?.underlineColor ?? null),
    };
    const clash =
      (base && !server && (changed.body || changed.highlight || changed.underline)) ||
      (changed.body && theirs.body && body(server?.body) !== body(mine.body)) ||
      (changed.highlight && theirs.highlight && (server?.highlightColor ?? null) !== mine.highlightColor) ||
      (changed.underline && theirs.underline && (server?.underlineColor ?? null) !== mine.underlineColor);
    if (clash) {
      this.store.markConflict(opId, { kind: "verse", server });
      return;
    }
    const merged = {
      body: changed.body ? mine.body : (server?.body ?? ""),
      highlightColor: changed.highlight ? mine.highlightColor : (server?.highlightColor ?? null),
      underlineColor: changed.underline ? mine.underlineColor : (server?.underlineColor ?? null),
    };
    const keepsRanges = !!row?.text_marks?.some((mark) =>
      mark.kind === "highlight" ? (row.highlight_color ?? null) === merged.highlightColor : (server?.underlineColor ?? null) === merged.underlineColor,
    );
    if (!body(merged.body) && !merged.highlightColor && !merged.underlineColor && !keepsRanges) {
      if (row) await this.client.mutation(studyApi.deleteVerseAnnotation, { annotationId: row.id });
    } else {
      await this.client.mutation(studyApi.upsertVerseAnnotation, {
        volume: op.target.volume,
        book: op.target.book,
        chapter: op.target.chapter,
        verse: op.target.verse,
        body: merged.body,
        ...(merged.highlightColor ? { highlightColor: merged.highlightColor } : {}),
        underline: merged.underlineColor !== null,
        ...(merged.underlineColor ? { underlineColor: merged.underlineColor } : {}),
      });
    }
    if (!this.live()) return;
    this.store.ackChapterOp(opId);
    // Fields kept from the account were shown as the editor left them until now; read the verse back.
    await this.serverVerse(op.target, op.target.verse).catch(() => null);
  }
}
