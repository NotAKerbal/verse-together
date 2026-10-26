import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { MarkColor } from "../convex/annotationRules";
import { newBackend, signInAs } from "./convexAuthHarness";

const ruth = { volume: "oldtestament", book: "ruth", chapter: 1 };

async function setup() {
  const t = newBackend();
  const alice = await signInAs(t, "alice");
  const bob = await signInAs(t, "bob");
  return { t, alice: alice.as, bob: bob.as };
}

async function mine(as: Awaited<ReturnType<typeof setup>>["alice"], verse: number) {
  const data = await as.query(api.annotations.getChapterAnnotations, ruth);
  return data.by_verse[verse]?.find((row: { is_mine: boolean }) => row.is_mine);
}

async function stored(t: Awaited<ReturnType<typeof setup>>["t"]) {
  return await t.run((ctx) => ctx.db.query("verseAnnotations").collect());
}

describe("verse annotation underlines", () => {
  test("an underline alone is an annotation; nothing at all is not", async () => {
    const { alice, t } = await setup();
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "  ", underline: true });
    expect(await mine(alice, 7)).toMatchObject({ body: "", highlight_color: null, underline: true, underline_color: "red" });
    await expect(
      alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 8, body: " ", underline: false })
    ).rejects.toThrow(/underline/);
    await expect(alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 8, body: "" })).rejects.toThrow();
    expect(await stored(t)).toHaveLength(1);
  });

  test("highlight and underline coexist, update independently, and removing the underline drops the field", async () => {
    const { alice, t } = await setup();
    await alice.mutation(api.annotations.upsertVerseAnnotation, {
      ...ruth,
      verse: 16,
      body: "",
      highlightColor: "yellow",
      underline: true,
    });
    expect(await mine(alice, 16)).toMatchObject({ highlight_color: "yellow", underline: true });

    // Clear the highlight, keep the underline: still one row, now underline-only.
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 16, body: "", underline: true });
    expect(await mine(alice, 16)).toMatchObject({ highlight_color: null, underline: true });

    // Swap: highlight back, underline off. The row stores no underline field at all.
    await alice.mutation(api.annotations.upsertVerseAnnotation, {
      ...ruth,
      verse: 16,
      body: "",
      highlightColor: "blue",
      underline: false,
    });
    expect(await mine(alice, 16)).toMatchObject({ highlight_color: "blue", underline: false });
    const rows = await stored(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("underline");

    // Turning off the last mark of a mark-only annotation is refused (the reader deletes it instead).
    await expect(
      alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 16, body: "", underline: false })
    ).rejects.toThrow();
    await alice.mutation(api.annotations.deleteVerseAnnotation, { annotationId: rows[0]._id });
    expect(await mine(alice, 16)).toBeUndefined();
  });

  test("a legacy row without the field reads as not underlined, and an older client's save keeps a saved underline", async () => {
    const { alice, t } = await setup();
    const legacyId = await t.run((ctx) =>
      ctx.db.insert("verseAnnotations", {
        clerkId: "alice",
        ...ruth,
        verse: 7,
        body: "",
        visibility: "private",
        highlightColor: "green",
        createdAt: Date.UTC(2026, 8, 1),
        updatedAt: Date.UTC(2026, 8, 1),
      })
    );
    expect(await mine(alice, 7)).toMatchObject({ id: legacyId, highlight_color: "green", underline: false });

    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "", highlightColor: "green", underline: true });
    // A client from before underlines omits the field: its highlight-color change must not erase the underline,
    // and an underline-only row stays valid when it saves a note without naming the underline.
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "", highlightColor: "pink" });
    expect(await mine(alice, 7)).toMatchObject({ id: legacyId, highlight_color: "pink", underline: true });
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "", underline: true });
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "Whither thou goest" });
    expect(await mine(alice, 7)).toMatchObject({ body: "Whither thou goest", highlight_color: null, underline: true });
  });

  test("underlines are private to their owner", async () => {
    const { alice, bob, t } = await setup();
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "", underline: true });
    expect(await mine(bob, 7)).toBeUndefined();
    expect(await t.query(api.annotations.getChapterAnnotations, ruth)).toEqual({ by_verse: {} });
    const [row] = await stored(t);
    await expect(bob.mutation(api.annotations.deleteVerseAnnotation, { annotationId: row._id })).rejects.toThrow();
  });
});

describe("quick marks from the selection menu", () => {
  const marks = (verses: number[], patch: { highlightColor?: MarkColor | null; underline?: boolean; underlineColor?: MarkColor }) => ({
    ...ruth,
    verses,
    ...patch,
  });

  test("marks every selected verse at once, keeping each verse's note and its other mark", async () => {
    const { alice, t } = await setup();
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 16, body: "Whither thou goest", underline: true });
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 17, body: "", highlightColor: "blue" });

    await alice.mutation(api.annotations.setVerseMarks, marks([16, 17, 18], { highlightColor: "yellow" }));
    expect(await mine(alice, 16)).toMatchObject({ body: "Whither thou goest", highlight_color: "yellow", underline: true });
    expect(await mine(alice, 17)).toMatchObject({ body: "", highlight_color: "yellow", underline: false });
    expect(await mine(alice, 18)).toMatchObject({ body: "", highlight_color: "yellow", underline: false });

    await alice.mutation(api.annotations.setVerseMarks, marks([16, 17, 18], { underline: true }));
    for (const verse of [16, 17, 18]) expect(await mine(alice, verse)).toMatchObject({ highlight_color: "yellow", underline: true });
    expect(await mine(alice, 16)).toMatchObject({ body: "Whither thou goest" });
    expect(await stored(t)).toHaveLength(3);
  });

  test("removing the last mark removes a note-less verse's row and keeps a note", async () => {
    const { alice, t } = await setup();
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 16, body: "Thy people", highlightColor: "pink" });
    await alice.mutation(api.annotations.setVerseMarks, marks([16, 17], { highlightColor: "pink", underline: true }));
    await alice.mutation(api.annotations.setVerseMarks, marks([16, 17], { highlightColor: null }));
    expect(await mine(alice, 17)).toMatchObject({ highlight_color: null, underline: true });
    await alice.mutation(api.annotations.setVerseMarks, marks([16, 17], { underline: false }));
    expect(await mine(alice, 16)).toMatchObject({ body: "Thy people", highlight_color: null, underline: false });
    expect(await mine(alice, 17)).toBeUndefined();
    const rows = await stored(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("highlightColor");
    expect(rows[0]).not.toHaveProperty("underline");
    // Removing marks from unmarked verses creates nothing.
    await alice.mutation(api.annotations.setVerseMarks, marks([20, 21], { highlightColor: null, underline: false }));
    expect(await stored(t)).toHaveLength(1);
  });

  test("a note saved after a quick mark keeps the mark, and a quick mark never rewrites a newer note", async () => {
    const { alice } = await setup();
    await alice.mutation(api.annotations.setVerseMarks, marks([7], { highlightColor: "green" }));
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "Went forth", highlightColor: "green" });
    await alice.mutation(api.annotations.setVerseMarks, marks([7], { underline: true }));
    expect(await mine(alice, 7)).toMatchObject({ body: "Went forth", highlight_color: "green", underline: true });
  });

  test("quick marks are the owner's only, need a signed-in reader, and refuse an empty change", async () => {
    const { alice, bob, t } = await setup();
    await bob.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "Bob's note", highlightColor: "purple" });
    await alice.mutation(api.annotations.setVerseMarks, marks([7], { highlightColor: null, underline: true }));
    expect(await mine(bob, 7)).toMatchObject({ body: "Bob's note", highlight_color: "purple", underline: false });
    expect(await mine(alice, 7)).toMatchObject({ body: "", highlight_color: null, underline: true });

    await expect(t.mutation(api.annotations.setVerseMarks, marks([8], { underline: true }))).rejects.toThrow();
    await expect(alice.mutation(api.annotations.setVerseMarks, marks([8], {}))).rejects.toThrow(/highlight or an underline/);
    await expect(alice.mutation(api.annotations.setVerseMarks, marks([], { underline: true }))).rejects.toThrow(/verse/);
    await expect(alice.mutation(api.annotations.setVerseMarks, marks([1.5], { underline: true }))).rejects.toThrow(/verse/);
    expect(await stored(t)).toHaveLength(2);
  });
});

const marksOn = (verses: number[], patch: { highlightColor?: MarkColor | null; underline?: boolean; underlineColor?: MarkColor }) => ({
  ...ruth,
  verses,
  ...patch,
});

describe("colored underlines", () => {
  test("an underline is saved in its own color, apart from the highlight's, and changes color without touching the highlight or note", async () => {
    const { alice, t } = await setup();
    await alice.mutation(api.annotations.upsertVerseAnnotation, {
      ...ruth,
      verse: 16,
      body: "Whither thou goest",
      highlightColor: "yellow",
      underlineColor: "green",
    });
    expect(await mine(alice, 16)).toMatchObject({
      body: "Whither thou goest",
      highlight_color: "yellow",
      underline: true,
      underline_color: "green",
    });
    await alice.mutation(api.annotations.setVerseMarks, marksOn([16], { underlineColor: "blue" }));
    expect(await mine(alice, 16)).toMatchObject({
      body: "Whither thou goest",
      highlight_color: "yellow",
      underline: true,
      underline_color: "blue",
    });
    // A red highlight and a red underline are separate marks.
    await alice.mutation(api.annotations.setVerseMarks, marksOn([16], { highlightColor: "red", underlineColor: "red" }));
    expect(await mine(alice, 16)).toMatchObject({ highlight_color: "red", underline_color: "red", body: "Whither thou goest" });
    // Clearing the underline drops its color too; the highlight and note stay.
    await alice.mutation(api.annotations.setVerseMarks, marksOn([16], { underline: false }));
    expect(await mine(alice, 16)).toMatchObject({ highlight_color: "red", underline: false, underline_color: null, body: "Whither thou goest" });
    const [row] = await stored(t);
    expect(row).not.toHaveProperty("underline");
    expect(row).not.toHaveProperty("underlineColor");
  });

  test("a colored underline on a mixed multi-verse selection: each verse's highlight and note stay its own", async () => {
    const { alice, t } = await setup();
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 16, body: "Thy people", highlightColor: "pink" });
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 17, body: "", underlineColor: "purple" });
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 18, body: "", highlightColor: "blue", underline: true });

    await alice.mutation(api.annotations.setVerseMarks, marksOn([16, 17, 18, 19], { underlineColor: "green" }));
    expect(await mine(alice, 16)).toMatchObject({ body: "Thy people", highlight_color: "pink", underline_color: "green" });
    expect(await mine(alice, 17)).toMatchObject({ body: "", highlight_color: null, underline_color: "green" });
    expect(await mine(alice, 18)).toMatchObject({ body: "", highlight_color: "blue", underline_color: "green" });
    expect(await mine(alice, 19)).toMatchObject({ body: "", highlight_color: null, underline_color: "green" });

    // Removing the shared underline leaves highlights and notes, and drops rows left with nothing.
    await alice.mutation(api.annotations.setVerseMarks, marksOn([16, 17, 18, 19], { underline: false }));
    expect(await mine(alice, 16)).toMatchObject({ body: "Thy people", highlight_color: "pink", underline: false });
    expect(await mine(alice, 17)).toBeUndefined();
    expect(await mine(alice, 18)).toMatchObject({ highlight_color: "blue", underline: false });
    expect(await mine(alice, 19)).toBeUndefined();
    expect(await stored(t)).toHaveLength(2);
  });

  test("a legacy underline without a color reads as red, and callers from before colors keep a saved color", async () => {
    const { alice, t } = await setup();
    const legacyId = await t.run((ctx) =>
      ctx.db.insert("verseAnnotations", {
        clerkId: "alice",
        ...ruth,
        verse: 7,
        body: "Went forth",
        visibility: "private",
        underline: true,
        createdAt: Date.UTC(2026, 8, 1),
        updatedAt: Date.UTC(2026, 8, 1),
      })
    );
    expect(await mine(alice, 7)).toMatchObject({ id: legacyId, underline: true, underline_color: "red" });

    await alice.mutation(api.annotations.setVerseMarks, marksOn([7], { underlineColor: "blue" }));
    // An older editor's save names the underline (true) but no color; an older quick mark only the highlight.
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "Went forth", highlightColor: "green", underline: true });
    expect(await mine(alice, 7)).toMatchObject({ highlight_color: "green", underline_color: "blue" });
    await alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "Went forth out" });
    expect(await mine(alice, 7)).toMatchObject({ body: "Went forth out", highlight_color: null, underline_color: "blue" });
    await alice.mutation(api.annotations.setVerseMarks, marksOn([7], { highlightColor: "yellow" }));
    await alice.mutation(api.annotations.setVerseMarks, marksOn([7], { underline: true }));
    expect(await mine(alice, 7)).toMatchObject({ highlight_color: "yellow", underline_color: "blue" });
    // An older caller underlining an unmarked verse gets the red underline it always had.
    await alice.mutation(api.annotations.setVerseMarks, marksOn([8], { underline: true }));
    expect(await mine(alice, 8)).toMatchObject({ underline: true, underline_color: "red" });
  });

  test("a quick mark that changes nothing leaves the row untouched, including a legacy uncolored underline", async () => {
    const { alice, t } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("verseAnnotations", {
        clerkId: "alice",
        ...ruth,
        verse: 9,
        body: "",
        visibility: "private",
        underline: true,
        createdAt: 1,
        updatedAt: 1,
      })
    );
    expect(await alice.mutation(api.annotations.setVerseMarks, marksOn([9], { underlineColor: "red" }))).toEqual({ changed: 0 });
    expect(await alice.mutation(api.annotations.setVerseMarks, marksOn([9], { underline: true }))).toEqual({ changed: 0 });
    const [row] = await stored(t);
    expect(row.updatedAt).toBe(1);
  });

  test("an underline that is off with a color is refused, and an annotation needs some mark or note", async () => {
    const { alice, t } = await setup();
    await expect(alice.mutation(api.annotations.setVerseMarks, marksOn([7], { underline: false, underlineColor: "red" }))).rejects.toThrow(
      /underline that is off/
    );
    await expect(
      alice.mutation(api.annotations.upsertVerseAnnotation, { ...ruth, verse: 7, body: "", underline: false, underlineColor: "red" })
    ).rejects.toThrow(/underline that is off/);
    await expect(
      alice.mutation(api.annotations.setVerseMarks, marksOn([7], { underlineColor: "orange" as MarkColor }))
    ).rejects.toThrow();
    expect(await stored(t)).toHaveLength(0);
  });
});
