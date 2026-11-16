import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const notBuiltFrom = ["mobile", "native", "docs", "*.md"];
export const forceBuildMarker = "[force build]";
const buildInputs = [".", ...notBuiltFrom.map(pattern => `:(exclude,glob)${pattern}`)];

export function decide({ env = process.env, cwd = root } = {}) {
  const git = (...args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  const short = sha => sha.slice(0, 7);
  const build = reason => ({ build: true, reason });
  const { VERCEL_GIT_PREVIOUS_SHA: previous, VERCEL_GIT_COMMIT_SHA: current } = env;

  if (env.VERSE_PREVIEW) return build("a preview from npm run preview");
  if (!current) return build("not a Git deployment");
  if (!previous) return build("the first deployment of this branch");
  if (previous === current) return build(`a redeploy of ${short(current)}`);
  for (const sha of [previous, current]) {
    if (git("cat-file", "-e", `${sha}^{commit}`).status !== 0) return build(`${short(sha)} is not in Vercel's clone`);
  }
  const message = git("log", "-1", "--format=%B", current);
  if (message.status !== 0 || message.stdout.includes(forceBuildMarker)) return build(`${short(current)} asks for a build with ${forceBuildMarker}`);
  if (git("merge-base", "--is-ancestor", previous, current).status !== 0) {
    return build(`${short(current)} does not descend from the last deployed commit, ${short(previous)}`);
  }

  const range = git("rev-list", `${previous}..${current}`);
  const shallowFile = git("rev-parse", "--git-path", "shallow");
  if (range.status !== 0 || shallowFile.status !== 0) return build(`git could not list ${short(previous)}..${short(current)}`);
  const shallowPath = path.resolve(cwd, shallowFile.stdout.trim());
  const shallow = new Set(existsSync(shallowPath) ? readFileSync(shallowPath, "utf8").split("\n").filter(Boolean) : []);
  if (range.stdout.split("\n").some(sha => shallow.has(sha))) {
    return build(`some commits since ${short(previous)} are missing from Vercel's shallow clone`);
  }

  const net = git("diff", "--name-only", "--no-renames", previous, current, "--", ...buildInputs);
  const each = git("log", "--format=", "--name-only", "--no-renames", "--diff-merges=first-parent", `${previous}..${current}`, "--", ...buildInputs);
  if (net.status !== 0 || each.status !== 0) return build(`git could not compare ${short(previous)} with ${short(current)}`);
  const changed = [...new Set(`${net.stdout}\n${each.stdout}`.split("\n").filter(Boolean))].sort();
  if (changed.length > 0) return build(`these changed since ${short(previous)}\n${changed.join("\n")}`);

  return { build: false, reason: `nothing the web app or Convex backend is built from changed since ${short(previous)}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { build, reason } = decide();
  console.log(`${build ? "Building" : "Skipping"}: ${reason}`);
  process.exitCode = build ? 1 : 0;
}
