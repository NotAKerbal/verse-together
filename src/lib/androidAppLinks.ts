// The Digital Asset Links statement (/.well-known/assetlinks.json) that lets Android verify the app's HTTPS links
// to www.versetogether.org (android.intentFilters in mobile/app.json, mapped by mobile/src/navigation/appLinks.ts).
//
// Android only opens a link in the app when this file lists the SHA-256 of the certificate that signed the
// installed app. Builds from Google Play are signed by Google's app signing key, whose certificate only Play
// Console shows (Test and release > Setup > App signing). It isn't in this repository, so the deployment supplies
// it as ANDROID_APP_SIGNING_CERT_SHA256. Without it the file isn't served at all: a statement listing only other
// keys would verify no Play install, and would look like proof that it does. See mobile/store/APP-LINKS.md.

export const ANDROID_PACKAGE = "org.versetogether.app";

/** Our Play upload key's certificate (mobile/store/RELEASE.md). It signs APKs installed outside Play. */
export const UPLOAD_CERT_SHA256 = "CF:A6:F6:17:97:8A:DC:01:CF:BF:B9:78:ED:F4:01:67:88:B5:64:D7:6C:CF:2C:CB:79:9F:14:12:8B:53:FC:D4";

/** The public debug key in every generated Android project. Anyone can sign with it, so it is never listed. */
export const PUBLIC_DEBUG_CERT_SHA256 = "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C";

export const APP_SIGNING_ENV = "ANDROID_APP_SIGNING_CERT_SHA256";

export type AssetLinkStatement = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

export type AssetLinksResult = { ok: true; statements: AssetLinkStatement[] } | { ok: false; problem: string };

/** "cf:a6:…" or "cfa6…" → "CF:A6:…", or null when it isn't a SHA-256 fingerprint. */
export function normalizeCertFingerprint(value: string | undefined | null): string | null {
  const hex = String(value ?? "").trim().replace(/:/g, "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  return hex.match(/../g)!.join(":");
}

/** The statement for the app signing certificate the deployment names, or why there is none. */
export function androidAssetLinks(appSigningCert: string | undefined): AssetLinksResult {
  if (!appSigningCert?.trim()) {
    return { ok: false, problem: `${APP_SIGNING_ENV} is not set: copy the app signing key certificate's SHA-256 from Play Console > App signing.` };
  }
  const appSigning = normalizeCertFingerprint(appSigningCert);
  if (!appSigning) return { ok: false, problem: `${APP_SIGNING_ENV} is not a SHA-256 certificate fingerprint (32 hex bytes).` };
  if (appSigning === UPLOAD_CERT_SHA256) {
    return { ok: false, problem: `${APP_SIGNING_ENV} is the upload key's certificate, not Google's app signing key's.` };
  }
  if (appSigning === PUBLIC_DEBUG_CERT_SHA256) return { ok: false, problem: `${APP_SIGNING_ENV} is the public Android debug key.` };
  return {
    ok: true,
    statements: [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [appSigning, UPLOAD_CERT_SHA256] },
      },
    ],
  };
}

/**
 * Checks a served assetlinks.json: it must give the package a handle_all_urls statement listing `expectedCert`, and
 * never the public debug key. Returns the problems found (none when it verifies).
 */
export function assetLinksProblems(body: unknown, expectedCert: string, packageName: string = ANDROID_PACKAGE): string[] {
  const expected = normalizeCertFingerprint(expectedCert);
  if (!expected) return ["the expected certificate isn't a SHA-256 fingerprint"];
  if (!Array.isArray(body)) return ["the file isn't a JSON array of statements"];
  const problems: string[] = [];
  const certs = body
    .filter((statement): statement is AssetLinkStatement =>
      !!statement &&
      typeof statement === "object" &&
      Array.isArray(statement.relation) &&
      statement.relation.includes("delegate_permission/common.handle_all_urls") &&
      statement.target?.namespace === "android_app" &&
      statement.target?.package_name === packageName,
    )
    .flatMap((statement) => (Array.isArray(statement.target.sha256_cert_fingerprints) ? statement.target.sha256_cert_fingerprints : []));
  if (certs.length === 0) problems.push(`no handle_all_urls statement for ${packageName}`);
  for (const cert of certs) {
    // Android compares the listed strings exactly, in upper case with colons.
    if (cert !== normalizeCertFingerprint(cert)) problems.push(`"${cert}" isn't an upper-case, colon-separated SHA-256 fingerprint`);
  }
  if (certs.includes(PUBLIC_DEBUG_CERT_SHA256)) problems.push("it lists the public Android debug key");
  if (certs.length > 0 && !certs.includes(expected)) problems.push(`${expected} isn't listed for ${packageName}`);
  return problems;
}
