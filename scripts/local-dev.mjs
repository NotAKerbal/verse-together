import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BACKEND_STATE = ".convex/local/default";
export const MAX_SLOTS = 100;

const WEB_PORT_BASE = 3100;
const BACKEND_PORT_BASE = 3500;
const LOCK_STALE_MS = 60_000;

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

async function withLock(lockDir, task) {
  const deadline = Date.now() + 2 * LOCK_STALE_MS;
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > LOCK_STALE_MS) rmSync(lockDir, { recursive: true, force: true });
      } catch {}
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${lockDir}.`);
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  try {
    return await task();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

export async function claimSlot({ here, worktrees, stateDir, isFree, configOf = backendConfig }) {
  const [main, ...others] = worktrees;
  if (main === here) return 0;
  mkdirSync(stateDir, { recursive: true });
  return withLock(path.join(stateDir, "lock"), async () => {
    const reservations = readReservations(stateDir, new Set(others));
    const reservedOwners = new Set(reservations.values());
    const ownReserved = [...reservations].filter(([, owner]) => owner === here).map(([slot]) => slot);
    const slot = await pickSlot({
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
    for (const stale of ownReserved) if (stale !== slot) rmSync(path.join(stateDir, String(stale)), { force: true });
    writeFileSync(path.join(stateDir, String(slot)), `${here}\n`);
    return slot;
  });
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
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

export function parseEnv(text) {
  const values = new Map();
  const lines = text.replace(/\r\n?/gm, "\n");
  for (const match of lines.matchAll(DOTENV_LINE)) {
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

function assigns(line, name) {
  return new RegExp(`^\\s*(?:export\\s+)?${name}(?:\\s*=|:\\s)`).test(line);
}

export function withEnvValues(text, values) {
  let lines = text === "" ? [] : text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${value}`;
    const first = lines.findIndex((existing) => assigns(existing, name));
    if (first === -1) {
      lines.push(line);
      continue;
    }
    lines = lines.filter((existing, index) => index === first || !assigns(existing, name));
    lines[first] = line;
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
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
