import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { normalizeMarkPresets, type MarkColor } from "../convex/annotationRules";
import { newBackend, signInAs } from "./convexAuthHarness";
import { DeviceStudyStore } from "../src/features/notes/deviceStudy";
import VerseMarkedText from "../src/features/annotations/VerseMarkedText";
import { markPresetLabel, presetState, selectionMarks, type VerseAnnotation } from "../src/features/annotations/verseAnnotations";
import { guideSelectionMarks, readGuideHighlight } from "../src/features/comeFollowMe/guideAnchors";

const chapter = { volume: "oldtestament", book: "ruth", chapter: 1 };
const span = { guide: "2026-09-28", part: "reader" as const, startBlock: "comfort-ye", startOffset: 0,
  endBlock: "comfort-ye", endOffset: 10, exact: "Comfort ye", prefix: "", suffix: ", comfort ye my people." };
const preset = { kind: "highlight" as const, color: "#12ab89" as const, name: "Promises" };

describe("custom mark colors", () => {
  test("presets, verse ranges, and guide marks save and read back with their colors", async () => {
    const t = newBackend();
    const { as } = await signInAs(t, "alice");
    await as.mutation(api.preferences.saveMarkPresets, { presets: [preset] });
    const preferences = await as.query(api.preferences.getReaderPreferences, {});
    expect(normalizeMarkPresets(preferences?.markPresets)).toEqual([preset]);
    const text = "Whither thou goest";
    await as.mutation(api.annotations.setVerseMarks, { ...chapter, verses: [16], highlightColor: preset.color,
      ranges: [{ verse: 16, start: 8, end: 12, text }] });
    await as.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 17, body: "A note", highlightColor: preset.color, underlineColor: "#8040e0" });
    const data = await as.query(api.annotations.getChapterAnnotations, chapter);
    const ranged = data.by_verse[16][0] as VerseAnnotation;
    expect(ranged.text_marks?.[0]).toMatchObject({ start: 8, end: 12, color: preset.color });
    expect(data.by_verse[17][0]).toMatchObject({ highlight_color: preset.color, underline_color: "#8040e0" });
    const html = renderToStaticMarkup(createElement(VerseMarkedText, { annotation: ranged }, text));
    expect(html).toContain('data-verse-highlight="#12ab89" style="--verse-custom-highlight:#12ab8955">thou</span>');
    const marks = selectionMarks([ranged], [{ verse: 16, start: 0, end: text.length, text }]);
    expect(presetState(preset, marks)).toBe("mixed");
    expect(markPresetLabel(preset)).toBe("#12AB89 highlight");

    const saved = await as.mutation(api.annotations.saveGuideHighlight, { ...span, highlightColor: preset.color });
    await as.mutation(api.annotations.updateGuideHighlight, { highlightId: saved.id as Id<"guideHighlights">, highlightColor: "#8040e0" });
    await as.mutation(api.annotations.setGuideAnnotation, { ...span, underlineColor: preset.color });
    const guides = await as.query(api.annotations.getGuideHighlights, { guide: span.guide });
    const row = readGuideHighlight(guides[0]);
    expect(row).toMatchObject({ highlightColor: "#8040e0", underlineColor: preset.color });
    expect(guideSelectionMarks(null, row ? [row] : []).underlines).toContain(preset.color);
  });

  test("custom colors survive device storage reloads and render whole-verse marks", () => {
    const values = new Map<string, string>();
    const disk = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const store = new DeviceStudyStore(() => disk);
    store.saveAnnotation({ ...chapter, verse: 16 }, "A note", { highlightColor: preset.color, underlineColor: "#8040e0" });
    const reopened = new DeviceStudyStore(() => disk);
    reopened.refresh();
    const row = reopened.getSnapshot().annotations[0];
    expect(row).toMatchObject({ highlight_color: preset.color, underline_color: "#8040e0" });
    const html = renderToStaticMarkup(createElement(VerseMarkedText, { annotation: row }, "Whither thou goest"));
    expect(html).toContain("--verse-custom-highlight:#12ab8955;--verse-underline:#8040e0");
  });

  test.each(["orange", "#abc", "#ABCDEF", "#12345678", "#12zz89", "url(https://example.com)"])("rejects invalid color %s in every save API", async color => {
    const t = newBackend();
    const { as } = await signInAs(t, "alice");
    const invalid = color as MarkColor;
    const saved = await as.mutation(api.annotations.saveGuideHighlight, { ...span, highlightColor: "yellow" });
    await expect(as.mutation(api.preferences.saveMarkPresets, { presets: [{ ...preset, color: invalid }] })).rejects.toThrow();
    await expect(as.mutation(api.annotations.setVerseMarks, { ...chapter, verses: [16], highlightColor: invalid })).rejects.toThrow();
    await expect(as.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 16, body: "Note", underlineColor: invalid })).rejects.toThrow();
    await expect(as.mutation(api.annotations.upsertVerseAnnotation, { ...chapter, verse: 16, body: "Note", highlightColor: invalid })).rejects.toThrow();
    await expect(as.mutation(api.annotations.saveGuideHighlight, { ...span, highlightColor: invalid })).rejects.toThrow();
    await expect(as.mutation(api.annotations.setGuideAnnotation, { ...span, underlineColor: invalid })).rejects.toThrow();
    await expect(as.mutation(api.annotations.updateGuideHighlight, { highlightId: saved.id as Id<"guideHighlights">, highlightColor: invalid })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("verseAnnotations").collect())).toHaveLength(0);
  });
});
