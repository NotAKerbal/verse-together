import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { decide, exitCode, notBuiltFrom } from "./vercel-ignore.mjs";

const directories = [];
after(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

function repository() {
  const directory = mkdtempSync(path.join(tmpdir(), "verse-ignore-test-"));
  directories.push(directory);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", directory, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = files => {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      writeFileSync(path.join(directory, file), content);
    }
  };
  const commit = (files = {}, message = "change") => {
    write(files);
    git("add", "-A");
    git("commit", "--allow-empty", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "dev");
  const initial = commit({
    "src/app/page.tsx": "export default 1;\n",
    "src/README.md": "src notes\n",
    "convex/schema.ts": "export default 1;\n",
    "mobile/App.tsx": "export default 1;\n",
    "native/src/main.rs": "fn main() {}\n",
    "docs/guide.md": "guide\n",
    "public/robots.txt": "allow\n",
    "content/cfm/guides.json": "[]\n",
    "scripts/vercel-build.mjs": "build\n",
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    ".gitignore": "/node_modules\n",
    "README.md": "readme\n",
  });
  return { directory, git, write, commit, initial };
}

function check(repo, previous, current = repo.git("rev-parse", "HEAD"), extra = {}) {
  return decide({ cwd: repo.directory, env: { VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: current, ...extra } });
}

const skips = [
  ["a mobile-only change", { "mobile/App.tsx": "export default 2;\n", "mobile/package-lock.json": "{}\n" }],
  ["a native-only change", { "native/src/main.rs": "fn main() { }\n", "native/Cargo.toml": "[package]\n" }],
  ["a docs-only change", { "docs/guide.md": "guide 2\n", "README.md": "readme 2\n", "AGENTS.md": "agents\n" }],
];
for (const [name, files] of skips) {
  test(`${name} skips`, () => {
    const repo = repository();
    repo.commit(files);
    const result = check(repo, repo.initial);
    assert.equal(result.build, false, result.reason);
    assert.match(result.reason, /nothing the web app or Convex backend is built from changed/);
  });
}

test("several mobile, native and docs commits in one push skip", () => {
  const repo = repository();
  for (const files of skips.map(([, files]) => files)) repo.commit(files);
  assert.equal(check(repo, repo.initial).build, false);
});

const builds = [
  ["a src/ change", { "src/app/page.tsx": "export default 2;\n" }, "src/app/page.tsx"],
  ["a convex/ change", { "convex/schema.ts": "export default 2;\n" }, "convex/schema.ts"],
  ["a package-lock.json change", { "package-lock.json": "{\"lockfileVersion\":3}\n" }, "package-lock.json"],
  ["a package.json change", { "package.json": "{\"name\":\"x\"}\n" }, "package.json"],
  ["a public/ change", { "public/robots.txt": "deny\n" }, "public/robots.txt"],
  ["a content/ change", { "content/cfm/guides.json": "[1]\n" }, "content/cfm/guides.json"],
  ["a build script change", { "scripts/vercel-build.mjs": "build 2\n" }, "scripts/vercel-build.mjs"],
  ["a .gitignore change", { ".gitignore": "/node_modules\n/mobile/x\n" }, ".gitignore"],
  ["a nested Markdown change outside docs", { "src/README.md": "src notes 2\n" }, "src/README.md"],
  ["a new top-level file", { "turbo.json": "{}\n" }, "turbo.json"],
  ["a vercel.json change", { "vercel.json": "{}\n" }, "vercel.json"],
];
for (const [name, files, file] of builds) {
  test(`${name} builds, even alongside mobile and native changes`, () => {
    const repo = repository();
    repo.commit({ ...files, "mobile/App.tsx": "export default 3;\n", "native/src/main.rs": "fn main() {  }\n" });
    const result = check(repo, repo.initial);
    assert.equal(result.build, true);
    assert.match(result.reason, new RegExp(`^these changed since ${repo.initial.slice(0, 7)}\\n${file.replaceAll(".", "\\.")}$`));
  });
}

test("a source file moved into mobile/ builds", () => {
  const repo = repository();
  renameSync(path.join(repo.directory, "src/app/page.tsx"), path.join(repo.directory, "mobile/page.tsx"));
  repo.commit();
  assert.match(check(repo, repo.initial).reason, /src\/app\/page\.tsx/);
});

test("a convex/ change reverted later in the same push builds", () => {
  const repo = repository();
  repo.commit({ "convex/schema.ts": "export default 2;\n" });
  repo.git("revert", "--no-edit", "HEAD");
  repo.commit({ "mobile/App.tsx": "export default 2;\n" });
  assert.equal(repo.git("diff", "--name-only", repo.initial, "HEAD", "--", "convex"), "");
  const result = check(repo, repo.initial);
  assert.equal(result.build, true);
  assert.match(result.reason, /convex\/schema\.ts/);
});

test("a merge whose resolution changes src/ builds", () => {
  const repo = repository();
  repo.git("checkout", "-q", "-b", "feature");
  repo.commit({ "mobile/App.tsx": "export default 4;\n" });
  repo.git("checkout", "-q", "dev");
  repo.commit({ "native/src/main.rs": "fn main() {   }\n" });
  const previous = repo.git("rev-parse", "HEAD");
  repo.git("merge", "--no-ff", "--no-commit", "feature");
  repo.write({ "src/app/page.tsx": "export default 5;\n" });
  repo.git("add", "-A");
  repo.git("commit", "-q", "--no-edit");
  assert.match(check(repo, previous).reason, /src\/app\/page\.tsx/);
});

test("a merge of a mobile-only branch skips", () => {
  const repo = repository();
  repo.git("checkout", "-q", "-b", "feature");
  repo.commit({ "mobile/App.tsx": "export default 4;\n" });
  repo.git("checkout", "-q", "dev");
  repo.git("merge", "--no-ff", "-q", "--no-edit", "feature");
  assert.equal(check(repo, repo.initial).build, false);
});

test("no previous SHA builds", () => {
  const repo = repository();
  repo.commit({ "mobile/App.tsx": "export default 2;\n" });
  assert.deepEqual(check(repo, undefined), { build: true, reason: "the first deployment of this branch" });
});

test("a previous commit missing from the clone builds", () => {
  const repo = repository();
  repo.commit({ "mobile/App.tsx": "export default 2;\n" });
  assert.deepEqual(check(repo, "f".repeat(40)), { build: true, reason: "fffffff is not in Vercel's clone" });
});

test("a non-Git deploy builds", () => {
  const repo = repository();
  assert.deepEqual(decide({ cwd: repo.directory, env: { VERCEL_GIT_PREVIOUS_SHA: repo.initial } }), { build: true, reason: "not a Git deployment" });
});

test("a preview from npm run preview builds even with Git metadata", () => {
  const repo = repository();
  repo.commit({ "mobile/App.tsx": "export default 2;\n" });
  assert.deepEqual(check(repo, repo.initial, undefined, { VERSE_PREVIEW: "notes" }), { build: true, reason: "a preview from npm run preview" });
});

test("a redeploy of the last deployed commit builds", () => {
  const repo = repository();
  assert.deepEqual(check(repo, repo.initial, repo.initial), { build: true, reason: `a redeploy of ${repo.initial.slice(0, 7)}` });
});

test("an empty commit marked [force build] builds", () => {
  const repo = repository();
  const current = repo.commit({}, "Redeploy dev after a manual backend write [force build]");
  assert.deepEqual(check(repo, repo.initial, current), { build: true, reason: `${current.slice(0, 7)} asks for a build with [force build]` });
});

test("a rewritten branch that no longer contains the last deployed commit builds", () => {
  const repo = repository();
  const previous = repo.commit({ "mobile/App.tsx": "export default 2;\n" });
  repo.git("reset", "-q", "--hard", repo.initial);
  repo.commit({ "native/src/main.rs": "fn main() { }\n" });
  assert.match(check(repo, previous).reason, /does not descend from the last deployed commit/);
});

test("a push whose commits cross the shallow clone's edge builds", () => {
  const repo = repository();
  repo.git("checkout", "-q", "-b", "feature");
  repo.commit({ "mobile/App.tsx": "export default 4;\n" });
  repo.commit({ "mobile/App.tsx": "export default 5;\n" });
  repo.git("checkout", "-q", "dev");
  const previous = repo.commit({ "native/src/main.rs": "fn main() { }\n" });
  repo.git("merge", "--no-ff", "-q", "--no-edit", "feature");
  assert.equal(check(repo, previous).build, false);

  const clone = mkdtempSync(path.join(tmpdir(), "verse-ignore-clone-"));
  directories.push(clone);
  const cloned = spawnSync("git", ["clone", "-q", "--depth", "2", "-b", "dev", `file://${repo.directory}`, clone], { encoding: "utf8" });
  assert.equal(cloned.status, 0, cloned.stderr);
  const result = decide({ cwd: clone, env: { VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: repo.git("rev-parse", "HEAD") } });
  assert.equal(result.build, true);
  assert.match(result.reason, /missing from Vercel's shallow clone/);
});

test("the command exits 0 to skip and 1 to build, as Vercel expects", () => {
  const repo = repository();
  mkdirSync(path.join(repo.directory, "scripts"), { recursive: true });
  writeFileSync(path.join(repo.directory, "scripts/vercel-ignore.mjs"), readFileSync(new URL("./vercel-ignore.mjs", import.meta.url)));
  const script = repo.commit();
  const mobile = repo.commit({ "mobile/App.tsx": "export default 2;\n" });
  const run = env => spawnSync(process.execPath, [path.join(repo.directory, "scripts/vercel-ignore.mjs")], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });

  const skipped = run({ VERCEL_GIT_PREVIOUS_SHA: script, VERCEL_GIT_COMMIT_SHA: mobile });
  assert.equal(skipped.status, 0, skipped.stdout + skipped.stderr);
  assert.match(skipped.stdout, /^Skipping: /);

  const built = run({ VERCEL_GIT_PREVIOUS_SHA: repo.initial, VERCEL_GIT_COMMIT_SHA: mobile });
  assert.equal(built.status, 1);
  assert.match(built.stdout, /^Building: these changed since .*\nscripts\/vercel-ignore\.mjs\n$/);

  const nonGit = run({});
  assert.equal(nonGit.status, 1);
  assert.equal(nonGit.stdout, "Building: not a Git deployment\n");
});

test("a check that throws or returns nothing builds, so the command exits only 0 or 1", () => {
  const lines = [];
  const log = line => lines.push(line);
  assert.equal(exitCode({ choose: () => { throw new Error("git is missing"); }, log }), 1);
  assert.equal(exitCode({ choose: () => undefined, log }), 1);
  assert.equal(exitCode({ choose: () => ({ build: "no", reason: "odd" }), log }), 1);
  assert.equal(exitCode({ choose: () => ({ build: false, reason: "nothing changed" }), log }), 0);
  assert.deepEqual(lines, [
    "Building: the check failed: git is missing",
    "Building: the check returned no decision",
    "Building: odd",
    "Skipping: nothing changed",
  ]);
});

test("Vercel runs the ignored-build step, and the web build reads nothing it ignores", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const tsconfig = JSON.parse(readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"));
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.equal(config.ignoreCommand, "node scripts/vercel-ignore.mjs");
  assert.deepEqual(config.git.deploymentEnabled, { "**": false, dev: true, master: true });
  assert.match(pkg.scripts["test:deploy"], /scripts\/vercel-ignore\.test\.mjs/);
  for (const pattern of notBuiltFrom) {
    assert.ok(css.includes(`@source not "../../${pattern}";`), `Tailwind must not scan ${pattern}`);
    if (!pattern.includes("*")) assert.ok(tsconfig.exclude.includes(pattern), `TypeScript must not check ${pattern}`);
  }
});
