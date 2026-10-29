// Continue reading kept per account on the device (src/storage/readingPosition.ts), across real restarts of the app's
// modules: each "run" re-requires them (jest.resetModules) over the same device storage, as a cold start would, with
// testing/fakeStudyServer.ts as the account. Not a device or a real account; device and server clocks are set apart
// on purpose so "newer" is decided by the times given here.

import type { SyncClient } from "../src/account/studySync";
import type { StoragePort } from "../src/storage/kv";
import { FakeStudyServer, flush } from "../testing/fakeStudyServer";

const ADA = "owner-A";
const BEA = "owner-B";
const PREFIX = "vt_account_reading_position_v1:";
const DEVICE_NOW = Date.parse("2026-10-28T11:00:00.000Z");
const at = (iso: string) => Date.parse(iso);

type Port = StoragePort & { data: Map<string, string>; writes: string[]; failWrites: boolean };

function devicePort(): Port {
  const data = new Map<string, string>();
  const port: Port = {
    data,
    writes: [],
    failWrites: false,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (port.failWrites) throw new Error("disk full");
      port.writes.push(key);
      data.set(key, value);
    },
    removeItem: (key) => {
      if (port.failWrites) throw new Error("disk full");
      port.writes.push(key);
      data.delete(key);
    },
  };
  return port;
}

let port: Port;
let server: FakeStudyServer;
let run: { kill(): void } | null = null;

/** A client whose mutation replies wait until released (or fail when told to). */
function controlledClient(owner: string) {
  const base = server.client(owner);
  const held: Array<() => void> = [];
  const answers: Array<() => void> = [];
  const control = {
    hold: false,
    failNext: 0,
    /** Answers wait until `answer()`, as over a slow network. */
    holdAnswers: false,
    release: () => held.splice(0).forEach((resume) => resume()),
    answer: () => answers.splice(0).forEach((deliver) => deliver()),
  };
  const client: SyncClient = {
    ...base,
    watch(ref, args, onValue, onError) {
      return base.watch(ref, args, (value) => (control.holdAnswers ? answers.push(() => onValue(value)) : onValue(value)), onError);
    },
    query: base.query,
    connected: base.connected,
    onConnectionChange: base.onConnectionChange,
    mutation(ref, args) {
      if (control.failNext > 0) {
        control.failNext -= 1;
        return Promise.reject(new Error("Server error"));
      }
      if (!control.hold) return base.mutation(ref, args);
      return new Promise((resolve, reject) => held.push(() => void base.mutation(ref, args).then(resolve, reject)));
    },
  };
  return { client, control };
}

/** A new run of the app over the same device storage (a cold start): fresh modules, nothing in memory. */
function boot() {
  // The run before it is gone with its process: its subscriptions stop and nothing of it writes again.
  run?.kill();
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports -- Each run needs its own copy of the app's modules. */
  const kv = require("../src/storage/kv") as typeof import("../src/storage/kv");
  kv.setStoragePort(port);
  const calls = require("../src/account/accountCalls") as typeof import("../src/account/accountCalls");
  const session = require("../src/storage/studySession") as typeof import("../src/storage/studySession");
  const study = require("../src/storage/accountStudy") as typeof import("../src/storage/accountStudy");
  const prefs = require("../src/storage/preferences") as typeof import("../src/storage/preferences");
  const position = require("../src/storage/readingPosition") as typeof import("../src/storage/readingPosition");
  /* eslint-enable @typescript-eslint/no-require-imports */
  let close: (() => void) | null = null;
  const self = {
    position,
    prefs,
    /** The account shown; its verified calls open when `client` is given (else its cache shows, offline or checking). */
    show(owner: string, client?: SyncClient) {
      session.setStudySession({ mode: "account", owner, store: study.accountStore(owner), sync: null });
      close?.();
      close = client ? calls.publishAccountCalls(new calls.AccountCalls(owner, client)) : null;
    },
    online(owner: string) {
      self.show(owner, server.client(owner));
    },
    signOut(owner: string, options?: { keepPending?: boolean }) {
      close?.();
      close = null;
      session.setStudySession({ mode: "device" });
      return position.forgetAccountReadingPosition(owner, options);
    },
    kill() {
      calls.resetAccountCalls();
      close = null;
    },
    shown: (owner: string) => position.accountReadingPosition(owner),
    record: (book: string, chapter: number, when: string) => position.recordReadingPosition({ volume: "bookofmormon", book, chapter }, new Date(when)),
    session,
    calls,
    study,
  };
  run = self;
  return self;
}

async function settle() {
  await flush();
  jest.advanceTimersByTime(10);
  await flush();
}

const stored = (owner: string) => {
  const raw = port.data.get(PREFIX + owner);
  return raw ? JSON.parse(raw) : null;
};
const positionSends = (owner: string) => server.calls.filter((call) => call.owner === owner && call.name === "readingProgress:setLastPosition");

beforeEach(() => {
  port = devicePort();
  server = new FakeStudyServer();
  run = null;
  jest.useFakeTimers({ now: DEVICE_NOW });
});

afterEach(() => {
  run?.kill();
  run = null;
});

describe("a cold start", () => {
  it("shows the bound account's own saved position offline, and its offline chapter reaches it once verified", async () => {
    server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: at("2026-10-28T10:00:00Z") });
    let app = boot();
    app.online(ADA);
    await settle();
    expect(app.shown(ADA)).toMatchObject({ book: "moroni", chapter: 10 });

    // Offline after a restart, before the session is checked: the cache shows, nothing is sent.
    app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toMatchObject({ book: "moroni", chapter: 10 });
    app.record("alma", 32, "2026-10-28T11:05:00Z");
    await settle();
    expect(app.shown(ADA)).toMatchObject({ book: "alma", chapter: 32 });
    expect(stored(ADA).pending).toMatchObject({ book: "alma", chapter: 32 });
    expect(positionSends(ADA)).toEqual([]);

    // Killed, started again offline: the chapter read is still there, still waiting.
    app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toMatchObject({ book: "alma", chapter: 32 });

    // Verified: it's sent once, confirmed, and no longer waiting on the device.
    app.online(ADA);
    await settle();
    expect(positionSends(ADA)).toHaveLength(1);
    expect(server.positions.get(ADA)).toMatchObject({ book: "alma", chapter: 32 });
    expect(stored(ADA).pending).toBeNull();
    expect(stored(ADA).server).toMatchObject({ book: "alma", chapter: 32 });

    // And again after another restart: shown from the cache, nothing sent again.
    app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toMatchObject({ book: "alma", chapter: 32 });
    app.online(ADA);
    await settle();
    expect(positionSends(ADA)).toHaveLength(1);
  });

  it("the Continue reading hook shows the bound account's cached position after a restart", async () => {
    server.positions.set(ADA, { volume: "bookofmormon", book: "ether", chapter: 12, updatedAt: at("2026-10-28T10:00:00Z") });
    let app = boot();
    app.online(ADA);
    await settle();
    app = boot();
    app.show(ADA);
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- The renderer of this run's React (pure: no hooks of its own).
    const { renderHook } = require("@testing-library/react-native/pure") as typeof import("@testing-library/react-native/pure");
    const { result, unmount } = await renderHook(() => app.position.useContinueReadingPosition());
    expect(result.current).toMatchObject({ volume: "bookofmormon", book: "ether", chapter: 12 });
    await unmount();
  });

  it("an account never sees another's position, nor the device's, and the device never sees an account's", async () => {
    let app = boot();
    app.prefs.lastPosition.set({ volume: "oldtestament", book: "genesis", chapter: 1, at: "2026-10-01T00:00:00.000Z" });
    server.positions.set(BEA, { volume: "bookofmormon", book: "mosiah", chapter: 2, updatedAt: at("2026-10-28T10:00:00Z") });
    app.online(BEA);
    await settle();
    app.show(ADA);
    app.record("alma", 5, "2026-10-28T11:01:00Z");

    app = boot();
    app.online(BEA);
    await settle();
    expect(app.shown(BEA)).toMatchObject({ book: "mosiah", chapter: 2 });
    // A's waiting chapter is never sent through B's calls, nor shown for B.
    expect(server.calls.filter((call) => call.name === "readingProgress:setLastPosition")).toEqual([]);
    expect(stored(ADA).pending).toMatchObject({ book: "alma", chapter: 5 });
    expect(app.prefs.lastPosition.get()).toMatchObject({ book: "genesis" });

    app.session.setStudySession({ mode: "blocked", reason: "checking" });
    app.record("helaman", 5, "2026-10-28T11:02:00Z");
    expect(stored(ADA).pending).toMatchObject({ book: "alma" });
    expect(stored(BEA).pending).toBeNull();

    app.session.setStudySession({ mode: "device" });
    app.record("ether", 3, "2026-10-28T11:03:00Z");
    expect(app.prefs.lastPosition.get()).toMatchObject({ book: "ether", chapter: 3 });
    expect(stored(ADA).pending).toMatchObject({ book: "alma" });

    // A, verified: only its own chapter goes, through its own calls.
    app.online(ADA);
    await settle();
    expect(positionSends(ADA)).toEqual([expect.objectContaining({ args: expect.objectContaining({ book: "alma", chapter: 5 }) })]);
    expect(positionSends(BEA)).toEqual([]);
  });
});

describe("reconciling with the account", () => {
  async function waitingAfterRestart() {
    server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: at("2026-10-28T10:00:00Z") });
    let app = boot();
    app.online(ADA);
    await settle();
    app = boot();
    app.show(ADA);
    app.record("alma", 32, "2026-10-28T11:00:00Z");
    return boot();
  }

  it("an older answer never replaces a newer chapter waiting here", async () => {
    await waitingAfterRestart();
    // Read on the website after the account's last answer here, but before this chapter.
    server.positions.set(ADA, { volume: "bookofmormon", book: "ether", chapter: 12, updatedAt: at("2026-10-28T10:30:00Z") });
    const app = boot();
    app.online(ADA);
    await settle();
    expect(app.shown(ADA)).toMatchObject({ book: "alma", chapter: 32 });
    expect(server.positions.get(ADA)).toMatchObject({ book: "alma", chapter: 32 });
    expect(stored(ADA).pending).toBeNull();
  });

  it("a position set elsewhere after the chapter waiting here wins, and the old chapter is never sent", async () => {
    await waitingAfterRestart();
    server.positions.set(ADA, { volume: "bookofmormon", book: "ether", chapter: 12, updatedAt: at("2026-10-28T11:30:00Z") });
    const app = boot();
    const { client, control } = controlledClient(ADA);
    control.holdAnswers = true;
    app.show(ADA, client);
    // Connected, shown again, reconnected: still nothing goes before the account has answered.
    app.show(ADA, client);
    server.setOnline(false);
    server.setOnline(true);
    await settle();
    expect(positionSends(ADA)).toEqual([]);
    expect(app.shown(ADA)).toMatchObject({ book: "alma", chapter: 32 });
    control.answer();
    await settle();
    expect(app.shown(ADA)).toMatchObject({ book: "ether", chapter: 12 });
    expect(positionSends(ADA)).toEqual([]);
    expect(stored(ADA)).toMatchObject({ pending: null, server: { book: "ether", chapter: 12 } });
  });

  it("the same answer again writes nothing; one chapter read online costs one write and its confirmation one more", async () => {
    const app = boot();
    app.online(ADA);
    await settle();
    port.writes = [];
    server.changed();
    server.changed();
    await settle();
    expect(port.writes).toEqual([]);
    app.record("alma", 1, "2026-10-28T11:00:00Z");
    await settle();
    expect(port.writes).toHaveLength(2);
    expect(stored(ADA)).toMatchObject({ pending: null, server: { book: "alma", chapter: 1 } });
    server.changed();
    await settle();
    expect(port.writes).toHaveLength(2);
  });

  it("a send that fails stays waiting, across a restart, and goes on reconnecting; then it's removed", async () => {
    let app = boot();
    const first = controlledClient(ADA);
    first.control.failNext = 1;
    app.show(ADA, first.client);
    await settle();
    app.record("alma", 7, "2026-10-28T11:00:00Z");
    await settle();
    expect(stored(ADA).pending).toMatchObject({ book: "alma", chapter: 7 });

    app = boot();
    const second = controlledClient(ADA);
    second.control.failNext = 1;
    app.show(ADA, second.client);
    await settle();
    expect(stored(ADA).pending).toMatchObject({ book: "alma", chapter: 7 });
    server.setOnline(false);
    server.setOnline(true);
    await settle();
    expect(server.positions.get(ADA)).toMatchObject({ book: "alma", chapter: 7 });
    expect(stored(ADA).pending).toBeNull();
  });

  it("a confirmation for a chapter replaced meanwhile leaves the newer one waiting", async () => {
    const app = boot();
    const { client, control } = controlledClient(ADA);
    control.hold = true;
    app.show(ADA, client);
    await settle();
    app.record("alma", 1, "2026-10-28T11:00:00Z");
    app.record("alma", 2, "2026-10-28T11:01:00Z");
    control.hold = false;
    control.release();
    await settle();
    expect(app.shown(ADA)).toMatchObject({ chapter: 2 });
    // The second goes too, once asked again (a reconnect); the first's confirmation didn't drop it.
    server.setOnline(false);
    server.setOnline(true);
    await settle();
    expect(server.positions.get(ADA)).toMatchObject({ chapter: 2 });
    expect(stored(ADA).pending).toBeNull();
  });
});

describe("signing out", () => {
  it("forgets the account's position on the device, so a restart shows nothing for it", async () => {
    server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: at("2026-10-28T10:00:00Z") });
    let app = boot();
    app.online(ADA);
    await settle();
    app.show(ADA);
    app.record("alma", 5, "2026-10-28T11:00:00Z");
    expect(app.signOut(ADA)).toBe(true);
    expect(port.data.has(PREFIX + ADA)).toBe(false);
    app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toBeNull();
  });

  it("with keepPending, keeps only the chapter the account hasn't received, sent if it signs in again", async () => {
    server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: at("2026-10-28T10:00:00Z") });
    let app = boot();
    app.online(ADA);
    await settle();
    app.show(ADA);
    app.record("alma", 5, "2026-10-28T11:00:00Z");
    expect(app.signOut(ADA, { keepPending: true })).toBe(true);
    expect(stored(ADA)).toEqual({ v: 1, pending: expect.objectContaining({ book: "alma", chapter: 5 }) });
    app = boot();
    app.online(ADA);
    await settle();
    expect(server.positions.get(ADA)).toMatchObject({ book: "alma", chapter: 5 });
  });

  it("a confirmation or answer arriving after the account was forgotten restores nothing", async () => {
    const app = boot();
    const { client, control } = controlledClient(ADA);
    control.hold = true;
    app.show(ADA, client);
    await settle();
    app.record("alma", 9, "2026-10-28T11:00:00Z");
    // Forgotten while its calls are still open (the worst case): the late reply and a late answer both arrive.
    app.session.setStudySession({ mode: "device" });
    expect(app.position.forgetAccountReadingPosition(ADA)).toBe(true);
    control.release();
    server.positions.set(ADA, { volume: "bookofmormon", book: "ether", chapter: 1, updatedAt: at("2026-10-28T12:30:00Z") });
    server.changed();
    await settle();
    expect(port.data.has(PREFIX + ADA)).toBe(false);
    // A different account shown with those calls still open takes nothing of A's.
    app.session.setStudySession({ mode: "account", owner: BEA, store: app.study.accountStore(BEA), sync: null });
    server.changed();
    await settle();
    expect(port.data.has(PREFIX + BEA)).toBe(false);
    expect(app.shown(BEA)).toBeNull();
  });
});

describe("storage that refuses or holds nonsense", () => {
  it("a chapter the device refused to keep isn't reported saved, still shows and is sent, and isn't there after a restart", async () => {
    let app = boot();
    app.online(ADA);
    await settle();
    port.failWrites = true;
    expect(() => app.record("alma", 3, "2026-10-28T11:00:00Z")).toThrow(app.position.POSITION_NOT_SAVED_MESSAGE);
    expect(app.shown(ADA)).toMatchObject({ book: "alma", chapter: 3 });
    await settle();
    expect(server.positions.get(ADA)).toMatchObject({ book: "alma", chapter: 3 });
    // The device still holds only what it held before: the account's earlier answer (none).
    expect(stored(ADA)).toEqual({ v: 1, server: null, pending: null });

    port.failWrites = false;
    app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toBeNull();
  });

  it("a confirmation the device refused to keep leaves the chapter waiting there, until the account's answer confirms it after a restart", async () => {
    let app = boot();
    const { client, control } = controlledClient(ADA);
    control.hold = true;
    app.show(ADA, client);
    await settle();
    app.record("alma", 4, "2026-10-28T11:00:00Z");
    port.failWrites = true;
    control.release();
    await settle();
    port.failWrites = false;
    expect(stored(ADA).pending).toMatchObject({ book: "alma", chapter: 4 });
    app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toMatchObject({ book: "alma", chapter: 4 });
    app.online(ADA);
    await settle();
    // The account already holds it: nothing is sent again.
    expect(positionSends(ADA)).toHaveLength(1);
    expect(stored(ADA)).toMatchObject({ pending: null, server: { book: "alma", chapter: 4 } });
  });

  it("signing out when the device refuses reports it, and forgets the account in memory anyway", async () => {
    const app = boot();
    app.online(ADA);
    app.record("alma", 6, "2026-10-28T11:00:00Z");
    await settle();
    port.failWrites = true;
    expect(app.signOut(ADA)).toBe(false);
    port.failWrites = false;
    app.session.setStudySession({ mode: "blocked", reason: "checking" });
    expect(app.position.accountReadingPosition(BEA)).toBeNull();
  });

  it.each([
    ["unreadable JSON", "{not json"],
    ["another version", JSON.stringify({ v: 2, pending: { volume: "bookofmormon", book: "alma", chapter: 1, at: "2026-10-28T11:00:00Z" } })],
    ["a bad chapter", JSON.stringify({ v: 1, server: { volume: "bookofmormon", book: "alma", chapter: -1, updatedAt: 1 }, pending: null })],
    ["an empty book", JSON.stringify({ v: 1, server: { volume: "bookofmormon", book: "", chapter: 1, updatedAt: 1 }, pending: null })],
    ["a waiting chapter without a time", JSON.stringify({ v: 1, pending: { volume: "bookofmormon", book: "alma", chapter: 1, at: "soon" } })],
    ["a non-object", JSON.stringify([1, 2, 3])],
  ])("ignores %s, and the next write replaces it", async (_label, raw) => {
    port.data.set(PREFIX + ADA, raw);
    const app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toBeNull();
    app.record("alma", 8, "2026-10-28T11:00:00Z");
    expect(stored(ADA)).toEqual({ v: 1, pending: { volume: "bookofmormon", book: "alma", chapter: 8, at: "2026-10-28T11:00:00.000Z", after: null } });
  });

  it("keeps the valid half of a partly damaged record", () => {
    port.data.set(
      PREFIX + ADA,
      JSON.stringify({ v: 1, server: { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: "yesterday" }, pending: { volume: 3, book: "alma", chapter: 1, at: "2026-10-28T11:00:00Z" } }),
    );
    const app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toMatchObject({ book: "moroni", chapter: 10 });
  });

  it("a finite timestamp outside the Date range cannot crash Continue reading", () => {
    port.data.set(PREFIX + ADA, JSON.stringify({ v: 1, server: { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: Number.MAX_VALUE }, pending: null }));
    const app = boot();
    app.show(ADA);
    expect(app.shown(ADA)).toMatchObject({ book: "moroni", chapter: 10, at: "1970-01-01T00:00:00.000Z" });
  });

  it("an answer that isn't a position changes nothing", async () => {
    server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: 10, updatedAt: at("2026-10-28T10:00:00Z") });
    const app = boot();
    app.online(ADA);
    await settle();
    server.positions.set(ADA, { volume: "bookofmormon", book: "moroni", chapter: Number.NaN, updatedAt: at("2026-10-28T10:10:00Z") });
    server.changed();
    await settle();
    expect(app.shown(ADA)).toMatchObject({ book: "moroni", chapter: 10 });
  });
});
