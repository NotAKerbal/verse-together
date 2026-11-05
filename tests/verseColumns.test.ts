import { readFileSync } from "node:fs";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/appData", () => ({ getReaderPreferences: async () => null, saveReaderPreferences: async () => undefined }));

import { JstPassageStatus } from "../src/components/JstVerseText";
import ReaderAppearanceControls from "../src/components/ReaderAppearanceControls";
import {
  VerseColumnsHeader,
  VerseColumnsRow,
  verseColumnsScopeStyle,
  type VerseColumn,
  type VerseComparisonCell,
} from "../src/components/VerseColumns";
import VerseMarkedText from "../src/features/annotations/VerseMarkedText";
import { buildJstChapterExcerpts, jstRowText, readJstChapter, type JstRow } from "../src/lib/jst";
import { getDefaultPreferences } from "../src/lib/preferences";
import { normalizeCompareText, readTranslationVerse } from "../src/lib/verseComparison";

const fixtures = JSON.parse(readFileSync(new URL("../src/lib/jst.fixtures.json", import.meta.url), "utf8")).entries;
const newTestament = JSON.parse(readFileSync(new URL("../public/scripture-data/newtestament.json", import.meta.url), "utf8"));

function kjvChapter(book: string, chapter: number): Array<{ verse: number; text: string }> {
  const found = newTestament.books.find((item: { book: string }) => item.book === book);
  return found.chapters.find((item: { chapter: number }) => item.chapter === chapter).verses;
}

const primaryColumn: VerseColumn = { key: "primary", label: "KJV", title: "King James Bible", colorClass: "text-amber-700" };
const jstColumn: VerseColumn = { key: "jst", label: "JST", title: "Joseph Smith Translation", colorClass: "text-muted" };
const netColumn: VerseColumn = { key: "eng_net", label: "NET", title: "NET Bible", colorClass: "text-sky-700" };
const bsbColumn: VerseColumn = { key: "BSB", label: "BSB", title: "Berean Standard Bible", colorClass: "text-emerald-700" };

const row = (overrides: Partial<JstRow> = {}): JstRow => ({
  verse: 43,
  excerptId: "jst-mark-9-40",
  label: "JST, Mark 9:40–48",
  compareReference: "Mark 9:43–48",
  first: true,
  pieces: [{ kind: "same", text: "And if thy hand" }, { kind: "added", text: "offend thee" }],
  ...overrides,
});

const primaryVerse = (verse: number, text: string, children?: ReactNode) =>
  createElement(
    "div",
    { "data-verse": verse, "data-verse-selectable": "true" },
    createElement("span", { className: "verse-badge" }, verse),
    children ?? createElement(VerseMarkedText, { annotation: null } as Parameters<typeof VerseMarkedText>[0], text)
  );

function renderRow(cells: VerseComparisonCell[], verse = 43, text = "And if thy hand offend thee, cut it off") {
  return renderToStaticMarkup(
    createElement(VerseColumnsRow, { primary: primaryVerse(verse, text), cells })
  );
}

function cellsOf(html: string): string[] {
  return html.split(/(?=<div class="verse-columns-cell)/).slice(1);
}

describe("comparison wording", () => {
  test("case and punctuation are not differences, and other scripts are compared rather than erased", () => {
    expect(readTranslationVerse("And he said, Go.", "and he said go")).toEqual({ kind: "same" });
    expect(readTranslationVerse("And he said", "And she said")).toEqual({ kind: "text", text: "And she said" });
    expect(normalizeCompareText("Ἐν ἀρχῇ")).not.toBe("");
    expect(readTranslationVerse("Ἐν ἀρχῇ ἦν", "בראשית ברא")).toEqual({ kind: "text", text: "בראשית ברא" });
    expect(readTranslationVerse("Dijo él", "Dijo el")).toEqual({ kind: "text", text: "Dijo el" });
  });

  test("a verse the translation doesn't have is reported as missing, not as matching", () => {
    expect(readTranslationVerse("Where their worm dieth not", undefined)).toEqual({ kind: "missing" });
    expect(readTranslationVerse("Where their worm dieth not", "   ")).toEqual({ kind: "missing" });
  });
});

describe("side by side rows", () => {
  test("the primary text appears once however many translations are compared", () => {
    const text = "Primary wording of the verse";
    const html = renderRow(
      [
        { column: netColumn, kind: "translation", reading: { kind: "text", text: "NET wording" } },
        { column: bsbColumn, kind: "translation", reading: { kind: "text", text: "BSB wording" } },
      ],
      7,
      text
    );
    expect(html.split(text)).toHaveLength(2);
    expect(html.match(/data-verse-text/g)).toHaveLength(1);
    expect(html).toContain("NET wording");
    expect(html).toContain("BSB wording");
  });

  test("every column keeps its place on every verse, and each state says what it means", () => {
    const html = renderRow([
      { column: jstColumn, kind: "jst", row: undefined, showOmitted: false },
      { column: netColumn, kind: "translation", reading: { kind: "same" } },
      { column: bsbColumn, kind: "translation", reading: { kind: "missing" } },
    ]);
    const [primary, jst, net, bsb] = cellsOf(html);
    expect(primary).toContain("data-verse-selectable");
    expect(jst).toContain('data-empty="true"');
    expect(jst).toContain("No JST passage for this verse.");
    expect(jst).not.toContain("Same wording");
    expect(net).toContain("Same wording");
    expect(net).not.toContain("data-empty");
    expect(bsb).toContain("No text for this verse");
    expect(bsb).not.toContain("data-empty");
  });

  test("comparison and JST wording can't be saved as primary offsets", () => {
    const html = renderRow([
      { column: jstColumn, kind: "jst", row: row(), showOmitted: true },
      { column: netColumn, kind: "translation", reading: { kind: "text", text: "If your hand causes you to stumble" } },
    ]);
    const [primary, ...comparisons] = cellsOf(html);
    expect(primary).toContain('data-verse="43"');
    expect(primary).toContain('data-verse-text="true"');
    expect(comparisons).toHaveLength(2);
    for (const cell of comparisons) {
      expect(cell).toContain("verse-columns-compare");
      expect(cell).toContain("data-verse-ignore");
      expect(cell).not.toContain("data-verse=");
      expect(cell).not.toContain("data-verse-text");
      expect(cell).not.toContain("data-verse-selectable");
    }
    expect(comparisons[0]).toContain('data-jst-reading="true"');
  });

  test("nothing beyond the verse's own wording sits in the primary cell's text", () => {
    const [primary] = cellsOf(renderRow([{ column: netColumn, kind: "translation", reading: { kind: "same" } }], 7, "Only this wording"));
    expect(primary).not.toContain("sr-only");
    expect(primary).not.toContain("King James");
  });

  test("a passage's first row is named once, by its own reference", () => {
    const [, first] = cellsOf(renderRow([{ column: jstColumn, kind: "jst", row: row({ first: true }), showOmitted: false }]));
    expect(first).not.toContain("verse-columns-label");
    expect(first).toContain("JST 9:40–48");
    const [, later] = cellsOf(renderRow([{ column: jstColumn, kind: "jst", row: row({ first: false }), showOmitted: false }]));
    expect(later).toContain("verse-columns-label");
    expect(later).not.toContain("JST 9:40–48");
  });

  test("marks stay on the primary wording beside the JST", () => {
    const text = "And if thy hand offend thee";
    const annotation = {
      id: "a",
      verse: 43,
      body: "",
      visibility: "private",
      highlight_color: null,
      user_id: "me",
      is_mine: true,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      text_marks: [{ start: 11, end: 15, text: "hand", kind: "highlight", color: "yellow" }],
    };
    const html = renderToStaticMarkup(
      createElement(VerseColumnsRow, {
        primary: primaryVerse(43, text, createElement(VerseMarkedText, { annotation } as unknown as Parameters<typeof VerseMarkedText>[0], text)),
        cells: [{ column: jstColumn, kind: "jst", row: row(), showOmitted: false }],
      })
    );
    const [primary, jst] = cellsOf(html);
    expect(primary).toContain('data-verse-highlight="yellow">hand</span>');
    expect(jst).not.toContain("data-verse-highlight");
    expect(html).not.toContain("Turn off the JST");
  });

  test("insight actions sit in the primary cell, so they can't change the column widths", () => {
    const html = renderToStaticMarkup(
      createElement(VerseColumnsRow, {
        primary: primaryVerse(1, "Text"),
        aside: createElement("button", null, "2 notes"),
        cells: [{ column: netColumn, kind: "translation", reading: { kind: "same" } }],
      })
    );
    const [primary, net] = cellsOf(html);
    expect(primary).toContain("simple-hide");
    expect(primary).toContain("2 notes");
    expect(net).not.toContain("2 notes");
  });

  test("the scope carries the reader's font size and the number of columns", () => {
    expect(verseColumnsScopeStyle(1.2, 3)).toEqual({ "--verse-font-size": "1.2rem", "--verse-column-count": 3 });
    const header = renderToStaticMarkup(createElement(VerseColumnsHeader, { columns: [primaryColumn, jstColumn, netColumn] }));
    expect(header.match(/<span/g)).toHaveLength(3);
    expect(header).toContain('aria-hidden="true"');
    expect(header.indexOf(">KJV<")).toBeLessThan(header.indexOf(">JST<"));
    expect(header.indexOf(">JST<")).toBeLessThan(header.indexOf(">NET<"));
  });
});

describe("JST columns from real appendix text", () => {
  const verses = kjvChapter("mark", 9);
  const excerpts = buildJstChapterExcerpts({ book: "mark", chapter: 9 }, [fixtures["jst-mark-9"]]);
  const reading = readJstChapter(excerpts, verses);

  test("a renumbered, multi-verse passage stays aligned with its KJV verses", () => {
    expect(Array.from(reading.rows.keys())).toEqual(expect.arrayContaining([43, 44, 45, 46, 47, 48]));
    for (const verse of [43, 44, 45, 46, 47, 48]) {
      const text = verses.find((item) => item.verse === verse)!.text;
      const jstRow = reading.rows.get(verse)!;
      const html = renderRow([{ column: jstColumn, kind: "jst", row: jstRow, showOmitted: false }], verse, text);
      const [primary, jst] = cellsOf(html);
      expect(primary).toContain(`data-verse="${verse}"`);
      expect(primary).toContain(text.replace(/'/g, "&#x27;"));
      expect(jst).toContain('data-jst-reading="true"');
      for (const word of jstRowText(jstRow).split(" ").slice(0, 3)) expect(jst).toContain(word.replace(/'/g, "&#x27;"));
    }
    const first = renderRow([{ column: jstColumn, kind: "jst", row: reading.rows.get(43)!, showOmitted: false }]);
    expect(first).toContain("JST 9:40–48");
    const renumbered = renderRow([{ column: jstColumn, kind: "jst", row: reading.rows.get(45)!, showOmitted: false }]);
    expect(renumbered).toContain('class="jst-verse-number"');
  });

  test("verses outside the passage keep an honest empty JST cell", () => {
    expect(reading.rows.has(42)).toBe(false);
    const html = renderRow([{ column: jstColumn, kind: "jst", row: reading.rows.get(42), showOmitted: false }], 42);
    expect(cellsOf(html)[1]).toContain('data-empty="true"');
    expect(html).not.toContain("data-jst-reading");
  });
});

describe("truthful copy", () => {
  const status = (passages: number, sideBySide: boolean) =>
    renderToStaticMarkup(createElement(Fragment, null, createElement(JstPassageStatus, { passages, sideBySide })));

  test("the JST status describes the view in use", () => {
    expect(status(1, true)).toContain("1 JST passage shown with the KJV");
    expect(status(2, true)).toContain("2 JST passages shown with the KJV");
    expect(status(1, true)).not.toContain("Turn off the JST");
    expect(status(1, false)).toContain("read in place of the KJV");
    expect(status(1, false)).toContain("Turn off the JST");
    expect(status(0, true)).toBe("The JST appendix has a note for this chapter.");
  });

  test("settings describe columns, stacking, and JST behavior", () => {
    const describeView = (comparisonView: "inline" | "sideBySide") =>
      renderToStaticMarkup(
        createElement(ReaderAppearanceControls, {
          prefs: { ...getDefaultPreferences(), comparisonView },
          onChange: () => undefined,
          showDescriptions: true,
        } as unknown as Parameters<typeof ReaderAppearanceControls>[0])
      );
    expect(describeView("sideBySide")).toContain("lines up in columns");
    expect(describeView("sideBySide")).toContain("JST wording");
    expect(describeView("sideBySide")).toContain("stacking when space is tight");
    expect(describeView("inline")).toContain("JST passages read in place of the KJV");
  });
});

describe("reading menu", () => {
  test("a chapter with JST passages offers the comparison view without another Bible turned on", () => {
    const reader = readFileSync(new URL("../src/components/ChapterReader.tsx", import.meta.url), "utf8");
    expect(reader).toContain("const hasJstColumn = jstReading.rows.size > 0;");
    expect(reader).toContain("showComparisonView={overlayTranslations.length > 0 || hasJstColumn}");
  });
});

describe("column layout rules", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  test("columns depend on the reader's type and available width, and stack otherwise", () => {
    expect(css).toMatch(/\.verse-columns \{[^}]*container: verse-columns \/ inline-size;[^}]*font-size: calc\(var\(--verse-font-size\) \* var\(--verse-column-count\)\);/);
    expect(css).toMatch(/\.verse-columns-row \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/@container verse-columns \(min-width: 15em\) \{[\s\S]*?\.verse-columns-row \{\s*grid-template-columns: repeat\(var\(--verse-column-count\), minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.verse-columns-compare \{[^}]*user-select: none;/);
  });
});
