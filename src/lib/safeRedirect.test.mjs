import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnPath, signInHref } from "./safeRedirect.ts";

test("keeps same-origin app paths with their query and hash", () => {
  assert.equal(safeReturnPath("/notes"), "/notes");
  assert.equal(safeReturnPath("/browse/bookofmormon/alma/32?v=21#v21"), "/browse/bookofmormon/alma/32?v=21#v21");
  assert.equal(safeReturnPath("  /plans  "), "/plans");
});

test("rejects absolute, protocol-relative and scheme URLs", () => {
  for (const value of [
    "https://evil.example/",
    "http://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,hi",
    "notes",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeReturnPath(value), "/", String(value));
  }
});

test("rejects control characters and backslashes that browsers normalise", () => {
  assert.equal(safeReturnPath("/\t/evil.example"), "/");
  assert.equal(safeReturnPath("/\n/evil.example"), "/");
  assert.equal(safeReturnPath("/foo\\bar"), "/");
});

test("does not bounce back into the auth pages", () => {
  assert.equal(safeReturnPath("/sign-in"), "/");
  assert.equal(safeReturnPath("/sign-up?redirect=/notes"), "/");
  assert.equal(safeReturnPath("/reset-password?token=abc"), "/");
  assert.equal(safeReturnPath("/api/auth/sign-out"), "/");
  assert.equal(safeReturnPath("/sign-insights"), "/sign-insights");
});

test("uses the supplied fallback", () => {
  assert.equal(safeReturnPath("https://evil.example", "/account"), "/account");
});

test("builds sign-in links that carry only safe return paths", () => {
  assert.equal(signInHref("/notes?draft=1"), "/sign-in?redirect=%2Fnotes%3Fdraft%3D1");
  assert.equal(signInHref("https://evil.example"), "/sign-in");
  assert.equal(signInHref("/"), "/sign-in");
  assert.equal(signInHref("/plans", "/sign-up"), "/sign-up?redirect=%2Fplans");
});
