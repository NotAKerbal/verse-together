import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{7,40}$/;

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

/**
 * Problems with the release notes and version metadata; empty when they agree.
 * `files.read(publicPath)` returns a public file's bytes, or null when it's missing.
 */
export function findProblems({ releases, unreleased, packageJson, packageLock, files }) {
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

  const items = [...releases.flatMap((release) => release.items), ...(unreleased?.items ?? [])];
  for (const shot of screenshotsOf(items)) {
    if (!shot.src?.startsWith("/release-notes/")) problems.push(`${shot.src}: screenshots live under public/release-notes/.`);
    if (!shot.alt || !shot.caption) problems.push(`${shot.src}: needs alt text and a caption.`);
    const bytes = files.read(shot.src);
    if (!bytes) {
      problems.push(`${shot.src}: file is missing from public/.`);
      continue;
    }
    const size = imageSize(bytes);
    if (!size || size.width !== shot.width || size.height !== shot.height) {
      problems.push(`${shot.src}: is ${size ? `${size.width}×${size.height}` : "not a PNG or WebP"}; notes say ${shot.width}×${shot.height}.`);
    }
  }
  return problems;
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

async function main([command, argument]) {
  const { RELEASES, UNRELEASED } = await loadReleaseNotes();
  if (command === "check") {
    const problems = findProblems({
      releases: RELEASES,
      unreleased: UNRELEASED,
      packageJson: readJson("package.json"),
      packageLock: readJson("package-lock.json"),
      files: publicFiles,
    });
    if (problems.length) {
      console.error(`Release notes and version metadata disagree:\n- ${problems.join("\n- ")}`);
      process.exit(1);
    }
    console.log(`Version ${RELEASES[0].version}: release notes, package.json, package-lock.json and screenshots agree.`);
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
    return;
  }
  console.error("Usage: node scripts/release-version.mjs check | next [minor|patch] | status [base]");
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
