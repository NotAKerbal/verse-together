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
      `<span class="verse-mark" data-verse-highlight="yellow">${text}</span>`
    );
    expect(render(row({ underline: true, underline_color: "green" }))).toBe(
      `<span class="verse-mark" data-verse-underline="green">${text}</span>`
    );
    expect(render(row({ highlight_color: "purple", underline: true, underline_color: "blue" }))).toBe(
      `<span class="verse-mark" data-verse-highlight="purple" data-verse-underline="blue">${text}</span>`
    );
    expect(render(row({ highlight_color: "red", underline: true, underline_color: "red" }))).toBe(
      `<span class="verse-mark" data-verse-highlight="red" data-verse-underline="red">${text}</span>`
    );
  });

  test("an underline saved before underlines had colors (or from an older server) is red", () => {
    expect(render(row({ underline: true }))).toBe(`<span class="verse-mark" data-verse-underline="red">${text}</span>`);
    expect(render(row({ underline: true, underline_color: null }))).toBe(
      `<span class="verse-mark" data-verse-underline="red">${text}</span>`
    );
  });

  test("leaves unmarked text unstyled, in the same wrapper, so marking it later keeps its text nodes", () => {
    const plain = `<span class="verse-mark">${text}</span>`;
    expect(render(undefined)).toBe(plain);
    expect(render(row({ body: "A note only" }))).toBe(plain);
    expect(render(row({ underline: false }))).toBe(plain);
    // A color with no underline marks nothing.
    expect(render(row({ underline: false, underline_color: "pink" }))).toBe(plain);
  });
});
