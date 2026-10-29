// Study plans through the real /plans routes, as the website's plans pages work: signed out, "Sign in to keep a
// plan" and nothing asked of any server; signed in, the account's own plans over the existing readingPlans and
// readingProgress functions (here the in-memory account of testing/fakeStudyServer.ts, through the provider's
// owner-scoped AccountCalls). The account provider's state is a stand-in; the session, calls, sync engine, builder
// rules and screens are the app's own. Not a device, a real deployment or an authenticated production account.

import { act, fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import { Alert } from "react-native";
import { ACCOUNT_CHANGED_MESSAGE, AccountCalls, planApi, publishAccountCalls, resetAccountCalls } from "../src/account/accountCalls";
import { StudySync } from "../src/account/studySync";
import { evaluateBuilder, freshState, quickStartsFor, resolvePace, setBookRange, planVolumesFor, toggleVolume, toggleWeekday } from "../src/features/plans/builderState";
import { planSaveMessage } from "../src/features/plans/planData";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { faithTradition } from "../src/storage/faithTradition";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { resetStudySession, setStudySession } from "../src/storage/studySession";
import { initDeviceStudy } from "../src/storage/study";
import { FakeStudyServer, flush } from "../testing/fakeStudyServer";

const mockAccount = {
  status: "signed-out" as string,
  user: null as null | { appUserId: string; email: string | null; name: string | null },
  sessionEmail: null,
  notice: null,
  signingIn: false,
  signIn: jest.fn(async () => null),
  signOut: jest.fn(async () => {}),
  deleteAccount: jest.fn(async () => ({ ok: true })),
  copyStudy: jest.fn(),
  updateName: jest.fn(),
  loadAccountLists: jest.fn(async () => null),
  revokeOtherSessions: jest.fn(),
  completeReturn: jest.fn(() => null),
  clearNotice: jest.fn(),
  retry: jest.fn(),
};

jest.mock("../src/account/AccountProvider", () => ({
  AccountProvider: ({ children }: { children: unknown }) => children,
  useAccount: () => mockAccount,
}));

const ADA = "owner-A";
const BEA = "owner-B";
let server: FakeStudyServer;
let sync: StudySync | null = null;
let closeCalls: (() => void) | null = null;

async function settle() {
  for (let round = 0; round < 3; round++) {
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

function signIn(owner: string) {
  Object.assign(mockAccount, { status: "signed-in", user: { appUserId: owner, email: `${owner}@example.com`, name: owner } });
  const store = accountStore(owner);
  sync = new StudySync(owner, store, server.client(owner)).start();
  setStudySession({ mode: "account", owner, store, sync });
  closeCalls = publishAccountCalls(new AccountCalls(owner, server.client(owner)));
}

function signOut() {
  closeCalls?.();
  closeCalls = null;
  sync?.dispose();
  sync = null;
  Object.assign(mockAccount, { status: "signed-out", user: null });
  resetStudySession();
}

const ALMA = [32, 33, 34].map((chapter) => ({ volume: "bookofmormon", book: "alma", chapter, label: `Alma ${chapter}` }));

beforeEach(() => {
  setStoragePort(memoryStorage());
  readerPreferences.reset();
  lastPosition.reset();
  faithTradition.set("latter-day-saint");
  resetAccountStores();
  resetAccountCalls();
  initDeviceStudy();
  server = new FakeStudyServer();
  Object.assign(mockAccount, { status: "signed-out", user: null });
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 9, 28, 9, 0) });
});

afterEach(() => {
  signOut();
  jest.restoreAllMocks();
});

describe("signed out", () => {
  it("shows Sign in to keep a plan, asks no server, and starts the app's own sign-in", async () => {
    await renderRouter("./app", { initialUrl: "/plans" });
    expect(await screen.findByText("Sign in to keep a plan")).toBeTruthy();
    expect(screen.queryByText("My plans")).toBeNull();
    await press(screen.getByLabelText("Sign in"));
    expect(mockAccount.signIn).toHaveBeenCalledTimes(1);
    expect(server.calls).toEqual([]);
  });

  it("the builder and a plan's page say the same instead of showing anything", async () => {
    await renderRouter("./app", { initialUrl: "/plans/new" });
    expect(await screen.findByText("Sign in to keep a plan")).toBeTruthy();
    expect(screen.queryByText("Start this plan")).toBeNull();
  });

  it("Come, Follow Me links to the native plans, not the website", async () => {
    await renderRouter("./app", { initialUrl: "/come-follow-me" });
    await press(await screen.findByText("Your study plans"));
    expect(await screen.findByTestId("plans-screen")).toBeTruthy();
  });
});

describe("signed in", () => {
  it("lists only the account's own plans, with their progress and pace", async () => {
    server.webCreatePlan(ADA, { title: "Alma's sermons", steps: ALMA, chaptersPerDay: 1, startDate: "2026-10-27" });
    server.webCreatePlan(BEA, { title: "Bea's plan", steps: ALMA });
    server.webMarkChapterRead(ADA, "bookofmormon", "alma", 32);
    signIn(ADA);
    await renderRouter("./app", { initialUrl: "/plans" });
    await settle();
    expect(await screen.findByText("Alma's sermons")).toBeTruthy();
    expect(screen.queryByText("Bea's plan")).toBeNull();
    expect(screen.getByLabelText("1 of 3 chapters read")).toBeTruthy();
    expect(screen.getByText(/3 chapters · 1 a day · 3 reading days/)).toBeTruthy();
  });

  it("an account with no plans is offered the builder", async () => {
    signIn(ADA);
    await renderRouter("./app", { initialUrl: "/plans" });
    await settle();
    expect(await screen.findByText(/No plans yet/)).toBeTruthy();
    await press(screen.getByLabelText("Build your first plan"));
    expect(await screen.findByTestId("plan-builder")).toBeTruthy();
  });

  it("builds a plan from a quick start and saves it to the account", async () => {
    signIn(ADA);
    await renderRouter("./app", { initialUrl: "/plans/new" });
    await settle();
    await press(screen.getByLabelText(/^Gospels only\./));
    expect(screen.getByText("Day 1 is Matthew 1. 89 calendar days with reading every day.")).toBeTruthy();
    await press(screen.getByLabelText("Start this plan"));
    const plans = [...server.plans.values()];
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ owner: ADA, title: "Matthew + Mark + Luke + 1 more", template: "custom", chaptersPerDay: 1, startDate: "2026-10-28" });
    expect(plans[0].steps).toHaveLength(89);
    expect(plans[0].steps[0]).toEqual({ volume: "newtestament", book: "matthew", chapter: 1, label: "Matthew 1" });
    // Every day is stored as "every day" (no list), as the server normalizes it.
    expect(plans[0].readingDays).toBeUndefined();
    expect(await screen.findByTestId("plan-detail")).toBeTruthy();
    expect(screen.getByText("Day 1 of 89")).toBeTruthy();
  });

  it("refuses to save with nothing picked, and asks nothing of the account", async () => {
    signIn(ADA);
    await renderRouter("./app", { initialUrl: "/plans/new" });
    await settle();
    await press(screen.getByLabelText("Start this plan"));
    expect(screen.getByText(/Pick at least one volume, book, or chapter range/)).toBeTruthy();
    expect(server.calls.filter((call) => call.name.startsWith("readingPlans:"))).toEqual([]);
  });

  it("checks chapters off and on as the account's read chapters, and says so when offline", async () => {
    const id = server.webCreatePlan(ADA, { title: "Alma", steps: ALMA, chaptersPerDay: 2, startDate: "2026-10-28" });
    signIn(ADA);
    await renderRouter("./app", { initialUrl: `/plans/${id}` });
    await settle();
    expect(await screen.findByText("Day 1 of 2")).toBeTruthy();
    await press(screen.getAllByLabelText("Mark Alma 32 as read")[0]);
    expect(server.chapterReads.has(`${ADA}|bookofmormon|alma|32`)).toBe(true);
    const mark = server.calls.find((call) => call.name === "readingProgress:markChapterRead")!;
    expect(mark.args).toMatchObject({ volume: "bookofmormon", book: "alma", chapter: 32, journalDate: "2026-10-28" });
    expect(typeof mark.args.requestId).toBe("string");
    expect(screen.getAllByLabelText("Unmark Alma 32 as read").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("1 of 3 chapters read")).toBeTruthy();

    await press(screen.getAllByLabelText("Unmark Alma 32 as read")[0]);
    expect(server.chapterReads.has(`${ADA}|bookofmormon|alma|32`)).toBe(false);
    expect(screen.getByLabelText("0 of 3 chapters read")).toBeTruthy();

    await act(async () => server.setOnline(false));
    await press(screen.getAllByLabelText("Mark Alma 33 as read")[0]);
    expect(screen.getAllByText("You're offline. Connect to the internet and try again.").length).toBeGreaterThan(0);
    expect(server.chapterReads.size).toBe(0);
  });

  it("deletes a plan only after confirming, keeping its read chapters", async () => {
    const id = server.webCreatePlan(ADA, { title: "Alma", steps: ALMA });
    server.webMarkChapterRead(ADA, "bookofmormon", "alma", 32);
    signIn(ADA);
    const alert = jest.spyOn(Alert, "alert");
    alert.mockImplementationOnce((_title, _message, buttons) => buttons?.find((button) => button.style === "cancel")?.onPress?.());
    await renderRouter("./app", { initialUrl: "/plans" });
    await settle();
    await press(await screen.findByLabelText("Delete plan Alma"));
    expect(alert).toHaveBeenCalledWith('Delete "Alma"?', "Chapters you've marked read are kept.", expect.anything(), expect.anything());
    expect(server.plans.has(id)).toBe(true);

    alert.mockImplementationOnce((_title, _message, buttons) => buttons?.find((button) => button.style === "destructive")?.onPress?.());
    await press(screen.getByLabelText("Delete plan Alma"));
    expect(server.plans.has(id)).toBe(false);
    expect(server.chapterReads.has(`${ADA}|bookofmormon|alma|32`)).toBe(true);
    expect(await screen.findByText(/No plans yet/)).toBeTruthy();
  });

  it("edits a plan's title and pace; read chapters stay read", async () => {
    const id = server.webCreatePlan(ADA, { title: "Alma", steps: ALMA, selections: [{ kind: "range", volume: "bookofmormon", book: "alma", from: 32, to: 34 }], chaptersPerDay: 1, startDate: "2026-10-28" });
    server.webMarkChapterRead(ADA, "bookofmormon", "alma", 33);
    signIn(ADA);
    await renderRouter("./app", { initialUrl: `/plans/${id}/edit` });
    await settle();
    expect(await screen.findByDisplayValue("Alma")).toBeTruthy();
    await act(async () => fireEvent.changeText(screen.getByLabelText("Plan title"), "Alma on faith"));
    await press(screen.getByLabelText("Increase chapters per day"));
    await press(screen.getByLabelText("Save changes"));
    expect(server.plans.get(id)).toMatchObject({ title: "Alma on faith", chaptersPerDay: 2, template: "custom" });
    expect(await screen.findByLabelText("1 of 3 chapters read")).toBeTruthy();
  });

  it("a plan that isn't the account's is not found", async () => {
    const id = server.webCreatePlan(BEA, { title: "Bea's plan", steps: ALMA });
    signIn(ADA);
    await renderRouter("./app", { initialUrl: `/plans/${id}` });
    await settle();
    expect(await screen.findByText("Plan not found")).toBeTruthy();
    expect(screen.queryByText("Bea's plan")).toBeNull();
  });

  it("Other denominations: the builder offers the Bible only, without the Book of Mormon quick start", async () => {
    faithTradition.set("other");
    signIn(ADA);
    await renderRouter("./app", { initialUrl: "/plans/new" });
    await settle();
    expect(screen.queryByText("Book of Mormon in 30 days")).toBeNull();
    expect(screen.queryByLabelText(/^Whole Book of Mormon/)).toBeNull();
    expect(screen.queryByLabelText(/^Whole Doctrine & Covenants/)).toBeNull();
    expect(screen.getByLabelText(/^Whole New Testament/)).toBeTruthy();
    expect(screen.getByLabelText(/^Whole Old Testament/)).toBeTruthy();
    // The book tabs fall back to the New Testament.
    expect(within(screen.getByLabelText("New Testament books")).getByLabelText(/^Matthew,/)).toBeTruthy();
  });
});

describe("owner changes", () => {
  it("one account's plans never show for the next, and the list is read again for it", async () => {
    server.webCreatePlan(ADA, { title: "Ada's plan", steps: ALMA });
    server.webCreatePlan(BEA, { title: "Bea's plan", steps: ALMA });
    signIn(ADA);
    await renderRouter("./app", { initialUrl: "/plans" });
    await settle();
    expect(await screen.findByText("Ada's plan")).toBeTruthy();
    await act(async () => {
      signOut();
      signIn(BEA);
    });
    await settle();
    expect(screen.queryByText("Ada's plan")).toBeNull();
    expect(await screen.findByText("Bea's plan")).toBeTruthy();
  });

  it("a change whose reply arrives after the owner's calls closed is reported as not saved here", async () => {
    const calls = new AccountCalls(ADA, server.client(ADA));
    const pending = calls.mutation(planApi.unmarkChapterRead, { volume: "bookofmormon", book: "alma", chapter: 32 });
    calls.dispose();
    await expect(pending).rejects.toThrow(ACCOUNT_CHANGED_MESSAGE);
    await expect(calls.mutation(planApi.deletePlan, { planId: "x" })).rejects.toThrow(ACCOUNT_CHANGED_MESSAGE);
    let delivered = 0;
    calls.watch(planApi.listMyPlans, {}, () => delivered++);
    server.changed();
    expect(delivered).toBe(0);
  });
});

describe("builder rules (the web's PlanBuilder)", () => {
  it("paces by chapters a day, a number of reading days, or a finish date", () => {
    const base = { ...freshState(new Date(2026, 9, 28)), selections: [{ kind: "volume" as const, volume: "bookofmormon" }] };
    expect(evaluateBuilder(base).steps).toHaveLength(239);
    expect(resolvePace({ ...base, driver: "days", targetDays: 30 }, 239).chaptersPerDay).toBe(8);
    const finish = resolvePace({ ...base, driver: "finishBy", finishBy: "2026-11-06" }, 239);
    expect(finish.chaptersPerDay).toBe(24);
    expect(resolvePace({ ...base, driver: "finishBy", finishBy: "" }, 239).issue).toBe("Pick a finish date.");
    expect(resolvePace({ ...base, startDate: "nope" }, 239).issue).toBe("Pick a start date.");
  });

  it("narrows a book to a range and back to the whole book; volumes replace their books", () => {
    let selections = setBookRange([{ kind: "book", volume: "newtestament", book: "acts" }], "newtestament", "acts", 3, 9);
    expect(selections).toEqual([{ kind: "range", volume: "newtestament", book: "acts", from: 3, to: 9 }]);
    selections = setBookRange(selections, "newtestament", "acts", 1, 28);
    expect(selections).toEqual([{ kind: "book", volume: "newtestament", book: "acts" }]);
    expect(toggleVolume(selections, "newtestament")).toEqual([{ kind: "volume", volume: "newtestament" }]);
  });

  it("keeps at least one reading day, and filters content by faith tradition", () => {
    expect(toggleWeekday([true, false, false, false, false, false, false], 0)).toEqual([true, false, false, false, false, false, false]);
    expect(quickStartsFor(false).map((quickStart) => quickStart.id)).not.toContain("bom-30");
    expect(planVolumesFor(false)).toEqual(["oldtestament", "newtestament"]);
    expect(planVolumesFor(true)).toHaveLength(5);
  });

  it("shows the server's own validation message, never internals", () => {
    expect(planSaveMessage(new Error("[CONVEX M(readingPlans:createPlan)] [Request ID: 1] Server Error\nUncaught Error: Give the plan a title\n    at handler (x)"))).toBe("Give the plan a title");
    expect(planSaveMessage(new Error("[Request ID: 1] Server Error"))).toBe("Couldn't save the plan.");
  });
});
