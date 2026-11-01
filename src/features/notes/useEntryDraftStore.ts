"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ConvexError } from "convex/values";
import { appendMarkdownChunk } from "../../../convex/noteJournal";
import { newRequestId } from "./journal";
import {
  entryDraftInput,
  entryDraftProblem,
  EntryDraftProblem,
  freshEntryDraft,
  settleSavedEntryDraft,
  sameEntryDraft,
  type EntryDraft,
  type EntryDraftSaveResult,
  type EntrySaveState,
} from "./entryDraft";

export type CreateJournalEntry = (input: ReturnType<typeof entryDraftInput>) => Promise<{ id: string | null }>;

export function entryConflictOf(error: unknown): { id: string; journalDate: string } | null {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as { code?: unknown; id?: unknown; journalDate?: unknown } | null;
  if (data?.code !== "ENTRY_CONFLICT" || typeof data.id !== "string" || typeof data.journalDate !== "string") return null;
  return { id: data.id, journalDate: data.journalDate };
}

type Snapshot = { draft: EntryDraft; save: EntrySaveState };

export class EntryDraftStore {
  private snapshot: Snapshot = { draft: freshEntryDraft(), save: { status: "idle" } };
  private inFlight: Promise<EntryDraftSaveResult> | null = null;

  private generation = 0;
  private savedDraft: EntryDraft | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private create: CreateJournalEntry,
    private activate: (id: string) => void
  ) {}

  connect(create: CreateJournalEntry, activate: (id: string) => void) {
    this.create = create;
    this.activate = activate;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private set(next: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  change = (change: (draft: EntryDraft) => EntryDraft) => {
    const draft = change(this.snapshot.draft);
    if (draft !== this.snapshot.draft) this.set({ draft, ...(this.snapshot.save.status === "autosaved" ? { save: { status: "idle" } as EntrySaveState } : {}) });
  };

  reset() {
    this.generation += 1;
    this.inFlight = null;
    this.savedDraft = null;
    this.set({ draft: freshEntryDraft(), save: { status: "idle" } });
  }

  appendExcerpt = async (excerpt: string): Promise<string | null> => {
    if (this.snapshot.save.status === "saving") {
      const saved = await this.save();
      if (!saved.id) throw new Error("Your entry couldn't be saved. Check the journal and try again.");
      return saved.id;
    }
    this.change(draft => ({ ...draft, text: appendMarkdownChunk(draft.text, excerpt) }));
    return null;
  };

  hasUnsaved = () => (this.savedDraft !== null || this.snapshot.draft.text.trim() !== "") &&
    (!this.savedDraft || !sameEntryDraft(this.snapshot.draft, this.savedDraft));

  autosave = (): Promise<EntryDraftSaveResult> => {
    const { draft, save } = this.snapshot;
    if (!this.hasUnsaved() || entryDraftProblem(draft) || !["idle", "autosaved"].includes(save.status)) {
      return Promise.resolve({ id: null });
    }
    return this.beginSave(true);
  };

  save = (): Promise<EntryDraftSaveResult> => {
    if (this.inFlight && this.snapshot.save.status === "autosaving") {
      const generation = this.generation;
      return this.inFlight.then(() => this.generation === generation ? this.save() : { id: null });
    }
    return this.beginSave(false);
  };

  private beginSave(automatic: boolean): Promise<EntryDraftSaveResult> {
    if (this.inFlight) return this.inFlight;
    const sent = this.snapshot.draft;
    const problem = entryDraftProblem(sent);
    if (problem) return Promise.reject(new EntryDraftProblem(problem));
    const generation = this.generation;
    this.set({ save: { status: automatic ? "autosaving" : "saving" } });
    const run = this.run(sent, generation, automatic).finally(() => {
      if (this.inFlight === run) this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  private async run(sent: EntryDraft, generation: number, automatic: boolean): Promise<EntryDraftSaveResult> {
    const current = () => this.generation === generation;

    const detach = () =>
      this.change((draft) => (draft.requestId === sent.requestId ? { ...draft, requestId: newRequestId() } : draft));
    let result: { id: string | null };
    try {
      result = await this.create(entryDraftInput(sent));
    } catch (error) {
      if (!current()) return { id: null };
      const conflict = entryConflictOf(error);
      if (conflict) {
        detach();
        this.set({ save: { status: "conflict", ...conflict } });
      } else {

        this.set({ save: { status: "failed" } });
      }
      return { id: null };
    }
    if (!current()) return { id: null };
    if (!result.id) {
      detach();
      this.set({ save: { status: "deleted" } });
      return { id: null };
    }
    const id = String(result.id);
    this.savedDraft = sent;
    if (automatic) {
      this.set({ save: sameEntryDraft(this.snapshot.draft, sent) ? { status: "autosaved", id, journalDate: sent.journalDate } : { status: "idle" } });
      return { id, journalDate: sent.journalDate };
    }
    const settled = settleSavedEntryDraft(this.snapshot.draft, sent);
    this.activate(id);
    if (settled.kept) {
      this.set({ draft: settled.draft, save: { status: "kept", id, journalDate: sent.journalDate } });
      return { id: null };
    }
    this.savedDraft = null;
    this.set({ draft: settled.draft, save: { status: "idle" } });
    return { id, journalDate: sent.journalDate };
  }

  openSavedEntry = (): { id: string; journalDate: string } | null => {
    const save = this.snapshot.save;
    if (save.status !== "conflict" && save.status !== "kept") return null;
    this.activate(save.id);
    return { id: save.id, journalDate: save.journalDate };
  };
}

export function useEntryDraftStore({
  ownerId,
  create,
  activate,
  autosaveReady = false,
}: {
  ownerId: string | null;
  autosaveReady?: boolean;
  create: CreateJournalEntry;
  activate: (id: string) => void;
}) {
  const [store] = useState(() => new EntryDraftStore(create, activate));
  useEffect(() => {
    store.connect(create, activate);
  }, [store, create, activate]);
  useEffect(() => {
    store.reset();
  }, [store, ownerId]);
  const { draft, save } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    if (!autosaveReady || !["idle", "autosaved"].includes(save.status)) return;
    const timer = setTimeout(() => void store.autosave(), 800);
    return () => clearTimeout(timer);
  }, [store, autosaveReady, draft, save]);
  const getEntryDraft = useCallback(() => store.getSnapshot().draft, [store]);
  return {
    entryDraft: draft,
    getEntryDraft,
    hasUnsavedEntry: store.hasUnsaved,
    addExcerptToEntry: store.appendExcerpt,
    changeEntryDraft: store.change,
    entrySave: save,
    saveEntryDraft: store.save,
    openSavedEntry: store.openSavedEntry,
  };
}
