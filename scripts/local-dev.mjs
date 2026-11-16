import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BACKEND_STATE = ".convex/local/default";
export const MAX_SLOTS = 100;

const WEB_PORT_BASE = 3100;
const BACKEND_PORT_BASE = 3500;

const DEPLOYMENT_OVERRIDES = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
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

export function parseWorktrees(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

export async function chooseSlot({ ownSlot, isMain, claimedSlots, isFree }) {
  if (isMain) return 0;
  if (ownSlot !== null && ownSlot > 0) return ownSlot;
  const claimed = new Set(claimedSlots);
  for (let slot = 1; slot < MAX_SLOTS; slot++) {
    if (claimed.has(slot)) continue;
    const free = await Promise.all(Object.values(portsFor(slot)).map(isFree));
    if (free.every(Boolean)) return slot;
  }
  const last = portsFor(MAX_SLOTS - 1);
  throw new Error(`Every port from ${portsFor(1).web} to ${last.web} is taken by another checkout or program.`);
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

export function envValue(text, name) {
  const match = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match ? match[1].replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2") : null;
}

export function withEnvValues(text, values) {
  let result = text;
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, "m");
    if (pattern.test(result)) {
      result = result.replace(pattern, () => line);
    } else {
      result = `${result}${result === "" || result.endsWith("\n") ? "" : "\n"}${line}\n`;
    }
  }
  return result;
}

export function writeEnvValues(file, values) {
  const text = readEnvFile(file);
  const updated = withEnvValues(text, values);
  if (updated !== text) writeFileSync(file, updated);
}

export function parseEnvList(output) {
  const values = new Map();
  for (const line of output.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) values.set(line.slice(0, separator), line.slice(separator + 1).replace(/^(["'])(.*)\1$/, "$2"));
  }
  return values;
}

export function childEnv(extra = {}) {
  const env = { ...process.env };
  for (const name of DEPLOYMENT_OVERRIDES) delete env[name];
  return { ...env, ...extra };
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
