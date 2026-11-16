import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BACKEND_STATE = ".convex/local/default";
export const MAX_SLOTS = 100;

const WEB_PORT_BASE = 3100;
const BACKEND_PORT_BASE = 3500;
const LOCK_WAIT_MS = 120_000;

const DEPLOYMENT_SELECTORS = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
];

const INHERITED_OVERRIDES = [
  ...DEPLOYMENT_SELECTORS,
  "CONVEX_AGENT_MODE",
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_SITE_URL",
  "AUTH_PROXY_SECRET",
];

export function portsFor(slot) {
  return { web: WEB_PORT_BASE + slot, cloud: BACKEND_PORT_BASE + 2 * slot, site: BACKEND_PORT_BASE + 1 + 2 * slot };
}

export function siteUrlFor(slot) {
  const host = slot === 0 ? "verse-together.localhost" : `verse-together-${slot}.localhost`;
  return `http://${host}:${portsFor(slot).web}`;
}

export function slotOf(config) {
  const cloud = config?.ports?.cloud;
  if (!Number.isInteger(cloud)) return null;
  const offset = cloud - BACKEND_PORT_BASE;
  if (offset < 0 || offset % 2 !== 0 || offset / 2 >= MAX_SLOTS) return null;
  return offset / 2;
}

export function backendConfig(checkout) {
  try {
    return JSON.parse(readFileSync(path.resolve(checkout, BACKEND_STATE, "config.json"), "utf8"));
  } catch {
    return null;
  }
}

export function localDeploymentName(config) {
  const name = config?.deploymentName;
  return typeof name === "string" && /^local-[A-Za-z0-9_-]+$/.test(name) ? name : null;
}

export function parseWorktrees(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

export async function pickSlot({ here, isMain, ownSlots, reservations, otherConfigSlots, isFree }) {
  if (isMain) return 0;
  const configClaims = new Set(otherConfigSlots);
  const available = (slot) => {
    if (!Number.isInteger(slot) || slot < 1 || slot >= MAX_SLOTS) return false;
    const owner = reservations.get(slot);
    return owner === here || (owner === undefined && !configClaims.has(slot));
  };
  for (const slot of ownSlots) if (available(slot)) return slot;
  for (let slot = 1; slot < MAX_SLOTS; slot++) {
    if (!available(slot)) continue;
    const free = await Promise.all(Object.values(portsFor(slot)).map(isFree));
    if (free.every(Boolean)) return slot;
  }
  const last = portsFor(MAX_SLOTS - 1);
  throw new Error(`Every port from ${portsFor(1).web} to ${last.web} is taken by another checkout or program.`);
}

export function slotStateDir(gitCommonDir, env = process.env) {
  const base = env.XDG_STATE_HOME || path.join(homedir(), ".local", "state");
  const repository = createHash("sha256").update(gitCommonDir).digest("hex").slice(0, 16);
  return path.join(base, "verse-together", `dev-slots-${repository}`);
}

function readReservations(stateDir, live) {
  const reservations = new Map();
  let entries = [];
  try {
    entries = readdirSync(stateDir);
  } catch {}
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const owner = readFileSync(path.join(stateDir, entry), "utf8").trim();
      if (live.has(owner)) reservations.set(Number(entry), owner);
    } catch {}
  }
  return reservations;
}

function readLockOwner(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function holderIsGone(owner) {
  return owner !== null && owner.host === hostname() && Number.isInteger(owner.pid) && !isRunning(owner.pid);
}

function tryAcquire(lockFile, owner) {
  const pending = `${lockFile}.${owner.token}`;
  writeFileSync(pending, JSON.stringify(owner));
  try {
    linkSync(pending, lockFile);
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return false;
  } finally {
    rmSync(pending, { force: true });
  }
}

function reapAbandoned(lockFile, token) {
  const owner = readLockOwner(lockFile);
  if (!holderIsGone(owner)) return;
  const reaped = `${lockFile}.reaped-${token}`;
  try {
    renameSync(lockFile, reaped);
  } catch {
    return;
  }
  if (readLockOwner(reaped)?.token !== owner.token) {
    try {
      linkSync(reaped, lockFile);
    } catch {}
  }
  rmSync(reaped, { force: true });
}

async function withLock(lockFile, waitMs, task) {
  const owner = { pid: process.pid, host: hostname(), token: randomBytes(8).toString("hex") };
  const deadline = Date.now() + waitMs;
  while (!tryAcquire(lockFile, owner)) {
    reapAbandoned(lockFile, owner.token);
    if (Date.now() > deadline) {
      throw new Error(`Another npm run dev is holding ${lockFile}. If none is running, delete that file and try again.`);
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  try {
    return await task(() => readLockOwner(lockFile)?.token === owner.token);
  } finally {
    if (readLockOwner(lockFile)?.token === owner.token) rmSync(lockFile, { force: true });
  }
}

export async function claimSlot({ here, worktrees, stateDir, isFree, configOf = backendConfig, lockWaitMs = LOCK_WAIT_MS }) {
  const [main, ...others] = worktrees;
  if (main === here) return 0;
  mkdirSync(stateDir, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    const slot = await withLock(path.join(stateDir, "slots.lock"), lockWaitMs, async (held) => {
      const reservations = readReservations(stateDir, new Set(others));
      const reservedOwners = new Set(reservations.values());
      const ownReserved = [...reservations].filter(([, owner]) => owner === here).map(([reserved]) => reserved);
      const chosen = await pickSlot({
        here,
        isMain: false,
        ownSlots: [...ownReserved, slotOf(configOf(here))],
        reservations,
        otherConfigSlots: others
          .filter((worktree) => worktree !== here && !reservedOwners.has(worktree))
          .map((worktree) => slotOf(configOf(worktree)))
          .filter((claimed) => claimed !== null),
        isFree,
      });
      if (!held()) return null;
      for (const stale of ownReserved) if (stale !== chosen) rmSync(path.join(stateDir, String(stale)), { force: true });
      writeFileSync(path.join(stateDir, String(chosen)), `${here}\n`);
      return held() ? chosen : null;
    });
    if (slot !== null) return slot;
    if (attempt === 2) throw new Error(`Could not reserve a port slot in ${stateDir}. Try again.`);
  }
}

export function isFree(port) {
  return new Promise((done) => {
    const server = createServer()
      .once("error", () => done(false))
      .listen(port, () => server.close(() => done(true)));
  });
}

export function readEnvFile(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

const DOTENV_LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/dgm;

const normalizeNewlines = (text) => text.replace(/\r\n?/g, "\n");

export function parseEnv(text) {
  const values = new Map();
  for (const match of normalizeNewlines(text).matchAll(DOTENV_LINE)) {
    let value = (match[2] || "").trim();
    const quote = value[0];
    value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");
    if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    values.set(match[1], value);
  }
  return values;
}

export function envValue(text, name) {
  return parseEnv(text).get(name) ?? null;
}

function assignmentSpans(text, name) {
  const spans = [];
  for (const match of text.matchAll(DOTENV_LINE)) {
    if (match[1] !== name) continue;
    const start = text.lastIndexOf("\n", match.indices[1][0] - 1) + 1;
    const lineEnd = text.indexOf("\n", (match.indices[2] ?? match.indices[1])[1]);
    spans.push({ start, end: lineEnd === -1 ? text.length : lineEnd });
  }
  return spans;
}

export function withEnvValues(text, values) {
  let result = normalizeNewlines(text);
  for (const [name, value] of Object.entries(values)) {
    if (!/^\w+$/.test(name) || /[\s"'`#\\]/.test(value)) throw new Error(`Refusing to write an unsafe value for ${name}.`);
    const line = `${name}=${value}`;
    const [first, ...later] = assignmentSpans(result, name);
    if (!first) {
      result = `${result}${result === "" || result.endsWith("\n") ? "" : "\n"}${line}\n`;
      continue;
    }
    for (const span of later.reverse()) {
      const end = result[span.end] === "\n" ? span.end + 1 : span.end;
      result = result.slice(0, span.start) + result.slice(end);
    }
    result = result.slice(0, first.start) + line + result.slice(first.end);
  }
  return result;
}

export function writeEnvValues(file, values) {
  const text = readEnvFile(file);
  const updated = withEnvValues(text, values);
  if (updated !== text) writeFileSync(file, updated);
}

export function parseEnvList(output) {
  return parseEnv(output);
}

export function childEnv(extra = {}) {
  const env = { ...process.env };
  for (const name of INHERITED_OVERRIDES) delete env[name];
  return { ...env, ...extra };
}

export function convexEnv(deploymentName) {
  const pinned = Object.fromEntries(DEPLOYMENT_SELECTORS.map((name) => [name, ""]));
  if (deploymentName) pinned.CONVEX_DEPLOYMENT = `local:${deploymentName}`;
  return pinned;
}

function describe(cmd, args) {
  const shown = args.slice(0, 3).join(" ");
  return `${path.basename(cmd)} ${shown}${args.length > 3 ? " …" : ""}`;
}

export function capture(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd ?? root,
    env: childEnv(options.env),
    encoding: "utf8",
    input: options.input,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", options.quiet ? "pipe" : "inherit"],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${describe(cmd, args)} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.quiet && result.stderr ? `\n${result.stderr.trim()}` : "";
    throw new Error(`${describe(cmd, args)} failed with exit code ${result.status}${detail}`);
  }
  return result.stdout.trim();
}

export function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: options.cwd ?? root, env: childEnv(options.env), stdio: "inherit" });
  if (result.error) throw new Error(`${describe(cmd, args)} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${describe(cmd, args)} failed with exit code ${result.status}`);
}

export function start(cmd, args, options = {}) {
  return spawn(cmd, args, { cwd: options.cwd ?? root, env: childEnv(options.env), stdio: "inherit", detached: true });
}

export function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch {
    return false;
  }
}

export async function stopGroups(children, seconds = 10) {
  for (const child of children) signalGroup(child, "SIGINT");
  for (let i = 0; i < seconds * 10 && children.some((child) => signalGroup(child, 0)); i++) {
    await new Promise((done) => setTimeout(done, 100));
  }
  for (const child of children) signalGroup(child, "SIGKILL");
}

export function step(message) {
  console.log(`\n\x1b[1m▸ ${message}\x1b[0m`);
}

export async function waitFor(url, seconds) {
  for (let i = 0; i < seconds; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`${url} did not respond within ${seconds} seconds.`);
}
