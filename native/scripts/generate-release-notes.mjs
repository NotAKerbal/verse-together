// Writes native/assets/release-notes.json from the website's own release history (src/lib/releaseNotes.ts, read with
// Node's type stripping as scripts/release-version.mjs reads it). The desktop app shows exactly these notes and
// screenshots in Settings → Release notes; run this after the website's notes change:
//
//   node native/scripts/generate-release-notes.mjs          write the file
//   node native/scripts/generate-release-notes.mjs --check  fail if the file is out of date
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "native/assets/release-notes.json");
const { RELEASES, UNRELEASED } = await import(pathToFileURL(path.join(ROOT, "src/lib/releaseNotes.ts")).href);

// Only what Settings shows: the commits behind each release are bookkeeping, never displayed.
const item = ({ kind, text, screenshot }) => (screenshot ? { kind, text, screenshot } : { kind, text });
const notes = {
  unreleased: { title: UNRELEASED.title, items: UNRELEASED.items.map(item) },
  releases: RELEASES.map(({ version, date, since, title, items }) => ({
    version,
    date,
    ...(since ? { since } : {}),
    title,
    items: items.map(item),
  })),
};
const json = `${JSON.stringify(notes, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(OUT, "utf8") !== json) {
    console.error("native/assets/release-notes.json is out of date: run node native/scripts/generate-release-notes.mjs");
    process.exit(1);
  }
  console.log("native/assets/release-notes.json matches src/lib/releaseNotes.ts");
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${notes.releases.length} releases to native/assets/release-notes.json`);
}
