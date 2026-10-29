// The Google-only rollout: email/password stays off by default, even with Resend configured and even
// for users that already have a password, while Google sign-in keeps working.
import { convexTest } from "convex-test";
import betterAuthTest from "./betterAuth";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "../../convex/schema";
import { api, components } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
const SITE_URL = "http://127.0.0.1:3199";
const EMAIL = "existing@example.com";
const PASSWORD = "correct-horse-battery";
const GOOGLE_ONLY = { passkey: true, emailPassword: false, google: true, emailDelivery: false, requireEmailVerification: false };

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t, "betterAuth");
  return t;
}

type T = ReturnType<typeof setup>;

function call(t: T, method: "GET" | "POST", path: string, options: { body?: unknown; cookie?: string } = {}) {
  return t.fetch(`/api/auth${path}`, {
    method,
    headers: {
      origin: SITE_URL,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function enableEmailPassword(enabled: boolean) {
  vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", enabled ? "true" : undefined);
}

function configureResend() {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("AUTH_EMAIL_FROM", "Verse Together <no-reply@versetogether.org>");
}

/**
 * Creates a user with a credential (password) account and a live session, as if they had signed up
 * while email/password was enabled (without verification email), then restores Google-only mode.
 */
async function createPasswordUser(t: T, { resend }: { resend: boolean }) {
  vi.stubEnv("RESEND_API_KEY", undefined);
  enableEmailPassword(true);
  const response = await call(t, "POST", "/sign-up/email", { body: { name: "Existing", email: EMAIL, password: PASSWORD } });
  expect(response.status).toBe(200);
  enableEmailPassword(false);
  if (resend) configureResend();
  const user = await t.query(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "email", value: EMAIL }] });
  const credential = await t.query(components.betterAuth.adapter.findOne, {
    model: "account",
    where: [
      { field: "userId", value: String(user!._id) },
      { field: "providerId", value: "credential" },
    ],
  });
  expect(credential).not.toBeNull();
  return { cookie: cookieHeader(response) };
}

async function base64UrlSha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let resendCalls: string[];

beforeEach(() => {
  vi.stubEnv("SITE_URL", SITE_URL);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-better-auth-secret-0123456789abcdef");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
  // Only the explicit flag may enable email/password; make sure nothing leaks in from the shell.
  vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", undefined);
  vi.stubEnv("RESEND_API_KEY", undefined);
  vi.stubEnv("AUTH_EMAIL_FROM", undefined);
  resendCalls = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.resend.com/")) {
      resendCalls.push(url);
      return new Response(JSON.stringify({ id: "test" }), { status: 200 });
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const resendModes = [
  { label: "without Resend", resend: false },
  { label: "with Resend configured", resend: true },
];

describe.each(resendModes)("Google-only by default ($label)", ({ resend }) => {
  beforeEach(() => {
    if (resend) configureResend();
  });

  test("capabilities report Google only", async () => {
    const t = setup();
    expect(await t.query(api.auth.capabilities, {})).toEqual(GOOGLE_ONLY);
  });

  test("every email/password endpoint is refused, even for an existing password user", async () => {
    const t = setup();
    const { cookie } = await createPasswordUser(t, { resend });
    expect(cookie).toContain("session_token=");

    const refused: Array<[string, Promise<Response>]> = [
      ["sign in", call(t, "POST", "/sign-in/email", { body: { email: EMAIL, password: PASSWORD } })],
      ["sign up", call(t, "POST", "/sign-up/email", { body: { name: "New", email: "new@example.com", password: PASSWORD } })],
      ["request reset", call(t, "POST", "/request-password-reset", { body: { email: EMAIL, redirectTo: "/reset-password" } })],
      ["reset link callback", call(t, "GET", "/reset-password/some-token?callbackURL=%2Freset-password")],
      ["reset", call(t, "POST", "/reset-password", { body: { newPassword: "another-password-1", token: "some-token" } })],
      [
        "change password",
        call(t, "POST", "/change-password", {
          cookie,
          body: { currentPassword: PASSWORD, newPassword: "another-password-1", revokeOtherSessions: true },
        }),
      ],
      ["verify password", call(t, "POST", "/verify-password", { cookie, body: { password: PASSWORD } })],
      ["send verification", call(t, "POST", "/send-verification-email", { cookie, body: { email: EMAIL } })],
      ["verify email", call(t, "GET", "/verify-email?token=some-token")],
      ["change email", call(t, "POST", "/change-email", { cookie, body: { newEmail: "moved@example.com" } })],
    ];
    for (const [label, pending] of refused) {
      const response = await pending;
      expect({ label, status: response.status }).toEqual({ label, status: 404 });
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.getSetCookie().some((cookie) => cookie.includes("session_token=") && !cookie.includes("Max-Age=0"))).toBe(
        false
      );
    }
    expect(resendCalls).toEqual([]);

    // Nothing changed: the existing session still works, and the password and email are untouched.
    const session = await (await call(t, "GET", "/get-session", { cookie })).json();
    expect(session?.user?.email).toBe(EMAIL);
    // (Without Resend, so the unconfirmed test address may sign in with its original password.)
    vi.stubEnv("RESEND_API_KEY", undefined);
    enableEmailPassword(true);
    expect((await call(t, "POST", "/sign-in/email", { body: { email: EMAIL, password: PASSWORD } })).status).toBe(200);
  });

  test("Google sign-in starts with a fresh state and an S256 PKCE challenge", async () => {
    const t = setup();
    const response = await call(t, "POST", "/sign-in/social", {
      body: { provider: "google", callbackURL: "/notes", errorCallbackURL: "/sign-in?redirect=%2Fnotes" },
    });
    expect(response.status).toBe(200);
    const { url, redirect } = (await response.json()) as { url: string; redirect: boolean };
    expect(redirect).toBe(true);

    const authorize = new URL(url);
    expect(authorize.origin).toBe("https://accounts.google.com");
    const params = authorize.searchParams;
    expect(params.get("client_id")).toBe("google-client-id");
    expect(params.get("redirect_uri")).toBe(`${SITE_URL}/api/auth/callback/google`);
    expect(params.get("response_type")).toBe("code");
    expect(params.get("prompt")).toBe("select_account");
    expect(params.get("scope")?.split(" ")).toEqual(expect.arrayContaining(["openid", "email", "profile"]));
    expect(params.get("code_challenge_method")).toBe("S256");
    const state = params.get("state");
    const challenge = params.get("code_challenge");
    expect(state).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // The browser is bound to this state by a signed cookie, and the server-side record holds the
    // verifier for exactly this challenge plus the validated return paths.
    expect(response.headers.getSetCookie().some((cookie) => /state=/.test(cookie) && cookie.includes(state!))).toBe(true);
    const record = await t.query(components.betterAuth.adapter.findOne, {
      model: "verification",
      where: [{ field: "identifier", value: state! }],
    });
    expect(record).not.toBeNull();
    const stored = JSON.parse(String(record!.value)) as { codeVerifier: string; callbackURL: string; errorURL?: string };
    expect(await base64UrlSha256(stored.codeVerifier)).toBe(challenge);
    expect(stored.callbackURL).toBe("/notes");
    expect(stored.errorURL).toBe("/sign-in?redirect=%2Fnotes");

    // A second attempt gets its own state and challenge.
    const again = (await (
      await call(t, "POST", "/sign-in/social", { body: { provider: "google", callbackURL: "/notes" } })
    ).json()) as { url: string };
    const againParams = new URL(again.url).searchParams;
    expect(againParams.get("state")).not.toBe(state);
    expect(againParams.get("code_challenge")).not.toBe(challenge);
    expect(resendCalls).toEqual([]);
  });
});

describe("future email/password mode (AUTH_EMAIL_PASSWORD_ENABLED=true)", () => {
  test("the same routes are served again once explicitly enabled", async () => {
    const t = setup();
    const { cookie } = await createPasswordUser(t, { resend: true });
    enableEmailPassword(true);
    expect(await t.query(api.auth.capabilities, {})).toEqual({
      passkey: true,
      emailPassword: true,
      google: true,
      emailDelivery: true,
      requireEmailVerification: true,
    });
    expect((await call(t, "POST", "/verify-password", { cookie, body: { password: PASSWORD } })).status).toBe(200);
    resendCalls = [];
    expect((await call(t, "POST", "/request-password-reset", { body: { email: EMAIL, redirectTo: "/reset-password" } })).status).toBe(
      200
    );
    expect(resendCalls).toEqual(["https://api.resend.com/emails"]);
    // An unknown token still reaches Better Auth, which redirects with an error instead of a 404.
    const callback = await call(t, "GET", "/reset-password/some-token?callbackURL=%2Freset-password");
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toContain("error=INVALID_TOKEN");
  });
});
