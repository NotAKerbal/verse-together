import { describe, expect, test } from "vitest";
import { Text } from "@codemirror/state";
import { commonmarkLanguage } from "@codemirror/lang-markdown";
import { previewRanges, type PreviewRange } from "../src/features/notes/markdownPreview";
import { safeNoteUrl } from "../src/features/notes/journal";

function preview(markdown: string, active: number[] = []) {
  const doc = Text.of(markdown.split("\n"));
  const ranges = previewRanges(commonmarkLanguage.parser.parse(markdown), doc, new Set(active));
  const slice = (range: { from: number; to: number }) => markdown.slice(range.from, range.to);
  return {
    hidden: ranges.filter((r) => r.type === "hide").map(slice),
    marks: ranges
      .filter((r): r is Extract<PreviewRange, { type: "mark" }> => r.type === "mark")
      .map((r) => [r.className, slice(r), ...(r.href ? [r.href] : [])]),
    lines: ranges
      .filter((r): r is Extract<PreviewRange, { type: "line" }> => r.type === "line")
      .map((r) => [doc.lineAt(r.from).number, r.className]),
  };
}

// What Add to note appends for a scripture passage (convex/noteJournal.ts blockToMarkdown).
const added = "**[Jeremiah 1](</browse/oldtestament/jeremiah/1#v-7>)**\n> Say not, I am a child:\n>\n> for thou shalt go";

describe("Markdown live preview", () => {
  test("an added passage shows as a bold followable link above a quote, its syntax hidden", () => {
    const { hidden, marks, lines } = preview(added);
    expect(hidden).toEqual(["**", "**", "[", "](</browse/oldtestament/jeremiah/1#v-7>)", "> ", ">", "> "]);
    expect(marks).toContainEqual(["cm-md-strong", "**[Jeremiah 1](</browse/oldtestament/jeremiah/1#v-7>)**"]);
    expect(marks).toContainEqual(["cm-md-link", "Jeremiah 1", "/browse/oldtestament/jeremiah/1#v-7"]);
    expect(lines).toEqual([
      [2, "cm-md-quote"],
      [3, "cm-md-quote"],
      [4, "cm-md-quote"],
    ]);
  });

  test("syntax on lines the caret is on stays visible for editing, with the same styling", () => {
    const { hidden, marks } = preview(added, [1, 3]);
    expect(hidden).toEqual(["> ", "> "]);
    expect(marks).toContainEqual(["cm-md-link", "Jeremiah 1", "/browse/oldtestament/jeremiah/1#v-7"]);
  });

  test("emphasis, inline code, autolinks and list markers", () => {
    const { hidden, marks } = preview("- *one* and `two`\n1. see <https://example.com>");
    expect(hidden).toEqual(["*", "*", "`", "`", "<", ">"]);
    expect(marks).toEqual([
      ["cm-md-list-mark", "-"],
      ["cm-md-em", "*one*"],
      ["cm-md-code", "`two`"],
      ["cm-md-list-mark", "1."],
      ["cm-md-link", "https://example.com", "https://example.com"],
    ]);
  });

  test("unsafe link destinations are styled but not followable", () => {
    for (const url of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "data:text/html,x"]) {
      expect(preview(`[x](${url})`).marks).toEqual([["cm-md-link", "x"]]);
    }
  });

  test("bracketed text without a destination, and code, are left as typed", () => {
    const text = "- [x] task\n\n```md\n**not bold** [a](/b)\n```\n\n    *indented*";
    const { hidden, marks, lines } = preview(text);
    expect(hidden).toEqual([]);
    expect(marks).toEqual([
      ["cm-md-list-mark", "-"],
      ["cm-md-marker", "```"],
      ["cm-md-marker", "```"],
      ["cm-md-marker", "md"],
    ]);
    expect(lines).toEqual([
      [3, "cm-md-code-block"],
      [4, "cm-md-code-block"],
      [5, "cm-md-code-block"],
      [7, "cm-md-code-block"],
    ]);
  });

  test("never hides across a line break", () => {
    // The title on the next line would take the line break with it, so the link's tail stays visible.
    const { hidden, marks } = preview('[two](/browse\n"title")');
    expect(hidden).toEqual(["["]);
    expect(marks).toEqual([["cm-md-link", "two", "/browse"]]);
  });
});

describe("safeNoteUrl", () => {
  test("keeps app paths and web or mail links; refuses everything else", () => {
    expect(safeNoteUrl(" /browse/oldtestament/jeremiah/1#v-7 ")).toBe("/browse/oldtestament/jeremiah/1#v-7");
    expect(safeNoteUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeNoteUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
    for (const url of ["//evil.example", "/\\evil.example", "javascript:alert(1)", "https://a b", "ftp://x", ""]) {
      expect(safeNoteUrl(url)).toBeNull();
    }
  });
});
