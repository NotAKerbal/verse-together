import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import VerseMarkedText from "../src/features/annotations/VerseMarkedText";
import type { VerseAnnotation } from "../src/features/annotations/verseAnnotations";

const row = (extra: Partial<VerseAnnotation> = {}): VerseAnnotation => ({
  id: "a",
  verse: 7,
  body: "",
  visibility: "private",
  highlight_color: null,
  user_id: "me",
  is_mine: true,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  ...extra,
});

const text = "Wherefore she went forth out of the place where she was";
const render = (annotation: VerseAnnotation | null | undefined) =>
  // createElement passes the text as children; its props type still lists them as required.
  renderToStaticMarkup(createElement(VerseMarkedText, { annotation } as Parameters<typeof VerseMarkedText>[0], text));

describe("VerseMarkedText", () => {
  test("marks the verse's own words, inline, each mark in its own color", () => {
    expect(render(row({ highlight_color: "yellow" }))).toBe(
      `<span class="verse-mark" data-verse-text="true" data-verse-highlight="yellow">${text}</span>`
    );
    expect(render(row({ underline: true, underline_color: "green" }))).toBe(
      `<span class="verse-mark" data-verse-text="true" data-verse-underline="green">${text}</span>`
    );
    expect(render(row({ highlight_color: "purple", underline: true, underline_color: "blue" }))).toBe(
      `<span class="verse-mark" data-verse-text="true" data-verse-highlight="purple" data-verse-underline="blue">${text}</span>`
    );
    expect(render(row({ highlight_color: "red", underline: true, underline_color: "red" }))).toBe(
      `<span class="verse-mark" data-verse-text="true" data-verse-highlight="red" data-verse-underline="red">${text}</span>`
    );
  });

  test("an underline saved before underlines had colors (or from an older server) is red", () => {
    expect(render(row({ underline: true }))).toBe(`<span class="verse-mark" data-verse-text="true" data-verse-underline="red">${text}</span>`);
    expect(render(row({ underline: true, underline_color: null }))).toBe(
      `<span class="verse-mark" data-verse-text="true" data-verse-underline="red">${text}</span>`
    );
  });

  test("leaves unmarked text unstyled, in the same wrapper, so marking it later keeps its text nodes", () => {
    const plain = `<span class="verse-mark" data-verse-text="true">${text}</span>`;
    expect(render(undefined)).toBe(plain);
    expect(render(row({ body: "A note only" }))).toBe(plain);
    expect(render(row({ underline: false }))).toBe(plain);
    // A color with no underline marks nothing.
    expect(render(row({ underline: false, underline_color: "pink" }))).toBe(plain);
  });
});

describe("partial verse rendering", () => {
  test("wraps only the selected words through nested inline markup", () => {
    const annotation = row({ text_marks: [{ start: 6, end: 15, text: "ever thou", kind: "highlight", color: "yellow" }] });
    const html = renderToStaticMarkup(createElement(VerseMarkedText,
      { annotation } as Parameters<typeof VerseMarkedText>[0],
      "Where ", createElement("em", null, "ever thou"), " goest"));
    expect(html).toBe('<span class="verse-mark" data-verse-text="true">Where <em><span class="verse-mark" data-verse-highlight="yellow">ever thou</span></em> goest</span>');
  });

  test("ignores anchors that no longer match and combines independent highlight and underline ranges", () => {
    const annotation = row({ text_marks: [
      { start: 0, end: 9, text: "Wherefore", kind: "highlight", color: "blue" },
      { start: 0, end: 9, text: "Wherefore", kind: "underline", color: "red" },
      { start: 10, end: 13, text: "XXX", kind: "highlight", color: "pink" },
    ] });
    const html = render(annotation);
    expect(html).toContain('<span class="verse-mark" data-verse-highlight="blue" data-verse-underline="red">Wherefore</span> she');
    expect(html).not.toContain('data-verse-highlight="pink"');
  });
});

test("range offsets exclude footnote controls and comparison alternatives", () => {
  const annotation = row({ text_marks: [{ start: 6, end: 11, text: "goest", kind: "highlight", color: "green" }] });
  const html = renderToStaticMarkup(createElement(VerseMarkedText,
    { annotation } as Parameters<typeof VerseMarkedText>[0],
    "Thou ", createElement("sup", null, "a"), " ",
    createElement("span", { "data-verse-ignore": true }, "you"), "goest"));
  expect(html).toContain('<span class="verse-mark" data-verse-highlight="green">goest</span>');
  expect(html).toContain('<sup>a</sup>');
});

test("CFM typography uses canonical source offsets even after a double dash", () => {
  const annotation = row({ text_marks: [{ start: 9, end: 14, text: "goest", kind: "highlight", color: "green" }] });
  const html = renderToStaticMarkup(createElement(VerseMarkedText,
    { annotation, formatText: value => value.replace(/--/g, "—") } as Parameters<typeof VerseMarkedText>[0], "Thou--he goest"));
  expect(html).toBe('<span class="verse-mark" data-verse-text="true">Thou—he <span class="verse-mark" data-verse-highlight="green">goest</span></span>');
});
