import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const UNRELEASED_DIR = "release-notes/unreleased";
export const GENERATED_FILE = "src/lib/unreleasedNotes.generated.json";

const ENTRY_NAME = /^[a-z0-9][a-z0-9-]*\.json$/;
const HASH = /^[0-9a-f]{7,40}$/;
const KINDS = ["new", "improved"];
const ENTRY_KEYS = ["kind", "text", "screenshot", "commits"];
const SCREENSHOT_KEYS = ["src", "width", "height", "alt", "caption", "currentInterface"];

const isText = (value) => typeof value === "string" && value.trim().length > 0;
const isSize = (value) => Number.isInteger(value) && value > 0;
const isIgnored = (name) => name.startsWith("_") || name.startsWith(".") || name === "README.md";

function unknownKeys(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

export function entryProblems(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return ["must be a JSON object."];
  const problems = [];
  if (!KINDS.includes(entry.kind)) problems.push(`kind must be "new" or "improved".`);
  if (!isText(entry.text)) problems.push("text must say what changed for readers.");
  for (const key of unknownKeys(entry, ENTRY_KEYS)) problems.push(`unknown field "${key}"; use ${ENTRY_KEYS.join(", ")}.`);
  if (entry.commits !== undefined && !(Array.isArray(entry.commits) && entry.commits.length && entry.commits.every((hash) => HASH.test(hash)))) {
    problems.push("commits, when given, must list short commit hashes.");
  }
  const shot = entry.screenshot;
  if (shot === undefined) return problems;
  if (!shot || typeof shot !== "object" || Array.isArray(shot)) return [...problems, "screenshot must be an object."];
  if (!isText(shot.src) || !shot.src.startsWith("/release-notes/")) problems.push("screenshot.src must be a file under /release-notes/.");
  if (!isSize(shot.width) || !isSize(shot.height)) problems.push("screenshot.width and screenshot.height must be the image's size in pixels.");
  if (!isText(shot.alt)) problems.push("screenshot.alt must describe the image.");
  if (!isText(shot.caption)) problems.push("screenshot.caption must be given.");
  if (shot.currentInterface !== undefined) problems.push("screenshot.currentInterface is for screenshots taken after their release; leave it off.");
  for (const key of unknownKeys(shot, SCREENSHOT_KEYS)) problems.push(`screenshot has unknown field "${key}".`);
  return problems;
}

export function readUnreleasedEntries(root = ROOT) {
  const dir = path.join(root, UNRELEASED_DIR);
  if (!existsSync(dir)) return { entries: [], problems: [] };
  const entries = [];
  const problems = [];
  const names = readdirSync(dir).filter((name) => !isIgnored(name)).sort();
  for (const name of names) {
    const file = `${UNRELEASED_DIR}/${name}`;
    if (!ENTRY_NAME.test(name)) {
      problems.push(`${file}: entries are lowercase-hyphenated .json files, like journal-prompts.json.`);
      continue;
    }
    let entry;
    try {
      entry = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
    } catch (error) {
      problems.push(`${file}: is not valid JSON (${error.message}).`);
      continue;
    }
    const found = entryProblems(entry);
    if (found.length) problems.push(...found.map((problem) => `${file}: ${problem}`));
    else entries.push({ file, entry });
  }
  const seen = new Map();
  for (const { file, entry } of entries) {
    if (seen.has(entry.text)) problems.push(`${file}: has the same text as ${seen.get(entry.text)}.`);
    else seen.set(entry.text, file);
  }
  return { entries, problems };
}

export function noteItem({ kind, text, screenshot }) {
  return screenshot ? { kind, text, screenshot } : { kind, text };
}

export function unreleasedItems(root = ROOT) {
  const { entries, problems } = readUnreleasedEntries(root);
  if (problems.length) {
    throw new Error(`Unreleased release notes have problems (npm run release:check):\n- ${problems.join("\n- ")}`);
  }
  return entries.map(({ entry }) => noteItem(entry));
}

export function writeUnreleasedNotes(root = ROOT) {
  const items = unreleasedItems(root);
  const out = path.join(root, GENERATED_FILE);
  const json = `${JSON.stringify(items, null, 2)}\n`;
  if (!existsSync(out) || readFileSync(out, "utf8") !== json) writeFileSync(out, json);
  return items;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const items = writeUnreleasedNotes();
    console.log(`Wrote ${items.length} unreleased release note${items.length === 1 ? "" : "s"} to ${GENERATED_FILE}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
