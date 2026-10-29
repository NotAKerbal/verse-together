// The account provider's seams beyond sign-in (account.test / accountProvider.test cover that): the account's reader
// preferences engine and its other calls (plans, reading position) start for the verified owner only and stop with
// the session; feedback goes through that session; an unsaved journal draft is kept at sign-out and forgotten with
// the deleted account; and Settings → Account renames the account, lists its sign-in methods and sessions, and signs
// out other devices, through Better Auth's existing endpoints. The harness is accountProvider.test.tsx's: fakes of
// Better Auth's client and the Convex client over one in-memory server. Real Google, Better Auth and Convex are not
// exercised here, and nothing is sent anywhere.

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
import { getAccountCalls } from "../src/account/accountCalls";
import { ENTRY_DRAFT_PREFIX, readEntryDraft, writeEntryDraft } from "../src/features/journal/entryDraftStore";
import { feedbackRoute, sendFeedback } from "../src/features/settings/feedback";
import { activePreferencesSync } from "../src/features/settings/preferencesSync";
import { readAccountPrefs, writeAccountPrefs } from "../src/storage/preferences";

type User = { id: string; owner: string; email: string; name: string };
let ADA: User;
let BEA: User;

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
  /** Feedback and preference calls, with the account the session belongs to. */
  accountCalls: Array<{ name: string; owner: string; args: Record<string, unknown> }> = [];
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
    updateUser: jest.fn(async ({ name }: { name: string }) => {
      if (!server.reachable) throw new TypeError("Network request failed");
      const token = tokenIn(storage);
      const session = token ? server.sessions.get(token) : undefined;
      if (!session) return { data: null, error: { status: 401, code: "UNAUTHORIZED" } };
      session.user.name = name;
      return { data: { status: true }, error: null };
    }),
    listAccounts: jest.fn(async () => {
      const session = server.sessions.get(tokenIn(storage) ?? "");
      if (!session) return { data: null, error: { status: 401, code: "UNAUTHORIZED" } };
      return { data: [{ providerId: "google" }], error: null };
    }),
    listSessions: jest.fn(async () => {
      const token = tokenIn(storage);
      const session = server.sessions.get(token ?? "");
      if (!session) return { data: null, error: { status: 401, code: "UNAUTHORIZED" } };
      if (!server.freshDeletes) return { data: null, error: { status: 403, code: "SESSION_NOT_FRESH" } };
      return {
        data: [...server.sessions].filter(([, value]) => value.user.id === session.user.id).map(([id], index) => ({
          id,
          userAgent: index === 0 ? "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0" : "okhttp/4.12 (Android 15)",
          createdAt: new Date(0),
          expiresAt: new Date(0),
        })),
        error: null,
      };
    }),
    revokeOtherSessions: jest.fn(async () => {
      const token = tokenIn(storage);
      const session = server.sessions.get(token ?? "");
      if (!session) return { data: null, error: { status: 401, code: "UNAUTHORIZED" } };
      for (const [key, value] of server.sessions) if (key !== token && value.user.id === session.user.id) server.sessions.delete(key);
      return { data: { status: true }, error: null };
    }),
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
    // The app user takes the Better Auth user's name each time it is provisioned (convex/users.ts).
    const known = this.viewers.get(user.owner) as { displayName: string } | undefined;
    if (known) known.displayName = user.name;
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
    if (name === "feedback:submitFeedback" || name.startsWith("preferences:")) {
      this.server.accountCalls.push({ name, owner: user.owner, args });
      return name === "preferences:saveMarkPresets" ? { markPresets: args.presets } : { ok: true };
    }
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
  ADA = { id: "auth-A", owner: "owner-A", email: "ada@example.com", name: "Ada" };
  BEA = { id: "auth-B", owner: "owner-B", email: "bea@example.com", name: "Bea" };
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

type AccountSession = Extract<ReturnType<typeof getStudySession>, { mode: "account" }>;

async function signedIn() {
  const mounted = await setup();
  fireEvent.press(await screen.findByText("Continue with Google"));
  expect(await screen.findByText("Ada")).toBeTruthy();
  await waitFor(() => expect(getStudySession()).toMatchObject({ mode: "account", owner: "owner-A" }));
  await waitFor(() => expect((getStudySession() as AccountSession).sync).not.toBeNull());
  return mounted;
}

const DRAFT = { requestId: "draft-1", text: "Half a thought", source: null, reading: false, journalDate: "2026-10-28", range: null, edited: false };

describe("the account's other engines", () => {
  it("start for the verified owner only, and stop with the session", async () => {
    expect(activePreferencesSync("owner-A")).toBeNull();
    expect(getAccountCalls()).toBeNull();
    await signedIn();
    expect(activePreferencesSync("owner-A")).not.toBeNull();
    expect(getAccountCalls()?.owner).toBe("owner-A");
    const calls = getAccountCalls()!;

    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText("Continue with Google")).toBeTruthy();
    expect(activePreferencesSync("owner-A")).toBeNull();
    expect(getAccountCalls()).toBeNull();
    expect(calls.live()).toBe(false);
  });

  it("feedback signed in goes through the account's own session; after sign-out it isn't linked to it", async () => {
    const { server } = await signedIn();
    const route = feedbackRoute(null);
    expect(route.kind).toBe("account");
    await act(async () => sendFeedback({ message: "The plans page is lovely." }, route));
    expect(server.accountCalls.filter((call) => call.name === "feedback:submitFeedback")).toEqual([
      { name: "feedback:submitFeedback", owner: "owner-A", args: expect.objectContaining({ message: "The plans page is lovely.", path: "/native/settings/feedback" }) },
    ]);
    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText("Continue with Google")).toBeTruthy();
    // Without this build's deployment configured there is nowhere to send it anonymously, and nothing is sent.
    expect(feedbackRoute(null).kind).toBe("unavailable");
    if (route.kind !== "account") throw new Error("expected the account route");
    await expect(route.send({ message: "late" } as never)).rejects.toThrow();
    expect(server.accountCalls.filter((call) => call.name === "feedback:submitFeedback")).toHaveLength(1);
  });

  it("signing out keeps the account's unsaved draft and preference changes for it; deleting the account forgets them", async () => {
    await signedIn();
    await act(async () => {
      writeEntryDraft("account:owner-A", DRAFT);
      const record = readAccountPrefs("owner-A");
      writeAccountPrefs("owner-A", { ...record, prefs: { ...record.prefs, fontScale: 1.2 }, appearanceRev: record.appearanceRev + 5 });
    });
    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText("Continue with Google")).toBeTruthy();
    expect(readEntryDraft("account:owner-A")?.text).toBe("Half a thought");

    fireEvent.press(screen.getByText("Continue with Google"));
    expect(await screen.findByText("Ada")).toBeTruthy();
    fireEvent.press(screen.getByText("Delete my account"));
    expect(await screen.findByText(/Your Verse Together account and the study saved in it were deleted/)).toBeTruthy();
    expect(readEntryDraft("account:owner-A")).toBeNull();
    expect(port.getItem(`${ENTRY_DRAFT_PREFIX}account:owner-A`)).toBeNull();
    expect(port.getItem("vt_account_reader_prefs_v1:owner-A")).toBeNull();
  });

  it("deleting one account leaves the device's own draft alone", async () => {
    writeEntryDraft("device", DRAFT);
    await signedIn();
    fireEvent.press(screen.getByText("Delete my account"));
    expect(await screen.findByText(/were deleted/)).toBeTruthy();
    expect(readEntryDraft("device")?.text).toBe("Half a thought");
  });
});

describe("Settings → Account: profile, sign-in methods and devices", () => {
  it("renames the account, and the new name shows once the account has it", async () => {
    const { client } = await signedIn();
    fireEvent.press(screen.getByLabelText("Edit name"));
    const field = await screen.findByLabelText("Display name");
    await act(async () => fireEvent.changeText(field, "  Ada Lovelace "));
    fireEvent.press(screen.getByLabelText("Save name"));
    expect(await screen.findByText("Name saved.")).toBeTruthy();
    expect((client as unknown as { updateUser: jest.Mock }).updateUser).toHaveBeenCalledWith({ name: "Ada Lovelace" });
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
  });

  it("lists sign-in methods and devices when asked, and signs out the other devices after confirming", async () => {
    const { server, client } = await signedIn();
    // Another device signed in to the same account.
    server.issue(ADA);
    expect(server.sessions.size).toBe(2);
    expect((client as unknown as { listSessions: jest.Mock }).listSessions).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Show sign-in methods and devices"));
    expect(await screen.findByText("Google: connected")).toBeTruthy();
    expect(screen.getByText("Sessions · 2 devices")).toBeTruthy();
    expect(screen.getByText("Chrome on Windows · This device")).toBeTruthy();
    expect(screen.getByText("Verse Together app on Android")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Sign out other devices"));
    expect(Alert.alert).toHaveBeenCalledWith("Sign out your other devices?", expect.any(String), expect.anything());
    expect(await screen.findByText("Signed out of your other devices.")).toBeTruthy();
    expect(server.sessions.size).toBe(1);
    expect(await screen.findByText("Sessions · 1 device")).toBeTruthy();
    // This device is still signed in.
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("a session too old to list devices offers signing in again, not a retry loop", async () => {
    const { server } = await signedIn();
    server.freshDeletes = false;
    fireEvent.press(screen.getByLabelText("Show sign-in methods and devices"));
    expect(await screen.findByText("For your security, sign in again to see your sign-in methods and devices.")).toBeTruthy();
    expect(screen.getByLabelText("Sign in with Google again")).toBeTruthy();
    expect(screen.queryByLabelText("Reload sign-in methods and devices")).toBeNull();
    // The other list still shows.
    expect(screen.getByText("Google: connected")).toBeTruthy();
  });

  it("offline, a rename says so and changes nothing", async () => {
    const { server, client } = await signedIn();
    server.reachable = false;
    fireEvent.press(screen.getByLabelText("Edit name"));
    const field = await screen.findByLabelText("Display name");
    await act(async () => fireEvent.changeText(field, "Someone else"));
    fireEvent.press(screen.getByLabelText("Save name"));
    expect(await screen.findByText(/connection|offline|reach/i)).toBeTruthy();
    expect(ADA.name).toBe("Ada");
    expect((client as unknown as { updateUser: jest.Mock }).updateUser).toHaveBeenCalledTimes(1);
  });
});
