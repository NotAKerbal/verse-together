import assert from "node:assert/strict";
import test from "node:test";
import { chooseSignInRoute, signInErrorHref, signInReturnPath, socialCallbackURLs, socialErrorCode } from "./signInFlow.ts";

const GOOGLE_ONLY = { google: true, emailPassword: false };

test("Google-only deployments go straight to Google and come back to the same page", () => {
  assert.deepEqual(chooseSignInRoute(GOOGLE_ONLY, "/browse/bookofmormon/alma/32?v=21#v21"), {
    kind: "google",
    callbackURL: "/browse/bookofmormon/alma/32?v=21#v21",
    errorCallbackURL: "/sign-in?redirect=%2Fbrowse%2Fbookofmormon%2Falma%2F32%3Fv%3D21%23v21",
  });
  assert.deepEqual(chooseSignInRoute(GOOGLE_ONLY, "/"), { kind: "google", callbackURL: "/", errorCallbackURL: "/sign-in" });
});

test("a Google error lands on the sign-in page, never back on Google", () => {
  const route = chooseSignInRoute(GOOGLE_ONLY, "/notes");
  assert.equal(route.kind, "google");
  assert.ok(route.errorCallbackURL.startsWith("/sign-in"));
});

test("uses the sign-in page while capabilities are unknown, with a choice to make, or without Google", () => {
  for (const capabilities of [
    undefined,
    null,
    { google: true, emailPassword: true },
    { google: false, emailPassword: true },
    { google: false, emailPassword: false },
  ]) {
    assert.deepEqual(chooseSignInRoute(capabilities, "/notes"), { kind: "page", href: "/sign-in?redirect=%2Fnotes" }, JSON.stringify(capabilities));
  }
});

test("never sends Google an unsafe return target", () => {
  for (const target of ["https://evil.example/", "//evil.example", "/sign-in?redirect=/notes", "/api/auth/callback/google"]) {
    assert.deepEqual(chooseSignInRoute(GOOGLE_ONLY, target), { kind: "google", callbackURL: "/", errorCallbackURL: "/sign-in" }, target);
  }
});

test("returns to the current page, or an auth page's own redirect target", () => {
  assert.equal(signInReturnPath("/plans?tab=mine#today"), "/plans?tab=mine#today");
  assert.equal(signInReturnPath("/sign-in?redirect=%2Fnotes%3Fday%3D2026-10-24"), "/notes?day=2026-10-24");
  assert.equal(signInReturnPath("/sign-up?redirect=/insights/shared/abc"), "/insights/shared/abc");
  assert.equal(signInReturnPath("/sign-in?error=access_denied"), "/");
  assert.equal(signInReturnPath("/sign-in?redirect=https://evil.example"), "/");
  assert.equal(signInReturnPath("/reset-password?redirect=//evil.example"), "/");
  assert.equal(signInReturnPath(undefined), "/");
});

test("error fallback links keep the return target and carry the error code", () => {
  assert.equal(signInErrorHref("/notes", "PROVIDER_NOT_FOUND"), "/sign-in?redirect=%2Fnotes&error=PROVIDER_NOT_FOUND");
  assert.equal(signInErrorHref("/", "sign_in_failed"), "/sign-in?error=sign_in_failed");
  assert.equal(signInErrorHref("/notes", "a&b=c"), "/sign-in?redirect=%2Fnotes&error=a%26b%3Dc");
});

test("reports the Better Auth error code, rate limiting, or a generic failure", () => {
  assert.equal(socialErrorCode({ code: "PROVIDER_NOT_FOUND", status: 404 }), "PROVIDER_NOT_FOUND");
  assert.equal(socialErrorCode({ status: 429 }), "TOO_MANY_REQUESTS");
  assert.equal(socialErrorCode({ status: 0 }), "sign_in_failed");
  assert.equal(socialErrorCode(null), "sign_in_failed");
});

const ORIGIN = "https://scripture-sharing-dev.vercel.app";

test("sends Google absolute same-origin callbacks so a return path with a hash survives", () => {
  assert.deepEqual(chooseSignInRoute(GOOGLE_ONLY, "/notes?authcheck=1#return", ORIGIN), {
    kind: "google",
    callbackURL: `${ORIGIN}/notes?authcheck=1#return`,
    errorCallbackURL: `${ORIGIN}/sign-in?redirect=%2Fnotes%3Fauthcheck%3D1%23return`,
  });
  assert.deepEqual(chooseSignInRoute({ google: true, emailPassword: true }, "/notes#return", ORIGIN), {
    kind: "page",
    href: "/sign-in?redirect=%2Fnotes%23return",
  });
});

test("absolute callbacks still only ever point at a safe path on the browser's origin", () => {
  for (const target of ["https://evil.example/", "//evil.example", "/\\evil.example", "/sign-in?redirect=/notes", "/api/auth/callback/google", null]) {
    assert.deepEqual(
      socialCallbackURLs(target, ORIGIN),
      { callbackURL: `${ORIGIN}/`, errorCallbackURL: `${ORIGIN}/sign-in` },
      String(target)
    );
  }
});

test("the sign-up page's Google error lands back on sign-up", () => {
  assert.deepEqual(socialCallbackURLs("/plans#today", ORIGIN, "/sign-up"), {
    callbackURL: `${ORIGIN}/plans#today`,
    errorCallbackURL: `${ORIGIN}/sign-up?redirect=%2Fplans%23today`,
  });
});
