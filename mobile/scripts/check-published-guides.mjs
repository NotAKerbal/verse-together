#!/usr/bin/env node
// Release preflight: is every Come, Follow Me guide that is already published bundled in this checkout?
//
// The native app ships the guides in content/cfm/ as bundled data (scripts/generate-mobile-data.mjs); it does not
// download new guides at run time. A build from a branch that is behind the published site would ship a stale
// lesson list, so check before building:
//
//   git fetch origin master
//   node scripts/check-published-guides.mjs                 both checks below
//   node scripts/check-published-guides.mjs --no-site       only the git check (offline)
//   node scripts/check-published-guides.mjs --no-git        only the site check
//   node scripts/check-published-guides.mjs --ref origin/dev --site https://www.versetogether.org
//   node scripts/check-published-guides.mjs --local /tmp/guides.json   check another index (a dry run)
//
// 1. Git: every guide in <ref>:content/cfm/guides.json (production deploys from master) is in this checkout's
//    content/cfm/guides.json with the same Markdown SHA-256.
// 2. Site: every week the published lesson index links to that renders a study guide is in this checkout.
//
// Exit 0: up to date. Exit 1: a published guide is missing or differs (the report says which). Exit 2: a check
// couldn't run (unknown ref, network failure); the release is not verified.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const ref = option("--ref", "origin/master");
const site = option("--site", "https://www.versetogether.org").replace(/\/+$/, "");
const useGit = !args.includes("--no-git");
const useSite = !args.includes("--no-site");

const local = JSON.parse(fs.readFileSync(path.resolve(option("--local", path.join(repoRoot, "content/cfm/guides.json"))), "utf8"));
const localByStart = new Map(local.map((guide) => [guide.startDate, guide]));
const stale = [];
const blocked = [];

if (useGit) {
  let published = null;
  try {
    published = JSON.parse(execFileSync("git", ["show", `${ref}:content/cfm/guides.json`], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    blocked.push(`git: couldn't read ${ref}:content/cfm/guides.json (run \`git fetch origin master\` first): ${String(error.stderr ?? error.message).trim()}`);
  }
  for (const guide of published ?? []) {
    const mine = localByStart.get(guide.startDate);
    if (!mine) stale.push(`git ${ref}: ${guide.startDate} "${guide.title}" (${guide.slug}) is not bundled`);
    else if (mine.slug !== guide.slug || mine.sha256 !== guide.sha256) {
      stale.push(`git ${ref}: ${guide.startDate} differs (${ref} ${guide.slug} ${guide.sha256.slice(0, 12)}, here ${mine.slug} ${mine.sha256.slice(0, 12)})`);
    }
  }
  if (published) console.log(`git ${ref}: ${published.length} published guides checked`);
}

async function text(url) {
  const response = await fetch(url, { headers: { "user-agent": "verse-together-mobile-preflight" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

if (useSite) {
  try {
    const index = await text(`${site}/come-follow-me`);
    const weeks = [...new Set([...index.matchAll(/\/come-follow-me\/(\d{4}-\d{2}-\d{2})/g)].map((match) => match[1]))].sort();
    if (weeks.length === 0) blocked.push(`site: ${site}/come-follow-me links to no lessons; its markup may have changed`);
    for (const week of weeks) {
      if (localByStart.has(week)) continue;
      // A linked week without a guide (this week, before one is written) says so; a guide page has its sections.
      const page = await text(`${site}/come-follow-me/${week}`);
      if (page.includes("cfm-section")) stale.push(`site ${site}: ${week} has a published study guide that is not bundled`);
    }
    console.log(`site ${site}: ${weeks.length} linked lessons checked (${weeks.join(", ")})`);
  } catch (error) {
    blocked.push(`site: ${error.message}`);
  }
}

for (const line of stale) console.error(`stale: ${line}`);
for (const line of blocked) console.error(`not checked: ${line}`);
if (stale.length) {
  console.error("Bring the published guide into content/cfm/ (from the branch that published it), then run `npm run generate`.");
  process.exit(1);
}
if (blocked.length) process.exit(2);
console.log(`bundled guides are up to date with what is published (${local.length} here)`);
