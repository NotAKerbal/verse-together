#!/usr/bin/env node
// Fetch a pinned Open Scriptures revision and normalize its Strong's dictionaries as server-side data.
// No downloaded JavaScript is executed. See docs/strongs-data.md for attribution and licensing.
// Usage: node scripts/generateStrongsLexicons.mjs [--from-dir DIR]
// DIR may contain saved strongs-hebrew-dictionary.js and strongs-greek-dictionary.js files.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REVISION = "0acd2f251c2d35ff8db2dece4e0593979d3ac223";
const REPOSITORY = "https://github.com/openscriptures/strongs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromDirIndex = process.argv.indexOf("--from-dir");
const fromDir = fromDirIndex < 0 ? null : process.argv[fromDirIndex + 1];
if (fromDirIndex >= 0 && !fromDir) throw new Error("--from-dir needs a directory");

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseSource(language, source) {
  const name = language === "hebrew" ? "strongsHebrewDictionary" : "strongsGreekDictionary";
  const assignment = new RegExp(`var\\s+${name}\\s*=\\s*`).exec(source);
  if (!assignment) throw new Error(`${language}: dictionary assignment missing`);
  const tail = new RegExp(`;\\s*module\\.exports\\s*=\\s*${name}\\s*;?\\s*$`).exec(source);
  if (!tail) throw new Error(`${language}: dictionary terminator missing`);
  const raw = JSON.parse(source.slice(assignment.index + assignment[0].length, tail.index));
  const prefix = language === "hebrew" ? "H" : "G";
  const keys = Object.keys(raw);
  if (keys.length < (language === "hebrew" ? 8600 : 5500)) throw new Error(`${language}: unexpectedly short dictionary`);
  const entries = keys.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((id) => {
    const entry = raw[id];
    if (!new RegExp(`^${prefix}\\d+$`).test(id) || !entry || typeof entry !== "object") {
      throw new Error(`${language}: invalid entry ${id}`);
    }
    return {
      id,
      lemma: text(entry.lemma),
      transliteration: text(entry.xlit ?? entry.translit),
      pronunciation: text(entry.pron) || null,
      definition: text(entry.strongs_def),
      derivation: text(entry.derivation),
      kjv: text(entry.kjv_def),
    };
  });
  // Preserve the upstream credit and license statement verbatim with each derived data file.
  const notices = source.slice(0, assignment.index).trim();
  if (!notices.includes("CC-BY-SA")) throw new Error(`${language}: upstream license notice missing`);
  return {
    source: `${REPOSITORY}/blob/${REVISION}/${language}/strongs-${language}-dictionary.js`,
    revision: REVISION,
    license: "CC-BY-SA (version not specified by upstream)",
    notices,
    entries,
  };
}

// Prepare both payloads before writing either, so a bad upstream response cannot replace valid data.
const payloads = [];
for (const language of ["hebrew", "greek"]) {
  const filename = `strongs-${language}-dictionary.js`;
  let source;
  if (fromDir) source = await readFile(path.join(fromDir, filename), "utf8");
  else {
    const url = `https://raw.githubusercontent.com/openscriptures/strongs/${REVISION}/${language}/${filename}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${language}: HTTP ${response.status}`);
    source = await response.text();
  }
  payloads.push([language, parseSource(language, source)]);
}
for (const [language, payload] of payloads) {
  const filename = language === "hebrew" ? "strongsHebrew.json" : "strongsGreek.json";
  const output = path.join(root, "src/lib/generated", filename);
  await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`${language}: ${payload.entries.length} entries → ${path.relative(root, output)}`);
}
