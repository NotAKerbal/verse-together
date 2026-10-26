import { describe, expect, test } from "vitest";
import { applyVerseMarks, verseMarksProblem, type VerseTextMark, type VerseTextRange } from "../convex/annotationRules";
import { selectionMarks, withVerseMarks } from "../src/features/annotations/verseAnnotations";
import { DeviceStudyStore, annotationImport } from "../src/features/notes/deviceStudy";
import { api } from "../convex/_generated/api";
import { newBackend, signInAs } from "./convexAuthHarness";

const chapter = { volume: "oldtestament", book: "jeremiah", chapter: 31 };
const text = "Yea, I have loved thee with an everlasting love: therefore with lovingkindness have I drawn thee.";
const range = (start = text.indexOf("everlasting"), end = text.length): VerseTextRange => ({ verse: 3, start, end, text });
const selected = range();
const mark: VerseTextMark = { start: selected.start, end: selected.end, text: text.slice(selected.start), kind: "highlight", color: "yellow" };

function store() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  return { device: new DeviceStudyStore(() => storage), storage };
}

describe("selected scripture text marks", () => {
  test("stores only selected characters; recoloring splits and preserves unrelated marks and notes", () => {
    const first = applyVerseMarks({ body: "My note", underline: true }, { highlightColor: "yellow" }, selected);
    expect(first).toMatchObject({ highlightColor: undefined, underline: true, textMarks: [mark] });
    const end = selected.start + "everlasting".length;
    const second = applyVerseMarks({ body: "My note", ...first }, { highlightColor: "blue" }, range(selected.start, end));
    expect(second.textMarks).toEqual([
      { ...mark, end, text: "everlasting", color: "blue" },
      { ...mark, start: end, text: text.slice(end) },
    ]);
    const removed = applyVerseMarks({ body: "My note", ...second }, { highlightColor: null }, range(selected.start, end));
    expect(removed.textMarks).toEqual([{ ...mark, start: end, text: text.slice(end) }]);
    expect(removed).toMatchObject({ keep: true, underline: true });
  });

  test("removes a selected piece of a legacy whole-verse highlight without erasing the rest", () => {
    const result = applyVerseMarks({ body: "", highlightColor: "yellow" }, { highlightColor: null }, selected);
    expect(result.highlightColor).toBeUndefined();
    expect(result.textMarks).toEqual([{ ...mark, start: 0, end: selected.start, text: text.slice(0, selected.start) }]);
  });

  test("preset state is based on the selected portion, including unmarked gaps", () => {
    const data = withVerseMarks({ by_verse: {} }, [3], { highlightColor: "yellow", ranges: [selected] });
    const row = data.by_verse[3][0];
    expect(selectionMarks([row], [selected]).highlight).toBe("yellow");
    expect(selectionMarks([row], [range(0)]).highlight).toBe("mixed");
    expect(selectionMarks([row], [range(0, 3)]).highlight).toBe("none");
    expect(selectionMarks([row], [{ ...selected, text: "x".repeat(text.length) }]).highlight).toBe("none");
  });

  test("guest ranges survive reload and note edits and are included in account import", () => {
    const { device, storage } = store();
    device.setVerseMarks(chapter, [3], { highlightColor: "yellow", ranges: [selected] });
    const reloaded = new DeviceStudyStore(() => storage);
    reloaded.refresh();
    expect(reloaded.getSnapshot().annotations[0].text_marks).toEqual([mark]);
    reloaded.saveAnnotation({ ...chapter, verse: 3 }, "My note");
    const row = reloaded.getSnapshot().annotations[0];
    expect(row.text_marks).toEqual([mark]);
    expect(annotationImport(row, "alice").textMarks).toEqual([mark]);
  });

  test("validates each range before changing any verses", () => {
    expect(verseMarksProblem([3], { highlightColor: "yellow", ranges: [] })).toMatch(/selection/);
    expect(verseMarksProblem([3], { highlightColor: "yellow", ranges: [{ ...selected, end: text.length + 1 }] })).toMatch(/selection/);
    expect(verseMarksProblem([3], { highlightColor: "yellow", ranges: [{ ...selected, verse: 4 }] })).toMatch(/selection/);
  });

  test("account saves/query preserve cross-verse portions and ownership; note editing keeps ranges", async () => {
    const t = newBackend();
    const { as: alice } = await signInAs(t, "alice");
    const { as: bob } = await signInAs(t, "bob");
    const ranges = [selected, { verse: 4, start: 0, end: 5, text: "Again I will build thee" }];
    const args = { ...chapter, verses: [3, 4], highlightColor: "yellow" as const, ranges };
    await alice.mutation(api.annotations.setVerseMarks, args);
    const data = await alice.query(api.annotations.getChapterAnnotations, chapter);
    expect(data.by_verse[3][0]).toMatchObject({ highlight_color: null, text_marks: [mark] });
    expect(data.by_verse[4][0].text_marks).toEqual([{ start: 0, end: 5, text: "Again", kind: "highlight", color: "yellow" }]);
    expect((await bob.query(api.annotations.getChapterAnnotations, chapter)).by_verse).toEqual({});
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 3, body: "My note" });
    expect((await alice.query(api.annotations.getChapterAnnotations, chapter)).by_verse[3][0]).toMatchObject({ body: "My note", text_marks: [mark] });
    await expect(alice.mutation(api.annotations.setVerseMarks, { ...args, ranges: [{ ...selected, start: -1 }, ranges[1]] })).rejects.toThrow(/selection/);
    await alice.mutation(api.annotations.setVerseMarks, { ...args, highlightColor: null });
    expect((await alice.query(api.annotations.getChapterAnnotations, chapter)).by_verse[3][0].body).toBe("My note");
    expect((await alice.query(api.annotations.getChapterAnnotations, chapter)).by_verse[4]).toBeUndefined();
  });

  test("range-only guest imports are idempotent and preserve account colors on overlaps", async () => {
    const t = newBackend();
    const { as: alice } = await signInAs(t, "alice");
    const { device } = store();
    device.setVerseMarks(chapter, [3], { highlightColor: "yellow", ranges: [selected] });
    const args = annotationImport(device.getSnapshot().annotations[0], "alice");
    await alice.mutation(api.annotations.setVerseMarks, { ...chapter, verses: [3], ranges: [range(selected.start, selected.start + 11)], highlightColor: "blue" });
    await alice.mutation(api.annotations.upsertVerseAnnotation, args);
    const once = await alice.query(api.annotations.getChapterAnnotations, chapter);
    await alice.mutation(api.annotations.upsertVerseAnnotation, args);
    expect(await alice.query(api.annotations.getChapterAnnotations, chapter)).toEqual(once);
    expect(once.by_verse[3][0].text_marks?.map((m: VerseTextMark) => m.color)).toEqual(["blue", "yellow"]);
  });
});

test("a deliberate whole-verse color edit replaces that kind's range marks on both storage paths", async () => {
  const { device } = store();
  device.setVerseMarks(chapter, [3], { highlightColor: "yellow", ranges: [selected] });
  device.saveAnnotation({ ...chapter, verse: 3 }, "", { highlightColor: "blue" });
  expect(device.getSnapshot().annotations[0]).toMatchObject({ highlight_color: "blue", text_marks: [] });
  const t = newBackend();
  const { as: alice } = await signInAs(t, "alice");
  await alice.mutation(api.annotations.setVerseMarks, { ...chapter, verses: [3], ranges: [selected], highlightColor: "yellow" });
  await alice.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 3, body: "", highlightColor: "blue" });
  expect((await alice.query(api.annotations.getChapterAnnotations, chapter)).by_verse[3][0]).toMatchObject({ highlight_color: "blue", text_marks: [] });
});

test("partial underlines toggle independently of a highlight on the same text", () => {
  const highlighted = applyVerseMarks(null, { highlightColor: "yellow" }, selected);
  const underlined = applyVerseMarks({ body: "", ...highlighted }, { underlineColor: "red" }, range(selected.start, selected.start + 11));
  expect(underlined.textMarks).toContainEqual({ start: selected.start, end: selected.start + 11, text: "everlasting", kind: "underline", color: "red" });
  const removed = applyVerseMarks({ body: "", ...underlined }, { underline: false }, range(selected.start, selected.start + 11));
  expect(removed.textMarks).toEqual([mark]);
});

test("adjacent marks from different translation text are never merged into a broken anchor", () => {
  const existing = { body: "", textMarks: [{ start: 0, end: 3, text: "Old", kind: "highlight" as const, color: "yellow" as const }] };
  const next = applyVerseMarks(existing, { highlightColor: "yellow" }, { verse: 3, text: "New words", start: 3, end: 9 });
  expect(next.textMarks).toHaveLength(2);
  expect(next.textMarks?.[1].text).toBe(" words");
});

test("importing a guest range into a whole-verse account highlight preserves the account mark", async () => {
  const t = newBackend();
  const { as: alice } = await signInAs(t, "alice");
  await alice.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 3, body: "", highlightColor: "blue" });
  const { device } = store();
  device.setVerseMarks(chapter, [3], { highlightColor: "yellow", ranges: [selected] });
  await alice.mutation(api.annotations.upsertVerseAnnotation, annotationImport(device.getSnapshot().annotations[0], "alice"));
  expect((await alice.query(api.annotations.getChapterAnnotations, chapter)).by_verse[3][0]).toMatchObject({ highlight_color: "blue", text_marks: [] });
});
