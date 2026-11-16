import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { TESTER, assertPreviewBackend, ensureTester, parseArgs, parseDeployKey, parsePreviewUrl, previewName, redact } from "./preview.mjs";

test("names a preview after the requested name or the current branch", () => {
  assert.equal(previewName("My Experiment!", "dev"), "my-experiment");
  assert.equal(previewName(undefined, "isaac/preview-command"), "isaac-preview-command");
  assert.equal(previewName(null, "feature/" + "x".repeat(60)), "feature-" + "x".repeat(32));
  assert.equal(previewName(null, "a".repeat(39) + "/b"), "a".repeat(39));
});

test("refuses names that are too short, including a detached HEAD", () => {
  assert.throws(() => previewName(null, "HEAD"), /at least 3/);
  assert.throws(() => previewName("--", "dev"), /at least 3/);
  assert.throws(() => previewName("ab", "dev"), /at least 3/);
});

test("reads the name and --fresh from npm run arguments", () => {
  assert.deepEqual(parseArgs([]), { fresh: false, help: false, name: null });
  assert.deepEqual(parseArgs(["demo", "--fresh"]), { fresh: true, help: false, name: "demo" });
  assert.deepEqual(parseArgs(["demo"], { npm_config_fresh: "true" }), { fresh: true, help: false, name: "demo" });
  assert.throws(() => parseArgs(["--prod"]), /Unknown option/);
  assert.throws(() => parseArgs(["one", "two"]), /one preview name/);
});

test("accepts only a deploy key for the preview's own deployment", () => {
  for (const key of ["dev:happy-otter-123|test-only-not-a-credential", "preview:happy-otter-123|test-only-not-a-credential"]) {
    assert.equal(parseDeployKey(`✔ Created deploy key\n${key}\n`, "happy-otter-123"), key);
  }
  for (const output of ["dev:other-otter-456|x", "prod:happy-otter-123|x", "project:team:project|x", "dev:happy-otter-1234|x", "nothing here"]) {
    assert.throws(() => parseDeployKey(output, "happy-otter-123"), /Could not read a deploy key for happy-otter-123/);
  }
});

test("never treats a shared backend as a preview", () => {
  assert.equal(assertPreviewBackend("happy-otter-123"), "happy-otter-123");
  for (const shared of ["fabulous-dogfish-606", "lovable-seal-140"]) {
    assert.throws(() => assertPreviewBackend(shared), /shared backend/);
    assert.throws(() => parseDeployKey(`dev:${shared}|x`, shared), /shared backend/);
  }
});

test("finds the deployment URL in the Vercel CLI output", () => {
  assert.equal(
    parsePreviewUrl("Inspect: https://vercel.com/x\nhttps://scriptures-sharing-abc123-notakerbals-projects.vercel.app\n"),
    "https://scriptures-sharing-abc123-notakerbals-projects.vercel.app"
  );
  assert.throws(() => parsePreviewUrl("Error: build failed"), /Could not find the preview URL/);
});

test("redacts every known secret", () => {
  assert.equal(redact("key=abc and abc again", new Set(["abc", ""])), "key=[REDACTED] and [REDACTED] again");
});

function fakeAuth(responses) {
  const calls = [];
  const request = async (siteUrl, origin, endpoint, body) => {
    calls.push({ siteUrl, origin, endpoint, body });
    return responses[endpoint];
  };
  return { calls, request };
}

test("creates the test account through Better Auth sign-up", async () => {
  const { calls, request } = fakeAuth({ "sign-up/email": { ok: true, status: 200, text: "{}" } });
  const result = await ensureTester({ siteUrl: "https://happy-otter-123.convex.site", origin: "https://p.vercel.app", request });
  assert.equal(result, "created");
  assert.deepEqual(calls, [
    { siteUrl: "https://happy-otter-123.convex.site", origin: "https://p.vercel.app", endpoint: "sign-up/email", body: TESTER },
  ]);
});

test("keeps an existing test account after checking its password", async () => {
  const { calls, request } = fakeAuth({
    "sign-up/email": { ok: false, status: 422, text: '{"code":"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"}' },
    "sign-in/email": { ok: true, status: 200, text: "{}" },
  });
  assert.equal(await ensureTester({ siteUrl: "s", origin: "o", request }), "existing");
  assert.deepEqual(calls.map(c => c.endpoint), ["sign-up/email", "sign-in/email"]);
  assert.deepEqual(calls[1].body, { email: TESTER.email, password: TESTER.password });
});

test("fails loudly when the test account cannot be created or used", async () => {
  await assert.rejects(
    ensureTester({ siteUrl: "s", origin: "o", request: fakeAuth({ "sign-up/email": { ok: false, status: 404, text: "Not found" } }).request }),
    /Creating the test account failed \(404\)/
  );
  await assert.rejects(
    ensureTester({
      siteUrl: "s",
      origin: "o",
      request: fakeAuth({
        "sign-up/email": { ok: false, status: 422, text: "USER_ALREADY_EXISTS" },
        "sign-in/email": { ok: false, status: 401, text: "INVALID_EMAIL_OR_PASSWORD" },
      }).request,
    }),
    /--fresh/
  );
});

async function waitFor(check, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("a signal to the script alone stops the running command and still cleans up", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "verse-preview-test-"));
  try {
    const childPidFile = path.join(directory, "child.pid");
    const cleanedFile = path.join(directory, "cleaned");
    const parentScript = path.join(directory, "parent.mjs");
    writeFileSync(
      parentScript,
      `import { writeFileSync } from "node:fs";
import { cleanUpOnSignal, execute } from ${JSON.stringify(new URL("./preview.mjs", import.meta.url).href)};
cleanUpOnSignal(async () => {
  await execute(process.execPath, ["-e", "setTimeout(() => {}, 200)"], { finishOnSignal: true });
  writeFileSync(${JSON.stringify(cleanedFile)}, "yes");
}, { exit: (code) => process.exit(code + 40) });
try {
  await execute(process.execPath, ["-e", ${JSON.stringify(`require("node:fs").writeFileSync(${JSON.stringify(childPidFile)}, String(process.pid)); setTimeout(() => {}, 60000)`)}]);
} catch {
  process.exitCode = 1;
}
`
    );
    const parent = spawn(process.execPath, [parentScript], { stdio: "ignore" });
    const exited = new Promise((resolve) => parent.on("exit", (code) => resolve(code)));
    await waitFor(() => existsSync(childPidFile));
    const childPid = Number(readFileSync(childPidFile, "utf8"));
    parent.kill("SIGTERM");
    assert.equal(await exited, 41);
    assert.equal(readFileSync(cleanedFile, "utf8"), "yes");
    await waitFor(() => !isRunning(childPid));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
