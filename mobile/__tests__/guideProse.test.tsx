// Study-guide prose annotations: the generated text index matches the website's DOM text (so spans anchor alike on
// both), selections become exact spans of their part and back, mixed-book guides keep each book's prose and links,
// and the lesson route marks, notes, links, copies, shares and journals guide prose on this device. The native view is
// the Jest host element from jest.setup.js: selections and taps are its events, not a finger on a device.

import path from "node:path";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import * as Clipboard from "expo-clipboard";
import { Alert, Linking, Share } from "react-native";
import { parseFragment } from "parse5";
import type { Block, NativeGuide, Run } from "../src/cfm/guideTypes";
import { nativeGuides } from "../src/cfm/guides";
import * as draftIntent from "../src/features/journal/draftIntent";
import {
  blockHeadings,
  buildProseDocument,
  guideReference,
  guideRoots,
  partIndex,
  partSpan,
  proseMarks,
  rootKey,
  runSources,
  shownRanges,
  shownSections,
  type ProseParagraph,
} from "../src/features/cfm/guideProse";
import { describeSpan, resolveAnchor } from "@/features/comeFollowMe/guideAnchors";
import { DEVICE_STUDY_KEY } from "../src/shared/web";
import { memoryStorage, setStoragePort, storage } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { nativeCalls, nativeText, resetNativeCalls, selectText } from "../testing/scriptureText";

const guide = (start: string) => nativeGuides().find((item) => item.startDate === start)!;
const MIXED = "2026-10-26";

// ---------------------------------------------------------------------------------------------------------------
// The generated data against the website's DOM

/** Every run array in some blocks. */
function runLists(blocks: readonly Block[], out: Run[][] = []): Run[][] {
  for (const block of blocks) {
    if (block.kind === "heading") out.push(block.runs, ...(block.title ? [block.title] : []), ...(block.refRuns ? [block.refRuns] : []));
    else if (block.kind === "p") out.push(block.runs);
    else if (block.kind === "list") block.items.forEach((item) => runLists(item, out));
    else if (block.kind === "quote") runLists(block.blocks, out);
    else if (block.kind === "table") block.rows.forEach((row) => out.push(...row.cells));
    else if (block.kind === "figure" && block.caption) out.push(block.caption);
    else if (block.kind === "sources") out.push(...block.items);
  }
  return out;
}

function eachRoot(item: NativeGuide, visit: (blocks: readonly Block[], text: string, label: string) => void) {
  visit(item.introduction, item.introductionRoot.text, "introduction");
  for (const section of item.sections) {
    visit(section.heading, section.headingRoot.text, section.id);
    for (const block of section.blocks) {
      visit(block.preview, block.previewRoot.text, block.id);
      if (block.moreRoot) visit(block.more, block.moreRoot.text, `${block.id}-more`);
    }
  }
  if (item.fallbackRoot) visit(item.fallback, item.fallbackRoot.text, "fallback");
  visit(item.closing, item.closingRoot.text, "closing");
}

/** A part's text as the website indexes it: its elements' DOM text (a browser's parse), in its element order. */
function websitePart(htmls: readonly string[]) {
  let text = "";
  const anchors: Array<{ id: string; start: number }> = [];
  type Node = { nodeName: string; value?: string; tagName?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[] };
  const walk = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (node.nodeName === "#text") text += node.value;
      else if (node.tagName) {
        const id = node.attrs?.find((attr) => attr.name === "id")?.value;
        if (id && /^[A-Za-z0-9_-]{0,120}$/.test(id)) anchors.push({ id, start: text.length });
        walk(node.childNodes ?? []);
      }
    }
  };
  for (const html of htmls) walk(parseFragment(html).childNodes as unknown as Node[]);
  return { text, anchors };
}

describe("guide prose data", () => {
  it("maps every run's characters onto the same words of its element's text", () => {
    let checked = 0;
    for (const item of nativeGuides()) {
      eachRoot(item, (blocks, text, label) => {
        for (const runs of runLists(blocks)) {
          for (const run of runs) {
            runSources(run).forEach((source, index) => {
              if (source < 0) return;
              const shown = run.text[index];
              const page = text[source];
              if (!(shown === page || (shown === " " && /\s/.test(page)))) throw new Error(`${item.slug} ${label}: "${run.text}" #${index} is "${shown}", page has "${page}"`);
              checked++;
            });
          }
        }
      });
    }
    expect(checked).toBeGreaterThan(100_000);
  });

  it("gives each part the website's exact text and block anchors, in the website's element order", () => {
    const { readGuides, readGuide } = jest.requireActual("../../src/lib/cfm/cfmGuide.ts") as typeof import("../../src/lib/cfm/cfmGuide");
    const repo = path.resolve(__dirname, "../..");
    for (const meta of readGuides(repo)) {
      const parsed = readGuide(meta, repo);
      const item = nativeGuides().find((candidate) => candidate.slug === meta.slug)!;
      const shown = shownSections(item);
      const shownIds = new Set([...shown].map((section) => section.id));
      // StudyCompanion: guideRoots (sections' heading, each block's preview and full commentary), the fallback, the closing.
      const reader = [
        ...parsed.readerSections
          .filter((section) => shownIds.has(section.id))
          .flatMap((section) => [section.headingHtml, ...section.blocks.flatMap((block) => (block.previewEnd ? [block.html.slice(0, block.previewEnd), block.html.slice(block.previewEnd)] : [block.html]))]),
        ...(parsed.readerSections.length === 0 ? [parsed.readerHtml] : []),
        ...(parsed.closingHtml ? [parsed.closingHtml] : []),
      ];
      const roots = guideRoots(item);
      const web = { introduction: websitePart(parsed.introductionHtml ? [parsed.introductionHtml] : []), reader: websitePart(reader) };
      for (const part of ["introduction", "reader"] as const) {
        const index = partIndex(part, roots[part]);
        expect({ slug: meta.slug, part, text: index.text }).toEqual({ slug: meta.slug, part, text: web[part].text });
        expect(index.anchors).toEqual(web[part].anchors);
      }
    }
  });

  it("shows every chapter section of a two-book guide, each in its own book", () => {
    const item = guide(MIXED);
    const shown = [...shownSections(item)].map((section) => section.chapter);
    expect(shown).toEqual(expect.arrayContaining([31, 32, 33, 36, 37, 38, 39, 1001, 1003]));
    // Links in Lamentations' prose name Lamentations, never Jeremiah's chapter of the same number.
    const lamentations = item.sections.find((section) => section.chapter === 1003)!;
    const refs = lamentations.blocks.flatMap((block) => runLists(block.preview).flat()).filter((run) => run.ref?.local);
    expect(refs.length).toBeGreaterThan(0);
    // Every in-guide link is to one of the week's own chapters, in its real book; Lamentations 3 is never Jeremiah 3.
    for (const run of refs) {
      expect(item.range.entries.some((entry) => entry.slug === run.ref!.book && entry.chapter === run.ref!.chapter)).toBe(true);
    }
    expect(refs.some((run) => run.ref!.book === "lamentations" && run.ref!.chapter === 3)).toBe(true);
    expect(refs.some((run) => run.ref!.book === "jeremiah" && run.ref!.chapter === 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Selections, spans and marks

const look = { font: "serif", size: 17, lineHeight: 28, color: "#000", spacingAfter: 14 };
const plainStyle = (_run: Run, base: typeof look) => ({ font: base.font, size: base.size, color: base.color });

describe("guide prose selections", () => {
  const item = guide(MIXED);
  const roots = guideRoots(item);
  const reader = partIndex("reader", roots.reader);
  const section = item.sections.find((candidate) => candidate.chapter === 1003)!;
  const block = section.blocks[0];
  const key = rootKey.preview(block.id);
  const paragraphs: ProseParagraph[] = runLists(block.preview).map((runs) => ({ runs, root: key, look }));
  const doc = buildProseDocument(paragraphs, plainStyle, (root) => (root === key ? reader.spans.get(key)!.start : undefined));

  it("turns a selection into the exact span of its part, across paragraphs, and finds it again", () => {
    const phrase = "He is an individual sufferer";
    const start = doc.text.indexOf(phrase);
    const span = partSpan(doc, start, start + phrase.length)!;
    expect(reader.text.slice(span.start, span.end)).toBe(phrase);
    const described = describeSpan(reader, span.start, span.end);
    if (!described.ok) throw new Error("not described");
    expect(described.anchor.exact).toBe(phrase);
    expect(resolveAnchor(reader, described.anchor)).toEqual({ start: span.start, end: span.end });
    expect(shownRanges(doc, span.start, span.end)).toEqual([{ start, end: start + phrase.length }]);

    // Across a paragraph break: the line break between them isn't the page's text, but the span runs on.
    const from = doc.text.indexOf("autobiography.");
    const to = doc.text.indexOf("The chapter moves") + "The chapter moves".length;
    const across = partSpan(doc, from, to)!;
    const acrossDescribed = describeSpan(reader, across.start, across.end);
    expect(acrossDescribed.ok && acrossDescribed.anchor.exact).toMatch(/^autobiography\.\s+The chapter moves$/);
    expect(shownRanges(doc, across.start, across.end)).toEqual([{ start: from, end: to }]);
  });

  it("selects nothing annotatable outside the part's words, and draws saved spans only on their words", () => {
    const separator = doc.text.indexOf("\n");
    expect(partSpan(doc, separator, separator + 1)).toBeNull();
    const phrase = "Tradition links him with Jeremiah";
    const start = doc.text.indexOf(phrase);
    const span = partSpan(doc, start, start + phrase.length)!;
    const marks = proseMarks(doc, [
      { start: span.start, end: span.end, row: { highlightColor: "yellow", underlineColor: "#336699", body: "" } },
      { start: span.start, end: span.start + 9, row: { highlightColor: null, underlineColor: null, body: "A note" } },
    ]);
    expect(marks.map((mark) => [doc.text.slice(mark.start, mark.end), mark.kind, mark.color, !!mark.note])).toEqual([
      [phrase, "highlight", "yellow", false],
      [phrase, "underline", "#336699", false],
      ["Tradition", "underline", "note", true],
    ]);
  });

  it("names a selection by the heading it is under, within its own element", () => {
    // A verse's context block opens with its heading.
    const verses = section.blocks[1];
    const versesKey = rootKey.preview(verses.id);
    const start = reader.spans.get(versesKey)!.start;
    const headings = blockHeadings(verses.preview, versesKey, start);
    const at = reader.text.indexOf("God is not named until verse 18", start);
    expect(guideReference(reader, headings, at)).toBe("Study guide · Lamentations 3:1–3 — The Rod, the Darkness, the Turned Hand");
    // The chapter context block has no heading of its own, so it's just the study guide (as on the website).
    const context = partSpan(doc, doc.text.indexOf("He is an individual"), doc.text.indexOf("He is an individual") + 5)!.start;
    expect(guideReference(reader, [...headings, ...blockHeadings(block.preview, key, reader.spans.get(key)!.start)], context)).toBe("Study guide");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The lesson route, signed out (this device's study)

async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
}

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await settle();
}

type ProseView = { props: { testID: string; content: { text: string }; marks: Array<{ start: number; end: number; kind: string }> } };

/** The prose view whose text holds a phrase. */
function proseWith(phrase: string) {
  const view = (screen.getAllByTestId(/^prose-/) as unknown as ProseView[]).find((candidate) => candidate.props.content.text.includes(phrase));
  if (!view) throw new Error(`No prose shows "${phrase}"`);
  return view;
}

async function selectProse(phrase: string, through?: string) {
  const view = proseWith(phrase);
  return selectText(phrase, { testID: view.props.testID, through });
}

/** Taps a link: the prose view where those words are a link (underlined as one), on its second character. */
async function tapProse(phrase: string, within: RegExp = /^prose-/) {
  let found: { view: ProseView; offset: number } | null = null;
  for (const view of screen.getAllByTestId(within) as unknown as ProseView[]) {
    const { text } = view.props.content;
    for (let at = text.indexOf(phrase); at >= 0 && !found; at = text.indexOf(phrase, at + 1)) {
      if (view.props.marks.some((mark) => mark.kind === "underline" && mark.start === at && mark.end === at + phrase.length)) found = { view, offset: at + 1 };
    }
    if (found) break;
  }
  if (!found) throw new Error(`No prose link reads "${phrase}"`);
  const { view, offset } = found;
  await act(async () => {
    fireEvent(view as never, "textPress", { nativeEvent: { offset } });
  });
  await settle();
}

const guideRows = (start = MIXED) => deviceStudy.getSnapshot().highlights.filter((row) => row.guide === start);

describe("guide prose in the lesson", () => {
  beforeEach(() => {
    setStoragePort(memoryStorage());
    readerPreferences.reset();
    lastPosition.reset();
    initDeviceStudy();
    resetNativeCalls();
  });
  afterEach(() => jest.restoreAllMocks());

  it("marks exactly the selected words of the introduction with a quick mark, saved on this device", async () => {
    await renderRouter("./app", { initialUrl: `/come-follow-me/${MIXED}` });
    await screen.findAllByTestId(/^prose-introduction/);
    const phrase = "This is a personal Latter-day Saint study guide";
    await selectProse(phrase);
    const card = screen.getByTestId("guide-actions");
    expect(within(card).getByTestId("guide-selection-reference").props.children).toBe("Study guide");
    await press(within(card).getByLabelText("Yellow highlight"));

    const [row] = guideRows();
    expect(row).toMatchObject({ owner: null, part: "introduction", exact: phrase, highlightColor: "yellow" });
    // Persisted under the web's device-study key.
    expect(storage().getItem(DEVICE_STUDY_KEY)).toContain(phrase);
    // Drawn on exactly those words, while the selection stays.
    const view = proseWith(phrase);
    const highlights = view.props.marks.filter((mark) => mark.kind === "highlight");
    expect(highlights.map((mark) => view.props.content.text.slice(mark.start, mark.end))).toEqual([phrase]);
    expect(screen.getByTestId("guide-actions")).toBeTruthy();
    // Nothing touched the verses.
    expect(deviceStudy.getSnapshot().annotations).toEqual([]);

    // Pressed again, the mark comes off and the empty span is gone.
    await press(within(screen.getByTestId("guide-actions")).getByLabelText("Yellow highlight"));
    expect(guideRows()).toEqual([]);
  });

  it("keeps saved spans across a restart and draws them again", async () => {
    const port = memoryStorage();
    setStoragePort(port);
    initDeviceStudy();
    await renderRouter("./app", { initialUrl: `/come-follow-me/${MIXED}` });
    await screen.findAllByTestId(/^prose-introduction/);
    const phrase = "Bible quotations come from the King James Version";
    await selectProse(phrase);
    await press(within(screen.getByTestId("guide-actions")).getByLabelText("Red underline"));
    expect(guideRows()).toHaveLength(1);

    // A fresh store over the same storage (the app starting again) reads the same span.
    setStoragePort(port);
    initDeviceStudy();
    expect(guideRows()).toMatchObject([{ exact: phrase, underlineColor: "red", highlightColor: null }]);
  });

  it("writes and edits a note on a span of Lamentations' commentary, guarding unsaved changes", async () => {
    const alert = jest.spyOn(Alert, "alert");
    await renderRouter("./app", { initialUrl: `/come-follow-me/${MIXED}` });
    await press(await screen.findByTestId("context-lamentations-3-new-every-morning-context-0"));
    const phrase = "He is an individual sufferer who represents his people";
    await selectProse(phrase);
    const card = screen.getByTestId("guide-actions");
    expect(within(card).getByTestId("guide-selection-reference").props.children).toBe("Study guide");
    await press(within(card).getByTestId("action-annotate"));
    await press(within(screen.getByTestId("guide-actions")).getByTestId("annotate-note"));
    const sheet = screen.getByTestId("guide-note-sheet");
    expect(within(sheet).getByTestId("guide-note-quote").props.children).toBe(phrase);
    await act(async () => {
      fireEvent.changeText(within(sheet).getByTestId("guide-note-text"), "The speaker is everyone who has suffered.");
    });
    await press(within(sheet).getByTestId("guide-note-highlight-blue"));
    await press(within(sheet).getByTestId("guide-note-save"));

    expect(guideRows()).toMatchObject([{ part: "reader", exact: phrase, body: "The speaker is everyone who has suffered.", highlightColor: "blue", underlineColor: null }]);
    // Saving clears the selection so the marks show.
    expect(screen.queryByTestId("guide-actions")).toBeNull();
    expect(screen.queryByTestId("guide-note-sheet")).toBeNull();
    // No verse of Lamentations 3 or Jeremiah 3 was annotated.
    expect(deviceStudy.getSnapshot().annotations).toEqual([]);

    // The same words again: "Edit your note"; an edit left unsaved asks before it's discarded.
    await selectProse(phrase);
    await press(within(screen.getByTestId("guide-actions")).getByTestId("action-annotate"));
    expect(within(screen.getByTestId("guide-actions")).getByText("Edit your note")).toBeTruthy();
    await press(within(screen.getByTestId("guide-actions")).getByTestId("annotate-note"));
    const edit = screen.getByTestId("guide-note-sheet");
    expect(within(edit).getByTestId("guide-note-text").props.value).toBe("The speaker is everyone who has suffered.");
    await act(async () => {
      fireEvent.changeText(within(edit).getByTestId("guide-note-text"), "Changed my mind");
    });
    alert.mockImplementationOnce((_title, _message, buttons) => buttons?.find((button) => button.text === "Keep editing")?.onPress?.());
    await press(within(edit).getByLabelText("Close edit annotation - study guide"));
    expect(alert).toHaveBeenLastCalledWith("Discard changes?", expect.any(String), expect.any(Array));
    expect(screen.getByTestId("guide-note-sheet")).toBeTruthy();
    alert.mockImplementationOnce((_title, _message, buttons) => buttons?.find((button) => button.text === "Discard")?.onPress?.());
    await press(within(screen.getByTestId("guide-note-sheet")).getByLabelText("Close edit annotation - study guide"));
    expect(screen.queryByTestId("guide-note-sheet")).toBeNull();
    expect(guideRows()[0].body).toBe("The speaker is everyone who has suffered.");

    // Delete asks first, then removes the span with its note.
    await press(within(screen.getByTestId("guide-actions")).getByTestId("annotate-note"));
    alert.mockImplementationOnce((_title, _message, buttons) => buttons?.find((button) => button.text === "Delete")?.onPress?.());
    await press(within(screen.getByTestId("guide-note-sheet")).getByTestId("guide-note-delete"));
    expect(alert).toHaveBeenLastCalledWith("Delete this annotation?", expect.any(String), expect.any(Array));
    expect(guideRows()).toEqual([]);
  });

  it("opens prose links with a tap: a passage in the week's Lamentations 3 in place, another chapter in the reader", async () => {
    await renderRouter("./app", { initialUrl: `/come-follow-me/${MIXED}` });
    await screen.findAllByTestId(/^prose-introduction/);
    await tapProse("Lamentations 3:21–24");
    // The flash lands on Lamentations 3's verses, not Jeremiah 3's (which the week doesn't read).
    await waitFor(() => {
      const flashed = screen.getAllByTestId(/^guide-text-lamentations-3-/).some((view) => (view.props as { decorations: unknown[] }).decorations.length > 0);
      expect(flashed).toBe(true);
    });
    expect(screen.queryAllByTestId(/^guide-text-jeremiah-3-/)).toEqual([]);

    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await press(await screen.findByTestId("context-lamentations-3-new-every-morning-context-0"));
    await tapProse("Matthew 5:4");
    expect(open).toHaveBeenCalledWith(expect.stringContaining("churchofjesuschrist.org/study/scriptures/nt/matt/5"));

    // The closing's "Jeremiah 1:10" is a scripture link (the introduction's is a web link).
    await tapProse("Jeremiah 1:10", /^prose-closing/);
    await waitFor(() => expect(screen).toHavePathname("/browse/oldtestament/jeremiah/1"));
  });

  it("copies, shares and journals the selected prose with its lesson link; one selection at a time", async () => {
    const copy = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const intent = jest.spyOn(draftIntent, "setDraftIntent");
    await renderRouter("./app", { initialUrl: `/come-follow-me/${MIXED}` });

    // A scripture selection, then prose: the scripture's selection ends.
    const lamentations = screen.getAllByTestId(/^guide-text-lamentations-3-/).find((view) => (view.props as { content: { text: string } }).content.text.includes("22  It is of the Lord's mercies"))!;
    await selectText("his compassions fail not.", { testID: lamentations.props.testID });
    expect(screen.getByTestId("verse-actions")).toBeTruthy();
    const phrase = "Most of the discussion is my own close reading";
    await selectProse(phrase);
    expect(screen.queryByTestId("verse-actions")).toBeNull();
    expect(nativeCalls()).toContainEqual({ testID: lamentations.props.testID, call: "clearSelection" });
    const card = screen.getByTestId("guide-actions");

    await press(within(card).getByTestId("action-copy"));
    expect(copy).toHaveBeenCalledWith(phrase);
    await press(within(card).getByTestId("action-share"));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(`“${phrase}”`), url: `https://www.versetogether.org/come-follow-me/${MIXED}` }));

    await press(within(screen.getByTestId("guide-actions")).getByTestId("action-journal"));
    const sent = intent.mock.calls.at(-1)![0];
    expect(sent.source).toMatchObject({ kind: "guide", href: `/come-follow-me/${MIXED}` });
    expect(sent.body).toContain(`> ${phrase}`);
    expect(sent.body).toContain(`· Study guide](</come-follow-me/${MIXED}>)`);
    await waitFor(() => expect(screen).toHavePathname("/notes/new"));
  });

  it("anchors Add to journal to the block a selection starts in", async () => {
    const intent = jest.spyOn(draftIntent, "setDraftIntent");
    await renderRouter("./app", { initialUrl: `/come-follow-me/${MIXED}` });
    await press(await screen.findByTestId("context-lamentations-3-new-every-morning-context-0"));
    await selectProse("He is an individual sufferer");
    await press(within(screen.getByTestId("guide-actions")).getByTestId("action-journal"));
    const body = intent.mock.calls.at(-1)![0].body;
    // The block the selection starts in: here the chapter's section heading, Lamentations 3's own.
    expect(body).toContain(`](</come-follow-me/${MIXED}#lamentations-3-new-every-morning>)`);
  });

  it("ends a selection whose commentary is closed", async () => {
    await renderRouter("./app", { initialUrl: `/come-follow-me/${MIXED}` });
    const toggle = await screen.findByTestId("context-lamentations-3-new-every-morning-context-0");
    await press(toggle);
    await selectProse("He is an individual sufferer");
    expect(screen.getByTestId("guide-actions")).toBeTruthy();
    await press(screen.getByTestId("context-lamentations-3-new-every-morning-context-0"));
    expect(screen.queryByTestId("guide-actions")).toBeNull();
  });

  it("explains why a too-long or empty selection can't be annotated, and still copies it", async () => {
    await renderRouter("./app", { initialUrl: `/come-follow-me/${MIXED}` });
    const views = await screen.findAllByTestId(/^prose-introduction/);
    const view = views[0] as unknown as ProseView;
    // Only the line break between two paragraphs: no words of the guide.
    const at = view.props.content.text.indexOf("\n");
    await act(async () => {
      fireEvent(view as never, "selectionChange", { nativeEvent: { start: at, end: at + 1 } });
    });
    expect(within(screen.getByTestId("guide-actions")).getByTestId("guide-marks-blocked").props.children).toBe("Select some text to annotate");
  });
});
