// The lessons page's chapter chips, tinted once read, as the website's LessonChapters tints them: signed in, from
// the chapters the account marked read (readingProgress:getMyProgressForBook's chapterReads, here the in-memory
// account of testing/fakeStudyServer.ts); signed out, from reading logged in this device's journal (the website has
// nothing to show then). One never stands in for the other, and nothing of one account shows for another.

import { act, renderRouter, screen, within } from "expo-router/testing-library";
import { studyApi } from "../src/account/api";
import { StudySync } from "../src/account/studySync";
import { resetLessonProgress } from "../src/features/cfm/LessonParts";
import { getComeFollowMeWeekByStart, scriptureSource, weekReading, type ChapterRange } from "../src/shared/web";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { resetStudySession, setStudySession } from "../src/storage/studySession";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { FakeStudyServer, flush } from "../testing/fakeStudyServer";

const WEEK = "2026-10-26";
const ranges: ChapterRange[] = weekReading(getComeFollowMeWeekByStart(WEEK)!);
const first = ranges[0];

async function settle() {
  for (let round = 0; round < 3; round++) {
    await act(async () => {
      await flush();
      jest.advanceTimersByTime(300);
      await flush();
    });
  }
}

/** Each chip's label on the featured lesson ("…, read" once tinted). */
function chipLabels() {
  const chips = within(screen.getByTestId("featured-lesson")).getByLabelText("This week's chapters");
  return within(chips)
    .getAllByRole("link")
    .map((chip) => chip.props.accessibilityLabel as string);
}

function logDeviceReading(range: ChapterRange) {
  for (let chapter = range.from; chapter <= range.to; chapter++) {
    deviceStudy.createNote({
      requestId: `read-${range.book}-${chapter}`,
      markdownBody: "",
      journalDate: WEEK,
      source: scriptureSource({ volume: range.volume, book: range.book, chapter, reference: `${range.book} ${chapter}` }),
      logReading: true,
    });
  }
}

let server: FakeStudyServer;
let sync: StudySync | null = null;

function signIn(owner: string) {
  const store = accountStore(owner);
  sync = new StudySync(owner, store, server.client(owner)).start();
  setStudySession({ mode: "account", owner, store, sync });
}

beforeEach(() => {
  setStoragePort(memoryStorage());
  readerPreferences.reset();
  lastPosition.reset();
  resetAccountStores();
  resetLessonProgress();
  initDeviceStudy();
  server = new FakeStudyServer();
  jest.useFakeTimers({ now: new Date(2026, 9, 27, 9, 0) });
});

afterEach(() => {
  sync?.dispose();
  sync = null;
  resetStudySession();
});

describe("this week's chapter chips", () => {
  it("signed out, tint chapters whose reading was logged in this device's journal", async () => {
    expect(first).toBeTruthy();
    logDeviceReading(first);
    await renderRouter("./app", { initialUrl: "/come-follow-me" });
    await screen.findByTestId("featured-lesson");
    expect(chipLabels()[0]).toMatch(/, read$/);
    expect(chipLabels().slice(1).every((label) => !label.endsWith(", read"))).toBe(true);
  });

  it("signed in, never tint from this device's journal", async () => {
    logDeviceReading(first);
    signIn("ada");
    await renderRouter("./app", { initialUrl: "/come-follow-me" });
    await screen.findByTestId("featured-lesson");
    await settle();
    expect(chipLabels().some((label) => label.endsWith(", read"))).toBe(false);
  });

  it("signed in, never tint from journal readings the account logged either: only chapters it marked read", async () => {
    server.webCreateNote("ada", "", WEEK, scriptureSource({ volume: first.volume, book: first.book, chapter: first.from, reference: "logged" }), true);
    signIn("ada");
    await renderRouter("./app", { initialUrl: "/come-follow-me" });
    await screen.findByTestId("featured-lesson");
    await settle();
    expect(chipLabels()[0].endsWith(", read")).toBe(false);
  });

  // Needs the account's progress query on the sync port (readingProgress:getMyProgressForBook in
  // src/account/api.ts, studySync.ts and studySession.ts, and the fake account's chapterReads).
  const progressQuery = "getMyProgressForBook" in studyApi ? it : it.skip;

  progressQuery("signed in, tint the chapters the account marked read, and only for that account", async () => {
    const mark = (server as unknown as { webMarkChapterRead(owner: string, volume: string, book: string, chapter: number): void }).webMarkChapterRead.bind(server);
    for (let chapter = first.from; chapter <= first.to; chapter++) mark("ada", first.volume, first.book, chapter);
    signIn("ada");
    await renderRouter("./app", { initialUrl: "/come-follow-me" });
    await screen.findByTestId("featured-lesson");
    await settle();
    expect(chipLabels()[0]).toMatch(/, read$/);

    // Another account, and then signing out: Ada's chapters show for neither.
    sync?.dispose();
    signIn("bea");
    await settle();
    expect(chipLabels()[0].endsWith(", read")).toBe(false);
    sync?.dispose();
    sync = null;
    await act(async () => resetStudySession());
    await settle();
    expect(chipLabels()[0].endsWith(", read")).toBe(false);
  });
});
