// The release-signing config plugin, applied to the build.gradle that `expo prebuild` generates for this app.
import fs from "node:fs";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyStoreSigning } = require("../plugins/withStoreSigning") as { applyStoreSigning: (gradle: string) => string };

const template = fs.readFileSync(path.join(__dirname, "fixtures/expo-58-app-build.gradle"), "utf8");

function releaseBlock(gradle: string): string {
  const start = gradle.indexOf("        release {");
  return gradle.slice(start, gradle.indexOf("\n        }", start));
}

describe("withStoreSigning", () => {
  const signed = applyStoreSigning(template);

  it("signs release builds with the upload key, and the debug key only when asked explicitly", () => {
    const release = releaseBlock(signed);
    expect(release).toContain("signingConfig verseDebugSignedPreview ? signingConfigs.debug : signingConfigs.upload");
    expect(release).not.toMatch(/^\s*signingConfig signingConfigs\.debug\s*$/m);
    expect(release).not.toContain("Caution! In production");
    expect(signed).toContain("findProperty('verseDebugSignedPreview') ?: 'false'");
  });

  it("keeps debug builds on the debug key", () => {
    const start = signed.indexOf("    buildTypes {");
    const debug = signed.slice(start, signed.indexOf("        release {", start));
    expect(debug).toContain("signingConfig signingConfigs.debug");
  });

  it("adds an upload signing config read from upload.properties, never from literals", () => {
    expect(signed).toMatch(/signingConfigs \{\n\s*\/\/ @generated begin verse-store-signing-config\n\s*upload \{/);
    expect(signed).toContain("storePassword verseUpload.getProperty('storePassword')");
    expect(signed).toContain("System.getenv('VERSE_UPLOAD_PROPERTIES')");
    expect(signed).toContain("'../.release-secrets/upload.properties'");
    expect(signed).toContain("'verse-together/release-secrets/upload.properties'");
  });

  it("fails release builds closed when the key is missing, incomplete or a debug key", () => {
    expect(signed).toContain("gradle.taskGraph.whenReady");
    expect(signed).toContain("throw new GradleException(\"Release signing is not configured");
    expect(signed).toContain("['storeFile', 'storePassword', 'keyAlias', 'keyPassword']");
    expect(signed).toContain("'androiddebugkey'");
  });

  it("is idempotent and changes nothing else", () => {
    expect(applyStoreSigning(signed)).toBe(signed);
    const stripped = signed
      .replace(/\/\/ @generated begin verse-store-signing \(plugins[^\n]*\n[\s\S]*?\/\/ @generated end verse-store-signing\n\n/, "")
      .replace(/\s*\/\/ @generated begin verse-store-signing-config[\s\S]*?\/\/ @generated end verse-store-signing-config/, "")
      .replace(/\n\/\/ @generated begin verse-store-signing-guard[\s\S]*$/, "\n");
    const original = template.replace(
      /(\n\s*release \{\n)(?:\s*\/\/[^\n]*\n)*\s*signingConfig signingConfigs\.debug/,
      "$1            // @generated verse-store-signing: the Play upload key; the debug key only with -PverseDebugSignedPreview=true\n            signingConfig verseDebugSignedPreview ? signingConfigs.debug : signingConfigs.upload",
    );
    expect(stripped.trimEnd()).toBe(original.trimEnd());
  });

  it("refuses a build.gradle it doesn't recognize instead of building unsigned", () => {
    expect(() => applyStoreSigning(template.replace(/signingConfig signingConfigs\.debug\n(\s*def enableShrink)/, "\n$1"))).toThrow(
      /release build type's signingConfig/,
    );
  });
});
