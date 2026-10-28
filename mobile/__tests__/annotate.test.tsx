import { act, fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import * as Clipboard from "expo-clipboard";
import { BackHandler, Share } from "react-native";
import * as ReactNative from "react-native";
import * as draftIntent from "../src/features/journal/draftIntent";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { annotationChapter, deviceChapterAnnotations, myAnnotationsByVerse } from "../src/shared/web";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { collapseSelection, nativeCalls, nativeText, offsetsOf, resetNativeCalls, selectText } from "../testing/scriptureText";

// The text selection menu and its Annotate panel on the app's real reader route (Alma 32), against the device study
// store. Selections are made through the native scripture text's onSelectionChange event, on a mocked bridge
// (jest.setup.js): these verify the app's mapping, state and actions, not Android's long-press or handle drags.

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
}

async function type(element: Parameters<typeof fireEvent.changeText>[0], text: string) {
  await act(async () => {
    fireEvent.changeText(element, text);
  });
}

const ALMA_32 = annotationChapter("bookofmormon", "alma", 32);
const saved = (verse: number) => myAnnotationsByVerse(deviceChapterAnnotations(deviceStudy.getSnapshot().annotations, ALMA_32)).get(verse);
const V21 = "And now as I said concerning faith--faith is not to have a perfect knowledge of things; therefore if ye have faith ye hope for things which are not seen, which are true.";
const V22 = "And now, behold, I say unto you, and I would that ye should remember, that God is merciful unto all who believe on his name; therefore he desireth, in the first place, that ye should believe, yea, even on his word.";
/** A saved text range on verse 21's own words. */
const on21 = (phrase: string, occurrence = 0) => {
  const { start, end } = offsetsOf(V21, phrase, { occurrence });
  return { start, end, text: phrase };
};

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
let backHandlers: BackListener[] = [];

beforeEach(() => {
  setStoragePort(memoryStorage());
  readerPreferences.reset();
  lastPosition.reset();
  initDeviceStudy();
  resetNativeCalls();
  backHandlers = [];
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    backHandlers.push(handler);
    return { remove: () => (backHandlers = backHandlers.filter((item) => item !== handler)) };
  });
});

afterEach(() => jest.restoreAllMocks());

async function openAlma(phrase?: string, options?: Parameters<typeof selectText>[1]) {
  await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
  await screen.findByTestId("reader-text");
  if (phrase) await selectText(phrase, options);
  return screen.queryByTestId("verse-actions");
}

async function openAnnotate(phrase: string, options?: Parameters<typeof selectText>[1]) {
  await openAlma(phrase, options);
  await press(screen.getByTestId("action-annotate"));
  return screen.getByTestId("annotate-panel");
}

describe("selecting words in the reader", () => {
  it("shows the chapter as one selectable text, and selecting a word opens the menu", async () => {
    expect(await openAlma()).toBeNull();
    const { text } = nativeText();
    expect(text.startsWith("1  And it came to pass that they did go forth")).toBe(true);
    expect(text).toContain("21  And now as I said concerning faith—faith is not to have a perfect knowledge");
    await selectText("perfect");
    const card = screen.getByTestId("verse-actions");
    expect(within(card).getByText("Alma 32:21")).toBeTruthy();
  });

  it("selects across verses and names the passage", async () => {
    await openAlma("which are true.", { through: "I say unto you" });
    expect(within(screen.getByTestId("verse-actions")).getByText("Alma 32:21–22")).toBeTruthy();
  });

  it("opens no menu for a verse number alone, and closes it when the reader taps away", async () => {
    await openAlma();
    const { text } = nativeText();
    const number = text.indexOf("21  And now");
    await act(async () => {
      fireEvent(nativeText().view, "selectionChange", { nativeEvent: { start: number, end: number + 2 } });
    });
    expect(screen.queryByTestId("verse-actions")).toBeNull();
    await selectText("perfect");
    expect(screen.getByTestId("verse-actions")).toBeTruthy();
    await collapseSelection("reader-text", 40);
    expect(screen.queryByTestId("verse-actions")).toBeNull();
    // The native view cleared its own selection; the app doesn't clear it again.
    expect(nativeCalls().filter((call) => call.call === "clearSelection")).toHaveLength(0);
  });

  it("copies, shares and quotes exactly the selected words", async () => {
    const copy = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const intent = jest.spyOn(draftIntent, "setDraftIntent");
    await openAlma("faith—faith is not", { backward: true });

    await press(screen.getByTestId("action-copy"));
    expect(copy).toHaveBeenCalledWith("faith—faith is not\n— Alma 32:21");

    await press(screen.getByTestId("action-share"));
    expect(share.mock.calls[0][0]).toMatchObject({ title: "Alma 32:21", message: expect.stringMatching(/^“faith—faith is not”\n— Alma 32:21\nhttps:\/\/www\.versetogether\.org\//) });

    await press(screen.getByTestId("action-journal"));
    const body = intent.mock.calls[0][0].body;
    expect(body).toContain("> faith--faith is not");
    expect(body).not.toContain("perfect knowledge");
    expect(intent.mock.calls[0][0].source).toMatchObject({ kind: "scripture", book: "alma", chapter: 32, verseStart: 21, verseEnd: 21 });
  });

  it("quotes a partial first and last verse across verses", async () => {
    const copy = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    await openAlma("which are true.", { through: "And now, behold" });
    await press(screen.getByTestId("action-copy"));
    expect(copy).toHaveBeenCalledWith("which are true. And now, behold\n— Alma 32:21–22");
  });

  it("explores the selected words, not the whole verse", async () => {
    await openAlma("perfect knowledge");
    await press(screen.getByTestId("action-explore"));
    const sheet = screen.getByTestId("explore-sheet");
    expect(within(sheet).getByText("perfect")).toBeTruthy();
    expect(within(sheet).getByText("knowledge")).toBeTruthy();
    expect(within(sheet).queryByText("concerning")).toBeNull();
  });
});

describe("the Annotate panel", () => {
  it("uses Android's already-resized viewport without subtracting the keyboard twice", async () => {
    jest.replaceProperty(ReactNative.Platform, "OS", "android");
    const viewport = { width: 390, height: 544, scale: 2, fontScale: 1 };
    const original = { window: ReactNative.Dimensions.get("window"), screen: ReactNative.Dimensions.get("screen") };
    const showKeyboard = async (height: number) => act(async () => {
      ReactNative.DeviceEventEmitter.emit("keyboardDidShow", { endCoordinates: { height }, duration: 0 });
    });
    const menuHeight = () => [screen.getByTestId("verse-actions").props.style].flat(Infinity)
      .reduce((all, item) => ({ ...all, ...item }), {}).maxHeight;
    try {
      await act(async () => ReactNative.Dimensions.set({ window: viewport, screen: { ...viewport, height: 844 } }));
      await openAnnotate("perfect");
      await showKeyboard(300);
      expect(menuHeight()).toBeGreaterThan(400);
      expect(menuHeight()).toBeLessThanOrEqual(viewport.height);
      // A short landscape viewport must not be forced to the old 200pt minimum.
      viewport.height = 180;
      await act(async () => ReactNative.Dimensions.set({ window: { ...viewport } }));
      await showKeyboard(301);
      expect(menuHeight()).toBeLessThanOrEqual(viewport.height);
    } finally {
      await act(async () => ReactNative.Dimensions.set(original));
    }
  });

  it("opens in the same card, in place of the actions, and Back returns to them", async () => {
    const card = (await openAlma("perfect"))!;
    expect(within(card).getByText("Alma 32:21")).toBeTruthy();
    expect(within(card).getByTestId("action-explore")).toBeTruthy();

    await press(within(card).getByTestId("action-annotate"));
    const panel = within(screen.getByTestId("verse-actions")).getByTestId("annotate-panel");
    expect(within(panel).getByText("Your quick marks")).toBeTruthy();
    expect(within(panel).getByText("Any style and color")).toBeTruthy();
    expect(within(panel).getByText("Write a note")).toBeTruthy();
    expect(screen.queryByTestId("action-explore")).toBeNull();
    // The footer stays: Copy text and the reference.
    expect(within(screen.getByTestId("verse-actions")).getByText("Alma 32:21")).toBeTruthy();
    expect(screen.getByTestId("action-copy")).toBeTruthy();

    await press(screen.getByTestId("annotate-back"));
    expect(screen.queryByTestId("annotate-panel")).toBeNull();
    expect(screen.getByTestId("action-explore")).toBeTruthy();
  });

  it("only prepares a chosen style and color; Apply puts it on the selected words and Remove takes it off", async () => {
    await openAnnotate("perfect knowledge");
    expect(screen.getByTestId("annotate-apply")).toHaveProp("accessibilityLabel", "Apply yellow highlight");

    await press(screen.getByTestId("mark-kind-underline"));
    await press(screen.getByTestId("mark-color-blue"));
    expect(screen.getByTestId("mark-color-blue")).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
    expect(saved(21)).toBeUndefined();
    expect(screen.getByText("Not on the selected text")).toBeTruthy();

    await press(screen.getByTestId("annotate-apply"));
    expect(saved(21)).toMatchObject({ underline: false, highlight_color: null, text_marks: [{ ...on21("perfect knowledge"), kind: "underline", color: "blue" }] });
    // Drawn on exactly those words.
    const { text, marks } = nativeText();
    expect(marks).toHaveLength(1);
    expect(text.slice(marks[0].start, marks[0].end)).toBe("perfect knowledge");
    expect(marks[0].kind).toBe("underline");
    expect(screen.getByText("Remove blue underline")).toBeTruthy();
    expect(screen.getByText("On all the selected text")).toBeTruthy();

    await press(screen.getByTestId("annotate-apply"));
    expect(saved(21)).toBeUndefined();
    expect(nativeText().marks).toEqual([]);
    expect(screen.getByText("Apply blue underline")).toBeTruthy();
  });

  it("keeps the selection while marks go on and off, and Clear clears the native selection too", async () => {
    await openAnnotate("perfect knowledge");
    const text = nativeText().text;
    await press(screen.getByTestId("annotate-preset-highlight:yellow"));
    await press(screen.getByTestId("annotate-preset-underline:red"));
    await press(screen.getByTestId("annotate-preset-highlight:yellow"));
    // The text never changed, so the native selection (and its handles) stayed; nothing reselected or cleared it.
    expect(nativeText().text).toBe(text);
    expect(nativeCalls()).toEqual([]);
    expect(screen.getByTestId("annotate-panel")).toBeTruthy();
    expect(within(screen.getByTestId("verse-actions")).getByText("Alma 32:21")).toBeTruthy();
    expect(saved(21)?.text_marks).toEqual([{ ...on21("perfect knowledge"), kind: "underline", color: "red" }]);

    await press(screen.getByTestId("clear-selection"));
    expect(screen.queryByTestId("verse-actions")).toBeNull();
    expect(nativeCalls()).toEqual([{ testID: "reader-text", call: "clearSelection" }]);
  });

  it("marks only the chosen occurrence of a word, and keeps the note and the other kind of mark", async () => {
    deviceStudy.saveAnnotation({ ...ALMA_32, verse: 21 }, "Faith is a seed.", { underlineColor: "red" });
    // The third "faith" of verse 21 ("if ye have faith"), not the two before it.
    await openAnnotate("faith", { from: "21  ", occurrence: 2 });

    const yellow = screen.getByTestId("annotate-preset-highlight:yellow");
    expect(within(yellow).getByText("Yellow highlight")).toBeTruthy();
    await press(yellow);
    expect(saved(21)).toMatchObject({
      body: "Faith is a seed.",
      highlight_color: null,
      underline: true,
      underline_color: "red",
      text_marks: [{ ...on21("faith", 2), kind: "highlight", color: "yellow" }],
    });
    expect(screen.getByTestId("annotate-preset-highlight:yellow")).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));

    // Another color replaces the highlight on those words; the underline and the note stay.
    await press(screen.getByTestId("annotate-preset-highlight:blue"));
    expect(saved(21)).toMatchObject({ body: "Faith is a seed.", underline_color: "red", text_marks: [{ ...on21("faith", 2), kind: "highlight", color: "blue" }] });

    // Taking the whole-verse underline off these words splits it around them.
    await press(screen.getByTestId("annotate-preset-underline:red"));
    const row = saved(21)!;
    expect(row).toMatchObject({ body: "Faith is a seed.", underline: false });
    expect(row.text_marks!.filter((mark) => mark.kind === "underline").map((mark) => [mark.start, mark.end])).toEqual([
      [0, V21.lastIndexOf("faith")],
      [V21.lastIndexOf("faith") + 5, V21.length],
    ]);
  });

  it("follows the words selected: different words of the same verse are a new selection", async () => {
    deviceStudy.setVerseMarks(ALMA_32, [21], { highlightColor: "yellow", ranges: [{ verse: 21, ...on21("perfect"), text: V21 }] });
    await openAnnotate("perfect");
    expect(screen.getByTestId("annotate-preset-highlight:yellow")).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));

    await selectText("knowledge");
    // A new selection reopens on the actions, and its marks are the new words'.
    expect(screen.queryByTestId("annotate-panel")).toBeNull();
    expect(screen.getByTestId("quick-mark-highlight:yellow")).toHaveProp("accessibilityState", expect.objectContaining({ checked: false }));
    await selectText("perfect knowledge");
    expect(screen.getByTestId("quick-mark-highlight:yellow")).toHaveProp("accessibilityState", expect.objectContaining({ checked: "mixed" }));
  });

  it("shows a mark on only part of the selection as mixed, and Apply puts it on all of it", async () => {
    deviceStudy.setVerseMarks(ALMA_32, [21], { highlightColor: "yellow" });
    await openAnnotate("which are true.", { through: "And now, behold" });

    expect(screen.getByTestId("annotate-preset-highlight:yellow")).toHaveProp("accessibilityState", expect.objectContaining({ checked: "mixed" }));
    expect(screen.getByText("On some of the selected text")).toBeTruthy();
    expect(screen.getByText("Note on verse 21")).toBeTruthy();

    await press(screen.getByTestId("annotate-apply"));
    // Verse 21 is still yellow throughout (its whole-verse highlight now a range over all of it); verse 22 gets
    // exactly its selected words.
    expect(saved(21)).toMatchObject({ highlight_color: null, text_marks: [{ start: 0, end: V21.length, text: V21, kind: "highlight", color: "yellow" }] });
    expect(saved(22)).toMatchObject({ highlight_color: null, text_marks: [{ start: 0, end: 15, text: "And now, behold", kind: "highlight", color: "yellow" }] });
    expect(screen.getByText("On all the selected text")).toBeTruthy();
    expect(V22.startsWith("And now, behold")).toBe(true);
  });

  it("checks a custom color, prepares a valid one, and offers it again", async () => {
    await openAnnotate("perfect");
    await press(screen.getByTestId("mark-custom"));
    await type(screen.getByTestId("mark-custom-input"), "blue-ish");
    await press(screen.getByTestId("mark-custom-use"));
    expect(screen.getByText("Enter a color as six hex digits, like #3a7bd5.")).toBeTruthy();
    expect(saved(21)).toBeUndefined();

    await type(screen.getByTestId("mark-custom-input"), " #3A7BD5 ");
    await press(screen.getByTestId("mark-custom-use"));
    expect(screen.queryByTestId("mark-custom-input")).toBeNull();
    expect(screen.getByTestId("mark-color-#3a7bd5")).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
    expect(saved(21)).toBeUndefined();

    await press(screen.getByTestId("annotate-apply"));
    expect(saved(21)?.text_marks).toEqual([{ ...on21("perfect"), kind: "highlight", color: "#3a7bd5" }]);
    expect(screen.getByText("Remove #3a7bd5 highlight")).toBeTruthy();

    // A new selection starts on the actions; the color on the selection is offered again in the panel.
    await press(screen.getByTestId("annotate-back"));
    await press(screen.getByTestId("clear-selection"));
    await selectText("perfect");
    await press(screen.getByTestId("action-annotate"));
    expect(screen.getByTestId("mark-color-#3a7bd5")).toBeTruthy();
  });

  it("returns to the actions on a new selection and on Android's back button, then clears", async () => {
    await openAlma();
    // The navigator's own back handling, registered before the menu's.
    const before = backHandlers.length;
    await selectText("perfect");
    expect(backHandlers).toHaveLength(before + 1);
    await press(screen.getByTestId("action-annotate"));
    await selectText("perfect", { through: "I say" });
    expect(screen.queryByTestId("annotate-panel")).toBeNull();
    expect(within(screen.getByTestId("verse-actions")).getByText("Alma 32:21–22")).toBeTruthy();

    await press(screen.getByTestId("action-annotate"));
    expect(screen.getByTestId("annotate-panel")).toBeTruthy();
    await act(async () => {
      expect(backHandlers[backHandlers.length - 1]({} as never)).toBe(true);
    });
    expect(screen.queryByTestId("annotate-panel")).toBeNull();
    expect(screen.getByTestId("verse-actions")).toBeTruthy();
    await act(async () => {
      backHandlers[backHandlers.length - 1]({} as never);
    });
    expect(screen.queryByTestId("verse-actions")).toBeNull();
    expect(backHandlers).toHaveLength(before);
    expect(nativeCalls()).toEqual([{ testID: "reader-text", call: "clearSelection" }]);
  });

  it("opens the full note editor from Write a note, keeping the verse's marks and its marked words", async () => {
    deviceStudy.setVerseMarks(ALMA_32, [21], { highlightColor: "green" });
    deviceStudy.setVerseMarks(ALMA_32, [21], { underlineColor: "blue", ranges: [{ verse: 21, ...on21("perfect"), text: V21 }] });
    await openAnnotate("perfect");
    await press(screen.getByTestId("annotate-note"));
    const sheet = screen.getByTestId("verse-note-sheet");
    expect(within(sheet).getByTestId("note-highlight-green")).toHaveProp("accessibilityState", expect.objectContaining({ checked: true }));
    await type(within(sheet).getByTestId("verse-note-text"), "Plant the word.");
    await press(within(sheet).getByTestId("verse-note-save"));
    expect(saved(21)).toMatchObject({ body: "Plant the word.", highlight_color: "green", text_marks: [{ ...on21("perfect"), kind: "underline", color: "blue" }] });
    expect(screen.queryByTestId("verse-note-sheet")).toBeNull();
    // Still in the panel, which now offers to edit the note.
    expect(screen.getByText("Edit your note")).toBeTruthy();
    // The note now shows beneath its verse, so the text changed: the same words are selected again.
    const { text } = nativeText();
    expect(text).toContain("YOUR ANNOTATION\nPlant the word.");
    const restore = nativeCalls().find((call) => call.call === "setSelection")!;
    expect(text.slice(restore.start, restore.end)).toBe("perfect");

    // A later mark change keeps the note.
    await press(screen.getByTestId("annotate-preset-underline:red"));
    expect(saved(21)).toMatchObject({ body: "Plant the word.", highlight_color: "green", text_marks: [{ ...on21("perfect"), kind: "underline", color: "red" }] });
  });

  it("draws legacy whole-verse marks, and never a range saved on other words", async () => {
    deviceStudy.setVerseMarks(ALMA_32, [21], { highlightColor: "pink" });
    // A range saved against other wording (another translation's) doesn't match verse 22's words.
    deviceStudy.setVerseMarks(ALMA_32, [22], { underlineColor: "green", ranges: [{ verse: 22, start: 0, end: 7, text: "Behold, I say unto you." }] });
    deviceStudy.setVerseMarks(ALMA_32, [23], { highlightColor: "blue", ranges: [{ verse: 23, start: 9, end: 11, text: "And now, he imparteth" }] });
    await openAlma();
    const { text, marks } = nativeText();
    const pieces = marks.map((mark) => [mark.kind, text.slice(mark.start, mark.end)]);
    expect(pieces).toContainEqual(["highlight", V21.replace("--", "—")]);
    expect(pieces.filter(([kind]) => kind === "underline")).toEqual([]);
    expect(pieces).toContainEqual(["highlight", "he"]);
  });
});

describe("marks after a relaunch", () => {
  it("are drawn again on the same words", async () => {
    const port = memoryStorage();
    setStoragePort(port);
    initDeviceStudy();
    await openAlma("perfect knowledge");
    await press(screen.getByLabelText("Yellow highlight"));

    setStoragePort(port);
    initDeviceStudy();
    await openAlma();
    const { text, marks } = nativeText();
    expect(marks.map((mark) => [mark.kind, mark.color !== 0, text.slice(mark.start, mark.end)])).toEqual([["highlight", true, "perfect knowledge"]]);
  });

  it("keeps the card within the screen above the navigation", async () => {
    const card = (await openAlma("perfect"))!;
    const style = [card.props.style].flat(Infinity).reduce((all, item) => ({ ...all, ...item }), {});
    expect(style.maxHeight).toBeGreaterThan(0);
    expect(style.maxHeight).toBeLessThan(1334);
    expect(style.maxWidth).toBe(440);
  });
});
