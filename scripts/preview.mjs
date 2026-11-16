import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const convexCli = path.join(root, "node_modules/convex/bin/main.js");
const vercelCli = "vercel@65.16.0";
const vercelScope = "notakerbals-projects";
const vercelOrgId = "team_5zEN6A1TNn3xXcfWMrHKpVAd";
const vercelProjectId = "prj_I55xbo17nxAMQHMBXSEjAxpNt97k";
const convexProject = "isaac-cochran:verse-together";
const sharedDeployments = ["fabulous-dogfish-606", "lovable-seal-140"];
const convexOverrides = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_OVERRIDE_ACCESS_TOKEN",
  "CONVEX_PROVISION_HOST",
  "CONVEX_AGENT_MODE",
];

export const TESTER = { name: "Preview Tester", email: "tester@versetogether.test", password: "verse-preview-tester" };

const usage = `Usage: npm run preview [name] [-- --fresh]

Deploys this working tree, committed or not, to its own Convex preview backend and a Vercel preview.
The name defaults to the current Git branch. Running it again with the same name keeps the data;
--fresh replaces the backend with an empty one.`;

export function parseArgs(args, env = {}) {
  const options = { fresh: env.npm_config_fresh === "true", help: false, name: null };
  for (const arg of args) {
    if (arg === "--fresh") options.fresh = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}.\n\n${usage}`);
    else if (options.name === null) options.name = arg;
    else throw new Error(`Give one preview name, not several.\n\n${usage}`);
  }
  return options;
}

export function previewName(requested, branch) {
  const source = requested ?? (branch === "HEAD" ? "" : branch);
  const name = (source ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  if (name.length < 3) {
    throw new Error("Give the preview a name of at least 3 letters or digits: npm run preview <name>");
  }
  return name;
}

export function assertPreviewBackend(deploymentName) {
  if (sharedDeployments.includes(deploymentName)) {
    throw new Error(`Refusing to use the shared backend ${deploymentName} for a preview.`);
  }
  return deploymentName;
}

export function parseDeployKey(output, deploymentName) {
  assertPreviewBackend(deploymentName);
  const key = output.match(/\b(?:dev|preview):[a-z0-9-]+\|\S+/)?.[0];
  if (!key || key.slice(key.indexOf(":") + 1, key.indexOf("|")) !== deploymentName) {
    throw new Error(`Could not read a deploy key for ${deploymentName} from the Convex CLI output.`);
  }
  return key;
}

export function parsePreviewUrl(output) {
  const url = output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/)?.[0];
  if (!url) throw new Error("Could not find the preview URL in the Vercel CLI output.");
  return url;
}

const secrets = new Set();

export function redact(text, hidden = secrets) {
  let output = String(text ?? "");
  for (const secret of hidden) {
    if (secret) output = output.split(secret).join("[REDACTED]");
  }
  return output;
}

function describe(command, args) {
  const shown = args.slice(0, 4).join(" ");
  return `${path.basename(command)} ${shown}${args.length > 4 ? " …" : ""}`;
}

function childEnv(extra = {}) {
  const env = { ...process.env };
  for (const name of convexOverrides) env[name] = "";
  return { ...env, ...extra };
}

const runningChildren = new Set();

export function execute(command, args, { env, input, quiet = false, show = false, finishOnSignal = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: childEnv(env),
      detached: true,
      stdio: [input === undefined ? "ignore" : "pipe", show ? "inherit" : "pipe", quiet ? "pipe" : "inherit"],
    });
    if (!finishOnSignal) runningChildren.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr?.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.stdin?.end(input);
    child.on("error", (error) => {
      runningChildren.delete(child);
      reject(new Error(`${describe(command, args)} failed: ${redact(error.message)}`));
    });
    child.on("close", (status, signal) => {
      runningChildren.delete(child);
      if (status === 0) return resolve(stdout.trim());
      const detail = quiet ? `\n${redact(stderr)}` : "";
      const outcome = signal ? `was stopped by ${signal}` : `failed with exit code ${status}`;
      reject(new Error(`${describe(command, args)} ${outcome}${detail}`));
    });
  });
}

function stopChildren() {
  for (const child of runningChildren) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

export function cleanUpOnSignal(cleanUp, { signals = ["SIGINT", "SIGTERM", "SIGHUP"], exit = (code) => process.exit(code) } = {}) {
  let stopping = null;
  for (const signal of signals) {
    process.on(signal, () => {
      stopping ??= (async () => {
        stopChildren();
        await cleanUp();
        exit(1);
      })();
    });
  }
}

const convex = (args, options = {}) => execute(process.execPath, [convexCli, ...args], options);

function step(message) {
  console.log(`\n\x1b[1m▸ ${message}\x1b[0m`);
}

async function existingDeployment(ref) {
  let output;
  try {
    output = await convex(["function-spec", "--deployment", ref], { quiet: true });
  } catch (error) {
    if (/Deployment .* not found/.test(error.message)) return null;
    throw error;
  }
  const deploymentName = /^https:\/\/([a-z0-9-]+)\.convex\.cloud$/.exec(JSON.parse(output).url)?.[1];
  if (!deploymentName) throw new Error(`Could not read the Convex URL of ${ref}.`);
  return deploymentName;
}

async function authRequest(siteUrl, origin, endpoint, body) {
  const response = await fetch(`${siteUrl}/api/auth/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

export async function ensureTester({ siteUrl, origin, request = authRequest }) {
  const signUp = await request(siteUrl, origin, "sign-up/email", TESTER);
  if (signUp.ok) return "created";
  if (!signUp.text.includes("USER_ALREADY_EXISTS")) {
    throw new Error(`Creating the test account failed (${signUp.status}): ${signUp.text}`);
  }
  const signIn = await request(siteUrl, origin, "sign-in/email", { email: TESTER.email, password: TESTER.password });
  if (!signIn.ok) {
    throw new Error(
      `The test account exists but its password no longer works (${signIn.status}). Run npm run preview -- --fresh to start over.`
    );
  }
  return "existing";
}

async function main() {
  const options = parseArgs(process.argv.slice(2), process.env);
  if (options.help) {
    console.log(usage);
    return;
  }
  const branch = await execute("git", ["rev-parse", "--abbrev-ref", "HEAD"], { quiet: true });
  const name = previewName(options.name, branch);
  const ref = `${convexProject}:preview/${name}`;

  let keyName = null;
  let deploymentName = null;
  let keyDeletion = null;
  const deleteKey = () => (keyDeletion ??= removeKey());
  async function removeKey() {
    if (!keyName) return;
    try {
      await convex(["deployment", "token", "delete", keyName, "--deployment", deploymentName], { quiet: true, finishOnSignal: true });
      console.log(`Deleted the temporary deploy key ${keyName}.`);
    } catch {
      console.error(
        `\n\x1b[1mThe temporary deploy key "${keyName}" was not deleted.\x1b[0m Delete it now:\n` +
          `  npx convex deployment token delete ${keyName} --deployment ${deploymentName}\n`
      );
    }
  }
  cleanUpOnSignal(deleteKey);

  step(`Backend: Convex deployment ${ref}`);
  const existing = options.fresh ? null : await existingDeployment(ref);
  if (existing) {
    console.log(`Reusing ${existing} and its data. Pass -- --fresh to start empty.`);
  } else {
    await convex(["deployment", "create", `${convexProject}:${name}`, "--type", "preview"]);
  }
  deploymentName = assertPreviewBackend((await existingDeployment(ref)) ?? "");
  if (!deploymentName) throw new Error(`Could not find ${ref} after creating it.`);
  if (existing && existing !== deploymentName) throw new Error(`${ref} changed from ${existing} to ${deploymentName}.`);

  let url;
  try {
    keyName = `preview-script-${Date.now()}`;
    const key = parseDeployKey(
      await convex(["deployment", "token", "create", keyName, "--deployment", deploymentName], { quiet: true }),
      deploymentName
    );
    secrets.add(key);
    const withKey = (args, extra = {}) => convex(args, { ...extra, env: { CONVEX_DEPLOY_KEY: key } });
    const convexUrl = `https://${deploymentName}.convex.cloud`;
    const convexSiteUrl = `https://${deploymentName}.convex.site`;

    const settings = await withKey(["env", "list"], { quiet: true });
    const isSet = (variable) => new RegExp(`^${variable}=`, "m").test(settings);
    for (const variable of ["BETTER_AUTH_SECRET", "AUTH_PROXY_SECRET"]) {
      if (!isSet(variable)) await withKey(["env", "set", variable], { input: randomBytes(32).toString("base64url"), quiet: true });
    }
    if (!isSet("SITE_URL")) await withKey(["env", "set", "SITE_URL", "http://localhost:3000"], { quiet: true });
    await withKey(["env", "set", "AUTH_EMAIL_PASSWORD_ENABLED", "true"], { quiet: true });
    const proxySecret = await withKey(["env", "get", "AUTH_PROXY_SECRET"], { quiet: true });
    secrets.add(proxySecret);
    await withKey(["deploy", "--yes", "--codegen", "disable", "--typecheck", "enable", "--message", `npm run preview ${name}`], { show: true });

    step("Web app: Vercel preview");
    const deployOutput = await execute(
      "npx",
      [
        "--yes", vercelCli, "deploy", "--yes", "--archive=tgz", "--environment", "preview",
        "--scope", vercelScope,
        "--build-env", `NEXT_PUBLIC_CONVEX_URL=${convexUrl}`,
        "--build-env", `NEXT_PUBLIC_CONVEX_SITE_URL=${convexSiteUrl}`,
        "--build-env", `VERSE_PREVIEW=${name}`,
        "--env", `NEXT_PUBLIC_CONVEX_URL=${convexUrl}`,
        "--env", `NEXT_PUBLIC_CONVEX_SITE_URL=${convexSiteUrl}`,
        "--env", "AUTH_PROXY_SECRET",
        "--meta", `versePreview=${name}`,
      ],
      {
        env: {
          VERCEL_ORG_ID: vercelOrgId,
          VERCEL_PROJECT_ID: vercelProjectId,
          GIT_DIR: path.join(root, ".no-git"),
          AUTH_PROXY_SECRET: proxySecret,
        },
      }
    );
    url = parsePreviewUrl(deployOutput);

    step("Connecting sign-in to the preview URL");
    await withKey(["env", "set", "SITE_URL", url], { quiet: true });
  } finally {
    await deleteKey();
  }

  step("Test account");
  const tester = await ensureTester({ siteUrl: `https://${deploymentName}.convex.site`, origin: url });
  console.log(tester === "created" ? "Created." : "Already there from an earlier run.");

  console.log(`
\x1b[1mPreview ${name} is ready\x1b[0m
  URL       ${url}
  Email     ${TESTER.email}
  Password  ${TESTER.password}
  Backend   https://dashboard.convex.dev/d/${deploymentName}

Vercel Authentication protects *.vercel.app deployments of this project: open the URL while
signed in to a Vercel account on the notakerbals-projects team, or share it from the Vercel dashboard.
Convex deletes preview backends 5 days after they are created.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`\n${redact(error.message)}`);
    process.exitCode = 1;
  }
}
