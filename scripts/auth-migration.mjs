#!/usr/bin/env node
// Operator tool for linking legacy Clerk accounts to Better Auth users. See docs/auth-migration.md.
//
//   npm run auth:migrate -- convert-clerk-csv --in clerk-users.csv --out mapping.json
//   npm run auth:migrate -- plan  --file mapping.json [--create-missing] [--prod]
//   npm run auth:migrate -- apply --file mapping.json [--create-missing] [--prod] --yes
//   npm run auth:migrate -- audit [--prod]
//   npm run auth:migrate -- unlink --legacy-id user_... [--prod] [--yes]
//
// Calls internal Convex functions through `npx convex run`, so it needs the same deployment access as
// `npx convex deploy` (CONVEX_DEPLOYMENT / CONVEX_DEPLOY_KEY). Reports contain email addresses; they are
// written with owner-only permissions and only summaries are printed.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BATCH_SIZE = 50;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function convexRun(functionName, args, { prod }) {
  const result = spawnSync(
    "npx",
    ["convex", "run", functionName, JSON.stringify(args), "--typecheck", "disable", "--codegen", "disable", ...(prod ? ["--prod"] : [])],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(`convex run ${functionName} failed:\n${result.stderr || result.stdout}`);
  }
  const output = result.stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Unexpected output from convex run ${functionName}:\n${output.slice(0, 500)}`);
  }
}

async function writeReport(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

// ---- Clerk CSV conversion ----------------------------------------------------------------------

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function splitList(value) {
  return (value ?? "")
    .split(/[,;|\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Builds mapping entries from a Clerk dashboard user export. Requires the `id` and
 * `primary_email_address` columns; uses `verified_email_addresses` to decide whether the primary
 * address was verified (entries without proof of verification are marked unverified and will be
 * refused by the migration). Password hashes in the export are never read or copied.
 */
export function clerkCsvToEntries(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("The CSV is empty");
  const columns = header.map((name) => name.trim().toLowerCase());
  const column = (name) => columns.indexOf(name);
  const idIndex = column("id");
  const emailIndex = column("primary_email_address");
  const verifiedIndex = column("verified_email_addresses");
  if (idIndex < 0 || emailIndex < 0) {
    throw new Error("Expected `id` and `primary_email_address` columns in the Clerk export");
  }
  const firstIndex = column("first_name");
  const lastIndex = column("last_name");
  const entries = [];
  const skipped = [];
  for (const cells of rows) {
    const legacyClerkId = (cells[idIndex] ?? "").trim();
    const email = (cells[emailIndex] ?? "").trim().toLowerCase();
    if (!legacyClerkId || !email) {
      skipped.push({ legacyClerkId: legacyClerkId || null, reason: "missing id or primary email" });
      continue;
    }
    const verified = verifiedIndex >= 0 ? splitList(cells[verifiedIndex]).includes(email) : false;
    const name = [cells[firstIndex] ?? "", cells[lastIndex] ?? ""].map((part) => part.trim()).filter(Boolean).join(" ");
    entries.push({ legacyClerkId, email, emailVerified: verified, ...(name ? { name } : {}) });
  }
  return { entries, skipped };
}

// ---- Commands -----------------------------------------------------------------------------------

async function loadEntries(file) {
  if (typeof file !== "string") throw new Error("--file <mapping.json> is required");
  const parsed = JSON.parse(await readFile(file, "utf8"));
  const entries = Array.isArray(parsed) ? parsed : parsed.entries;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("The mapping file has no entries");
  for (const entry of entries) {
    if (typeof entry.legacyClerkId !== "string" || typeof entry.email !== "string" || typeof entry.emailVerified !== "boolean") {
      throw new Error("Each entry needs legacyClerkId (string), email (string) and emailVerified (boolean)");
    }
  }
  return entries.map(({ legacyClerkId, email, emailVerified, name, imageUrl }) => ({
    legacyClerkId,
    email,
    emailVerified,
    ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
    ...(typeof imageUrl === "string" && imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
  }));
}

function batches(entries) {
  const out = [];
  for (let index = 0; index < entries.length; index += BATCH_SIZE) out.push(entries.slice(index, index + BATCH_SIZE));
  return out;
}

function plan(entries, options) {
  const plans = [];
  for (const batch of batches(entries)) {
    const result = convexRun(
      "authMigration:linkLegacyAccounts",
      { dryRun: true, createMissingAuthUsers: options.createMissing, entries: batch },
      options
    );
    plans.push(...result.plans);
  }
  return plans;
}

function summarize(plans) {
  const counts = { total: plans.length, link: 0, already_linked: 0, error: 0 };
  const errors = {};
  for (const entry of plans) {
    counts[entry.status] += 1;
    if (entry.error) errors[entry.error] = (errors[entry.error] ?? 0) + 1;
  }
  return { counts, errors };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const options = { prod: flags.prod === true, createMissing: flags["create-missing"] === true };
  const target = options.prod ? "PRODUCTION" : "the configured development deployment";

  if (command === "convert-clerk-csv") {
    if (typeof flags.in !== "string" || typeof flags.out !== "string") throw new Error("--in <csv> and --out <json> are required");
    const { entries, skipped } = clerkCsvToEntries(await readFile(flags.in, "utf8"));
    await writeReport(flags.out, { entries, skipped });
    const unverified = entries.filter((entry) => !entry.emailVerified).length;
    console.log(`Wrote ${entries.length} entries (${unverified} without a verified primary email, ${skipped.length} skipped) to ${flags.out}`);
    return;
  }

  if (command === "plan" || command === "apply") {
    const entries = await loadEntries(flags.file);
    console.log(`Planning ${entries.length} entries against ${target}…`);
    const plans = plan(entries, options);
    const summary = summarize(plans);
    const reportFile = `${flags.file}.${command}-report.json`;
    await writeReport(reportFile, { target, createMissingAuthUsers: options.createMissing, summary, plans });
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Full plan written to ${reportFile}`);
    if (command === "plan") return;

    if (summary.counts.error > 0) {
      console.error("Not applying: fix or remove the entries with errors, then run again.");
      process.exitCode = 1;
      return;
    }
    if (flags.yes !== true) {
      console.error(`Re-run with --yes to apply ${summary.counts.link} links to ${target}.`);
      process.exitCode = 1;
      return;
    }
    let applied = 0;
    for (const batch of batches(entries)) {
      const result = convexRun(
        "authMigration:linkLegacyAccounts",
        { dryRun: false, createMissingAuthUsers: options.createMissing, entries: batch },
        options
      );
      if (!result.applied) {
        // State changed between plan and apply; earlier batches stay applied (each is atomic).
        await writeReport(`${flags.file}.apply-failed-batch.json`, result);
        throw new Error(`A batch was not applied after ${applied} entries; see ${flags.file}.apply-failed-batch.json`);
      }
      applied += batch.length;
      process.stdout.write(`Applied ${applied}/${entries.length}\r`);
    }
    process.stdout.write("\n");
    console.log("Done. Run `npm run auth:migrate -- audit` to verify.");
    return;
  }

  if (command === "audit") {
    const audit = convexRun("authMigration:auditAuthLinks", {}, options);
    console.log(JSON.stringify({ ...audit, legacyUnlinked: audit.legacyUnlinked.length }, null, 2));
    if (flags.out) {
      await writeReport(flags.out, audit);
      console.log(`Full audit written to ${flags.out}`);
    }
    return;
  }

  if (command === "unlink") {
    if (typeof flags["legacy-id"] !== "string") throw new Error("--legacy-id <user_...> is required");
    const dryRun = flags.yes !== true;
    const result = convexRun("authMigration:unlinkLegacyAccount", { legacyClerkId: flags["legacy-id"], dryRun }, options);
    console.log(JSON.stringify(result, null, 2));
    if (dryRun && result.ok) console.log(`Dry run only. Re-run with --yes to unlink on ${target}.`);
    return;
  }

  console.error("Usage: auth-migration.mjs <convert-clerk-csv|plan|apply|audit|unlink> [options]");
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
