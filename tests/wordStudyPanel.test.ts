import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/DictionaryEntryCard", () => ({ default: () => null }));
vi.mock("@/components/EtymologyEntryCard", () => ({ default: () => null }));

const { default: WordStudyPanel } = await import("../src/components/WordStudyPanel");

describe("Explore word study before the lookup completes", () => {
  test("shows a loading message instead of announcing an empty result", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: " Faith " }));
    expect(html).toContain("Looking up faith…");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("No definition");
    expect(html).not.toContain("No word history");
    expect(html).not.toContain("No dictionary");
    expect(html).toContain('aria-label="Dictionary and etymology"');
    expect(html).not.toContain('aria-label="Word study views"');
    expect(html).not.toContain('aria-pressed');
  });

  test("provides a named dismiss control when the reader supplies one", () => {
    const html = renderToStaticMarkup(createElement(WordStudyPanel, { word: "faith", onClose: () => {} }));
    expect(html).toContain('aria-label="Close word study"');
  });

  test("does not show a lookup panel for a blank selection", () => {
    expect(renderToStaticMarkup(createElement(WordStudyPanel, { word: "  " }))).toBe("");
  });
});
