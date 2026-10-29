// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import {
  ANDROID_PACKAGE,
  APP_SIGNING_ENV,
  PUBLIC_DEBUG_CERT_SHA256,
  UPLOAD_CERT_SHA256,
  androidAssetLinks,
  assetLinksProblems,
  normalizeCertFingerprint,
} from "../src/lib/androidAppLinks";
import { GET } from "../src/app/.well-known/assetlinks.json/route";

// A made-up certificate standing in for Google's app signing key; the real one comes from Play Console.
const APP_SIGNING = "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF".match(/../g)!.join(":");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("fingerprints normalize to Android's upper-case, colon-separated form", () => {
  expect(normalizeCertFingerprint(APP_SIGNING.toLowerCase())).toBe(APP_SIGNING);
  expect(normalizeCertFingerprint(APP_SIGNING.replace(/:/g, ""))).toBe(APP_SIGNING);
  expect(normalizeCertFingerprint(` ${APP_SIGNING} `)).toBe(APP_SIGNING);
  expect(normalizeCertFingerprint(APP_SIGNING.slice(3))).toBeNull();
  expect(normalizeCertFingerprint("ZZ".repeat(32))).toBeNull();
  expect(normalizeCertFingerprint("")).toBeNull();
  expect(normalizeCertFingerprint(undefined)).toBeNull();
  // The documented upload certificate is itself well formed.
  expect(normalizeCertFingerprint(UPLOAD_CERT_SHA256)).toBe(UPLOAD_CERT_SHA256);
});

test("the statement lists the app signing certificate, then the upload certificate, for the app's package", () => {
  const result = androidAssetLinks(APP_SIGNING.toLowerCase());
  expect(result).toEqual({
    ok: true,
    statements: [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "org.versetogether.app", sha256_cert_fingerprints: [APP_SIGNING, UPLOAD_CERT_SHA256] },
      },
    ],
  });
  expect(result.ok && assetLinksProblems(result.statements, APP_SIGNING)).toEqual([]);
  expect(result.ok && assetLinksProblems(result.statements, UPLOAD_CERT_SHA256)).toEqual([]);
});

test("no statement without Google's app signing certificate: missing, malformed, the upload key or the debug key", () => {
  for (const value of [undefined, "", "  ", "not-a-fingerprint", UPLOAD_CERT_SHA256, UPLOAD_CERT_SHA256.toLowerCase(), PUBLIC_DEBUG_CERT_SHA256]) {
    const result = androidAssetLinks(value);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problem).toContain(APP_SIGNING_ENV);
  }
  expect(androidAssetLinks(UPLOAD_CERT_SHA256)).toEqual({ ok: false, problem: expect.stringContaining("upload key") });
});

test("a served file is checked for the package, the expected certificate and the debug key", () => {
  const statement = (pkg: string, certs: string[], relation = "delegate_permission/common.handle_all_urls") => ({
    relation: [relation],
    target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: certs },
  });
  expect(assetLinksProblems({}, APP_SIGNING)).toEqual(["the file isn't a JSON array of statements"]);
  expect(assetLinksProblems([], APP_SIGNING)).toEqual([`no handle_all_urls statement for ${ANDROID_PACKAGE}`]);
  expect(assetLinksProblems([statement("com.other.app", [APP_SIGNING])], APP_SIGNING)).toEqual([`no handle_all_urls statement for ${ANDROID_PACKAGE}`]);
  expect(assetLinksProblems([statement(ANDROID_PACKAGE, [APP_SIGNING], "delegate_permission/common.get_login_creds")], APP_SIGNING)).toHaveLength(1);
  expect(assetLinksProblems([statement(ANDROID_PACKAGE, [UPLOAD_CERT_SHA256])], APP_SIGNING)).toEqual([`${APP_SIGNING} isn't listed for ${ANDROID_PACKAGE}`]);
  expect(assetLinksProblems([statement(ANDROID_PACKAGE, [APP_SIGNING.toLowerCase()])], APP_SIGNING)).toEqual([
    `"${APP_SIGNING.toLowerCase()}" isn't an upper-case, colon-separated SHA-256 fingerprint`,
    `${APP_SIGNING} isn't listed for ${ANDROID_PACKAGE}`,
  ]);
  expect(assetLinksProblems([statement(ANDROID_PACKAGE, [APP_SIGNING, PUBLIC_DEBUG_CERT_SHA256])], APP_SIGNING)).toEqual(["it lists the public Android debug key"]);
  expect(assetLinksProblems([statement(ANDROID_PACKAGE, [APP_SIGNING])], "nope")).toEqual(["the expected certificate isn't a SHA-256 fingerprint"]);
});

test("/.well-known/assetlinks.json serves the statement only when the deployment names the app signing certificate", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv(APP_SIGNING_ENV, "");
  const missing = GET();
  expect(missing.status).toBe(404);
  expect(missing.headers.get("cache-control")).toBe("no-store");
  expect(await missing.json()).toEqual({ error: "Android app links aren't configured on this deployment." });

  vi.stubEnv(APP_SIGNING_ENV, UPLOAD_CERT_SHA256);
  expect(GET().status).toBe(404);
  expect(console.error).toHaveBeenLastCalledWith(expect.stringContaining("upload key"));

  vi.stubEnv(APP_SIGNING_ENV, APP_SIGNING);
  const served = GET();
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toBe("application/json");
  const body = await served.json();
  expect(assetLinksProblems(body, APP_SIGNING)).toEqual([]);
  expect(body[0].target.sha256_cert_fingerprints).toEqual([APP_SIGNING, UPLOAD_CERT_SHA256]);
});
