import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { newBackend, signInAs } from "../convexAuthHarness";

// The desktop app's sync calls (convex/nativeSync.ts and the existing functions native/src/sync.rs uses), with the
// exact argument shapes the app sends, through the real functions and ownership checks.
const chapter = { volume: "bookofmormon", book: "alma", chapter: 32 };
const noMarks = { highlightColor: null, underlineColor: null, textMarks: [] };

async function setup() {
  const t = newBackend();
  const alice = await signInAs(t, "alice");
  const bob = await signInAs(t, "bob");
  return { t, alice: alice.as, bob: bob.as, revokeAlice: alice.revoke };
}
type VerseRow = { body: string; highlight_color: string | null; underline_color: string | null; text_marks?: unknown[] };
async function verse(as: Awaited<ReturnType<typeof setup>>["alice"], number: number): Promise<VerseRow | null> {
  const rows = (await as.query(api.annotations.getChapterAnnotations, chapter)).by_verse[number] ?? [];
  return (rows.find((row: { is_mine: boolean }) => row.is_mine) as VerseRow | undefined) ?? null;
}
/** A verse that must exist. */
async function saved(as: Awaited<ReturnType<typeof setup>>["alice"], number: number): Promise<VerseRow> {
  const row = await verse(as, number);
  expect(row).not.toBeNull();
  return row!;
}

describe("desktop verse sync", () => {
  test("marks from the app never overwrite a note written on the website", async () => {
    const { alice } = await setup();
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 21, body: "Written on the website" });
    await alice.mutation(api.nativeSync.applyVerse, {
      ...chapter,
      verse: 21,
      marks: { highlightColor: "green", underlineColor: "#123abc", textMarks: [{ start: 0, end: 3, text: "And", kind: "underline", color: "blue" }] },
    });
    const row = await saved(alice, 21);
    expect(row.body).toBe("Written on the website");
    expect(row.highlight_color).toBe("green");
    expect(row.underline_color).toBe("#123abc");
    expect(row.text_marks).toHaveLength(1);
    // And a note from the app leaves the website's marks alone.
    await alice.mutation(api.annotations.setVerseMarks, { ...chapter, verses: [21], highlightColor: "pink" });
    await alice.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 21, note: "  From   the app  " });
    const after = await saved(alice, 21);
    expect(after.body).toBe("From the app");
    expect(after.highlight_color).toBe("pink");
  });

  test("clearing the note and the marks removes the verse, and repeating it is harmless", async () => {
    const { alice } = await setup();
    await alice.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 3, note: "Gone soon", marks: { ...noMarks, highlightColor: "yellow" } });
    await alice.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 3, note: "" });
    expect((await saved(alice, 3)).highlight_color).toBe("yellow");
    for (let i = 0; i < 2; i += 1) {
      expect(await alice.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 3, marks: noMarks })).toMatchObject({ removed: true });
    }
    expect(await verse(alice, 3)).toBeNull();
  });

  test("an invalid change is refused as a whole, with a code the app can read", async () => {
    const { alice } = await setup();
    await alice.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 4, note: "Kept" });
    await expect(
      alice.mutation(api.nativeSync.applyVerse, {
        ...chapter,
        verse: 4,
        note: "Replaced",
        marks: { ...noMarks, textMarks: [{ start: 0, end: 9, text: "too short", kind: "highlight", color: "not-a-color" as "red" }] },
      })
    ).rejects.toMatchObject({ data: { code: "INVALID" } });
    expect((await saved(alice, 4)).body).toBe("Kept");
    await expect(alice.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 4, note: "x".repeat(1201) })).rejects.toMatchObject({
      data: { code: "INVALID" },
    });
  });

  test("each account changes only its own verses", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 5, note: "Alice's" });
    await bob.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 5, marks: noMarks });
    expect((await saved(alice, 5)).body).toBe("Alice's");
    expect(await verse(bob, 5)).toBeNull();
  });

  test("a signed-out session is told apart from a refusal", async () => {
    const { alice, revokeAlice } = await setup();
    await revokeAlice();
    await expect(alice.mutation(api.nativeSync.applyVerse, { ...chapter, verse: 1, note: "x" })).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
  });
});

describe("desktop journal sync", () => {
  const create = { journalDate: "2026-10-27", markdownBody: "# Seeds\n\nA particle of faith — ✓", logReading: false, requestId: "a1b2c3d4e5f60718293a4b5c6d7e8f90" };

  test("a retried create returns the same entry and its revision", async () => {
    const { alice } = await setup();
    const first = await alice.mutation(api.insights.createJournalEntry, create);
    expect(first).toMatchObject({ duplicate: false, markdownRevision: 0 });
    // The reply was lost and the note edited before the retry: same entry, new text, a new revision.
    const retry = await alice.mutation(api.insights.createJournalEntry, { ...create, markdownBody: "# Seeds\n\nMore." });
    expect(retry).toMatchObject({ id: first.id, duplicate: true, markdownRevision: 1 });
    expect(await alice.query(api.insights.listMyJournal, {})).toHaveLength(1);
    const saved = await alice.mutation(api.nativeSync.saveJournalNote, {
      draftId: first.id as Id<"insightDrafts">,
      markdownBody: "# Seeds\n\nRewritten.",
      expectedRevision: retry.markdownRevision!,
    });
    expect(saved.markdownRevision).toBe(2);
  });

  test("text based on an older revision is refused; metadata alone is applied", async () => {
    const { alice } = await setup();
    const { id } = await alice.mutation(api.insights.createJournalEntry, create);
    const draftId = id as Id<"insightDrafts">;
    await alice.mutation(api.insights.saveJournalNote, { draftId, markdownBody: "Edited on the website", expectedRevision: 0 });
    await expect(
      alice.mutation(api.nativeSync.saveJournalNote, { draftId, markdownBody: "Edited in the app", expectedRevision: 0 })
    ).rejects.toMatchObject({ data: { code: "REVISION_CONFLICT" } });
    const source = { kind: "guide" as const, label: "Jeremiah 31–33", href: "/come-follow-me/2026-10-26" };
    await alice.mutation(api.nativeSync.saveJournalNote, { draftId, journalDate: "2026-10-26", source, logged: true });
    const draft = await alice.query(api.insights.getDraft, { draftId });
    expect(draft!.markdown_body).toBe("Edited on the website");
    expect(draft!.journal_date).toBe("2026-10-26");
    expect(draft!.source).toEqual(source);
    expect(draft!.reading_at).not.toBeNull();
    await alice.mutation(api.nativeSync.saveJournalNote, { draftId, source: null, logged: false });
    expect((await alice.query(api.insights.getDraft, { draftId }))!.reading_at).toBeNull();
  });

  test("deleting is idempotent, and a deleted entry's late create stays deleted", async () => {
    const { alice, bob } = await setup();
    const { id } = await alice.mutation(api.insights.createJournalEntry, create);
    const draftId = id as Id<"insightDrafts">;
    expect(await bob.mutation(api.nativeSync.deleteJournalNote, { draftId })).toEqual({ deleted: false });
    await expect(bob.mutation(api.nativeSync.saveJournalNote, { draftId, markdownBody: "x", expectedRevision: 0 })).rejects.toMatchObject({
      data: { code: "NOT_FOUND" },
    });
    expect(await alice.mutation(api.nativeSync.deleteJournalNote, { draftId })).toEqual({ deleted: true });
    expect(await alice.mutation(api.nativeSync.deleteJournalNote, { draftId })).toEqual({ deleted: false });
    expect(await alice.mutation(api.insights.createJournalEntry, create)).toMatchObject({ id: null, deleted: true });
    expect(await alice.query(api.insights.listMyJournal, {})).toHaveLength(0);
  });

  test("readings logged from the app are idempotent and can be removed from the history", async () => {
    const { alice } = await setup();
    const log = { source: { kind: "guide" as const, label: "Jeremiah 31–33", href: "/come-follow-me/2026-10-26" }, journalDate: "2026-10-26", requestId: "reading-0001" };
    const first = await alice.mutation(api.readingProgress.logReading, log);
    expect((await alice.mutation(api.readingProgress.logReading, log)).id).toBe(first.id);
    const mark = await alice.mutation(api.readingProgress.markChapterRead, { ...chapter, journalDate: "2026-10-27", requestId: "reading-0002" });
    expect(await alice.query(api.readingProgress.listMyReadingLog, {})).toHaveLength(2);
    expect(await alice.mutation(api.nativeSync.removeReading, { readingId: first.id })).toEqual({ removed: true });
    const left = await alice.query(api.readingProgress.listMyReadingLog, {});
    expect(left.map((r: { id: string }) => r.id)).toEqual([mark.logId]);
    expect(await alice.mutation(api.nativeSync.removeReading, { readingId: "not-an-id" })).toEqual({ removed: false });
    // The chapter is still read; unmarking it is separate, as on the website.
    expect((await alice.query(api.readingProgress.getMyProgressForBook, { volume: "bookofmormon", book: "alma" }))!.readChapters).toEqual([32]);
  });
});

describe("copying the desktop app's own study into the account", () => {
  test("the app's import calls are accepted once and never replace the account's study", async () => {
    const { t, alice } = await setup();
    const owner = (await alice.mutation(api.users.ensureCurrentUser, {}))!.appUserId as string;
    // Exactly what native/src/sync.rs device_imports sends.
    const note = {
      deviceId: "native-note:0123456789abcdef0123456789abcdef",
      expectedOwner: owner,
      markdownBody: "# Before signing in\n\nWritten on this computer — ✓",
      journalDate: "2026-10-20",
      createdAt: 1_790_000_000_000,
      updatedAt: 1_790_000_100_000,
      source: { kind: "guide" as const, label: "Jeremiah 1–10", href: "/come-follow-me/2026-10-19" },
    };
    const first = await alice.mutation(api.insights.importDeviceNote, note);
    expect((await alice.mutation(api.insights.importDeviceNote, { ...note, markdownBody: "changed later" })).id).toBe(first.id);
    const drafts = await alice.query(api.insights.listMyJournal, {});
    expect(drafts.filter((d: { kind: string }) => d.kind === "note")).toHaveLength(1);
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 21, body: "The account's own note", highlightColor: "blue" });
    const verse21 = {
      ...chapter,
      verse: 21,
      body: "faith is",
      deviceImportId: "native-verse:bookofmormon:alma:32:21",
      deviceImportOwner: owner,
      highlightColor: "yellow" as const,
    };
    await alice.mutation(api.annotations.upsertVerseAnnotation, verse21);
    await alice.mutation(api.annotations.upsertVerseAnnotation, verse21);
    const row = await saved(alice, 21);
    // The account keeps its mark; the device's note is added to the account's, once.
    expect(row.highlight_color).toBe("blue");
    expect(row.body).toBe("The account's own note\n\nfaith is");
    await expect(alice.mutation(api.insights.importDeviceNote, { ...note, deviceId: "native-note:other", expectedOwner: "someone-else" })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("deviceStudyImports").collect())).toHaveLength(2);
  });
});

describe("desktop guide prose marks", () => {
  // native/src/sync.rs guide_args: the span's whole state, found by its anchor.
  const anchor = {
    guide: "2026-10-26",
    part: "reader" as const,
    startBlock: "jeremiah-31-1-3-everlasting-love-for-all-the-families-of-israel",
    startOffset: 312,
    endBlock: "jeremiah-31-1-3-everlasting-love-for-all-the-families-of-israel",
    endOffset: 317,
    exact: "ḥesed",
    prefix: "therefore with lovingkindness is ",
    suffix: ", covenant loyalty. God's love do",
  };
  test("setting the same span twice updates it, and an emptied span is removed", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.annotations.setGuideAnnotation, { ...anchor, body: "", highlightColor: "green", underlineColor: null });
    await alice.mutation(api.annotations.setGuideAnnotation, { ...anchor, body: "Covenant love", highlightColor: "green", underlineColor: "#123abc" });
    const rows = await alice.query(api.annotations.getGuideHighlights, { guide: anchor.guide });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ exact: "ḥesed", highlightColor: "green", underlineColor: "#123abc", body: "Covenant love", startOffset: 312 });
    expect(await bob.query(api.annotations.getGuideHighlights, { guide: anchor.guide })).toHaveLength(0);
    await alice.mutation(api.annotations.setGuideAnnotation, { ...anchor, body: "", highlightColor: null, underlineColor: null });
    await alice.mutation(api.annotations.setGuideAnnotation, { ...anchor, body: "", highlightColor: null, underlineColor: null });
    expect(await alice.query(api.annotations.getGuideHighlights, { guide: anchor.guide })).toHaveLength(0);
  });
});

describe("desktop reading plans", () => {
  test("a quick-start plan created as the app sends it reads its progress from chapter marks", async () => {
    const { alice } = await setup();
    const steps = Array.from({ length: 22 }, (_, i) => ({ volume: "bookofmormon", book: "1nephi", chapter: i + 1, label: `1 Nephi ${i + 1}` }));
    const { id } = await alice.mutation(api.readingPlans.createPlan, {
      title: "1 Nephi, a chapter a day", template: "book-daily", steps, startDate: "2026-10-27", chaptersPerDay: 1,
    });
    await alice.mutation(api.readingProgress.markChapterRead, { volume: "bookofmormon", book: "1nephi", chapter: 2 });
    const plan = await alice.query(api.readingPlans.getPlan, { planId: id });
    expect(plan).toMatchObject({ stepCount: 22, readCount: 1, chaptersPerDay: 1, startDate: "2026-10-27" });
    expect(plan!.steps[1].readAt).not.toBeNull();
    expect(await alice.query(api.readingPlans.listMyPlans, {})).toHaveLength(1);
  });

  test("the builder's plan is created and edited with its selections, pace and reading days", async () => {
    const { alice, bob } = await setup();
    // Exactly what native/src/plans.rs `plan_call` sends for "Pearl of Great Price + Mark 2–5", weekdays, 5 a day.
    const pearl = [
      ...Array.from({ length: 8 }, (_, i) => ["moses", "Moses", i + 1] as const),
      ...Array.from({ length: 5 }, (_, i) => ["abraham", "Abraham", i + 1] as const),
      ["josephsmithmatthew", "Joseph Smith-Matthew", 1] as const,
      ["josephsmithhistory", "Joseph Smith-History", 1] as const,
      ["articlesoffaith", "Articles of Faith", 1] as const,
    ].map(([book, label, chapter]) => ({ volume: "pearl", book, chapter, label: `${label} ${chapter}` }));
    const mark = [2, 3, 4, 5].map((chapter) => ({ volume: "newtestament", book: "mark", chapter, label: `Mark ${chapter}` }));
    const selections = [
      { kind: "volume" as const, volume: "pearl" },
      { kind: "range" as const, volume: "newtestament", book: "mark", from: 2, to: 5 },
    ];
    const weekdays = [true, true, true, true, true, false, false];
    const { id } = await alice.mutation(api.readingPlans.createPlan, {
      title: "Pearl of Great Price + Mark 2–5", template: "custom", steps: [...pearl, ...mark], selections,
      startDate: "2026-11-02", chaptersPerDay: 5, readingDays: weekdays,
    });
    await alice.mutation(api.readingProgress.markChapterRead, { volume: "newtestament", book: "mark", chapter: 3 });
    const plan = await alice.query(api.readingPlans.getPlan, { planId: id });
    expect(plan).toMatchObject({ stepCount: 20, readCount: 1, chaptersPerDay: 5, readingDays: weekdays, selections, template: "custom" });

    // Editing: Mark alone, two a day, every day. Read chapters stay read; every day is stored as the default.
    await alice.mutation(api.readingPlans.updatePlan, {
      planId: id, title: "Mark", steps: Array.from({ length: 16 }, (_, i) => ({ volume: "newtestament", book: "mark", chapter: i + 1, label: `Mark ${i + 1}` })),
      selections: [{ kind: "book", volume: "newtestament", book: "mark" }], startDate: "2026-11-02", chaptersPerDay: 2,
      readingDays: [true, true, true, true, true, true, true],
    });
    const edited = await alice.query(api.readingPlans.getPlan, { planId: id });
    expect(edited).toMatchObject({ title: "Mark", stepCount: 16, readCount: 1, chaptersPerDay: 2, readingDays: null });
    expect(edited!.steps[2].readAt).not.toBeNull();

    // Another account can neither read nor edit it.
    expect(await bob.query(api.readingPlans.getPlan, { planId: id })).toBeNull();
    await expect(
      bob.mutation(api.readingPlans.updatePlan, { planId: id, title: "Mine", steps: mark, chaptersPerDay: 1 })
    ).rejects.toThrow(/Plan not found/);
    await alice.mutation(api.readingPlans.deletePlan, { planId: id });
    expect(await alice.query(api.readingPlans.listMyPlans, {})).toEqual([]);
  });
});
