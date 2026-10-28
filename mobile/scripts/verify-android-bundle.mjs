#!/usr/bin/env node
// Checks a release Android App Bundle before it goes to Google Play, and writes a report with no secrets in it.
//
//   npm run verify:android:bundle -- <app.aab> [--report <report.json>] [--expect-cert <sha256>]
//
// Never modifies the bundle. Needs Java (jarsigner, keytool), ANDROID_HOME (build-tools zipalign, NDK
// llvm-objdump) and bundletool: BUNDLETOOL=<bundletool-all.jar>, BUNDLETOOL_CLASSPATH=<jars>, or else the
// bundletool that the Android Gradle plugin put in ~/.gradle (with its dependencies). Exits 1 if any check fails.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(mobileRoot, "..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const aab = path.resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "");
if (!aab || !fs.existsSync(aab)) {
  console.error("usage: verify-android-bundle.mjs <app.aab> [--report <file>] [--expect-cert <sha256>]");
  process.exit(2);
}
const DEBUG_CERT_SHA256 = "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c";
const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8")).expo;
const ANDROID_HOME = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!ANDROID_HOME) throw new Error("ANDROID_HOME is not set");
const latest = (dir) => fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
const buildTools = path.join(ANDROID_HOME, "build-tools", latest(path.join(ANDROID_HOME, "build-tools")));
const ndkBin = path.join(ANDROID_HOME, "ndk", latest(path.join(ANDROID_HOME, "ndk")), "toolchains/llvm/prebuilt/linux-x86_64/bin");

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, status: passed ? "passed" : "failed", detail });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
const sh = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
/** bundletool and its runtime dependencies from the Gradle cache, newest version of each. */
function gradleCacheClasspath() {
  const cache = path.join(os.homedir(), ".gradle/caches/modules-2/files-2.1");
  const artifacts = [
    ["com.android.tools.build", "bundletool"], ["com.android.tools.build", "aapt2-proto"],
    ["com.google.auto.value", "auto-value-annotations"], ["com.google.errorprone", "error_prone_annotations"],
    ["com.google.guava", "guava"], ["com.google.guava", "failureaccess"], ["com.google.protobuf", "protobuf-java"],
    ["com.google.protobuf", "protobuf-java-util"], ["com.google.dagger", "dagger"], ["javax.inject", "javax.inject"],
    ["org.bitbucket.b_c", "jose4j"], ["org.slf4j", "slf4j-api"], ["com.google.code.gson", "gson"],
  ];
  // Guava's JRE flavor: in the Android flavor, Predicate isn't a java.util.function.Predicate, which bundletool needs.
  return artifacts
    .map(([group, name]) => {
      const dir = path.join(cache, group, name);
      if (!fs.existsSync(dir)) throw new Error(`bundletool: ${group}:${name} isn't in the Gradle cache; set BUNDLETOOL`);
      const jars = fs.readdirSync(dir).flatMap((v) => fs.readdirSync(path.join(dir, v)).flatMap((h) =>
        fs.readdirSync(path.join(dir, v, h)).filter((f) => f.endsWith(".jar") && !f.endsWith("-sources.jar") && !f.endsWith("-android.jar")).map((f) => ({ v, file: path.join(dir, v, h, f) }))));
      return jars.sort((a, b) => a.v.localeCompare(b.v, undefined, { numeric: true })).at(-1).file;
    })
    .join(":");
}
let bundletoolClasspath = process.env.BUNDLETOOL_CLASSPATH;
function bundletool(btArgs) {
  if (process.env.BUNDLETOOL) return sh("java", ["-jar", process.env.BUNDLETOOL, ...btArgs]);
  bundletoolClasspath ??= gradleCacheClasspath();
  return sh("java", ["-cp", bundletoolClasspath, "com.android.tools.build.bundletool.BundleToolMain", ...btArgs]);
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "vt-verify-aab-"));
try {
  const bytes = fs.readFileSync(aab);
  const report = { bundle: path.basename(aab), sha256: sha256(bytes), bytes: bytes.length, checkedAt: new Date().toISOString() };

  // Signature and certificate.
  const verify = spawnSync("jarsigner", ["-verify", aab], { encoding: "utf8" });
  check("jarsigner -verify", verify.status === 0 && /jar verified\./.test(verify.stdout), verify.stdout.split("\n").find((l) => /jar verified|unsigned|not/.test(l))?.trim());
  const cert = sh("keytool", ["-printcert", "-jarfile", aab]);
  const certSha = /SHA256:\s*([0-9A-F:]+)/i.exec(cert)?.[1].replace(/:/g, "").toLowerCase();
  report.certificate = {
    sha256: certSha,
    owner: /Owner:\s*(.*)/.exec(cert)?.[1].trim(),
    validUntil: /until:\s*(.*)/.exec(cert)?.[1].trim(),
    signatureAlgorithm: /Signature algorithm name:\s*(.*)/.exec(cert)?.[1].trim(),
    publicKey: /Subject Public Key Algorithm:\s*(.*)/.exec(cert)?.[1].trim(),
  };
  check("signed, not with the public debug key", Boolean(certSha) && certSha !== DEBUG_CERT_SHA256, certSha);
  const expectCert = option("--expect-cert")?.replace(/:/g, "").toLowerCase();
  if (expectCert) check("signed by the expected upload certificate", certSha === expectCert);
  const signers = (cert.match(/^Signer #\d+:/gm) ?? []).length;
  const certCount = (cert.match(/^Certificate #\d+:/gm) ?? []).length;
  const signatureFiles = sh("unzip", ["-Z1", aab]).split("\n").filter((e) => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/.test(e));
  check("one signer with one certificate", signers === 1 && certCount === 1 && signatureFiles.length === 1, `${signers} signer, ${certCount} certificate, ${signatureFiles.join(", ")}`);

  // Manifest.
  const manifest = bundletool(["dump", "manifest", `--bundle=${aab}`]);
  const attr = (name) => new RegExp(`${name}="([^"]*)"`).exec(manifest)?.[1];
  const permissions = [...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]).sort();
  report.manifest = {
    package: attr("package"),
    versionCode: Number(attr("android:versionCode")),
    versionName: attr("android:versionName"),
    minSdkVersion: Number(attr("android:minSdkVersion")),
    targetSdkVersion: Number(attr("android:targetSdkVersion")),
    allowBackup: attr("android:allowBackup"),
    debuggable: attr("android:debuggable") ?? "false",
    permissions,
  };
  check("package", report.manifest.package === app.android.package, report.manifest.package);
  check("versionCode / versionName", report.manifest.versionCode === app.android.versionCode && report.manifest.versionName === app.version, `${report.manifest.versionCode} / ${report.manifest.versionName}`);
  check("targetSdkVersion >= 36 (Google Play, from 2026-08-31)", report.manifest.targetSdkVersion >= 36, String(report.manifest.targetSdkVersion));
  check("not debuggable", report.manifest.debuggable !== "true");
  const blocked = ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "SYSTEM_ALERT_WINDOW", "VIBRATE", "RECORD_AUDIO", "CAMERA", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "READ_MEDIA_IMAGES", "POST_NOTIFICATIONS"];
  const present = permissions.filter((p) => blocked.some((b) => p === `android.permission.${b}`));
  check("no storage, overlay, audio, camera, location, media or notification permissions", present.length === 0, permissions.join(", "));

  // Bundle contents.
  const entries = sh("unzip", ["-Z1", aab]).split("\n").filter(Boolean);
  const abis = [...new Set(entries.map((e) => /^base\/lib\/([^/]+)\//.exec(e)?.[1]).filter(Boolean))].sort();
  report.abis = abis;
  check("native code for arm64-v8a, armeabi-v7a and x86_64", ["arm64-v8a", "armeabi-v7a", "x86_64"].every((a) => abis.includes(a)), abis.join(", "));
  check("R8 mapping in the bundle (BUNDLE-METADATA)", entries.includes("BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map"));
  check("no keystores or signing secrets inside the bundle", !entries.some((e) => /\.(jks|keystore|p12|pem|key)$|upload\.properties|release-secrets/i.test(e)));
  const config = bundletool(["dump", "config", `--bundle=${aab}`]);
  const alignment = /"alignment":\s*"([A-Z_0-9]+)"/.exec(config)?.[1] ?? /PAGE_ALIGNMENT_\w+/.exec(config)?.[0] ?? "unspecified";
  report.pageAlignment = alignment;
  check("bundle asks for 16 KB zip alignment of native libraries", alignment === "PAGE_ALIGNMENT_16K", alignment);

  sh("unzip", ["-q", aab, "base/lib/*", "base/dex/*", "base/assets/index.android.bundle", "base/res/mipmap-anydpi-v26/*", "BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map", "-d", work]);
  const res = path.join(work, "base/res/mipmap-anydpi-v26");
  const iconXml = fs.existsSync(res) ? fs.readdirSync(res).map((f) => fs.readFileSync(path.join(res, f))) : [];
  check("launcher icon is adaptive with a monochrome layer", iconXml.length === 2 && iconXml.every((b) => b.includes(Buffer.from("ic_launcher_monochrome"))), `${iconXml.length} adaptive icon resources`);

  // ELF LOAD segments of the 64-bit libraries aligned to 16 KB.
  const unaligned = [];
  let libs = 0;
  for (const abi of ["arm64-v8a", "x86_64"]) {
    const dir = path.join(work, "base/lib", abi);
    for (const so of fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".so")) : []) {
      libs++;
      const out = sh(path.join(ndkBin, "llvm-objdump"), ["-p", path.join(dir, so)]);
      const aligns = [...out.matchAll(/LOAD .* align 2\*\*(\d+)/g)].map((m) => Number(m[1]));
      if (!aligns.length || aligns.some((a) => a < 14)) unaligned.push(`${abi}/${so} (2**${Math.min(...aligns)})`);
    }
  }
  report.nativeLibraries64 = libs;
  check("64-bit native libraries: every ELF LOAD segment aligned to 16 KB (2**14)", libs > 0 && unaligned.length === 0, unaligned.length ? unaligned : `${libs} libraries`);

  // APKs Play would build from this bundle: zip alignment of their native libraries.
  const apks = path.join(work, "universal.apks");
  bundletool(["build-apks", `--bundle=${aab}`, `--output=${apks}`, "--mode=universal", `--aapt2=${path.join(buildTools, "aapt2")}`]);
  sh("unzip", ["-q", apks, "universal.apk", "-d", work]);
  const zipalign = spawnSync(path.join(buildTools, "zipalign"), ["-c", "-P", "16", "-v", "4", path.join(work, "universal.apk")], { encoding: "utf8" });
  check("universal APK from this bundle passes zipalign -c -P 16 -v 4", zipalign.status === 0 && /Verification successful/.test(zipalign.stdout), zipalign.stdout.trim().split("\n").at(-1));

  // The native scripture text module, and the record fields Expo converts by name, kept through R8.
  const dexDir = path.join(work, "base/dex");
  const dexFiles = fs.readdirSync(dexDir).map((f) => path.join(dexDir, f));
  // dexdump: class descriptors with their field names (R8's mapping lists only renamed members).
  const classes = new Map();
  for (const file of dexFiles) {
    let current = null, section = null;
    for (const line of sh(path.join(buildTools, "dexdump"), [file]).split("\n")) {
      const cls = /Class descriptor\s*:\s*'L([^;]+);'/.exec(line);
      if (cls) {
        current = { fields: [] };
        classes.set(cls[1].replace(/\//g, "."), current);
        section = null;
        continue;
      }
      if (/^\s*(Static|Instance) fields/.test(line)) section = "fields";
      else if (/^\s*(Direct|Virtual) methods/.test(line)) section = "methods";
      const name = /^\s*name\s*:\s*'([^']+)'/.exec(line);
      if (current && name && section === "fields") current.fields.push(name[1]);
    }
  }
  const pkg = "org.versetogether.scripturetext";
  check("ScriptureText native module and view in the dex", classes.has(`${pkg}.ScriptureTextView`) && dexFiles.some((f) => fs.readFileSync(f).includes(Buffer.from("ScriptureText"))));
  const moduleSource = fs.readFileSync(path.join(mobileRoot, "modules/scripture-text/android/src/main/java/org/versetogether/scripturetext/ScriptureTextModule.kt"), "utf8");
  const records = [...moduleSource.matchAll(/class (\w+Record) : Record \{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1], fields: [...m[2].matchAll(/@Field val (\w+)/g)].map((f) => f[1]) }));
  const renamed = [];
  for (const record of records) {
    const cls = classes.get(`${pkg}.${record.name}`);
    if (!cls) renamed.push(`${record.name} (class renamed or removed)`);
    else for (const field of record.fields) if (!cls.fields.includes(field)) renamed.push(`${record.name}.${field}`);
  }
  check("ScriptureText records and their @Field names kept by R8 (Expo converts them by name)", records.length > 0 && renamed.length === 0, renamed.length ? renamed : `${records.length} records, ${records.reduce((n, r) => n + r.fields.length, 0)} fields`);

  // JavaScript bundle (Hermes) with every published guide.
  const js = fs.readFileSync(path.join(work, "base/assets/index.android.bundle"));
  check("JavaScript bundle is Hermes bytecode", js.readBigUInt64LE(0) === 0x1f1903c103bc1fc6n, `${js.length} bytes`);
  const guides = JSON.parse(fs.readFileSync(path.join(repoRoot, "content/cfm/guides.json"), "utf8"));
  const missingGuides = guides.filter((g) => !js.includes(Buffer.from(g.slug)) || !js.includes(Buffer.from(g.title.slice(0, 24))));
  report.guides = guides.map((g) => g.slug);
  check(`all ${guides.length} published guides in the JavaScript bundle`, missingGuides.length === 0, missingGuides.map((g) => g.slug).join(", ") || guides.map((g) => g.slug).join(", "));

  report.tools = { bundletool: bundletool(["version"]).trim(), buildTools: path.basename(buildTools), ndk: path.basename(path.resolve(ndkBin, "../../../../..")) };
  report.checks = checks;
  const failed = checks.filter((c) => c.status === "failed");
  report.result = failed.length ? "failed" : "passed";
  const out = option("--report");
  if (out) fs.writeFileSync(path.resolve(out), JSON.stringify(report, null, 2) + "\n");
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed${out ? `; report: ${path.resolve(out)}` : ""}`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
