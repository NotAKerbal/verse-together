// An in-memory stand-in for the account's study functions, for the sync tests: the journal, note documents, verse
// annotations and guide spans of each account, with the rules of convex/insights.ts and convex/annotations.ts that the
// app relies on (request-id idempotent creates and ENTRY_CONFLICT, revision-checked saves and REVISION_CONFLICT,
// owner checks, patch-only quick marks, deletion tombstones). Plain errors come back as production sends them
// ("Server Error"); the coded ones as ConvexError. "Web" helpers change the account as the website would.
//
// Each client is one account's Convex connection. Offline, calls wait (as the Convex client queues them) until the
// server is back; `hangNextMutation` applies a mutation and never replies, as when the app is closed mid-request.

import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import {
  applyVerseMarks,
  deriveNoteTitle,
  markdownExcerpt,
  normalizeAnnotationBody,
  scriptureSource,
  type GuideHighlight,
  type JournalNoteDocument,
  type MarkColor,
  type NoteSource,
  type VerseTextMark,
} from "../src/shared/web";
import type { SyncClient } from "../src/account/studySync";

type Note = {
  id: string;
  owner: string;
  markdownBody: string;
  markdownRevision: number;
  journalDate: string;
  source: NoteSource | null;
  readingAt: number | null;
  createdAt: number;
  updatedAt: number;
  requestId: string | null;
  /** What the create last wrote, and whether anything edited the entry since. */
  requestContent: string | null;
  edited: boolean;
};

type Annotation = {
  id: string;
  owner: string;
  volume: string;
  book: string;
  chapter: number;
  verse: number;
  body: string;
  highlightColor?: MarkColor;
  underline?: boolean;
  underlineColor?: MarkColor;
  textMarks?: VerseTextMark[];
  createdAt: number;
  updatedAt: number;
};

const serverError = () => new Error("[Request ID: test] Server Error");
/** A plain Error thrown by a function, as a Convex client reports it (its message, then the stack). */
const uncaught = (message: string) => new Error(`[Request ID: test] Server Error\nUncaught Error: ${message}\n    at handler (../convex/readingPlans.ts:1:1)`);

type FakeStep = { volume: string; book: string; chapter: number; label: string };
export type FakePlan = {
  id: string;
  owner: string;
  title: string;
  template: string;
  steps: FakeStep[];
  selections?: unknown[];
  startDate?: string;
  chaptersPerDay?: number;
  readingDays?: boolean[];
  createdAt: number;
  updatedAt: number;
};

function readKey(owner: string, step: { volume: string; book: string; chapter: number }) {
  return [owner, step.volume, step.book, step.chapter].join("|");
}

export class FakeStudyServer {
  notes = new Map<string, Note>();
  annotations = new Map<string, Annotation>();
  guides = new Map<string, GuideHighlight & { owner: string }>();
  deletedKeys = new Set<string>();
  goals = new Map<string, { studyDays: number; reflections: number }>();
  /** Chapters each account marked read on the website (chapterReads), as "owner|volume|book|chapter". */
  chapterReads = new Set<string>();
  /** When each of chapterReads was read (convex/readingProgress.ts keeps the latest). */
  chapterReadAt = new Map<string, number>();
  /** Reading plans (convex/readingPlans.ts), by id. */
  plans = new Map<string, FakePlan>();
  /** Each account's last reading position (lastReadingPositions). */
  positions = new Map<string, { volume: string; book: string; chapter: number; verse?: number; updatedAt: number }>();
  online = true;
  /** Reply to createJournalEntry as a backend from before it reported the revision. */
  legacyCreateReply = false;
  calls: Array<{ owner: string; name: string; args: Record<string, unknown> }> = [];
  private hang = 0;
  private seq = 0;
  private clock = Date.parse("2026-10-28T12:00:00.000Z");
  private watchers = new Set<() => void>();
  private waiting: Array<() => void> = [];
  private connectionListeners = new Set<() => void>();

  now() {
    this.clock += 1000;
    return this.clock;
  }

  private id(prefix: string) {
    return `${prefix}${++this.seq}`;
  }

  changed() {
    this.watchers.forEach((watch) => watch());
  }

  setOnline(online: boolean) {
    this.online = online;
    if (online) {
      const waiting = this.waiting;
      this.waiting = [];
      waiting.forEach((resume) => resume());
    }
    this.connectionListeners.forEach((listener) => listener());
    if (online) this.changed();
  }

  hangNextMutation() {
    this.hang += 1;
  }

  // ---- The website, changing the account ----

  webCreateNote(owner: string, markdownBody: string, journalDate: string, source: NoteSource | null = null, reading = false): string {
    const now = this.now();
    const id = this.id("note_");
    this.notes.set(id, { id, owner, markdownBody, markdownRevision: 0, journalDate, source, readingAt: reading ? now : null, createdAt: now, updatedAt: now, requestId: null, requestContent: null, edited: false });
    this.changed();
    return id;
  }

  webMarkChapterRead(owner: string, volume: string, book: string, chapter: number) {
    const key = [owner, volume, book, chapter].join("|");
    this.chapterReads.add(key);
    this.chapterReadAt.set(key, this.now());
    this.changed();
  }

  /** A plan made on the website (createPlan's normalization, simplified to what the tests use). */
  webCreatePlan(owner: string, plan: Partial<FakePlan> & { title: string; steps: FakeStep[] }): string {
    const id = this.id("plan_");
    const now = this.now();
    this.plans.set(id, { template: "custom", ...plan, id, owner, createdAt: now, updatedAt: now });
    this.changed();
    return id;
  }

  private planSummary(plan: FakePlan) {
    const readCount = plan.steps.filter((step) => this.chapterReads.has(readKey(plan.owner, step))).length;
    return {
      id: plan.id,
      title: plan.title,
      template: plan.template,
      stepCount: plan.steps.length,
      readCount,
      startDate: plan.startDate ?? null,
      chaptersPerDay: plan.chaptersPerDay ?? null,
      readingDays: plan.readingDays ?? null,
      selections: plan.selections ?? null,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  /** convex/readingPlans.ts normalizePlanInput, for the rules the app relies on. */
  private planInput(args: Record<string, unknown>) {
    const title = String(args.title ?? "").trim().slice(0, 120);
    if (!title) throw uncaught("Give the plan a title");
    const steps = (args.steps as FakeStep[] | undefined) ?? [];
    if (steps.length === 0) throw uncaught("A plan needs at least one chapter");
    const readingDays = args.readingDays as boolean[] | undefined;
    if (readingDays && (readingDays.length !== 7 || !readingDays.some(Boolean))) throw uncaught("Pick at least one reading day");
    const chaptersPerDay = args.chaptersPerDay === undefined ? undefined : Math.max(1, Math.min(steps.length, Math.round(Number(args.chaptersPerDay))));
    return {
      title,
      steps,
      selections: args.selections as unknown[] | undefined,
      startDate: args.startDate as string | undefined,
      chaptersPerDay,
      readingDays: readingDays && readingDays.every(Boolean) ? undefined : readingDays,
    };
  }

  webEditNote(id: string, markdownBody: string) {
    const note = this.notes.get(id)!;
    this.notes.set(id, { ...note, markdownBody, markdownRevision: note.markdownRevision + 1, updatedAt: this.now(), edited: true });
    this.changed();
  }

  webDeleteNote(id: string) {
    const note = this.notes.get(id)!;
    this.notes.delete(id);
    if (note.requestId) this.deletedKeys.add(`${note.owner}|${note.requestId}`);
    this.changed();
  }

  webAnnotate(owner: string, target: { volume: string; book: string; chapter: number; verse: number }, fields: { body?: string; highlightColor?: MarkColor; underlineColor?: MarkColor }) {
    const existing = this.findAnnotation(owner, target);
    const now = this.now();
    const row: Annotation = {
      ...(existing ?? { id: this.id("ann_"), owner, ...target, body: "", createdAt: now }),
      ...(fields.body !== undefined ? { body: fields.body } : {}),
      ...(fields.highlightColor !== undefined ? { highlightColor: fields.highlightColor } : {}),
      ...(fields.underlineColor !== undefined ? { underline: true, underlineColor: fields.underlineColor } : {}),
      updatedAt: now,
    };
    this.annotations.set(row.id, row);
    this.changed();
    return row.id;
  }

  notesOf(owner: string) {
    return [...this.notes.values()].filter((note) => note.owner === owner);
  }

  annotationOf(owner: string, target: { volume: string; book: string; chapter: number; verse: number }) {
    return this.findAnnotation(owner, target);
  }

  private findAnnotation(owner: string, target: { volume: string; book: string; chapter: number; verse: number }) {
    return [...this.annotations.values()].find(
      (row) => row.owner === owner && row.volume === target.volume && row.book === target.book && row.chapter === target.chapter && row.verse === target.verse,
    );
  }

  // ---- The functions, for one account ----

  private document(note: Note): JournalNoteDocument {
    return {
      id: note.id,
      title: deriveNoteTitle(note.markdownBody),
      status: "draft",
      markdown_body: note.markdownBody,
      markdown_revision: note.markdownRevision,
      markdown_canonical: true,
      journal_date: note.journalDate,
      source: note.source,
      reading_at: note.readingAt === null ? null : new Date(note.readingAt).toISOString(),
      created_at: new Date(note.createdAt).toISOString(),
      updated_at: new Date(note.updatedAt).toISOString(),
    };
  }

  private annotationRow(row: Annotation) {
    return {
      id: row.id,
      verse: row.verse,
      body: row.body,
      visibility: "private" as const,
      highlight_color: row.highlightColor ?? null,
      text_marks: row.textMarks,
      underline: row.underline === true,
      underline_color: row.underline ? (row.underlineColor ?? "red") : null,
      user_id: row.owner,
      is_mine: true,
      created_at: new Date(row.createdAt).toISOString(),
      updated_at: new Date(row.updatedAt).toISOString(),
    };
  }

  query(owner: string, name: string, args: Record<string, unknown>): unknown {
    switch (name) {
      case "insights:listMyJournal": {
        const entries: unknown[] = this.notesOf(owner).map((note) => {
          const doc = this.document(note);
          return {
            kind: "note",
            id: note.id,
            title: doc.title,
            status: "draft",
            visibility: "private",
            journal_date: note.journalDate,
            source: note.source,
            reading_at: doc.reading_at,
            excerpt: markdownExcerpt(note.markdownBody),
            has_reflection: !!note.markdownBody.trim(),
            markdown_revision: note.markdownRevision,
            markdown_canonical: true,
            read_only: false,
            author_label: "You",
            created_at: doc.created_at,
            updated_at: doc.updated_at,
          };
        });
        for (const row of this.annotations.values()) {
          if (row.owner !== owner || !row.body.trim()) continue;
          entries.push({
            kind: "verse_annotation",
            id: row.id,
            title: null,
            body: row.body,
            journal_date: new Date(row.createdAt).toISOString().slice(0, 10),
            source: scriptureSource({ volume: row.volume, book: row.book, chapter: row.chapter, verseStart: row.verse, verseEnd: row.verse }),
            highlight_color: row.highlightColor ?? null,
            read_only: true,
            author_label: "You",
            created_at: new Date(row.createdAt).toISOString(),
            updated_at: new Date(row.updatedAt).toISOString(),
          });
        }
        return entries;
      }
      case "insights:getDraft": {
        const note = this.notes.get(String(args.draftId));
        if (!note || note.owner !== owner) throw serverError();
        return this.document(note);
      }
      case "readingProgress:listMyReadingLog":
        return [];
      case "readingProgress:getMyProgressForBook": {
        const prefix = `${owner}|${args.volume}|${args.book}|`;
        const readChapters = [...this.chapterReads].filter((key) => key.startsWith(prefix)).map((key) => Number(key.slice(prefix.length))).sort((a, b) => a - b);
        return { readChapters, latestReadChapter: readChapters.at(-1) ?? null, currentChapter: null };
      }
      case "readingPlans:listMyPlans":
        return [...this.plans.values()].filter((plan) => plan.owner === owner).sort((a, b) => b.createdAt - a.createdAt).map((plan) => this.planSummary(plan));
      case "readingPlans:getPlan": {
        const plan = this.plans.get(String(args.planId));
        if (!plan || plan.owner !== owner) return null;
        return {
          ...this.planSummary(plan),
          steps: plan.steps.map((step, index) => ({ ...step, index, readAt: this.chapterReadAt.get(readKey(owner, step)) ?? null })),
        };
      }
      case "readingProgress:getLastPosition": {
        const position = this.positions.get(owner);
        return position ? { volume: position.volume, book: position.book, chapter: position.chapter, verse: position.verse ?? null, updatedAt: position.updatedAt } : null;
      }
      case "users:getJournalGoals":
        return this.goals.get(owner) ?? { studyDays: 5, reflections: 3 };
      case "annotations:getChapterAnnotations": {
        const by_verse: Record<number, unknown[]> = {};
        for (const row of this.annotations.values()) {
          if (row.owner !== owner || row.volume !== args.volume || row.book !== args.book || row.chapter !== args.chapter) continue;
          (by_verse[row.verse] ??= []).push(this.annotationRow(row));
        }
        return { by_verse };
      }
      case "annotations:getGuideHighlights":
        return [...this.guides.values()].filter((row) => row.owner === owner && row.guide === args.guide).map(({ owner: _owner, ...row }) => row);
    }
    throw serverError();
  }

  mutation(owner: string, name: string, args: Record<string, unknown>): unknown {
    this.calls.push({ owner, name, args });
    const now = this.now();
    switch (name) {
      case "insights:createJournalEntry": {
        const requestId = String(args.requestId);
        const body = String(args.markdownBody);
        const content = JSON.stringify([body, args.journalDate, args.source ?? null, args.logReading]);
        if (this.deletedKeys.has(`${owner}|${requestId}`)) return { id: null, duplicate: true, deleted: true, ...(this.legacyCreateReply ? {} : { markdownRevision: null }) };
        const existing = [...this.notes.values()].find((note) => note.owner === owner && note.requestId === requestId);
        const reply = (id: string, revision: number, duplicate: boolean) =>
          this.legacyCreateReply ? { id, duplicate, deleted: false } : { id, duplicate, deleted: false, markdownRevision: revision };
        if (existing) {
          if (!existing.edited) {
            const revision = body === existing.markdownBody ? existing.markdownRevision : existing.markdownRevision + 1;
            this.notes.set(existing.id, {
              ...existing,
              markdownBody: body,
              markdownRevision: revision,
              journalDate: String(args.journalDate),
              source: (args.source as NoteSource) ?? null,
              readingAt: args.logReading ? (existing.readingAt ?? now) : null,
              requestContent: content,
            });
            this.changed();
            return reply(existing.id, revision, true);
          }
          const current = JSON.stringify([existing.markdownBody, existing.journalDate, existing.source, existing.readingAt !== null]);
          if (content === current) return reply(existing.id, existing.markdownRevision, true);
          throw new ConvexError({ code: "ENTRY_CONFLICT", message: "This entry changed since it was first saved", id: existing.id, journalDate: existing.journalDate });
        }
        if (!args.logReading && !body.trim()) throw serverError();
        const id = this.id("note_");
        this.notes.set(id, {
          id,
          owner,
          markdownBody: body,
          markdownRevision: 0,
          journalDate: String(args.journalDate),
          source: (args.source as NoteSource) ?? null,
          readingAt: args.logReading ? now : null,
          createdAt: now,
          updatedAt: now,
          requestId,
          requestContent: content,
          edited: false,
        });
        this.changed();
        return reply(id, 0, false);
      }
      case "insights:saveJournalNote": {
        const note = this.notes.get(String(args.draftId));
        if (!note || note.owner !== owner) throw serverError();
        if (args.expectedRevision !== note.markdownRevision) {
          throw new ConvexError({ code: "REVISION_CONFLICT", message: "This note changed since it was opened", currentRevision: note.markdownRevision });
        }
        const revision = note.markdownRevision + 1;
        this.notes.set(note.id, { ...note, markdownBody: String(args.markdownBody), markdownRevision: revision, updatedAt: now, edited: true });
        this.changed();
        return { ok: true, markdownRevision: revision, title: deriveNoteTitle(String(args.markdownBody)) };
      }
      case "insights:setJournalReading": {
        const note = this.notes.get(String(args.draftId));
        if (!note || note.owner !== owner) throw serverError();
        this.notes.set(note.id, {
          ...note,
          source: (args.source as NoteSource) ?? note.source,
          journalDate: (args.journalDate as string) ?? note.journalDate,
          readingAt: args.logged ? (note.readingAt ?? now) : null,
          updatedAt: now,
          edited: true,
        });
        this.changed();
        return { ok: true };
      }
      case "insights:deleteDraft": {
        const note = this.notes.get(String(args.draftId));
        if (!note || note.owner !== owner) throw serverError();
        this.notes.delete(note.id);
        if (note.requestId) this.deletedKeys.add(`${owner}|${note.requestId}`);
        this.changed();
        return { ok: true };
      }
      case "users:saveJournalGoals":
        this.goals.set(owner, { studyDays: Number(args.studyDays), reflections: Number(args.reflections) });
        this.changed();
        return args;
      case "annotations:setVerseMarks": {
        const target = { volume: String(args.volume), book: String(args.book), chapter: Number(args.chapter) };
        const patch = { highlightColor: args.highlightColor as MarkColor | null | undefined, underline: args.underline as boolean | undefined, underlineColor: args.underlineColor as MarkColor | undefined, ranges: args.ranges as never };
        for (const verse of new Set(args.verses as number[])) {
          const existing = this.findAnnotation(owner, { ...target, verse });
          const next = applyVerseMarks(existing ?? null, patch, (args.ranges as Array<{ verse: number }> | undefined)?.find((range) => range.verse === verse) as never);
          if (!next.keep) {
            if (existing) this.annotations.delete(existing.id);
            continue;
          }
          const row: Annotation = {
            ...(existing ?? { id: this.id("ann_"), owner, ...target, verse, body: "", createdAt: now }),
            highlightColor: next.highlightColor,
            underline: next.underline || undefined,
            underlineColor: next.underlineColor,
            textMarks: next.textMarks,
            updatedAt: now,
          };
          this.annotations.set(row.id, row);
        }
        this.changed();
        return { changed: 1 };
      }
      case "annotations:upsertVerseAnnotation": {
        const target = { volume: String(args.volume), book: String(args.book), chapter: Number(args.chapter), verse: Number(args.verse) };
        const existing = this.findAnnotation(owner, target);
        const underlineColor = args.underline === false ? undefined : ((args.underlineColor as MarkColor | undefined) ?? (existing?.underline ? existing.underlineColor : undefined));
        const row: Annotation = {
          ...(existing ?? { id: this.id("ann_"), owner, ...target, createdAt: now }),
          body: normalizeAnnotationBody(String(args.body)),
          highlightColor: args.highlightColor as MarkColor | undefined,
          underline: underlineColor ? true : undefined,
          underlineColor,
          updatedAt: now,
        } as Annotation;
        this.annotations.set(row.id, row);
        this.changed();
        return { id: row.id };
      }
      case "annotations:deleteVerseAnnotation": {
        const row = this.annotations.get(String(args.annotationId));
        if (!row || row.owner !== owner) throw serverError();
        this.annotations.delete(row.id);
        this.changed();
        return { ok: true };
      }
      case "annotations:setGuideAnnotation": {
        const existing = args.highlightId ? this.guides.get(String(args.highlightId)) : undefined;
        if (args.highlightId && (!existing || existing.owner !== owner)) throw serverError();
        const id = existing?.id ?? this.id("guide_");
        const row = {
          ...(existing ?? {
            id,
            owner,
            guide: String(args.guide),
            part: args.part as "reader",
            startBlock: String(args.startBlock),
            startOffset: Number(args.startOffset),
            endBlock: String(args.endBlock),
            endOffset: Number(args.endOffset),
            exact: String(args.exact),
            prefix: String(args.prefix),
            suffix: String(args.suffix),
            highlightColor: null,
            underlineColor: null,
            body: "",
          }),
          ...(args.highlightColor !== undefined ? { highlightColor: args.highlightColor as MarkColor | null } : {}),
          ...(args.underlineColor !== undefined ? { underlineColor: args.underlineColor as MarkColor | null } : {}),
          ...(args.body !== undefined ? { body: String(args.body) } : {}),
          updatedAt: new Date(now).toISOString(),
        };
        if (!row.highlightColor && !row.underlineColor && !row.body) {
          this.guides.delete(id);
          this.changed();
          return { id: null };
        }
        this.guides.set(id, row);
        this.changed();
        return { id };
      }
      case "annotations:deleteGuideHighlight": {
        const row = this.guides.get(String(args.highlightId));
        if (!row || row.owner !== owner) throw serverError();
        this.guides.delete(row.id);
        this.changed();
        return { ok: true };
      }
      case "insights:openReadingEntry":
        return { id: this.webCreateNote(owner, "", "2026-10-28") };
      case "readingPlans:createPlan": {
        const input = this.planInput(args);
        const id = this.id("plan_");
        this.plans.set(id, { id, owner, template: String(args.template), ...input, createdAt: now, updatedAt: now });
        this.changed();
        return { id };
      }
      case "readingPlans:updatePlan": {
        const plan = this.plans.get(String(args.planId));
        if (!plan || plan.owner !== owner) throw uncaught("Plan not found");
        this.plans.set(plan.id, { id: plan.id, owner, template: "custom", ...this.planInput(args), createdAt: plan.createdAt, updatedAt: now });
        this.changed();
        return { id: plan.id };
      }
      case "readingPlans:deletePlan": {
        const plan = this.plans.get(String(args.planId));
        if (!plan || plan.owner !== owner) throw uncaught("Plan not found");
        this.plans.delete(plan.id);
        this.changed();
        return { ok: true };
      }
      case "readingProgress:markChapterRead": {
        if (!Number.isInteger(args.chapter) || Number(args.chapter) < 1) throw uncaught("Chapter must be a positive whole number");
        const key = readKey(owner, args as never);
        this.chapterReads.add(key);
        this.chapterReadAt.set(key, now);
        this.changed();
        return { id: key, logId: `log-${args.requestId}`, duplicate: false };
      }
      case "readingProgress:unmarkChapterRead": {
        const key = readKey(owner, args as never);
        this.chapterReads.delete(key);
        this.chapterReadAt.delete(key);
        this.changed();
        return { ok: true };
      }
      case "readingProgress:setLastPosition":
        this.positions.set(owner, { volume: String(args.volume), book: String(args.book), chapter: Number(args.chapter), updatedAt: now });
        this.changed();
        return { ok: true };
    }
    throw serverError();
  }

  /** One account's connection. */
  client(owner: string): SyncClient & { closed: boolean } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- The fake client methods need their server and client receivers separately.
    const server = this;
    const whenOnline = () => (server.online ? Promise.resolve() : new Promise<void>((resolve) => server.waiting.push(resolve)));
    const client = {
      closed: false,
      watch(ref: unknown, args: Record<string, unknown>, onValue: (value: unknown) => void) {
        const name = getFunctionName(ref as never);
        const deliver = () => {
          if (!server.online || client.closed) return;
          try {
            onValue(server.query(owner, name, args));
          } catch {}
        };
        server.watchers.add(deliver);
        deliver();
        return () => server.watchers.delete(deliver);
      },
      async query(ref: unknown, args: Record<string, unknown>) {
        await whenOnline();
        return server.query(owner, getFunctionName(ref as never), args);
      },
      async mutation(ref: unknown, args: Record<string, unknown>) {
        await whenOnline();
        const result = server.mutation(owner, getFunctionName(ref as never), args);
        if (server.hang > 0) {
          server.hang -= 1;
          return new Promise(() => {});
        }
        // Replies arrive on a later turn, as over the network.
        await Promise.resolve();
        return result;
      },
      connected: () => server.online && !client.closed,
      onConnectionChange(listener: () => void) {
        server.connectionListeners.add(listener);
        return () => server.connectionListeners.delete(listener);
      },
    };
    return client;
  }
}

/** Lets queued promise callbacks (replies, follow-up reads) run. */
export async function flush(times = 20) {
  for (let index = 0; index < times; index++) await Promise.resolve();
}
