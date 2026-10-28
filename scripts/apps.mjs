#!/usr/bin/env node
// One entry point for the three apps, preserving their existing toolchains, locks and deployment roots.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const apps = JSON.parse(fs.readFileSync(path.join(root, "apps.json"), "utf8"));
const dryRun = process.argv.includes("--dry-run");
const [name, task = "check", ...extra] = process.argv.slice(2).filter((arg) => arg !== "--dry-run");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!name || name === "list" || name === "--list") {
  for (const [id, app] of Object.entries(apps)) console.log(`${id.padEnd(9)} ${app.directory.padEnd(9)} ${app.name}`);
  process.exit(0);
}

const selected = name === "--all" ? Object.keys(apps) : [name];
const jobs = [];
for (const id of selected) {
  if (!Object.hasOwn(apps, id)) fail(`Unknown app ${id}. Use npm run apps to list the apps.`);
  const app = apps[id];
  const commands = app.commands[task];
  if (!Object.hasOwn(app.commands, task)) fail(`Unknown ${id} task ${task}. Available: ${Object.keys(app.commands).join(", ")}`);
  if (extra.length && (selected.length > 1 || commands.length > 1)) fail("Extra arguments require a single app and command.");
  const cwd = path.resolve(root, app.directory);
  if (cwd !== path.resolve(root) && !cwd.startsWith(root)) fail(`App ${id} is outside this repository.`);
  for (const command of commands) {
    if (!Array.isArray(command) || !command.length || !command.every((arg) => typeof arg === "string")) fail(`Invalid ${id}/${task} command.`);
    jobs.push({ app: id, task, cwd, command: [...command, ...extra] });
  }
}

if (dryRun) {
  console.log(JSON.stringify(jobs, null, 2));
  process.exit(0);
}

for (const job of jobs) {
  let [program, ...args] = job.command;
  // npm's CLI path avoids shell quoting and Windows .cmd handling when invoked through npm run.
  if (program === "npm" && process.env.npm_execpath) {
    args = [process.env.npm_execpath, ...args];
    program = process.execPath;
  } else if (program === "node") program = process.execPath;
  console.log(`\n${job.app}: ${job.task} (${path.relative(root, job.cwd) || "."})`);
  const result = spawnSync(program, args, { cwd: job.cwd, stdio: "inherit", env: process.env });
  if (result.error) fail(`${job.app}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
