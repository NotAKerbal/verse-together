import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noteItem, readUnreleasedEntries, UNRELEASED_DIR, writeUnreleasedNotes } from "./unreleased-notes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{7,40}$/;
const RELEASES_START = "export const RELEASES: readonly Release[] = [\n";

export function parseVersion(version) {
  const match = SEMVER.exec(version ?? "");
  if (!match) return null;
  return match.slice(1).map(Number);
}

export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export function nextVersion(version, bump = "minor") {
  const parsed = parseVersion(version);
  if (!parsed) throw new Error(`Invalid release version: ${version}`);
  const [major, minor, patch] = parsed;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  throw new Error(`Invalid release bump: ${bump}. Use minor or patch.`);
}

export function isPreparedVersion(version, released) {
  return version === nextVersion(released, "minor") || version === nextVersion(released, "patch");
}

/** Width and height from a PNG or WebP file's header, or null for anything else. */
export function imageSize(buffer) {
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.toString("ascii", 12, 16) === "IHDR") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  if (chunk === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function screenshotsOf(items) {
  return items.flatMap((item) => (item.screenshot ? [item.screenshot] : []));
}

export function screenshotProblems(shot, files) {
  const problems = [];
  if (!shot.src?.startsWith("/release-notes/")) problems.push(`${shot.src}: screenshots live under public/release-notes/.`);
  if (!shot.alt || !shot.caption) problems.push(`${shot.src}: needs alt text and a caption.`);
  const bytes = files.read(shot.src);
  if (!bytes) return [...problems, `${shot.src}: file is missing from public/.`];
  const size = imageSize(bytes);
  if (!size || size.width !== shot.width || size.height !== shot.height) {
    problems.push(`${shot.src}: is ${size ? `${size.width}×${size.height}` : "not a PNG or WebP"}; notes say ${shot.width}×${shot.height}.`);
  }
  return problems;
}

/**
 * Problems with the release notes and version metadata; empty when they agree.
 * `files.read(publicPath)` returns a public file's bytes, or null when it's missing.
 */
export function findProblems({ releases, packageJson, packageLock, files }) {
  const problems = [];
  if (!releases.length) return ["RELEASES is empty."];

  releases.forEach((release, index) => {
    const label = `Release ${release.version ?? index}`;
    if (!parseVersion(release.version)) problems.push(`${label}: version must be MAJOR.MINOR.PATCH.`);
    if (!DATE.test(release.date ?? "")) problems.push(`${label}: date must be YYYY-MM-DD.`);
    if (release.since && !(DATE.test(release.since) && release.since <= release.date)) {
      problems.push(`${label}: since must be a YYYY-MM-DD date on or before its date.`);
    }
    if (!release.title) problems.push(`${label}: needs a title.`);
    if (!release.items?.length) problems.push(`${label}: needs at least one item.`);
    if (!release.commits?.length || !release.commits.every((hash) => HASH.test(hash))) {
      problems.push(`${label}: commits must list the short hashes it describes.`);
    }
    // The newest release may be waiting for its master merge; every earlier one records it.
    if (release.masterCommit ? !HASH.test(release.masterCommit) : index > 0) {
      problems.push(`${label}: masterCommit must be the short hash of the master commit that released it.`);
    }
    const older = releases[index + 1];
    if (older && parseVersion(release.version) && parseVersion(older.version)) {
      const [major, minor, patch] = parseVersion(release.version);
      const [oldMajor, oldMinor] = parseVersion(older.version);
      const isNextMinor = major === oldMajor && minor === oldMinor + 1 && patch === 0;
      const isNextMajor = major === oldMajor + 1 && minor === 0 && patch === 0;
      const isPatch = major === oldMajor && minor === oldMinor && compareVersions(release.version, older.version) > 0;
      if (!isNextMinor && !isNextMajor && !isPatch) {
        problems.push(`${label}: must follow ${older.version} by one minor version (or a patch, or a new major).`);
      }
      if (release.date < older.date) problems.push(`${label}: dated before ${older.version}.`);
    }
  });

  const current = releases[0].version;
  if (parseVersion(current) && parseVersion(current)[0] < 2) problems.push("Versions start at 2.0.0, the Marker redesign.");
  if (packageJson.version !== current) problems.push(`package.json version is ${packageJson.version}; the newest release is ${current}.`);
  if (packageLock.version !== current || packageLock.packages?.[""]?.version !== current) {
    problems.push(`package-lock.json version must be ${current} at the top and in packages[""]; run npm install --package-lock-only.`);
  }

  for (const shot of screenshotsOf(releases.flatMap((release) => release.items))) problems.push(...screenshotProblems(shot, files));
  return problems;
}

export function findUnreleasedProblems({ root = ROOT, files }) {
  const { entries, problems } = readUnreleasedEntries(root);
  for (const { file, entry } of entries) {
    if (entry.screenshot) problems.push(...screenshotProblems(entry.screenshot, files).map((problem) => `${file}: ${problem}`));
  }
  return { entries, problems };
}

export function sourceLiteral(value, indent = "") {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.every((element) => typeof element !== "object")) return `[${value.map((element) => sourceLiteral(element)).join(", ")}]`;
    return `[\n${value.map((element) => `${inner}${sourceLiteral(element, inner)},\n`).join("")}${indent}]`;
  }
  if (value && typeof value === "object") {
    const fields = Object.entries(value).filter(([, field]) => field !== undefined);
    return `{\n${fields.map(([key, field]) => `${inner}${key}: ${sourceLiteral(field, inner)},\n`).join("")}${indent}}`;
  }
  return JSON.stringify(value);
}

function commitAdding(root, file) {
  const hash = execFileSync("git", ["log", "--diff-filter=A", "--format=%h", "--abbrev=8", "-n", "1", "--", file], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return hash || null;
}

function today() {
  return new Date().toLocaleDateString("en-CA");
}

export async function collectRelease({ root = ROOT, version, title, date = today(), dryRun = false, commitOf }) {
  const findCommit = commitOf ?? ((file) => commitAdding(root, file));
  if (!title?.trim()) throw new Error('Give the release a short title: --title "…".');
  if (!DATE.test(date)) throw new Error(`The date must be YYYY-MM-DD, not ${date}.`);
  const { RELEASES } = await loadReleaseNotes(root);
  const current = RELEASES[0].version;
  if (RELEASES.some((release) => release.version === version)) {
    throw new Error(`RELEASES already has ${version}. A prepared release isn't collected again; add any later entries to it by hand.`);
  }
  const allowed = [nextVersion(current, "patch"), nextVersion(current, "minor")];
  if (!allowed.includes(version)) {
    throw new Error(`The version must be ${allowed[0]} (patch) or ${allowed[1]} (minor), after ${current}; npm run release:next prints it.`);
  }

  const { entries, problems } = readUnreleasedEntries(root);
  if (problems.length) throw new Error(`Fix the unreleased entries first:\n- ${problems.join("\n- ")}`);
  if (!entries.length) throw new Error(`${UNRELEASED_DIR} has no entries to release.`);
  const commits = [];
  for (const { file, entry } of entries) {
    const hashes = entry.commits ?? [findCommit(file)].filter(Boolean);
    if (!hashes.length) throw new Error(`${file}: isn't committed yet, so its commit is unknown. Commit it, or list its commits.`);
    for (const hash of hashes) if (!commits.includes(hash)) commits.push(hash);
  }

  const release = { version, date, title: title.trim(), items: entries.map(({ entry }) => noteItem(entry)), commits };
  const block = `  ${sourceLiteral(release, "  ")},\n`;
  const files = entries.map(({ file }) => file);
  const notesFile = path.join(root, "src/lib/releaseNotes.ts");
  const source = readFileSync(notesFile, "utf8");
  if (source.split(RELEASES_START).length !== 2) throw new Error("Can't find where RELEASES starts in src/lib/releaseNotes.ts.");
  const result = { release, block, files, previous: RELEASES[0] };
  if (dryRun) return result;

  writeFileSync(notesFile, source.replace(RELEASES_START, () => `${RELEASES_START}${block}`));
  try {
    const { RELEASES: updated } = await import(`${pathToFileURL(notesFile).href}?collect=${Date.now()}`);
    if (JSON.stringify(updated[0]) !== JSON.stringify(release)) throw new Error(`its newest release isn't the collected ${version}`);
  } catch (error) {
    writeFileSync(notesFile, source);
    throw new Error(`src/lib/releaseNotes.ts was left as it was: it didn't load with ${version} added (${error.message}).`);
  }
  for (const file of files) rmSync(path.join(root, file));
  writeUnreleasedNotes(root);
  return result;
}

function optionValue(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

export async function loadReleaseNotes(root = ROOT) {
  return import(pathToFileURL(path.join(root, "src/lib/releaseNotes.ts")).href);
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

const publicFiles = {
  read(publicPath) {
    const file = path.join(ROOT, "public", publicPath);
    return existsSync(file) ? readFileSync(file) : null;
  },
};

function versionAt(ref) {
  return JSON.parse(execFileSync("git", ["show", `${ref}:package.json`], { cwd: ROOT, encoding: "utf8" })).version;
}

function pendingEntries(count) {
  return `${count} unreleased ${count === 1 ? "entry" : "entries"} in ${UNRELEASED_DIR}.`;
}

async function main(args) {
  const [command, argument] = args;
  const { RELEASES } = await loadReleaseNotes();
  if (command === "check") {
    const unreleased = findUnreleasedProblems({ files: publicFiles });
    const problems = [
      ...findProblems({
        releases: RELEASES,
        packageJson: readJson("package.json"),
        packageLock: readJson("package-lock.json"),
        files: publicFiles,
      }),
      ...unreleased.problems,
    ];
    if (problems.length) {
      console.error(`Release notes and version metadata disagree:\n- ${problems.join("\n- ")}`);
      process.exit(1);
    }
    console.log(`Version ${RELEASES[0].version}: release notes, package.json, package-lock.json and screenshots agree. ${pendingEntries(unreleased.entries.length)}`);
    return;
  }
  if (command === "collect") {
    const dryRun = args.includes("--dry-run");
    try {
      const { block, files, previous, release } = await collectRelease({
        version: argument,
        title: optionValue(args, "--title"),
        date: optionValue(args, "--date"),
        dryRun,
      });
      console.log(`${dryRun ? "Would add" : "Added"} ${release.version} to RELEASES in src/lib/releaseNotes.ts:\n\n${block}`);
      console.log(`${dryRun ? "Would remove" : "Removed"} ${files.length} ${files.length === 1 ? "entry" : "entries"}:\n- ${files.join("\n- ")}`);
      console.log(`\nCheck the items' order and wording, and that commits lists what the release ships.`);
      if (!previous.masterCommit) console.log(`Fill in ${previous.version}'s masterCommit: the master merge that released it.`);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    return;
  }
  if (command === "next") {
    console.log(nextVersion(RELEASES[0].version, argument));
    return;
  }
  if (command === "status") {
    const base = argument ?? "origin/master";
    const released = versionAt(base);
    const here = readJson("package.json").version;
    if (!(parseVersion(released)?.[0] >= 2)) {
      console.log(`${base} predates release versions (${released}); this checkout is ${here}.`);
    } else if (here === released) {
      console.log(`Not prepared: this checkout is ${here}, the same as ${base}. Next: ${nextVersion(released, "patch")} (patch) or ${nextVersion(released, "minor")} (minor).`);
    } else if (isPreparedVersion(here, released)) {
      console.log(`Prepared: this checkout is ${here}, one minor or patch version over ${base} (${released}). Don't bump again.`);
    } else {
      console.error(`Unexpected: this checkout is ${here} and ${base} is ${released}; expected ${released}, ${nextVersion(released, "patch")} (patch), or ${nextVersion(released, "minor")} (minor).`);
      process.exit(1);
    }
    console.log(pendingEntries(readUnreleasedEntries().entries.length));
    return;
  }
  console.error('Usage: node scripts/release-version.mjs check | next [minor|patch] | status [base] | collect <version> --title "<title>" [--date YYYY-MM-DD] [--dry-run]');
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
