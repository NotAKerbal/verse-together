// Continue reading as the website keeps it: signed out, this device's own last chapter; signed in, the account's
// (readingProgress:getLastPosition / setLastPosition, here testing/fakeStudyServer.ts through the provider's
// owner-scoped AccountCalls). Neither is ever written, shown or sent for the other. Not a device or a real account.

import { act, renderRouter, screen } from "expo-router/testing-library";
import { AccountCalls, publishAccountCalls, resetAccountCalls } from "../src/account/accountCalls";
import { accountStore, resetAccountStores } from "../src/storage/accountStudy";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { lastPosition, readerPreferences } from "../src/storage/preferences";
import { accountReadingPosition, recordReadingPosition, resetReadingPositions } from "../src/storage/readingPosition";
import { resetStudySession, setStudySession } from "../src/storage/studySession";
import { initDeviceStudy } from "../src/storage/study";
import { FakeStudyServer, flush } from "../testing/fakeStudyServer";

const ADA = "owner-A";
const BEA = "owner-B";
let server: FakeStudyServer;
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

/** The account shown, and (verified) its calls open; `connected: false` shows its cache with nothing sent. */
function showAccount(owner: string, { connected = true }: { connected?: boolean } = {}) {
  setStudySession({ mode: "account", owner, store: accountStore(owner), sync: null });
  closeCalls?.();
  closeCalls = connected ? publishAccountCalls(new AccountCalls(owner, server.client(owner))) : null;
}

function leaveAccount() {
  closeCalls?.();
  closeCalls = null;
  resetStudySession();
}

function continueLabel() {
  return screen.queryByTestId("card-continue-reading")?.props.accessibilityLabel ?? null;
}

beforeEach(() => {
  setStoragePort(memoryStorage());
  readerPreferences.reset();
  lastPosition.reset();
  resetAccountStores();
  resetAccountCalls();
  resetReadingPositions();
  initDeviceStudy();
  server = new FakeStudyServer();
  jest.useFakeTimers({ now: new Date(2026, 9, 28, 9, 0) });
});

afterEach(() => leaveAccount());

it("signed out, records and shows this device's own last chapter, and sends nothing", async () => {
  recordReadingPosition({ volume: "bookofmormon", book: "alma", chapter: 32 });
  expect(lastPosition.get()).toMatchObject({ volume: "bookofmormon", book: "alma", chapter: 32 });
  await renderRouter("./app", { initialUrl: "/browse" });
  await settle();
  expect(continueLabel()).toBe("Continue reading Alma 32");
  expect(server.calls).toEqual([]);
});

it("signed in, shows the account's position, never the device's, and the device's never changes", async () => {
  lastPosition.set({ volume: "oldtestament", book: "genesis", chapter: 1, at: "2026-10-01T00:00:00.000Z" });
  server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: 1 });
  showAccount(ADA);
  await renderRouter("./app", { initialUrl: "/browse" });
  await settle();
  expect(continueLabel()).toBe("Continue reading Moroni 10");

  await act(async () => recordReadingPosition({ volume: "bookofmormon", book: "ether", chapter: 12 }));
  await settle();
  expect(continueLabel()).toBe("Continue reading Ether 12");
  expect(server.positions.get(ADA)).toMatchObject({ volume: "bookofmormon", book: "ether", chapter: 12 });
  expect(lastPosition.get()).toMatchObject({ book: "genesis", chapter: 1 });

  await act(async () => leaveAccount());
  await settle();
  expect(continueLabel()).toBe("Continue reading Genesis 1");
});

it("an account with no position shows none, even when the device has one", async () => {
  lastPosition.set({ volume: "oldtestament", book: "genesis", chapter: 1, at: "2026-10-01T00:00:00.000Z" });
  showAccount(ADA);
  await renderRouter("./app", { initialUrl: "/browse" });
  await settle();
  expect(continueLabel()).toBeNull();
});

it("read offline, the chapter shows at once and reaches the account after reconnecting", async () => {
  showAccount(ADA);
  await act(async () => server.setOnline(false));
  recordReadingPosition({ volume: "newtestament", book: "john", chapter: 3 });
  await settle();
  expect(accountReadingPosition(ADA)).toMatchObject({ book: "john", chapter: 3 });
  expect(server.positions.has(ADA)).toBe(false);
  await act(async () => server.setOnline(true));
  await settle();
  expect(server.positions.get(ADA)).toMatchObject({ volume: "newtestament", book: "john", chapter: 3 });
});

it("one account's position never shows for another, nor while the account isn't known", async () => {
  server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: 1 });
  showAccount(ADA);
  await renderRouter("./app", { initialUrl: "/browse" });
  await settle();
  expect(continueLabel()).toBe("Continue reading Moroni 10");

  await act(async () => showAccount(BEA));
  await settle();
  expect(continueLabel()).toBeNull();
  expect(server.calls.filter((call) => call.owner === BEA)).toEqual([]);

  await act(async () => {
    closeCalls?.();
    closeCalls = null;
    setStudySession({ mode: "blocked", reason: "checking" });
  });
  recordReadingPosition({ volume: "bookofmormon", book: "alma", chapter: 1 });
  await settle();
  expect(continueLabel()).toBeNull();
  expect(lastPosition.get()).toBeNull();
  expect(accountReadingPosition(ADA)).toMatchObject({ book: "moroni" });
});

it("a cached account shown offline (not yet verified) sends nothing and keeps what it read for later", async () => {
  showAccount(ADA, { connected: false });
  recordReadingPosition({ volume: "bookofmormon", book: "alma", chapter: 5 });
  await settle();
  expect(server.calls).toEqual([]);
  expect(lastPosition.get()).toBeNull();
  // Verified again: the waiting chapter goes to this account (only).
  await act(async () => showAccount(ADA));
  await settle();
  expect(server.positions.get(ADA)).toMatchObject({ book: "alma", chapter: 5 });
});

it("after the app restarts offline, Continue reading shows the account's saved position, and only for it", async () => {
  server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: 1 });
  showAccount(ADA);
  await renderRouter("./app", { initialUrl: "/browse" });
  await settle();
  expect(continueLabel()).toBe("Continue reading Moroni 10");
  await act(async () => leaveAccount());
  // A new run: nothing in memory, the device's storage as it was; the session's account is known, not verified yet.
  resetReadingPositions();
  await act(async () => showAccount(ADA, { connected: false }));
  await settle();
  expect(continueLabel()).toBe("Continue reading Moroni 10");
  await act(async () => showAccount(BEA, { connected: false }));
  await settle();
  expect(continueLabel()).toBeNull();
});
