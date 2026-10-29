// Side-by-side comparisons in two columns on a tablet's width (the web's md:grid-cols-2), and stacked cards below it.
//
// Pure tests check the left column's text (the chapter's main text, still one selectable text whose selections map
// to each verse's own words) and the row arithmetic. Route tests render the real chapter route with the mocked
// native text bridge (jest.setup.js), whose offsetTop answers each offset as its own top, and set the window's
// width with Dimensions.set, as a rotation changes it. React Native doesn't lay out under Jest, so a translation
// cell's height is reported with its own onLayout event, as the app receives it. Nothing here checks Android's or
// iOS's real line heights or the cells' real pixels: that needs the app on a device.

import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Dimensions } from "react-native";
import { getChapter } from "../src/data/scripture";
import { columnGeometry, rightHeights, rowPadding, TWO_COLUMN_MIN_WIDTH } from "../src/features/reader/ComparisonColumns";
import { buildReaderDocument, padRows, type Comparison, type ReaderExtrasStyle } from "../src/features/reader/readerDocument";
import { NOTE_CARD_PADDING, documentMarks, selectionRanges, type ScriptureStyle } from "../src/features/reader/scriptureDocument";
import { clearStudyCaches } from "../src/features/reader/studyData";
import { MARKER_GUTTER } from "../src/features/reader/VerseMarkers";
import { resetBibleLibrary } from "../src/storage/bibleLibrary";
import { faithTradition } from "../src/storage/faithTradition";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences, simpleMode } from "../src/storage/preferences";
import { initDeviceStudy } from "../src/storage/study";
import type { NativeParagraph } from "../modules/scripture-text";
import { nativeText, resetNativeCalls, selectText } from "../testing/scriptureText";

const STYLE: ScriptureStyle = {
  body: { font: "serif", size: 16, lineHeight: 28, color: "#111" },
  number: { font: "sans", size: 11, color: "#a00" },
  verseSpacing: 24,
  note: { layout: "card", label: { font: "sans", size: 11, color: "#666" }, body: { font: "sans", size: 14, lineHeight: 24, color: "#111" }, gap: 8 },
};
const EXTRAS: ReaderExtrasStyle = {
  primaryChange: "#b45309",
  muted: "#888",
  line: { font: "serif", size: 14, lineHeight: 24, color: "#111" },
  lineLabel: { font: "sans", size: 10, color: "#666" },
  jstLabel: { font: "sans", size: 11, color: "#666" },
  jstNumber: { font: "sans", size: 10, color: "#666" },
  jstOmitted: { font: "serif", size: 16, color: "#999", strikethrough: true },
  jstAddedUnderline: "#999",
  aside: { font: "sans", size: 12, lineHeight: 18, color: "#666", style: "italic" },
  lineGap: 4,
  card: { border: "#ddd", cellFill: "rgba(0, 0, 0, 0.03)" },
};
const END = "​";

const john1 = getChapter("newtestament", "john", 1)!.verses;
const BSB_JOHN_1_5 = "The Light shines in the darkness, and the darkness has not overcome it.";
const NET_JOHN_1_5 = "The light shines on in the darkness, but the darkness has not mastered it.";
// A long comparison: far taller beside verse 6 than the verse itself.
const LONG_JOHN_1_6 = Array.from({ length: 12 }, () => "There came a man who was sent from God, and his name was John.").join(" ");

const comparison = (id: string, byVerse: Array<[number, string]>, color = "#0369a1"): Comparison => ({ id, label: id, color, byVerse: new Map(byVerse) });

describe("the left column's text", () => {
  const verses = john1.slice(0, 7).map((verse) => ({ ...verse, note: verse.verse === 6 ? "A note on verse 6" : null }));
  const build = (columns: boolean) =>
    buildReaderDocument(verses, STYLE, {
      style: EXTRAS,
      comparisonView: "sideBySide",
      columns,
      primaryLabel: "KJV",
      comparisons: [comparison("BSB", [[5, BSB_JOHN_1_5], [6, LONG_JOHN_1_6]]), comparison("NET", [[5, NET_JOHN_1_5]], "#047857")],
    });

  it("holds each verse's main text once, in its own cell, with the translations left to the column beside it", () => {
    const { document, rows, mirrors, decorations } = build(true);
    const five = document.verses[4];
    expect(document.text.slice(five.blockStart, five.blockEnd)).toBe(`5  \nKJV\n${john1[4].text}`);
    expect(document.text.slice(five.blockStart, five.blockEnd + 2)).toBe(`5  \nKJV\n${john1[4].text}\n${END}`);
    // No translation's wording is in the native text, and the main text isn't repeated.
    expect(document.text).not.toContain("shines");
    expect(document.text).not.toContain("There came a man");
    expect(mirrors).toEqual([]);
    // Each side-by-side verse's row names its cells, in the order the legend lists the translations.
    expect(rows.map((row) => [row.verse, row.cells.map((cell) => cell.comparison.id)])).toEqual([
      [5, ["BSB", "NET"]],
      [6, ["BSB"]],
    ]);
    expect(rows[0].cells.map((cell) => cell.text)).toEqual([BSB_JOHN_1_5, NET_JOHN_1_5]);
    expect(document.text.slice(rows[0].cellStart, five.end)).toBe(`KJV\n${john1[4].text}`);
    expect(document.text[rows[0].endStart]).toBe(END);
    // The native text draws only the main text's cells; the cards are drawn around both columns by the screen.
    expect(decorations.filter((item) => item.stroke)).toEqual([]);
    expect(decorations.map((item) => document.text.slice(item.start, item.end))).toEqual([`KJV\n${john1[4].text}`, `KJV\n${john1[5].text}`]);
  });

  it("closes a verse with its note after its cell, and the end line after the note's card", () => {
    const { document, rows } = build(true);
    const six = document.verses[5];
    expect(document.text.slice(six.note!.start, six.note!.end)).toBe("YOUR ANNOTATION\nA note on verse 6");
    expect(rows[1]).toMatchObject({ verse: 6, endOutset: NOTE_CARD_PADDING });
    expect(rows[1].endStart).toBe(six.note!.end + 1);
    expect(rows[0].endOutset).toBe(6);
    // The note's last line and the cell without a note end with no space of their own: the end line's top is where
    // the verse's content ends.
    const before = (offset: number) => document.paragraphs.find((paragraph) => paragraph.end === offset)!;
    expect(before(rows[0].endStart).spacingAfter).toBe(0);
    expect(before(rows[1].endStart).spacingAfter).toBe(0);
  });

  it("selects across verses as one text, through a row and out of it, as in one column", () => {
    const { document } = build(true);
    const [four, five, six, seven] = [3, 4, 5, 6].map((index) => document.verses[index]);
    expect(selectionRanges(document, four.start, seven.end).map((range) => range.verse)).toEqual([4, 5, 6, 7]);
    const ranges = selectionRanges(document, four.start + 4, five.end);
    expect(ranges.map((range) => [range.verse, range.text.slice(range.start, range.end)])).toEqual([
      [4, john1[3].text.slice(4)],
      [5, john1[4].text],
    ]);
    // The labels, the note and the end lines never count as scripture.
    expect(selectionRanges(document, five.end, six.start)).toEqual([]);
    expect(selectionRanges(document, six.note!.start, seven.start)).toEqual([]);
    // Marks land on the cell's words, exactly where they are in one column.
    const at = john1[4].text.indexOf("darkness");
    const annotation = { verse: 5, body: "", highlight_color: null, text_marks: [{ kind: "highlight", color: "yellow", start: at, end: at + 8, text: "darkness" }] } as never;
    const marks = documentMarks(document, (verse) => (verse === 5 ? annotation : null));
    expect(marks.map((mark) => document.text.slice(mark.start, mark.end))).toEqual(["darkness"]);
  });

  it("adds a row's padding after its end line only: the same text, runs and selections", () => {
    const { document, rows } = build(true);
    const padded = padRows(document, rows, new Map([[6, 180]]));
    expect(padded.text).toBe(document.text);
    expect(padded.runs).toBe(document.runs);
    expect(padded.verses).toBe(document.verses);
    const changed = padded.paragraphs.filter((paragraph, index) => paragraph.spacingAfter !== document.paragraphs[index].spacingAfter);
    expect(changed).toHaveLength(1);
    expect(changed[0].start).toBe(rows[1].endStart);
    expect(changed[0].spacingAfter - document.paragraphs.find((paragraph) => paragraph.start === rows[1].endStart)!.spacingAfter).toBe(180);
    expect(selectionRanges(padded, padded.verses[3].start, padded.verses[6].end)).toEqual(selectionRanges(document, document.verses[3].start, document.verses[6].end));
    expect(padRows(document, rows, new Map())).toBe(document);
  });

  it("is the stacked cards below the breakpoint", () => {
    const { document, rows, mirrors } = build(false);
    expect(rows).toEqual([]);
    expect(document.text).toContain(`KJV\n${john1[4].text}\nBSB\n${BSB_JOHN_1_5}\nKJV\n${john1[4].text}\nNET\n${NET_JOHN_1_5}`);
    expect(document.text).not.toContain(END);
    expect(mirrors).toHaveLength(1);
  });
});

describe("the rows' arithmetic", () => {
  const rows = buildReaderDocument(john1.slice(0, 6), STYLE, {
    style: EXTRAS,
    comparisonView: "sideBySide",
    columns: true,
    primaryLabel: "KJV",
    comparisons: [comparison("BSB", [[5, BSB_JOHN_1_5]]), comparison("NET", [[5, NET_JOHN_1_5], [6, LONG_JOHN_1_6]])],
  }).rows;

  it("stacks a verse's translations beside it and pads the verse only where they are taller", () => {
    // Verse 5's two cells, CELL_GAP apart; verse 6's one long cell.
    const right = rightHeights(rows, new Map([["5:BSB", 60], ["5:NET", 70], ["6:NET", 420]]));
    expect(right).toEqual(new Map([[5, 138], [6, 420]]));
    expect(rowPadding(rows, new Map([[5, 150], [6, 100]]), right)).toEqual(new Map([[6, 320]]));
    // A fraction of a dp isn't padding.
    expect(rowPadding(rows, new Map([[5, 137.9], [6, 420]]), right)).toEqual(new Map());
    expect(rowPadding(rows, new Map([[5, 100.5]]), right)).toEqual(new Map([[5, 38]]));
  });

  it("waits for every cell of a verse before padding it", () => {
    const right = rightHeights(rows, new Map([["5:BSB", 60]]));
    expect(right.has(5)).toBe(false);
    expect(rowPadding(rows, new Map([[5, 10]]), right)).toEqual(new Map());
  });

  it("splits the width into two equal cells, keeping the marker gutter clear of the translations", () => {
    const plain = columnGeometry(688, 12);
    expect(plain).toEqual({ width: 688, leftWidth: 347, cellLeft: 348, cellWidth: 333 });
    // The main text's cell box: from the text's 12dp inset less 5, to 5 past the text's right edge.
    expect(plain.leftWidth - 12 + 5 - (12 - 5)).toBe(plain.cellWidth);
    expect(plain.cellLeft + plain.cellWidth).toBe(688 - 7);
    const marked = columnGeometry(688, MARKER_GUTTER);
    expect(marked.leftWidth - MARKER_GUTTER + 5 - 7).toBe(marked.cellWidth);
    expect(marked.cellLeft).toBeGreaterThanOrEqual(marked.leftWidth);
    expect(marked.cellLeft + marked.cellWidth).toBeLessThanOrEqual(688 - 7);
  });
});

// ---- The real chapter route ----

type Reply = { status?: number; body?: unknown } | Error;
type Call = { url: URL; method: string };
let route: (call: Call) => Reply;
const realFetch = global.fetch;
const startWindow = Dimensions.get("window");
const startScreen = Dimensions.get("screen");

function installFetch() {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const reply = route({ url: new URL(String(input)), method: init?.method ?? "GET" });
    if (reply instanceof Error) return Promise.reject(reply);
    const status = reply.status ?? 200;
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => reply.body } as unknown as Response);
  }) as typeof fetch;
}

/** The site's chapter route with John 1 in a translation that words verses 5 and 6 differently. */
function chapters(call: Call): Reply {
  if (call.url.pathname === "/api/scriptures/chapter") {
    const translation = call.url.searchParams.get("translation");
    const changed = translation === "NET" ? { 5: NET_JOHN_1_5 } : { 5: BSB_JOHN_1_5, 6: LONG_JOHN_1_6 };
    return { body: { reference: "John 1", translation, verses: john1.map((verse) => ({ verse: verse.verse, text: changed[verse.verse as 5] ?? verse.text })) } };
  }
  if (call.url.pathname === "/api/insights/chapter") return { status: 401, body: { error: "Sign in to generate chapter insights." } };
  return { status: 404, body: { error: "Not found" } };
}

async function settle(ms = 600) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function setWindow(width: number, height = 900, fontScale = 1) {
  await act(async () => {
    Dimensions.set({ window: { width, height, scale: 2, fontScale }, screen: { width, height, scale: 2, fontScale } });
  });
  await settle();
}

/** A translation cell laid out at a height, as React Native reports it. */
async function layOutCell(verse: number, id: string, height: number) {
  await act(async () => {
    fireEvent(screen.getByTestId(`comparison-cell-${verse}-${id}`), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } });
  });
  await settle();
}

function paragraphs(): NativeParagraph[] {
  return (screen.getByTestId("reader-text").props as { content: { paragraphs: NativeParagraph[] } }).content.paragraphs;
}

/** The space after a verse's end line in the native text. */
function spaceAfterRow(verse: number) {
  const { text } = nativeText();
  const start = text.indexOf(END, text.indexOf(`${verse}  \n`));
  return paragraphs().find((paragraph) => paragraph.start === start)!.spacingAfter;
}

async function openJohn1(query = "translation=BSB") {
  await renderRouter("./app", { initialUrl: `/browse/newtestament/john/1?${query}` });
  await screen.findByTestId("reader-text");
  await settle();
}

beforeEach(() => {
  jest.useFakeTimers();
  setStoragePort(memoryStorage());
  readerPreferences.reset();
  readerPreferences.set({ ...readerPreferences.get(), comparisonView: "sideBySide" });
  lastPosition.reset();
  simpleMode.reset();
  faithTradition.reset();
  resetBibleLibrary();
  initDeviceStudy();
  resetNativeCalls();
  clearStudyCaches();
  route = chapters;
  installFetch();
});

afterEach(() => {
  global.fetch = realFetch;
  Dimensions.set({ window: startWindow, screen: startScreen });
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("side by side on the chapter route", () => {
  it("sits the translations in a column beside the main text on a tablet's width", async () => {
    await setWindow(1024);
    await openJohn1();
    await waitFor(() => expect(screen.getByTestId("comparison-cell-5-BSB")).toBeTruthy());
    const { text, decorations } = nativeText();
    // The native text is the left column: verse 5's main text in its cell, the BSB's wording beside it.
    expect(text).toContain(`5  \nLDS\n${john1[4].text}\n${END}`);
    expect(text).not.toContain("shines");
    expect(decorations.some((item) => item.stroke && item.radius === 6)).toBe(false);
    expect(screen.getByLabelText(`BSB, verse 5: ${BSB_JOHN_1_5}`)).toBeTruthy();
    expect(screen.getByTestId("comparison-cell-6-BSB")).toBeTruthy();
    // Two equal columns across the comfortable reading width (672, less the page's padding, plus the text's bleed).
    const geometry = columnGeometry(672 - 40 + 16, 12);
    expect(screen.getByTestId("reader-text").props.style).toEqual(expect.arrayContaining([{ width: geometry.leftWidth }]));
    // Once the text has laid out, each row of cells is level with its verse's cell (the mock's line tops are offsets).
    const row = screen.getByTestId("comparison-row-5");
    const cellStart = text.indexOf("LDS\n", text.indexOf("5  \n"));
    await waitFor(() => expect(row.props.style).toMatchObject({ top: cellStart - 6, opacity: 1 }));
  });

  it("stacks the cards below the breakpoint, and on a phone", async () => {
    await setWindow(TWO_COLUMN_MIN_WIDTH - 1);
    await openJohn1();
    await waitFor(() => expect(nativeText().text).toContain(`BSB\n${BSB_JOHN_1_5}`));
    expect(nativeText().text).toContain(`5  \nLDS\n${john1[4].text}\nBSB`);
    expect(nativeText().text).not.toContain(END);
    expect(screen.queryByTestId("comparison-cell-5-BSB")).toBeNull();
    expect(nativeText().decorations.some((item) => item.strokeWidth === 1 && item.radius === 6)).toBe(true);
  });

  it("keeps inline comparisons inline on a tablet", async () => {
    readerPreferences.set({ ...readerPreferences.get(), comparisonView: "inline" });
    await setWindow(1024);
    await openJohn1();
    await waitFor(() => expect(nativeText().text).toContain(" / "));
    expect(screen.queryByTestId("comparison-cell-5-BSB")).toBeNull();
  });

  it("starts the next verse below a long comparison, with no change to the text", async () => {
    await setWindow(1024);
    await openJohn1();
    await waitFor(() => expect(screen.getByTestId("comparison-cell-6-BSB")).toBeTruthy());
    const before = nativeText().text;
    const unpadded = spaceAfterRow(6);
    const { text } = nativeText();
    const cellStart = text.indexOf("LDS\n", text.indexOf("6  \n"));
    const endStart = text.indexOf(END, cellStart);
    // Verse 6's own content, as the mocked text measures it: its cell's line to its end line, with the boxes' padding.
    const own = endStart - cellStart + 6 + 6;
    await layOutCell(6, "BSB", own + 400);
    await waitFor(() => expect(spaceAfterRow(6)).toBe(unpadded + 400));
    expect(nativeText().text).toBe(before);
    // A short comparison beside verse 5 adds nothing.
    await layOutCell(5, "BSB", 10);
    // Its cell's padding, the card's, and the space between verses.
    expect(spaceAfterRow(5)).toBe(6 + 8 + 24);
    // The row's card goes around the taller side, and the text and cells together are at least as tall as it.
    const card = await screen.findByTestId("comparison-card-6");
    expect(card.props.style).toMatchObject({ top: cellStart - 6 - 8, height: own + 400 + 16, borderWidth: 1 });
    expect(screen.getByTestId("reader-text-columns").props.style.minHeight).toBeGreaterThanOrEqual(cellStart - 6 + own + 400 + 8);
    // Measuring again (another layout pass) settles on the same padding: nothing loops.
    const settled = paragraphs();
    await settle(2000);
    expect(paragraphs()).toEqual(settled);
  });

  it("selects across verses in two columns as one selection of the main text", async () => {
    await setWindow(1024);
    await openJohn1();
    await waitFor(() => expect(screen.getByTestId("comparison-cell-5-BSB")).toBeTruthy());
    await layOutCell(6, "BSB", 900);
    // From verse 4, through verse 5's cell and past the long row beside verse 6, into verse 7.
    await selectText("In him was life", { through: "The same came for a witness" });
    expect(screen.getByTestId("verse-actions")).toBeTruthy();
    expect(screen.getByText(/John 1:4.7/)).toBeTruthy();
  });

  it("measures again after a rotation, a font change or another translation, never with the old layout's heights", async () => {
    readerPreferences.set({ ...readerPreferences.get(), textWidth: "full" });
    await setWindow(1024);
    await openJohn1();
    await waitFor(() => expect(screen.getByTestId("comparison-cell-6-BSB")).toBeTruthy());
    const unpadded = spaceAfterRow(6);
    await layOutCell(6, "BSB", 2000);
    await waitFor(() => expect(spaceAfterRow(6)).toBeGreaterThan(unpadded));
    const wideWidth = (screen.getByTestId("reader-text").props.style as Array<{ width?: number }>).find((item) => item?.width)!.width;

    // Turned to portrait below the breakpoint: stacked cards, no padding, no cells.
    await setWindow(760);
    expect(nativeText().text).toContain(`BSB\n${BSB_JOHN_1_5}`);
    expect(screen.queryByTestId("comparison-cell-6-BSB")).toBeNull();

    // Back to a wider landscape: two columns again at the new width, the earlier cell height dropped until measured.
    await setWindow(1366);
    await waitFor(() => expect(screen.getByTestId("comparison-cell-6-BSB")).toBeTruthy());
    const newWidth = (screen.getByTestId("reader-text").props.style as Array<{ width?: number }>).find((item) => item?.width)!.width;
    expect(newWidth).toBe(columnGeometry(1366 - 40 + 16, 12).leftWidth);
    expect(newWidth).not.toBe(wideWidth);
    expect(spaceAfterRow(6)).toBe(unpadded);
    await layOutCell(6, "BSB", 1500);
    await waitFor(() => expect(spaceAfterRow(6)).toBeGreaterThan(unpadded));

    // A larger reading size: the text's runs change, the padding waits for the cells' new heights.
    await act(async () => readerPreferences.set({ ...readerPreferences.get(), fontScale: 1.3 }));
    await settle();
    expect(spaceAfterRow(6)).toBe(unpadded);
    expect(nativeText().view.props.content.runs.some((run: { size: number }) => run.size === 14 * 1.3)).toBe(true);
    await layOutCell(6, "BSB", 1800);
    await waitFor(() => expect(spaceAfterRow(6)).toBeGreaterThan(unpadded));

    // A larger system font: the same.
    await setWindow(1366, 900, 1.5);
    expect(spaceAfterRow(6)).toBe(unpadded);
  });

  it("stacks a second translation's cell beside the same verse and pads for both", async () => {
    await setWindow(1024);
    await openJohn1("translation=BSB&compare=NET");
    await waitFor(() => expect(screen.getByTestId("comparison-cell-5-NET")).toBeTruthy());
    expect(screen.getByTestId("comparison-cell-5-BSB")).toBeTruthy();
    const { text } = nativeText();
    expect(text).not.toContain("mastered");
    const cellStart = text.indexOf("LDS\n", text.indexOf("5  \n"));
    const own = text.indexOf(END, cellStart) - cellStart + 12;
    const unpadded = spaceAfterRow(5);
    // One cell measured isn't enough to pad the row.
    await layOutCell(5, "BSB", own);
    expect(spaceAfterRow(5)).toBe(unpadded);
    await layOutCell(5, "NET", 50);
    await waitFor(() => expect(spaceAfterRow(5)).toBe(unpadded + 8 + 50));
  });
});
