import { describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { newBackend, signInAs } from "./convexAuthHarness";

const source = { kind: "scripture" as const, label: "1 Nephi 2:3-5", href: "/browse/bookofmormon/1-nephi/2#v-3", volume: "bookofmormon", book: "1-nephi", chapter: 2, verseStart: 3, verseEnd: 5 };
const input = { journalDate: "2026-10-24", source, markdownBody: "", logReading: true, requestId: "entry-one" };
/** A created (not deleted) entry's id. */
const created = (result: { id: Id<"insightDrafts"> | null }) => {
  if (!result.id) throw new Error("expected a created entry");
  return result.id;
};
async function setup() {
  const t = newBackend();
  const alice = await signInAs(t, "alice");
  const bob = await signInAs(t, "bob");
  return { t, alice: alice.as, bob: bob.as };
}

describe("unified journal entries", () => {
  test.each([
    { markdownBody: "# A note\n\nWithout reading", logReading: false },
    { markdownBody: "", logReading: true },
    { markdownBody: "# Reading and a thought\n\nExact text #faith  \n", logReading: true },
  ])("persists and reopens $logReading reading with '$markdownBody' as one entry", async (content) => {
    const { alice, t } = await setup();
    const id = created(await alice.mutation(api.insights.createJournalEntry, { ...input, ...content }));
    const doc = await alice.query(api.insights.getDraft, { draftId: id });
    expect(doc!.markdown_body).toBe(content.markdownBody);
    expect(doc!.source).toEqual(source);
    expect(doc!.journal_date).toBe(input.journalDate);
    expect(!!doc!.reading_at).toBe(content.logReading);
    expect(await alice.query(api.insights.listMyJournal, {})).toEqual([expect.objectContaining({ id, reading_at: doc!.reading_at })]);
    const readings = await alice.query(api.readingProgress.listMyReadingLog, {});
    expect(readings).toHaveLength(content.logReading ? 1 : 0);
    if (content.logReading) expect(readings[0].note_id).toBe(id);
    expect(await t.run(ctx => ctx.db.query("chapterReads").collect())).toHaveLength(0);
  });

  test("supports a personal note and rejects empty entries, invalid dates and unlinked reading", async () => {
    const { alice } = await setup();
    const id = created(await alice.mutation(api.insights.createJournalEntry, { ...input, source: undefined, logReading: false, markdownBody: "A personal note" }));
    expect((await alice.query(api.insights.getDraft, { draftId: id }))!.source).toBeNull();
    for (const change of [{ markdownBody: "  ", logReading: false }, { journalDate: "2026-02-30" }, { source: undefined }, { source: { ...source, href: "//example.com" } }]) {
      await expect(alice.mutation(api.insights.createJournalEntry, { ...input, ...change, requestId: "invalid-entry" })).rejects.toThrow();
    }
  });

  test("deduplicates retries per owner and protects reading updates", async () => {
    const { t, alice, bob } = await setup();
    await expect(t.mutation(api.insights.createJournalEntry, input)).rejects.toThrow();
    const first = await alice.mutation(api.insights.createJournalEntry, input);
    expect(await alice.mutation(api.insights.createJournalEntry, input)).toEqual({ ...first, duplicate: true });
    expect(await alice.query(api.insights.listMyJournal, {})).toHaveLength(1);
    expect(await bob.query(api.insights.listMyJournal, {})).toHaveLength(0);
    await expect(bob.mutation(api.insights.setJournalReading, { draftId: created(first), logged: false })).rejects.toThrow();
    expect((await bob.mutation(api.insights.createJournalEntry, input)).id).not.toBe(first.id);
  });

  test("adds a note to a reading, then changes reading without losing text or duplicating history", async () => {
    const { alice } = await setup();
    const id = created(await alice.mutation(api.insights.createJournalEntry, input));
    await expect(alice.mutation(api.insights.setJournalReading, { draftId: id, logged: false })).rejects.toThrow();
    await alice.mutation(api.insights.saveJournalNote, { draftId: id, markdownBody: "A later thought", expectedRevision: 0 });
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: false });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toHaveLength(0);
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: true });
    const before = await alice.query(api.insights.getDraft, { draftId: id });
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: true });
    const after = await alice.query(api.insights.getDraft, { draftId: id });
    expect(after!.markdown_body).toBe("A later thought");
    expect(after!.markdown_revision).toBe(1);
    expect(after!.reading_at).toBe(before!.reading_at);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toHaveLength(1);
    expect(await alice.query(api.insights.listMyJournal, {})).toHaveLength(1);
  });
  test("opens older manual readings once so a note can be added to the same history item", async () => {
    const { alice, bob } = await setup();
    const reading = await alice.mutation(api.readingProgress.logReading, { source, journalDate: input.journalDate, requestId: "old-reading" });
    await expect(bob.mutation(api.insights.openReadingEntry, { readingId: reading.id })).rejects.toThrow();
    const { id } = await alice.mutation(api.insights.openReadingEntry, { readingId: reading.id });
    expect(await alice.mutation(api.insights.openReadingEntry, { readingId: reading.id })).toEqual({ id });
    await alice.mutation(api.insights.saveJournalNote, { draftId: id, markdownBody: "An added note", expectedRevision: 0 });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([expect.objectContaining({ note_id: id, source })]);
    expect(await alice.query(api.insights.listMyJournal, {})).toHaveLength(1);
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: false });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toHaveLength(0);
  });

  test("keeps an opened legacy chapter reading once when its completion is later unmarked or reread", async () => {
    const { alice, t } = await setup();
    const readAt = Date.UTC(2026, 9, 20);
    const readingId = await t.run(ctx => ctx.db.insert("chapterReads", { clerkId: "alice", volume: "bookofmormon", book: "1-nephi", chapter: 2, readAt }));
    const { id } = await alice.mutation(api.insights.openReadingEntry, { readingId });
    await alice.mutation(api.readingProgress.unmarkChapterRead, { volume: "bookofmormon", book: "1-nephi", chapter: 2 });
    const history = await alice.query(api.readingProgress.listMyReadingLog, {});
    expect(history).toEqual([expect.objectContaining({ note_id: id, read_at: new Date(readAt).toISOString() })]);
    const preserved = await t.run(ctx => ctx.db.query("readingLogs").first());
    expect(await alice.mutation(api.insights.openReadingEntry, { readingId: preserved!._id })).toEqual({ id });
    await alice.mutation(api.readingProgress.markChapterRead, { volume: "bookofmormon", book: "1-nephi", chapter: 2, journalDate: input.journalDate, requestId: "reread" });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toHaveLength(2);
  });

  test("can log an older note's inferred reading source and keeps reading metadata private when sharing", async () => {
    const { alice, bob } = await setup();
    const { id } = await alice.mutation(api.insights.createDraft, { title: "Older note", visibility: "link" });
    await alice.mutation(api.insights.appendScriptureBlock, { draftId: id, volume: "bookofmormon", book: "1-nephi", chapter: 2, verseStart: 3, verseEnd: 5, reference: "1 Nephi 2:3-5" });
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: true });
    const doc = await alice.query(api.insights.getDraft, { draftId: id });
    expect(doc!.reading_at).toBeTruthy();
    expect(doc!.source).toEqual(expect.objectContaining({ kind: "scripture", chapter: 2, verseStart: 3, verseEnd: 5 }));
    expect(await bob.query(api.insights.getSharedDraft, { draftId: id })).not.toHaveProperty("reading_at");
  });

  test("edits a reading's range and day without changing the note body or revision", async () => {
    const { alice, bob } = await setup();
    const id = created(await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Keep this note" }));
    const edited = { ...source, label: "1 Nephi 2:6-8", href: "/browse/bookofmormon/1nephi/2#v-6", verseStart: 6, verseEnd: 8 };
    const update = { draftId: id, logged: true, source: edited, journalDate: "2026-10-23" };
    await expect(bob.mutation(api.insights.setJournalReading, update)).rejects.toThrow();
    await alice.mutation(api.insights.setJournalReading, update);
    const saved = (await alice.query(api.insights.getDraft, { draftId: id }))!;
    expect(saved.source).toEqual(edited);
    expect(saved.journal_date).toBe("2026-10-23");
    expect(saved.markdown_body).toBe("Keep this note");
    expect(saved.markdown_revision).toBe(0);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([expect.objectContaining({ note_id: id, source: edited, journal_date: "2026-10-23" })]);
    await expect(alice.mutation(api.insights.setJournalReading, { ...update, journalDate: "2026-02-30" })).rejects.toThrow();
  });
});

const chapter = { volume: "bookofmormon", book: "1-nephi", chapter: 2 };
const progressOf = async (as: Awaited<ReturnType<typeof setup>>["alice"]) =>
  (await as.query(api.readingProgress.getMyProgressForBook, { volume: chapter.volume, book: chapter.book }))!.readChapters;

describe("deleting and retrying unified entries", () => {
  test("a create retried after the entry was deleted stays deleted, with nothing in the journal or history", async () => {
    const { t, alice } = await setup();
    const first = await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Private text" });
    await alice.mutation(api.insights.deleteDraft, { draftId: first.id! });
    expect(await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Private text" })).toEqual({
      id: null,
      duplicate: true,
      deleted: true,
    });
    expect(await alice.query(api.insights.listMyJournal, {})).toEqual([]);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("insightDrafts").collect())).toHaveLength(0);
  });

  test("a retry carries edits made before it while the entry is untouched, and never overwrites later edits", async () => {
    const { alice } = await setup();
    const first = await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "First words", logReading: true });
    const retried = await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "First words, finished", logReading: false });
    expect(retried).toEqual({ id: first.id, duplicate: true, deleted: false });
    let doc = (await alice.query(api.insights.getDraft, { draftId: first.id! }))!;
    expect(doc.markdown_body).toBe("First words, finished");
    expect(doc.markdown_revision).toBe(1);
    expect(doc.reading_at).toBeNull();
    expect(await alice.query(api.insights.listMyJournal, {})).toHaveLength(1);

    await alice.mutation(api.insights.saveJournalNote, { draftId: first.id!, markdownBody: "Edited in the entry", expectedRevision: 1 });
    await expect(
      alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "A stale retry", logReading: true })
    ).rejects.toMatchObject({ data: { code: "ENTRY_CONFLICT", id: first.id } });
    doc = (await alice.query(api.insights.getDraft, { draftId: first.id! }))!;
    expect(doc.markdown_body).toBe("Edited in the entry");
    expect(doc.reading_at).toBeNull();
    // The content the request last wrote is still the same save.
    expect(await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "First words, finished", logReading: false })).toEqual(retried);
  });

  test("a retry that replaces the text invalidates an editor opened on the earlier text", async () => {
    const { t, alice } = await setup();
    const sent = { ...input, markdownBody: "First words", logReading: true };
    const first = created(await alice.mutation(api.insights.createJournalEntry, sent));
    // Another window opens the entry the lost response created, at revision 0.
    const opened = (await alice.query(api.insights.getDraft, { draftId: first }))!;
    expect(opened.markdown_revision).toBe(0);

    // The composer retries with more text: it replaces the untouched entry under a new revision.
    const changed = { ...sent, markdownBody: "First words, and more written before retrying" };
    expect(await alice.mutation(api.insights.createJournalEntry, changed)).toEqual({ id: first, duplicate: true, deleted: false });
    let doc = (await alice.query(api.insights.getDraft, { draftId: first }))!;
    expect(doc.markdown_body).toBe(changed.markdownBody);
    expect(doc.markdown_revision).toBe(1);

    // The other window's editor still names revision 0, so its save is refused instead of dropping the retry's text.
    await expect(
      alice.mutation(api.insights.saveJournalNote, { draftId: first, markdownBody: "First words, from the old editor", expectedRevision: 0 })
    ).rejects.toMatchObject({ data: { code: "REVISION_CONFLICT", currentRevision: 1 } });
    doc = (await alice.query(api.insights.getDraft, { draftId: first }))!;
    expect(doc.markdown_body).toBe(changed.markdownBody);

    // Repeating the same request is the same save and keeps the revision, so open editors stay valid.
    expect(await alice.mutation(api.insights.createJournalEntry, changed)).toEqual({ id: first, duplicate: true, deleted: false });
    expect((await alice.query(api.insights.getDraft, { draftId: first }))!.markdown_revision).toBe(1);
    // A reading-only change keeps the text and its revision.
    const moved = { ...changed, journalDate: "2026-10-23" };
    expect(await alice.mutation(api.insights.createJournalEntry, moved)).toEqual({ id: first, duplicate: true, deleted: false });
    doc = (await alice.query(api.insights.getDraft, { draftId: first }))!;
    expect([doc.journal_date, doc.markdown_revision]).toEqual(["2026-10-23", 1]);

    // With nothing edited elsewhere, a further changed retry still replaces the entry, under the next revision.
    const again = { ...moved, markdownBody: "First words, finished at last" };
    expect(await alice.mutation(api.insights.createJournalEntry, again)).toEqual({ id: first, duplicate: true, deleted: false });
    doc = (await alice.query(api.insights.getDraft, { draftId: first }))!;
    expect([doc.markdown_body, doc.markdown_revision]).toEqual([again.markdownBody, 2]);
    expect(await t.run((ctx) => ctx.db.query("insightDrafts").collect())).toHaveLength(1);

    // An editor at the current revision saves normally; after that edit a changed retry conflicts.
    await alice.mutation(api.insights.saveJournalNote, { draftId: first, markdownBody: "Edited in the entry", expectedRevision: 2 });
    await expect(alice.mutation(api.insights.createJournalEntry, { ...again, markdownBody: "Yet another retry" })).rejects.toMatchObject({
      data: { code: "ENTRY_CONFLICT", id: first },
    });
    expect((await alice.query(api.insights.getDraft, { draftId: first }))!.markdown_body).toBe("Edited in the entry");
    expect(await alice.mutation(api.insights.createJournalEntry, again)).toEqual({ id: first, duplicate: true, deleted: false });
  });

  test("after a lost response and an edit elsewhere, an unchanged retry succeeds and a changed one conflicts", async () => {
    const { t, alice } = await setup();
    const sent = { ...input, markdownBody: "Morning thoughts", logReading: true };
    const first = created(await alice.mutation(api.insights.createJournalEntry, sent));
    // Another window edits the entry while this one never heard back.
    await alice.mutation(api.insights.saveJournalNote, { draftId: first, markdownBody: "Morning thoughts, edited elsewhere", expectedRevision: 0 });

    // Nothing new here: the same save, and the other window's edit stays.
    expect(await alice.mutation(api.insights.createJournalEntry, sent)).toEqual({ id: first, duplicate: true, deleted: false });
    // Text added here since: refused with the entry named, never overwriting the edit or reporting this text saved.
    await expect(
      alice.mutation(api.insights.createJournalEntry, { ...sent, markdownBody: "Morning thoughts and more written here" })
    ).rejects.toMatchObject({ data: { code: "ENTRY_CONFLICT", id: first, journalDate: input.journalDate } });
    // A changed day or dropped reading is a change too.
    for (const change of [{ journalDate: "2026-10-23" }, { logReading: false }]) {
      await expect(alice.mutation(api.insights.createJournalEntry, { ...sent, ...change })).rejects.toMatchObject({
        data: { code: "ENTRY_CONFLICT" },
      });
    }
    const doc = (await alice.query(api.insights.getDraft, { draftId: first }))!;
    expect(doc.markdown_body).toBe("Morning thoughts, edited elsewhere");
    expect(doc.journal_date).toBe(input.journalDate);
    expect(doc.reading_at).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.query("insightDrafts").collect())).toHaveLength(1);
    // A retry matching what the entry now holds is the same save as well.
    expect(
      await alice.mutation(api.insights.createJournalEntry, { ...sent, markdownBody: "Morning thoughts, edited elsewhere" })
    ).toEqual({ id: first, duplicate: true, deleted: false });
  });

  test("a reading edit elsewhere also protects the entry from a changed retry", async () => {
    const { alice } = await setup();
    const first = created(await alice.mutation(api.insights.createJournalEntry, input));
    await alice.mutation(api.insights.setJournalReading, { draftId: first, logged: true, source: { ...source, verseStart: 1, verseEnd: 2 } });
    expect((await alice.mutation(api.insights.createJournalEntry, input)).id).toBe(first);
    await expect(alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Added later" })).rejects.toMatchObject({
      data: { code: "ENTRY_CONFLICT", id: first },
    });
    const doc = (await alice.query(api.insights.getDraft, { draftId: first }))!;
    expect(doc.markdown_body).toBe("");
    expect(doc.source).toMatchObject({ verseStart: 1, verseEnd: 2 });
  });

  test("a reading edit in the create's own millisecond still protects the entry from a changed retry", async () => {
    // Freeze the clock before the backend exists, through setup, create, edit and retry, so the edit's updatedAt
    // can't tell it apart. (Freezing after setup at an earlier time lets convex-test's clock, which never runs
    // behind its last commit, move the edit a millisecond past the create.)
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
      const { t, alice } = await setup();
      const first = created(await alice.mutation(api.insights.createJournalEntry, input));
      await alice.mutation(api.insights.setJournalReading, {
        draftId: first,
        logged: true,
        source: { ...source, verseStart: 1, verseEnd: 2 },
        journalDate: "2026-10-23",
      });
      const row = (await t.run((ctx) => ctx.db.get(first)))!;
      expect(row.updatedAt).toBe(row.createdAt);
      expect(row.markdownRevision).toBe(0);

      await expect(alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Written here meanwhile" })).rejects.toMatchObject({
        data: { code: "ENTRY_CONFLICT", id: first, journalDate: "2026-10-23" },
      });
      const doc = (await alice.query(api.insights.getDraft, { draftId: first }))!;
      expect(doc.markdown_body).toBe("");
      expect(doc.journal_date).toBe("2026-10-23");
      expect(doc.source).toMatchObject({ verseStart: 1, verseEnd: 2 });
      expect(await t.run((ctx) => ctx.db.query("insightDrafts").collect())).toHaveLength(1);
      // The unchanged retry is still the same save, and leaves the edit alone.
      expect(await alice.mutation(api.insights.createJournalEntry, input)).toEqual({ id: first, duplicate: true, deleted: false });
      expect((await alice.query(api.insights.getDraft, { draftId: first }))!.source).toMatchObject({ verseStart: 1, verseEnd: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  test("an entry without a stored fingerprint is never overwritten by a changed retry", async () => {
    const { t, alice } = await setup();
    const first = created(await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Older entry" }));
    await t.run((ctx) => ctx.db.patch(first, { entryRequestFingerprint: undefined }));
    await expect(alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Older entry, changed" })).rejects.toMatchObject({
      data: { code: "ENTRY_CONFLICT", id: first },
    });
    // Matching what it holds is still the same save.
    expect(await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Older entry" })).toEqual({ id: first, duplicate: true, deleted: false });
    expect((await alice.query(api.insights.getDraft, { draftId: first }))!.markdown_body).toBe("Older entry");
  });

  test("request ids that look like older-reading keys are refused", async () => {
    const { alice } = await setup();
    for (const requestId of ["reading:abc", "legacy-chapter-read:abc:1"]) {
      await expect(alice.mutation(api.insights.createJournalEntry, { ...input, requestId })).rejects.toThrow("Invalid request id");
    }
  });

  test("an opened manual reading keeps its time through edits and stays out of history once its entry is deleted", async () => {
    const { t, alice } = await setup();
    const reading = await alice.mutation(api.readingProgress.logReading, { source, journalDate: "2026-10-20", requestId: "old-manual" });
    const original = (await t.run((ctx) => ctx.db.get(reading.id)))!;
    const { id } = await alice.mutation(api.insights.openReadingEntry, { readingId: reading.id });
    let doc = (await alice.query(api.insights.getDraft, { draftId: id }))!;
    expect(doc.reading_at).toBe(new Date(original.readAt).toISOString());
    expect(doc.created_at).toBe(new Date(original.readAt).toISOString());
    expect(doc.journal_date).toBe("2026-10-20");

    const edited = { ...source, label: "1 Nephi 2:6-8", href: "/browse/bookofmormon/1nephi/2#v-6", verseStart: 6, verseEnd: 8 };
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: true, source: edited, journalDate: "2026-10-19" });
    doc = (await alice.query(api.insights.getDraft, { draftId: id }))!;
    expect(doc.reading_at).toBe(new Date(original.readAt).toISOString());
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([
      expect.objectContaining({ note_id: id, source: edited, journal_date: "2026-10-19" }),
    ]);

    await alice.mutation(api.insights.saveJournalNote, { draftId: id, markdownBody: "Now with a note", expectedRevision: 0 });
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: false });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([]);

    await alice.mutation(api.insights.deleteDraft, { draftId: id });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([]);
    expect(await alice.query(api.insights.listMyJournal, {})).toEqual([]);
    // The original stays stored, but can't be reopened into a new entry.
    expect(await t.run((ctx) => ctx.db.get(reading.id))).toEqual(original);
    await expect(alice.mutation(api.insights.openReadingEntry, { readingId: reading.id })).rejects.toThrow("Reading not found");
  });

  test("deleting an opened chapter-mark reading leaves completion alone and doesn't bring back the legacy read", async () => {
    const { alice } = await setup();
    await alice.mutation(api.readingProgress.markChapterRead, { ...chapter, journalDate: "2026-10-20", requestId: "mark-one" });
    const [mark] = await alice.query(api.readingProgress.listMyReadingLog, {});
    expect(mark).toEqual(expect.objectContaining({ kind: "log", origin: "chapter_mark" }));
    const { id } = await alice.mutation(api.insights.openReadingEntry, { readingId: mark.id as never });
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: true, journalDate: "2026-10-18" });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([expect.objectContaining({ note_id: id })]);

    await alice.mutation(api.insights.deleteDraft, { draftId: id });
    expect(await progressOf(alice)).toEqual([2]);
    // The hidden mark still covers the chapter's completion, which isn't listed as a legacy read instead.
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([]);

    await alice.mutation(api.readingProgress.unmarkChapterRead, chapter);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([]);
    await alice.mutation(api.readingProgress.markChapterRead, { ...chapter, journalDate: "2026-10-24", requestId: "mark-two" });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([
      expect.objectContaining({ origin: "chapter_mark", request_id: "mark-two" }),
    ]);
  });

  test("an opened legacy completion stays hidden after deletion, including the snapshot a later unmark or reread keeps", async () => {
    const { t, alice } = await setup();
    const readAt = Date.UTC(2026, 9, 18, 12);
    const readingId = await t.run((ctx) => ctx.db.insert("chapterReads", { clerkId: "alice", ...chapter, readAt }));
    const [legacy] = await alice.query(api.readingProgress.listMyReadingLog, {});
    expect(legacy).toEqual(expect.objectContaining({ kind: "legacy_chapter_read", id: readingId }));
    const { id } = await alice.mutation(api.insights.openReadingEntry, { readingId });
    expect((await alice.query(api.insights.getDraft, { draftId: id }))!.reading_at).toBe(new Date(readAt).toISOString());

    await alice.mutation(api.insights.deleteDraft, { draftId: id });
    expect(await progressOf(alice)).toEqual([2]);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([]);

    // Rereading snapshots the old completion under the same key; it stays hidden while the new mark is listed.
    await alice.mutation(api.readingProgress.markChapterRead, { ...chapter, journalDate: "2026-10-24", requestId: "reread" });
    const snapshots = await t.run((ctx) => ctx.db.query("readingLogs").collect());
    expect(snapshots.map((row) => row.requestId).sort()).toEqual([`legacy-chapter-read:${readingId}:${readAt}`, "reread"]);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([
      expect.objectContaining({ request_id: "reread" }),
    ]);
    const snapshot = snapshots.find((row) => row.requestId !== "reread")!;
    await expect(alice.mutation(api.insights.openReadingEntry, { readingId: snapshot._id })).rejects.toThrow("Reading not found");

    await alice.mutation(api.readingProgress.unmarkChapterRead, chapter);
    expect(await progressOf(alice)).toEqual([]);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([
      expect.objectContaining({ request_id: "reread" }),
    ]);
  });

  test("an opened legacy completion unmarked while its entry exists is listed once, through the entry", async () => {
    const { t, alice } = await setup();
    const readAt = Date.UTC(2026, 9, 18, 12);
    const readingId = await t.run((ctx) => ctx.db.insert("chapterReads", { clerkId: "alice", ...chapter, readAt }));
    const { id } = await alice.mutation(api.insights.openReadingEntry, { readingId });
    await alice.mutation(api.insights.setJournalReading, {
      draftId: id,
      logged: true,
      source: { ...source, label: "1 Nephi 2:1-4", href: "/browse/bookofmormon/1-nephi/2#v-1", verseStart: 1, verseEnd: 4 },
      journalDate: "2026-10-17",
    });
    await alice.mutation(api.readingProgress.unmarkChapterRead, chapter);
    expect(await progressOf(alice)).toEqual([]);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([
      expect.objectContaining({ note_id: id, journal_date: "2026-10-17", read_at: new Date(readAt).toISOString() }),
    ]);
    await alice.mutation(api.insights.saveJournalNote, { draftId: id, markdownBody: "Kept", expectedRevision: 0 });
    await alice.mutation(api.insights.setJournalReading, { draftId: id, logged: false });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([]);
    expect(await alice.query(api.insights.listMyJournal, {})).toEqual([expect.objectContaining({ id, reading_at: null })]);
  });

  test("deleting a new entry that logged a chapter leaves the chapter's completion and its mark in history", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.readingProgress.markChapterRead, { ...chapter, journalDate: "2026-10-24", requestId: "mark" });
    const entry = await alice.mutation(api.insights.createJournalEntry, {
      ...input,
      source: { kind: "scripture", label: "1 Nephi 2", href: "/browse/bookofmormon/1-nephi/2", ...chapter },
    });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toHaveLength(2);
    expect(await bob.query(api.readingProgress.listMyReadingLog, {})).toEqual([]);
    await expect(bob.mutation(api.insights.deleteDraft, { draftId: entry.id! })).rejects.toThrow();
    await alice.mutation(api.insights.deleteDraft, { draftId: entry.id! });
    expect(await progressOf(alice)).toEqual([2]);
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toEqual([
      expect.objectContaining({ origin: "chapter_mark", request_id: "mark" }),
    ]);
  });
});
