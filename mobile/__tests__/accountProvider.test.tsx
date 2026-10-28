// Settings → Account through the real AccountProvider, SessionWatcher, @convex-dev/better-auth's provider and
// Convex's React hooks. Better Auth's client and the Convex client are fakes over one in-memory "server" that keeps
// sessions per token and checks the import owner as convex/insights.ts does; the browser fake returns the way the
// site's Google callback does (a one-time code for the attempt), and the HTTPS exchange fake redeems it only with the
// verifier behind the challenge sent at sign-in. Account deletion follows convex/accountDeletion.ts: starting it
// removes the app user and records the deletion in one step, after which the viewer is null, provisioning is refused,
// and accountDeletion:pending and users:accountStatus tell that owner (only) there is a deletion to finish. The fake
// Convex client can hold back one query's updates, to deliver them in a different order. Real Google and a real
// deployment are not exercised here.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createHash, randomBytes } from "crypto";
import { getFunctionName } from "convex/server";
import { useSyncExternalStore } from "react";
import { Alert } from "react-native";
import { AccountProvider, type AccountRuntime } from "../src/account/AccountProvider";
import { AccountSection } from "../src/account/AccountSection";
import { COOKIE_KEY, cookieJar, hasStoredSession, type NativeAuthClient } from "../src/account/client";
import { readLedger } from "../src/account/guestCopy";
import { EXCHANGE_PATH, resetSignInState } from "../src/account/googleSignIn";
import { annotationChapter } from "../src/shared/web";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { ThemeProvider } from "../src/theme/theme";
import { ACCOUNT_CACHE_PREFIX, ACCOUNT_OUTBOX_PREFIX, LAST_OWNER_KEY, resetAccountStores } from "../src/storage/accountStudy";
import { getStudySession, resetStudySession, subscribeStudySession } from "../src/storage/studySession";
import { sha256Hex } from "../src/account/sessionBinding";
import { memorySecureStore } from "../testing/secureStore";

type User = { id: string; owner: string; email: string; name: string };
const ADA: User = { id: "auth-A", owner: "owner-A", email: "ada@example.com", name: "Ada" };
const BEA: User = { id: "auth-B", owner: "owner-B", email: "bea@example.com", name: "Bea" };

class FakeServer {
  sessions = new Map<string, { user: User; createdAt: number }>();
  reachable = true;
  nextUser: User = ADA;
  freshDeletes = true;
  deleted = new Set<string>();
  /** Deletions that stopped partway, by Better Auth user id. */
  deletions = new Map<string, { appUserId: string; startedAt: number }>();
  /** The next deletion records itself, then the connection drops before it finishes. */
  interruptDelete = false;
  provisionCalls: string[] = [];
  imports: Array<{ name: string; owner: string; id: string }> = [];
  clients = new Set<{ notify(): void }>();
  /** One-time codes from the site's Google callback, and each attempt's S256 challenge from /sign-in/social. */
  codes = new Map<string, { attempt: string; token: string }>();
  challenges = new Map<string, string>();
  /** Queries whose updates are held back (their last result keeps being served) until released. */
  held = new Map<string, unknown>();
  private count = 0;
  issue(user: User) {
    const token = `tok-${user.owner}-${++this.count}`;
    this.sessions.set(token, { user, createdAt: Date.now() });
    return token;
  }
  changed() {
    this.clients.forEach((client) => client.notify());
  }
  /** Redeems a code as convex/nativeSignInPlugin.ts does: once, for its attempt, with the verifier behind its challenge. */
  fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!this.reachable) throw new TypeError("Network request failed");
    const url = String(input);
    if (url.endsWith("/sign-out")) {
      const token = /better-auth\.session_token=([^;]+)/.exec(String((init?.headers as Record<string, string>).cookie))?.[1];
      if (token) this.sessions.delete(token);
      return new Response("{}", { status: 200 });
    }
    if (!url.endsWith(EXCHANGE_PATH)) throw new Error(`Unexpected request ${url}`);
    const body = JSON.parse(String(init?.body)) as { attempt: string; code: string; verifier: string };
    const entry = this.codes.get(body.code);
    const proof = createHash("sha256").update(body.verifier).digest("base64url");
    if (!entry || entry.attempt !== body.attempt || this.challenges.get(body.attempt) !== proof) return new Response("{}", { status: 401 });
    this.codes.delete(body.code);
    const cookie = `better-auth.session_token=${entry.token}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`;
    return new Response(JSON.stringify({ cookie }), { status: 200 });
  }) as typeof fetch;
}

const testCrypto = {
  randomToken: () => randomBytes(32).toString("base64url"),
  s256: async (verifier: string) => createHash("sha256").update(verifier).digest("base64url"),
};

function tokenIn(storage: ReturnType<typeof memorySecureStore>): string | null {
  const raw = cookieJar(storage).read();
  if (!raw) return null;
  const jar = JSON.parse(raw) as Record<string, { value: string }>;
  return jar["better-auth.session_token"]?.value ?? null;
}

function fakeAuthClient(server: FakeServer, storage: ReturnType<typeof memorySecureStore>) {
  type State = { data: unknown; error: { status?: number } | null; isPending: boolean };
  let state: State = { data: null, error: null, isPending: true };
  const listeners = new Set<() => void>();
  const set = (next: Partial<State>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const fetchSession = async () => {
    if (!server.reachable) throw new TypeError("Network request failed");
    const token = tokenIn(storage);
    const session = token ? server.sessions.get(token) : undefined;
    return session ? { user: { id: session.user.id, email: session.user.email, name: session.user.name }, session: { id: token, createdAt: session.createdAt } } : null;
  };
  let lastCallback = "";
  const client = {
    useSession: () =>
      useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => state,
      ),
    getSession: async () => {
      try {
        const data = await fetchSession();
        set({ data, error: null, isPending: false });
        return { data, error: null };
      } catch {
        set({ error: { status: 0 }, isPending: false });
        return { data: null, error: { status: 0 } };
      }
    },
    signIn: {
      social: async (body: { callbackURL: string; additionalData: { nativeSignIn: { challenge: string } } }) => {
        if (!server.reachable) throw new TypeError("Network request failed");
        lastCallback = body.callbackURL;
        const attempt = new URL(lastCallback.replace("versetogether://", "https://app/")).searchParams.get("attempt")!;
        server.challenges.set(attempt, body.additionalData.nativeSignIn.challenge);
        return { data: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=s", redirect: false }, error: null };
      },
    },
    signOut: async () => {
      const token = tokenIn(storage);
      await cookieJar(storage).clear();
      set({ data: null, error: null, isPending: false });
      if (!server.reachable) throw new TypeError("Network request failed");
      if (token) server.sessions.delete(token);
      return { data: { success: true }, error: null };
    },
    deleteUser: async () => {
      if (!server.reachable) throw new TypeError("Network request failed");
      const token = tokenIn(storage);
      const session = token ? server.sessions.get(token) : undefined;
      if (!session) return { data: null, error: { status: 401 } };
      if (!server.freshDeletes) return { data: null, error: { status: 400, code: "SESSION_EXPIRED" } };
      // Begin: the app user goes and the deletion is recorded, together.
      if (!server.deletions.has(session.user.id)) server.deletions.set(session.user.id, { appUserId: session.user.owner, startedAt: Date.now() });
      server.changed();
      if (server.interruptDelete) {
        server.interruptDelete = false;
        throw new TypeError("Network request failed");
      }
      server.deleted.add(session.user.owner);
      server.deletions.delete(session.user.id);
      for (const [key, value] of server.sessions) if (value.user.id === session.user.id) server.sessions.delete(key);
      server.changed();
      return { data: { success: true, message: "User deleted" }, error: null };
    },
    convex: {
      token: async () => {
        const token = tokenIn(storage);
        return { data: token && server.sessions.has(token) ? { token: `jwt:${token}` } : null, error: null };
      },
    },
    $store: {
      notify: () => {
        void client.getSession();
      },
    },
  };
  const browser = {
    openAuthSessionAsync: jest.fn(async () => {
      if (server.nextUser === null) return { type: "cancel" };
      const token = server.issue(server.nextUser);
      const attempt = new URL(lastCallback.replace("versetogether://", "https://app/")).searchParams.get("attempt")!;
      const code = randomBytes(32).toString("base64url");
      server.codes.set(code, { attempt, token });
      return { type: "success", url: `versetogether://auth-callback?${new URLSearchParams({ attempt, code })}` };
    }),
  };
  return { client, browser };
}

class FakeConvex {
  token: string | null = null;
  closed = false;
  private watches = new Set<() => void>();
  private viewers = new Map<string, object>();
  constructor(private server: FakeServer) {
    server.clients.add(this);
  }
  private user(): User | null {
    const token = this.token?.replace(/^jwt:/, "");
    return (token && this.server.sessions.get(token)?.user) || null;
  }
  private viewer(user: User) {
    if (!this.viewers.has(user.owner)) {
      this.viewers.set(user.owner, { appUserId: user.owner, isAdmin: false, displayName: user.name, avatarUrl: null, legacyAccount: false });
    }
    return this.viewers.get(user.owner)!;
  }
  /** Like the real client, calls wait while a new token is being fetched. */
  private ready: Promise<void> = Promise.resolve();
  setAuth(fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>, onChange: (authenticated: boolean) => void) {
    this.ready = fetchToken({ forceRefreshToken: false }).then((token) => {
      this.token = token;
      onChange(!!token && !!this.user());
      this.notify();
    });
  }
  clearAuth() {
    this.token = null;
    this.notify();
  }
  notify() {
    this.watches.forEach((listener) => listener());
  }
  watchQuery(query: Parameters<typeof getFunctionName>[0]) {
    return {
      onUpdate: (listener: () => void) => {
        this.watches.add(listener);
        return () => this.watches.delete(listener);
      },
      localQueryResult: () => {
        const name = getFunctionName(query);
        if (this.server.held.has(name)) return this.server.held.get(name);
        return this.result(name);
      },
      journal: () => undefined,
    };
  }
  result(name: string): unknown {
    const user = this.user();
    const deletion = user ? (this.server.deletions.get(user.id) ?? null) : null;
    if (name === "accountDeletion:pending") return deletion;
    const viewer = user && !deletion ? this.viewer(user) : null;
    if (name === "users:viewer") return viewer;
    if (name === "users:accountStatus") return user ? { viewer, deletion } : null;
    return undefined;
  }
  async mutation(ref: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) {
    await this.ready;
    const name = getFunctionName(ref);
    const user = this.user();
    if (!user) throw new Error("Unauthorized");
    if (name === "users:ensureCurrentUser") {
      this.server.provisionCalls.push(user.id);
      if (this.server.deletions.has(user.id)) throw new Error("This account is being deleted. Delete it again to finish.");
      return this.viewer(user);
    }
    if (this.server.deletions.has(user.id)) throw new Error("Unauthorized");
    const expected = (args.expectedOwner ?? args.deviceImportOwner) as string;
    if (expected !== user.owner) throw new Error("The signed-in account changed before import");
    this.server.imports.push({ name, owner: user.owner, id: String(args.deviceId ?? args.deviceImportId) });
    return { id: "row" };
  }
  connectionState() {
    return { isWebSocketConnected: this.server.reachable };
  }
  async close() {
    this.closed = true;
    this.server.clients.delete(this);
  }
}

/** Renders Settings → Account over `server` and `storage`, as the app does at launch. */
async function mount(server: FakeServer, storage: ReturnType<typeof memorySecureStore>) {
  const { client, browser } = fakeAuthClient(server, storage);
  const convexClients: FakeConvex[] = [];
  const runtime = {
    config: { siteOrigin: "https://www.versetogether.org", authBaseURL: "https://www.versetogether.org/api/auth", convexUrl: "https://x.convex.cloud" },
    authClient: client as unknown as NativeAuthClient,
    storage,
    browser,
    crypto: testCrypto,
    fetch: server.fetch,
    createConvexClient: () => {
      const next = new FakeConvex(server);
      convexClients.push(next);
      return next as unknown as ReturnType<AccountRuntime["createConvexClient"]>;
    },
  } satisfies AccountRuntime;
  const getSession = jest.spyOn(client, "getSession");
  const view = await render(
    <ThemeProvider scheme="light">
      <AccountProvider runtime={runtime}>
        <AccountSection />
      </AccountProvider>
    </ThemeProvider>,
  );
  return { server, storage, convexClients, getSession, browser, client, unmount: view.unmount };
}

async function setup({ storedToken }: { storedToken?: string } = {}) {
  const server = new FakeServer();
  const storage = memorySecureStore();
  if (storedToken) storage.setItem(COOKIE_KEY, JSON.stringify({ "better-auth.session_token": { value: storedToken, expires: null } }));
  return mount(server, storage);
}

let port: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  resetSignInState();
  resetAccountStores();
  resetStudySession();
  port = memoryStorage();
  setStoragePort(port);
  initDeviceStudy();
  deviceStudy.createNote({ requestId: "note-1", markdownBody: "Faith", journalDate: "2026-10-27" });
  deviceStudy.createNote({ requestId: "note-2", markdownBody: "Hope", journalDate: "2026-10-28" });
  deviceStudy.setVerseMarks(annotationChapter("bookofmormon", "alma", 32), [21], { highlightColor: "yellow" });
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style === "destructive")?.onPress?.();
  });
});

afterEach(() => jest.restoreAllMocks());

describe("Settings → Account", () => {
  it("signed out, nothing reaches the network until the reader chooses to sign in", async () => {
    const { convexClients, getSession } = await setup();
    expect(await screen.findByText("Continue with Google")).toBeTruthy();
    expect(screen.getByText(/Nothing is uploaded unless you choose to copy it/)).toBeTruthy();
    expect(convexClients).toHaveLength(0);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("signs in, copies only when asked, signs out, and never offers one account's copy to another", async () => {
    const { server, storage, convexClients } = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    // Signing in uploads nothing by itself.
    expect(server.imports).toEqual([]);
    expect(screen.getByText(/3 journal entries, notes and marks aren’t in your account yet/)).toBeTruthy();

    fireEvent.press(screen.getByText("Copy to my account"));
    expect(await screen.findByText("Copied 3 items to your account. They're still on this device too.")).toBeTruthy();
    expect(server.imports.map((row) => row.owner)).toEqual(["owner-A", "owner-A", "owner-A"]);
    expect(deviceStudy.getSnapshot().notes).toHaveLength(2);

    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText("Continue with Google")).toBeTruthy();
    expect(screen.getByText("Signed out. Your study on this device is still here.")).toBeTruthy();
    expect(hasStoredSession(storage)).toBe(false);
    expect(convexClients[0].closed).toBe(true);
    expect(server.sessions.size).toBe(0);

    // Another account on the same device: a fresh Convex client, and nothing of the first account's offered.
    server.nextUser = BEA;
    fireEvent.press(screen.getByText("Continue with Google"));
    expect(await screen.findByText("Bea")).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(convexClients).toHaveLength(2);
    expect(screen.getByText("3 items were copied to a different account and won't be copied to this one.")).toBeTruthy();
    expect(screen.queryByText("Copy to my account")).toBeNull();
    expect(server.imports.filter((row) => row.owner === "owner-B")).toEqual([]);
  });

  it("a cancelled sign-in changes nothing", async () => {
    const { server, storage } = await setup();
    server.nextUser = null as unknown as User;
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Sign-in was cancelled. Nothing changed.")).toBeTruthy();
    expect(hasStoredSession(storage)).toBe(false);
  });

  it("a saved session the server no longer knows is signed out, keeping the device's study", async () => {
    const { storage } = await setup({ storedToken: "tok-revoked" });
    expect(await screen.findByText(/Your session ended\. Sign in again/)).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(hasStoredSession(storage)).toBe(false);
    expect(deviceStudy.getSnapshot().notes).toHaveLength(2);
  });

  it("offline with a saved session: says so, keeps it, and recovers on Try again", async () => {
    const server = new FakeServer();
    const token = server.issue(ADA);
    // Rebuild with this server's session stored and the network down.
    const view = await setupWith(server, token);
    expect(await screen.findByText(/can’t be reached right now/)).toBeTruthy();
    expect(hasStoredSession(view.storage)).toBe(true);
    server.reachable = true;
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Ada")).toBeTruthy();
  });

  it("signing in again with another Google account switches everything to that account", async () => {
    const { server } = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    server.freshDeletes = false;
    fireEvent.press(screen.getByText("Delete my account"));
    server.nextUser = BEA;
    fireEvent.press(await screen.findByText("Sign in with Google again"));
    expect(await screen.findByText("Bea")).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    fireEvent.press(screen.getByText("Copy to my account"));
    await screen.findByText(/Copied 3 items/);
    expect(server.imports.map((row) => row.owner)).toEqual(["owner-B", "owner-B", "owner-B"]);
  });

  it("deletes the account after confirmation, asking to sign in again when the session isn't fresh", async () => {
    const { server, storage } = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    fireEvent.press(screen.getByText("Copy to my account"));
    await screen.findByText(/Copied 3 items/);

    server.freshDeletes = false;
    fireEvent.press(screen.getByText("Delete my account"));
    expect(await screen.findByText("For your security, sign in with Google again, then delete your account.")).toBeTruthy();
    expect(server.deleted.size).toBe(0);
    fireEvent.press(screen.getByText("Sign in with Google again"));
    // The fresh session is checked again before the account shows.
    await waitFor(() => expect(screen.queryByText("Sign in with Google again")).toBeNull());
    expect(await screen.findByText("Ada")).toBeTruthy();

    server.freshDeletes = true;
    fireEvent.press(await screen.findByText("Delete my account"));
    expect(await screen.findByText(/Your Verse Together account and the study saved in it were deleted/)).toBeTruthy();
    expect([...server.deleted]).toEqual(["owner-A"]);
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(hasStoredSession(storage)).toBe(false);
    // The device's study is untouched, and may be copied to an account again.
    expect(deviceStudy.getSnapshot().notes).toHaveLength(2);
    expect(Object.keys(readLedger(port).records)).toEqual([]);
  });
});

describe("Settings → Account: deletion that stopped partway", () => {
  it("is offered to finish after a dropped connection, a restart, and signing in again, and never provisions the account", async () => {
    const first = await setup();
    const { server, storage } = first;
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    fireEvent.press(screen.getByText("Copy to my account"));
    await screen.findByText(/Copied 3 items/);

    // The server removes the app user and records the deletion, then the connection drops.
    server.interruptDelete = true;
    fireEvent.press(screen.getByText("Delete my account"));
    expect(await screen.findByText("Finish deleting my account")).toBeTruthy();
    expect(screen.getByText(/Deleting the Verse Together account for ada@example\.com didn’t finish/)).toBeTruthy();
    expect(screen.queryByText("Copy to my account")).toBeNull();
    expect(server.deleted.size).toBe(0);
    // Still signed in to finish it: the session isn't forgotten as if it had ended.
    expect(hasStoredSession(storage)).toBe(true);

    // The app is stopped and started again.
    await first.unmount();
    const provisioned = server.provisionCalls.length;
    await mount(server, storage);
    expect(await screen.findByText("Finish deleting my account")).toBeTruthy();

    // Another account on this device isn't affected.
    fireEvent.press(screen.getByText("Sign out"));
    server.nextUser = BEA;
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Bea")).toBeTruthy();
    expect(screen.queryByText("Finish deleting my account")).toBeNull();

    // Signing in again as the owner: still being deleted.
    fireEvent.press(screen.getByText("Sign out"));
    server.nextUser = ADA;
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Finish deleting my account")).toBeTruthy();
    // Only Bea was provisioned meanwhile; the account being deleted never was.
    expect(server.provisionCalls.slice(provisioned)).toEqual(["auth-B"]);

    // Finishing it needs a fresh sign-in, like starting it.
    server.freshDeletes = false;
    fireEvent.press(screen.getByText("Finish deleting my account"));
    fireEvent.press(await screen.findByText("Sign in with Google again"));
    await waitFor(() => expect(screen.queryByText("Sign in with Google again")).toBeNull());
    server.freshDeletes = true;
    fireEvent.press(await screen.findByText("Finish deleting my account"));
    expect(await screen.findByText(/Your Verse Together account and the study saved in it were deleted/)).toBeTruthy();
    expect([...server.deleted]).toEqual(["owner-A"]);
    expect(server.deletions.size).toBe(0);
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(hasStoredSession(storage)).toBe(false);
    // The device's study stays, and Ada's copies of it are released.
    expect(deviceStudy.getSnapshot().notes).toHaveLength(2);
    expect(Object.keys(readLedger(port).records)).toEqual([]);
  });
});

describe("Settings → Account: a deletion's start delivered out of order", () => {
  async function signedInAsAda() {
    const view = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    return view;
  }

  it("the viewer disappearing before the pending deletion arrives keeps the session, and offers to finish", async () => {
    const { server, storage } = await signedInAsAda();
    // accountDeletion:pending lags: it keeps saying "nothing pending" while users:viewer already reports no app user.
    server.held.set("accountDeletion:pending", null);
    server.interruptDelete = true;
    fireEvent.press(screen.getByText("Delete my account"));
    expect(await screen.findByText("Finish deleting my account")).toBeTruthy();
    // Not taken for a session that ended elsewhere.
    expect(screen.queryByText(/Your session ended/)).toBeNull();
    expect(hasStoredSession(storage)).toBe(true);
    server.held.delete("accountDeletion:pending");
    await act(async () => server.changed());
    expect(screen.getByText("Finish deleting my account")).toBeTruthy();
    expect(hasStoredSession(storage)).toBe(true);
    // Never provisioned again while it is being deleted.
    expect(server.provisionCalls).toEqual(["auth-A"]);
  });

  it("the pending deletion arriving before the account status changes shows the same", async () => {
    const { server, storage } = await signedInAsAda();
    server.held.set("users:accountStatus", { viewer: { appUserId: "owner-A", isAdmin: false, displayName: "Ada", avatarUrl: null, legacyAccount: false }, deletion: null });
    server.interruptDelete = true;
    fireEvent.press(screen.getByText("Delete my account"));
    expect(await screen.findByText("Finish deleting my account")).toBeTruthy();
    server.held.delete("users:accountStatus");
    await act(async () => server.changed());
    expect(screen.getByText("Finish deleting my account")).toBeTruthy();
    expect(hasStoredSession(storage)).toBe(true);
  });

  it("a session whose account is gone with no deletion pending is still signed out", async () => {
    const { server, storage } = await signedInAsAda();
    // Deleted elsewhere and finished: no app user, no deletion record, the session revoked.
    server.deleted.add("owner-A");
    server.sessions.clear();
    await act(async () => server.changed());
    expect(await screen.findByText(/Your session ended\. Sign in again/)).toBeTruthy();
    expect(hasStoredSession(storage)).toBe(false);
  });
});

describe("Settings → Account: pending sign-in and sign-out", () => {
  it("signing out while signing in again ignores that sign-in's return when it arrives", async () => {
    const { server, storage, browser } = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    server.freshDeletes = false;
    fireEvent.press(screen.getByText("Delete my account"));

    // The browser stays open; its (valid) return is released only after signing out.
    const finish = browser.openAuthSessionAsync.getMockImplementation()!;
    let release: (() => void) | null = null;
    browser.openAuthSessionAsync.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(finish()))));
    fireEvent.press(await screen.findByText("Sign in with Google again"));
    await waitFor(() => expect(release).not.toBeNull());

    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText("Signed out. Your study on this device is still here.")).toBeTruthy();
    const sessionsBefore = server.sessions.size;
    await act(async () => {
      release!();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    // Google did sign in (the server issued a session), but this device kept none of it.
    expect(server.sessions.size).toBe(sessionsBefore + 1);
    expect(hasStoredSession(storage)).toBe(false);
    expect(screen.getByText("Continue with Google")).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.getByText("Signed out. Your study on this device is still here.")).toBeTruthy();
  });

  it("a secure-storage failure while signing out is reported, not thrown", async () => {
    const { storage } = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    // The Expo plugin's storage adapter logs and swallows write failures.
    jest.spyOn(console, "error").mockImplementation(() => {});
    const write = storage.setItem;
    storage.setItem = (key, value) => {
      if (key.startsWith(COOKIE_KEY)) throw new Error("Keystore unavailable");
      write(key, value);
    };
    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText(/saved sign-in couldn't be removed from secure storage/)).toBeTruthy();
    expect(screen.getByText("Continue with Google")).toBeTruthy();
  });
});

/** Like setup, but over a given server with `token` stored and the network down. */
async function setupWith(server: FakeServer, token: string) {
  server.reachable = false;
  const storage = memorySecureStore();
  storage.setItem(COOKIE_KEY, JSON.stringify({ "better-auth.session_token": { value: token, expires: null } }));
  return mount(server, storage);
}

type AccountSession = Extract<ReturnType<typeof getStudySession>, { mode: "account" }>;
const journalRow = (id: string) => ({
  kind: "note" as const,
  id,
  title: id,
  status: "draft" as const,
  journal_date: "2026-10-28",
  source: null,
  excerpt: null,
  markdown_revision: 0,
  markdown_canonical: true,
  read_only: false as const,
  author_label: "You",
  created_at: "2026-10-28T00:00:00.000Z",
  updated_at: "2026-10-28T00:00:00.000Z",
});

describe("the study the screens use", () => {
  it("is the verified account's own, is forgotten at sign-out (unsynced changes kept for it), and never another's", async () => {
    const { server, storage } = await setup();
    expect(getStudySession().mode).toBe("device");
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    await waitFor(() => expect(getStudySession()).toMatchObject({ mode: "account", owner: "owner-A" }));
    const ada = getStudySession() as AccountSession;
    expect(ada.sync).not.toBeNull();
    // Recorded with this session's fingerprint (never the token itself).
    const record = JSON.parse(port.getItem(LAST_OWNER_KEY)!);
    expect(record).toEqual({ owner: "owner-A", session: `s256:${sha256Hex(tokenIn(storage)!)}` });
    expect(port.getItem(LAST_OWNER_KEY)).not.toContain(tokenIn(storage)!);
    await act(async () => {
      ada.store.setJournal([journalRow("ada-note")]);
      ada.store.enqueueCreate({ requestId: "rl-unsent", markdownBody: "Not sent yet", journalDate: "2026-10-28", source: null, logReading: false });
    });

    // Signing out with a change not yet synced asks first (the test's Alert confirms).
    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText("Continue with Google")).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledWith("Sign out with changes not yet synced?", expect.stringContaining("1 change you made here hasn't reached your account yet"), expect.anything());
    expect(getStudySession().mode).toBe("device");
    expect(port.getItem(`${ACCOUNT_CACHE_PREFIX}owner-A`)).toBeNull();
    expect(port.getItem(`${ACCOUNT_OUTBOX_PREFIX}owner-A`)).toContain("Not sent yet");
    expect(port.getItem(LAST_OWNER_KEY)).toBeNull();
    expect(ada.store.disposed).toBe(true);

    server.nextUser = BEA;
    fireEvent.press(screen.getByText("Continue with Google"));
    expect(await screen.findByText("Bea")).toBeTruthy();
    await waitFor(() => expect(getStudySession()).toMatchObject({ mode: "account", owner: "owner-B" }));
    const bea = getStudySession() as AccountSession;
    expect(bea.store.getSnapshot().cache.journal).toBeNull();
    expect(bea.store.getSnapshot().outbox.ops).toEqual([]);
  });

  it("offline after a restart, shows the account last verified with this session from its cache, and sends nothing", async () => {
    const server = new FakeServer();
    const token = server.issue(ADA);
    port.setItem(LAST_OWNER_KEY, JSON.stringify({ owner: "owner-A", session: `s256:${sha256Hex(token)}` }));
    port.setItem(`${ACCOUNT_CACHE_PREFIX}owner-A`, JSON.stringify({ version: 1, journal: [journalRow("cached")], readingLog: null, goalsLoaded: false, goals: null, docIds: [], chapters: {}, guides: {} }));
    await setupWith(server, token);
    expect(await screen.findByText(/can’t be reached right now/)).toBeTruthy();
    const session = getStudySession() as AccountSession;
    expect(session).toMatchObject({ mode: "account", owner: "owner-A", sync: null });
    expect(session.store.getSnapshot().cache.journal?.map((row) => row.id)).toEqual(["cached"]);
  });

  it("a session other than the one an account was verified with sees nothing of that account's study", async () => {
    const server = new FakeServer();
    const ada = server.issue(ADA);
    const bea = server.issue(BEA);
    // Ada's study is cached on the device for Ada's session; Bea's session is the one stored now (say the app stopped
    // right after a sign-in stored it, before anything was checked).
    port.setItem(LAST_OWNER_KEY, JSON.stringify({ owner: "owner-A", session: `s256:${sha256Hex(ada)}` }));
    port.setItem(`${ACCOUNT_CACHE_PREFIX}owner-A`, JSON.stringify({ version: 1, journal: [journalRow("ada-private")], readingLog: null, goalsLoaded: false, goals: null, docIds: [], chapters: {}, guides: {} }));
    await setupWith(server, bea);
    expect(await screen.findByText(/can’t be reached right now/)).toBeTruthy();
    expect(getStudySession()).toEqual({ mode: "blocked", reason: "checking" });

    // Once the server confirms Bea, only Bea's study is used.
    server.reachable = true;
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Bea")).toBeTruthy();
    await waitFor(() => expect(getStudySession()).toMatchObject({ mode: "account", owner: "owner-B" }));
    expect((getStudySession() as AccountSession).store.getSnapshot().cache.journal).toBeNull();
  });

  it("without any verified owner on this device, a saved session shows nothing until checked", async () => {
    const server = new FakeServer();
    const token = server.issue(ADA);
    await setupWith(server, token);
    expect(await screen.findByText(/can’t be reached right now/)).toBeTruthy();
    expect(getStudySession()).toEqual({ mode: "blocked", reason: "checking" });
  });

  it("a new sign-in never shows the previous account's study while it is being checked", async () => {
    const { server } = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    await waitFor(() => expect(getStudySession()).toMatchObject({ mode: "account", owner: "owner-A" }));
    // Signing in again (here as Bea) while signed in as Ada: until Bea is confirmed, no account's study is used.
    server.freshDeletes = false;
    fireEvent.press(screen.getByText("Delete my account"));
    server.nextUser = BEA;
    // Every change of whose study the screens use, from here on.
    const seen: string[] = [];
    const unsubscribe = subscribeStudySession(() => {
      const session = getStudySession();
      seen.push(session.mode === "account" ? session.owner : session.mode);
    });
    fireEvent.press(await screen.findByText("Sign in with Google again"));
    expect(await screen.findByText("Bea")).toBeTruthy();
    await waitFor(() => expect(getStudySession()).toMatchObject({ mode: "account", owner: "owner-B" }));
    unsubscribe();
    // Ada's study goes the moment Bea's session is stored; nothing is shown until Bea is confirmed.
    expect(seen[0]).toBe("blocked");
    expect(seen).not.toContain("owner-A");
    expect(seen[seen.length - 1]).toBe("owner-B");
  });

  it("deleting the account forgets its study on the device, unsynced changes included", async () => {
    await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    await waitFor(() => expect(getStudySession()).toMatchObject({ mode: "account", owner: "owner-A" }));
    await act(async () => {
      (getStudySession() as AccountSession).store.enqueueCreate({ requestId: "rl-x", markdownBody: "Unsent", journalDate: "2026-10-28", source: null, logReading: false });
    });
    fireEvent.press(screen.getByText("Delete my account"));
    expect(await screen.findByText(/Your Verse Together account and the study saved in it were deleted/)).toBeTruthy();
    expect(getStudySession().mode).toBe("device");
    expect(port.getItem(`${ACCOUNT_OUTBOX_PREFIX}owner-A`)).toBeNull();
  });

  it("an unfinished deletion blocks the account's study", async () => {
    const { server } = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    server.interruptDelete = true;
    fireEvent.press(screen.getByText("Delete my account"));
    expect(await screen.findByText("Finish deleting my account")).toBeTruthy();
    expect(getStudySession()).toEqual({ mode: "blocked", reason: "deletion-pending" });
  });
});

describe("slow sign-out lifecycle", () => {
  it("stops account study immediately and blocks a new sign-in until old cookie cleanup settles", async () => {
    const { client, server } = await setup();
    fireEvent.press(await screen.findByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    let finish!: () => void;
    const original = client.signOut;
    jest.spyOn(client, "signOut").mockImplementation(async () => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return original();
    });
    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText("Continue with Google")).toBeTruthy();
    expect(getStudySession().mode).toBe("device");
    server.nextUser = BEA;
    fireEvent.press(screen.getByText("Continue with Google"));
    expect(await screen.findByText(/Sign-out is still finishing/)).toBeTruthy();
    await act(async () => finish());
    expect(await screen.findByText("Signed out. Your study on this device is still here.")).toBeTruthy();
    fireEvent.press(screen.getByText("Continue with Google"));
    expect(await screen.findByText("Bea")).toBeTruthy();
  });
});
