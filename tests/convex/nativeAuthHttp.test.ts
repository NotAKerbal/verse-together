import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "../../convex/schema";
import { grantIdentifier, sha256Base64Url } from "../../convex/nativeAuthRules";
import { components } from "../../convex/_generated/api";

// The desktop sign-in endpoints (convex/nativeAuth.ts) through Better Auth's real HTTP handler.
const modules = import.meta.glob("../../convex/**/*.ts");
const ORIGIN = "http://127.0.0.1:3199";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t, "betterAuth");
  return t;
}
type T = ReturnType<typeof setup>;

function post(t: T, path: string, body: unknown, headers: Record<string, string> = {}) {
  return t.fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

/** A signed-in website session (email sign-up stands in for Google in the test deployment). */
async function websiteCookie(t: T): Promise<string> {
  const response = await post(t, "/sign-up/email", {
    email: "reader@example.com",
    password: "correct-horse-battery-staple",
    name: "Reader",
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie") ?? "";
  const session = cookie.split(/,(?=\s*[\w.-]+=)/).map(c => c.split(";")[0].trim()).find(c => c.includes("session_token="));
  expect(session).toBeTruthy();
  return session!;
}

async function grant(t: T, cookie: string) {
  const response = await post(t, "/native/grant", { challenge: await sha256Base64Url(VERIFIER) }, { cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as { code: string }).code;
}

beforeEach(() => {
  vi.stubEnv("SITE_URL", ORIGIN);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-better-auth-secret-0123456789abcdef");
  vi.stubEnv("AUTH_PROXY_SECRET", "p".repeat(40));
  vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("desktop sign-in", () => {
  test("an approved code becomes the app's own bearer session, once", async () => {
    const t = setup();
    const cookie = await websiteCookie(t);
    const code = await grant(t, cookie);

    const exchanged = await post(t, "/native/token", { code, verifier: VERIFIER });
    expect(exchanged.status).toBe(200);
    const body = (await exchanged.json()) as { token: string; user: { email: string } };
    expect(body.user.email).toBe("reader@example.com");
    expect(body.token.length).toBeGreaterThan(20);

    // The token works as a bearer session, including for the Convex JWT the app syncs with.
    const session = await t.fetch("/api/auth/get-session", { headers: { authorization: `Bearer ${body.token}` } });
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe("reader@example.com");
    const jwt = await t.fetch("/api/auth/convex/token", { headers: { authorization: `Bearer ${body.token}` } });
    expect(jwt.status).toBe(200);
    expect(((await jwt.json()) as { token: string }).token.split(".")).toHaveLength(3);

    // A code is single use.
    expect((await post(t, "/native/token", { code, verifier: VERIFIER })).status).toBe(401);

    // Signing the app out ends only the app's session.
    const out = await post(t, "/sign-out", {}, { authorization: `Bearer ${body.token}` });
    expect(out.status).toBe(200);
    const after = await t.fetch("/api/auth/get-session", { headers: { authorization: `Bearer ${body.token}` } });
    expect(await after.json()).toBeNull();
    const website = await t.fetch("/api/auth/get-session", { headers: { cookie } });
    expect(((await website.json()) as { user: { email: string } }).user.email).toBe("reader@example.com");
    // The first Convex JWT generates the deployment's signing keys, which takes a few seconds in the test runtime.
  }, 60_000);

  test("a code without the matching verifier is refused and burned", async () => {
    const t = setup();
    const code = await grant(t, await websiteCookie(t));
    const wrong = "x".repeat(43);
    expect((await post(t, "/native/token", { code, verifier: wrong })).status).toBe(401);
    // An interceptor that saw the code first used it up; the real app must start again.
    expect((await post(t, "/native/token", { code, verifier: VERIFIER })).status).toBe(401);
  });

  test("approval requires a signed-in website session and a valid challenge", async () => {
    const t = setup();
    expect((await post(t, "/native/grant", { challenge: await sha256Base64Url(VERIFIER) })).status).toBe(401);
    const cookie = await websiteCookie(t);
    expect((await post(t, "/native/grant", { challenge: "short" }, { cookie })).status).toBe(400);
    expect((await post(t, "/native/token", { code: "made-up", verifier: VERIFIER })).status).toBe(401);
  });

  test("an expired approval can't be exchanged", async () => {
    const t = setup();
    const response = await post(t, "/sign-up/email", { email: "late@example.com", password: "correct-horse-battery-staple", name: "Late" });
    const { user } = (await response.json()) as { user: { id: string } };
    const code = "expired-code-0123456789abcdefghijklmnopqrstuv";
    const now = Date.now();
    await t.mutation(components.betterAuth.adapter.create, {
      input: {
        model: "verification",
        data: {
          identifier: await grantIdentifier(code),
          value: JSON.stringify({ userId: user.id, challenge: await sha256Base64Url(VERIFIER) }),
          expiresAt: now - 1000,
          createdAt: now - 130_000,
          updatedAt: now - 130_000,
        },
      },
    });
    expect((await post(t, "/native/token", { code, verifier: VERIFIER })).status).toBe(401);
  });

  test("a page from another origin can't approve with the reader's cookie", async () => {
    const t = setup();
    const cookie = await websiteCookie(t);
    const forged = await post(
      t,
      "/native/grant",
      { challenge: await sha256Base64Url(VERIFIER) },
      { cookie, origin: "https://evil.example" }
    );
    expect(forged.status).toBe(403);
  });

  test("two exchanges of one code at once: exactly one session", async () => {
    const t = setup();
    const code = await grant(t, await websiteCookie(t));
    const results = await Promise.all([
      post(t, "/native/token", { code, verifier: VERIFIER }),
      post(t, "/native/token", { code, verifier: VERIFIER }),
      post(t, "/native/token", { code, verifier: VERIFIER }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401, 401]);
  });

  test("approval is refused when the browser's account changed since the page showed it", async () => {
    const t = setup();
    const cookie = await websiteCookie(t);
    const session = (await (await t.fetch("/api/auth/get-session", { headers: { cookie } })).json()) as { user: { id: string } };
    const challenge = await sha256Base64Url(VERIFIER);
    expect((await post(t, "/native/grant", { challenge, expectedUserId: "someone-else" }, { cookie })).status).toBe(409);
    expect((await post(t, "/native/grant", { challenge, expectedUserId: session.user.id }, { cookie })).status).toBe(200);
    // Signed out of the website, the page can't approve anything.
    expect((await post(t, "/sign-out", {}, { cookie })).status).toBe(200);
    expect((await post(t, "/native/grant", { challenge }, { cookie })).status).toBe(401);
  });

  test("the app's session manages the account as the website's does", async () => {
    const t = setup();
    const cookie = await websiteCookie(t);
    const code = await grant(t, cookie);
    const { token } = (await (await post(t, "/native/token", { code, verifier: VERIFIER })).json()) as { token: string };
    const bearer = { authorization: `Bearer ${token}` };
    const sessions = (await (await t.fetch("/api/auth/list-sessions", { headers: bearer })).json()) as Array<{ userAgent: string }>;
    expect(sessions.map((s) => s.userAgent)).toContain("Verse Together desktop");
    const accounts = (await (await t.fetch("/api/auth/list-accounts", { headers: bearer })).json()) as Array<{ providerId: string }>;
    expect(accounts.map((a) => a.providerId)).toContain("credential");
    // A request carrying only the bearer token (as the app sends) is not subject to the browser origin check.
    const renamed = await t.fetch("/api/auth/update-user", {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer },
      body: JSON.stringify({ name: "Renamed from the app" }),
    });
    expect(renamed.status).toBe(200);
    const after = (await (await t.fetch("/api/auth/get-session", { headers: { cookie } })).json()) as { user: { name: string } };
    expect(after.user.name).toBe("Renamed from the app");
    const others = await t.fetch("/api/auth/revoke-other-sessions", {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer },
      body: "{}",
    });
    expect(others.status).toBe(200);
    // The website's session was one of the others; the app's stays.
    expect(await (await t.fetch("/api/auth/get-session", { headers: { cookie } })).json()).toBeNull();
    expect(((await (await t.fetch("/api/auth/get-session", { headers: bearer })).json()) as { user: { name: string } }).user.name).toBe("Renamed from the app");
  }, 30_000);
});
