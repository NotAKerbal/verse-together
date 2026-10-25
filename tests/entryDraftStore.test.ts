import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";
import { EntryDraftProblem } from "../src/features/notes/entryDraft";
import type { NoteSource } from "../src/features/notes/journal";
import { EntryDraftStore, entryConflictOf, type CreateJournalEntry } from "../src/features/notes/useEntryDraftStore";

const chapter2: NoteSource = { kind: "scripture", label: "1 Nephi 2", href: "/browse/bookofmormon/1nephi/2", volume: "bookofmormon", book: "1nephi", chapter: 2 };
const chapter3: NoteSource = { ...chapter2, label: "1 Nephi 3", href: "/browse/bookofmormon/1nephi/3", chapter: 3 };

/** A create whose response the test releases (or fails) by hand. */
function slowCreate() {
  const calls: { input: Parameters<CreateJournalEntry>[0]; resolve: (id: string | null) => void; reject: (error: unknown) => void }[] = [];
  const create = vi.fn<CreateJournalEntry>(
    (input) => new Promise((resolve, reject) => calls.push({ input, resolve: (id) => resolve({ id }), reject }))
  );
  return { create, calls };
}

function storeWith(create: CreateJournalEntry) {
  const activate = vi.fn<(id: string) => void>();
  const store = new EntryDraftStore(create, activate);
  store.change((draft) => ({ ...draft, source: chapter2, logReading: true, journalDate: "2026-10-25" }));
  return { store, activate };
}

describe("the entry draft's save, shared by every composer", () => {
  test("a save in flight is shared: a remounted composer sees it and joins it rather than sending again", async () => {
    const { create, calls } = slowCreate();
    const { store } = storeWith(create);
    store.change((draft) => ({ ...draft, text: "Morning thoughts" }));
    const first = store.save();
    expect(store.getSnapshot().save).toEqual({ status: "saving" });
    // Closing and reopening the sheet mounts a new composer, which reads the provider's state and may save again.
    const second = store.save();
    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    calls[0].resolve("entry-1");
    expect(await first).toEqual({ id: "entry-1", journalDate: "2026-10-25" });
    expect(store.getSnapshot().draft.text).toBe("");
    expect(store.getSnapshot().save).toEqual({ status: "idle" });
  });

  test("text added while a slow save runs is kept, under a new request id, never cleared by the old response", async () => {
    const { create, calls } = slowCreate();
    const { store, activate } = storeWith(create);
    store.change((draft) => ({ ...draft, text: "Morning thoughts" }));
    const requestId = store.getSnapshot().draft.requestId;
    const saving = store.save();
    store.change((draft) => ({ ...draft, text: "Morning thoughts, and more" }));
    calls[0].resolve("entry-1");
    expect(await saving).toEqual({ id: null });
    const { draft, save } = store.getSnapshot();
    expect(draft.text).toBe("Morning thoughts, and more");
    expect(draft.requestId).not.toBe(requestId);
    expect(save).toEqual({ status: "kept", id: "entry-1", journalDate: "2026-10-25" });
    expect(activate).toHaveBeenCalledWith("entry-1");
    expect(store.openSavedEntry()).toEqual({ id: "entry-1", journalDate: "2026-10-25" });
    // Saving the kept changes makes a separate entry.
    void store.save();
    expect(calls[1].input).toMatchObject({ markdownBody: "Morning thoughts, and more", requestId: draft.requestId });
  });

  test("an untouched reading that followed the page meanwhile is simply replaced, not kept", async () => {
    const { create, calls } = slowCreate();
    const { store } = storeWith(create);
    const saving = store.save();
    store.change((draft) => ({ ...draft, source: chapter3 }));
    calls[0].resolve("entry-1");
    expect(await saving).toEqual({ id: "entry-1", journalDate: "2026-10-25" });
    expect(store.getSnapshot().draft).toMatchObject({ text: "", source: chapter3, edited: false });
    expect(store.getSnapshot().save.status).toBe("idle");
  });

  test("a failed save keeps the text and request id, so Try again names the same entry", async () => {
    const { create, calls } = slowCreate();
    const { store } = storeWith(create);
    store.change((draft) => ({ ...draft, text: "A thought" }));
    const saving = store.save();
    calls[0].reject(new Error("network"));
    expect(await saving).toEqual({ id: null });
    expect(store.getSnapshot().save).toEqual({ status: "failed" });
    expect(store.getSnapshot().draft.text).toBe("A thought");
    void store.save();
    expect(calls[1].input.requestId).toBe(calls[0].input.requestId);
  });

  test("a conflict keeps the text under a new request id and names the entry, which can be opened", async () => {
    const { create, calls } = slowCreate();
    const { store, activate } = storeWith(create);
    store.change((draft) => ({ ...draft, text: "Written here, after an edit elsewhere" }));
    const saving = store.save();
    calls[0].reject(new ConvexError({ code: "ENTRY_CONFLICT", id: "entry-1", journalDate: "2026-10-24" }));
    expect(await saving).toEqual({ id: null });
    const { draft, save } = store.getSnapshot();
    expect(save).toEqual({ status: "conflict", id: "entry-1", journalDate: "2026-10-24" });
    expect(draft.text).toBe("Written here, after an edit elsewhere");
    expect(draft.requestId).not.toBe(calls[0].input.requestId);
    expect(activate).not.toHaveBeenCalled();
    expect(store.openSavedEntry()).toEqual({ id: "entry-1", journalDate: "2026-10-24" });
    expect(activate).toHaveBeenCalledWith("entry-1");
    expect(store.getSnapshot().draft.text).toBe("Written here, after an edit elsewhere");
    void store.save();
    expect(calls[1].input.requestId).toBe(draft.requestId);
  });

  test("an entry deleted elsewhere keeps the text for a new entry", async () => {
    const { create, calls } = slowCreate();
    const { store } = storeWith(create);
    store.change((draft) => ({ ...draft, text: "Still mine" }));
    const saving = store.save();
    calls[0].resolve(null);
    expect(await saving).toEqual({ id: null });
    expect(store.getSnapshot().save).toEqual({ status: "deleted" });
    expect(store.getSnapshot().draft.text).toBe("Still mine");
    expect(store.getSnapshot().draft.requestId).not.toBe(calls[0].input.requestId);
  });

  test("a save outlived by an account change doesn't touch the new account's draft", async () => {
    const { create, calls } = slowCreate();
    const { store, activate } = storeWith(create);
    store.change((draft) => ({ ...draft, text: "Alice's note" }));
    const saving = store.save();
    store.reset();
    store.change((draft) => ({ ...draft, text: "Bob's note" }));
    calls[0].resolve("entry-1");
    expect(await saving).toEqual({ id: null });
    expect(activate).not.toHaveBeenCalled();
    expect(store.getSnapshot().draft.text).toBe("Bob's note");
    expect(store.getSnapshot().save.status).toBe("idle");
    // And a new save isn't joined to the old one.
    void store.save();
    expect(create).toHaveBeenCalledTimes(2);
  });

  test("an incomplete draft is refused before anything is sent", async () => {
    const create = vi.fn<CreateJournalEntry>();
    const { store } = storeWith(create);
    store.change((draft) => ({ ...draft, logReading: false }));
    await expect(store.save()).rejects.toBeInstanceOf(EntryDraftProblem);
    expect(create).not.toHaveBeenCalled();
    expect(store.getSnapshot().save.status).toBe("idle");
  });

  test("only the server's ENTRY_CONFLICT counts as a conflict", () => {
    expect(entryConflictOf(new ConvexError({ code: "ENTRY_CONFLICT", id: "a", journalDate: "2026-10-24" }))).toEqual({ id: "a", journalDate: "2026-10-24" });
    expect(entryConflictOf(new ConvexError({ code: "REVISION_CONFLICT", currentRevision: 2 }))).toBeNull();
    expect(entryConflictOf(new Error("ENTRY_CONFLICT"))).toBeNull();
  });
});
