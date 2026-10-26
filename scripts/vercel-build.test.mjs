import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { build } from "./vercel-build.mjs";

const sha = "a".repeat(40);
const newerSha = "b".repeat(40);
function environment(branch = "dev") {
  const prod = branch === "master";
  const name = prod ? "lovable-seal-140" : "fabulous-dogfish-606";
  const ref = `${prod ? "prod" : "dev"}:${name}`;
  return {
    VERCEL: "1",
    VERCEL_ENV: prod ? "production" : "preview",
    VERCEL_PROJECT_ID: "prj_I55xbo17nxAMQHMBXSEjAxpNt97k",
    VERCEL_ORG_ID: "team_5zEN6A1TNn3xXcfWMrHKpVAd",
    VERCEL_GIT_REPO_OWNER: "NotAKerbal",
    VERCEL_GIT_REPO_SLUG: "verse-together",
    VERCEL_GIT_COMMIT_REF: branch,
    VERCEL_GIT_COMMIT_SHA: sha,
    CONVEX_AUTOMATIC_DEPLOYMENT: ref,
    CONVEX_DEPLOY_KEY: `${ref}|test-only-not-a-credential`,
    NEXT_PUBLIC_CONVEX_URL: `https://${name}.convex.cloud`,
    NEXT_PUBLIC_CONVEX_SITE_URL: `https://${name}.convex.site`,
  };
}

function harness(env, { failAt, wrongUrl, badJson, checkoutSha = sha, heads = [sha, sha] } = {}) {
  const calls = [];
  let headRead = 0;
  const run = (command, args, options) => {
    const step = command === "git" ? args[0] : args[0].includes("/next/") ? "frontend" : args[1];
    calls.push({ step, command, args, ...options });
    if (failAt === calls.length) throw new Error(`fixture failure at ${step}`);
    if (step === "rev-parse") return `${checkoutSha}\n`;
    if (step === "ls-remote") return `${heads[headRead++]}\trefs/heads/${env.VERCEL_GIT_COMMIT_REF}\n`;
    if (step === "function-spec") return badJson ? "invalid" : JSON.stringify({ url: wrongUrl ?? env.NEXT_PUBLIC_CONVEX_URL });
    return "";
  };
  return { calls, execute: () => build({ env, run, log() {} }) };
}

for (const branch of ["dev", "master"]) {
  test(`${branch} verifies key target, builds frontend, then pushes and verifies backend`, () => {
    const env = environment(branch);
    const { calls, execute } = harness(env);
    execute();
    assert.deepEqual(calls.map(c => c.step), ["rev-parse", "ls-remote", "function-spec", "frontend", "rev-parse", "ls-remote", "deploy", "function-spec"]);
    const deploy = calls.find(c => c.step === "deploy");
    assert.equal(deploy.env.CONVEX_DEPLOY_KEY, env.CONVEX_DEPLOY_KEY);
    assert.equal(deploy.env.CONVEX_DEPLOYMENT, env.CONVEX_AUTOMATIC_DEPLOYMENT);
    assert.ok(deploy.args.includes("--typecheck"));
    assert.ok(deploy.args.includes("enable"));
    assert.ok(deploy.args.includes(`Vercel ${branch} ${sha}`));
    for (const call of calls) {
      assert.ok(!call.args.some(a => a.includes(env.CONVEX_DEPLOY_KEY)));
      if (call.step === "frontend" || call.command === "git") assert.equal(call.env.CONVEX_DEPLOY_KEY, "");
    }
  });
}

const refusals = [
  ["VERCEL", "", "requires a Vercel"],
  ["VERCEL_ENV", "development", "requires a Vercel"],
  ["VERCEL_ENV", "production", "branch and Vercel environment disagree"],
  ["VERCEL_PROJECT_ID", "another-project", "unexpected Vercel project"],
  ["VERCEL_ORG_ID", "another-team", "unexpected Vercel project"],
  ["VERCEL_TARGET_ENV", "staging", "custom Vercel environments"],
  ["VERCEL_GIT_COMMIT_REF", "", "missing Git branch"],
  ["CONVEX_AUTOMATIC_DEPLOYMENT", "", "activate this environment"],
  ["CONVEX_AUTOMATIC_DEPLOYMENT", "prod:lovable-seal-140", "activate this environment"],
  ["VERCEL_GIT_REPO_OWNER", "fork-owner", "unexpected Git repository"],
  ["VERCEL_GIT_REPO_SLUG", "another-repo", "unexpected Git repository"],
  ["VERCEL_GIT_COMMIT_SHA", "123abcd", "missing full Git commit"],
  ["CONVEX_DEPLOY_KEY", "", "deployment-scoped key"],
  ["CONVEX_DEPLOY_KEY", "preview:team:project|test-only", "deployment-scoped key"],
  ["CONVEX_DEPLOY_KEY", "project:team:project|test-only", "deployment-scoped key"],
  ["CONVEX_DEPLOY_KEY", "prod:lovable-seal-140|test-only", "deployment-scoped key"],
  ["CONVEX_DEPLOY_KEY", "dev:another-dev-123|test-only", "deployment-scoped key"],
  ["CONVEX_DEPLOY_KEY", "fabulous-dogfish-606|test-only", "deployment-scoped key"],
  ["CONVEX_DEPLOY_KEY", "dev:fabulous-dogfish-606|", "deployment-scoped key"],
  ["CONVEX_DEPLOY_KEY", "dev:fabulous-dogfish-606|test\nonly", "deployment-scoped key"],
  ["CONVEX_DEPLOYMENT", "prod:lovable-seal-140", "CONVEX_DEPLOYMENT must"],
  ["CONVEX_DEPLOYMENT_TOKEN", "test-only", "CONVEX_DEPLOYMENT_TOKEN must"],
  ["CONVEX_OVERRIDE_ACCESS_TOKEN", "test-only", "CONVEX_OVERRIDE_ACCESS_TOKEN must"],
  ["CONVEX_SELF_HOSTED_URL", "http://localhost:3210", "CONVEX_SELF_HOSTED_URL must"],
  ["CONVEX_SELF_HOSTED_ADMIN_KEY", "test-only", "CONVEX_SELF_HOSTED_ADMIN_KEY must"],
  ["CONVEX_PROVISION_HOST", "http://localhost:1234", "CONVEX_PROVISION_HOST must"],
  ["CONVEX_AGENT_MODE", "anonymous", "CONVEX_AGENT_MODE must"],
  ["NEXT_PUBLIC_CONVEX_URL", "https://lovable-seal-140.convex.cloud", "both public Convex URLs"],
  ["NEXT_PUBLIC_CONVEX_SITE_URL", "https://lovable-seal-140.convex.site", "both public Convex URLs"],
];

test("Vercel Git builds do not require the CLI-only VERCEL_ORG_ID variable", () => {
  const env = environment();
  delete env.VERCEL_ORG_ID;
  harness(env).execute();
});
for (const [key, value, reason] of refusals) {
  test(`refuses unsafe ${key}=${key.includes("KEY") || key.includes("TOKEN") ? "[fixture]" : value} before starting any process`, () => {
    const { calls, execute } = harness({ ...environment(), [key]: value });
    assert.throws(execute, { message: new RegExp(reason) });
    assert.deepEqual(calls, []);
  });
}

test("production rejects dev keys and non-master branches", () => {
  for (const override of [
    { CONVEX_DEPLOY_KEY: environment().CONVEX_DEPLOY_KEY },
    { VERCEL_GIT_COMMIT_REF: "feature" },
  ]) {
    const { calls, execute } = harness({ ...environment("master"), ...override });
    assert.throws(execute);
    assert.deepEqual(calls, []);
  }
});

test("feature previews never invoke Convex even with an inherited key", () => {
  const env = { ...environment(), VERCEL_GIT_COMMIT_REF: "feature/notes", CONVEX_AUTOMATIC_DEPLOYMENT: "", CONVEX_DEPLOY_KEY: "preview:team:project|test-only" };
  const { calls, execute } = harness(env);
  execute();
  assert.deepEqual(calls.map(c => c.step), ["frontend"]);
  assert.equal(calls[0].env.CONVEX_DEPLOY_KEY, "");
  assert.equal(calls[0].env.NEXT_PUBLIC_CONVEX_URL, env.NEXT_PUBLIC_CONVEX_URL);
});

test("feature preview rejects an accidentally inherited activation marker", () => {
  const { calls, execute } = harness({ ...environment(), VERCEL_GIT_COMMIT_REF: "feature/notes" });
  assert.throws(execute, /only on dev/);
  assert.deepEqual(calls, []);
});

for (const options of [{ wrongUrl: environment("master").NEXT_PUBLIC_CONVEX_URL }, { badJson: true }]) {
  test(`authenticated preflight refuses ${options.badJson ? "invalid JSON" : "a mismatched URL"} before building or writing`, () => {
    const { calls, execute } = harness(environment(), options);
    assert.throws(execute, /function-spec|authenticated Convex URL/);
    assert.deepEqual(calls.map(c => c.step), ["rev-parse", "ls-remote", "function-spec"]);
  });
}

for (const options of [{ checkoutSha: newerSha }, { heads: [newerSha] }, { heads: [sha, newerSha] }]) {
  test("refuses stale revision before a backend write", () => {
    const { calls, execute } = harness(environment(), options);
    assert.throws(execute, /not the current branch head/);
    assert.equal(calls.some(c => c.step === "deploy"), false);
  });
}

for (const failAt of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`failure at step ${failAt} fails the Vercel build without continuing`, () => {
    const { calls, execute } = harness(environment(), { failAt });
    assert.throws(execute, /fixture failure/);
    assert.equal(calls.length, failAt);
    if (failAt < 7) assert.equal(calls.some(c => c.step === "deploy"), false);
  });
}

test("CLI entry fails closed without exposing invalid credential values", () => {
  const key = "never-print-this-invalid-test-credential";
  const result = spawnSync(process.execPath, [new URL("./vercel-build.mjs", import.meta.url).pathname], {
    env: { ...environment(), CONVEX_DEPLOY_KEY: key }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /deployment-scoped key/);
  assert.ok(!(result.stdout + result.stderr).includes(key));
});

for (const failure of ["", "frontend", "deploy"]) {
  test(`real process runner ${failure ? `stops on ${failure} failure` : "orders commands and redacts credentials"}`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "verse-deploy-test-"));
    try {
      for (const subdir of ["scripts", "bin", "node_modules/convex/bin", "node_modules/next/dist/bin"]) {
        mkdirSync(path.join(directory, subdir), { recursive: true });
      }
      writeFileSync(path.join(directory, "scripts/vercel-build.mjs"), readFileSync(new URL("./vercel-build.mjs", import.meta.url)));
      const logFile = path.join(directory, "commands.jsonl");
      // Only these fixture executables run: no installed CLI, Git remote or backend.
      const recorder = `
        const fs = require("node:fs");
        const args = process.argv.slice(2);
        const step = process.argv[1].endsWith("/git") ? args[0] : process.argv[1].includes("/next/") ? "frontend" : args[0];
        fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({step, hasKey: Boolean(process.env.CONVEX_DEPLOY_KEY)}) + "\\n");
        if (step === "rev-parse") console.log(process.env.VERCEL_GIT_COMMIT_SHA);
        else if (step === "ls-remote") console.log(process.env.VERCEL_GIT_COMMIT_SHA + "\\trefs/heads/dev");
        else if (step === "function-spec") console.log(JSON.stringify({url: process.env.NEXT_PUBLIC_CONVEX_URL}));
        else {
          console.log(process.env.FIXTURE_SECRET);
          if (process.env.CONVEX_DEPLOY_KEY) console.error(process.env.CONVEX_DEPLOY_KEY);
          if (process.env.FIXTURE_FAILURE === step) process.exit(17);
        }
      `;
      for (const file of ["bin/git", "node_modules/convex/bin/main.js", "node_modules/next/dist/bin/next"]) {
        const executable = path.join(directory, file);
        writeFileSync(executable, `#!${process.execPath}\n${recorder}`);
        chmodSync(executable, 0o700);
      }
      const env = { ...environment(), PATH: `${directory}/bin:${process.env.PATH}`, FIXTURE_LOG: logFile, FIXTURE_SECRET: "fake-secret-never-show", FIXTURE_FAILURE: failure };
      const result = spawnSync(process.execPath, [path.join(directory, "scripts/vercel-build.mjs")], { env, encoding: "utf8", timeout: 10000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, failure ? 1 : 0, result.stderr);
      const calls = readFileSync(logFile, "utf8").trim().split("\n").map(line => JSON.parse(line));
      const expected = ["rev-parse", "ls-remote", "function-spec", "frontend", "rev-parse", "ls-remote", "deploy", "function-spec"];
      assert.deepEqual(calls.map(c => c.step), failure ? expected.slice(0, expected.indexOf(failure) + 1) : expected);
      assert.ok(calls.filter(c => c.step === "frontend" || ["rev-parse", "ls-remote"].includes(c.step)).every(c => !c.hasKey));
      assert.ok(!(result.stdout + result.stderr).includes(env.CONVEX_DEPLOY_KEY));
      assert.ok(!(result.stdout + result.stderr).includes(env.FIXTURE_SECRET));
      assert.match(result.stdout, /\[REDACTED\]/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("Vercel uses the guarded build while local build stays frontend-only", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(config.buildCommand, "npm run build:vercel");
  assert.equal(pkg.scripts["build:vercel"], "node scripts/vercel-build.mjs");
  assert.equal(pkg.scripts.build, "next build --turbopack");
});
