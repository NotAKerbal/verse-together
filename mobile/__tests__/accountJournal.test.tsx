// The app's real routes signed in: the Journal (calendar, day, search, editor), the reader's marks and notes, and Add
// to journal from a selection, reading and writing the account's study through StudySync, over an in-memory account
// (testing/fakeStudyServer.ts) whose notes and marks were written "on the website". This device's own study is left
// alone and never uploaded. The session is set as AccountProvider sets it once an account is verified.

import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Alert } from "react-native";
import { StudySync } from "../src/account/studySync";
import { annotationChapter, localDateKey, scriptureSource } from "../src/shared/web";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { resetStudySession, setStudySession } from "../src/storage/studySession";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { FakeStudyServer, flush } from "../testing/fakeStudyServer";
import { nativeText, resetNativeCalls, selectText } from "../testing/scriptureText";

const ALMA_32 = annotationChapter("bookofmormon", "alma", 32);

async function settle() {
  for (let round = 0; round < 4; round++) {
    await act(async () => {
      await flush();
      jest.advanceTimersByTime(300);
      await flush();
    });
  }
}

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await settle();
}

async function type(element: Parameters<typeof fireEvent.changeText>[0], text: string) {
  await act(async () => {
    fireEvent.changeText(element, text);
  });
}

let server: FakeStudyServer;
let sync: StudySync | null = null;

function signIn(owner = "ada") {
  const store = accountStore(owner);
  sync = new StudySync(owner, store, server.client(owner)).start();
  setStudySession({ mode: "account", owner, store, sync });
  return store;
}

beforeEach(() => {
  setStoragePort(memoryStorage());
  readerPreferences.reset();
  lastPosition.reset();
  resetAccountStores();
  initDeviceStudy();
  resetNativeCalls();
  server = new FakeStudyServer();
});

afterEach(() => {
  sync?.dispose();
  sync = null;
  resetStudySession();
  jest.restoreAllMocks();
});

describe("signed in, the Journal is the account's", () => {
  it("shows notes from the website in search, the day view and the editor, and saves edits back", async () => {
    const id = server.webCreateNote("ada", "# Morning light\nA quiet hour with the scriptures.", "2026-10-20");
    signIn();
    const app = await renderRouter("./app", { initialUrl: "/notes" });
    await settle();

    await type(screen.getByTestId("journal-search"), "quiet hour");
    expect(await screen.findByText("1 entry matches")).toBeTruthy();
    expect(screen.getByTestId(`entry-${id}`)).toBeTruthy();

    await act(async () => router.push("/notes/day/2026-10-20"));
    await settle();
    expect(await screen.findByText("Morning light")).toBeTruthy();

    await press(screen.getByTestId(`entry-${id}`));
    await waitFor(() => expect(app.getPathname()).toBe(`/notes/entry/${id}`));
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "# Morning light\nA quiet hour with the scriptures.");
    expect(screen.getByText(/In your account/)).toBeTruthy();

    await type(screen.getByTestId("entry-text"), "# Morning light\nA quiet hour, and a prayer.");
    await press(screen.getByTestId("save-entry"));
    expect(server.notes.get(id)).toMatchObject({ markdownBody: "# Morning light\nA quiet hour, and a prayer.", markdownRevision: 1 });
    expect(await screen.findByText("Synced to your account")).toBeTruthy();

    // The website edits it again: the open editor, with nothing unsaved, shows the newer text.
    await act(async () => server.webEditNote(id, "# Morning light\nEdited on the website."));
    await settle();
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "# Morning light\nEdited on the website.");
    // The device's own study was never touched.
    expect(deviceStudy.getSnapshot().notes).toEqual([]);
  });

  it("never overwrites a newer website edit: the editor asks, and keeps the app's text until chosen", async () => {
    const id = server.webCreateNote("ada", "Original thought", "2026-10-20");
    signIn();
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await settle();
    await type(screen.getByTestId("entry-text"), "My edit in the app");
    await act(async () => server.webEditNote(id, "Their edit on the website"));
    await settle();
    expect(screen.getByText(/changed on the website or another device while you were editing/)).toBeTruthy();
    await press(screen.getByTestId("save-entry"));
    expect(server.notes.get(id)?.markdownBody).toBe("Their edit on the website");
    const panel = await screen.findByTestId("entry-conflict");
    expect(within(panel).getByText(/The newer version begins: “Their edit on the website”/)).toBeTruthy();
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "My edit in the app");

    await press(screen.getByTestId("conflict-keep"));
    expect(server.notes.get(id)?.markdownBody).toBe("My edit in the app");
    expect(screen.queryByTestId("entry-conflict")).toBeNull();
  });

  it("writes a new entry offline, shows it at once, and creates it once the connection returns", async () => {
    signIn();
    server.setOnline(false);
    const app = await renderRouter("./app", { initialUrl: "/notes" });
    await settle();
    expect(screen.getByText(/You're offline/)).toBeTruthy();
    await press(screen.getByTestId("journal-new"));
    await type(screen.getByTestId("entry-text"), "# On the train\nNo signal here.");
    await press(screen.getByTestId("save-entry"));
    await waitFor(() => expect(app.getPathname()).toMatch(/^\/notes\/entry\/pending-/));
    expect(screen.getByText("Saved on this device · waiting to sync")).toBeTruthy();
    expect(server.notesOf("ada")).toEqual([]);

    await act(async () => server.setOnline(true));
    await settle();
    expect(server.notesOf("ada").map((note) => note.markdownBody)).toEqual(["# On the train\nNo signal here."]);
    expect(await screen.findByText("Synced to your account")).toBeTruthy();
    // The same editor stays open on the new entry (now with the account's id) and keeps editing it.
    await type(screen.getByTestId("entry-text"), "# On the train\nSignal again.");
    await press(screen.getByTestId("save-entry"));
    expect(server.notesOf("ada").map((note) => note.markdownBody)).toEqual(["# On the train\nSignal again."]);
  });

  it("deletes an entry from the account", async () => {
    const id = server.webCreateNote("ada", "To be removed", localDateKey());
    signIn();
    const app = await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await settle();
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.style === "destructive")?.onPress?.());
    await press(screen.getByTestId("delete-entry"));
    expect(server.notesOf("ada")).toEqual([]);
    await waitFor(() => expect(app.getPathname()).not.toMatch(/^\/notes\/entry\//));
  });

  it("keeps this device's own study on the device, says so, and uploads nothing of it", async () => {
    deviceStudy.createNote({ requestId: "guest-1", markdownBody: "Written signed out", journalDate: "2026-10-20" });
    server.webCreateNote("ada", "From my account", "2026-10-20");
    signIn();
    await renderRouter("./app", { initialUrl: "/notes/day/2026-10-20" });
    await settle();
    expect(screen.getAllByText("From my account").length).toBeGreaterThan(0);
    expect(screen.queryByText("Written signed out")).toBeNull();
    expect(server.calls).toEqual([]);

    // Signed out again, the device's study is what shows.
    sync?.dispose();
    sync = null;
    await act(async () => resetStudySession());
    await settle();
    expect(screen.getAllByText("Written signed out").length).toBeGreaterThan(0);
    expect(screen.queryByText("From my account")).toBeNull();
  });

  it("while the account is still being checked, shows nothing of either study and saves nothing", async () => {
    deviceStudy.createNote({ requestId: "guest-1", markdownBody: "Guest note", journalDate: localDateKey() });
    setStudySession({ mode: "blocked", reason: "checking" });
    await renderRouter("./app", { initialUrl: "/notes" });
    await settle();
    expect(screen.getByText(/Your account is being checked/)).toBeTruthy();
    await press(screen.getByTestId("journal-new"));
    await type(screen.getByTestId("entry-text"), "Should not be saved anywhere");
    await press(screen.getByTestId("save-entry"));
    expect(screen.getByText(/Your account is still being checked/)).toBeTruthy();
    expect(deviceStudy.getSnapshot().notes).toHaveLength(1);
  });
});

describe("signed in, the reader shows and writes the account's marks", () => {
  it("draws a mark made on the website, and sends quick marks and verse notes to the account", async () => {
    server.webAnnotate("ada", { ...ALMA_32, verse: 21 }, { body: "Written on the website", highlightColor: "green" });
    signIn();
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
    await screen.findByTestId("reader-text");
    await settle();
    expect(nativeText().text).toContain("YOUR ANNOTATION\nWritten on the website");

    await selectText("ye hope for things");
    await press(screen.getByLabelText("Yellow highlight"));
    await settle();
    // The server's rule: the whole-verse green becomes ranges around the new yellow words; the note stays.
    const marked = server.annotationOf("ada", { ...ALMA_32, verse: 21 })!;
    expect(marked.body).toBe("Written on the website");
    expect(marked.textMarks?.map((mark) => [mark.color, mark.text.trim().slice(0, 18)])).toEqual([
      ["green", "And now as I said "],
      ["yellow", "ye hope for things"],
      ["green", "which are not seen"],
    ]);
    expect(deviceStudy.getSnapshot().annotations).toEqual([]);

    await press(screen.getByTestId("action-annotate"));
    await press(screen.getByTestId("annotate-note"));
    const sheet = screen.getByTestId("verse-note-sheet");
    await type(within(sheet).getByTestId("verse-note-text"), "Edited in the app");
    await press(within(sheet).getByTestId("verse-note-save"));
    await settle();
    // The note changes; the marks made before stay as the account has them.
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 21 })).toMatchObject({ body: "Edited in the app" });
    expect(server.annotationOf("ada", { ...ALMA_32, verse: 21 })?.textMarks?.some((mark) => mark.color === "yellow")).toBe(true);
  });

  it("adds the selected words to a new journal entry in the account", async () => {
    signIn();
    const app = await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
    await screen.findByTestId("reader-text");
    await selectText("faith is not to have a perfect knowledge");
    await press(screen.getByTestId("action-journal"));
    await waitFor(() => expect(app.getPathname()).toBe("/notes/new"));
    await press(screen.getByTestId("save-entry"));
    await settle();
    const [note] = server.notesOf("ada");
    expect(note.markdownBody).toContain("> faith is not to have a perfect knowledge");
    expect(note.source).toMatchObject({ kind: "scripture", book: "alma", chapter: 32 });
    expect(deviceStudy.getSnapshot().notes).toEqual([]);
  });

  it("tints chapters read on the website", async () => {
    server.webCreateNote("ada", "", "2026-10-20", scriptureSource({ volume: "bookofmormon", book: "alma", chapter: 32, reference: "Alma 32" }), true);
    signIn();
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
    await screen.findByTestId("reader-text");
    await settle();
    expect(nativeText().decorations.some((decoration) => decoration.kind === "rule")).toBe(true);
  });
});

describe("editor ownership transitions", () => {
  it("never transfers an unsaved guest draft into an account after signing in", async () => {
    await renderRouter("./app", { initialUrl: "/notes/new" });
    await settle();
    await type(screen.getByTestId("entry-text"), "Private guest draft");
    await act(async () => { signIn("bea"); });
    await settle();
    expect(screen.queryByTestId("entry-text")).toBeNull();
    expect(screen.getByText(/Your account changed/)).toBeTruthy();
    expect(server.notesOf("bea")).toEqual([]);
    expect(deviceStudy.getSnapshot().notes).toEqual([]);
  });

  it("a delete Alert opened for A cannot delete from the guest study after sign-out", async () => {
    const id = server.webCreateNote("ada", "Account note", "2026-10-20");
    signIn();
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await settle();
    const alert = jest.spyOn(Alert, "alert");
    await press(screen.getByTestId("delete-entry"));
    const buttons = alert.mock.calls.at(-1)![2]!;
    sync?.dispose(); sync = null;
    await act(async () => resetStudySession());
    await act(async () => { buttons.find((button) => button.text === "Delete entry")!.onPress!(); });
    await settle();
    expect(server.notes.get(id)?.markdownBody).toBe("Account note");
    expect(deviceStudy.getSnapshot().notes).toEqual([]);
  });

  it("hides an open verse draft when the account changes", async () => {
    server.webAnnotate("ada", { ...ALMA_32, verse: 21 }, { body: "Ada only", highlightColor: "green" });
    signIn();
    await renderRouter("./app", { initialUrl: "/browse/bookofmormon/alma/32" });
    await screen.findByTestId("reader-text");
    await settle();
    await selectText("ye hope for things");
    await press(screen.getByTestId("action-annotate"));
    await press(screen.getByTestId("annotate-note"));
    await type(screen.getByTestId("verse-note-text"), "Ada unsaved draft");
    sync?.dispose(); sync = null;
    await act(async () => { signIn("bea"); });
    await settle();
    expect(screen.queryByTestId("verse-note-text")).toBeNull();
    expect(screen.getByText(/Your account changed/)).toBeTruthy();
    expect(server.annotationOf("bea", { ...ALMA_32, verse: 21 })).toBeUndefined();
  });
});
