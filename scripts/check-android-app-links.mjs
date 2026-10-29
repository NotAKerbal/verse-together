#!/usr/bin/env node
// Checks that a deployed site lets Android verify the app's links (mobile/store/APP-LINKS.md): its
// /.well-known/assetlinks.json is served directly (no redirect) as JSON, and gives org.versetogether.app a
// handle_all_urls statement listing the expected certificate. Read-only: it only fetches public URLs.
//
//   npm run check:android-app-links -- --expect-sha256 <app signing certificate SHA-256 from Play Console>
//     [--site https://www.versetogether.org] [--google]
//
// --google also asks Google's Digital Asset Links API, which is what Android's verifier consults.

import { parseArgs } from "node:util";
import { ANDROID_PACKAGE, assetLinksProblems, normalizeCertFingerprint } from "../src/lib/androidAppLinks.ts";

const { values } = parseArgs({
  options: {
    "expect-sha256": { type: "string" },
    site: { type: "string", default: "https://www.versetogether.org" },
    google: { type: "boolean", default: false },
  },
});

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

const expected = normalizeCertFingerprint(values["expect-sha256"]);
if (!expected) {
  console.error("Pass --expect-sha256 with the app signing key certificate's SHA-256 (Play Console > Test and release > Setup > App signing).");
  process.exit(2);
}
const site = new URL(values.site);
if (site.protocol !== "https:" || site.pathname !== "/") {
  console.error("--site must be an https origin, such as https://www.versetogether.org");
  process.exit(2);
}

const fileUrl = new URL("/.well-known/assetlinks.json", site);
const response = await fetch(fileUrl, { redirect: "manual", headers: { accept: "application/json" } });
if (response.status !== 200) {
  fail(`${fileUrl} answered ${response.status}${response.headers.get("location") ? ` (redirect to ${response.headers.get("location")})` : ""}; Android needs 200 with no redirect.`);
} else {
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json")) fail(`${fileUrl} is served as "${type}", not application/json.`);
  let body;
  try {
    body = await response.json();
  } catch {
    fail(`${fileUrl} isn't valid JSON.`);
  }
  if (body !== undefined) {
    const problems = assetLinksProblems(body, expected);
    for (const problem of problems) fail(`${fileUrl}: ${problem}.`);
    if (problems.length === 0) console.log(`✓ ${fileUrl} lists ${expected} for ${ANDROID_PACKAGE}.`);
  }
}

if (values.google) {
  const api = new URL("https://digitalassetlinks.googleapis.com/v1/assetlinks:check");
  api.searchParams.set("source.web.site", site.origin);
  api.searchParams.set("relation", "delegate_permission/common.handle_all_urls");
  api.searchParams.set("target.android_app.package_name", ANDROID_PACKAGE);
  api.searchParams.set("target.android_app.certificate.sha256_fingerprint", expected);
  const result = await fetch(api).then((r) => r.json()).catch((error) => ({ error: String(error) }));
  if (result.linked === true) console.log(`✓ Google's Digital Asset Links API links ${site.origin} to ${ANDROID_PACKAGE} (${expected}).`);
  else fail(`Google's Digital Asset Links API doesn't link them yet: ${JSON.stringify(result.debugString ?? result.error ?? result).slice(0, 400)}`);
}
