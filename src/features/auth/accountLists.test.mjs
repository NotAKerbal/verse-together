import assert from "node:assert/strict";
import test from "node:test";
import { loadAccountLists, needsReauthentication, REAUTHENTICATE_MESSAGE } from "./accountLists.ts";
import { GENERIC_AUTH_ERROR } from "./authErrors.ts";

const GOOGLE = [{ providerId: "google" }];
const SESSIONS = [{ id: "s1" }, { id: "s2" }];
const ok = (data) => async () => ({ data, error: null });
const fails = (error) => async () => ({ data: null, error });

test("both lists load: no problem, both lists returned", async () => {
  const outcome = await loadAccountLists({ accounts: ok(GOOGLE), sessions: ok(SESSIONS) });
  assert.deepEqual(outcome, {
    accounts: GOOGLE,
    sessions: SESSIONS,
    failed: { accounts: false, sessions: false },
    problem: null,
  });
});

test("a stale session asks for a new sign-in instead of another reload, and keeps the accounts that loaded", async () => {
  // Better Auth's /list-sessions needs a fresh session; /list-accounts doesn't.
  for (const code of ["SESSION_NOT_FRESH", "SESSION_EXPIRED"]) {
    const outcome = await loadAccountLists({
      accounts: ok(GOOGLE),
      sessions: fails({ code, status: 403 }),
    });
    assert.deepEqual(outcome.accounts, GOOGLE);
    assert.equal("sessions" in outcome, false, "a failed list must not overwrite the last good value");
    assert.deepEqual(outcome.failed, { accounts: false, sessions: true });
    assert.deepEqual(outcome.problem, { reauthenticate: true, message: REAUTHENTICATE_MESSAGE });
  }
});

test("a signed-out session (UNAUTHORIZED or 401) also asks for a new sign-in", async () => {
  assert.equal(needsReauthentication({ code: "UNAUTHORIZED", status: 401 }), true);
  assert.equal(needsReauthentication({ code: null, status: 401 }), true);
  const outcome = await loadAccountLists({ accounts: fails({ code: "UNAUTHORIZED", status: 401 }), sessions: ok(SESSIONS) });
  assert.deepEqual(outcome.sessions, SESSIONS);
  assert.equal(outcome.problem?.reauthenticate, true);
});

test("transient failures offer a retry with a plain message", async () => {
  assert.equal(needsReauthentication({ code: "TOO_MANY_REQUESTS", status: 429 }), false);
  assert.equal(needsReauthentication(null), false);
  const limited = await loadAccountLists({ accounts: ok(GOOGLE), sessions: fails({ code: null, status: 429 }) });
  assert.deepEqual(limited.problem, { reauthenticate: false, message: "Too many attempts. Wait a minute and try again." });
  const unknown = await loadAccountLists({ accounts: fails({ code: "INTERNAL_SERVER_ERROR", status: 500 }), sessions: ok(SESSIONS) });
  assert.deepEqual(unknown.problem, { reauthenticate: false, message: GENERIC_AUTH_ERROR });
  assert.deepEqual(unknown.sessions, SESSIONS);
});

test("one request throwing (network failure) doesn't discard the other", async () => {
  const outcome = await loadAccountLists({
    accounts: async () => {
      throw new TypeError("Failed to fetch");
    },
    sessions: ok(SESSIONS),
  });
  assert.equal("accounts" in outcome, false);
  assert.deepEqual(outcome.sessions, SESSIONS);
  assert.deepEqual(outcome.failed, { accounts: true, sessions: false });
  assert.deepEqual(outcome.problem, { reauthenticate: false, message: GENERIC_AUTH_ERROR });
});

test("a sign-in problem wins over a transient one, whichever list it came from", async () => {
  const outcome = await loadAccountLists({
    accounts: fails({ code: null, status: 500 }),
    sessions: fails({ code: "SESSION_NOT_FRESH", status: 403 }),
  });
  assert.deepEqual(outcome.failed, { accounts: true, sessions: true });
  assert.equal(outcome.problem?.reauthenticate, true);
});

test("a missing data payload counts as an empty list, not a failure", async () => {
  const outcome = await loadAccountLists({ accounts: ok(null), sessions: ok(undefined) });
  assert.deepEqual(outcome.accounts, []);
  assert.deepEqual(outcome.sessions, []);
  assert.equal(outcome.problem, null);
});
