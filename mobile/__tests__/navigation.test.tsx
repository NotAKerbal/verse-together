import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Alert } from "react-native";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { LAST_POSITION_KEY, lastPosition, readerPreferences } from "../src/storage/preferences";
import { annotationChapter, deviceChapterAnnotations, myAnnotationsByVerse } from "../src/shared/web";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { nativeCalls, nativeText, resetNativeCalls, selectText } from "../testing/scriptureText";

/**
 * A press inside an async act, so the router's queued navigation (processed in a React transition) completes
 * before the next step; then let deferred loads run (renderRouter runs the app under fake timers).
 */
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await settle();
}

/** Lets screen transitions and deferred loads finish (renderRouter runs the app under fake timers). */
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
}

beforeEach(() => {
  setStoragePort(memoryStorage());
  readerPreferences.reset();
  lastPosition.reset();
  initDeviceStudy();
  resetNativeCalls();
});

describe("the app's real routes", () => {
  it("keeps a quoted verse's source when saving without logging reading", async () => {
    await renderRouter("./app", { initialUrl: "/browse/newtestament/john/1" });
    await screen.findByTestId("reader-text");
    await selectText("In the beginning");
    await press(screen.getByLabelText("Add to journal"));
    await screen.findByTestId("entry-text");
    await press(screen.getByLabelText("Save entry"));
    await waitFor(() => expect(deviceStudy.getSnapshot().notes).toHaveLength(1));
    expect(deviceStudy.getSnapshot().notes[0]).toMatchObject({
      source: { kind: "scripture", label: "John 1:1", verseStart: 1, verseEnd: 1, href: "/browse/newtestament/john/1#v-1" },
      reading_at: null,
    });
  });

  it("keeps scripture readable when saving the reading position fails", async () => {
    const port = memoryStorage();
    setStoragePort({ ...port, setItem(key, value) {
      if (key === LAST_POSITION_KEY) throw new Error("Storage unavailable");
      port.setItem(key, value);
    } });
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
    expect(await screen.findByTestId("reader-text")).toBeTruthy();
    expect(nativeText().text).toMatch(/faith is not to have a perfect knowledge/);
    expect(screen.getByText(/Your reading position couldn't be saved/)).toBeTruthy();
    expect(lastPosition.get()).toBeNull();
  });

  it("browses to a chapter, highlights selected words, and remembers where reading stopped", async () => {
    await renderRouter("./app", { initialUrl: "/browse" });
    expect(screen.getByTestId("volume-bookofmormon")).toBeTruthy();
    expect(screen.getByTestId("card-come-follow-me")).toBeTruthy();

    await press(screen.getByTestId("volume-bookofmormon"));
    await waitFor(() => expect(screen).toHavePathname("/browse/bookofmormon"));
    await press(await screen.findByTestId("book-alma"));
    await waitFor(() => expect(screen).toHavePathname("/browse/bookofmormon/alma"));
    await press(await screen.findByTestId("chapter-32"));
    await waitFor(() => expect(screen).toHavePathname("/browse/bookofmormon/alma/32"));

    await screen.findByTestId("reader-text");
    await selectText("faith is not to have a perfect knowledge");
    expect(await screen.findByTestId("verse-actions")).toBeTruthy();
    expect(screen.getByText("Alma 32:21")).toBeTruthy();
    await press(screen.getByLabelText("Yellow highlight"));

    const saved = myAnnotationsByVerse(deviceChapterAnnotations(deviceStudy.getSnapshot().annotations, annotationChapter("bookofmormon", "alma", 32)));
    expect(saved.get(21)).toMatchObject({ highlight_color: null, body: "", text_marks: [{ text: "faith is not to have a perfect knowledge", kind: "highlight", color: "yellow" }] });
    expect(lastPosition.get()).toMatchObject({ volume: "bookofmormon", book: "alma", chapter: 32 });
  });

  it("opens a one-chapter book straight to its chapter, and D&C to its sections", async () => {
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon/enos" });
    await waitFor(() => expect(screen).toHavePathname("/browse/bookofmormon/enos/1"));
    await screen.findByTestId("reader-text");
    expect(nativeText().text.startsWith("1  Behold, it came to pass that I, Enos")).toBe(true);
  });

  it("jumps to a verse from a link, once the chapter's text has laid out", async () => {
    await renderRouter("./app", { initialUrl: "/browse/dnc/doctrineandcovenants/4?verse=2" });
    await screen.findByTestId("reader-text");
    const { view, text, decorations } = nativeText();
    expect(text).toMatch(/2  Therefore, O ye that embark in the service of God/);
    // The verse flashes while the reader finds it.
    const flash = decorations.find((item) => item.kind === "box")!;
    expect(text.slice(flash.start, flash.end).startsWith("2  Therefore")).toBe(true);
    await act(async () => {
      fireEvent(view, "contentSizeChange", { nativeEvent: { height: 900 } });
    });
    await settle();
    expect(nativeCalls()).toContainEqual({ testID: "reader-text", call: "offsetTop", offset: text.indexOf("2  Therefore") });
  });

  it("writes, finds and deletes a journal entry", async () => {
    const app = await renderRouter("./app", { initialUrl: "/notes" });
    await press(await screen.findByTestId("journal-new"));
    await waitFor(() => expect(screen).toHavePathname("/notes/new"));
    await press(screen.getByTestId("save-entry"));
    expect(await screen.findByText("Write a note or log reading before saving.")).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("entry-text"), "# Morning\nA quiet hour with the scriptures.");
    });
    await press(screen.getByTestId("save-entry"));
    await waitFor(() => expect(app.getPathname()).toMatch(/^\/notes\/entry\//));
    expect(deviceStudy.getSnapshot().notes[0]).toMatchObject({ title: "Morning", markdown_body: "# Morning\nA quiet hour with the scriptures." });

    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === "destructive")?.onPress?.();
    });
    await press(await screen.findByTestId("delete-entry"));
    expect(deviceStudy.getSnapshot().notes).toHaveLength(0);
    await waitFor(() => expect(app.getPathname()).not.toMatch(/^\/notes\/entry\//));
    alert.mockRestore();
  });

  it("logs reading from the reader into the journal", async () => {
    await renderRouter("./app", { initialUrl: "/browse/pearl/moses/1" });
    await press(await screen.findByTestId("reader-log"));
    await waitFor(() => expect(screen).toHavePathname("/notes/new"));
    expect(screen.getByText("Moses 1")).toBeTruthy();
    await press(screen.getByTestId("save-entry"));
    await waitFor(() => expect(deviceStudy.getSnapshot().notes).toHaveLength(1));
    expect(deviceStudy.getSnapshot().notes[0]).toMatchObject({ source: { kind: "scripture", volume: "pearl", book: "moses", chapter: 1 } });
    expect(deviceStudy.getSnapshot().notes[0].reading_at).toBeTruthy();
  });

  it("opens a published study guide with its scripture and context", async () => {
    await renderRouter("./app", { initialUrl: "/come-follow-me/2026-10-19" });
    expect(await screen.findByText("“Before I Formed Thee in the Belly I Knew Thee”")).toBeTruthy();
    const jeremiah1 = screen.getAllByTestId(/^guide-text-jeremiah-1-/).map((view) => (view.props as { content: { text: string } }).content.text).join("\n");
    expect(jeremiah1).toMatch(/5  Before I formed thee in the belly I knew thee/);
    const context = screen.getByTestId("context-jeremiah-1-1-3-the-words-of-a-man-the-word-of-the-lord");
    await press(context);
    // The commentary is selectable native prose (GuideProse).
    await waitFor(() =>
      expect(screen.getAllByTestId(/^prose-/).some((view) => (view.props as { content: { text: string } }).content.text.includes('The book opens with "The words of Jeremiah"'))).toBe(true)
    );
  });

  it("shows this week's published guide on the lessons page", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 27, 9, 0) });
    await renderRouter("./app", { initialUrl: "/come-follow-me" });
    const featured = await screen.findByTestId("featured-lesson");
    expect(within(featured).getByText(/I Will Turn Their Mourning into Joy/)).toBeTruthy();
    await press(screen.getByTestId("open-guide"));
    await waitFor(() => expect(screen).toHavePathname("/come-follow-me/2026-10-26"));
  });

  it("reads a two-book guide with each verse in its own book", async () => {
    await renderRouter("./app", { initialUrl: "/come-follow-me/2026-10-26" });
    expect((await screen.findAllByText(/I Will Turn Their Mourning into Joy/)).length).toBeGreaterThan(0);
    // Each chapter's passages are selectable text in their own book.
    const passages = (book: string, chapter: number) =>
      screen.queryAllByTestId(new RegExp(`^guide-text-${book}-${chapter}-`)).map((view) => (view.props as { content: { text: string } }).content.text).join("\n");
    expect(passages("jeremiah", 31)).toMatch(/31  Behold, the days come, saith the Lord, that I will make a new covenant/);
    expect(passages("jeremiah", 39)).toMatch(/(^|\n)18  For I will surely deliver thee/);
    expect(passages("lamentations", 1)).toMatch(/(^|\n)22  Let all their wickedness/);
    expect(passages("lamentations", 2)).toBe("");
    expect(passages("jeremiah", 34)).toBe("");

    // Words of Lamentations 3:22–23 are marked as Lamentations 3, never Jeremiah 3.
    const lamentations = screen.getAllByTestId(/^guide-text-lamentations-3-/).find((view) => (view.props as { content: { text: string } }).content.text.includes("22  It is of the Lord's mercies"))!;
    await selectText("his compassions fail not.", { testID: lamentations.props.testID, through: "They are new" });
    const card = screen.getByTestId("verse-actions");
    expect(within(card).getByText("Lamentations 3:22–23")).toBeTruthy();
    await press(within(card).getByLabelText("Yellow highlight"));
    const marked = (book: string, chapter: number) =>
      myAnnotationsByVerse(deviceChapterAnnotations(deviceStudy.getSnapshot().annotations, annotationChapter("oldtestament", book, chapter)));
    expect(marked("lamentations", 3).get(22)).toMatchObject({ highlight_color: null, text_marks: [{ text: "his compassions fail not.", kind: "highlight", color: "yellow" }] });
    expect(marked("lamentations", 3).get(23)).toMatchObject({ text_marks: [{ start: 0, text: "They are new", kind: "highlight", color: "yellow" }] });
    expect(marked("jeremiah", 3).size).toBe(0);
    expect(marked("jeremiah", 1003).size).toBe(0);
    // Drawn on those words in Lamentations' passage only.
    const drawn = nativeText(lamentations.props.testID);
    expect(drawn.marks.map((mark) => drawn.text.slice(mark.start, mark.end))).toEqual(["his compassions fail not.", "They are new"]);
    await press(within(card).getByTestId("clear-selection"));
    expect(nativeCalls()).toContainEqual({ testID: lamentations.props.testID, call: "clearSelection" });

    // The chapter's reader link opens Lamentations, in its own book.
    await press(screen.getByText("Open Lamentations 3 in the reader"));
    await waitFor(() => expect(screen).toHavePathname("/browse/oldtestament/lamentations/3"));
  });
});
