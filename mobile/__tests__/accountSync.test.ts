// The signed-in account's study on the device (src/storage/accountStudy.ts) kept in step with the account by StudySync
// (src/account/studySync.ts), over an in-memory account (testing/fakeStudyServer.ts) with the server's rules. Covers
// notes written on the website showing in the app, edits both ways, offline changes kept across a restart and sent
// once, lost replies, revision conflicts that never overwrite, deletes, verse marks and notes merged field by field,
// an older backend's create reply, and one account's study never reaching another.

import { StudySync, convexSyncClient } from "../src/account/studySync";
import { readCreatedEntry } from "../src/account/api";
import { createHash } from "crypto";
import { sha256Hex } from "../src/account/sessionBinding";
import { annotationChapter, scriptureSource } from "../src/shared/web";
import {
  AccountStudyStore,
  accountJournal,
  accountNote,
  accountNoteBodies,
  chapterAnnotations,
  purgeAccountCache,
  resetAccountStores,
  accountStore,
  type SaveOp,
} from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { searchJournal } from "../src/features/journal/search";
import { FakeStudyServer, flush } from "../testing/fakeStudyServer";

const ALMA_32 = annotationChapter("bookofmormon", "alma", 32);

let port: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  port = memoryStorage();
  setStoragePort(port);
  resetAccountStores();
});

function connect(server: FakeStudyServer, owner: string, store = new AccountStudyStore(owner)) {
  const client = server.client(owner);
  const sync = new StudySync(owner, store, client).start();
  return { store, sync, client };
}

async function settled(sync?: StudySync) {
  for (let round = 0; round < 6; round++) {
    await flush();
    sync?.kick();
  }
  await flush();
}

describe("reading the account's journal", () => {
  it("shows notes written on the website, with their full text for the editor and search, and keeps them offline", async () => {
    const server = new FakeStudyServer();
    const id = server.webCreateNote("ada", "# Faith\nLike a seed planted in the heart.", "2026-10-20", scriptureSource({ volume: "bookofmormon", book: "alma", chapter: 32, reference: "Alma 32" }), true);
    server.webCreateNote("bea", "Bea's private note", "2026-10-20");
    const { store, sync } = connect(server, "ada");
    await settled(sync);

    const entries = accountJournal(store.getSnapshot())!;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "note", id, title: "Faith", journal_date: "2026-10-20" });
    expect(accountNote(store.getSnapshot(), id)?.doc?.markdown_body).toBe("# Faith\nLike a seed planted in the heart.");
    // Search reads the full text, not only the excerpt.
    expect(searchJournal(entries, accountNoteBodies(store.getSnapshot()), "seed heart")).toHaveLength(1);

    // A later website edit arrives, with its revision.
    server.webEditNote(id, "# Faith\nIt began to swell.");
    await settled(sync);
    expect(accountNote(store.getSnapshot(), id)).toMatchObject({ baseRevision: 1, doc: { markdown_body: "# Faith\nIt began to swell." } });

    // A restart offline: the cached journal and note are still there.
    sync.dispose();
    server.setOnline(false);
    const relaunched = new AccountStudyStore("ada");
    expect(accountJournal(relaunched.getSnapshot())).toHaveLength(1);
    expect(accountNote(relaunched.getSnapshot(), id)?.doc?.markdown_body).toBe("# Faith\nIt began to swell.");
  });

  it("fetches every note's text, a few at a time, until all are current", async () => {
    const server = new FakeStudyServer();
    const ids = Array.from({ length: 25 }, (_, index) => server.webCreateNote("ada", `Note ${index}`, "2026-10-01"));
    const { store, sync } = connect(server, "ada");
    await settled(sync);
    await settled(sync);
    expect(ids.every((id) => store.getSnapshot().docs.get(id)?.markdown_body)).toBe(true);
  });
});

describe("writing from the app", () => {
  it("creates, edits and deletes entries in the account, and the website sees each change", async () => {
    const server = new FakeStudyServer();
    const { store, sync } = connect(server, "ada");
    await settled(sync);
    const { id: localId } = store.enqueueCreate({ requestId: "rl-one", markdownBody: "First light", journalDate: "2026-10-28", source: null, logReading: false });
    // Shown at once, before the account confirms it.
    expect(accountJournal(store.getSnapshot())!.map((entry) => entry.id)).toEqual([localId]);
    sync.kick();
    await settled(sync);
    const [note] = server.notesOf("ada");
    expect(note).toMatchObject({ markdownBody: "First light", requestId: "rl-one" });
    // The app's id for it now opens the account's entry.
    expect(accountNote(store.getSnapshot(), localId)).toMatchObject({ id: note.id, baseRevision: 0, sync: { state: "synced" } });

    store.enqueueSave(localId, "First light, then more", 0);
    sync.kick();
    await settled(sync);
    expect(server.notes.get(note.id)).toMatchObject({ markdownBody: "First light, then more", markdownRevision: 1 });
    expect(accountNote(store.getSnapshot(), note.id)).toMatchObject({ baseRevision: 1, sync: { state: "synced" } });

    store.enqueueDelete(note.id);
    expect(accountJournal(store.getSnapshot())).toEqual([]);
    sync.kick();
    await settled(sync);
    expect(server.notesOf("ada")).toHaveLength(0);
    expect(store.getSnapshot().outbox.ops).toHaveLength(0);
  });

  it("keeps changes made offline across a restart and sends each exactly once when back online", async () => {
    const server = new FakeStudyServer();
    server.setOnline(false);
    const first = connect(server, "ada");
    const { id } = first.store.enqueueCreate({ requestId: "rl-offline", markdownBody: "Written on the train", journalDate: "2026-10-28", source: null, logReading: false });
    first.store.enqueueSave(id, "Written on the train, revised", 0);
    first.store.enqueueMarks(ALMA_32, [21], { highlightColor: "yellow" });
    first.sync.kick();
    await settled(first.sync);
    expect(server.calls).toHaveLength(0);
    // The mark shows offline, by the server's own rules.
    expect(chapterAnnotations(first.store.getSnapshot(), ALMA_32).get(21)).toMatchObject({ highlight_color: "yellow" });

    // The app is closed and opened again, then the connection returns.
    first.sync.dispose();
    resetAccountStores();
    const second = connect(server, "ada", new AccountStudyStore("ada"));
    expect(second.store.getSnapshot().outbox.ops.map((op) => op.kind)).toEqual(["create", "marks"]);
    server.setOnline(true);
    await settled(second.sync);
    expect(server.notesOf("ada").map((note) => note.markdownBody)).toEqual(["Written on the train, revised"]);
    expect(server.calls.filter((call) => call.name === "insights:createJournalEntry")).toHaveLength(1);
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 21 })).toMatchObject({ highlightColor: "yellow" });
    expect(second.store.getSnapshot().outbox.ops).toEqual([]);
  });

  it("a create whose reply was lost (the app closed mid-request) names the same entry when sent again", async () => {
    const server = new FakeStudyServer();
    const first = connect(server, "ada");
    await settled(first.sync);
    first.store.enqueueCreate({ requestId: "rl-lost", markdownBody: "Half sent", journalDate: "2026-10-28", source: null, logReading: false });
    server.hangNextMutation();
    first.sync.kick();
    await settled(first.sync);
    expect(server.notesOf("ada")).toHaveLength(1);
    first.sync.dispose();

    resetAccountStores();
    const second = connect(server, "ada", new AccountStudyStore("ada"));
    await settled(second.sync);
    expect(server.notesOf("ada")).toHaveLength(1);
    expect(second.store.getSnapshot().outbox.ops).toEqual([]);
  });

  it("a save whose reply was lost is recognised on retry instead of being reported as a conflict", async () => {
    const server = new FakeStudyServer();
    const id = server.webCreateNote("ada", "Draft", "2026-10-28");
    const first = connect(server, "ada");
    await settled(first.sync);
    first.store.enqueueSave(id, "Draft, finished", 0);
    server.hangNextMutation();
    first.sync.kick();
    await settled(first.sync);
    expect(server.notes.get(id)).toMatchObject({ markdownBody: "Draft, finished", markdownRevision: 1 });
    first.sync.dispose();

    resetAccountStores();
    const second = connect(server, "ada", new AccountStudyStore("ada"));
    await settled(second.sync);
    expect(second.store.getSnapshot().outbox.ops).toEqual([]);
    expect(accountNote(second.store.getSnapshot(), id)).toMatchObject({ baseRevision: 1, sync: { state: "synced" } });
  });

  it("works with a backend whose create doesn't report the revision, reading the entry back", async () => {
    expect(readCreatedEntry("note_9")).toEqual({ id: "note_9", revision: null, deleted: false });
    expect(readCreatedEntry({ id: "note_9", duplicate: false, deleted: false })).toEqual({ id: "note_9", revision: null, deleted: false });
    expect(readCreatedEntry({ id: null, duplicate: true, deleted: true, markdownRevision: null })).toEqual({ id: null, revision: null, deleted: true });
    expect(() => readCreatedEntry({})).toThrow();

    const server = new FakeStudyServer();
    server.legacyCreateReply = true;
    const { store, sync } = connect(server, "ada");
    await settled(sync);
    const { id } = store.enqueueCreate({ requestId: "rl-old", markdownBody: "Old backend", journalDate: "2026-10-28", source: null, logReading: false });
    sync.kick();
    await settled(sync);
    const created = server.notesOf("ada")[0];
    expect(server.calls.some((call) => call.name === "insights:createJournalEntry")).toBe(true);
    expect(accountNote(store.getSnapshot(), id)).toMatchObject({ id: created.id, baseRevision: 0 });
    store.enqueueSave(id, "Old backend, edited", 0);
    sync.kick();
    await settled(sync);
    expect(server.notes.get(created.id)).toMatchObject({ markdownBody: "Old backend, edited", markdownRevision: 1 });
  });
});

describe("conflicts never overwrite", () => {
  async function conflicted() {
    const server = new FakeStudyServer();
    const id = server.webCreateNote("ada", "Original", "2026-10-28");
    const { store, sync } = connect(server, "ada");
    await settled(sync);
    server.setOnline(false);
    store.enqueueSave(id, "Edited in the app", 0);
    // Meanwhile, on the website.
    server.online = true;
    server.webEditNote(id, "Edited on the website");
    server.online = false;
    server.setOnline(true);
    await settled(sync);
    return { server, id, store, sync };
  }

  it("stops a save based on an older revision, keeping both versions until the owner chooses", async () => {
    const { server, id, store } = await conflicted();
    expect(server.notes.get(id)?.markdownBody).toBe("Edited on the website");
    const view = accountNote(store.getSnapshot(), id)!;
    expect(view.sync).toMatchObject({ state: "conflict", conflict: { kind: "revision", serverRevision: 1, serverText: "Edited on the website" }, text: "Edited in the app" });
    expect(view.doc?.markdown_body).toBe("Edited in the app");
  });

  it("keep mine saves over the newer version only when chosen", async () => {
    const { server, id, store, sync } = await conflicted();
    const op = store.getSnapshot().outbox.ops[0] as SaveOp;
    store.resolve(op.opId, "keepMine");
    sync.kick();
    await settled(sync);
    expect(server.notes.get(id)).toMatchObject({ markdownBody: "Edited in the app", markdownRevision: 2 });
  });

  it("use the newer version drops the app's text; save as new keeps it as a separate entry", async () => {
    const theirs = await conflicted();
    theirs.store.resolve(theirs.store.getSnapshot().outbox.ops[0].opId, "useTheirs");
    expect(accountNote(theirs.store.getSnapshot(), theirs.id)?.doc?.markdown_body).toBe("Edited on the website");
    expect(theirs.store.getSnapshot().outbox.ops).toEqual([]);

    const mine = await conflicted();
    mine.store.resolve(mine.store.getSnapshot().outbox.ops[0].opId, "saveAsNew");
    mine.sync.kick();
    await settled(mine.sync);
    expect(mine.server.notesOf("ada").map((note) => note.markdownBody).sort()).toEqual(["Edited in the app", "Edited on the website"]);
  });

  it("a note deleted on the website keeps the app's unsent text as a conflict, and a delete of it is already done", async () => {
    const server = new FakeStudyServer();
    const kept = server.webCreateNote("ada", "Kept", "2026-10-28");
    const gone = server.webCreateNote("ada", "Gone", "2026-10-28");
    const { store, sync } = connect(server, "ada");
    await settled(sync);
    server.setOnline(false);
    store.enqueueSave(kept, "Kept, edited here", 0);
    store.enqueueDelete(gone);
    server.online = true;
    server.webDeleteNote(kept);
    server.webDeleteNote(gone);
    server.online = false;
    server.setOnline(true);
    await settled(sync);
    expect(accountNote(store.getSnapshot(), kept)?.sync).toMatchObject({ state: "conflict", conflict: { kind: "missing" } });
    expect(store.getSnapshot().outbox.ops.map((op) => op.kind)).toEqual(["save"]);
  });

  it("an entry edited on the website before the app's create retry finished is not overwritten (ENTRY_CONFLICT)", async () => {
    const server = new FakeStudyServer();
    const { store, sync } = connect(server, "ada");
    await settled(sync);
    store.enqueueCreate({ requestId: "rl-race", markdownBody: "From the app", journalDate: "2026-10-28", source: null, logReading: false });
    server.hangNextMutation();
    sync.kick();
    await settled(sync);
    sync.dispose();
    const [created] = server.notesOf("ada");
    server.webEditNote(created.id, "Edited on the website");
    // The app is reopened with more typed into the entry before the create was confirmed.
    resetAccountStores();
    const again = new AccountStudyStore("ada");
    again.enqueueSave(again.getSnapshot().outbox.ops[0] && (again.getSnapshot().outbox.ops[0] as { localId: string }).localId, "From the app, longer", 0);
    const second = connect(server, "ada", again);
    await settled(second.sync);
    expect(server.notes.get(created.id)?.markdownBody).toBe("Edited on the website");
    expect(again.getSnapshot().outbox.ops[0]).toMatchObject({ kind: "create", status: "conflict", conflict: { kind: "entry", id: created.id } });
  });
});

describe("verse notes and marks", () => {
  it("shows marks made on the website, and sends quick marks as patches that keep the website's note", async () => {
    const server = new FakeStudyServer();
    server.webAnnotate("ada", { ...ALMA_32, verse: 21 }, { body: "Faith is not a perfect knowledge" });
    const { store, sync } = connect(server, "ada");
    const stop = sync.watchChapter(ALMA_32);
    await settled(sync);
    expect(chapterAnnotations(store.getSnapshot(), ALMA_32).get(21)).toMatchObject({ body: "Faith is not a perfect knowledge", highlight_color: null });

    store.enqueueMarks(ALMA_32, [21, 22], { highlightColor: "green" });
    sync.kick();
    await settled(sync);
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 21 })).toMatchObject({ body: "Faith is not a perfect knowledge", highlightColor: "green" });
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 22 })).toMatchObject({ body: "", highlightColor: "green" });
    stop();
  });

  it("merges a verse note edit with a mark changed on the website, and stops when both changed the note", async () => {
    const server = new FakeStudyServer();
    server.webAnnotate("ada", { ...ALMA_32, verse: 27 }, { body: "Awake and arouse", highlightColor: "yellow" });
    const { store, sync } = connect(server, "ada");
    sync.watchChapter(ALMA_32);
    await settled(sync);
    const opened = chapterAnnotations(store.getSnapshot(), ALMA_32).get(27)!;

    // The website changes the highlight; the app changes the note: both are kept.
    server.webAnnotate("ada", { ...ALMA_32, verse: 27 }, { highlightColor: "blue" });
    store.enqueueVerseNote({ ...ALMA_32, verse: 27 }, { id: opened.id, body: opened.body, highlightColor: "yellow", underlineColor: null }, { body: "Awake, and experiment", highlightColor: "yellow", underlineColor: null });
    sync.kick();
    await settled(sync);
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 27 })).toMatchObject({ body: "Awake, and experiment", highlightColor: "blue" });

    // Both change the note: the website's stays until the owner chooses.
    const reopened = chapterAnnotations(store.getSnapshot(), ALMA_32).get(27)!;
    server.webAnnotate("ada", { ...ALMA_32, verse: 27 }, { body: "Written on the website" });
    store.enqueueVerseNote({ ...ALMA_32, verse: 27 }, { id: reopened.id, body: reopened.body, highlightColor: "blue", underlineColor: null }, { body: "Written in the app", highlightColor: "blue", underlineColor: null });
    sync.kick();
    await settled(sync);
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 27 })?.body).toBe("Written on the website");
    const op = store.getSnapshot().outbox.ops[0];
    expect(op).toMatchObject({ kind: "verseNote", status: "conflict", conflict: { kind: "verse", server: { body: "Written on the website" } } });
    store.resolve(op.opId, "keepMine");
    sync.kick();
    await settled(sync);
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 27 })?.body).toBe("Written in the app");
  });

  it("deletes a verse note only if the website hasn't changed it since it was opened", async () => {
    const server = new FakeStudyServer();
    server.webAnnotate("ada", { ...ALMA_32, verse: 28 }, { body: "A seed" });
    const { store, sync } = connect(server, "ada");
    sync.watchChapter(ALMA_32);
    await settled(sync);
    const opened = chapterAnnotations(store.getSnapshot(), ALMA_32).get(28)!;
    store.enqueueVerseDelete({ ...ALMA_32, verse: 28 }, { id: opened.id, body: "A seed", highlightColor: null, underlineColor: null });
    sync.kick();
    await settled(sync);
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 28 })).toBeUndefined();
  });
});

describe("one account's study is never another's", () => {
  it("keeps caches and outboxes apart, and a reply arriving after sign-out changes nothing", async () => {
    const server = new FakeStudyServer();
    server.webCreateNote("ada", "Ada's note", "2026-10-28");
    server.webCreateNote("bea", "Bea's note", "2026-10-28");
    const ada = connect(server, "ada", accountStore("ada"));
    await settled(ada.sync);
    ada.store.enqueueCreate({ requestId: "rl-ada", markdownBody: "Ada offline", journalDate: "2026-10-28", source: null, logReading: false });
    server.setOnline(false);
    ada.sync.kick();
    await settled(ada.sync);

    // Ada signs out while the create waits; the cache goes, the unsent change stays for Ada only.
    ada.sync.dispose();
    purgeAccountCache("ada", { keepOutbox: true });
    server.setOnline(true);
    await settled();
    expect(server.notesOf("ada").map((note) => note.markdownBody)).toEqual(["Ada's note"]);
    expect(ada.store.disposed).toBe(true);
    expect(() => ada.store.enqueueCreate({ markdownBody: "late", journalDate: "2026-10-28", source: null, logReading: false })).toThrow();

    // Bea signs in on the same device: she sees only her study, and nothing of Ada's is sent as hers.
    const bea = connect(server, "bea", accountStore("bea"));
    await settled(bea.sync);
    expect(accountJournal(bea.store.getSnapshot())!.map((entry) => entry.kind === "note" && entry.title)).toEqual(["Bea's note"]);
    expect(server.calls.filter((call) => call.owner === "bea")).toEqual([]);
    expect([...port.data.keys()].filter((key) => key.includes("ada")).every((key) => key.startsWith("vt_account_outbox_v1:"))).toBe(true);

    // Ada signs in again: her kept change is sent to her account.
    bea.sync.dispose();
    const back = connect(server, "ada", accountStore("ada"));
    await settled(back.sync);
    expect(server.notesOf("ada").map((note) => note.markdownBody).sort()).toEqual(["Ada offline", "Ada's note"]);
    expect(server.notesOf("bea").map((note) => note.markdownBody)).toEqual(["Bea's note"]);
  });

  it("drops a reply that lands after the engine stopped", async () => {
    const server = new FakeStudyServer();
    const id = server.webCreateNote("ada", "Note", "2026-10-28");
    const { store, sync } = connect(server, "ada");
    await settled(sync);
    store.enqueueSave(id, "Changed", 0);
    sync.kick();
    // Stopped before the reply is handled (sign-out mid-request).
    sync.dispose();
    store.purge({ keepOutbox: true });
    await settled();
    expect(store.getSnapshot().outbox.ops).toHaveLength(1);
    expect(new AccountStudyStore("ada").getSnapshot().docs.size).toBe(0);
  });
});

describe("the session fingerprint", () => {
  it("is SHA-256, as Node computes it, for any length and text", () => {
    for (const text of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "b".repeat(1000), "tok-ünïcødé-😀-token", "x".repeat(119)]) {
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });
});

describe("unreadable unsynced work", () => {
  it("preserves an unreadable outbox and refuses writes, including across sign-out", () => {
    const key = "vt_account_outbox_v1:ada";
    port.setItem(key, "{broken");
    const store = new AccountStudyStore("ada");
    expect(store.getSnapshot().loadError).toMatch(/couldn't be read/);
    expect(() => store.enqueueCreate({ markdownBody: "New", journalDate: "2026-10-28", source: null, logReading: false })).toThrow(/couldn't be read/);
    store.purge({ keepOutbox: true });
    expect(port.getItem(key)).toBe("{broken");
  });
});

describe("query failure reporting", () => {
  it("reports a rejected subscription instead of leaving a loading screen forever", () => {
    const failed = jest.fn();
    const stop = jest.fn();
    const client = convexSyncClient({ watchQuery: () => ({ onUpdate: () => stop, localQueryResult: () => { throw new Error("Server Error"); } }) } as never);
    const value = jest.fn();
    const unsubscribe = client.watch({}, {}, value, failed);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(value).not.toHaveBeenCalled();
    unsubscribe();
    expect(stop).toHaveBeenCalled();
  });
});
