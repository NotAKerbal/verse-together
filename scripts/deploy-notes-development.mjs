// DEVELOPMENT-ONLY push of the notes/journal Convex functions.
// Never targets production: no `convex deploy`, no --prod, no deploy keys.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOYMENT_NAME = "fabulous-dogfish-606";
const EXPECTED_DEPLOYMENT = `dev:${DEPLOYMENT_NAME}`;
const EXPECTED_URL = `https://${DEPLOYMENT_NAME}.convex.cloud`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const convexCli = path.join(root, "node_modules", "convex", "bin", "main.js");

function fail(message) {
  console.error(`deploy:notes:development refused: ${message}`);
  process.exit(1);
}

if (process.env.CONVEX_DEPLOY_KEY) {
  fail("CONVEX_DEPLOY_KEY is set; unset it so the logged-in development auth is used.");
}
const { CONVEX_DEPLOYMENT, NEXT_PUBLIC_CONVEX_URL } = process.env;
if (CONVEX_DEPLOYMENT !== undefined && CONVEX_DEPLOYMENT !== EXPECTED_DEPLOYMENT) {
  fail(`CONVEX_DEPLOYMENT must be unset or exactly ${EXPECTED_DEPLOYMENT}.`);
}
if (NEXT_PUBLIC_CONVEX_URL !== undefined && NEXT_PUBLIC_CONVEX_URL !== EXPECTED_URL) {
  fail(`NEXT_PUBLIC_CONVEX_URL must be unset or exactly ${EXPECTED_URL}.`);
}
for (const name of ["CONVEX_SELF_HOSTED_URL", "CONVEX_SELF_HOSTED_ADMIN_KEY"]) {
  if (process.env[name]) fail(`${name} is set; self-hosted targets are not allowed.`);
}
if (!existsSync(convexCli)) {
  fail("installed Convex CLI not found at node_modules/convex/bin/main.js; run npm install.");
}

// Explicit target for the child; empty values keep .env.local from supplying
// a deploy key or redirecting to a self-hosted backend.
const childEnv = {
  ...process.env,
  CONVEX_DEPLOYMENT: EXPECTED_DEPLOYMENT,
  NEXT_PUBLIC_CONVEX_URL: EXPECTED_URL,
  CONVEX_DEPLOY_KEY: "",
  CONVEX_SELF_HOSTED_URL: "",
  CONVEX_SELF_HOSTED_ADMIN_KEY: "",
};

function runConvex(args, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [convexCli, ...args], {
    cwd: root,
    env: childEnv,
    shell: false,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) fail(`could not start Convex CLI (${result.error.message}).`);
  if (result.status !== 0) fail(`convex ${args[0]} exited with status ${result.status}.`);
  return result.stdout;
}

// 1. Read-only target check before any write.
const specOutput = runConvex(["function-spec", "--deployment-name", DEPLOYMENT_NAME], {
  capture: true,
});
let reportedUrl;
try {
  reportedUrl = JSON.parse(specOutput).url;
} catch {
  fail("function-spec did not return parseable JSON.");
}
if (reportedUrl !== EXPECTED_URL) {
  fail(`function-spec reported an unexpected deployment URL; expected ${EXPECTED_URL}.`);
}
console.log(`Verified target ${EXPECTED_URL}.`);

// 2. Push with typecheck, then run a safe signed-out progress query.
runConvex([
  "run",
  "readingProgress:getMyProgressForBook",
  JSON.stringify({ volume: "bookofmormon", book: "1-nephi" }),
  "--deployment-name",
  DEPLOYMENT_NAME,
  "--push",
  "--typecheck",
  "enable",
]);
console.log(`Pushed functions to development deployment ${EXPECTED_DEPLOYMENT}.`);
