// The reader's web-parity features: the Joseph Smith Translation read in place, whole-chapter comparison
// translations (inline and beneath each verse), chapter study paths, lesson Resources, journal note markers and
// Android Back leaving simple mode.
//
// Pure tests check the combined native text against the existing single-text document (selection and mark offsets
// must still be the KJV's). Route tests render the app's real routes with the mocked native text bridge
// (jest.setup.js) against a fetch that answers as the Verse Together site's routes do: /api/scriptures/jst bodies
// are built by the web's own buildJstChapterExcerpts from the captured Open Scripture API entries
// (src/lib/jst.fixtures.json). Nothing here exercises Android gestures, layout or the network.

import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { BackHandler } from "react-native";
import { buildJstChapterExcerpts, jstChapterTarget, readJstChapter } from "@/lib/jst";
import jstFixtures from "@/lib/jst.fixtures.json";
import { getChapter } from "../src/data/scripture";
import { buildReaderDocument, inlineDiffPieces, type ReaderExtrasStyle } from "../src/features/reader/readerDocument";
import { verseLessonResources } from "../src/features/reader/lessonResources";
import { journalRefsByVerse } from "../src/features/reader/journalRefs";
import { buildScriptureDocument, documentMarks, selectionRanges, type ScriptureStyle } from "../src/features/reader/scriptureDocument";
import { clearStudyCaches } from "../src/features/reader/studyData";
import { sharedPassagePath } from "../app/share/[volume]/[book]/[chapter]/[verses]";
import { annotationChapter, deviceChapterAnnotations, myAnnotationsByVerse } from "../src/shared/web";
import { resetBibleLibrary, saveBible, setDefaultBible, setJstEnabled } from "../src/storage/bibleLibrary";
import { faithTradition } from "../src/storage/faithTradition";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences, simpleMode } from "../src/storage/preferences";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
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

const john1 = getChapter("newtestament", "john", 1)!.verses;
const mark9 = getChapter("newtestament", "mark", 9)!.verses;
// The Berean Standard Bible's John 1:5, as HelloAO returns it through the site's chapter route.
const BSB_JOHN_1_5 = "The Light shines in the darkness, and the darkness has not overcome it.";

function jstBody(book: string, chapter: number) {
  const target = jstChapterTarget("newtestament", book, chapter)!;
  const entries = Object.values(jstFixtures.entries as Record<string, unknown>);
  return { volume: target.volume, book: target.book, chapter: target.chapter, excerpts: buildJstChapterExcerpts(target, entries) };
}

describe("the combined chapter text", () => {
  const verses = john1.slice(0, 6).map((verse) => ({ ...verse, note: verse.verse === 2 ? "A note on verse 2" : null }));

  it("is the existing document when nothing is added", () => {
    expect(buildReaderDocument(verses, STYLE, { style: EXTRAS, comparisons: [] }).document).toEqual(buildScriptureDocument(verses, STYLE));
  });

  it("lays out every plain verse exactly as before when one verse has a side-by-side comparison", () => {
    const plain = buildScriptureDocument(verses, STYLE);
    const { document } = buildReaderDocument(verses, STYLE, {
      style: EXTRAS,
      comparisonView: "sideBySide",
      primaryLabel: "KJV",
      comparisons: [{ id: "BSB", label: "BSB", color: "#0369a1", byVerse: new Map([[5, BSB_JOHN_1_5]]) }],
    });
    // Up to verse 5 the text, runs and paragraphs are the same; verse 5 becomes its card.
    const cut = plain.verses[4].blockStart;
    expect(document.text.slice(0, cut)).toBe(plain.text.slice(0, cut));
    expect(document.runs.filter((run) => run.end <= cut)).toEqual(plain.runs.filter((run) => run.end <= cut));
    expect(document.verses.map((region) => document.text.slice(region.start, region.end))).toEqual(plain.verses.map((region) => plain.text.slice(region.start, region.end)));
    // The note card is still the note's own text.
    const two = document.verses[1];
    expect(document.text.slice(two.note!.start, two.note!.end)).toBe("YOUR ANNOTATION\nA note on verse 2");
  });

  it("sets a side-by-side verse as a card per translation: the main text's cell, then the translation's", () => {
    const NET = "The light shines on in the darkness, but the darkness has not mastered it.";
    const { document, decorations, mirrors } = buildReaderDocument(verses, STYLE, {
      style: EXTRAS,
      comparisonView: "sideBySide",
      primaryLabel: "KJV",
      comparisons: [
        { id: "BSB", label: "BSB", color: "#0369a1", byVerse: new Map([[5, BSB_JOHN_1_5]]) },
        { id: "NET", label: "NET", color: "#047857", byVerse: new Map([[5, NET]]) },
      ],
    });
    const five = document.verses[4];
    const block = document.text.slice(five.blockStart, five.blockEnd);
    // Not the verse with lines under it: its number, then each card's labelled cells, the KJV first in each.
    expect(block).toBe(`5  \nKJV\n${john1[4].text}\nBSB\n${BSB_JOHN_1_5}\nKJV\n${john1[4].text}\nNET\n${NET}`);
    expect(document.text.slice(five.start, five.end)).toBe(john1[4].text);
    // Two cards (bordered, unfilled), each around two filled cells.
    const cards = decorations.filter((item) => item.stroke);
    const cells = decorations.filter((item) => !item.stroke);
    expect(cards).toHaveLength(2);
    expect(cells).toHaveLength(4);
    expect(cards.map((card) => document.text.slice(card.start, card.end))).toEqual([`KJV\n${john1[4].text}\nBSB\n${BSB_JOHN_1_5}`, `KJV\n${john1[4].text}\nNET\n${NET}`]);
    expect(cells.map((cell) => document.text.slice(cell.start, cell.end))).toEqual([`KJV\n${john1[4].text}`, `BSB\n${BSB_JOHN_1_5}`, `KJV\n${john1[4].text}`, `NET\n${NET}`]);
    // The KJV's cell selects as the KJV, exactly; the translation's wording selects nothing.
    const kjv = document.text.indexOf("shineth", five.start);
    expect(selectionRanges(document, kjv, kjv + 7)).toEqual([{ verse: 5, start: john1[4].text.indexOf("shineth"), end: john1[4].text.indexOf("shineth") + 7, text: john1[4].text }]);
    const bsb = document.text.indexOf("shines", five.start);
    expect(selectionRanges(document, bsb, bsb + 6)).toEqual([]);
    // A selection from verse 4 into the card is still one selection across verses.
    const four = document.verses[3];
    expect(selectionRanges(document, four.start, kjv + 7).map((range) => range.verse)).toEqual([4, 5]);
    // The second card's copy of the KJV is a mirror: marks draw on it too, but it never selects.
    expect(mirrors).toHaveLength(1);
    expect(document.text.slice(mirrors[0].start, mirrors[0].end)).toBe(john1[4].text);
    const copy = document.text.indexOf("shineth", mirrors[0].start);
    expect(selectionRanges(document, copy, copy + 7)).toEqual([]);
    const start = john1[4].text.indexOf("darkness");
    const annotation = { verse: 5, body: "", highlight_color: null, text_marks: [{ kind: "highlight", color: "yellow", start, end: start + 8, text: "darkness" }] } as never;
    const marks = documentMarks({ ...document, verses: [...document.verses, ...mirrors] }, (verse) => (verse === 5 ? annotation : null));
    expect(marks.map((mark) => mark.start)).toEqual([five.start + start, mirrors[0].start + start]);
  });

  it("shows an inline comparison in the verse, yet selects and marks only the KJV words", () => {
    const { document } = buildReaderDocument(verses, STYLE, {
      style: EXTRAS,
      comparisons: [{ id: "BSB", label: "BSB", color: "#0369a1", byVerse: new Map([[5, BSB_JOHN_1_5]]) }],
    });
    const five = document.verses[4];
    const shown = document.text.slice(five.start, five.end);
    expect(shown).toContain(" / ");
    expect(shown).toContain("shines");
    // Selecting only the comparison's word selects no scripture.
    const at = document.text.indexOf("shines", five.start);
    expect(selectionRanges(document, at, at + "shines".length)).toEqual([]);
    // Selecting the KJV's words gives the KJV's own offsets.
    const kjv = document.text.indexOf("shineth", five.start);
    expect(selectionRanges(document, kjv, kjv + "shineth".length)).toEqual([{ verse: 5, start: john1[4].text.indexOf("shineth"), end: john1[4].text.indexOf("shineth") + 7, text: john1[4].text }]);
    // A mark saved on the KJV words is drawn on them.
    const start = john1[4].text.indexOf("darkness");
    const marks = documentMarks(document, (verse) =>
      verse === 5 ? ({ verse: 5, body: "", highlight_color: null, text_marks: [{ kind: "highlight", color: "yellow", start, end: start + 8, text: "darkness" }] } as never) : null
    );
    expect(marks.map((mark) => document.text.slice(mark.start, mark.end))).toEqual(["darkness"]);
  });

  it("keeps the verse's own text, whitespace and all, as the inline pieces", () => {
    const pieces = inlineDiffPieces(john1[4].text, BSB_JOHN_1_5);
    expect(pieces.map((piece) => piece.primary).join("")).toBe(john1[4].text);
    expect(pieces.some((piece) => piece.changed && piece.alternative?.includes("shines"))).toBe(true);
  });

  it("reads JST passages in place with no selectable KJV words in them", () => {
    const reading = readJstChapter(jstBody("mark", 9).excerpts, mark9);
    expect(reading.integrated.map((excerpt) => excerpt.label)).toEqual(expect.arrayContaining(["JST, Mark 9:40–48"]));
    const { document, marks } = buildReaderDocument(mark9, STYLE, { style: EXTRAS, jstRows: reading.rows });
    expect(document.text).toContain("JST 9:40–48");
    expect(document.text).toContain("if thy brother offend thee");
    // The JST's own wording is underlined; KJV words it leaves out are hidden until asked for.
    expect(marks.length).toBeGreaterThan(0);
    const verse43 = document.verses.find((region) => region.verse === 43)!;
    expect(verse43.start).toBe(verse43.end);
    expect(selectionRanges(document, verse43.blockStart, verse43.blockEnd)).toEqual([]);
    // Verses the JST doesn't revise read and select as the KJV.
    const verse40 = document.verses.find((region) => region.verse === 40)!;
    expect(document.text.slice(verse40.start, verse40.end)).toBe(mark9[39].text);
    const omitted = buildReaderDocument(mark9, STYLE, { style: EXTRAS, jstRows: reading.rows, showJstOmitted: true }).document;
    expect(omitted.text.length).toBeGreaterThan(document.text.length);
    // Shown, the omitted KJV words are struck through (.jst-omitted), and nothing else is.
    const struck = omitted.runs.filter((run) => run.strikethrough);
    expect(struck.length).toBeGreaterThan(0);
    expect(document.runs.some((run) => run.strikethrough)).toBe(false);
    for (const run of struck) expect(omitted.verses.some((region) => run.start < region.end && run.end > region.start)).toBe(false);
  });
});

describe("lesson resources and journal note markers", () => {
  it("finds the bundled lesson's commentary on selected verses only", () => {
    const resources = verseLessonResources({ volume: "oldtestament", book: "isaiah", chapter: 41, verses: [3] });
    expect(resources.map((resource) => resource.reference)).toEqual(["Isaiah 41:2–4"]);
    expect(resources[0]).toMatchObject({ weekStart: "2026-09-28", anchor: "cfm-v-41-2-4", title: "the one raised from the east" });
    expect(resources[0].blocks.length).toBeGreaterThan(0);
    expect(verseLessonResources({ volume: "oldtestament", book: "isaiah", chapter: 41, verses: [1] })).toEqual([]);
    expect(verseLessonResources({ volume: "bookofmormon", book: "alma", chapter: 32, verses: [21] })).toEqual([]);
  });

  it("places a note's verse links at the start of each passage, skipping archived and empty notes", () => {
    const note = (id: string, extra: object = {}) => ({ kind: "note", id, title: `Note ${id}`, status: "draft", has_reflection: true, ...extra }) as never;
    const bodies = new Map([
      ["a", "See [John 1:3–5](/browse/newtestament/john/1#v-3) and [John 1:3–5](/browse/newtestament/john/1#v-3)."],
      ["b", "[John 1:1](/browse/newtestament/john/1#v-1)"],
      ["c", "[John 1:1](/browse/newtestament/john/1#v-1)"],
      ["d", "[Alma 32:21](/browse/bookofmormon/alma/32#v-21)"],
    ]);
    const refs = journalRefsByVerse([note("a"), note("b"), note("c", { status: "archived" }), note("d")], bodies, { volume: "newtestament", book: "john", chapter: 1 });
    expect([...refs.keys()].sort()).toEqual([1, 3]);
    expect(refs.get(3)).toEqual([{ noteId: "a", title: "Note a", verseStart: 3, verseEnd: 5 }]);
    expect(refs.get(1)?.map((ref) => ref.noteId)).toEqual(["b"]);
  });
});

describe("shared passage links", () => {
  it("open the chapter at the passage's first verse, as the web's share page reads them", () => {
    expect(sharedPassagePath({ volume: "bookofmormon", book: "alma", chapter: "32", verses: "21-28" })).toBe("/browse/bookofmormon/alma/32?verse=21&verses=21-28");
    expect(sharedPassagePath({ volume: "bookofmormon", book: "alma", chapter: "32", verses: "27, 21–23" })).toBe("/browse/bookofmormon/alma/32?verse=21&verses=21-23%2C27");
    // Clamped to the chapter's verses, as parseVerseSpec clamps them.
    expect(sharedPassagePath({ volume: "bookofmormon", book: "alma", chapter: "32", verses: "40-99" })).toBe("/browse/bookofmormon/alma/32?verse=40&verses=40-43");
    expect(sharedPassagePath({ volume: "bookofmormon", book: "alma", chapter: "99", verses: "1" })).toBeNull();
    expect(sharedPassagePath({ volume: "bookofmormon", book: "nobook", chapter: "1", verses: "1" })).toBeNull();
    expect(sharedPassagePath({ volume: "bookofmormon", book: "alma", chapter: "3x", verses: "1" })).toBeNull();
    expect(sharedPassagePath({ volume: "bookofmormon", book: "alma", chapter: "32", verses: "200" })).toBeNull();
  });
});

// ---- The real routes ----

type Reply = { status?: number; body?: unknown } | Error;
type Call = { url: URL; method: string; body?: string };
let calls: Call[] = [];
let route: (call: Call) => Reply;
const realFetch = global.fetch;
type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
let backHandlers: BackListener[] = [];

function installFetch() {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: new URL(String(input)), method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined };
    calls.push(call);
    const reply = route(call);
    if (reply instanceof Error) return Promise.reject(reply);
    const status = reply.status ?? 200;
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => reply.body } as unknown as Response);
  }) as typeof fetch;
}

/** The site with no study paths cached (signed out it can't research any) and nothing else asked for. */
function defaultRoute(call: Call): Reply {
  if (call.url.pathname === "/api/insights/chapter") return { status: 401, body: { error: "Sign in to generate chapter insights." } };
  return { status: 404, body: { error: "Not found" } };
}

async function settle(ms = 600) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await settle();
}

beforeEach(() => {
  setStoragePort(memoryStorage());
  readerPreferences.reset();
  lastPosition.reset();
  simpleMode.reset();
  faithTradition.reset();
  resetBibleLibrary();
  initDeviceStudy();
  resetNativeCalls();
  clearStudyCaches();
  calls = [];
  route = defaultRoute;
  installFetch();
  backHandlers = [];
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    backHandlers.push(handler);
    return { remove: () => (backHandlers = backHandlers.filter((item) => item !== handler)) };
  });
});

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("the chapter route", () => {
  it("reads the JST in place once it is turned on, and not for Other denominations", async () => {
    setJstEnabled(true);
    route = (call) => (call.url.pathname === "/api/scriptures/jst" ? { body: jstBody(call.url.searchParams.get("book")!, Number(call.url.searchParams.get("chapter"))) } : defaultRoute(call));
    await renderRouter("./app", { initialUrl: "/browse/newtestament/mark/9" });
    await screen.findByTestId("reader-text");
    await settle();
    await waitFor(() => expect(nativeText().text).toContain("JST 9:40–48"));
    expect(screen.getByText(/JST passages read in place of the KJV/)).toBeTruthy();
    const jstCall = calls.find((call) => call.url.pathname === "/api/scriptures/jst")!;
    expect(jstCall.url.origin).toBe("https://www.versetogether.org");
    expect(Object.fromEntries(jstCall.url.searchParams)).toEqual({ volume: "newtestament", book: "mark", chapter: "9" });
    // Selecting inside a JST reading offers no actions: it isn't the KJV text marks are saved on.
    await selectText("if thy brother offend thee");
    expect(screen.queryByTestId("verse-actions")).toBeNull();
    // KJV wording the JST leaves out can be shown.
    const before = nativeText().text.length;
    await press(screen.getByTestId("toggle-jst-omitted"));
    expect(nativeText().text.length).toBeGreaterThan(before);
  });

  it("says when the JST couldn't load and tries again", async () => {
    setJstEnabled(true);
    let fail = true;
    route = (call) => {
      if (call.url.pathname !== "/api/scriptures/jst") return defaultRoute(call);
      return fail ? { status: 504, body: { error: "The JST source took too long to respond." } } : { body: jstBody("mark", 9) };
    };
    await renderRouter("./app", { initialUrl: "/browse/newtestament/mark/9" });
    await screen.findByTestId("reader-text");
    await settle();
    expect(await screen.findByText(/Couldn't load Joseph Smith Translation excerpts. The JST source took too long to respond./)).toBeTruthy();
    fail = false;
    await press(screen.getByTestId("retry-jst"));
    await waitFor(() => expect(nativeText().text).toContain("JST 9:40–48"));
  });

  it("asks for no JST or study paths for Other denominations", async () => {
    setJstEnabled(true);
    faithTradition.set("other");
    await renderRouter("./app", { initialUrl: "/browse/newtestament/mark/9" });
    await screen.findByTestId("reader-text");
    await settle();
    expect(calls.filter((call) => call.url.pathname === "/api/scriptures/jst" || call.url.pathname === "/api/insights/chapter")).toEqual([]);
    expect(nativeText().text).not.toContain("JST");
  });

  it("compares a whole chapter with another translation and carries it to the next chapter", async () => {
    route = (call) => {
      if (call.url.pathname !== "/api/scriptures/chapter") return defaultRoute(call);
      const verses = john1.map((verse) => ({ verse: verse.verse, text: verse.verse === 5 ? BSB_JOHN_1_5 : verse.text }));
      return { body: { reference: "John 1", translation: call.url.searchParams.get("translation"), verses } };
    };
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1?translation=BSB" });
    await screen.findByTestId("reader-text");
    await settle();
    await waitFor(() => expect(nativeText().text).toContain("shines"));
    expect(screen.getByLabelText(/^Key: King James Bible \(LDS edition\), then Berean Standard Bible/)).toBeTruthy();
    const chapterCall = calls.find((call) => call.url.pathname === "/api/scriptures/chapter")!;
    expect(Object.fromEntries(chapterCall.url.searchParams)).toEqual({ volume: "newtestament", book: "john", chapter: "1", translation: "BSB" });
    // Verses that read the same aren't repeated.
    expect(nativeText().text.match(/ \/ /g)?.length).toBeGreaterThan(0);
    // Selecting the KJV words still quotes the KJV.
    await selectText("shineth");
    expect(screen.getByTestId("verse-actions")).toBeTruthy();
    // The next chapter keeps the comparison.
    expect(screen.getByLabelText("Next: John 2")).toBeTruthy();
  });

  it("names a comparison that couldn't load, and loads it on Try again", async () => {
    let fail = true;
    route = (call) => {
      if (call.url.pathname !== "/api/scriptures/chapter") return defaultRoute(call);
      if (fail) return new TypeError("Network request failed");
      return { body: { reference: "John 1", translation: "BSB", verses: john1.map((verse) => ({ verse: verse.verse, text: verse.verse === 5 ? BSB_JOHN_1_5 : verse.text })) } };
    };
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1?translation=BSB" });
    await screen.findByTestId("reader-text");
    await settle();
    expect(await screen.findByText('Could not load overlay translation "BSB".')).toBeTruthy();
    fail = false;
    await press(screen.getByTestId("retry-comparisons"));
    await waitFor(() => expect(nativeText().text).toContain("shines"));
  });

  it("turns a comparison on from the reader's Bible translations", async () => {
    route = (call) =>
      call.url.pathname === "/api/scriptures/chapter"
        ? { body: { reference: "John 1", translation: call.url.searchParams.get("translation"), verses: john1.map((verse) => ({ verse: verse.verse, text: verse.verse === 5 ? BSB_JOHN_1_5 : verse.text })) } }
        : defaultRoute(call);
    saveBible({ id: "BSB", label: "Berean Standard Bible", language: "English", abbreviation: "BSB" });
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1" });
    await screen.findByTestId("reader-text");
    await press(screen.getByTestId("reader-translations"));
    // The same Your Bibles list as Settings, with a Show switch for this chapter.
    expect(screen.getByTestId("bible-row-lds")).toBeTruthy();
    expect(screen.getByTestId("add-bible")).toBeTruthy();
    const show = screen.getByLabelText("Show Berean Standard Bible");
    expect(show.props.accessibilityState).toMatchObject({ checked: false });
    await press(show);
    await waitFor(() => expect(nativeText().text).toContain("shines"));
    expect(screen.getByLabelText("Show Berean Standard Bible").props.accessibilityState).toMatchObject({ checked: true });
    // Showing it here changes this chapter only: the saved default stays the King James Bible.
    expect(screen.getByLabelText("Use King James Bible (LDS edition) as default").props.accessibilityState).toMatchObject({ selected: true });
    await press(screen.getByLabelText("Show Berean Standard Bible"));
    await waitFor(() => expect(nativeText().text).not.toContain("shines"));
  });

  it("sets side-by-side comparisons as cards and still selects the main text in them", async () => {
    readerPreferences.set({ ...readerPreferences.get(), comparisonView: "sideBySide" });
    route = (call) =>
      call.url.pathname === "/api/scriptures/chapter"
        ? { body: { reference: "John 1", translation: "BSB", verses: john1.map((verse) => ({ verse: verse.verse, text: verse.verse === 5 ? BSB_JOHN_1_5 : verse.text })) } }
        : defaultRoute(call);
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1?translation=BSB" });
    await screen.findByTestId("reader-text");
    await settle();
    await waitFor(() => expect(nativeText().text).toContain(`BSB\n${BSB_JOHN_1_5}`));
    const { text, decorations } = nativeText();
    expect(text).toContain(`5  \nLDS\n${john1[4].text}\nBSB`);
    // No inline alternatives in this view.
    expect(text).not.toContain(" / ");
    // A bordered card around the verse's two cells.
    const card = decorations.find((item) => item.strokeWidth === 1 && item.radius === 6)!;
    expect(text.slice(card.start, card.end)).toBe(`LDS\n${john1[4].text}\nBSB\n${BSB_JOHN_1_5}`);
    await selectText("shineth");
    expect(screen.getByTestId("verse-actions")).toBeTruthy();
    expect(screen.getByText("John 1:5")).toBeTruthy();
  });

  it("reads a non-KJV default Bible as the main text, marking its own words and never the KJV's", async () => {
    saveBible({ id: "BSB", label: "Berean Standard Bible", language: "English", abbreviation: "BSB" });
    setDefaultBible("BSB");
    const JOHN_1 = annotationChapter("newtestament", "john", 1);
    const kjv5 = john1[4].text;
    // A mark made earlier on the KJV's "comprehended": those offsets name other words in the BSB.
    const at = kjv5.indexOf("comprehended");
    deviceStudy.setVerseMarks(JOHN_1, [5], { underlineColor: "blue", ranges: [{ verse: 5, start: at, end: at + 12, text: kjv5 }] });
    route = (call) =>
      call.url.pathname === "/api/scriptures/chapter"
        ? { body: { reference: "John 1", translation: call.url.searchParams.get("translation"), verses: john1.map((verse) => ({ verse: verse.verse, text: verse.verse === 5 ? BSB_JOHN_1_5 : verse.text })) } }
        : defaultRoute(call);
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1" });
    await screen.findByTestId("reader-text");
    await settle();
    await waitFor(() => expect(nativeText().text).toContain(BSB_JOHN_1_5));
    const chapterCall = calls.find((call) => call.url.pathname === "/api/scriptures/chapter")!;
    expect(chapterCall.url.searchParams.get("translation")).toBe("BSB");
    expect(nativeText().text).not.toContain("comprehended");
    // The KJV mark isn't drawn on the BSB's words.
    expect(nativeText().marks).toEqual([]);
    // Marking the BSB's words saves them, with the BSB verse as their text, and draws them.
    await selectText("overcome");
    await press(screen.getByTestId("quick-mark-highlight:yellow"));
    const row = myAnnotationsByVerse(deviceChapterAnnotations(deviceStudy.getSnapshot().annotations, JOHN_1)).get(5)!;
    const highlight = row.text_marks!.find((mark) => mark.kind === "highlight")!;
    expect(highlight).toMatchObject({ text: "overcome", start: BSB_JOHN_1_5.indexOf("overcome"), end: BSB_JOHN_1_5.indexOf("overcome") + 8 });
    const { text, marks } = nativeText();
    expect(marks.map((mark) => text.slice(mark.start, mark.end))).toEqual(["overcome"]);
  });

  it("opens a shared passage link at its verses", async () => {
    await renderRouter("./app", { initialUrl: "/share/bookofmormon/alma/32/21-23" });
    await screen.findByTestId("reader-text");
    const { text, decorations } = nativeText();
    const flash = decorations.find((item) => item.strokeWidth === 2)!;
    const shown = text.slice(flash.start, flash.end);
    expect(shown.startsWith("21  And now as I said concerning faith")).toBe(true);
    expect(shown).toContain("23  ");
    expect(shown).not.toContain("24  ");
    expect(screen.getByLabelText("Alma 32: choose a chapter")).toBeTruthy();
  });

  it("says when a share link names no passage", async () => {
    await renderRouter("./app", { initialUrl: "/share/bookofmormon/alma/32/none" });
    expect(await screen.findByText("Passage not found")).toBeTruthy();
    expect(screen.queryByTestId("reader-text")).toBeNull();
  });

  it("shows a cached study path beside its verse and opens it", async () => {
    route = (call) =>
      call.url.pathname === "/api/insights/chapter"
        ? {
            body: {
              reference: "John 1",
              cached: true,
              generated_at: "2026-10-01T00:00:00.000Z",
              paths: [
                {
                  kind: "cross_reference",
                  verse_numbers: [3],
                  title: "Creation through the Word",
                  direction: "Compare Moses 1:33 with this verse.",
                  why: "Both describe creation by the Son.",
                  look_for: ["Who acts in creation"],
                  sources: [{ title: "Moses 1", url: "https://www.churchofjesuschrist.org/study/scriptures/pgp/moses/1", format: "article" }],
                  scripture_links: [{ reference: "Moses 1:33", volume: "pearl", book: "moses", chapter: 1, verse_start: 33, verse_end: 33 }],
                },
              ],
            },
          }
        : defaultRoute(call);
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1" });
    await screen.findByTestId("reader-text");
    await settle();
    const insight = calls.find((call) => call.url.pathname === "/api/insights/chapter")!;
    expect(insight.method).toBe("POST");
    expect(JSON.parse(insight.body!)).toEqual({ volume: "newtestament", book: "john", chapter: 1 });
    await press(await screen.findByTestId("study-path-marker-3"));
    expect(screen.getByText("Creation through the Word")).toBeTruthy();
    expect(screen.getByText("AI found these directions. Read the sources and decide what holds up.")).toBeTruthy();
  });

  it("shows no study path markers when the site has none cached", async () => {
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1" });
    await screen.findByTestId("reader-text");
    await settle();
    expect(calls.some((call) => call.url.pathname === "/api/insights/chapter")).toBe(true);
    expect(screen.queryByTestId(/^study-path-marker-/)).toBeNull();
  });

  it("offers lesson Resources for selected verses", async () => {
    await renderRouter("./app", { initialUrl: "/browse/oldtestament/isaiah/41" });
    await screen.findByTestId("reader-text");
    await selectText("Who raised up the righteous man from the east");
    await press(screen.getByTestId("action-resources"));
    expect(await screen.findByText("ISAIAH 41:2–4")).toBeTruthy();
    expect(screen.getByText("the one raised from the east")).toBeTruthy();
  });

  it("hides Resources for Other denominations", async () => {
    faithTradition.set("other");
    await renderRouter("./app", { initialUrl: "/browse/oldtestament/isaiah/41" });
    await screen.findByTestId("reader-text");
    await selectText("Who raised up the righteous man from the east");
    expect(screen.queryByTestId("action-resources")).toBeNull();
  });

  it("marks a verse a journal note links to, and opens the note", async () => {
    const { id } = deviceStudy.createNote({ requestId: "parity-note", markdownBody: "The Word: [John 1:1](/browse/newtestament/john/1#v-1)", journalDate: "2026-10-27" });
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1" });
    await screen.findByTestId("reader-text");
    await settle();
    await press(await screen.findByTestId("note-marker-1"));
    await waitFor(() => expect(screen.getByTestId("entry-text")).toBeTruthy());
    expect(id).toBeTruthy();
  });

  it("leaves simple mode with Android's back button before leaving the chapter", async () => {
    simpleMode.set(true);
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
    await screen.findByTestId("reader-text");
    expect(screen.getByTestId("exit-simple-mode")).toBeTruthy();
    await act(async () => {
      backHandlers[backHandlers.length - 1]?.({} as Parameters<BackListener>[0]);
    });
    expect(simpleMode.get()).toBe(false);
    expect(screen.queryByTestId("exit-simple-mode")).toBeNull();
  });

  it("shows the faith tradition notice for a Latter-day Saint volume under Other denominations", async () => {
    faithTradition.set("other");
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
    expect(await screen.findByTestId("hidden-content")).toBeTruthy();
    expect(screen.queryByTestId("reader-text")).toBeNull();
  });
});
