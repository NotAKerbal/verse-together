// Google return URLs built by the app's sign-in controls, checked by Better Auth's real callback URL
// validation. Better Auth skips that validation when NODE_ENV is "test", so this file loads it with
// NODE_ENV "production" (as on a deployment) before anything imports it.
import { vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, { NODE_ENV: "production" });
});

import { convexTest } from "convex-test";
import betterAuthTest from "./betterAuth";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import schema from "../../convex/schema";
import { components } from "../../convex/_generated/api";
import { socialCallbackURLs } from "../../src/lib/signInFlow";

const modules = import.meta.glob("../../convex/**/*.ts");
const SITE_URL = "http://127.0.0.1:3199";

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t, "betterAuth");
  return t;
}

type T = ReturnType<typeof setup>;

/** Starts Google sign-in; on success returns the return URLs Better Auth stored for the callback. */
async function startGoogle(t: T, body: { callbackURL: string; errorCallbackURL?: string }) {
  const response = await t.fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { origin: SITE_URL, "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", ...body }),
  });
  const json = (await response.json()) as { url?: string; code?: string };
  if (response.status !== 200) return { status: response.status, code: json.code };
  const state = new URL(json.url!).searchParams.get("state");
  const record = await t.query(components.betterAuth.adapter.findOne, {
    model: "verification",
    where: [{ field: "identifier", value: state! }],
  });
  const stored = JSON.parse(String(record!.value)) as { callbackURL: string; errorURL?: string };
  return { status: 200, callbackURL: stored.callbackURL, errorURL: stored.errorURL };
}

beforeEach(() => {
  vi.stubEnv("SITE_URL", SITE_URL);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-better-auth-secret-0123456789abcdef");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
  vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", undefined);
  vi.stubEnv("TEST", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Each test stays within the built-in limit of 3 /sign-in/* requests per 10 seconds.
describe("Google return URLs from the app's sign-in controls", () => {
  test("a relative return path with a hash is refused, and the app's absolute one is accepted intact", async () => {
    const t = setup();
    expect(await startGoogle(t, { callbackURL: "/notes?authcheck=1#return" })).toEqual({
      status: 403,
      code: "INVALID_CALLBACK_URL",
    });

    const urls = socialCallbackURLs("/notes?authcheck=1#return", SITE_URL);
    expect(urls).toEqual({
      callbackURL: `${SITE_URL}/notes?authcheck=1#return`,
      errorCallbackURL: `${SITE_URL}/sign-in?redirect=%2Fnotes%3Fauthcheck%3D1%23return`,
    });
    expect(await startGoogle(t, urls)).toEqual({ status: 200, callbackURL: urls.callbackURL, errorURL: urls.errorCallbackURL });

    const signUp = socialCallbackURLs("/browse/bookofmormon/alma/32?v=21&tab=notes#v21", SITE_URL, "/sign-up");
    expect(await startGoogle(t, signUp)).toEqual({ status: 200, callbackURL: signUp.callbackURL, errorURL: signUp.errorCallbackURL });
  });

  test("unsafe return targets become this site's home page", async () => {
    for (const target of ["https://evil.example/steal", "//evil.example/steal", "/\\evil.example", "/api/auth/sign-out"]) {
      expect(socialCallbackURLs(target, SITE_URL), target).toEqual({
        callbackURL: `${SITE_URL}/`,
        errorCallbackURL: `${SITE_URL}/sign-in`,
      });
    }
    const t = setup();
    expect(await startGoogle(t, socialCallbackURLs("https://evil.example/steal", SITE_URL))).toEqual({
      status: 200,
      callbackURL: `${SITE_URL}/`,
      errorURL: `${SITE_URL}/sign-in`,
    });
  });

  test("callbacks on other origins are still refused by the server", async () => {
    const t = setup();
    expect(await startGoogle(t, { callbackURL: "https://evil.example/notes#return" })).toEqual({
      status: 403,
      code: "INVALID_CALLBACK_URL",
    });
    expect(await startGoogle(t, { callbackURL: `${SITE_URL}/notes`, errorCallbackURL: "https://evil.example/sign-in" })).toEqual({
      status: 403,
      code: "INVALID_ERROR_CALLBACK_URL",
    });
  });
});
