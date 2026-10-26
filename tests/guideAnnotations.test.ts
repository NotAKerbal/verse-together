import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { DeviceStudyStore, guideHighlightImport } from "../src/features/notes/deviceStudy";
import { readGuideHighlight } from "../src/features/comeFollowMe/guideAnchors";
import { newBackend, signInAs } from "./convexAuthHarness";

const guide = "2026-09-28";
const span = {
  guide,
  part: "reader" as const,
  startBlock: "comfort-ye",
  startOffset: 0,
  endBlock: "comfort-ye",
  endOffset: 10,
  exact: "Comfort ye",
  prefix: "",
  suffix: ", comfort ye my people.",
};
const phrase = { ...span, startOffset: 12, endOffset: 22, exact: "comfort ye", prefix: "Comfort ye, ", suffix: " my people." };

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

async function setup() {
  const t = newBackend();
  const alice = (await signInAs(t, "alice")).as;
  const bob = (await signInAs(t, "bob")).as;
  return { t, alice, bob };
}

type Caller = Awaited<ReturnType<typeof setup>>["alice"];
async function rows(as: Caller) {
  return (await as.query(api.annotations.getGuideHighlights, { guide })) as Array<Record<string, unknown>>;
}

describe("guide annotations on the account", () => {
  test("highlights saved before underlines and notes still read, recolor, and gain marks without losing their color", async () => {
    const { t, alice } = await setup();
    // A row exactly as the first API stored it: no underline or note fields at all.
    const legacyId = await t.run(async (ctx) => {
      return await ctx.db.insert("guideHighlights", {
        clerkId: "alice",
        ...span,
        highlightColor: "green",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const [legacy] = await rows(alice);
    expect(legacy).toMatchObject({ id: legacyId, highlightColor: "green", underlineColor: null, body: "" });
    expect(readGuideHighlight(legacy)).not.toBeNull();
    // The old color API still works, now in every shared color (red too).
    await alice.mutation(api.annotations.updateGuideHighlight, { highlightId: legacyId, highlightColor: "red" });
    // A quick underline by id: the highlight stays.
    await alice.mutation(api.annotations.setGuideAnnotation, { ...span, highlightId: legacyId, underlineColor: "blue" });
    expect((await rows(alice))[0]).toMatchObject({ highlightColor: "red", underlineColor: "blue", body: "" });
    // An old client's save on the same span changes only its highlight.
    await alice.mutation(api.annotations.saveGuideHighlight, { ...span, highlightColor: "yellow" });
    expect(await rows(alice)).toEqual([expect.objectContaining({ id: legacyId, highlightColor: "yellow", underlineColor: "blue" })]);
  });

  test("marks toggle independently of each other and the note; a span left empty is removed", async () => {
    const { t, alice } = await setup();
    const { id } = await alice.mutation(api.annotations.setGuideAnnotation, { ...span, highlightColor: "purple" });
    expect(id).toBeTruthy();
    // By anchor: the same span is found again, never duplicated.
    await alice.mutation(api.annotations.setGuideAnnotation, { ...span, underlineColor: "red" });
    await alice.mutation(api.annotations.setGuideAnnotation, { ...span, body: "  Comfort,   comfort " });
    expect(await rows(alice)).toEqual([
      expect.objectContaining({ id, highlightColor: "purple", underlineColor: "red", body: "Comfort, comfort" }),
    ]);
    // Taking off the highlight leaves the underline and the note.
    await alice.mutation(api.annotations.setGuideAnnotation, { ...span, highlightColor: null });
    expect((await rows(alice))[0]).toMatchObject({ highlightColor: null, underlineColor: "red", body: "Comfort, comfort" });
    // A mark change never touches the note, even from a client that last saw an older one.
    await alice.mutation(api.annotations.setGuideAnnotation, { ...span, underlineColor: "green" });
    expect((await rows(alice))[0]).toMatchObject({ underlineColor: "green", body: "Comfort, comfort" });
    // The note can be emptied; the underline keeps the span.
    await alice.mutation(api.annotations.setGuideAnnotation, { ...span, body: "" });
    expect((await rows(alice))[0]).toMatchObject({ underlineColor: "green", body: "" });
    const stored = await t.run((ctx) => ctx.db.query("guideHighlights").collect());
    expect(stored[0].body).toBeUndefined();
    expect(stored[0].highlightColor).toBeUndefined();
    // The last mark off: the row is gone, not kept empty.
    expect(await alice.mutation(api.annotations.setGuideAnnotation, { ...span, underlineColor: null })).toEqual({ id: null });
    expect(await t.run((ctx) => ctx.db.query("guideHighlights").collect())).toEqual([]);
    // Taking a mark off a span with nothing saved stores nothing.
    expect(await alice.mutation(api.annotations.setGuideAnnotation, { ...span, highlightColor: null })).toEqual({ id: null });
    expect(await rows(alice)).toEqual([]);
  });

  test("an overlapping span is its own row: marking a phrase inside a highlighted passage leaves the passage alone", async () => {
    const { alice } = await setup();
    const passage = { ...span, endOffset: 32, exact: "Comfort ye, comfort ye my people", suffix: "." };
    await alice.mutation(api.annotations.setGuideAnnotation, { ...passage, highlightColor: "yellow", body: "Passage" });
    await alice.mutation(api.annotations.setGuideAnnotation, { ...phrase, underlineColor: "red" });
    const saved = await rows(alice);
    expect(saved).toHaveLength(2);
    expect(saved.find((row) => row.exact === passage.exact)).toMatchObject({ highlightColor: "yellow", underlineColor: null, body: "Passage" });
    expect(saved.find((row) => row.exact === phrase.exact)).toMatchObject({ highlightColor: null, underlineColor: "red", body: "" });
  });

  test("ownership and validation: nobody else's spans, no bad anchors, colors, or empty changes", async () => {
    const { alice, bob, t } = await setup();
    const { id } = await alice.mutation(api.annotations.setGuideAnnotation, { ...span, highlightColor: "blue", body: "Mine" });
    const highlightId = id as Id<"guideHighlights">;
    await expect(bob.mutation(api.annotations.setGuideAnnotation, { ...span, highlightId, body: "Bob" })).rejects.toThrow("Highlight not found");
    await expect(bob.mutation(api.annotations.updateGuideHighlight, { highlightId, highlightColor: "red" })).rejects.toThrow("Highlight not found");
    await expect(bob.mutation(api.annotations.deleteGuideHighlight, { highlightId })).rejects.toThrow("Highlight not found");
    expect(await rows(bob)).toEqual([]);
    // Bob's own save on the same text is his own row.
    await bob.mutation(api.annotations.setGuideAnnotation, { ...span, underlineColor: "pink" });
    expect(await rows(alice)).toEqual([expect.objectContaining({ highlightColor: "blue", underlineColor: null, body: "Mine" })]);
    // An id from another guide is not this guide's span.
    await expect(
      alice.mutation(api.annotations.setGuideAnnotation, { ...span, guide: "2026-10-05", highlightId, body: "x" })
    ).rejects.toThrow("Highlight not found");
    // Signed out: nothing to read, nothing to write.
    expect(await t.query(api.annotations.getGuideHighlights, { guide })).toEqual([]);
    await expect(t.mutation(api.annotations.setGuideAnnotation, { ...span, body: "x" })).rejects.toThrow();
    await expect(alice.mutation(api.annotations.setGuideAnnotation, { ...span })).rejects.toThrow("Choose a highlight");
    await expect(alice.mutation(api.annotations.setGuideAnnotation, { ...span, endOffset: 11, body: "x" })).rejects.toThrow("Invalid anchor");
    await expect(alice.mutation(api.annotations.setGuideAnnotation, { ...span, guide: "week", body: "x" })).rejects.toThrow("Unknown guide");
    await expect(alice.mutation(api.annotations.setGuideAnnotation, { ...span, body: "x".repeat(1201) })).rejects.toThrow("too long");
    await expect(
      alice.mutation(api.annotations.setGuideAnnotation, { ...span, highlightColor: "orange" as "red" })
    ).rejects.toThrow();
    await expect(alice.mutation(api.annotations.saveGuideHighlight, { ...phrase })).rejects.toThrow("Choose a highlight");
  });
});

describe("guide annotations on a guest's device", () => {
  test("marks and notes persist across reload, toggle independently, and an emptied span is removed", () => {
    const disk = storage();
    const first = new DeviceStudyStore(() => disk);
    const { id } = first.setGuideAnnotation(span, { highlightColor: "red" });
    first.setGuideAnnotation(span, { underlineColor: "purple" });
    first.setGuideAnnotation(span, { body: "Guest note" }, id!);
    const reopened = new DeviceStudyStore(() => disk);
    reopened.refresh();
    expect(reopened.getSnapshot().highlights).toEqual([
      expect.objectContaining({ id, owner: null, highlightColor: "red", underlineColor: "purple", body: "Guest note" }),
    ]);
    reopened.setGuideAnnotation(span, { highlightColor: null });
    expect(reopened.getSnapshot().highlights[0]).toMatchObject({ highlightColor: null, underlineColor: "purple", body: "Guest note" });
    // The first guest API keeps the note and the underline.
    reopened.saveHighlight({ ...span, highlightColor: "yellow" });
    expect(reopened.getSnapshot().highlights[0]).toMatchObject({ highlightColor: "yellow", underlineColor: "purple", body: "Guest note" });
    reopened.setGuideAnnotation(span, { body: "", highlightColor: null, underlineColor: null });
    expect(reopened.getSnapshot().highlights).toEqual([]);
    expect(() => reopened.setGuideAnnotation(span, {})).toThrow();
    expect(() => reopened.setGuideAnnotation(span, { body: "x" }, "device-missing")).toThrow();
  });

  test("sign-in imports every guest span (old highlight-only ones too) once, keeping what the account has", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.annotations.setGuideAnnotation, { ...span, highlightColor: "blue", body: "Account note" });
    const disk = storage();
    const device = new DeviceStudyStore(() => disk);
    device.setGuideAnnotation(span, { highlightColor: "yellow", underlineColor: "red", body: "Guest note" });
    device.setGuideAnnotation(phrase, { body: "Only a note" });
    // A guest row saved before guide underlines and notes: a highlight alone, no other fields.
    const legacy = {
      ...span,
      startOffset: 30,
      endOffset: 40,
      exact: "my people.",
      id: "device-legacy",
      owner: null,
      highlightColor: "green" as const,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    disk.setItem(
      "vt_device_study_v1",
      JSON.stringify({ ...device.getSnapshot(), highlights: [...device.getSnapshot().highlights, legacy] })
    );
    device.refresh();
    device.claim("alice");
    const claimed = device.getSnapshot().highlights;
    expect(claimed).toHaveLength(3);
    // The import is bound to the account it was claimed for.
    await expect(bob.mutation(api.annotations.saveGuideHighlight, guideHighlightImport(claimed[0], "alice"))).rejects.toThrow(
      "account changed"
    );
    for (const row of claimed) {
      const args = guideHighlightImport(row, "alice");
      await alice.mutation(api.annotations.saveGuideHighlight, args);
      await alice.mutation(api.annotations.saveGuideHighlight, args);
      device.acknowledge("highlights", row.id, "alice");
    }
    expect(device.getSnapshot().highlights).toEqual([]);
    const saved = await rows(alice);
    expect(saved).toHaveLength(3);
    // Existing account highlight kept, missing underline added, notes merged once.
    expect(saved.find((row) => row.exact === span.exact)).toMatchObject({
      highlightColor: "blue",
      underlineColor: "red",
      body: "Account note\n\nGuest note",
    });
    expect(saved.find((row) => row.exact === phrase.exact)).toMatchObject({ highlightColor: null, underlineColor: null, body: "Only a note" });
    expect(saved.find((row) => row.exact === legacy.exact)).toMatchObject({ highlightColor: "green", underlineColor: null, body: "" });
    // A later quick mark on the merged span keeps its note exactly (paragraph break included).
    await alice.mutation(api.annotations.setGuideAnnotation, { ...span, underlineColor: "green" });
    expect((await rows(alice)).find((row) => row.exact === span.exact)?.body).toBe("Account note\n\nGuest note");
  });
});
