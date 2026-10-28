#!/usr/bin/env node
// Builds the Google Play Android App Bundle, signed with the upload key (see store/RELEASE.md).
//
//   npm run build:android:store -- [--out <file.aab>] [--skip-preflight] [--no-clean]
//
// Needs Java 21 and the Android SDK (JAVA_HOME / ANDROID_HOME), and the upload key's upload.properties
// (plugins/withStoreSigning.js lists where it is looked for). Fails, without building, when that file is
// missing, incomplete, readable by other users, or names the public debug key; after building, fails unless
// the bundle verifies and is signed by the upload key's certificate. Passwords stay in the properties file:
// Gradle reads it, and keytool here gets the password through its own process environment.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ABIS = "arm64-v8a,armeabi-v7a,x86_64";
// The public Android debug key every Expo/React Native template ships (android/app/debug.keystore).
const DEBUG_CERT_SHA256 = "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c";

function fail(message) {
  console.error(`build-android-store: ${message}`);
  process.exit(1);
}

function run(cmd, cmdArgs, options = {}) {
  console.log(`\n> ${[cmd, ...cmdArgs].join(" ")}`);
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...options });
  if (result.status !== 0) fail(`${cmd} exited with ${result.status ?? result.signal}`);
}

/** The same lookup as plugins/withStoreSigning.js. */
function uploadPropertiesFile() {
  if (process.env.VERSE_UPLOAD_PROPERTIES) return path.resolve(process.env.VERSE_UPLOAD_PROPERTIES);
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share");
  const candidates = [
    path.join(mobileRoot, ".release-secrets/upload.properties"),
    path.join(dataHome, "verse-together/release-secrets/upload.properties"),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[0];
}

function readProperties(file) {
  const props = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([^#!=:\s]+)\s*[=:]\s*(.*?)\s*$/.exec(line);
    if (m) props[m[1]] = m[2];
  }
  return props;
}

function privateToOwner(file) {
  return (fs.statSync(file).mode & 0o077) === 0;
}

function certSha256(keytoolArgs, env) {
  const out = execFileSync("keytool", keytoolArgs, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
  const m = /SHA256:\s*([0-9A-F:]+)/i.exec(out);
  if (!m) fail(`couldn't read a SHA-256 certificate fingerprint from keytool ${keytoolArgs[0]}`);
  return m[1].replace(/:/g, "").toLowerCase();
}

// 1. The upload key, before anything is built.
const propsFile = uploadPropertiesFile();
if (!fs.existsSync(propsFile)) fail(`no upload key: ${propsFile} not found. See store/RELEASE.md.`);
const props = readProperties(propsFile);
const missing = ["storeFile", "storePassword", "keyAlias", "keyPassword"].filter((key) => !props[key]);
if (missing.length) fail(`${propsFile} is missing ${missing.join(", ")}`);
const keystore = path.resolve(path.dirname(propsFile), props.storeFile);
if (!fs.existsSync(keystore)) fail(`keystore ${keystore} not found`);
for (const file of [propsFile, keystore, path.dirname(propsFile)]) {
  if (!privateToOwner(file)) fail(`${file} is readable by other users; chmod 600 the files and 700 their folder`);
}
if (props.keyAlias === "androiddebugkey") fail("the configured key is the debug key");
const keytoolEnv = { ...process.env, VERSE_KEYSTORE_PASSWORD: props.storePassword };
const uploadCert = certSha256(
  ["-list", "-v", "-keystore", keystore, "-alias", props.keyAlias, "-storepass:env", "VERSE_KEYSTORE_PASSWORD"],
  keytoolEnv,
);
if (uploadCert === DEBUG_CERT_SHA256) fail("the configured keystore holds the public debug certificate");
console.log(`Upload key certificate SHA-256: ${uploadCert}`);

// 2. Guides and generated data are current, then a fresh native project and the bundle.
if (!flag("--skip-preflight")) run("npm", ["run", "release:preflight"], { cwd: mobileRoot });
run("npx", ["expo", "prebuild", "--platform", "android", "--no-install", ...(flag("--no-clean") ? [] : ["--clean"])], {
  cwd: mobileRoot,
  env: { ...process.env, CI: "1" },
});
run(
  "./gradlew",
  [
    "bundleRelease",
    "--no-daemon",
    `--max-workers=${process.env.VERSE_GRADLE_WORKERS || "4"}`,
    `-PreactNativeArchitectures=${ABIS}`,
    `-Dorg.gradle.jvmargs=-Xmx${process.env.VERSE_GRADLE_HEAP || "3g"} -XX:MaxMetaspaceSize=1g`,
  ],
  { cwd: path.join(mobileRoot, "android"), env: { ...process.env, VERSE_UPLOAD_PROPERTIES: propsFile } },
);

// 3. The bundle verifies and is signed by the upload key, not the debug key.
const aab = path.join(mobileRoot, "android/app/build/outputs/bundle/release/app-release.aab");
const verify = spawnSync("jarsigner", ["-verify", aab], { encoding: "utf8" });
if (verify.status !== 0 || !/jar verified\./.test(verify.stdout)) fail(`jarsigner didn't verify ${aab}:\n${verify.stdout}${verify.stderr}`);
const bundleCert = certSha256(["-printcert", "-jarfile", aab], process.env);
if (bundleCert === DEBUG_CERT_SHA256) fail("the bundle is signed with the public debug key");
if (bundleCert !== uploadCert) fail(`the bundle is signed by ${bundleCert}, not the upload key ${uploadCert}`);
console.log(`\nSigned with the upload key (certificate SHA-256 ${bundleCert}): ${aab}`);

const out = option("--out");
if (out) {
  fs.copyFileSync(aab, path.resolve(out));
  console.log(`Copied to ${path.resolve(out)}`);
}
