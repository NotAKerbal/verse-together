// The journal editor's saving, through the app's real routes and storage: an entry being edited saves itself (a pause
// in typing, leaving, the app going to the background) against its revision, says when it couldn't and retries, and
// never overwrites a version changed elsewhere; a new entry's draft is kept on the device for its owner only, comes
// back after the app was closed, and saves as one entry under its request id. Published and archived entries are
// read-only, as on the website. Signed in, sessions are set as AccountProvider sets them; the account side runs
// over the in-memory account (testing/fakeStudyServer.ts).

import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as Clipboard from "expo-clipboard";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { StudySync } from "../src/account/studySync";
import { setDraftIntent } from "../src/features/journal/draftIntent";
import { ENTRY_DRAFT_PREFIX, readEntryDraft, writeEntryDraft } from "../src/features/journal/entryDraftStore";
import { DEVICE_STUDY_KEY, localDateKey, scriptureSource, type JournalNoteDocument } from "../src/shared/web";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort, type StoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { resetStudySession, setStudySession } from "../src/storage/studySession";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { FakeStudyServer, flush } from "../testing/fakeStudyServer";

let port: ReturnType<typeof memoryStorage>;
/** Set to make the device study's next writes fail, as a full or unavailable database would. */
let failDeviceWrites = false;

function failingPort(base: ReturnType<typeof memoryStorage>): StoragePort {
  return {
    getItem: (key) => base.getItem(key),
    setItem: (key, value) => {
      if (failDeviceWrites && key === DEVICE_STUDY_KEY) throw new Error("The device's storage is full.");
      base.setItem(key, value);
    },
    removeItem: (key) => base.removeItem(key),
  };
}

async function advance(ms: number) {
  await act(async () => {
    await flush();
    jest.advanceTimersByTime(ms);
    await flush();
  });
}

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await advance(300);
}

async function type(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("entry-text"), text);
  });
}

/** Presses the button labelled `choice` in the next Alert. */
function answerAlert(choice: string) {
  return jest.spyOn(Alert, "alert").mockImplementationOnce((_title, _message, buttons) => buttons?.find((button) => button.text === choice)?.onPress?.());
}

function noteBody(id: string) {
  return deviceStudy.getSnapshot().notes.find((note) => note.id === id)?.markdown_body;
}

function storedDraftKeys() {
  return [...port.data.keys()].filter((key) => key.startsWith(ENTRY_DRAFT_PREFIX));
}

/** A device note given another status, as an import from the website could bring. */
function deviceNoteWithStatus(status: "published" | "archived") {
  const { id } = deviceStudy.createNote({ requestId: `status-${status}`, markdownBody: `# ${status} thought\nKept as it is.`, journalDate: "2026-10-20" });
  const data = JSON.parse(port.getItem(DEVICE_STUDY_KEY)!);
  data.notes = data.notes.map((note: { id: string }) => (note.id === id ? { ...note, status } : note));
  port.setItem(DEVICE_STUDY_KEY, JSON.stringify(data));
  initDeviceStudy();
  return id;
}

function signInOffline(owner: string) {
  const store = accountStore(owner);
  setStudySession({ mode: "account", owner, store, sync: null });
  return store;
}

beforeEach(() => {
  port = memoryStorage();
  failDeviceWrites = false;
  setStoragePort(failingPort(port));
  readerPreferences.reset();
  lastPosition.reset();
  resetAccountStores();
  initDeviceStudy();
});

afterEach(() => {
  resetStudySession();
  jest.restoreAllMocks();
});

describe("editing a saved entry on this device", () => {
  it("saves after a pause in typing, without Save, against the note's revision", async () => {
    const { id } = deviceStudy.createNote({ requestId: "r1", markdownBody: "First thought", journalDate: "2026-10-20" });
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await type("First thought, and a second");
    expect(screen.getByTestId("entry-save-state")).toHaveTextContent("Unsaved changes");
    await advance(500);
    expect(noteBody(id)).toBe("First thought");
    await advance(500);
    expect(noteBody(id)).toBe("First thought, and a second");
    expect(deviceStudy.getSnapshot().notes[0].markdown_revision).toBe(1);
    expect(screen.getByTestId("entry-save-state")).toHaveTextContent(/^Saved on this device at /);

    // Typing on saves again on the new revision, not the one the editor opened with.
    await type("First thought, a second, and a third");
    await advance(1000);
    expect(noteBody(id)).toBe("First thought, a second, and a third");
    expect(deviceStudy.getSnapshot().notes[0].markdown_revision).toBe(2);
  });

  it("saves what was typed when leaving the entry, without asking", async () => {
    const { id } = deviceStudy.createNote({ requestId: "r1", markdownBody: "Before", journalDate: "2026-10-20" });
    await renderRouter("./app", { initialUrl: "/notes" });
    await act(async () => router.push(`/notes/entry/${id}`));
    await advance(300);
    const alert = jest.spyOn(Alert, "alert");
    await type("Typed just before leaving");
    await press(screen.getByLabelText("Close entry"));
    expect(alert).not.toHaveBeenCalled();
    expect(noteBody(id)).toBe("Typed just before leaving");
    await waitFor(() => expect(screen).toHavePathname("/notes"));
  });

  it("saves at once when the app goes to the background", async () => {
    const listeners: Array<(state: AppStateStatus) => void> = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((event, listener) => {
      if (event === "change") listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    const { id } = deviceStudy.createNote({ requestId: "r1", markdownBody: "Before", journalDate: "2026-10-20" });
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await type("Written as the phone locked");
    await act(async () => listeners.forEach((listener) => listener("background")));
    expect(noteBody(id)).toBe("Written as the phone locked");
  });

  it("says when a save failed, keeps the text, and saves it on Retry", async () => {
    const copy = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    const { id } = deviceStudy.createNote({ requestId: "r1", markdownBody: "Before", journalDate: "2026-10-20" });
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    failDeviceWrites = true;
    await type("Must not be lost");
    await advance(1000);
    expect(screen.getByTestId("entry-save-error")).toHaveTextContent(/Not saved: The device's storage is full\./);
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "Must not be lost");
    expect(noteBody(id)).toBe("Before");

    await press(screen.getByTestId("save-copy"));
    expect(copy).toHaveBeenCalledWith("Must not be lost");

    // Leaving while it can't be saved asks first.
    const alert = answerAlert("Keep editing");
    await press(screen.getByLabelText("Close entry"));
    expect(alert).toHaveBeenLastCalledWith("Discard changes?", "Your changes to this entry couldn't be saved.", expect.any(Array));
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "Must not be lost");

    failDeviceWrites = false;
    await press(screen.getByTestId("save-retry"));
    expect(noteBody(id)).toBe("Must not be lost");
    expect(screen.queryByTestId("entry-save-error")).toBeNull();
  });

  it("never overwrites a version changed elsewhere: autosave waits, Save stops with the text kept", async () => {
    const { id } = deviceStudy.createNote({ requestId: "r1", markdownBody: "Original", journalDate: "2026-10-20" });
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await type("Mine, typed here");
    // Another writer on the device saves the note meanwhile.
    await act(async () => {
      deviceStudy.saveNote(id, "Theirs, saved elsewhere", 0);
    });
    await advance(2000);
    expect(noteBody(id)).toBe("Theirs, saved elsewhere");
    expect(screen.getByText(/changed somewhere else while you were editing/)).toBeTruthy();

    await press(screen.getByTestId("save-entry"));
    expect(screen.getByTestId("entry-device-conflict")).toBeTruthy();
    expect(noteBody(id)).toBe("Theirs, saved elsewhere");
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "Mine, typed here");

    await press(screen.getByTestId("conflict-mine"));
    expect(noteBody(id)).toBe("Mine, typed here");
    expect(deviceStudy.getSnapshot().notes[0].markdown_revision).toBe(2);
    expect(screen.queryByTestId("entry-device-conflict")).toBeNull();
  });

  it("loads the latest version after a conflict when asked", async () => {
    const { id } = deviceStudy.createNote({ requestId: "r1", markdownBody: "Original", journalDate: "2026-10-20" });
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await type("Mine");
    await act(async () => {
      deviceStudy.saveNote(id, "Theirs", 0);
    });
    await press(screen.getByTestId("save-entry"));
    await press(screen.getByTestId("conflict-latest"));
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "Theirs");
    // Typing now saves on the latest revision.
    await type("Theirs, then mine");
    await advance(1000);
    expect(noteBody(id)).toBe("Theirs, then mine");
  });
});

describe("published and archived entries are read-only", () => {
  it("shows an archived entry without a writer or Save, and saves nothing", async () => {
    const id = deviceNoteWithStatus("archived");
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    expect(screen.getByText("Archived · read-only")).toBeTruthy();
    expect(screen.queryByTestId("entry-text")).toBeNull();
    expect(screen.queryByTestId("save-entry")).toBeNull();
    expect(screen.getByText("Kept as it is.")).toBeTruthy();
    // Archived entries can still be deleted; published ones can't (below).
    expect(screen.getByTestId("delete-entry")).toBeTruthy();
    await advance(2000);
    expect(deviceStudy.getSnapshot().notes[0].markdown_revision).toBe(0);
  });

  it("offers no delete for a published entry", async () => {
    const id = deviceNoteWithStatus("published");
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    expect(screen.getByText("Published · read-only")).toBeTruthy();
    expect(screen.queryByTestId("delete-entry")).toBeNull();
  });

  it("signed in, a published account entry is read-only and nothing is queued for it", async () => {
    const store = signInOffline("ada");
    const doc: JournalNoteDocument = {
      id: "note_pub",
      title: "Shared thought",
      status: "published",
      markdown_body: "# Shared thought\nPublished on the website.",
      markdown_revision: 3,
      markdown_canonical: true,
      journal_date: "2026-10-20",
      source: null,
      reading_at: null,
      created_at: "2026-10-20T10:00:00.000Z",
      updated_at: "2026-10-20T10:00:00.000Z",
    };
    store.putDoc(doc);
    await renderRouter("./app", { initialUrl: "/notes/entry/note_pub" });
    expect(screen.getByText("Published · read-only")).toBeTruthy();
    expect(screen.queryByTestId("entry-text")).toBeNull();
    expect(screen.queryByTestId("delete-entry")).toBeNull();
    await advance(2000);
    expect(store.getSnapshot().outbox.ops).toEqual([]);
  });
});

describe("a new entry's draft", () => {
  it("is kept on the device as it is written", async () => {
    await renderRouter("./app", { initialUrl: "/notes/new" });
    await type("# Half a thought\nWritten before the battery died");
    await advance(500);
    expect(readEntryDraft("device")).toMatchObject({ text: "# Half a thought\nWritten before the battery died", source: null, reading: false });
  });

  it("comes back on a blank new entry after the app was closed, and saves under its own request id", async () => {
    // What the previous run left in storage (above); nothing of it is in memory.
    writeEntryDraft("device", { requestId: "kept-1", text: "# Half a thought\nWritten before the battery died", source: null, reading: false, journalDate: "2026-10-26", range: null, edited: false });
    await renderRouter("./app", { initialUrl: "/notes/new" });
    expect(screen.getByTestId("entry-recovery")).toHaveTextContent(/the entry you hadn’t saved yet/);
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "# Half a thought\nWritten before the battery died");

    await press(screen.getByTestId("save-entry"));
    await waitFor(() => expect(screen).toHavePathname("/notes/entry/device-kept-1"));
    expect(deviceStudy.getSnapshot().notes.map((note) => [note.id, note.journal_date])).toEqual([["device-kept-1", "2026-10-26"]]);
    expect(storedDraftKeys()).toEqual([]);
  });

  it("can be discarded to start over", async () => {
    writeEntryDraft("device", { requestId: "kept-1", text: "Not wanted after all", source: null, reading: false, journalDate: "2026-10-26", range: null, edited: false });
    await renderRouter("./app", { initialUrl: "/notes/new" });
    answerAlert("Discard");
    await press(screen.getByTestId("recovery-discard"));
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "");
    expect(storedDraftKeys()).toEqual([]);
  });

  it("makes one entry however often Save is pressed, and isn't offered again once saved", async () => {
    // The app stopped after the entry was made but before the draft was forgotten.
    writeEntryDraft("device", { requestId: "req-1", text: "Saved once", source: null, reading: false, journalDate: localDateKey(), range: null, edited: false });
    deviceStudy.createNote({ requestId: "req-1", markdownBody: "Saved once", journalDate: localDateKey() });
    await renderRouter("./app", { initialUrl: "/notes/new" });
    expect(screen.queryByTestId("entry-recovery")).toBeNull();
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "");
    expect(storedDraftKeys()).toEqual([]);

    await type("A second entry");
    await act(async () => {
      fireEvent.press(screen.getByTestId("save-entry"));
      fireEvent.press(screen.getByTestId("save-entry"));
    });
    await advance(300);
    expect(deviceStudy.getSnapshot().notes.map((note) => note.markdown_body).sort()).toEqual(["A second entry", "Saved once"]);
  });

  it("keeps a failed save's draft and request id, so Try again makes the entry once", async () => {
    await renderRouter("./app", { initialUrl: "/notes/new" });
    await type("Through a full disk");
    failDeviceWrites = true;
    await press(screen.getByTestId("save-entry"));
    expect(screen.getByText("The device's storage is full.")).toBeTruthy();
    expect(screen.getByLabelText("Try again")).toBeTruthy();
    expect(readEntryDraft("device")?.text).toBe("Through a full disk");
    const requestId = readEntryDraft("device")!.requestId;

    failDeviceWrites = false;
    await press(screen.getByLabelText("Try again"));
    expect(deviceStudy.getSnapshot().notes.map((note) => note.id)).toEqual([`device-${requestId}`]);
  });

  it("leaving asks, and can keep the draft for later or discard it", async () => {
    await renderRouter("./app", { initialUrl: "/notes" });
    await act(async () => router.push("/notes/new"));
    await advance(300);
    await type("For later");
    answerAlert("Keep draft");
    await press(screen.getByLabelText("Close new entry"));
    await waitFor(() => expect(screen).toHavePathname("/notes"));
    expect(readEntryDraft("device")?.text).toBe("For later");
    expect(deviceStudy.getSnapshot().notes).toEqual([]);

    await act(async () => router.push("/notes/new"));
    await advance(300);
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "For later");
    answerAlert("Discard");
    await press(screen.getByLabelText("Close new entry"));
    await waitFor(() => expect(screen).toHavePathname("/notes"));
    expect(storedDraftKeys()).toEqual([]);
  });

  it("opened with a quote, keeps the quote and asks about the earlier draft instead of replacing either", async () => {
    writeEntryDraft("device", { requestId: "older", text: "An older unsaved thought", source: null, reading: false, journalDate: "2026-10-20", range: null, edited: false });
    const source = scriptureSource({ volume: "newtestament", book: "john", chapter: 1, verseStart: 1, verseEnd: 1, reference: "John 1:1" });
    setDraftIntent({ source, body: "> In the beginning was the Word\n\n", reading: false });
    await renderRouter("./app", { initialUrl: "/notes/new" });
    expect(screen.getByTestId("entry-recovery")).toHaveTextContent(/An older unsaved thought/);
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "> In the beginning was the Word\n\n");
    // Nothing replaces the earlier draft while it waits.
    await type("> In the beginning was the Word\n\nMy reflection");
    await advance(1000);
    expect(readEntryDraft("device")?.text).toBe("An older unsaved thought");

    // Saving the quote's entry keeps the earlier draft for later, with the quote's own source.
    await press(screen.getByTestId("save-entry"));
    expect(deviceStudy.getSnapshot().notes[0]).toMatchObject({ markdown_body: "> In the beginning was the Word\n\nMy reflection", source: { label: "John 1:1", verseStart: 1 }, reading_at: null });
    expect(readEntryDraft("device")?.requestId).toBe("older");
  });

  it("continues the earlier draft when chosen", async () => {
    writeEntryDraft("device", { requestId: "older", text: "An older unsaved thought", source: null, reading: false, journalDate: "2026-10-20", range: null, edited: false });
    setDraftIntent({ source: scriptureSource({ volume: "newtestament", book: "john", chapter: 1, reference: "John 1" }), body: "", reading: true });
    await renderRouter("./app", { initialUrl: "/notes/new" });
    await press(screen.getByTestId("recovery-continue"));
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "An older unsaved thought");
    expect(screen.queryByTestId("entry-recovery")).toBeNull();
    await press(screen.getByTestId("save-entry"));
    expect(deviceStudy.getSnapshot().notes.map((note) => [note.id, note.journal_date, note.reading_at])).toEqual([["device-older", "2026-10-20", null]]);
  });
});

describe("drafts belong to their study's owner", () => {
  const GUEST = { requestId: "guest-1", text: "Guest's private draft", source: null, reading: false, journalDate: "2026-10-26", range: null, edited: false };
  const ADA = { ...GUEST, requestId: "ada-1", text: "Ada's private draft" };

  it("never shows the signed-out draft to an account; the account's draft is kept apart", async () => {
    writeEntryDraft("device", GUEST);
    signInOffline("ada");
    await renderRouter("./app", { initialUrl: "/notes/new" });
    expect(screen.queryByTestId("entry-recovery")).toBeNull();
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "");
    await type("Ada's private draft");
    await advance(500);
    expect(readEntryDraft("account:ada")?.text).toBe("Ada's private draft");
    expect(readEntryDraft("device")?.text).toBe("Guest's private draft");
  });

  it("never shows one account's draft to another", async () => {
    writeEntryDraft("device", GUEST);
    writeEntryDraft("account:ada", ADA);
    signInOffline("bea");
    await renderRouter("./app", { initialUrl: "/notes/new" });
    expect(screen.queryByTestId("entry-recovery")).toBeNull();
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "");
  });

  it("gives each owner back only their own draft", async () => {
    writeEntryDraft("device", GUEST);
    writeEntryDraft("account:ada", ADA);
    signInOffline("ada");
    await renderRouter("./app", { initialUrl: "/notes/new" });
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "Ada's private draft");
    await press(screen.getByTestId("save-entry"));
    // Saved into Ada's account (queued: offline), never the device's study; the guest's draft is untouched.
    expect(accountStore("ada").getSnapshot().outbox.ops).toMatchObject([{ kind: "create", requestId: "ada-1", markdownBody: "Ada's private draft" }]);
    expect(deviceStudy.getSnapshot().notes).toEqual([]);
    expect(readEntryDraft("account:ada")).toBeNull();
    expect(readEntryDraft("device")?.text).toBe("Guest's private draft");
  });

  it("signed out, shows the device's own draft and not an account's", async () => {
    writeEntryDraft("device", GUEST);
    writeEntryDraft("account:ada", ADA);
    await renderRouter("./app", { initialUrl: "/notes/new" });
    expect(screen.getByTestId("entry-text")).toHaveProp("value", "Guest's private draft");
  });

  it("keeps nothing while the account is still being checked", async () => {
    setStudySession({ mode: "blocked", reason: "checking" });
    await renderRouter("./app", { initialUrl: "/notes/new" });
    await type("Typed while checking");
    await advance(1000);
    expect(storedDraftKeys()).toEqual([]);
  });

  it("stops keeping a draft once the account changes, and puts nothing in the new owner's place", async () => {
    await renderRouter("./app", { initialUrl: "/notes/new" });
    await type("Guest typing");
    await advance(500);
    await type("Guest typing, then a sign-in");
    await act(async () => {
      signInOffline("ada");
    });
    await advance(1000);
    expect(screen.getByText(/Your account changed/)).toBeTruthy();
    expect(readEntryDraft("account:ada")).toBeNull();
    expect(readEntryDraft("device")?.text).toBe("Guest typing");
    expect(accountStore("ada").getSnapshot().outbox.ops).toEqual([]);
  });

  it("an edit open when the account changes saves nothing to either study afterwards", async () => {
    const { id } = deviceStudy.createNote({ requestId: "r1", markdownBody: "Guest note", journalDate: "2026-10-20" });
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await type("Guest edit, not yet saved");
    await act(async () => {
      signInOffline("ada");
    });
    await advance(2000);
    expect(noteBody(id)).toBe("Guest note");
    expect(accountStore("ada").getSnapshot().outbox.ops).toEqual([]);
  });
});

describe("signed in, edits save themselves to the account", () => {
  let server: FakeStudyServer;
  let sync: StudySync | null = null;
  beforeEach(() => {
    server = new FakeStudyServer();
  });
  afterEach(() => {
    sync?.dispose();
    sync = null;
  });

  it("queues the edit after a pause and sends it, without Save", async () => {
    const id = server.webCreateNote("ada", "From the website", "2026-10-20");
    const store = accountStore("ada");
    sync = new StudySync("ada", store, server.client("ada")).start();
    setStudySession({ mode: "account", owner: "ada", store, sync });
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await advance(300);
    await type("From the website, edited in the app");
    await advance(1500);
    await advance(300);
    expect(server.notes.get(id)).toMatchObject({ markdownBody: "From the website, edited in the app", markdownRevision: 1 });
    expect(await screen.findByText("Synced to your account")).toBeTruthy();
  });
});

describe("opening an entry the website saved changes nothing", () => {
  // The website writes a verse range with a hyphen; this app writes an en dash. The same reading either way.
  const webSource = () =>
    scriptureSource({ volume: "bookofmormon", book: "1-nephi", chapter: 3, verseStart: 7, verseEnd: 9, reference: "1 Nephi 3:7-9" });

  function webDoc(status: "draft" | "published"): JournalNoteDocument {
    return {
      id: `note_${status}`,
      title: "Go and do",
      status,
      markdown_body: "# Go and do\nI will go and do.",
      markdown_revision: 2,
      markdown_canonical: true,
      journal_date: "2026-10-20",
      source: webSource(),
      reading_at: "2026-10-20T10:00:00.000Z",
      created_at: "2026-10-20T10:00:00.000Z",
      updated_at: "2026-10-20T10:00:00.000Z",
    };
  }

  it("a draft logged with a hyphenated range is not saved again, and keeps the website's source", async () => {
    const store = signInOffline("ada");
    store.putDoc(webDoc("draft"));
    await renderRouter("./app", { initialUrl: "/notes/entry/note_draft" });
    expect(screen.getByText("1 Nephi 3:7-9")).toBeTruthy();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    await advance(3000);
    expect(store.getSnapshot().outbox.ops).toEqual([]);
    expect(screen.getByTestId("save-entry").props.accessibilityState).toMatchObject({ disabled: true });

    // Changing only the day keeps the website's source exactly as it was.
    expect(screen.queryByLabelText("Previous day")).toBeNull();
    await press(screen.getByRole("button", { name: "Edit reading details" }));
    expect(screen.getByLabelText("Previous day")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit reading details" }).props.accessibilityValue.text).toContain("Verses 7–9");
    await press(screen.getByRole("button", { name: "Edit reading details" }));
    expect(screen.queryByLabelText("Previous day")).toBeNull();
    expect(store.getSnapshot().outbox.ops).toEqual([]);
    await press(screen.getByRole("button", { name: "Edit reading details" }));
    await press(screen.getByLabelText("Previous day"));
    await advance(1000);
    expect(store.getSnapshot().outbox.ops).toMatchObject([{ source: { label: "1 Nephi 3:7-9", verseStart: 7, verseEnd: 9 }, journalDate: "2026-10-19" }]);
  });

  it("a published one shows no unsaved-changes warning and queues nothing", async () => {
    const store = signInOffline("ada");
    store.putDoc(webDoc("published"));
    await renderRouter("./app", { initialUrl: "/notes/entry/note_published" });
    expect(screen.getByText("Published · read-only")).toBeTruthy();
    expect(screen.queryByText(/your changes weren’t saved/)).toBeNull();
    expect(screen.queryByTestId("read-only-copy")).toBeNull();
    await advance(3000);
    expect(store.getSnapshot().outbox.ops).toEqual([]);
  });

  it("on this device, a logged reading with a hyphenated range is not saved again", async () => {
    const { id } = deviceStudy.createNote({ requestId: "r-web", markdownBody: "Go and do", journalDate: "2026-10-20", source: webSource(), logReading: true });
    await renderRouter("./app", { initialUrl: `/notes/entry/${id}` });
    await advance(3000);
    const stored = deviceStudy.getSnapshot().notes[0];
    expect(stored.markdown_revision).toBe(0);
    expect(stored.source).toMatchObject({ label: "1 Nephi 3:7-9" });
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });
});

describe("a new entry that can't be kept says so", () => {
  it("while an earlier draft waits, says this one isn't kept, and offers to copy it before leaving", async () => {
    writeEntryDraft("device", { requestId: "older", text: "An older unsaved thought", source: null, reading: false, journalDate: "2026-10-20", range: null, edited: false });
    const source = scriptureSource({ volume: "newtestament", book: "john", chapter: 1, verseStart: 1, verseEnd: 1, reference: "John 1:1" });
    setDraftIntent({ source, body: "> In the beginning was the Word\n\n", reading: false });
    const copy = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    await renderRouter("./app", { initialUrl: "/notes" });
    await act(async () => router.push("/notes/new"));
    await advance(300);
    await type("> In the beginning was the Word\n\nA long reflection");
    expect(screen.getByTestId("entry-not-kept")).toHaveTextContent(/isn’t kept on this device until you continue or discard the earlier one/);
    await press(screen.getByTestId("waiting-copy"));
    expect(copy).toHaveBeenLastCalledWith("> In the beginning was the Word\n\nA long reflection");
    expect(screen.getByText("Copied.")).toBeTruthy();

    // Leaving offers no Keep draft (it couldn't be kept), but does offer the copy.
    const alert = jest.spyOn(Alert, "alert").mockImplementationOnce(() => {});
    await press(screen.getByLabelText("Close new entry"));
    const buttons = (alert.mock.calls[0][2] ?? []).map((button) => button.text);
    expect(buttons).toEqual(["Keep editing", "Copy my text", "Discard"]);
    expect(alert.mock.calls[0][1]).toMatch(/can't be kept as a draft while your earlier one is waiting/);
    expect(readEntryDraft("device")?.text).toBe("An older unsaved thought");
  });

  it("a reading opened to log and left untouched isn't offered as a kept draft", async () => {
    setDraftIntent({ source: scriptureSource({ volume: "newtestament", book: "john", chapter: 1, reference: "John 1" }), body: "", reading: true });
    await renderRouter("./app", { initialUrl: "/notes" });
    await act(async () => router.push("/notes/new"));
    await advance(300);
    const alert = jest.spyOn(Alert, "alert").mockImplementationOnce(() => {});
    await press(screen.getByLabelText("Close new entry"));
    expect((alert.mock.calls[0][2] ?? []).map((button) => button.text)).toEqual(["Keep editing", "Discard"]);
    expect(storedDraftKeys()).toEqual([]);
  });

  it("after the account changes, offers to copy the unsaved text before closing", async () => {
    const copy = jest.spyOn(Clipboard, "setStringAsync").mockResolvedValue(true);
    await renderRouter("./app", { initialUrl: "/notes/new" });
    await type("Guest typing, then a sign-in");
    await act(async () => {
      signInOffline("ada");
    });
    await advance(300);
    expect(screen.getByText(/Copy your text first to keep it/)).toBeTruthy();
    await press(screen.getByTestId("identity-copy"));
    expect(copy).toHaveBeenLastCalledWith("Guest typing, then a sign-in");
    expect(screen.getByText("Copied.")).toBeTruthy();
    expect(accountStore("ada").getSnapshot().outbox.ops).toEqual([]);
  });
});
