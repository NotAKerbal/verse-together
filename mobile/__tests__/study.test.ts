import { readPassages, readVerseMap, readChapterSet } from "../src/features/readingProgress";
import { searchJournal } from "../src/features/journal/search";
import { markdownBlocks } from "../src/features/journal/markdown";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, normalizePreferences, readerPreferences } from "../src/storage/preferences";
import {
  DEVICE_STUDY_KEY,
  DeviceStudyStore,
  RevisionConflictError,
  annotationChapter,
  deviceChapterAnnotations,
  deviceJournal,
  myAnnotationsByVerse,
  scriptureSource,
} from "../src/shared/web";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";

let port: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  port = memoryStorage();
  setStoragePort(port);
  readerPreferences.reset();
  lastPosition.reset();
  initDeviceStudy();
});

describe("device journal", () => {
  it("creates, edits, logs reading and deletes entries, and they survive a restart", () => {
    const source = scriptureSource({ volume: "bookofmormon", book: "alma", chapter: 32, reference: "Alma 32" });
    const { id } = deviceStudy.createNote({ requestId: "rl-test-1", markdownBody: "# Faith\nLike a seed.", journalDate: "2026-10-27", source, logReading: true });
    // The same request id never makes a second entry.
    deviceStudy.createNote({ requestId: "rl-test-1", markdownBody: "duplicate", journalDate: "2026-10-27" });
    expect(deviceStudy.getSnapshot().notes).toHaveLength(1);

    const { markdownRevision } = deviceStudy.saveNote(id, "# Faith\nLike a seed that grows.", 0);
    expect(markdownRevision).toBe(1);
    expect(() => deviceStudy.saveNote(id, "stale", 0)).toThrow(RevisionConflictError);

    // A second store over the same storage is a fresh app launch.
    const relaunched = new DeviceStudyStore(() => port);
    relaunched.refresh();
    const note = relaunched.getSnapshot().notes[0];
    expect(note).toMatchObject({ id, title: "Faith", markdown_body: "# Faith\nLike a seed that grows.", markdown_revision: 1, journal_date: "2026-10-27" });
    expect(note.reading_at).toBeTruthy();
    expect(JSON.parse(port.getItem(DEVICE_STUDY_KEY)!).version).toBe(1);

    const entries = deviceJournal(relaunched.getSnapshot());
    expect(entries[0]).toMatchObject({ kind: "note", title: "Faith", excerpt: "Like a seed that grows." });
    expect(readChapterSet(relaunched.getSnapshot(), "bookofmormon", "alma")).toEqual(new Set([32]));

    deviceStudy.remove("notes", id);
    expect(deviceStudy.getSnapshot().notes).toHaveLength(0);
  });

  it("refuses to drop the reading from an entry with no note", () => {
    const source = scriptureSource({ volume: "pearl", book: "moses", chapter: 1 });
    const { id } = deviceStudy.createNote({ requestId: "rl-test-2", markdownBody: "", source, logReading: true });
    expect(() => deviceStudy.setReading(id, null)).toThrow("Add a note before removing the reading.");
  });

  it("reports unreadable storage instead of replacing it", () => {
    port.setItem(DEVICE_STUDY_KEY, JSON.stringify({ version: 9 }));
    expect(initDeviceStudy()).toMatch(/couldn't be read/);
    expect(port.getItem(DEVICE_STUDY_KEY)).toBe(JSON.stringify({ version: 9 }));
  });

  it("searches entries by every word, newest first", () => {
    deviceStudy.createNote({ requestId: "rl-a", markdownBody: "Gratitude list\nMorning light", journalDate: "2026-10-01" });
    deviceStudy.createNote({ requestId: "rl-b", markdownBody: "Evening light and quiet", journalDate: "2026-10-02" });
    const data = deviceStudy.getSnapshot();
    const entries = deviceJournal(data);
    expect(searchJournal(entries, data, "light").map((entry) => entry.journal_date)).toEqual(["2026-10-02", "2026-10-01"]);
    expect(searchJournal(entries, data, "light morning")).toHaveLength(1);
    expect(searchJournal(entries, data, "absent")).toHaveLength(0);
  });

  it("validates weekly goals", () => {
    expect(() => deviceStudy.saveJournalGoals({ studyDays: 8, reflections: 3 })).toThrow();
    deviceStudy.saveJournalGoals({ studyDays: 4, reflections: 2 });
    expect(deviceStudy.getSnapshot().journalGoals).toEqual({ studyDays: 4, reflections: 2 });
  });
});

describe("verse marks and notes", () => {
  it("applies quick marks with the shared rules, keeping notes", () => {
    const chapter = annotationChapter("doctrineandcovenants", "doctrineandcovenants", 4);
    expect(chapter.volume).toBe("dnc");
    deviceStudy.setVerseMarks(chapter, [2, 3], { highlightColor: "yellow" });
    deviceStudy.saveAnnotation({ ...chapter, verse: 2 }, "Serve with all your heart", { highlightColor: "yellow" });
    deviceStudy.setVerseMarks(chapter, [2], { underlineColor: "blue" });
    deviceStudy.setVerseMarks(chapter, [3], { highlightColor: null });
    const byVerse = myAnnotationsByVerse(deviceChapterAnnotations(deviceStudy.getSnapshot().annotations, chapter));
    expect(byVerse.get(2)).toMatchObject({ body: "Serve with all your heart", highlight_color: "yellow", underline: true, underline_color: "blue" });
    // A verse left with no note and no mark is removed.
    expect(byVerse.has(3)).toBe(false);
    expect(() => deviceStudy.setVerseMarks(chapter, [], { highlightColor: "red" })).toThrow("Select a verse to mark");
  });
});

describe("reading margin", () => {
  it("maps logged verse ranges onto verses", () => {
    deviceStudy.createNote({
      requestId: "rl-r",
      markdownBody: "",
      source: scriptureSource({ volume: "bookofmormon", book: "alma", chapter: 32, verseStart: 21, verseEnd: 23 }),
      logReading: true,
    });
    const map = readVerseMap(readPassages(deviceStudy.getSnapshot(), "bookofmormon", "alma"), 32, 43);
    expect([...map.keys()]).toEqual([21, 22, 23]);
    expect(map.get(22)).toEqual({ start: 21, end: 23 });
  });
});

describe("preferences", () => {
  it("clamps and persists reader settings under the web's key", () => {
    expect(normalizePreferences({ fontScale: 4, fontFamily: "comic", textWidth: "wide" })).toMatchObject({ fontScale: 1.3, fontFamily: "serif", textWidth: "wide" });
    expect(normalizePreferences(null).markPresets).toHaveLength(6);
    readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.1, markPresets: [] });
    readerPreferences.reset();
    expect(readerPreferences.get()).toMatchObject({ fontScale: 1.1, markPresets: [] });
    expect(JSON.parse(port.getItem("reader_prefs_v1")!).fontScale).toBe(1.1);
  });
});

describe("note Markdown", () => {
  it("renders structure and only follows safe links", () => {
    const blocks = markdownBlocks("# Title\n\n**[Alma 32:21](</browse/bookofmormon/alma/32#v-21>)**\n> faith\n\n- [site](https://example.org) [bad](javascript:alert(1))");
    expect(blocks[0]).toMatchObject({ kind: "heading" });
    const link = (blocks[1] as { runs: Array<{ text: string; path?: string }> }).runs.find((run) => run.path);
    expect(link).toMatchObject({ text: "Alma 32:21", path: "/browse/bookofmormon/alma/32?verse=21" });
    const list = blocks.find((block) => block.kind === "list") as { items: Array<Array<{ runs: Array<{ url?: string; text: string }> }>> };
    const runs = list.items[0][0].runs;
    expect(runs.find((run) => run.text === "site")?.url).toBe("https://example.org");
    expect(runs.find((run) => run.text === "bad")?.url).toBeUndefined();
  });
});
