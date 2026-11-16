import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectRelease,
  findProblems,
  findUnreleasedProblems,
  imageSize,
  isPreparedVersion,
  loadReleaseNotes,
  nextVersion,
} from "./release-version.mjs";
import { GENERATED_FILE, readUnreleasedEntries, UNRELEASED_DIR, watchUnreleasedNotes, writeUnreleasedNotes } from "./unreleased-notes.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const png = (width, height) => {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
};

function release(version, overrides = {}) {
  return {
    version,
    date: "2026-10-27",
    title: `Release ${version}`,
    items: [{ kind: "new", text: "Something new." }],
    masterCommit: "abcdef1",
    commits: ["1234567"],
    ...overrides,
  };
}

function input({ releases, version = releases[0].version, files = {} }) {
  return {
    releases,
    packageJson: { version },
    packageLock: { version, packages: { "": { version } } },
    files: { read: (src) => files[src] ?? null },
  };
}

test("the default next release adds one minor version", () => {
  assert.equal(nextVersion("2.10.0"), "2.11.0");
  assert.equal(nextVersion("2.0.0"), "2.1.0");
  assert.equal(nextVersion("2.16.2", "minor"), "2.17.0");
});

test("patch releases increment the patch on the current minor line", () => {
  assert.equal(nextVersion("2.16.0", "patch"), "2.16.1");
  assert.equal(nextVersion("2.16.1", "patch"), "2.16.2");
  assert.throws(() => nextVersion("2.16.0", "major"), /Use minor or patch/);
  assert.throws(() => nextVersion("invalid", "patch"), /Invalid release version/);
});

test("release retries recognize both prepared bump types", () => {
  for (const base of ["2.16.0", "2.16.2"]) {
    assert.equal(isPreparedVersion(nextVersion(base, "patch"), base), true);
    assert.equal(isPreparedVersion(nextVersion(base, "minor"), base), true);
    assert.equal(isPreparedVersion(base, base), false);
    assert.equal(isPreparedVersion("2.18.0", base), false);
    assert.equal(isPreparedVersion("2.16.4", base), false);
  }
});

test("patch history followed by a minor release passes validation", () => {
  const releases = [release("2.17.0"), release("2.16.2"), release("2.16.1"), release("2.16.0")];
  assert.deepEqual(findProblems(input({ releases })), []);
});

test("image sizes come from PNG and WebP headers", () => {
  assert.deepEqual(imageSize(png(1600, 1000)), { width: 1600, height: 1000 });
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0, "ascii");
  webp.write("WEBPVP8 ", 8, "ascii");
  webp.writeUInt16LE(1200, 26);
  webp.writeUInt16LE(900, 28);
  assert.deepEqual(imageSize(webp), { width: 1200, height: 900 });
  assert.equal(imageSize(Buffer.from("not an image at all, just some text")), null);
});

test("consecutive minor releases that match package.json and the lockfile pass", () => {
  const releases = [release("2.2.0", { masterCommit: undefined }), release("2.1.0"), release("2.0.0")];
  assert.deepEqual(findProblems(input({ releases })), []);
});

test("a skipped or repeated version, a stale lockfile and a missing master commit are reported", () => {
  const skipped = findProblems(input({ releases: [release("2.3.0"), release("2.1.0")] }));
  assert.match(skipped.join("\n"), /must follow 2\.1\.0 by one minor version/);

  const repeated = findProblems(input({ releases: [release("2.1.0"), release("2.1.0")] }));
  assert.match(repeated.join("\n"), /must follow 2\.1\.0/);

  const stale = input({ releases: [release("2.1.0"), release("2.0.0")] });
  stale.packageLock.packages[""].version = "2.0.0";
  assert.match(findProblems(stale).join("\n"), /package-lock\.json version must be 2\.1\.0/);

  const unrecorded = findProblems(input({ releases: [release("2.1.0"), release("2.0.0", { masterCommit: undefined })] }));
  assert.match(unrecorded.join("\n"), /Release 2\.0\.0: masterCommit/);

  assert.match(findProblems(input({ releases: [release("2.1.0")], version: "2.2.0" })).join("\n"), /package\.json version is 2\.2\.0/);
});

test("screenshots must exist at the size the notes give", () => {
  const shot = { src: "/release-notes/a.png", width: 1600, height: 1000, alt: "A screenshot.", caption: "Caption." };
  const releases = [release("2.0.0", { items: [{ kind: "new", text: "Shown.", screenshot: shot }] })];
  assert.deepEqual(findProblems(input({ releases, files: { "/release-notes/a.png": png(1600, 1000) } })), []);
  assert.match(findProblems(input({ releases })).join("\n"), /missing from public/);
  assert.match(findProblems(input({ releases, files: { "/release-notes/a.png": png(800, 500) } })).join("\n"), /is 800×500/);
});

test("the repository's release notes, metadata and screenshots agree", async () => {
  const { RELEASES } = await loadReleaseNotes();
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, RELEASES[0].version);
  const result = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/release-version.mjs", "check"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

const journalEntry = {
  kind: "improved",
  text: "The journal shows a different question each time you visit.",
  commits: ["b6af8f80"],
};
const wordsEntry = {
  kind: "new",
  text: "Greek and Hebrew word results keep their sources in a footer.",
  screenshot: { src: "/release-notes/2.27.0-words.png", width: 1600, height: 1000, alt: "Word results with a footer.", caption: "Word results." },
};

function scratchRepo(entries = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "release-notes-"));
  mkdirSync(path.join(root, "src/lib"), { recursive: true });
  cpSync(path.join(REPO, "src/lib/releaseNotes.ts"), path.join(root, "src/lib/releaseNotes.ts"));
  mkdirSync(path.join(root, UNRELEASED_DIR), { recursive: true });
  writeFileSync(path.join(root, UNRELEASED_DIR, "README.md"), "Entries.\n");
  for (const [name, entry] of Object.entries(entries)) {
    writeFileSync(path.join(root, UNRELEASED_DIR, name), typeof entry === "string" ? entry : JSON.stringify(entry, null, 2));
  }
  return root;
}

test("each unreleased entry file reaches the notes Settings shows, in file name order and without commits", (t) => {
  const root = scratchRepo({ "words.json": wordsEntry, "journal-prompts.json": journalEntry });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const items = writeUnreleasedNotes(root);
  const { text, kind } = journalEntry;
  assert.deepEqual(items, [{ kind, text }, wordsEntry]);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, GENERATED_FILE), "utf8")), items);
});

test("no unreleased directory and no entries both mean no upcoming changes", (t) => {
  const root = scratchRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(writeUnreleasedNotes(root), []);
  rmSync(path.join(root, UNRELEASED_DIR), { recursive: true });
  assert.deepEqual(readUnreleasedEntries(root), { entries: [], problems: [] });
});

test("malformed unreleased entries are reported by file, and the notes refuse to build from them", (t) => {
  const root = scratchRepo({
    "broken.json": "{ kind: new",
    "no-kind.json": { text: "Something." },
    "Bad Name.json": journalEntry,
    "typo.json": { kind: "new", text: "Typo.", screenshoot: {} },
    "again.json": journalEntry,
    "journal.json": journalEntry,
    "later-capture.json": { ...wordsEntry, text: "Later.", screenshot: { ...wordsEntry.screenshot, currentInterface: true } },
    "_draft.json": "not checked",
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { entries, problems } = readUnreleasedEntries(root);
  const report = problems.join("\n");
  assert.match(report, /broken\.json: is not valid JSON/);
  assert.match(report, /no-kind\.json: kind must be "new" or "improved"/);
  assert.match(report, /Bad Name\.json: entries are lowercase-hyphenated \.json files/);
  assert.match(report, /typo\.json: unknown field "screenshoot"/);
  assert.match(report, /journal\.json: has the same text as release-notes\/unreleased\/again\.json/);
  assert.match(report, /later-capture\.json: screenshot\.currentInterface is for screenshots taken after their release/);
  assert.doesNotMatch(report, /_draft/);
  assert.deepEqual(entries.map(({ file }) => path.basename(file)), ["again.json", "journal.json"]);
  assert.throws(() => writeUnreleasedNotes(root), /npm run release:check/);
});

test("an unreleased entry's screenshot must exist at its stated size", (t) => {
  const root = scratchRepo({ "words.json": wordsEntry });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const src = wordsEntry.screenshot.src;
  const check = (files) => findUnreleasedProblems({ root, files: { read: (shot) => files[shot] ?? null } }).problems;
  assert.deepEqual(check({ [src]: png(1600, 1000) }), []);
  assert.match(check({}).join("\n"), /words\.json: \/release-notes\/2\.27\.0-words\.png: file is missing from public/);
  assert.match(check({ [src]: png(800, 500) }).join("\n"), /words\.json: .*is 800×500; notes say 1600×1000/);
});

test("a dry run shows the release it would collect and changes nothing", async (t) => {
  const root = scratchRepo({ "words.json": wordsEntry, "journal-prompts.json": journalEntry });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const before = readFileSync(path.join(root, "src/lib/releaseNotes.ts"), "utf8");
  const { RELEASES } = await loadReleaseNotes(root);
  const version = nextVersion(RELEASES[0].version, "minor");
  const { block, files } = await collectRelease({ root, version, title: "Journal prompts", date: "2026-11-20", dryRun: true, commitOf: () => "57db3622" });
  assert.match(block, new RegExp(`^  \\{\\n    version: "${version.replace(/\./g, "\\.")}",\\n    date: "2026-11-20",\\n    title: "Journal prompts",`));
  assert.match(block, /commits: \["b6af8f80", "57db3622"\],\n  \},\n$/);
  assert.equal(files.length, 2);
  assert.equal(readFileSync(path.join(root, "src/lib/releaseNotes.ts"), "utf8"), before);
  assert.deepEqual(readdirSync(path.join(root, UNRELEASED_DIR)).sort(), ["README.md", "journal-prompts.json", "words.json"]);
});

test("collecting a release folds the entries into a new first RELEASES entry and deletes their files", async (t) => {
  const root = scratchRepo({ "words.json": wordsEntry, "journal-prompts.json": journalEntry });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { RELEASES: before } = await loadReleaseNotes(root);
  const version = nextVersion(before[0].version, "patch");
  await collectRelease({ root, version, title: "Journal prompts", date: "2026-11-20", commitOf: (file) => (file.endsWith("words.json") ? "57db3622" : null) });

  const { RELEASES: after } = await import(`${pathToFileURL(path.join(root, "src/lib/releaseNotes.ts")).href}?after`);
  const { text, kind } = journalEntry;
  assert.deepEqual(after[0], {
    version,
    date: "2026-11-20",
    title: "Journal prompts",
    items: [{ kind, text }, wordsEntry],
    commits: ["b6af8f80", "57db3622"],
  });
  assert.deepEqual(after.slice(1), before);
  assert.deepEqual(readdirSync(path.join(root, UNRELEASED_DIR)), ["README.md"]);
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, GENERATED_FILE), "utf8")), []);
  assert.deepEqual(findProblems(input({ releases: [after[0]], files: { [wordsEntry.screenshot.src]: png(1600, 1000) } })), []);
});

test("collecting refuses a wrong version, a release already prepared, uncommitted entries and an empty directory", async (t) => {
  const root = scratchRepo({ "words.json": wordsEntry });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { RELEASES } = await loadReleaseNotes(root);
  const current = RELEASES[0].version;
  const collect = (options) => collectRelease({ root, title: "Title", date: "2026-11-20", commitOf: () => null, ...options });
  await assert.rejects(collect({ version: "9.0.0" }), /must be .* \(patch\) or .* \(minor\)/);
  await assert.rejects(collect({ version: current }), new RegExp(`RELEASES already has ${current.replace(/\./g, "\\.")}`));
  await assert.rejects(collect({ version: nextVersion(current), title: " " }), /short title/);
  await assert.rejects(collect({ version: nextVersion(current) }), /words\.json: isn't committed yet/);
  rmSync(path.join(root, UNRELEASED_DIR, "words.json"));
  await assert.rejects(collect({ version: nextVersion(current) }), /has no entries to release/);
  assert.equal(existsSync(path.join(root, GENERATED_FILE)), false);
});

test("the repository's unreleased entries are well formed", () => {
  assert.deepEqual(readUnreleasedEntries(REPO).problems, []);
});

test("collecting keeps entry text exactly, dollar signs included", async (t) => {
  const text = "Math in $$ … $$, $& and $1 now render as written.";
  const root = scratchRepo({ "math.json": { kind: "improved", text, commits: ["b6af8f80"] } });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { RELEASES } = await loadReleaseNotes(root);
  await collectRelease({ root, version: nextVersion(RELEASES[0].version, "patch"), title: "Costs $$", date: "2026-11-20" });
  const { RELEASES: after } = await import(`${pathToFileURL(path.join(root, "src/lib/releaseNotes.ts")).href}?dollars`);
  assert.equal(after[0].items[0].text, text);
  assert.equal(after[0].title, "Costs $$");
});

test("while watched, adding, changing and removing entries updates the generated notes", async (t) => {
  const root = scratchRepo();
  writeUnreleasedNotes(root);
  const watcher = watchUnreleasedNotes(root, () => {});
  t.after(() => {
    watcher.close();
    rmSync(root, { recursive: true, force: true });
  });
  const generated = () => JSON.parse(readFileSync(path.join(root, GENERATED_FILE), "utf8"));
  const settle = async (expected) => {
    for (let i = 0; i < 50 && JSON.stringify(generated()) !== JSON.stringify(expected); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.deepEqual(generated(), expected);
  };
  const file = path.join(root, UNRELEASED_DIR, "journal-prompts.json");
  writeFileSync(file, JSON.stringify({ kind: "new", text: "Added." }));
  await settle([{ kind: "new", text: "Added." }]);
  writeFileSync(file, JSON.stringify({ kind: "improved", text: "Changed." }));
  await settle([{ kind: "improved", text: "Changed." }]);
  rmSync(file);
  await settle([]);
});

test("commits must be hash strings, and collecting refuses an entry that lists numbers and keeps it", async (t) => {
  const root = scratchRepo({ "numbers.json": { kind: "new", text: "Numbered.", commits: [1234567] } });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.match(readUnreleasedEntries(root).problems.join("\n"), /numbers\.json: commits, when given, must list short commit hashes/);
  const before = readFileSync(path.join(root, "src/lib/releaseNotes.ts"), "utf8");
  const { RELEASES } = await loadReleaseNotes(root);
  await assert.rejects(collectRelease({ root, version: nextVersion(RELEASES[0].version), title: "Title", date: "2026-11-20" }), /Fix the unreleased entries first/);
  assert.equal(readFileSync(path.join(root, "src/lib/releaseNotes.ts"), "utf8"), before);
  assert.equal(existsSync(path.join(root, UNRELEASED_DIR, "numbers.json")), true);
});
