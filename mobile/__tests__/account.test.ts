// Account sign-in and the explicit copy of this device's study. The browser, secure storage and Better Auth's
// network calls are fakes with the real shapes; the cookie jar is the Expo plugin's own code, and the import
// shapes are the web's (src/features/notes/deviceStudy.ts). The fake exchange checks what the real one does (the code
// is for this attempt, S256 of the verifier matches the challenge sent at sign-in, used once); the server side of each
// step is tested against real Better Auth in tests/convex/nativeAuth.test.ts.

import { createHash, randomBytes } from "crypto";
import { COOKIE_KEY, cookieJar, hasStoredSession, type NativeAuthClient } from "../src/account/client";
import { readAccountConfig } from "../src/account/config";
import {
  ACCOUNT_COPIES_KEY,
  AccountChangedError,
  copyDeviceStudy,
  copySummary,
  readLedger,
  releaseAccountCopies,
  type CopyImports,
} from "../src/account/guestCopy";
import {
  ATTEMPT_KEY,
  ATTEMPT_TTL_MS,
  AUTH_CALLBACK_URL,
  ENDED_ATTEMPTS_KEY,
  EXCHANGE_PATH,
  OFFLINE_MESSAGE,
  base64Url,
  cancelPendingSignIn,
  completeSignInReturn,
  resetSignInState,
  returnParamsFromUrl,
  signInWithGoogle,
  type AuthBrowser,
  type CompleteDeps,
  type SignInCrypto,
  type SignInDeps,
} from "../src/account/googleSignIn";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { deviceStudy, initDeviceStudy } from "../src/storage/study";
import { annotationChapter } from "../src/shared/web";
import { memorySecureStore } from "../testing/secureStore";

const AUTH_BASE = "https://www.versetogether.org/api/auth";
const GOOGLE_URL = "https://accounts.google.com/o/oauth2/v2/auth?client_id=web&state=s1";

const token = () => randomBytes(32).toString("base64url");
const s256 = (verifier: string) => createHash("sha256").update(verifier, "ascii").digest("base64url");
const testCrypto: SignInCrypto = { randomToken: token, s256: async (verifier) => s256(verifier) };

/**
 * Better Auth as the app sees it: /sign-in/social binds the attempt to its challenge, the site's callback issues a
 * one-time code for that attempt, and the exchange redeems it only with the attempt and the verifier behind it.
 */
class FakeAuth {
  challenges = new Map<string, string>();
  codes = new Map<string, { attempt: string; token: string; used: boolean }>();
  socialCalls: Array<Record<string, unknown>> = [];
  exchanges: Array<Record<string, string>> = [];
  signedOut: string[] = [];
  urls: string[] = [];
  reachable = true;
  /** Holds every exchange until released (to land a sign-out while one is on its way). */
  hold: Promise<void> | null = null;
  private count = 0;

  client = {
    signIn: {
      social: async (body: Record<string, unknown>) => {
        if (!this.reachable) throw new TypeError("Network request failed");
        this.socialCalls.push(body);
        const attempt = new URL(String(body.callbackURL).replace("versetogether://", "https://app/")).searchParams.get("attempt")!;
        const handoff = (body.additionalData as { nativeSignIn: { challenge: string; method: string } }).nativeSignIn;
        if (handoff.method !== "S256" || this.challenges.has(attempt)) return { data: null, error: { status: 400 } };
        this.challenges.set(attempt, handoff.challenge);
        return { data: { url: GOOGLE_URL, redirect: false }, error: null };
      },
    },
  } as unknown as NativeAuthClient;

  /** The latest attempt the app started. */
  get attempt(): string {
    const body = this.socialCalls[this.socialCalls.length - 1];
    return new URL(String(body.callbackURL).replace("versetogether://", "https://app/")).searchParams.get("attempt")!;
  }

  /** The site's Google callback finishing: a one-time code for `attempt`'s new session. */
  returnFor(attempt = this.attempt, sessionToken = `tok-${++this.count}`): string {
    const code = token();
    this.codes.set(code, { attempt, token: sessionToken, used: false });
    return `${AUTH_CALLBACK_URL}?${new URLSearchParams({ attempt, code })}`;
  }

  fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    this.urls.push(url);
    if (!this.reachable) throw new TypeError("Network request failed");
    if (url === `${AUTH_BASE}/sign-out`) {
      this.signedOut.push(String((init?.headers as Record<string, string>).cookie));
      return new Response("{}", { status: 200 });
    }
    expect(url).toBe(`${AUTH_BASE}${EXCHANGE_PATH}`);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("omit");
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    this.exchanges.push(body);
    if (this.hold) await this.hold;
    const entry = this.codes.get(body.code);
    const proven = !!entry && entry.attempt === body.attempt && this.challenges.get(body.attempt) === s256(body.verifier);
    if (!entry || entry.used || !proven) return new Response(JSON.stringify({ code: "INVALID_SIGN_IN_CODE" }), { status: 401 });
    entry.used = true;
    const cookie = `better-auth.session_token=${entry.token}.sig; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`;
    return new Response(JSON.stringify({ cookie }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

type Deps = SignInDeps & { storage: ReturnType<typeof memorySecureStore>; stored: jest.Mock; auth: FakeAuth };

function deps(overrides: Partial<SignInDeps> & { browser: AuthBrowser; auth?: FakeAuth }): Deps {
  const auth = overrides.auth ?? new FakeAuth();
  const storage = memorySecureStore();
  const stored = jest.fn();
  return {
    authClient: auth.client,
    authBaseURL: AUTH_BASE,
    storage,
    onSessionStored: stored,
    stored,
    auth,
    crypto: testCrypto,
    fetch: auth.fetch,
    platform: "ios",
    wait: async () => {},
    ...overrides,
  } as Deps;
}

/** A browser whose Google sign-in finishes: it comes back with the site's return for the attempt just started. */
function finishing(auth: FakeAuth): AuthBrowser {
  return { openAuthSessionAsync: async () => ({ type: "success", url: auth.returnFor() }) };
}

/** An attempt saved as if this device had started it (and registered it with `auth`). */
function savedAttempt(storage: ReturnType<typeof memorySecureStore>, auth: FakeAuth, createdAt = Date.now()) {
  const attempt = { id: token(), verifier: token(), createdAt };
  storage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
  auth.challenges.set(attempt.id, s256(attempt.verifier));
  return attempt;
}

function completeDeps(storage: ReturnType<typeof memorySecureStore>, auth: FakeAuth, extra: Partial<CompleteDeps> = {}): CompleteDeps & { onSessionStored: jest.Mock } {
  return { authBaseURL: AUTH_BASE, storage, fetch: auth.fetch, onSessionStored: jest.fn(), ...extra } as CompleteDeps & { onSessionStored: jest.Mock };
}

const codeParams = (url: string) => returnParamsFromUrl(url)!;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let ledger: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  resetSignInState();
  ledger = memoryStorage();
  setStoragePort(ledger);
});

describe("account configuration", () => {
  it("needs both public URLs, over https, with the Convex cloud URL", () => {
    expect(readAccountConfig({ siteUrl: "https://www.versetogether.org/", convexUrl: "https://lovable-seal-140.convex.cloud" }, false)).toEqual({
      siteOrigin: "https://www.versetogether.org",
      authBaseURL: "https://www.versetogether.org/api/auth",
      convexUrl: "https://lovable-seal-140.convex.cloud",
    });
    for (const env of [
      {},
      { siteUrl: "https://www.versetogether.org" },
      { siteUrl: "http://www.versetogether.org", convexUrl: "https://x.convex.cloud" },
      { siteUrl: "https://www.versetogether.org", convexUrl: "https://x.convex.site" },
      { siteUrl: "https://www.versetogether.org/app", convexUrl: "https://x.convex.cloud" },
      { siteUrl: "http://localhost:3000", convexUrl: "http://127.0.0.1:3210" },
    ]) {
      expect(readAccountConfig(env, false)).toBeNull();
    }
    // Development builds may use a local site and backend.
    expect(readAccountConfig({ siteUrl: "http://10.0.2.2:3000", convexUrl: "http://127.0.0.1:3210" }, true)?.authBaseURL).toBe("http://10.0.2.2:3000/api/auth");
  });
});

describe("sign-in proof", () => {
  it("encodes base64url as RFC 4648 does, and S256 as RFC 7636's example", () => {
    for (let length = 0; length < 40; length++) {
      const bytes = randomBytes(length);
      expect(base64Url(new Uint8Array(bytes))).toBe(bytes.toString("base64url"));
    }
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(base64Url(new Uint8Array(createHash("sha256").update(verifier).digest()))).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("Google sign-in", () => {
  it("returns with a one-time code, which the app's private verifier exchanges over HTTPS for the session", async () => {
    const auth = new FakeAuth();
    let returnURL = "";
    const open = jest.fn(async () => ({ type: "success", url: (returnURL = auth.returnFor()) }));
    const d = deps({ auth, browser: { openAuthSessionAsync: open } });
    let savedVerifier = "";
    const save = d.storage.setItem;
    d.storage.setItem = (key, value) => {
      if (key === ATTEMPT_KEY) savedVerifier = JSON.parse(value).verifier;
      save(key, value);
    };
    expect(await signInWithGoogle(d)).toEqual({ kind: "signed-in" });

    const attempt = auth.attempt;
    expect(attempt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(savedVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(auth.socialCalls).toEqual([
      {
        provider: "google",
        callbackURL: `versetogether://auth-callback?attempt=${attempt}`,
        errorCallbackURL: `versetogether://auth-callback?attempt=${attempt}`,
        disableRedirect: true,
        additionalData: { nativeSignIn: { challenge: s256(savedVerifier), method: "S256" } },
      },
    ]);
    const [proxyUrl, redirectUrl, options] = open.mock.calls[0] as unknown as [string, string, object];
    const proxy = new URL(proxyUrl);
    expect(`${proxy.origin}${proxy.pathname}`).toBe("https://www.versetogether.org/api/auth/expo-authorization-proxy");
    expect(proxy.searchParams.get("authorizationURL")).toBe(GOOGLE_URL);
    expect(redirectUrl).toBe(AUTH_CALLBACK_URL);
    expect(options).toEqual({ preferEphemeralSession: true });
    // The verifier went only into the HTTPS exchange's body: never into a URL.
    for (const url of [proxyUrl, returnURL, ...auth.urls, String(auth.socialCalls[0].callbackURL)]) expect(url).not.toContain(savedVerifier);
    expect(auth.exchanges).toEqual([{ attempt, code: new URL(returnURL.replace("versetogether://", "https://app/")).searchParams.get("code"), verifier: savedVerifier }]);

    expect(hasStoredSession(d.storage)).toBe(true);
    expect(cookieJar(d.storage).read()).toContain("tok-1.sig");
    expect(d.stored).toHaveBeenCalledTimes(1);
    // Each attempt is used once, and its verifier goes with it.
    expect(d.storage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(completeSignInReturn(codeParams(returnURL), d)).not.toBeNull();
    expect(d.stored).toHaveBeenCalledTimes(1);
    expect(auth.exchanges).toHaveLength(1);
  });

  it("never reads a session from the return URL: a crafted link with a cookie signs nothing in", async () => {
    const auth = new FakeAuth();
    const cookie = "better-auth.session_token=attacker.sig; Max-Age=604800; Path=/";
    expect(returnParamsFromUrl(`${AUTH_CALLBACK_URL}?attempt=a&cookie=${encodeURIComponent(cookie)}`)).toEqual({ attempt: "a", code: null, error: null });
    // The browser comes back with this attempt and a cookie, as the old flow did: an error, nothing stored or sent.
    const d = deps({
      auth,
      browser: { openAuthSessionAsync: async () => ({ type: "success", url: `${AUTH_CALLBACK_URL}?${new URLSearchParams({ attempt: auth.attempt, cookie })}` }) },
    });
    expect((await signInWithGoogle(d)).kind).toBe("error");
    expect(hasStoredSession(d.storage)).toBe(false);
    expect(auth.exchanges).toEqual([]);
  });

  it("a forged return carrying someone else's code for this attempt is refused, and stores nothing", async () => {
    const auth = new FakeAuth();
    // An attacker's code from their own sign-in, under their own attempt, pasted onto this device's attempt.
    const attackerAttempt = token();
    auth.challenges.set(attackerAttempt, s256(token()));
    const attackerCode = new URL(auth.returnFor(attackerAttempt, "tok-attacker").replace("versetogether://", "https://app/")).searchParams.get("code")!;
    const d = deps({
      auth,
      browser: { openAuthSessionAsync: async () => ({ type: "success", url: `${AUTH_CALLBACK_URL}?${new URLSearchParams({ attempt: auth.attempt, code: attackerCode })}` }) },
    });
    expect(await signInWithGoogle(d)).toEqual({ kind: "error", message: "Google sign-in didn't finish. Try again." });
    expect(hasStoredSession(d.storage)).toBe(false);
    expect(d.stored).not.toHaveBeenCalled();
  });

  it("closing the browser is a cancellation that changes nothing, and its return is ignored if it arrives later", async () => {
    const auth = new FakeAuth();
    const d = deps({ auth, browser: { openAuthSessionAsync: async () => ({ type: "cancel" }) } });
    expect(await signInWithGoogle(d)).toEqual({ kind: "cancelled" });
    expect(hasStoredSession(d.storage)).toBe(false);
    expect(d.stored).not.toHaveBeenCalled();
    expect(d.storage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(completeSignInReturn(codeParams(auth.returnFor()), d)).toBeNull();
    expect(hasStoredSession(d.storage)).toBe(false);
    expect(auth.exchanges).toEqual([]);
  });

  it("on Android, a return that comes after the grace period is ignored", async () => {
    let wake!: () => void;
    const auth = new FakeAuth();
    const d = deps({
      auth,
      platform: "android",
      browser: { dismissAuthSession: jest.fn(), openAuthSessionAsync: async () => ({ type: "dismiss" }) },
      wait: () => new Promise<void>((resolve) => (wake = resolve)),
    });
    const outcome = signInWithGoogle(d);
    await tick();
    wake();
    expect(await outcome).toEqual({ kind: "cancelled" });
    expect(d.storage.getItem(ATTEMPT_KEY)).toBeNull();
    // The auth-callback route delivering it now finds no attempt to finish.
    expect(completeSignInReturn(codeParams(auth.returnFor()), d)).toBeNull();
    expect(hasStoredSession(d.storage)).toBe(false);
    expect(d.stored).not.toHaveBeenCalled();
  });

  it("a browser that fails to open ends the attempt", async () => {
    const auth = new FakeAuth();
    const d = deps({
      auth,
      browser: {
        openAuthSessionAsync: async () => {
          throw new Error("No browser");
        },
      },
    });
    expect((await signInWithGoogle(d)).kind).toBe("error");
    expect(d.storage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(completeSignInReturn(codeParams(auth.returnFor()), d)).toBeNull();
    expect(hasStoredSession(d.storage)).toBe(false);
  });

  it("signing out while the browser is open ignores its return, from the browser or the route", async () => {
    const auth = new FakeAuth();
    let release!: (result: { type: string; url?: string }) => void;
    const d = deps({ auth, browser: { dismissAuthSession: jest.fn(), openAuthSessionAsync: () => new Promise((resolve) => (release = resolve)) } });
    const outcome = signInWithGoogle(d);
    await tick();
    expect(d.storage.getItem(ATTEMPT_KEY)).not.toBeNull();

    expect(await cancelPendingSignIn({ storage: d.storage, browser: d.browser })).toBe(true);
    expect(d.storage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(d.browser.dismissAuthSession).toHaveBeenCalled();
    // A valid return for that attempt, by either path.
    expect(completeSignInReturn(codeParams(auth.returnFor()), d)).toBeNull();
    release({ type: "success", url: auth.returnFor() });
    expect(await outcome).toEqual({ kind: "abandoned" });
    expect(hasStoredSession(d.storage)).toBe(false);
    expect(d.stored).not.toHaveBeenCalled();
    expect(auth.exchanges).toEqual([]);

    // A new sign-in starts its own attempt rather than joining the abandoned one.
    const next = deps({ auth, browser: finishing(auth) });
    expect(await signInWithGoogle(next)).toEqual({ kind: "signed-in" });
  });

  it("signing out while the code exchange is on its way keeps nothing, then or after a restart, and signs that session out", async () => {
    const auth = new FakeAuth();
    let release!: () => void;
    auth.hold = new Promise<void>((resolve) => (release = resolve));
    const d = deps({ auth, browser: finishing(auth) });
    const written: string[] = [];
    const write = d.storage.setItem;
    d.storage.setItem = (key, value) => {
      if (key.startsWith(COOKIE_KEY)) written.push(value);
      write(key, value);
    };
    const outcome = signInWithGoogle(d);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(auth.exchanges).toHaveLength(1);

    expect(await cancelPendingSignIn({ storage: d.storage })).toBe(true);
    release();
    expect(await outcome).toEqual({ kind: "abandoned" });
    expect(hasStoredSession(d.storage)).toBe(false);
    // Not even briefly written to secure storage.
    expect(written.join()).not.toContain("tok-1");
    expect(d.stored).not.toHaveBeenCalled();
    // The server did hand over a session; this device signs it out instead of keeping it.
    await tick();
    expect(auth.signedOut).toEqual(["better-auth.session_token=tok-1.sig"]);

    // After a restart, the same return (delivered again) is ignored.
    resetSignInState();
    const exchanged = auth.exchanges[0];
    expect(completeSignInReturn({ attempt: exchanged.attempt, code: exchanged.code }, completeDeps(d.storage, auth))).toBeNull();
    expect(hasStoredSession(d.storage)).toBe(false);
  });

  it("a return already being stored when the reader signs out is taken back", async () => {
    const auth = new FakeAuth();
    const storage = memorySecureStore();
    const attempt = savedAttempt(storage, auth);
    const write = storage.setItem;
    // Signing out lands exactly while the session is written.
    storage.setItem = (key, value) => {
      write(key, value);
      if (key === COOKIE_KEY && value.includes("tok-1.sig")) void cancelPendingSignIn({ storage });
    };
    const d = completeDeps(storage, auth);
    expect(await completeSignInReturn(codeParams(auth.returnFor(attempt.id)), d)).toEqual({ kind: "abandoned" });
    expect(hasStoredSession(storage)).toBe(false);
    expect(d.onSessionStored).not.toHaveBeenCalled();
    await tick();
    expect(auth.signedOut).toEqual(["better-auth.session_token=tok-1.sig"]);
  });

  it("a newer attempt replaces an older one, including one saved before a restart", async () => {
    const auth = new FakeAuth();
    const storage = memorySecureStore();
    const old = savedAttempt(storage, auth);
    const d = deps({ auth, storage, browser: { openAuthSessionAsync: async () => ({ type: "cancel" }) } });
    await signInWithGoogle(d);
    expect(completeSignInReturn(codeParams(auth.returnFor(old.id)), d)).toBeNull();
    expect(hasStoredSession(storage)).toBe(false);
  });

  it("finishes after a cold start: the attempt and its verifier survive the app being stopped, in secure storage only", async () => {
    const auth = new FakeAuth();
    const storage = memorySecureStore();
    const attempt = savedAttempt(storage, auth, Date.now() - 60_000);
    resetSignInState();
    const d = completeDeps(storage, auth);
    expect(await completeSignInReturn(codeParams(auth.returnFor(attempt.id)), d)).toEqual({ kind: "signed-in" });
    expect(hasStoredSession(storage)).toBe(true);
    expect(storage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(auth.exchanges[0].verifier).toBe(attempt.verifier);
    // The app's SQLite storage holds ended attempt ids only, never a verifier.
    expect([...ledger.data.values()].join()).not.toContain(attempt.verifier);
  });

  it("a cancellation stays in force after a restart even when secure storage won't forget the attempt", async () => {
    const auth = new FakeAuth();
    const storage = memorySecureStore();
    storage.deleteItemAsync = async () => {
      throw new Error("Keystore unavailable");
    };
    const attempt = savedAttempt(storage, auth);
    // Signing out: the attempt can't be deleted, but the app's own storage records it as ended.
    expect(await cancelPendingSignIn({ storage })).toBe(true);
    expect(storage.getItem(ATTEMPT_KEY)).not.toBeNull();
    expect(JSON.parse(ledger.getItem(ENDED_ATTEMPTS_KEY)!)).toEqual([{ id: attempt.id, at: expect.any(Number) }]);
    resetSignInState();
    expect(completeSignInReturn(codeParams(auth.returnFor(attempt.id)), completeDeps(storage, auth))).toBeNull();
    expect(auth.exchanges).toEqual([]);

    // When neither store can record it, signing out says so instead of claiming it's settled.
    const unrecordable = memorySecureStore();
    unrecordable.deleteItemAsync = storage.deleteItemAsync;
    savedAttempt(unrecordable, auth);
    const failing = { getItem: () => null, setItem: () => { throw new Error("disk full"); }, removeItem: () => {} };
    expect(await cancelPendingSignIn({ storage: unrecordable, endedLog: failing })).toBe(false);

    // A cancelled tab whose cancellation can't be recorded says so too.
    const d = deps({ auth, endedLog: failing, browser: { openAuthSessionAsync: async () => ({ type: "cancel" }) } });
    d.storage.deleteItemAsync = storage.deleteItemAsync;
    expect(await signInWithGoogle(d)).toEqual({ kind: "cancelled", unrecorded: true });
  });

  it("an unreadable record of ended attempts refuses returns rather than guessing", () => {
    const auth = new FakeAuth();
    const storage = memorySecureStore();
    const attempt = savedAttempt(storage, auth);
    ledger.setItem(ENDED_ATTEMPTS_KEY, "{not json");
    expect(completeSignInReturn(codeParams(auth.returnFor(attempt.id)), completeDeps(storage, auth))).toBeNull();
  });

  it("secure-storage failures come back as messages, never as rejections", async () => {
    const auth = new FakeAuth();
    const failing = memorySecureStore();
    failing.setItem = () => {
      throw new Error("Keystore unavailable");
    };
    const open = jest.fn();
    const d = deps({ auth, storage: failing, browser: { openAuthSessionAsync: open } });
    expect(await signInWithGoogle(d)).toEqual({ kind: "error", message: expect.stringMatching(/couldn't be saved securely/) });
    expect(open).not.toHaveBeenCalled();

    // The attempt saves, but the session can't be: an error, nothing reported as stored, and the session signed out.
    jest.spyOn(console, "error").mockImplementation(() => {});
    const storage = memorySecureStore();
    const attempt = savedAttempt(storage, auth);
    const write = storage.setItem;
    storage.setItem = (key, value) => {
      if (key === COOKIE_KEY) throw new Error("Keystore unavailable");
      write(key, value);
    };
    const cd = completeDeps(storage, auth);
    expect(await completeSignInReturn(codeParams(auth.returnFor(attempt.id)), cd)).toEqual({
      kind: "error",
      message: expect.stringMatching(/couldn't be saved securely/),
    });
    expect(cd.onSessionStored).not.toHaveBeenCalled();
    await tick();
    expect(auth.signedOut).toHaveLength(1);

    // Forgetting a session that secure storage won't remove says so, rather than reporting it gone.
    const kept = memorySecureStore();
    kept.setItem(COOKIE_KEY, JSON.stringify({ "better-auth.session_token": { value: "tok-A.sig", expires: null } }));
    kept.setItem = () => {
      throw new Error("Keystore unavailable");
    };
    await expect(cookieJar(kept).clear()).rejects.toThrow(/couldn't be removed/);
    jest.restoreAllMocks();
  });

  it("Google declining comes back as a message, without an exchange or a session", async () => {
    const auth = new FakeAuth();
    const d = deps({ auth, browser: { openAuthSessionAsync: async () => ({ type: "success", url: `${AUTH_CALLBACK_URL}?${new URLSearchParams({ attempt: auth.attempt, error: "access_denied" })}` }) } });
    expect(await signInWithGoogle(d)).toEqual({ kind: "denied", message: "Google sign-in was declined." });
    expect(hasStoredSession(d.storage)).toBe(false);
    expect(auth.exchanges).toEqual([]);
  });

  it("ignores a return that isn't this device's attempt: crafted, expired, or already used", async () => {
    const auth = new FakeAuth();
    const storage = memorySecureStore();
    expect(completeSignInReturn(codeParams(auth.returnFor(token())), completeDeps(storage, auth))).toBeNull();

    const mine = { id: token(), verifier: token(), createdAt: 1_000 };
    storage.setItem(ATTEMPT_KEY, JSON.stringify(mine));
    expect(completeSignInReturn(codeParams(auth.returnFor(token())), completeDeps(storage, auth, { now: () => 2_000 }))).toBeNull();
    expect(completeSignInReturn(codeParams(auth.returnFor(mine.id)), completeDeps(storage, auth, { now: () => 1_000 + ATTEMPT_TTL_MS + 1 }))).toBeNull();
    // An attempt saved without a verifier (an older version's) can't be finished.
    storage.setItem(ATTEMPT_KEY, JSON.stringify({ id: mine.id, createdAt: Date.now() }));
    expect(completeSignInReturn(codeParams(auth.returnFor(mine.id)), completeDeps(storage, auth))).toBeNull();
    expect(hasStoredSession(storage)).toBe(false);
    expect(auth.exchanges).toEqual([]);

    // The browser coming back with another attempt's URL is an error, not a sign-in.
    const d = deps({ auth, browser: { openAuthSessionAsync: async () => ({ type: "success", url: auth.returnFor(token()) }) } });
    expect((await signInWithGoogle(d)).kind).toBe("error");
    expect(hasStoredSession(d.storage)).toBe(false);
  });

  it("on Android, finishes through the auth-callback route when the tab reports closing first", async () => {
    const auth = new FakeAuth();
    let routeDelivered: Promise<unknown> | null = null;
    const d: Deps = deps({
      auth,
      platform: "android",
      browser: {
        dismissAuthSession: jest.fn(),
        openAuthSessionAsync: async () => {
          // The deep link reaches the router while the browser call reports a dismissal.
          setTimeout(() => {
            routeDelivered = completeSignInReturn(codeParams(auth.returnFor()), d);
          }, 0);
          return { type: "dismiss" };
        },
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 50))),
    });
    expect(await signInWithGoogle(d)).toEqual({ kind: "signed-in" });
    expect(routeDelivered).not.toBeNull();
    expect(d.browser.dismissAuthSession).toHaveBeenCalled();
    expect(d.stored).toHaveBeenCalledTimes(1);
  });

  it("reports being offline, and too many attempts, without opening the browser; and an exchange that can't connect", async () => {
    const open = jest.fn();
    const offlineAuth = new FakeAuth();
    offlineAuth.reachable = false;
    const offline = deps({ auth: offlineAuth, browser: { openAuthSessionAsync: open } });
    expect(await signInWithGoogle(offline)).toEqual({ kind: "error", message: OFFLINE_MESSAGE });
    expect(offline.storage.getItem(ATTEMPT_KEY)).toBeNull();
    const limitedAuth = new FakeAuth();
    limitedAuth.client.signIn.social = (async () => ({ data: null, error: { status: 429 } })) as never;
    const limited = deps({ auth: limitedAuth, browser: { openAuthSessionAsync: open } });
    expect((await signInWithGoogle(limited)).kind).toBe("error");
    expect(open).not.toHaveBeenCalled();

    // Google finished, but the exchange can't reach the server.
    const auth = new FakeAuth();
    const d = deps({
      auth,
      browser: {
        openAuthSessionAsync: async () => {
          const url = auth.returnFor();
          auth.reachable = false;
          return { type: "success", url };
        },
      },
    });
    expect(await signInWithGoogle(d)).toEqual({ kind: "error", message: OFFLINE_MESSAGE });
    expect(hasStoredSession(d.storage)).toBe(false);
  });

  it("a second tap while signing in joins the same attempt", async () => {
    let finish!: (value: { type: string }) => void;
    const open = jest.fn(() => new Promise<{ type: string }>((resolve) => (finish = resolve)));
    const d = deps({ browser: { openAuthSessionAsync: open } });
    const first = signInWithGoogle(d);
    const second = signInWithGoogle(d);
    await tick();
    finish({ type: "cancel" });
    expect(await first).toEqual(await second);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("treats an expired stored session as signed out", () => {
    const storage = memorySecureStore();
    storage.setItem(COOKIE_KEY, JSON.stringify({ "better-auth.session_token": { value: "x", expires: new Date(Date.now() - 1000).toISOString() } }));
    expect(hasStoredSession(storage)).toBe(false);
    storage.setItem(COOKIE_KEY, JSON.stringify({ "__Secure-better-auth.session_token": { value: "x", expires: new Date(Date.now() + 60_000).toISOString() } }));
    expect(hasStoredSession(storage)).toBe(true);
  });
});

describe("copying this device's study to an account", () => {
  let port: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    port = memoryStorage();
    setStoragePort(port);
    initDeviceStudy();
    deviceStudy.createNote({ requestId: "note-1", markdownBody: "Faith", journalDate: "2026-10-27" });
    deviceStudy.createNote({ requestId: "note-2", markdownBody: "Hope", journalDate: "2026-10-28" });
    deviceStudy.setVerseMarks(annotationChapter("bookofmormon", "alma", 32), [21], { highlightColor: "yellow" });
  });

  function recorder(failOn?: string) {
    const sent: Array<{ kind: string; id: string; owner: string }> = [];
    const imports: CopyImports = {
      importNote: async (args) => {
        if (failOn === args.deviceId) throw new Error("Network request failed");
        sent.push({ kind: "note", id: args.deviceId, owner: args.expectedOwner });
      },
      importAnnotation: async (args) => {
        sent.push({ kind: "annotation", id: args.deviceImportId, owner: args.deviceImportOwner });
      },
      importHighlight: async (args) => {
        sent.push({ kind: "highlight", id: args.deviceImportId, owner: args.deviceImportOwner });
      },
    };
    return { sent, imports };
  }

  const run = (owner: string, imports: CopyImports, currentOwner: () => string | null = () => owner) =>
    copyDeviceStudy({ owner, storage: port, study: deviceStudy.getSnapshot(), currentOwner, imports, offlineMessage: OFFLINE_MESSAGE });

  it("copies everything once, keeps it all on the device, and a second run sends nothing", async () => {
    const before = JSON.stringify(deviceStudy.getSnapshot());
    expect(copySummary(deviceStudy.getSnapshot(), readLedger(port), "owner-A")).toEqual({ toCopy: 3, copied: 0, elsewhere: 0 });
    const { sent, imports } = recorder();
    expect(await run("owner-A", imports)).toEqual({ copied: 3, remaining: 0, error: null });
    expect(sent.map((row) => row.owner)).toEqual(["owner-A", "owner-A", "owner-A"]);
    expect(sent.map((row) => row.kind).sort()).toEqual(["annotation", "note", "note"]);
    // Nothing on the device changed: the screens keep showing it.
    expect(JSON.stringify(deviceStudy.getSnapshot())).toBe(before);
    expect(copySummary(deviceStudy.getSnapshot(), readLedger(port), "owner-A")).toEqual({ toCopy: 0, copied: 3, elsewhere: 0 });
    const again = recorder();
    expect(await run("owner-A", again.imports)).toEqual({ copied: 0, remaining: 0, error: null });
    expect(again.sent).toEqual([]);
  });

  it("reserves records before sending any, and a retry after a dropped connection sends only the rest", async () => {
    const reservedBeforeSend: boolean[] = [];
    const { sent, imports } = recorder("device-note-2");
    const checking: CopyImports = {
      ...imports,
      importNote: async (args) => {
        reservedBeforeSend.push(Object.keys(readLedger(port).records).length === 3);
        return imports.importNote(args);
      },
    };
    const first = await run("owner-A", checking);
    expect(first.error).toBe(OFFLINE_MESSAGE);
    expect(first.remaining).toBeGreaterThan(0);
    expect(reservedBeforeSend.every(Boolean)).toBe(true);
    const sentFirst = sent.length;

    const retry = recorder();
    const second = await run("owner-A", retry.imports);
    expect(second.error).toBeNull();
    expect(sentFirst + retry.sent.length).toBe(3);
    expect(retry.sent.map((row) => row.id)).toContain("device-note-2");
  });

  it("never sends one account's reserved records to another account, and stops if the account changes", async () => {
    // Account A's copy is interrupted after reserving everything.
    const a = recorder("device-note-2");
    await run("owner-A", a.imports);
    // Signing in as B offers only what A hasn't reserved: here, nothing until something new is written.
    expect(copySummary(deviceStudy.getSnapshot(), readLedger(port), "owner-B")).toEqual({ toCopy: 0, copied: 0, elsewhere: 3 });
    const b = recorder();
    expect(await run("owner-B", b.imports)).toEqual({ copied: 0, remaining: 0, error: null });
    expect(b.sent).toEqual([]);
    deviceStudy.createNote({ requestId: "note-3", markdownBody: "Charity", journalDate: "2026-10-28" });
    expect(await run("owner-B", b.imports)).toEqual({ copied: 1, remaining: 0, error: null });
    expect(b.sent).toEqual([{ kind: "note", id: "device-note-3", owner: "owner-B" }]);

    // A sign-out partway stops before the next record.
    const c = recorder();
    let current: string | null = "owner-A";
    const imports: CopyImports = { ...c.imports, importNote: async (args) => { await c.imports.importNote(args); current = null; } };
    const stopped = await copyDeviceStudy({ owner: "owner-A", storage: port, study: deviceStudy.getSnapshot(), currentOwner: () => current, imports, offlineMessage: OFFLINE_MESSAGE });
    expect(stopped.error).toBe(new AccountChangedError().message);
    expect(c.sent.length).toBe(1);
    await expect(copyDeviceStudy({ owner: "owner-A", storage: port, study: deviceStudy.getSnapshot(), currentOwner: () => "owner-B", imports, offlineMessage: OFFLINE_MESSAGE })).rejects.toThrow(AccountChangedError);
  });

  it("after an account is deleted, its records may be copied again", async () => {
    await run("owner-A", recorder().imports);
    releaseAccountCopies(port, "owner-A");
    expect(copySummary(deviceStudy.getSnapshot(), readLedger(port), "owner-B")).toEqual({ toCopy: 3, copied: 0, elsewhere: 0 });
  });

  it("refuses to guess when the copy record is unreadable", () => {
    port.setItem(ACCOUNT_COPIES_KEY, "{not json");
    expect(() => readLedger(port)).toThrow();
  });
});
