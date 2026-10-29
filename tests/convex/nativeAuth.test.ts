// The native app's Google sign-in and account deletion, through Better Auth's real routes. Better Auth skips
// callback URL validation when NODE_ENV is "test", so this file runs with NODE_ENV "production" (as on a
// deployment) before anything imports it. Google's token endpoint is stubbed; everything else is real: the site's
// Google callback, the Expo plugin's authorization proxy, and the one-time-code handoff (convex/nativeSignInPlugin.ts).
import { vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, { NODE_ENV: "production" });
});

import { convexTest } from "convex-test";
import betterAuthTest from "./betterAuth";
import { parseSetCookieHeader } from "better-auth/cookies";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../../convex/schema";
import { api, components, internal } from "../../convex/_generated/api";
import { DELETED_ACCOUNT_OWNER, DELETION_STEPS } from "../../convex/accountDeletion";
import { NATIVE_APP_ORIGIN, isAllowedNativeAuthorizationURL } from "../../convex/authEnvironment";
import { RETAIN_AFTER_EXPIRY_MS, sha256Base64Url } from "../../convex/nativeSignIn";
import { NATIVE_EXCHANGE_PATH, nativeReturnURL } from "../../convex/nativeSignInPlugin";
import { listOwnedTables } from "../../convex/ownership";

const modules = import.meta.glob("../../convex/**/*.ts");
const SITE_URL = "http://127.0.0.1:3199";

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t, "betterAuth");
  return t;
}

type T = ReturnType<typeof setup>;

/** A request as the native client sends it: no Origin, the app scheme in `expo-origin`, its own cookie jar. */
function native(t: T, method: "GET" | "POST", path: string, options: { body?: unknown; cookie?: string } = {}) {
  return t.fetch(`/api/auth${path}`, {
    method,
    headers: {
      "expo-origin": NATIVE_APP_ORIGIN,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function cookiePairs(setCookie: string): string {
  return Array.from(parseSetCookieHeader(setCookie).entries())
    .filter(([, cookie]) => cookie.value && cookie["max-age"] !== 0)
    .map(([name, cookie]) => `${name}=${cookie.value}`)
    .join("; ");
}

function unsignedJwt(claims: Record<string, unknown>) {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.`;
}

function randomToken() {
  let binary = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(32))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Proof = { attempt: string; verifier: string; challenge: string };

/** What the app keeps for one attempt: a public id, and a private verifier with its S256 challenge. */
async function newProof(): Promise<Proof> {
  const verifier = randomToken();
  return { attempt: randomToken(), verifier, challenge: await sha256Base64Url(verifier) };
}

let googleProfile: { sub: string; email: string; name: string };

beforeEach(() => {
  vi.stubEnv("SITE_URL", SITE_URL);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-better-auth-secret-0123456789abcdef");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
  vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", undefined);
  vi.stubEnv("TEST", undefined);
  googleProfile = { sub: "google-sub-1", email: "reader@example.com", name: "Reader" };
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const idToken = unsignedJwt({ ...googleProfile, email_verified: true, iss: "https://accounts.google.com", aud: "google-client-id", exp: Math.floor(Date.now() / 1000) + 600 });
      return new Response(JSON.stringify({ access_token: "google-access", id_token: idToken, token_type: "Bearer", expires_in: 600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Each full sign-in runs several real Better Auth requests.
vi.setConfig({ testTimeout: 30_000 });

/** Better Auth allows three /sign-in/* requests per ten seconds per client; tests that need more move the clock on. */
function laterBy(ms: number) {
  const next = Date.now() + ms;
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(next);
}

/** POST /sign-in/social as the app sends it. */
function startNative(t: T, proof: Pick<Proof, "attempt" | "challenge">, extra: Record<string, unknown> = {}) {
  const callbackURL = nativeReturnURL(proof.attempt);
  return native(t, "POST", "/sign-in/social", {
    body: {
      provider: "google",
      callbackURL,
      errorCallbackURL: callbackURL,
      disableRedirect: true,
      additionalData: { nativeSignIn: { challenge: proof.challenge, method: "S256" } },
      ...extra,
    },
  });
}

/** The browser tab: the proxy plants the state cookie on the site, Google returns to the site's existing callback. */
async function browserReturn(t: T, authorizationURL: string, google: Record<string, string> = { code: "google-code" }) {
  const proxy = await t.fetch(`/api/auth/expo-authorization-proxy?${new URLSearchParams({ authorizationURL })}`, { method: "GET" });
  expect(proxy.status).toBe(302);
  expect(proxy.headers.get("location")).toBe(authorizationURL);
  const browserCookie = cookiePairs(proxy.headers.get("set-cookie") ?? "");
  expect(browserCookie).toContain("better-auth.state=");
  const state = new URL(authorizationURL).searchParams.get("state")!;
  const callback = await t.fetch(`/api/auth/callback/google?${new URLSearchParams({ ...google, state })}`, {
    method: "GET",
    headers: { cookie: browserCookie },
  });
  expect(callback.status).toBe(302);
  return callback;
}

/** The whole native flow up to the app's return URL. */
async function nativeGoogleSignIn(t: T, proof?: Proof) {
  const own = proof ?? (await newProof());
  const start = await startNative(t, own);
  expect(start.status).toBe(200);
  const started = (await start.json()) as { url: string; redirect: boolean };
  expect(started.redirect).toBe(false);
  const authorizationURL = new URL(started.url);
  expect(`${authorizationURL.origin}${authorizationURL.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(authorizationURL.searchParams.get("redirect_uri")).toBe(`${SITE_URL}/api/auth/callback/google`);
  const callback = await browserReturn(t, started.url);
  return { proof: own, callback, returned: new URL(callback.headers.get("location")!), state: authorizationURL.searchParams.get("state")! };
}

function exchange(t: T, body: Record<string, unknown>) {
  return native(t, "POST", NATIVE_EXCHANGE_PATH, { body });
}

async function signedInNative(t: T) {
  const { returned, proof } = await nativeGoogleSignIn(t);
  const response = await exchange(t, { attempt: proof.attempt, code: returned.searchParams.get("code"), verifier: proof.verifier });
  expect(response.status).toBe(200);
  const cookie = cookiePairs(((await response.json()) as { cookie: string }).cookie);
  const session = (await (await native(t, "GET", "/get-session", { cookie })).json()) as { user: { id: string; email: string }; session: { id: string } };
  return { cookie, authUserId: session.user.id, sessionId: session.session.id, email: session.user.email };
}

async function sessionsOf(t: T, email: string) {
  const user = (await t.query(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "email", value: email }] })) as { _id: string } | null;
  if (!user) return [];
  const page = (await t.query(components.betterAuth.adapter.findMany, {
    model: "session",
    where: [{ field: "userId", value: user._id }],
    paginationOpts: { numItems: 50, cursor: null },
  })) as { page: unknown[] };
  return page.page;
}

describe("native Google sign-in", () => {
  test("S256 is RFC 7636's (its Appendix B example), and the proxy only goes to Google", async () => {
    expect(await sha256Base64Url("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(NATIVE_APP_ORIGIN).toBe("versetogether://");
    expect(isAllowedNativeAuthorizationURL("https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y")).toBe(true);
    for (const url of [
      "https://evil.example/o/oauth2/v2/auth",
      "https://accounts.google.com.evil.example/o/oauth2/v2/auth",
      "http://accounts.google.com/o/oauth2/v2/auth",
      "https://accounts.google.com/logout",
      "https://user:pass@accounts.google.com/o/oauth2/v2/auth",
      "https://accounts.google.com/o/oauth2/v2/auth#frag",
      "javascript:alert(1)",
      undefined,
    ]) {
      expect(isAllowedNativeAuthorizationURL(url), String(url)).toBe(false);
    }
  });

  test("returns only a one-time code to the app, which the app's verifier exchanges over HTTPS for the session", async () => {
    const t = setup();
    const { returned, callback, proof } = await nativeGoogleSignIn(t);

    // The custom-scheme URL: this attempt and a code, nothing else. No session, cookie, verifier or challenge.
    expect(`${returned.protocol}//${returned.host}${returned.pathname}`).toBe("versetogether://auth-callback");
    expect([...returned.searchParams.keys()].sort()).toEqual(["attempt", "code"]);
    expect(returned.searchParams.get("attempt")).toBe(proof.attempt);
    const code = returned.searchParams.get("code")!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const secret of ["session_token", "cookie", proof.verifier, proof.challenge, "convex_jwt"]) expect(returned.href).not.toContain(secret);
    // Nor does the browser tab keep a credential: only expirations are set, and nothing is cached.
    for (const entry of callback.headers.getSetCookie()) expect(entry).toMatch(/Max-Age=0/i);
    expect(callback.headers.get("cache-control")).toBe("no-store");
    expect(callback.headers.get("referrer-policy")).toBe("no-referrer");
    // The stored record has the code's hash and the session id, never the code or a token.
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query("nativeSignIns").collect();
      expect(row.codeHash).toBe(await sha256Base64Url(code));
      expect(JSON.stringify(row)).not.toContain(code);
      expect(JSON.stringify(row)).not.toContain(proof.verifier);
    });

    const response = await exchange(t, { attempt: proof.attempt, code, verifier: proof.verifier });
    expect(response.status).toBe(200);
    // The session is in the body only: no Set-Cookie for a native HTTP stack to keep, and never cached.
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { cookie: setCookie } = (await response.json()) as { cookie: string };
    expect(setCookie).toMatch(/better-auth\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    const cookie = cookiePairs(setCookie);

    // A working session for the same Google account the web uses, and Convex accepts it.
    const session = (await (await native(t, "GET", "/get-session", { cookie })).json()) as { user: { email: string } };
    expect(session.user.email).toBe("reader@example.com");
    const token = (await (await native(t, "GET", "/convex/token", { cookie })).json()) as { token?: string };
    expect(typeof token.token).toBe("string");

    // Used once.
    expect((await exchange(t, { attempt: proof.attempt, code, verifier: proof.verifier })).status).toBe(401);
  });

  test("an intercepted code is useless without the app's verifier, and wrong tries don't use up the app's code", async () => {
    const t = setup();
    const { returned, proof } = await nativeGoogleSignIn(t);
    const code = returned.searchParams.get("code")!;
    const other = await newProof();
    // No verifier, a malformed one, someone else's, and the right verifier with another attempt.
    expect((await exchange(t, { attempt: proof.attempt, code })).status).toBe(400);
    expect((await exchange(t, { attempt: proof.attempt, code, verifier: "short" })).status).toBe(400);
    expect((await exchange(t, { attempt: proof.attempt, code, verifier: other.verifier })).status).toBe(401);
    expect((await exchange(t, { attempt: other.attempt, code, verifier: proof.verifier })).status).toBe(401);
    // A malformed or made-up code.
    expect((await exchange(t, { attempt: proof.attempt, code: "not-a-code", verifier: proof.verifier })).status).toBe(400);
    expect((await exchange(t, { attempt: proof.attempt, code: randomToken(), verifier: proof.verifier })).status).toBe(401);
    // The app still finishes.
    expect((await exchange(t, { attempt: proof.attempt, code, verifier: proof.verifier })).status).toBe(200);
  });

  test("an expired code, or a session revoked before the exchange, signs nothing in", async () => {
    const t = setup();
    const expired = await nativeGoogleSignIn(t);
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query("nativeSignIns").collect();
      await ctx.db.patch(row._id, { codeExpiresAt: Date.now() - 1 });
    });
    const expiredCode = expired.returned.searchParams.get("code")!;
    expect((await exchange(t, { attempt: expired.proof.attempt, code: expiredCode, verifier: expired.proof.verifier })).status).toBe(401);

    // The session is signed out (here: deleted) after Google returned and before the app exchanged its code.
    const revoked = await nativeGoogleSignIn(t);
    const [session] = (await sessionsOf(t, "reader@example.com")).slice(-1) as Array<{ _id: string }>;
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("nativeSignIns").collect()).find((entry) => entry.attempt === revoked.proof.attempt)!;
      expect(row.sessionId).toBe(session._id);
    });
    await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: session._id }] } });
    const code = revoked.returned.searchParams.get("code")!;
    expect((await exchange(t, { attempt: revoked.proof.attempt, code, verifier: revoked.proof.verifier })).status).toBe(401);
  });

  test("an attacker reusing the app's attempt or forging a return with their own code can't swap the account", async () => {
    const t = setup();
    const victim = await newProof();
    const start = await startNative(t, victim);
    const victimURL = ((await start.json()) as { url: string }).url;

    // An attacker who learned the attempt id (and even the challenge) can't bind their own sign-in to it, and the
    // refused attempt leaves the victim's binding untouched.
    const reused = await startNative(t, { attempt: victim.attempt, challenge: victim.challenge });
    expect(reused.status).toBe(400);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("nativeSignIns").collect();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ attempt: victim.attempt, challenge: victim.challenge, state: new URL(victimURL).searchParams.get("state") });
    });

    // The attacker signs in to their own Google account under their own attempt, with the victim's challenge.
    googleProfile = { sub: "google-sub-attacker", email: "attacker@example.com", name: "Attacker" };
    const attacker = await nativeGoogleSignIn(t, { ...(await newProof()), challenge: victim.challenge, verifier: "unknown" });
    const attackerCode = attacker.returned.searchParams.get("code")!;

    // Then forges the victim's return: versetogether://auth-callback?attempt=<victim>&code=<attacker's>. The app
    // exchanges it with its own attempt and verifier, and is refused: the code belongs to another attempt.
    expect((await exchange(t, { attempt: victim.attempt, code: attackerCode, verifier: victim.verifier })).status).toBe(401);

    // The victim's own sign-in still completes, to the victim's account.
    googleProfile = { sub: "google-sub-1", email: "reader@example.com", name: "Reader" };
    const callback = await browserReturn(t, victimURL);
    const returned = new URL(callback.headers.get("location")!);
    expect(returned.searchParams.get("attempt")).toBe(victim.attempt);
    const response = await exchange(t, { attempt: victim.attempt, code: returned.searchParams.get("code"), verifier: victim.verifier });
    expect(response.status).toBe(200);
    const cookie = cookiePairs(((await response.json()) as { cookie: string }).cookie);
    const session = (await (await native(t, "GET", "/get-session", { cookie })).json()) as { user: { email: string } };
    expect(session.user.email).toBe("reader@example.com");
  });

  test("two exchanges of the same code at once: exactly one gets the session", async () => {
    const t = setup();
    const { returned, proof } = await nativeGoogleSignIn(t);
    const body = { attempt: proof.attempt, code: returned.searchParams.get("code"), verifier: proof.verifier };
    const statuses = (await Promise.all([exchange(t, body), exchange(t, body)])).map((response) => response.status).sort();
    expect(statuses).toEqual([200, 401]);
  });

  test("the exchange is rate limited", async () => {
    const t = setup();
    const proof = await newProof();
    const guess = { attempt: proof.attempt, verifier: proof.verifier };
    for (let i = 0; i < 10; i++) expect((await exchange(t, { ...guess, code: randomToken() })).status).toBe(401);
    expect((await exchange(t, { ...guess, code: randomToken() })).status).toBe(429);
  });

  test("a web sign-in is unchanged: back to the site with its session cookie, nothing in the URL", async () => {
    const t = setup();
    const start = await t.fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { origin: SITE_URL, "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: `${SITE_URL}/notes`, disableRedirect: true }),
    });
    expect(start.status).toBe(200);
    const started = (await start.json()) as { url: string };
    const startCookie = cookiePairs(start.headers.get("set-cookie") ?? "");
    const state = new URL(started.url).searchParams.get("state")!;
    const callback = await t.fetch(`/api/auth/callback/google?${new URLSearchParams({ code: "google-code", state })}`, {
      method: "GET",
      headers: { cookie: startCookie },
    });
    expect(callback.status).toBe(302);
    const returned = new URL(callback.headers.get("location")!);
    expect(returned.href).toBe(`${SITE_URL}/notes`);
    expect(callback.headers.get("set-cookie")).toMatch(/better-auth\.session_token=[^;]+/);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("nativeSignIns").collect()).toEqual([]);
    });
  });

  test("Google's refusal comes back to the app as an error, with no code and no session", async () => {
    const t = setup();
    const proof = await newProof();
    const started = (await (await startNative(t, proof)).json()) as { url: string };
    const callback = await browserReturn(t, started.url, { error: "access_denied" });
    const location = new URL(callback.headers.get("location")!);
    expect(location.href).toBe(`versetogether://auth-callback?attempt=${proof.attempt}&error=access_denied`);
    for (const entry of callback.headers.getSetCookie()) expect(entry).toMatch(/Max-Age=0/i);
    expect(await sessionsOf(t, "reader@example.com")).toEqual([]);
  });

  test("a callback after the attempt expired issues no code and revokes the session it made", async () => {
    const t = setup();
    const proof = await newProof();
    const started = (await (await startNative(t, proof)).json()) as { url: string };
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query("nativeSignIns").collect();
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
    });
    const callback = await browserReturn(t, started.url);
    expect(callback.headers.get("location")).toBe(`versetogether://auth-callback?attempt=${proof.attempt}&error=sign_in_failed`);
    expect(await sessionsOf(t, "reader@example.com")).toEqual([]);
  });

  test("the app scheme is accepted only in the exact native sign-in shape, and the proxy refuses anything but Google", async () => {
    const t = setup();
    const proof = await newProof();
    const callbackURL = nativeReturnURL(proof.attempt);
    const nativeBody = { provider: "google", callbackURL, errorCallbackURL: callbackURL, disableRedirect: true };
    const handoff = { nativeSignIn: { challenge: proof.challenge, method: "S256" } };
    const refused: Array<[string, string, Record<string, unknown>]> = [
      // No proof at all: the old cookie-in-the-URL flow.
      ["no challenge", "/sign-in/social", nativeBody],
      ["plain method", "/sign-in/social", { ...nativeBody, additionalData: { nativeSignIn: { challenge: proof.challenge, method: "plain" } } }],
      ["bad challenge", "/sign-in/social", { ...nativeBody, additionalData: { nativeSignIn: { challenge: "x", method: "S256" } } }],
      ["extra data", "/sign-in/social", { ...nativeBody, additionalData: { ...handoff, other: 1 } }],
      ["other error URL", "/sign-in/social", { ...nativeBody, errorCallbackURL: "versetogether://elsewhere", additionalData: handoff }],
      ["new-user URL", "/sign-in/social", { ...nativeBody, newUserCallbackURL: callbackURL, additionalData: handoff }],
      ["other path", "/sign-in/social", { ...nativeBody, callbackURL: "versetogether://evil?attempt=" + proof.attempt, errorCallbackURL: "versetogether://evil?attempt=" + proof.attempt, additionalData: handoff }],
      ["extra query", "/sign-in/social", { ...nativeBody, callbackURL: `${callbackURL}&cookie=x`, errorCallbackURL: `${callbackURL}&cookie=x`, additionalData: handoff }],
      ["web return with handoff", "/sign-in/social", { provider: "google", callbackURL: `${SITE_URL}/notes`, additionalData: handoff }],
      ["linking", "/link-social", { provider: "google", callbackURL, additionalData: handoff }],
    ];
    for (const [label, path, body] of refused) {
      laterBy(11_000);
      const response = await native(t, "POST", path, { body });
      expect(response.status, label).toBe(400);
    }
    // Not trusted at all (Better Auth's own origin check), including the app scheme in another case.
    for (const url of ["otherapp://auth-callback", "https://evil.example/steal", callbackURL.toUpperCase()]) {
      laterBy(11_000);
      const response = await native(t, "POST", "/sign-in/social", { body: { ...nativeBody, callbackURL: url, errorCallbackURL: url, additionalData: handoff } });
      expect(response.status, url).toBe(403);
    }
    // None of those created a binding (they were refused before Better Auth made a transaction).
    await t.run(async (ctx) => {
      expect(await ctx.db.query("nativeSignIns").collect()).toEqual([]);
    });
    const proxy = await t.fetch(`/api/auth/expo-authorization-proxy?${new URLSearchParams({ authorizationURL: "https://evil.example/?state=x" })}`, { method: "GET" });
    expect(proxy.status).toBe(400);
    expect(proxy.headers.get("location")).toBeNull();
  });

  test("expired handoffs are swept, revoking a session whose code was never redeemed", async () => {
    const t = setup();
    const unredeemed = await nativeGoogleSignIn(t);
    const redeemed = await signedInNative(t);
    expect(await sessionsOf(t, "reader@example.com")).toHaveLength(2);
    laterBy(20 * 60 * 1000 + RETAIN_AFTER_EXPIRY_MS);
    expect(await t.mutation(internal.nativeSignIn.sweepExpired, {})).toEqual({ deleted: 2, revoked: 1 });
    const left = (await sessionsOf(t, "reader@example.com")) as Array<{ _id: string }>;
    expect(left.map((session) => session._id)).toEqual([redeemed.sessionId]);
    expect(unredeemed.returned.searchParams.get("code")).toBeTruthy();
    await t.run(async (ctx) => {
      expect(await ctx.db.query("nativeSignIns").collect()).toEqual([]);
    });
  });

  test("a browser on another site can't use a native session's cookie", async () => {
    const t = setup();
    const { cookie } = await signedInNative(t);
    const response = await t.fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { origin: "https://evil.example", cookie, "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });
});

/** Rows of every owned table for `owner`, as the app's own functions would leave them. */
async function seedOwnedRows(t: T, owner: string, authUserId?: string) {
  const now = Date.now();
  await t.run(async (ctx) => {
    if (authUserId) {
      await ctx.db.insert("users", { clerkId: owner, authUserId, authLinkedAt: now, authLinkSource: "better-auth-signup", createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("readerPreferences", { clerkId: owner, showFootnotes: true, fontScale: 1, fontFamily: "serif", updatedAt: now } as never);
    const draftId = await ctx.db.insert("insightDrafts", { clerkId: owner, title: "Note", status: "draft", visibility: "private", tags: [], markdownBody: "x", createdAt: now, updatedAt: now, lastActiveAt: now });
    await ctx.db.insert("insightDraftBlocks", { draftId, type: "text", order: 0, text: "x", createdAt: now, updatedAt: now });
    const folderId = await ctx.db.insert("noteFolders", { clerkId: owner, name: "F", createdAt: now, updatedAt: now });
    await ctx.db.insert("noteFolderAssignments", { clerkId: owner, draftId, folderId, updatedAt: now });
    const shareId = await ctx.db.insert("scriptureShares", { clerkId: owner, volume: "bookofmormon", book: "alma", chapter: 32, verseStart: 21, verseEnd: 21, createdAt: now });
    await ctx.db.insert("scriptureComments", { shareId, clerkId: "someone-else", body: "On their share", visibility: "public", createdAt: now, updatedAt: now });
    await ctx.db.insert("scriptureReactions", { shareId, clerkId: "someone-else", reaction: "heart", createdAt: now });
    await ctx.db.insert("verseAnnotations", { clerkId: owner, volume: "bookofmormon", book: "alma", chapter: 32, verse: 21, body: "Faith", visibility: "private", createdAt: now, updatedAt: now });
    await ctx.db.insert("guideHighlights", { clerkId: owner, guide: "g", part: "reader", startBlock: "b", startOffset: 0, endBlock: "b", endOffset: 1, exact: "x", prefix: "", suffix: "", highlightColor: "yellow", createdAt: now, updatedAt: now });
    await ctx.db.insert("chapterReads", { clerkId: owner, volume: "bookofmormon", book: "alma", chapter: 32, readAt: now });
    await ctx.db.insert("lastReadingPositions", { clerkId: owner, volume: "bookofmormon", book: "alma", chapter: 32, updatedAt: now });
    await ctx.db.insert("journalEntryDeletions", { clerkId: owner, key: "k", deletedAt: now });
    await ctx.db.insert("deviceStudyImports", { clerkId: owner, deviceId: "device-1", recordId: String(draftId) });
    await ctx.db.insert("friendships", { requesterClerkId: owner, addresseeClerkId: "someone-else", status: "accepted", createdAt: now, updatedAt: now });
    await ctx.db.insert("feedback", { clerkId: owner, message: "Hello there", contact: "reader@example.com", createdAt: now });
    await ctx.db.insert("scriptureResources", { volume: "bookofmormon", book: "alma", resourceType: "chapter", title: "Link", chapterStart: 32, chapterEnd: 32, createdByClerkId: owner, createdAt: now, updatedAt: now });
  });
}

describe("account deletion", () => {
  test("covers every table that stores an app owner key", () => {
    const ownerFields = /clerkid/i;
    const owned = Object.entries(schema.tables)
      .filter(([, table]) => {
        const json = (table as unknown as { validator: { json: { value: Record<string, unknown> } } }).validator.json;
        return Object.keys(json.value ?? {}).some((field) => ownerFields.test(field));
      })
      .map(([name]) => name)
      // The deletion record itself names the owner being swept.
      .filter((name) => name !== "accountDeletions");
    expect(owned.sort()).toEqual(Object.keys(DELETION_STEPS).sort());
  });

  test("the signed-in owner deletes their account and all of its study; others keep theirs", async () => {
    const t = setup();
    const { cookie, authUserId } = await signedInNative(t);
    await seedOwnedRows(t, authUserId, authUserId);
    await seedOwnedRows(t, "other-owner", "other-auth-user");
    await t.run(async (ctx) => {
      // Someone else's anonymous feedback and their comment elsewhere stay.
      await ctx.db.insert("feedback", { message: "Anonymous note", createdAt: Date.now() });
    });

    const response = await native(t, "POST", "/delete-user", { body: {}, cookie });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { message: string }).message).toBe("User deleted");

    await t.run(async (ctx) => {
      expect(await listOwnedTables(ctx, authUserId)).toEqual([]);
      expect(await ctx.db.query("users").withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId)).first()).toBeNull();
      expect(await ctx.db.query("feedback").withIndex("by_clerk_id", (q) => q.eq("clerkId", authUserId)).first()).toBeNull();
      expect(await ctx.db.query("accountDeletions").collect()).toEqual([]);
      // Comments and reactions others left on the deleted shares go with them.
      expect(await ctx.db.query("scriptureComments").collect()).toHaveLength(1);
      // Shared reference links stay, credited to no one.
      const resources = await ctx.db.query("scriptureResources").collect();
      expect(resources.map((row) => row.createdByClerkId).sort()).toEqual([DELETED_ACCOUNT_OWNER, "other-owner"]);
      expect((await ctx.db.query("feedback").collect()).map((row) => row.message).sort()).toEqual(["Anonymous note", "Hello there"]);
      expect((await listOwnedTables(ctx, "other-owner")).length).toBeGreaterThan(10);
    });
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "_id", value: authUserId }] })).toBeNull();
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "account", where: [{ field: "userId", value: authUserId }] })).toBeNull();
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "userId", value: authUserId }] })).toBeNull();
    // The old cookie no longer works.
    expect(await (await native(t, "GET", "/get-session", { cookie })).json()).toBeNull();
  });

  test("a session that isn't fresh must sign in again first, and nothing is deleted", async () => {
    const t = setup();
    const { cookie, authUserId, sessionId } = await signedInNative(t);
    await seedOwnedRows(t, authUserId, authUserId);
    await t.mutation(components.betterAuth.adapter.updateOne, {
      input: { model: "session", where: [{ field: "_id", value: sessionId }], update: { createdAt: Date.now() - 2 * 24 * 3600 * 1000 } },
    });
    const response = await native(t, "POST", "/delete-user", { body: {}, cookie });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("SESSION_EXPIRED");
    await t.run(async (ctx) => {
      expect((await listOwnedTables(ctx, authUserId)).length).toBeGreaterThan(10);
      expect(await ctx.db.query("users").withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId)).first()).not.toBeNull();
    });
  });

  test("refuses without a session, from another site, or with a password or token while those are off", async () => {
    const t = setup();
    expect((await native(t, "POST", "/delete-user", { body: {} })).status).toBe(401);
    const { cookie, authUserId } = await signedInNative(t);
    await seedOwnedRows(t, authUserId, authUserId);
    const crossSite = await t.fetch("/api/auth/delete-user", {
      method: "POST",
      headers: { origin: "https://evil.example", cookie, "content-type": "application/json" },
      body: "{}",
    });
    expect(crossSite.status).toBe(403);
    expect((await native(t, "POST", "/delete-user", { body: { password: "guess-guess-guess" }, cookie })).status).toBe(400);
    // Three attempts a minute.
    expect((await native(t, "POST", "/delete-user", { body: {}, cookie })).status).toBe(429);
    expect((await native(t, "GET", "/delete-user/callback?token=abc")).status).toBe(404);
    await t.run(async (ctx) => {
      expect((await listOwnedTables(ctx, authUserId)).length).toBeGreaterThan(10);
    });
  });

  test("refuses a deletion token, which is never issued", async () => {
    const t = setup();
    const { cookie, authUserId } = await signedInNative(t);
    await seedOwnedRows(t, authUserId, authUserId);
    expect((await native(t, "POST", "/delete-user", { body: { token: "abc" }, cookie })).status).toBe(400);
    await t.run(async (ctx) => {
      expect((await listOwnedTables(ctx, authUserId)).length).toBeGreaterThan(10);
    });
  });

  test("a deletion that stopped partway resumes on retry and can't be undone by provisioning", async () => {
    const t = setup();
    const { authUserId, sessionId } = await signedInNative(t);
    await seedOwnedRows(t, authUserId, authUserId);
    // The first step ran (users row gone, record kept), then the request failed.
    expect(await t.mutation(internal.accountDeletion.begin, { authUserId })).toBe(authUserId);
    await expect(t.withIdentity({ subject: authUserId, sessionId }).mutation(api.users.ensureCurrentUser, {})).rejects.toThrow(
      /being deleted/
    );
    // Retrying finds the same owner through the record and finishes.
    expect(await t.mutation(internal.accountDeletion.begin, { authUserId })).toBe(authUserId);
    let rounds = 0;
    while (!(await t.mutation(internal.accountDeletion.sweep, { clerkId: authUserId })).done) rounds++;
    expect(rounds).toBe(0);
    await t.run(async (ctx) => {
      expect(await listOwnedTables(ctx, authUserId)).toEqual([]);
    });
  });

  test("an interrupted deletion is shown only to its owner, and finished by deleting again through the real route", async () => {
    const t = setup();
    const owner = await signedInNative(t);
    await seedOwnedRows(t, owner.authUserId, owner.authUserId);
    googleProfile = { sub: "google-sub-2", email: "other@example.com", name: "Other" };
    const other = await signedInNative(t);
    await seedOwnedRows(t, other.authUserId, other.authUserId);
    const asOwner = t.withIdentity({ subject: owner.authUserId, sessionId: owner.sessionId });
    const asOther = t.withIdentity({ subject: other.authUserId, sessionId: other.sessionId });
    expect(await asOwner.query(api.accountDeletion.pending, {})).toBeNull();
    expect(await asOwner.query(api.users.accountStatus, {})).toEqual({ viewer: expect.objectContaining({ appUserId: owner.authUserId }), deletion: null });

    // The deletion started (users row gone, record kept), then the request failed.
    await t.mutation(internal.accountDeletion.begin, { authUserId: owner.authUserId });
    const pending = await asOwner.query(api.accountDeletion.pending, {});
    expect(pending).toEqual({ appUserId: owner.authUserId, startedAt: expect.any(Number) });
    expect(await asOwner.query(api.users.viewer, {})).toBeNull();
    // One read shows both sides of that step: never the viewer gone without the deletion that removed it.
    expect(await asOwner.query(api.users.accountStatus, {})).toEqual({ viewer: null, deletion: pending });
    expect(await t.query(api.users.accountStatus, {})).toBeNull();
    await expect(asOwner.mutation(api.users.ensureCurrentUser, {})).rejects.toThrow(/being deleted/);
    // Nobody else sees it, and their account works as before.
    expect(await asOther.query(api.accountDeletion.pending, {})).toBeNull();
    expect(await t.query(api.accountDeletion.pending, {})).toBeNull();
    expect((await asOther.mutation(api.users.ensureCurrentUser, {})).appUserId).toBe(other.authUserId);

    // The owner's same session finishes it through POST /delete-user.
    const response = await native(t, "POST", "/delete-user", { body: {}, cookie: owner.cookie });
    expect(response.status).toBe(200);
    await t.run(async (ctx) => {
      expect(await listOwnedTables(ctx, owner.authUserId)).toEqual([]);
      expect(await ctx.db.query("accountDeletions").collect()).toEqual([]);
      expect((await listOwnedTables(ctx, other.authUserId)).length).toBeGreaterThan(10);
    });
    // The session went with the account.
    expect(await asOwner.query(api.accountDeletion.pending, {})).toBeNull();
    expect(await (await native(t, "GET", "/get-session", { cookie: other.cookie })).json()).not.toBeNull();
  });

  test("large accounts are swept in bounded batches", async () => {
    const t = setup();
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 450; i++) {
        await ctx.db.insert("chapterReads", { clerkId: "big-owner", volume: "bookofmormon", book: "alma", chapter: i, readAt: now });
      }
    });
    const results = [];
    for (;;) {
      const result = await t.mutation(internal.accountDeletion.sweep, { clerkId: "big-owner" });
      results.push(result.done);
      if (result.done) break;
    }
    expect(results).toEqual([false, false, true]);
    await expect(t.mutation(internal.accountDeletion.sweep, { clerkId: DELETED_ACCOUNT_OWNER })).rejects.toThrow();
  });
});
