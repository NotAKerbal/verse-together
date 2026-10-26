import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { MarkPreset } from "../convex/annotationRules";
import { newBackend, signInAs } from "./convexAuthHarness";

const DEFAULTS: MarkPreset[] = [
  { kind: "highlight", color: "yellow" },
  { kind: "highlight", color: "blue" },
  { kind: "highlight", color: "green" },
  { kind: "highlight", color: "pink" },
  { kind: "highlight", color: "purple" },
  { kind: "underline", color: "red" },
];
const readerSettings = { showFootnotes: false, fontScale: 1.2, fontFamily: "sans" as const, comparisonView: "sideBySide" as const, textWidth: "wide" as const };
const redUnderline: MarkPreset = { kind: "underline", color: "red" };
const yellowHighlight: MarkPreset = { kind: "highlight", color: "yellow" };
const blueHighlight: MarkPreset = { kind: "highlight", color: "blue" };
const greenUnderline: MarkPreset = { kind: "underline", color: "green" };

async function setup() {
  const t = newBackend();
  const alice = await signInAs(t, "alice");
  const bob = await signInAs(t, "bob");
  return { t, alice: alice.as, bob: bob.as };
}

async function storedRow(t: Awaited<ReturnType<typeof setup>>["t"], clerkId: string) {
  return await t.run((ctx) => ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId)).unique());
}

describe("mark presets", () => {
  test("a reader who never chose, or whose row predates presets, gets the defaults", async () => {
    const { t, alice } = await setup();
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toBeNull();
    await t.run((ctx) =>
      ctx.db.insert("readerPreferences", { clerkId: "alice", showFootnotes: true, fontScale: 1, fontFamily: "serif", updatedAt: 1 })
    );
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({ markPresets: DEFAULTS });
  });

  test("an earlier quick-mark choice carries over: its colors as highlights, its underline as the red underline", async () => {
    const { t, alice, bob } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("readerPreferences", {
        clerkId: "alice",
        showFootnotes: true,
        fontScale: 1,
        fontFamily: "serif",
        quickMarks: ["pink", "underline", "yellow"],
        updatedAt: 1,
      });
      await ctx.db.insert("readerPreferences", { clerkId: "bob", showFootnotes: true, fontScale: 1, fontFamily: "serif", quickMarks: [], updatedAt: 1 });
    });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({
      markPresets: [yellowHighlight, { kind: "highlight", color: "pink" }, redUnderline],
    });
    // An earlier choice of no buttons stays none.
    expect(await bob.query(api.preferences.getReaderPreferences, {})).toMatchObject({ markPresets: [] });

    // Saving presets replaces the earlier choice for good.
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [greenUnderline] });
    const row = await storedRow(t, "alice");
    expect(row).not.toHaveProperty("quickMarks");
    expect(row?.markPresets).toEqual([greenUnderline]);
  });

  test("presets keep their order and kind-color pairs, a repeated pair is kept once, and an empty list stays empty", async () => {
    const { alice } = await setup();
    await alice.mutation(api.preferences.saveReaderPreferences, readerSettings);
    await alice.mutation(api.preferences.saveMarkPresets, {
      presets: [redUnderline, yellowHighlight, { kind: "underline", color: "yellow" }, blueHighlight, redUnderline, greenUnderline],
    });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toEqual({
      ...readerSettings,
      markPresets: [redUnderline, yellowHighlight, { kind: "underline", color: "yellow" }, blueHighlight, greenUnderline],
    });
    // Reordered: the new order is kept exactly.
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [greenUnderline, blueHighlight, redUnderline] });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({
      markPresets: [greenUnderline, blueHighlight, redUnderline],
    });
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [] });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toEqual({ ...readerSettings, markPresets: [] });
  });

  test("every pair fits, and a longer list or an unknown kind or color is refused", async () => {
    const { alice } = await setup();
    const colors = ["red", "yellow", "blue", "green", "pink", "purple"] as const;
    const all = (["highlight", "underline"] as const).flatMap((kind) => colors.map((color) => ({ kind, color })));
    await alice.mutation(api.preferences.saveMarkPresets, { presets: all });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({ markPresets: all });

    await expect(alice.mutation(api.preferences.saveMarkPresets, { presets: [...all, redUnderline] })).rejects.toThrow(/up to 12/);
    await expect(
      alice.mutation(api.preferences.saveMarkPresets, { presets: [{ kind: "highlight", color: "orange" }] } as unknown as { presets: [] })
    ).rejects.toThrow();
    await expect(
      alice.mutation(api.preferences.saveMarkPresets, { presets: [{ kind: "strike", color: "red" }] } as unknown as { presets: [] })
    ).rejects.toThrow();
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({ markPresets: all });
  });

  test("a reader-settings save (font, width…) keeps the presets, and a presets save keeps the reader settings", async () => {
    const { alice } = await setup();
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [redUnderline] });
    await alice.mutation(api.preferences.saveReaderPreferences, readerSettings);
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toEqual({ ...readerSettings, markPresets: [redUnderline] });
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [] });
    await alice.mutation(api.preferences.saveReaderPreferences, { ...readerSettings, fontScale: 0.9 });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({ fontScale: 0.9, markPresets: [] });
  });

  test("the first save starts the row from this device's reader settings, or the defaults", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [blueHighlight], readerDefaults: readerSettings });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toEqual({ ...readerSettings, markPresets: [blueHighlight] });
    await bob.mutation(api.preferences.saveMarkPresets, { presets: [greenUnderline] });
    expect(await bob.query(api.preferences.getReaderPreferences, {})).toEqual({
      showFootnotes: true,
      fontScale: 1,
      fontFamily: "serif",
      comparisonView: "inline",
      textWidth: "comfortable",
      markPresets: [greenUnderline],
    });
    // readerDefaults only seeds a new row: it never overwrites saved settings.
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [blueHighlight], readerDefaults: { ...readerSettings, fontScale: 0.85 } });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({ fontScale: 1.2 });
  });

  test("each account's presets are its own, and saving them needs a signed-in reader", async () => {
    const { t, alice, bob } = await setup();
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [] });
    expect(await bob.query(api.preferences.getReaderPreferences, {})).toBeNull();
    expect(await t.query(api.preferences.getReaderPreferences, {})).toBeNull();
    await expect(t.mutation(api.preferences.saveMarkPresets, { presets: [yellowHighlight] })).rejects.toThrow();
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({ markPresets: [] });
  });

  test("a preset's optional name is saved, renamed, and cleared, and kept through a change of its mark", async () => {
    const { t, alice } = await setup();
    await alice.mutation(api.preferences.saveMarkPresets, {
      presets: [{ ...yellowHighlight, name: "  Blessings  " }, { ...redUnderline, name: "Commandments" }, blueHighlight],
    });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({
      markPresets: [{ ...yellowHighlight, name: "Blessings" }, { ...redUnderline, name: "Commandments" }, blueHighlight],
    });
    // An unnamed preset stores no name at all.
    expect((await storedRow(t, "alice"))?.markPresets?.[2]).toEqual(blueHighlight);

    // Rename one, clear another (blank is no name), and move a named one to a new color: its name stays.
    await alice.mutation(api.preferences.saveMarkPresets, {
      presets: [{ ...yellowHighlight, name: "Promised\n blessings" }, { ...redUnderline, name: "   " }, { ...greenUnderline, name: "Covenants" }],
    });
    const markPresets = (await alice.query(api.preferences.getReaderPreferences, {}))?.markPresets;
    expect(markPresets).toEqual([{ ...yellowHighlight, name: "Promised blessings" }, redUnderline, { ...greenUnderline, name: "Covenants" }]);
    expect(markPresets?.[1]).not.toHaveProperty("name");
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [{ kind: "highlight", color: "pink", name: "Covenants" }] });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({
      markPresets: [{ kind: "highlight", color: "pink", name: "Covenants" }],
    });
  });

  test("a name never makes a second preset of the same mark, and an overlong name is refused", async () => {
    const { alice } = await setup();
    await alice.mutation(api.preferences.saveMarkPresets, {
      presets: [{ ...yellowHighlight, name: "Blessings" }, { ...yellowHighlight, name: "Promises" }, yellowHighlight],
    });
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({ markPresets: [{ ...yellowHighlight, name: "Blessings" }] });

    const fits = "n".repeat(40);
    await alice.mutation(api.preferences.saveMarkPresets, { presets: [{ ...redUnderline, name: fits }] });
    await expect(
      alice.mutation(api.preferences.saveMarkPresets, { presets: [{ ...redUnderline, name: `${fits}!` }] })
    ).rejects.toThrow(/Keep each quick mark name to 40 characters/);
    // The refused save changed nothing.
    expect(await alice.query(api.preferences.getReaderPreferences, {})).toMatchObject({ markPresets: [{ ...redUnderline, name: fits }] });
    await expect(
      alice.mutation(api.preferences.saveMarkPresets, { presets: [{ ...redUnderline, name: 7 }] } as unknown as { presets: [] })
    ).rejects.toThrow();
  });

  test("the defaults and a carried-over earlier choice are unnamed", async () => {
    const { t, alice, bob } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("readerPreferences", { clerkId: "bob", showFootnotes: true, fontScale: 1, fontFamily: "serif", quickMarks: ["blue", "underline"], updatedAt: 1 })
    );
    await alice.mutation(api.preferences.saveReaderPreferences, readerSettings);
    const unnamed = (presets: MarkPreset[] | undefined) => presets?.every((preset) => !("name" in preset));
    expect(unnamed((await alice.query(api.preferences.getReaderPreferences, {}))?.markPresets)).toBe(true);
    expect(unnamed((await bob.query(api.preferences.getReaderPreferences, {}))?.markPresets)).toBe(true);
  });
});
