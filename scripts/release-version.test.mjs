import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { findProblems, imageSize, loadReleaseNotes, nextVersion } from "./release-version.mjs";

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
    unreleased: { title: "", items: [] },
    packageJson: { version },
    packageLock: { version, packages: { "": { version } } },
    files: { read: (src) => files[src] ?? null },
  };
}

test("the next release adds one minor version", () => {
  assert.equal(nextVersion("2.10.0"), "2.11.0");
  assert.equal(nextVersion("2.0.0"), "2.1.0");
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
