import { describe, expect, test } from "vitest";
import { DeviceStudyStore, deviceJournal } from "../src/features/notes/deviceStudy";
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
      "yellow",
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
