"use client";

// The one unsaved journal entry and its save, for InsightBuilderProvider (and the notes QA harness, with a synthetic
// create). Both live above every composer, so closing and reopening the sheet mid-save shows the save still in
// flight, keeps the composer read-only until it settles, and then shows its outcome.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ConvexError } from "convex/values";
import { newRequestId } from "./journal";
import {
  entryDraftInput,
  entryDraftProblem,
  EntryDraftProblem,
  freshEntryDraft,
  settleSavedEntryDraft,
  type EntryDraft,
  type EntryDraftSaveResult,
  type EntrySaveState,
} from "./entryDraft";

/** insights:createJournalEntry, or a stand-in: the entry's id, or null when it had been deleted. */
export type CreateJournalEntry = (input: ReturnType<typeof entryDraftInput>) => Promise<{ id: string | null }>;

/** The entry a create refused to change (insights:createJournalEntry's ENTRY_CONFLICT), or null. */
export function entryConflictOf(error: unknown): { id: string; journalDate: string } | null {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as { code?: unknown; id?: unknown; journalDate?: unknown } | null;
  if (data?.code !== "ENTRY_CONFLICT" || typeof data.id !== "string" || typeof data.journalDate !== "string") return null;
  return { id: data.id, journalDate: data.journalDate };
}

type Snapshot = { draft: EntryDraft; save: EntrySaveState };

/**
 * The draft and its save, outside React so a save outlives the composer that started it. The draft is read and
 * compared from here, never from a render, so a save sends, and afterwards clears, exactly what was current.
 */
export class EntryDraftStore {
  private snapshot: Snapshot = { draft: freshEntryDraft(), save: { status: "idle" } };
  private inFlight: Promise<EntryDraftSaveResult> | null = null;
  // Bumped when the account changes: a save begun before then no longer concerns this draft.
  private generation = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private create: CreateJournalEntry,
    /** Makes a saved entry the active note. */
    private activate: (id: string) => void
  ) {}

  /** The current create and activate (a save in flight finishes with whichever is current then). */
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
    if (draft !== this.snapshot.draft) this.set({ draft });
  };

  /** Another account never sees this one's unsaved entry, its save's outcome, or its request ids. */
  reset() {
    this.generation += 1;
    this.inFlight = null;
    this.set({ draft: freshEntryDraft(), save: { status: "idle" } });
  }

  /**
   * Saves the draft as one entry and makes it the active note. One save runs at a time: asking again while one is
   * in flight (from a remounted composer, say) joins it. Rejects with EntryDraftProblem, sending nothing, when the
   * draft is incomplete; otherwise resolves with the entry to show, or null with the reason in the save state.
   */
  save = (): Promise<EntryDraftSaveResult> => {
    if (this.inFlight) return this.inFlight;
    const sent = this.snapshot.draft;
    const problem = entryDraftProblem(sent);
    if (problem) return Promise.reject(new EntryDraftProblem(problem));
    const generation = this.generation;
    this.set({ save: { status: "saving" } });
    const run = this.run(sent, generation).finally(() => {
      if (this.inFlight === run) this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  };

  private async run(sent: EntryDraft, generation: number): Promise<EntryDraftSaveResult> {
    const current = () => this.generation === generation;
    // A new request id, so saving again makes a separate entry rather than naming this one.
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
        // The result is unknown: the draft keeps its request id, so Try again names the same entry.
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
    const settled = settleSavedEntryDraft(this.snapshot.draft, sent);
    this.activate(id);
    if (settled.kept) {
      this.set({ draft: settled.draft, save: { status: "kept", id, journalDate: sent.journalDate } });
      return { id: null };
    }
    this.set({ draft: settled.draft, save: { status: "idle" } });
    return { id, journalDate: sent.journalDate };
  }

  /**
   * After a conflict or a save that left changes behind: makes the entry it concerned the active note and returns
   * it to show. The draft and the explanation stay for when the composer is next shown.
   */
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
}: {
  /** The signed-in account: changing it drops the draft and forgets any save in flight. */
  ownerId: string | null;
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
  const getEntryDraft = useCallback(() => store.getSnapshot().draft, [store]);
  return {
    entryDraft: draft,
    getEntryDraft,
    changeEntryDraft: store.change,
    entrySave: save,
    saveEntryDraft: store.save,
    openSavedEntry: store.openSavedEntry,
  };
}
