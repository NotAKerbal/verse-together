import { describe, expect, test } from "vitest";
import { DeviceStudyStore, annotationImport, deviceJournal } from "../src/features/notes/deviceStudy";
import { newBackend, signInAs } from "./convexAuthHarness";
import { api } from "../convex/_generated/api";

const source = {
  kind: "scripture" as const,
  label: "1 Nephi 1",
  href: "/browse/bookofmormon/1nephi/1",
  volume: "bookofmormon",
  book: "1nephi",
  chapter: 1,
};
/** The guest's own rows on one chapter, by verse (as the reader shows them). */
function guestVerses(store: DeviceStudyStore, chapter: number) {
  const out: Record<number, ReturnType<DeviceStudyStore["getSnapshot"]>["annotations"]> = {};
  for (const row of store.getSnapshot().annotations) {
    if (row.owner !== null || row.volume !== "dnc" || row.book !== "sections" || row.chapter !== chapter) continue;
    (out[row.verse] ??= []).push(row);
  }
  return out;
}
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("device study persistence", () => {
  test("saves guest goals across reloads and tabs without modifying notes or reading", () => {
    const disk = storage();
    const first = new DeviceStudyStore(() => disk);
    first.createNote({ markdownBody: "Keep this thought", source, logReading: true });
    const notes = first.getSnapshot().notes;
    first.saveJournalGoals({ studyDays: 6, reflections: 4 });
    const reopened = new DeviceStudyStore(() => disk);
    reopened.refresh();
    expect(reopened.getSnapshot().journalGoals).toEqual({ studyDays: 6, reflections: 4 });
    expect(reopened.getSnapshot().notes).toEqual(notes);
    reopened.saveJournalGoals({ studyDays: 2, reflections: 1 });
    first.refresh();
    expect(first.getSnapshot().journalGoals).toEqual({ studyDays: 2, reflections: 1 });
    expect(first.getSnapshot().notes).toEqual(notes);
    expect(() => first.saveJournalGoals({ studyDays: 8, reflections: 1 })).toThrow();
    expect(first.getSnapshot().journalGoals).toEqual({ studyDays: 2, reflections: 1 });
  });

  test("goal storage failure retains the previous targets and existing notes", () => {
    const disk = storage();
    const store = new DeviceStudyStore(() => disk);
    store.createNote({ markdownBody: "Keep this" });
    store.saveJournalGoals({ studyDays: 5, reflections: 3 });
    const before = store.getSnapshot();
    disk.setItem = () => { throw new Error("QuotaExceededError"); };
    expect(() => store.saveJournalGoals({ studyDays: 7, reflections: 5 })).toThrow("QuotaExceededError");
    expect(store.getSnapshot()).toBe(before);
  });

  test("creates, edits and reopens one note with its reading, then removes both", () => {
    const disk = storage();
    const first = new DeviceStudyStore(() => disk);
    const { id } = first.createNote({
      requestId: "one",
      markdownBody: "Original",
      source,
      journalDate: "2026-10-24",
      logReading: true,
    });
    expect(first.createNote({ requestId: "one", markdownBody: "Duplicate" }).id).toBe(id);
    first.saveNote(id, "# Saved thought\n\nExact text  \n", 0);
    const reopened = new DeviceStudyStore(() => disk);
    reopened.refresh();
    expect(reopened.getSnapshot().notes).toHaveLength(1);
    expect(deviceJournal(reopened.getSnapshot())[0]).toMatchObject({
      title: "Saved thought",
      source,
      journal_date: "2026-10-24",
      markdown_revision: 1,
      reading_at: expect.any(String),
    });
    expect(reopened.getSnapshot().notes[0].markdown_body).toBe("# Saved thought\n\nExact text  \n");
    expect(() => first.saveNote(id, "Stale tab", 0)).toThrow("changed somewhere else");
    reopened.setReading(id, { source, journalDate: "2026-10-23" });
    reopened.remove("notes", id);
    first.refresh();
    expect(deviceJournal(first.getSnapshot())).toEqual([]);
  });

  test("refuses success when storage is full and preserves unreadable data", () => {
    const disk = storage();
    const store = new DeviceStudyStore(() => disk);
    store.createNote({ markdownBody: "Keep me" });
    const before = store.getSnapshot();
    disk.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => store.createNote({ markdownBody: "Can't save" })).toThrow("QuotaExceededError");
    expect(store.getSnapshot()).toBe(before);
    const corrupt = {
      getItem: () => "not JSON",
      setItem: () => {
        throw new Error("must never overwrite");
      },
    };
    expect(() => new DeviceStudyStore(() => corrupt).createNote({ markdownBody: "new" })).toThrow();
  });

  test("annotations and guide highlights persist across reload and are editable/deletable", () => {
    const disk = storage();
    const first = new DeviceStudyStore(() => disk);
    first.saveAnnotation(
      { volume: "doctrineandcovenants", book: "sections", chapter: 1, verse: 3 },
      "A verse note",
      { highlightColor: "yellow" },
    );
    first.saveHighlight({
      guide: "2026-10-19",
      part: "reader",
      startBlock: "p-1",
      startOffset: 0,
      endBlock: "p-1",
      endOffset: 4,
      exact: "Text",
      prefix: "",
      suffix: "",
      highlightColor: "green",
    });
    const reopened = new DeviceStudyStore(() => disk);
    reopened.refresh();
    expect(reopened.getSnapshot().annotations[0]).toMatchObject({
      volume: "dnc",
      body: "A verse note",
      highlight_color: "yellow",
    });
    const highlight = reopened.getSnapshot().highlights[0];
    reopened.saveHighlight({ ...highlight, highlightColor: "blue" });
    expect(reopened.getSnapshot().highlights).toHaveLength(1);
    expect(reopened.getSnapshot().highlights[0].highlightColor).toBe("blue");
    reopened.remove("annotations", reopened.getSnapshot().annotations[0].id);
    reopened.remove("highlights", highlight.id);
    expect(reopened.getSnapshot().annotations).toEqual([]);
    expect(reopened.getSnapshot().highlights).toEqual([]);
  });

  test("guest marks: red highlights, colored underlines, and quick marks persist without touching notes", () => {
    const disk = storage();
    const first = new DeviceStudyStore(() => disk);
    const chapter = { volume: "doctrineandcovenants", book: "sections", chapter: 4 };
    first.saveAnnotation({ ...chapter, verse: 2 }, "Keep this", { highlightColor: "red", underlineColor: "blue" });
    first.saveAnnotation({ ...chapter, verse: 5 }, "", { underlineColor: "purple" });
    expect(() => first.saveAnnotation({ ...chapter, verse: 6 }, " ", {})).toThrow();
    // A quick mark on verses with and without rows: the note stays, the other mark stays, a new row is mark-only.
    first.setVerseMarks(chapter, [2, 3, 3], { underlineColor: "green" });
    first.setVerseMarks(chapter, [3], { highlightColor: "pink" });
    const reopened = new DeviceStudyStore(() => disk);
    reopened.refresh();
    const byVerse = guestVerses(reopened, 4);
    expect(byVerse[2]).toEqual([
      expect.objectContaining({ body: "Keep this", highlight_color: "red", underline: true, underline_color: "green" }),
    ]);
    expect(byVerse[3]).toEqual([
      expect.objectContaining({ body: "", highlight_color: "pink", underline: true, underline_color: "green" }),
    ]);
    expect(byVerse[5]).toEqual([expect.objectContaining({ body: "", highlight_color: null, underline_color: "purple" })]);
    // Removing every mark keeps a verse with a note and drops a mark-only verse.
    reopened.setVerseMarks(chapter, [2, 3], { underline: false });
    reopened.setVerseMarks(chapter, [2, 3], { highlightColor: null });
    const after = guestVerses(reopened, 4);
    expect(after[2]).toEqual([
      expect.objectContaining({ body: "Keep this", highlight_color: null, underline: false, underline_color: null }),
    ]);
    expect(after[3]).toBeUndefined();
    expect(() => reopened.setVerseMarks(chapter, [], { highlightColor: "red" })).toThrow();
    expect(() => reopened.setVerseMarks(chapter, [1], {})).toThrow();
    // A claimed row awaiting import is not the guest's to change.
    reopened.claim("alice");
    reopened.setVerseMarks(chapter, [5], { underline: false });
    expect(reopened.getSnapshot().annotations.find((row) => row.verse === 5)).toMatchObject({
      owner: "alice",
      underline_color: "purple",
    });
  });

  test("claims local records for one account before sync and retains them until acknowledgement", () => {
    const disk = storage();
    const store = new DeviceStudyStore(() => disk);
    const { id } = store.createNote({ markdownBody: "Private" });
    store.claim("alice");
    store.claim("bob");
    store.acknowledge("notes", id, "bob");
    expect(store.getSnapshot().notes[0].owner).toBe("alice");
    expect(deviceJournal(store.getSnapshot())).toEqual([]);
    store.acknowledge("notes", id, "alice");
    expect(store.getSnapshot().notes).toEqual([]);
  });
});

describe("device imports", () => {
  test("imports note and reading once with original dates; retries cannot overwrite or resurrect account notes", async () => {
    const t = newBackend();
    const alice = (await signInAs(t, "alice")).as;
    const bob = (await signInAs(t, "bob")).as;
    const input = {
      deviceId: "device-note-one",
      expectedOwner: "alice",
      markdownBody: "Local thought",
      source,
      journalDate: "2026-10-24",
      createdAt: 1700000000000,
      updatedAt: 1700000000100,
      readingAt: 1700000000000,
    };
    await expect(t.mutation(api.insights.importDeviceNote, input)).rejects.toThrow();
    await expect(bob.mutation(api.insights.importDeviceNote, input)).rejects.toThrow("account changed");
    const result = await alice.mutation(api.insights.importDeviceNote, input);
    expect(await alice.mutation(api.insights.importDeviceNote, input)).toEqual(result);
    expect(await alice.query(api.insights.listMyJournal, {})).toHaveLength(1);
    const readings = await alice.query(api.readingProgress.listMyReadingLog, {});
    expect(readings).toHaveLength(1);
    expect(readings[0].read_at).toBe(new Date(input.readingAt).toISOString());
    const note = (await alice.query(api.insights.getDraft, { draftId: result.id }))!;
    expect(note.created_at).toBe(new Date(input.createdAt).toISOString());
    await alice.mutation(api.insights.saveJournalNote, {
      draftId: result.id,
      markdownBody: "Account edit",
      expectedRevision: 0,
    });
    await alice.mutation(api.insights.importDeviceNote, input);
    expect((await alice.query(api.insights.getDraft, { draftId: result.id }))!.markdown_body).toBe("Account edit");
    await alice.mutation(api.insights.deleteDraft, { draftId: result.id });
    await alice.mutation(api.insights.importDeviceNote, input);
    expect(await alice.query(api.insights.listMyJournal, {})).toHaveLength(0);
  });

  test("merges imported verse text once, preserves an existing account highlight and binds import to its owner", async () => {
    const t = newBackend();
    const alice = (await signInAs(t, "alice")).as;
    const bob = (await signInAs(t, "bob")).as;
    const target = { volume: "bookofmormon", book: "1nephi", chapter: 1, verse: 1 };
    await alice.mutation(api.annotations.upsertVerseAnnotation, {
      ...target,
      body: "Account note",
      highlightColor: "blue",
    });
    const input = {
      ...target,
      body: "Device note",
      highlightColor: "yellow" as const,
      deviceImportId: "device-verse-one",
      deviceImportOwner: "alice",
    };
    await expect(bob.mutation(api.annotations.upsertVerseAnnotation, input)).rejects.toThrow("account changed");
    await alice.mutation(api.annotations.upsertVerseAnnotation, input);
    await alice.mutation(api.annotations.upsertVerseAnnotation, input);
    const rows = (
      await alice.query(api.annotations.getChapterAnnotations, { volume: target.volume, book: target.book, chapter: 1 })
    ).by_verse[1];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ body: "Account note\n\nDevice note", highlight_color: "blue" });
  });

  test("imports guest highlights and colored underlines, keeping marks the account already has", async () => {
    const t = newBackend();
    const alice = (await signInAs(t, "alice")).as;
    const chapter = { volume: "bookofmormon", book: "alma", chapter: 32 };
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 21, body: "Faith", highlightColor: "blue" });
    await alice.mutation(api.annotations.setVerseMarks, { ...chapter, verses: [27], underlineColor: "yellow" });
    const disk = storage();
    const device = new DeviceStudyStore(() => disk);
    device.setVerseMarks(chapter, [21, 27, 28], { highlightColor: "red" });
    device.setVerseMarks(chapter, [21, 27, 28], { underlineColor: "purple" });
    device.saveAnnotation({ ...chapter, verse: 30 }, "Note only", {});
    // A row saved before guest underlines existed has no underline fields at all.
    const legacy = { ...device.getSnapshot().annotations.find((row) => row.verse === 30)!, id: "device-legacy", verse: 31 };
    delete (legacy as { underline?: boolean }).underline;
    delete (legacy as { underline_color?: unknown }).underline_color;
    device.claim("alice");
    for (const row of [...device.getSnapshot().annotations, { ...legacy, owner: "alice" }]) {
      const args = annotationImport(row, "alice");
      await alice.mutation(api.annotations.upsertVerseAnnotation, args);
      await alice.mutation(api.annotations.upsertVerseAnnotation, args);
      device.acknowledge("annotations", row.id, "alice");
    }
    expect(device.getSnapshot().annotations).toEqual([]);
    const byVerse = (await alice.query(api.annotations.getChapterAnnotations, chapter)).by_verse;
    for (const verse of [21, 27, 28, 30, 31]) expect(byVerse[verse]).toHaveLength(1);
    // Existing account highlight kept; the device's underline added.
    expect(byVerse[21][0]).toMatchObject({ body: "Faith", highlight_color: "blue", underline: true, underline_color: "purple" });
    // Existing account underline kept; the device's highlight added.
    expect(byVerse[27][0]).toMatchObject({ body: "", highlight_color: "red", underline: true, underline_color: "yellow" });
    // New verse: both guest marks, nothing dropped.
    expect(byVerse[28][0]).toMatchObject({ body: "", highlight_color: "red", underline: true, underline_color: "purple" });
    expect(byVerse[30][0]).toMatchObject({ body: "Note only", highlight_color: null, underline: false });
    expect(byVerse[31][0]).toMatchObject({ body: "Note only", underline: false, underline_color: null });
  });

  test("guide imports retry safely and preserve the account's existing color", async () => {
    const t = newBackend();
    const alice = (await signInAs(t, "alice")).as;
    const highlight = {
      guide: "2026-10-19",
      part: "reader" as const,
      startBlock: "p-1",
      startOffset: 0,
      endBlock: "p-1",
      endOffset: 4,
      exact: "Text",
      prefix: "",
      suffix: "",
      highlightColor: "blue" as const,
    };
    await alice.mutation(api.annotations.saveGuideHighlight, highlight);
    const imported = {
      ...highlight,
      highlightColor: "yellow" as const,
      deviceImportId: "device-guide-one",
      deviceImportOwner: "alice",
    };
    await alice.mutation(api.annotations.saveGuideHighlight, imported);
    await alice.mutation(api.annotations.saveGuideHighlight, imported);
    expect(await alice.query(api.annotations.getGuideHighlights, { guide: highlight.guide })).toEqual([
      expect.objectContaining({ highlightColor: "blue" }),
    ]);
  });
});
