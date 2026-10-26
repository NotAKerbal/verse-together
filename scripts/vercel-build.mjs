// Shared backends are written only by activated dev/master Git builds.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = "https://github.com/NotAKerbal/verse-together.git";
const projectId = "prj_I55xbo17nxAMQHMBXSEjAxpNt97k";
const teamId = "team_5zEN6A1TNn3xXcfWMrHKpVAd";
const targets = {
  dev: { environment: "preview", ref: "dev:fabulous-dogfish-606", name: "fabulous-dogfish-606" },
  master: { environment: "production", ref: "prod:lovable-seal-140", name: "lovable-seal-140" },
};
const overrides = [
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_OVERRIDE_ACCESS_TOKEN",
  "CONVEX_PROVISION_HOST",
  "CONVEX_AGENT_MODE",
];

function refuse(message) {
  throw new Error(`vercel-build refused: ${message}`);
}

export function selectTarget(env) {
  if (env.VERCEL !== "1" || !["preview", "production"].includes(env.VERCEL_ENV)) {
    refuse("requires a Vercel Preview or Production build; use npm run build locally.");
  }
  // VERCEL_PROJECT_ID is a system variable; VERCEL_ORG_ID is CLI-only/optional.
  if (env.VERCEL_PROJECT_ID !== projectId || (env.VERCEL_ORG_ID && env.VERCEL_ORG_ID !== teamId)) {
    refuse("unexpected Vercel project or team.");
  }
  if (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== env.VERCEL_ENV) {
    refuse("custom Vercel environments cannot deploy shared backends.");
  }
  const branch = env.VERCEL_GIT_COMMIT_REF;
  if (!branch) refuse("missing Git branch metadata.");
  const target = targets[branch];
  if (!target) {
    if (env.VERCEL_ENV === "production" || env.CONVEX_AUTOMATIC_DEPLOYMENT) {
      refuse("shared backend automation is allowed only on dev/Preview or master/Production.");
    }
    return null; // Feature previews build without pushing any Convex backend.
  }
  if (target.environment !== env.VERCEL_ENV) refuse("branch and Vercel environment disagree.");
  if (env.CONVEX_AUTOMATIC_DEPLOYMENT !== target.ref) {
    refuse(`activate this environment with CONVEX_AUTOMATIC_DEPLOYMENT=${target.ref}; see docs/convex-deployment.md.`);
  }
  if (env.VERCEL_GIT_REPO_OWNER !== "NotAKerbal" || env.VERCEL_GIT_REPO_SLUG !== "verse-together") {
    refuse("unexpected Git repository.");
  }
  if (!/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? "")) refuse("missing full Git commit SHA.");
  const key = env.CONVEX_DEPLOY_KEY ?? "";
  // Preview/project/admin keys and keys for any other deployment are rejected.
  // The authenticated read-only function-spec below also checks the actual URL.
  const prefix = `${target.ref}|`;
  if (!key.startsWith(prefix) || !/^[A-Za-z0-9_+=/.-]+$/.test(key.slice(prefix.length))) {
    refuse(`CONVEX_DEPLOY_KEY must be a deployment-scoped key for ${target.ref}.`);
  }
  if (env.CONVEX_DEPLOYMENT && env.CONVEX_DEPLOYMENT !== target.ref) {
    refuse(`CONVEX_DEPLOYMENT must be unset or ${target.ref}.`);
  }
  for (const key of overrides) {
    if (env[key]) refuse(`${key} must be unset.`);
  }
  if (env.NEXT_PUBLIC_CONVEX_URL !== `https://${target.name}.convex.cloud` ||
      env.NEXT_PUBLIC_CONVEX_SITE_URL !== `https://${target.name}.convex.site`) {
    refuse("both public Convex URLs must match the selected deployment.");
  }
  return target;
}

function frontendEnv(env) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (key.startsWith("CONVEX_")) clean[key] = "";
  }
  return clean;
}

// Keep credentials out of argv and redact captured output before showing it.
function runProcess(command, args, { env, capture = false }) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    shell: false,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: command === "git" ? 60 * 1000 : 30 * 60 * 1000,
  });
  function redact(value) {
    let output = value ?? "";
    for (const [key, secret] of Object.entries(env)) {
      if (secret && /SECRET|TOKEN|(?:^|_)KEY$/.test(key)) output = output.split(secret).join("[REDACTED]");
    }
    return output;
  }
  if (!capture) process.stdout.write(redact(result.stdout));
  process.stderr.write(redact(result.stderr));
  if (result.error || result.status !== 0) {
    // Do not include error objects/argv/env, which can contain credentials.
    throw new Error(`vercel-build: ${command === process.execPath ? args[0].split(path.sep).at(-1) : command} failed (${result.status ?? "could not complete"}); no subsequent step ran.`);
  }
  return result.stdout ?? "";
}

export function build({ env = process.env, run = runProcess, log = console.log } = {}) {
  const target = selectTarget(env);
  const publicEnv = frontendEnv(env);
  const buildFrontend = () => run(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", "--turbopack"], { env: publicEnv });
  if (!target) {
    log("Feature preview: building frontend without deploying Convex.");
    buildFrontend();
    return;
  }

  const gitEnv = { ...publicEnv, GIT_TERMINAL_PROMPT: "0" };
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const branch = env.VERCEL_GIT_COMMIT_REF;
  function verifyRevision() {
    const head = run("git", ["rev-parse", "HEAD"], { env: gitEnv, capture: true }).trim();
    const latest = run("git", ["ls-remote", "--exit-code", repository, `refs/heads/${branch}`], { env: gitEnv, capture: true }).trim();
    if (head !== sha || latest !== `${sha}\trefs/heads/${branch}`) {
      refuse("checkout is not the current branch head; retry the latest Git deployment, not an old redeploy.");
    }
  }
  const convexEnv = {
    ...env,
    CONVEX_DEPLOYMENT: target.ref,
    CONVEX_DEPLOYMENT_TOKEN: "",
    CONVEX_SELF_HOSTED_URL: "",
    CONVEX_SELF_HOSTED_ADMIN_KEY: "",
    CONVEX_OVERRIDE_ACCESS_TOKEN: "",
    CONVEX_PROVISION_HOST: "",
    CONVEX_AGENT_MODE: "",
    CONVEX_ALLOW_ANONYMOUS: "false",
  };
  const cli = path.join(root, "node_modules/convex/bin/main.js");
  function verifyTarget() {
    const spec = run(process.execPath, [cli, "function-spec"], { env: convexEnv, capture: true });
    let url;
    try { url = JSON.parse(spec).url; } catch { refuse("function-spec did not return valid JSON."); }
    if (url !== env.NEXT_PUBLIC_CONVEX_URL) refuse("authenticated Convex URL does not match the selected target.");
  }

  verifyRevision();
  verifyTarget();
  log(`Verified ${branch} ${sha} -> ${target.ref}. Building frontend before backend push.`);
  buildFrontend();
  verifyRevision(); // A newer push during the build must not deploy this backend.
  log(`Deploying Convex ${target.ref} from ${sha}.`);
  run(process.execPath, [cli, "deploy", "--yes", "--typecheck", "enable", "--message", `Vercel ${branch} ${sha}`], { env: convexEnv });
  verifyTarget();
  log(`Verified backend ${target.ref}; Vercel may now publish this frontend.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { build(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
