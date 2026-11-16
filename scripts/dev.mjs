import { randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  BACKEND_STATE,
  backendConfig,
  capture,
  chooseSlot,
  envValue,
  isFree,
  parseEnvList,
  parseWorktrees,
  portsFor,
  readEnvFile,
  root,
  run,
  siteUrlFor,
  slotOf,
  start,
  stopGroups,
  step,
  waitFor,
  writeEnvValues,
} from "./local-dev.mjs";
import { TEST_ACCOUNT, ensureTestAccount } from "./test-account.mjs";

const CONVEX_TEAM = "isaac-cochran";
const CONVEX_PROJECT = "verse-together";
const MIN_PROXY_SECRET_LENGTH = 32;

const setupOnly = process.argv.includes("--setup");
const envFile = path.resolve(root, ".env.local");
const bin = (name) => path.resolve(root, "node_modules/.bin", name);
const convex = bin("convex");
const newSecret = () => randomBytes(32).toString("hex");

function canonical(checkout) {
  try {
    return realpathSync(checkout);
  } catch {
    return path.resolve(checkout);
  }
}

async function chooseCheckoutSlot() {
  const here = canonical(root);
  const [main, ...worktrees] = parseWorktrees(capture("git", ["worktree", "list", "--porcelain"], { quiet: true })).map(canonical);
  const slot = await chooseSlot({
    ownSlot: slotOf(backendConfig(root)),
    isMain: main === here,
    claimedSlots: worktrees.filter((worktree) => worktree !== here).map((worktree) => slotOf(backendConfig(worktree))),
    isFree,
  });
  return slot;
}

const deployment = () => envValue(readEnvFile(envFile), "CONVEX_DEPLOYMENT") ?? "";
const isConfigured = () => backendConfig(root) !== null && deployment().startsWith("local:");

const children = [];
let stopping = false;

async function stop(code) {
  if (stopping) return;
  stopping = true;
  await stopGroups(children);
  process.exit(code);
}

function launch(cmd, args, options) {
  const child = start(cmd, args, options);
  child.on("exit", (code) => stop(code ?? 0));
  children.push(child);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

async function main() {
  if (!existsSync(convex) || !existsSync(bin("next"))) {
    step("Installing dependencies");
    run("npm", ["ci", "--no-audit", "--no-fund"]);
  }

  const slot = await chooseCheckoutSlot();
  const ports = portsFor(slot);
  const siteUrl = siteUrlFor(slot);
  const backendUrl = `http://127.0.0.1:${ports.cloud}`;
  const backendSiteUrl = `http://127.0.0.1:${ports.site}`;
  const portArgs = ["--local-cloud-port", String(ports.cloud), "--local-site-port", String(ports.site)];

  if (!isConfigured()) {
    if (!existsSync(path.join(homedir(), ".convex", "config.json"))) {
      throw new Error("Convex is not logged in on this machine. Run `npx convex login` once, then `npm run dev` again.");
    }
    step("Creating a local backend for this checkout");
    run(convex, [
      "dev", "--once", "--tail-logs", "disable", ...portArgs,
      "--configure", "existing", "--team", CONVEX_TEAM, "--project", CONVEX_PROJECT, "--dev-deployment", "local",
    ]);
  }
  if (!deployment().startsWith("local:")) {
    throw new Error(`.env.local names ${deployment() || "no deployment"}, not a local one. Refusing to change its settings.`);
  }

  const existingSecret = envValue(readEnvFile(envFile), "AUTH_PROXY_SECRET");
  const proxySecret = existingSecret && existingSecret.length >= MIN_PROXY_SECRET_LENGTH ? existingSecret : newSecret();
  const appEnv = { NEXT_PUBLIC_CONVEX_URL: backendUrl, NEXT_PUBLIC_CONVEX_SITE_URL: backendSiteUrl, AUTH_PROXY_SECRET: proxySecret };
  writeEnvValues(envFile, appEnv);

  step("Checking backend settings");
  const current = parseEnvList(capture(convex, ["env", "list", "--include-values"], { quiet: true }));
  const wanted = { SITE_URL: siteUrl, AUTH_PROXY_SECRET: proxySecret, AUTH_EMAIL_PASSWORD_ENABLED: "true" };
  if (!current.get("BETTER_AUTH_SECRET")) wanted.BETTER_AUTH_SECRET = newSecret();
  for (const [name, value] of Object.entries(wanted)) {
    if (current.get(name) === value) continue;
    capture(convex, ["env", "set", name], { input: value, quiet: true });
    console.log(`Set ${name}.`);
  }

  step("Starting the backend");
  launch(convex, ["dev", ...portArgs]);
  await waitFor(`${backendSiteUrl}/api/auth/ok`, 180);

  step("Checking the test account");
  const account = await ensureTestAccount({ authUrl: backendSiteUrl, origin: siteUrl });
  console.log(account === "created" ? "Created." : "Already there from an earlier run.");

  if (setupOnly) {
    console.log(`\n\x1b[1mSet up.\x1b[0m Run \`npm run dev\` to start Verse Together at ${siteUrl}`);
    await stop(0);
    return;
  }

  step("Starting the web app");
  launch(bin("next"), ["dev", "--webpack", "--port", String(ports.web)], { env: appEnv });
  await waitFor(siteUrl, 300).catch(() => {});

  console.log(`
\x1b[1mVerse Together is running\x1b[0m
  URL       ${siteUrl}
  Email     ${TEST_ACCOUNT.email}
  Password  ${TEST_ACCOUNT.password}
  Backend   ${backendUrl}, data in ${BACKEND_STATE}, this checkout only`);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  stop(1);
});
