// Google sign-in in a browser tab, through the website's own Google callback (the redirect URI the web already uses,
// so there are no separate Google credentials for the app). The return to the app carries a one-time code, never a
// session; the session comes back only from an HTTPS exchange that needs a secret this app never sends anywhere else.
// The server side, and the security model in full, is convex/nativeSignInPlugin.ts.
//
//   1. Make an attempt: a public id and a private 256-bit verifier, saved together in secure storage (Keychain /
//      Android Keystore via expo-secure-store). POST /sign-in/social with the return URL
//      versetogether://auth-callback?attempt=<id> and the verifier's S256 challenge. The server binds the attempt to
//      the OAuth transaction it creates, once, and answers with Google's URL.
//   2. Open the site's /expo-authorization-proxy in an auth browser tab: it plants the OAuth state cookie in the
//      browser, then sends it to Google (the server lets it go nowhere else).
//   3. Google returns to the site's callback, which signs in and redirects to the return URL with a one-time `code`
//      (or Google's `error`).
//   4. POST { attempt, code, verifier } to /native-sign-in/exchange over HTTPS. Only then is the session stored.
//
// The return reaches the app two ways: the browser call resolves with it, or (on Android, where the tab can report
// "dismissed" first, and after the system stopped the app while the tab was open) it opens the auth-callback route.
// Either way it is accepted only while its attempt is the one this device started and saved, within the last ten
// minutes. Each attempt is used once, and ends for good when it is cancelled (after Android's short grace for the
// route), fails, is replaced by a newer attempt, or the reader signs out or deletes their account: a return that
// arrives after that is ignored, an exchange still on its way is discarded (and its session signed out), and one
// already being stored is rolled back. An ended attempt is recorded in two places (its saved copy is deleted from
// secure storage, and its id is written to the app's SQLite storage), so it stays ended after a restart unless both
// writes fail, which is reported.
//
// A `cookie` in a return URL is never read: the old cookie-in-the-URL return is gone, so a crafted link carrying
// someone's session does nothing. An app that intercepts the return gets a code it can't redeem without the verifier;
// one that forges a return with its own code can't redeem it for this attempt (the server checks both). What remains:
// a forged or intercepted return can end the pending attempt (sign-in then says it didn't finish).

import { getCookie, getSetCookie } from "@better-auth/expo/client";
import { Platform } from "react-native";
import { storage as appStorage, type StoragePort } from "../storage/kv";
import { cookieJar, oauthStateFromJar, sessionTokenInSetCookie, type NativeAuthClient, type SecureStorage } from "./client";

export const AUTH_CALLBACK_URL = "versetogether://auth-callback";
/** The app's origin, as the server trusts it (convex/authEnvironment.ts NATIVE_APP_ORIGIN). */
const APP_ORIGIN = "versetogether://";
export const ATTEMPT_KEY = "versetogether_signin_attempt";
/** Attempt ids that ended, in the app's SQLite storage: a second record that survives a failed secure-storage delete. */
export const ENDED_ATTEMPTS_KEY = "account.endedSignInAttempts";
export const EXCHANGE_PATH = "/native-sign-in/exchange";
export const ATTEMPT_TTL_MS = 10 * 60 * 1000;
/** How long to wait for the auth-callback route after an Android tab reports it was closed. */
export const ANDROID_RETURN_GRACE_MS = 1500;
const ENDED_KEPT = 20;
const EXCHANGE_TIMEOUT_MS = 20_000;

export type SignInOutcome =
  | { kind: "signed-in" }
  /** `unrecorded`: the cancellation couldn't be saved on this device, so a late return could still arrive after a restart. */
  | { kind: "cancelled"; unrecorded?: boolean }
  /** Google reported the person declined (or the account couldn't be used). */
  | { kind: "denied"; message: string }
  | { kind: "error"; message: string }
  /** Ended by signing out, deleting the account, or a newer attempt: nothing to report. */
  | { kind: "abandoned" };

export type AuthBrowser = {
  openAuthSessionAsync(url: string, redirectUrl: string, options?: { preferEphemeralSession?: boolean }): Promise<{ type: string; url?: string }>;
  dismissAuthSession?(): void;
};

/** The platform's secure random generator and SHA-256 (expo-crypto in the app). */
export type SignInCrypto = {
  /** 32 random bytes, base64url (43 characters). */
  randomToken(): string;
  /** base64url(SHA-256(ASCII verifier)): RFC 7636's S256 challenge. */
  s256(verifier: string): Promise<string>;
};

export type SignInDeps = {
  authClient: NativeAuthClient;
  authBaseURL: string;
  storage: SecureStorage;
  browser: AuthBrowser;
  crypto: SignInCrypto;
  /** Called once the session cookie is in the jar. */
  onSessionStored: () => void;
  fetch?: typeof fetch;
  /** Where ended attempts are recorded (the app's SQLite storage by default). */
  endedLog?: StoragePort;
  now?: () => number;
  platform?: string;
  wait?: (ms: number) => Promise<void>;
};

export type CompleteDeps = Pick<SignInDeps, "authBaseURL" | "storage" | "onSessionStored" | "fetch" | "endedLog" | "now">;

export const OFFLINE_MESSAGE = "You're offline, or Verse Together can't be reached. Check your connection and try again.";
const START_FAILED = "Google sign-in couldn't start. Try again in a moment.";
const RETURN_FAILED = "Google sign-in didn't finish. Try again.";
const STORAGE_FAILED = "Sign-in couldn't be saved securely on this device. Try again, or restart the app.";
const TOO_MANY = "Too many sign-in attempts. Wait a minute and try again.";
const ABANDONED: SignInOutcome = { kind: "abandoned" };
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Unpadded base64url (RFC 4648 §5), without relying on btoa. */
export function base64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += BASE64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += BASE64URL[n & 63];
  }
  return out;
}

type Attempt = { id: string; verifier: string; createdAt: number };

function readAttempt(storage: SecureStorage): Attempt | null {
  try {
    const raw = storage.getItem(ATTEMPT_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<Attempt>) : null;
    return value && typeof value.id === "string" && typeof value.verifier === "string" && typeof value.createdAt === "number"
      ? { id: value.id, verifier: value.verifier, createdAt: value.createdAt }
      : null;
  } catch {
    return null;
  }
}

/** The saved id of an attempt, even one this version can't use (so it can still be ended). */
function savedAttemptId(storage: SecureStorage): string | null {
  try {
    const raw = storage.getItem(ATTEMPT_KEY);
    const id = raw ? (JSON.parse(raw) as { id?: unknown }).id : null;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

type EndedEntry = { id: string; at: number };

function readEnded(log: StoragePort): EndedEntry[] {
  const raw = log.getItem(ENDED_ATTEMPTS_KEY);
  if (!raw) return [];
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) throw new Error("Unreadable sign-in record");
  return value.filter((entry): entry is EndedEntry => !!entry && typeof entry.id === "string" && typeof entry.at === "number");
}

/** Whether an attempt is recorded as ended; null when the record can't be read (treated as ended). */
function isRecordedEnded(id: string, log: StoragePort): boolean | null {
  try {
    return readEnded(log).some((entry) => entry.id === id);
  } catch {
    return null;
  }
}

/** Records attempts as ended in the app's SQLite storage. Never throws: false when it couldn't be written. */
function recordEnded(ids: string[], log: StoragePort, now: number): boolean {
  if (!ids.length) return true;
  try {
    let entries: EndedEntry[] = [];
    try {
      entries = readEnded(log);
    } catch {}
    // Old entries can go: an attempt older than its lifetime is refused anyway.
    entries = entries.filter((entry) => !ids.includes(entry.id) && now - entry.at < 2 * ATTEMPT_TTL_MS);
    entries.push(...ids.map((id) => ({ id, at: now })));
    log.setItem(ENDED_ATTEMPTS_KEY, JSON.stringify(entries.slice(-ENDED_KEPT)));
    return isRecordedEnded(ids[ids.length - 1], log) === true;
  } catch {
    return false;
  }
}

/** Deletes the saved attempt from secure storage. Never rejects: false when it is still there. */
async function forgetSavedAttempt(storage: SecureStorage): Promise<boolean> {
  try {
    await storage.deleteItemAsync(ATTEMPT_KEY);
  } catch {}
  try {
    return storage.getItem(ATTEMPT_KEY) === null;
  } catch {
    return false;
  }
}

/** Results by attempt id, so the browser result and the auth-callback route share one completion. */
const completions = new Map<string, Promise<SignInOutcome>>();
const waiters = new Map<string, (outcome: SignInOutcome) => void>();
/** Attempts that ended (used, cancelled, failed, replaced, signed out): never accepted again in this run of the app. */
const ended = new Set<string>();
/** The attempt this run of the app started, while it may still finish. */
let live: string | null = null;

/**
 * Ends attempts for good: in memory now, then in the app's SQLite storage and (for the saved one) in secure storage.
 * True when each ended attempt that is saved is recorded as ended in at least one of the two, so it stays ended after a
 * restart. Never rejects.
 */
async function endForGood(ids: string[], storage: SecureStorage, log: StoragePort, now: number): Promise<boolean> {
  for (const id of ids) {
    ended.add(id);
    if (live === id) live = null;
  }
  const recorded = recordEnded(ids, log, now);
  const saved = savedAttemptId(storage);
  if (saved === null || !ids.includes(saved)) return true;
  const forgotten = await forgetSavedAttempt(storage);
  return recorded || forgotten;
}

/** Stops a return for an attempt that is still being finished; whoever waits on it is told it was abandoned. */
function revoke(id: string) {
  ended.add(id);
  completions.delete(id);
  if (live === id) live = null;
  waiters.get(id)?.(ABANDONED);
}

/**
 * Ends every pending sign-in on this device (signing out, deleting the account): the saved attempt, the one this run
 * started, and any return still being exchanged or stored. A return for them that arrives later is ignored, and the
 * open browser tab is closed where the platform allows. Takes effect in this run before it returns; the promise (which
 * never rejects) resolves to whether that is also recorded on the device, so it holds after a restart.
 */
export function cancelPendingSignIn(deps: { storage: SecureStorage; browser?: AuthBrowser; endedLog?: StoragePort; now?: () => number }): Promise<boolean> {
  const saved = savedAttemptId(deps.storage);
  const ids = Array.from(new Set([live, saved, ...completions.keys()].filter((id): id is string => !!id)));
  for (const id of ids) revoke(id);
  inFlight = null;
  try {
    deps.browser?.dismissAuthSession?.();
  } catch {}
  return endForGood(ids, deps.storage, deps.endedLog ?? appStorage(), (deps.now ?? Date.now)());
}

function errorMessage(code: string | null) {
  if (code === "access_denied") return "Google sign-in was declined.";
  if (code === "account_not_linked") return "This Google account can't be linked to the existing Verse Together account with that email.";
  if (code === "signup_disabled") return "New accounts can't be created right now.";
  return RETURN_FAILED;
}

/** Return parameters, from the browser's result URL or the auth-callback route. Anything else in the URL is ignored. */
export type ReturnParams = { attempt?: string | null; code?: string | null; error?: string | null };

export function returnParamsFromUrl(url: string): ReturnParams | null {
  if (!url.startsWith(`${AUTH_CALLBACK_URL}?`) && url !== AUTH_CALLBACK_URL) return null;
  const query = new URLSearchParams(url.slice(AUTH_CALLBACK_URL.length + 1));
  return { attempt: query.get("attempt"), code: query.get("code"), error: query.get("error") };
}

type Exchanged = { cookie: string } | { error: string };

/** Redeems a code over HTTPS. The session comes back in the body; no cookie is sent or kept by the HTTP stack. */
async function exchangeCode(deps: CompleteDeps, body: { attempt: string; code: string; verifier: string }): Promise<Exchanged> {
  const request = (deps.fetch ?? fetch)(`${deps.authBaseURL}${EXCHANGE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "expo-origin": APP_ORIGIN },
    body: JSON.stringify(body),
    credentials: "omit",
  });
  let response: Response;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    response = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out")), EXCHANGE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return { error: OFFLINE_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 429) return { error: TOO_MANY };
  if (!response.ok) return { error: RETURN_FAILED };
  try {
    const data = (await response.json()) as { cookie?: unknown };
    return typeof data.cookie === "string" ? { cookie: data.cookie } : { error: RETURN_FAILED };
  } catch {
    return { error: RETURN_FAILED };
  }
}

/** Signs a session out on the server, best effort: one this device received but won't keep. Never rejects. */
function discardSession(deps: CompleteDeps, setCookie: string): void {
  try {
    const cookie = getCookie(getSetCookie(setCookie, undefined));
    if (!cookie) return;
    void (deps.fetch ?? fetch)(`${deps.authBaseURL}/sign-out`, {
      method: "POST",
      headers: { "content-type": "application/json", "expo-origin": APP_ORIGIN, cookie },
      body: "{}",
      credentials: "omit",
    }).catch(() => {});
  } catch {}
}

/**
 * Finishes the sign-in a return URL belongs to, at most once per attempt. Null when it isn't this device's current
 * attempt (an old, expired, ended, already used, or crafted link): nothing is sent or stored then.
 */
export function completeSignInReturn(params: ReturnParams, deps: CompleteDeps): Promise<SignInOutcome> | null {
  const id = params.attempt;
  if (!id) return null;
  // The same return delivered twice (browser result and route) shares one completion, until the attempt is revoked.
  const existing = completions.get(id);
  if (existing) return existing;
  if (ended.has(id)) return null;
  const log = deps.endedLog ?? appStorage();
  if (isRecordedEnded(id, log) !== false) return null;
  const attempt = readAttempt(deps.storage);
  const now = (deps.now ?? Date.now)();
  if (!attempt || attempt.id !== id || now - attempt.createdAt > ATTEMPT_TTL_MS || attempt.createdAt > now + 60_000) return null;
  // Assigned before the async body reads it (after its first await).
  let run!: Promise<SignInOutcome>;
  run = (async (): Promise<SignInOutcome> => {
    // Used once, whatever happens next.
    await endForGood([id], deps.storage, log, now);
    if (params.error) return { kind: "denied", message: errorMessage(params.error) };
    if (!params.code || !TOKEN.test(params.code)) return { kind: "error", message: RETURN_FAILED };
    // Signing out (or a newer attempt) while this return was on its way ends it: nothing is sent.
    if (completions.get(id) !== run) return ABANDONED;
    const exchanged = await exchangeCode(deps, { attempt: id, code: params.code, verifier: attempt.verifier });
    if ("error" in exchanged) return completions.get(id) === run ? { kind: "error", message: exchanged.error } : ABANDONED;
    const token = sessionTokenInSetCookie(exchanged.cookie);
    if (!token) return { kind: "error", message: RETURN_FAILED };
    // Ended while the exchange was on its way: keep nothing, and sign that session out.
    if (completions.get(id) !== run) {
      discardSession(deps, exchanged.cookie);
      return ABANDONED;
    }
    const jar = cookieJar(deps.storage);
    await jar.merge(exchanged.cookie);
    if (completions.get(id) !== run) {
      // Ended while being stored: take back this session only, never one stored since.
      if (jar.sessionToken() === token) await jar.clear().catch(() => {});
      discardSession(deps, exchanged.cookie);
      return ABANDONED;
    }
    if (jar.sessionToken() !== token) {
      discardSession(deps, exchanged.cookie);
      return { kind: "error", message: STORAGE_FAILED };
    }
    deps.onSessionStored();
    return { kind: "signed-in" };
  })().catch((): SignInOutcome => ({ kind: "error", message: RETURN_FAILED }));
  completions.set(id, run);
  void run.then((outcome) => waiters.get(id)?.(outcome));
  return run;
}

function isNetworkError(error: { status?: number } | null | undefined) {
  return !error || !error.status;
}

let inFlight: Promise<SignInOutcome> | null = null;

/** Runs one Google sign-in; a second call while one is open joins it. */
export function signInWithGoogle(deps: SignInDeps): Promise<SignInOutcome> {
  if (inFlight) return inFlight;
  const run: Promise<SignInOutcome> = runSignIn(deps).finally(() => {
    // Signing out lets a new attempt start before this one has settled; leave that one in place.
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

async function runSignIn(deps: SignInDeps): Promise<SignInOutcome> {
  const now = deps.now ?? Date.now;
  const log = deps.endedLog ?? appStorage();
  let attempt: Attempt;
  let challenge: string;
  try {
    attempt = { id: deps.crypto.randomToken(), verifier: deps.crypto.randomToken(), createdAt: now() };
    if (!TOKEN.test(attempt.id) || !TOKEN.test(attempt.verifier)) throw new Error("Bad random token");
    challenge = await deps.crypto.s256(attempt.verifier);
  } catch {
    return { kind: "error", message: START_FAILED };
  }
  const callbackURL = `${AUTH_CALLBACK_URL}?attempt=${attempt.id}`;
  // Only the newest attempt may finish: one saved before a restart, or still open here, ends now.
  const previous = Array.from(new Set([savedAttemptId(deps.storage), live].filter((id): id is string => !!id)));
  for (const id of previous) revoke(id);
  recordEnded(previous, log, attempt.createdAt);
  try {
    deps.storage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
    if (readAttempt(deps.storage)?.verifier !== attempt.verifier) throw new Error("Attempt not saved");
  } catch {
    ended.add(attempt.id);
    return { kind: "error", message: STORAGE_FAILED };
  }
  live = attempt.id;
  /** Ends this attempt with `outcome`, unless signing out or a newer attempt already ended it. */
  const gaveUp = async (outcome: SignInOutcome): Promise<SignInOutcome> => {
    if (ended.has(attempt.id)) return ABANDONED;
    const recorded = await endForGood([attempt.id], deps.storage, log, now());
    return outcome.kind === "cancelled" && !recorded ? { kind: "cancelled", unrecorded: true } : outcome;
  };

  let started: Awaited<ReturnType<NativeAuthClient["signIn"]["social"]>>;
  try {
    started = await deps.authClient.signIn.social({
      provider: "google",
      callbackURL,
      errorCallbackURL: callbackURL,
      disableRedirect: true,
      additionalData: { nativeSignIn: { challenge, method: "S256" } },
    });
  } catch {
    return gaveUp({ kind: "error", message: OFFLINE_MESSAGE });
  }
  const authorizationURL = started.data && "url" in started.data ? started.data.url : undefined;
  if (started.error || !authorizationURL) {
    const error = started.error as { status?: number } | null;
    if (error?.status === 429) return gaveUp({ kind: "error", message: TOO_MANY });
    return gaveUp({ kind: "error", message: isNetworkError(error) ? OFFLINE_MESSAGE : START_FAILED });
  }
  if (ended.has(attempt.id)) return ABANDONED;

  const query = new URLSearchParams({ authorizationURL });
  const oauthState = oauthStateFromJar(deps.storage);
  if (oauthState) query.set("oauthState", oauthState);
  const platform = deps.platform ?? Platform.OS;
  if (platform === "android") {
    try {
      deps.browser.dismissAuthSession?.();
    } catch {}
  }

  let result: { type: string; url?: string };
  try {
    result = await deps.browser.openAuthSessionAsync(`${deps.authBaseURL}/expo-authorization-proxy?${query}`, AUTH_CALLBACK_URL, { preferEphemeralSession: true });
  } catch {
    return gaveUp({ kind: "error", message: START_FAILED });
  }

  // The auth-callback route may already have the return (Android reports the tab closing first).
  const routed = completions.get(attempt.id);
  if (routed) return await routed;
  if (ended.has(attempt.id)) return ABANDONED;

  if (result.type === "success" && result.url) {
    const params = returnParamsFromUrl(result.url);
    const completion = params?.attempt === attempt.id ? completeSignInReturn(params, deps) : null;
    return completion ? await completion : gaveUp({ kind: "error", message: RETURN_FAILED });
  }
  if (platform === "android") {
    // The route may be about to deliver it: wait briefly, then stop accepting it.
    const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const late = await Promise.race([
      new Promise<SignInOutcome>((resolve) => waiters.set(attempt.id, resolve)),
      wait(ANDROID_RETURN_GRACE_MS).then(() => null),
    ]);
    waiters.delete(attempt.id);
    if (late) return late;
    // Delivered just as the wait ended: finish that one.
    const justRouted = completions.get(attempt.id);
    if (justRouted) return await justRouted;
    if (ended.has(attempt.id)) return ABANDONED;
  }
  // Cancelled: a return that arrives from now on is ignored. (After a restart mid-sign-in there is no browser call
  // waiting here, so the saved attempt still finishes through the auth-callback route.)
  return gaveUp({ kind: "cancelled" });
}

/** Forget every attempt (tests). */
export function resetSignInState() {
  completions.clear();
  waiters.clear();
  ended.clear();
  live = null;
  inFlight = null;
}
