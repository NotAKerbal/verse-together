// Real lesson routes, account facades and sync engine over the in-memory account API. Native selection is a mocked
// bridge event. These verify integration and ownership, not a device or an authenticated production mutation.
import { act, fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import { Alert } from "react-native";
import { StudySync } from "../src/account/studySync";
import { annotationChapter, type GuideAnnotationPatch } from "../src/shared/web";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { resetStudySession, setStudySession } from "../src/storage/studySession";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { FakeStudyServer, flush } from "../testing/fakeStudyServer";
import { resetNativeCalls, selectText } from "../testing/scriptureText";

const WEEK = "2026-10-26";
const PHRASE = "This is a personal Latter-day Saint study guide";
const LAMENTATIONS = annotationChapter("oldtestament", "lamentations", 3);
let server: FakeStudyServer;
let sync: StudySync | null;
type GuideSave = (patch: Required<GuideAnnotationPatch>) => Promise<unknown>;
let mockLatestGuideSave: GuideSave | null = null;

// Keep the real editor and UI; retain its business callback to simulate a delayed native Save after unmount.
jest.mock("../src/features/cfm/GuideAnnotationSheet", () => {
  const React = jest.requireActual("react");
  const Actual = jest.requireActual("../src/features/cfm/GuideAnnotationSheet").default;
  return { __esModule: true, default: (props: { visible: boolean; onSave: GuideSave }) => {
    if (props.visible) mockLatestGuideSave = props.onSave;
    return React.createElement(Actual, props);
  } };
});

async function settle() {
  for (let round = 0; round < 4; round++) {
    await act(async () => { await flush(); jest.advanceTimersByTime(300); await flush(); });
  }
}

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => { fireEvent.press(element); });
  await settle();
}

function signIn(owner: string) {
  sync?.dispose();
  const store = accountStore(owner);
  sync = new StudySync(owner, store, server.client(owner)).start();
  setStudySession({ mode: "account", owner, store, sync });
}

async function selectProse() {
  const view = screen.getAllByTestId(/^prose-/).find((item) => (item.props as { content: { text: string } }).content.text.includes(PHRASE))!;
  await selectText(PHRASE, { testID: view.props.testID });
  await settle();
}

async function openNote() {
  await selectProse();
  await press(within(screen.getByTestId("guide-actions")).getByTestId("action-annotate"));
  await press(within(screen.getByTestId("guide-actions")).getByTestId("annotate-note"));
  return screen.getByTestId("guide-note-sheet");
}

beforeEach(() => {
  resetStudySession();
  setStoragePort(memoryStorage());
  resetAccountStores();
  readerPreferences.reset();
  lastPosition.reset();
  initDeviceStudy();
  resetNativeCalls();
  server = new FakeStudyServer();
  sync = null;
  mockLatestGuideSave = null;
});

afterEach(() => {
  sync?.dispose();
  resetStudySession();
  jest.restoreAllMocks();
});

it("reads and writes the account's Lamentations annotations in the guide, leaving device rows alone", async () => {
  server.webAnnotate("ada", { ...LAMENTATIONS, verse: 22 }, { body: "Ada's website note", highlightColor: "green" });
  deviceStudy.saveAnnotation({ ...LAMENTATIONS, verse: 22 }, "Device-only note", {});
  signIn("ada");
  await renderRouter("./app", { initialUrl: `/come-follow-me/${WEEK}` });
  await settle();
  const views = () => screen.getAllByTestId(/^guide-text-lamentations-3-/);
  const text = () => views().map((view) => (view.props as { content: { text: string } }).content.text).join("\n");
  expect(text()).toContain("Ada's website note");
  expect(text()).not.toContain("Device-only note");
  const passage = views().find((view) => (view.props as { content: { text: string } }).content.text.includes("22  It is of the Lord's mercies"))!;
  await selectText("his compassions fail not.", { testID: passage.props.testID });
  await press(within(screen.getByTestId("verse-actions")).getByLabelText("Yellow highlight"));
  const row = server.annotationOf("ada", { ...LAMENTATIONS, verse: 22 });
  expect(row?.textMarks).toEqual(expect.arrayContaining([expect.objectContaining({ color: "yellow", text: "his compassions fail not." })]));
  expect(server.annotationOf("ada", { ...LAMENTATIONS, book: "jeremiah", verse: 22 })).toBeUndefined();
  expect(deviceStudy.getSnapshot().annotations[0].body).toBe("Device-only note");
});

it("saves guide prose notes to the account and reads them back without creating device spans", async () => {
  signIn("ada");
  await renderRouter("./app", { initialUrl: `/come-follow-me/${WEEK}` });
  await settle();
  const sheet = await openNote();
  await act(async () => { fireEvent.changeText(within(sheet).getByTestId("guide-note-text"), "Ada's private guide note"); });
  await press(within(sheet).getByTestId("guide-note-save"));
  expect([...server.guides.values()]).toMatchObject([{ owner: "ada", guide: WEEK, exact: PHRASE, body: "Ada's private guide note" }]);
  expect(deviceStudy.getSnapshot().highlights).toEqual([]);
  const reopened = await openNote();
  expect(within(reopened).getByTestId("guide-note-text").props.value).toBe("Ada's private guide note");
});

it.each(["ada", "device"])("hides an unsaved %s guide draft and rejects its old Save callback after switching to Bea", async (owner) => {
  if (owner !== "device") signIn(owner);
  await renderRouter("./app", { initialUrl: `/come-follow-me/${WEEK}` });
  await settle();
  const sheet = await openNote();
  await act(async () => { fireEvent.changeText(within(sheet).getByTestId("guide-note-text"), "Private old draft"); });
  const saveOld = mockLatestGuideSave!;
  expect(saveOld).toBeDefined();
  await act(async () => signIn("bea"));
  expect(screen.queryByTestId("guide-note-sheet")).toBeNull();
  expect(screen.queryByTestId("guide-actions")).toBeNull();
  await act(async () => {
    await expect(saveOld({ body: "Private old draft", highlightColor: null, underlineColor: null })).rejects.toThrow(/account changed/i);
  });
  await settle();
  expect(server.calls.filter((call) => call.name === "annotations:setGuideAnnotation")).toEqual([]);
  expect([...server.guides.values()]).toEqual([]);
  expect(deviceStudy.getSnapshot().highlights).toEqual([]);
  const newSheet = await openNote();
  expect(within(newSheet).getByTestId("guide-note-text").props.value).toBe("");
});

it("rejects a delayed guide-delete confirmation after an account change", async () => {
  signIn("ada");
  await renderRouter("./app", { initialUrl: `/come-follow-me/${WEEK}` });
  await settle();
  const sheet = await openNote();
  await act(async () => { fireEvent.changeText(within(sheet).getByTestId("guide-note-text"), "Keep Ada's note"); });
  await press(within(sheet).getByTestId("guide-note-save"));
  const edit = await openNote();
  let confirm: (() => void) | undefined;
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    const action = buttons?.find((button) => button.style === "destructive")?.onPress;
    if (action) confirm = () => { action(); };
  });
  await press(within(edit).getByTestId("guide-note-delete"));
  expect(confirm).toBeDefined();
  await act(async () => signIn("bea"));
  await act(async () => { confirm?.(); await flush(); });
  await settle();
  expect(server.calls.filter((call) => call.name === "annotations:deleteGuideHighlight")).toEqual([]);
  expect([...server.guides.values()]).toMatchObject([{ owner: "ada", body: "Keep Ada's note" }]);
});
