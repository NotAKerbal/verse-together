import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { newBackend, signInAs } from "./convexAuthHarness";

const source = { kind: "scripture" as const, label: "1 Nephi 2:3-5", href: "/browse/bookofmormon/1-nephi/2#v-3", volume: "bookofmormon", book: "1-nephi", chapter: 2, verseStart: 3, verseEnd: 5 };
const input = { journalDate: "2026-10-24", source, markdownBody: "", logReading: true, requestId: "entry-one" };
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
    const { id } = await alice.mutation(api.insights.createJournalEntry, { ...input, ...content });
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
    const { id } = await alice.mutation(api.insights.createJournalEntry, { ...input, source: undefined, logReading: false, markdownBody: "A personal note" });
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
    await expect(bob.mutation(api.insights.setJournalReading, { draftId: first.id, logged: false })).rejects.toThrow();
    expect((await bob.mutation(api.insights.createJournalEntry, input)).id).not.toBe(first.id);
  });

  test("adds a note to a reading, then changes reading without losing text or duplicating history", async () => {
    const { alice } = await setup();
    const { id } = await alice.mutation(api.insights.createJournalEntry, input);
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
    const { id } = await alice.mutation(api.insights.createJournalEntry, { ...input, markdownBody: "Keep this note" });
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
