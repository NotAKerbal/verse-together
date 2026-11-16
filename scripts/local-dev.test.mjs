import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BACKEND_STATE,
  backendConfig,
  childEnv,
  chooseSlot,
  envValue,
  parseEnvList,
  parseWorktrees,
  portsFor,
  siteUrlFor,
  slotOf,
  withEnvValues,
} from "./local-dev.mjs";
import { TEST_ACCOUNT, ensureTestAccount } from "./test-account.mjs";

const allFree = async () => true;

test("each slot has its own web and backend ports", () => {
  assert.deepEqual(portsFor(0), { web: 3100, cloud: 3500, site: 3501 });
  assert.deepEqual(portsFor(1), { web: 3101, cloud: 3502, site: 3503 });
  const used = [0, 1, 2, 99].flatMap((slot) => Object.values(portsFor(slot)));
  assert.equal(new Set(used).size, used.length);
});

test("each slot has its own hostname, so sign-in cookies stay separate", () => {
  assert.equal(siteUrlFor(0), "http://verse-together.localhost:3100");
  assert.equal(siteUrlFor(3), "http://verse-together-3.localhost:3103");
  assert.notEqual(new URL(siteUrlFor(1)).hostname, new URL(siteUrlFor(2)).hostname);
});

test("a backend's slot is read back from its ports", () => {
  assert.equal(slotOf({ ports: portsFor(7) }), 7);
  assert.equal(slotOf({ ports: { cloud: 3210, site: 3211 } }), null);
  assert.equal(slotOf({ ports: { cloud: 3501, site: 3502 } }), null);
  assert.equal(slotOf(null), null);
});

test("the main checkout always gets slot 0", async () => {
  assert.equal(await chooseSlot({ ownSlot: null, isMain: true, claimedSlots: [1, 2], isFree: allFree }), 0);
});

test("a worktree keeps the slot it already has", async () => {
  assert.equal(await chooseSlot({ ownSlot: 4, isMain: false, claimedSlots: [1, 2], isFree: async () => false }), 4);
});

test("a new worktree takes the first slot no other checkout claims", async () => {
  assert.equal(await chooseSlot({ ownSlot: null, isMain: false, claimedSlots: [1, null, 2], isFree: allFree }), 3);
});

test("a new worktree skips slots whose ports another program holds", async () => {
  const busy = new Set([portsFor(1).site]);
  const slot = await chooseSlot({ ownSlot: null, isMain: false, claimedSlots: [], isFree: async (port) => !busy.has(port) });
  assert.equal(slot, 2);
});

test("a worktree never takes the main checkout's slot", async () => {
  assert.equal(await chooseSlot({ ownSlot: 0, isMain: false, claimedSlots: [], isFree: allFree }), 1);
});

test("choosing fails when every slot is taken", async () => {
  await assert.rejects(chooseSlot({ ownSlot: null, isMain: false, claimedSlots: [], isFree: async () => false }), /Every port/);
});

test("two worktrees of one repository get different ports", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "verse-dev-"));
  try {
    const first = path.join(dir, "first");
    mkdirSync(path.join(first, BACKEND_STATE), { recursive: true });
    writeFileSync(path.join(first, BACKEND_STATE, "config.json"), JSON.stringify({ ports: portsFor(1) }));
    const second = path.join(dir, "second");
    const worktrees = parseWorktrees(
      [`worktree ${path.join(dir, "main")}`, "HEAD abc", "", `worktree ${first}`, "", `worktree ${second}`, "prunable gitdir file points to non-existent location", ""].join("\n")
    );
    assert.deepEqual(worktrees, [path.join(dir, "main"), first, second]);
    const claimedSlots = worktrees.slice(1).filter((worktree) => worktree !== second).map((worktree) => slotOf(backendConfig(worktree)));
    const slot = await chooseSlot({ ownSlot: slotOf(backendConfig(second)), isMain: false, claimedSlots, isFree: allFree });
    assert.equal(slot, 2);
    assert.notEqual(portsFor(slot).web, portsFor(1).web);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("env values are replaced in place or appended", () => {
  const text = "# Deployment\nCONVEX_DEPLOYMENT=local:abc # team: t, project: p\n# NEXT_PUBLIC_CONVEX_URL=https://old\nNEXT_PUBLIC_CONVEX_URL=https://x.convex.cloud";
  const updated = withEnvValues(text, { NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3502", AUTH_PROXY_SECRET: "s$1" });
  assert.equal(
    updated,
    "# Deployment\nCONVEX_DEPLOYMENT=local:abc # team: t, project: p\n# NEXT_PUBLIC_CONVEX_URL=https://old\nNEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3502\nAUTH_PROXY_SECRET=s$1\n"
  );
  assert.equal(envValue(updated, "CONVEX_DEPLOYMENT"), "local:abc");
  assert.equal(envValue(updated, "AUTH_PROXY_SECRET"), "s$1");
  assert.equal(envValue(updated, "MISSING"), null);
  assert.equal(withEnvValues("", { A: "1" }), "A=1\n");
});

test("backend env listings are parsed with quotes removed", () => {
  const values = parseEnvList('SITE_URL="http://localhost:3101"\nAUTH_EMAIL_PASSWORD_ENABLED=true\n');
  assert.equal(values.get("SITE_URL"), "http://localhost:3101");
  assert.equal(values.get("AUTH_EMAIL_PASSWORD_ENABLED"), "true");
});

test("commands never inherit a shell's deployment selection", () => {
  const saved = { ...process.env };
  try {
    process.env.CONVEX_DEPLOYMENT = "dev:fabulous-dogfish-606";
    process.env.CONVEX_DEPLOY_KEY = "dev:fabulous-dogfish-606|not-a-key";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://fabulous-dogfish-606.convex.cloud";
    const env = childEnv({ NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3502" });
    assert.equal(env.CONVEX_DEPLOYMENT, undefined);
    assert.equal(env.CONVEX_DEPLOY_KEY, undefined);
    assert.equal(env.NEXT_PUBLIC_CONVEX_URL, "http://127.0.0.1:3502");
  } finally {
    process.env = saved;
  }
});

const sessionCookie = "better-auth.session_token=abc; Path=/; HttpOnly";

function fakeAuth(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, origin: init.headers.origin, cookie: init.headers.cookie, body: JSON.parse(init.body) });
    const [status, text] = url.endsWith("/sign-out") ? [200, "{}"] : responses.shift();
    const ok = status >= 200 && status < 300;
    return { status, ok, headers: { getSetCookie: () => (ok ? [sessionCookie] : []) }, text: async () => text };
  };
  return { calls, fetchImpl };
}

const site = { authUrl: "http://127.0.0.1:3503", origin: "http://localhost:3101" };

test("the test account is left alone when it already signs in", async () => {
  const { calls, fetchImpl } = fakeAuth([[200, "{}"]]);
  assert.equal(await ensureTestAccount({ ...site, fetchImpl }), "existing");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "http://127.0.0.1:3503/api/auth/sign-out");
  assert.equal(calls[1].cookie, "better-auth.session_token=abc");
  assert.equal(calls[0].url, "http://127.0.0.1:3503/api/auth/sign-in/email");
  assert.equal(calls[0].origin, site.origin);
  assert.deepEqual(calls[0].body, { email: TEST_ACCOUNT.email, password: TEST_ACCOUNT.password });
});

test("the test account is created when it does not exist", async () => {
  const { calls, fetchImpl } = fakeAuth([[401, '{"code":"INVALID_EMAIL_OR_PASSWORD"}'], [200, "{}"]]);
  assert.equal(await ensureTestAccount({ ...site, fetchImpl }), "created");
  assert.equal(calls[1].url, "http://127.0.0.1:3503/api/auth/sign-up/email");
  assert.deepEqual(calls[1].body, TEST_ACCOUNT);
  assert.equal(calls[2].url, "http://127.0.0.1:3503/api/auth/sign-out");
});

test("a test account with another password is reported", async () => {
  const { fetchImpl } = fakeAuth([[401, "{}"], [422, '{"code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}']]);
  await assert.rejects(ensureTestAccount({ ...site, fetchImpl }), /different password/);
});

test("a backend without email sign-in is reported", async () => {
  const { fetchImpl } = fakeAuth([[404, "{}"]]);
  await assert.rejects(ensureTestAccount({ ...site, fetchImpl }), /AUTH_EMAIL_PASSWORD_ENABLED/);
});
