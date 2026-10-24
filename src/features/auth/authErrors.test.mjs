import assert from "node:assert/strict";
import test from "node:test";
import { authErrorMessage, GENERIC_AUTH_ERROR } from "./authErrors.ts";

test("maps known Better Auth codes to plain messages", () => {
  assert.match(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" }), /don't match/);
  assert.match(authErrorMessage({ code: "EMAIL_NOT_VERIFIED" }), /Confirm your email/);
  assert.match(authErrorMessage("account_not_linked"), /connected to Google/);
  assert.doesNotMatch(authErrorMessage("account_not_linked"), /password/i);
});

test("rate limiting is recognised by status", () => {
  assert.match(authErrorMessage({ code: null, status: 429 }), /Too many attempts/);
});

test("unknown or prototype-like codes never leak details", () => {
  assert.equal(authErrorMessage({ code: "SOME_INTERNAL_THING" }), GENERIC_AUTH_ERROR);
  assert.equal(authErrorMessage("constructor"), GENERIC_AUTH_ERROR);
  assert.equal(authErrorMessage("__proto__"), GENERIC_AUTH_ERROR);
  assert.equal(authErrorMessage(null), GENERIC_AUTH_ERROR);
});
