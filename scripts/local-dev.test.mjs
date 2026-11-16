import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BACKEND_STATE,
  childEnv,
  claimSlot,
  convexEnv,
  envValue,
  localDeploymentName,
  parseEnvList,
  parseWorktrees,
  pickSlot,
  portsFor,
  siteUrlFor,
  slotOf,
  slotStateDir,
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

const pick = (options) =>
  pickSlot({ here: "/w/me", isMain: false, ownSlots: [], reservations: new Map(), otherConfigSlots: [], isFree: allFree, ...options });

test("the main checkout always gets slot 0", async () => {
  assert.equal(await pick({ isMain: true, otherConfigSlots: [1, 2] }), 0);
});

test("a worktree keeps the slot it already has", async () => {
  assert.equal(await pick({ ownSlots: [4], otherConfigSlots: [1, 2], isFree: async () => false }), 4);
});

test("a new worktree takes the first slot no other checkout claims", async () => {
  assert.equal(await pick({ otherConfigSlots: [1, 2] }), 3);
  assert.equal(await pick({ reservations: new Map([[1, "/w/other"]]) }), 2);
});

test("a new worktree skips slots whose ports another program holds", async () => {
  const busy = new Set([portsFor(1).site]);
  assert.equal(await pick({ isFree: async (port) => !busy.has(port) }), 2);
});

test("a worktree never takes the main checkout's slot", async () => {
  assert.equal(await pick({ ownSlots: [0, null] }), 1);
});

test("a reserved slot wins over another worktree's backend on the same ports", async () => {
  assert.equal(await pick({ ownSlots: [1], reservations: new Map([[1, "/w/me"]]), otherConfigSlots: [1] }), 1);
  assert.equal(await pick({ ownSlots: [1], reservations: new Map([[1, "/w/other"]]) }), 2);
  assert.equal(await pick({ ownSlots: [1], otherConfigSlots: [1] }), 2);
});

test("choosing fails when every slot is taken", async () => {
  await assert.rejects(pick({ isFree: async () => false }), /Every port/);
});

function fakeRepository() {
  const dir = mkdtempSync(path.join(tmpdir(), "verse-dev-"));
  const main = path.join(dir, "main");
  const worktree = (name, slot) => {
    const checkout = path.join(dir, name);
    if (slot !== undefined) {
      mkdirSync(path.join(checkout, BACKEND_STATE), { recursive: true });
      writeFileSync(path.join(checkout, BACKEND_STATE, "config.json"), JSON.stringify({ ports: portsFor(slot) }));
    }
    return checkout;
  };
  return { dir, main, worktree, stateDir: path.join(dir, "state"), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("worktrees are read from git's porcelain listing", () => {
  const porcelain = ["worktree /r/main", "HEAD abc", "", "worktree /r/first", "", "worktree /r/second", "prunable gitdir file points to non-existent location", ""];
  assert.deepEqual(parseWorktrees(porcelain.join("\n")), ["/r/main", "/r/first", "/r/second"]);
});

test("two worktrees of one repository get different ports", async () => {
  const repo = fakeRepository();
  try {
    const first = repo.worktree("first", 1);
    const second = repo.worktree("second");
    const worktrees = [repo.main, first, second];
    const slot = await claimSlot({ here: second, worktrees, stateDir: repo.stateDir, isFree: allFree });
    assert.equal(slot, 2);
    assert.equal(await claimSlot({ here: first, worktrees, stateDir: repo.stateDir, isFree: allFree }), 1);
    assert.equal(await claimSlot({ here: second, worktrees, stateDir: repo.stateDir, isFree: allFree }), 2);
    assert.equal(await claimSlot({ here: repo.main, worktrees, stateDir: repo.stateDir, isFree: allFree }), 0);
  } finally {
    repo.done();
  }
});

test("worktrees starting at the same time get different slots", async () => {
  const repo = fakeRepository();
  try {
    const checkouts = ["a", "b", "c", "d"].map((name) => repo.worktree(name));
    const worktrees = [repo.main, ...checkouts];
    const slowFree = () => new Promise((done) => setTimeout(() => done(true), 5));
    const slots = await Promise.all(checkouts.map((here) => claimSlot({ here, worktrees, stateDir: repo.stateDir, isFree: slowFree })));
    assert.deepEqual([...slots].sort(), [1, 2, 3, 4]);
  } finally {
    repo.done();
  }
});

test("a removed worktree's slot can be reused", async () => {
  const repo = fakeRepository();
  try {
    const gone = repo.worktree("gone");
    const next = repo.worktree("next");
    assert.equal(await claimSlot({ here: gone, worktrees: [repo.main, gone], stateDir: repo.stateDir, isFree: allFree }), 1);
    assert.equal(await claimSlot({ here: next, worktrees: [repo.main, next], stateDir: repo.stateDir, isFree: allFree }), 1);
  } finally {
    repo.done();
  }
});

test("slot reservations live outside the repository", () => {
  const dir = slotStateDir("/home/someone/verse-together/.git", { XDG_STATE_HOME: "/state" });
  assert.match(dir, /^\/state\/verse-together\/dev-slots-[0-9a-f]{16}$/);
  assert.notEqual(dir, slotStateDir("/home/someone/other/.git", { XDG_STATE_HOME: "/state" }));
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

test("env files are read the way dotenv reads them: the last assignment wins", () => {
  const text = "CONVEX_DEPLOYMENT=local:example\nexport CONVEX_DEPLOYMENT = dev:example-cloud\nQUOTED=\"a # b\"\n";
  assert.equal(envValue(text, "CONVEX_DEPLOYMENT"), "dev:example-cloud");
  assert.equal(envValue(text, "QUOTED"), "a # b");
});

test("writing a value replaces every assignment of it", () => {
  const text = "AUTH_PROXY_SECRET=old\nOTHER=1\n  export AUTH_PROXY_SECRET = stale\nAUTH_PROXY_SECRET_EXTRA=keep\n";
  const updated = withEnvValues(text, { AUTH_PROXY_SECRET: "new" });
  assert.equal(updated, "AUTH_PROXY_SECRET=new\nOTHER=1\nAUTH_PROXY_SECRET_EXTRA=keep\n");
  assert.equal(envValue(updated, "AUTH_PROXY_SECRET"), "new");
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

test("Convex commands are pinned to the local backend over anything in env files", () => {
  const env = convexEnv("local-isaac_cochran-verse_together-1");
  assert.equal(env.CONVEX_DEPLOYMENT, "local:local-isaac_cochran-verse_together-1");
  for (const name of ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT_TOKEN", "CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"]) {
    assert.equal(env[name], "");
  }
  assert.equal(convexEnv(null).CONVEX_DEPLOYMENT, "");
});

test("only local deployment names are accepted", () => {
  assert.equal(localDeploymentName({ deploymentName: "local-isaac_cochran-verse_together-1" }), "local-isaac_cochran-verse_together-1");
  assert.equal(localDeploymentName({ deploymentName: "fabulous-dogfish-606" }), null);
  assert.equal(localDeploymentName({ deploymentName: "local-x\nCONVEX_DEPLOY_KEY=y" }), null);
  assert.equal(localDeploymentName(null), null);
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
