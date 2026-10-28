// Signs Android release builds with the Google Play upload key, so `expo prebuild` (which may regenerate
// android/ from the template) keeps store signing. Release builds fail when the key isn't configured; there is
// no fallback to the public debug key. A local preview signed with the debug key is a separate, explicit
// choice: `./gradlew assembleRelease -PverseDebugSignedPreview=true`.
//
// The key is described by an upload.properties file (storeFile, storePassword, keyAlias, keyPassword; a
// relative storeFile is resolved from the file's folder), found at the first of:
//   1. $VERSE_UPLOAD_PROPERTIES
//   2. mobile/.release-secrets/upload.properties (ignored by git)
//   3. $XDG_DATA_HOME/verse-together/release-secrets/upload.properties (~/.local/share when unset)
// Passwords are read from that file by Gradle, never from the command line. See store/RELEASE.md.

const { withAppBuildGradle } = require("expo/config-plugins");

const TAG = "verse-store-signing";

const SETUP = `// @generated begin ${TAG} (plugins/withStoreSigning.js)
def verseDebugSignedPreview = (findProperty('verseDebugSignedPreview') ?: 'false').toString().toBoolean()
def verseUploadPropertiesFile = {
    def fromEnv = System.getenv('VERSE_UPLOAD_PROPERTIES')
    if (fromEnv) return new File(fromEnv)
    def dataHome = System.getenv('XDG_DATA_HOME') ?: "\${System.getProperty('user.home')}/.local/share"
    def candidates = [
        new File(rootDir, '../.release-secrets/upload.properties'),
        new File(dataHome, 'verse-together/release-secrets/upload.properties'),
    ]
    return candidates.find { it.isFile() } ?: candidates[0]
}()
def verseUpload = new Properties()
if (!verseDebugSignedPreview && verseUploadPropertiesFile.isFile()) {
    verseUploadPropertiesFile.withInputStream { verseUpload.load(it) }
}
def verseUploadStoreFile = {
    def path = verseUpload.getProperty('storeFile')
    if (!path) return null
    def f = new File(path)
    return f.isAbsolute() ? f : new File(verseUploadPropertiesFile.parentFile, path)
}()
// @generated end ${TAG}
`;

const UPLOAD_CONFIG = `        // @generated begin ${TAG}-config
        upload {
            if (verseUploadStoreFile != null) {
                storeFile verseUploadStoreFile
                storePassword verseUpload.getProperty('storePassword')
                keyAlias verseUpload.getProperty('keyAlias')
                keyPassword verseUpload.getProperty('keyPassword')
            }
        }
        // @generated end ${TAG}-config
`;

const RELEASE_SIGNING = `            // @generated ${TAG}: the Play upload key; the debug key only with -PverseDebugSignedPreview=true
            signingConfig verseDebugSignedPreview ? signingConfigs.debug : signingConfigs.upload`;

const GUARD = `
// @generated begin ${TAG}-guard
// Fail closed: a release build needs a complete upload key, and never the public debug key.
gradle.taskGraph.whenReady { graph ->
    if (verseDebugSignedPreview) {
        logger.warn('verseDebugSignedPreview: release outputs are signed with the PUBLIC DEBUG key. Not for Google Play.')
        return
    }
    def signsRelease = graph.allTasks.any { task ->
        task.project == project && task.name ==~ /^(assemble|bundle|package|sign|validateSigning|install).*Release.*/
    }
    if (!signsRelease) return
    def problem = null
    if (!verseUploadPropertiesFile.isFile()) {
        problem = "no upload key properties file (looked for \${verseUploadPropertiesFile})"
    } else {
        def missing = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'].findAll { !verseUpload.getProperty(it) }
        if (missing) problem = "\${verseUploadPropertiesFile} is missing \${missing.join(', ')}"
        else if (!verseUploadStoreFile.isFile()) problem = "keystore \${verseUploadStoreFile} not found"
        else if (verseUpload.getProperty('keyAlias') == 'androiddebugkey' || verseUploadStoreFile.name == 'debug.keystore') problem = 'the configured key is a debug key'
    }
    if (problem) {
        throw new GradleException("Release signing is not configured: \${problem}. See mobile/store/RELEASE.md, " +
            "or pass -PverseDebugSignedPreview=true for a local preview signed with the public debug key.")
    }
}
// @generated end ${TAG}-guard
`;

function applyStoreSigning(gradle) {
  if (gradle.includes(`@generated begin ${TAG}`)) return gradle;
  const replaceOnce = (text, pattern, replacement, what) => {
    if (!pattern.test(text)) throw new Error(`withStoreSigning: couldn't find ${what} in android/app/build.gradle`);
    return text.replace(pattern, replacement);
  };
  let out = replaceOnce(gradle, /^android \{/m, `${SETUP}\nandroid {`, "the android block");
  out = replaceOnce(out, /^(\s*signingConfigs \{\n)/m, `$1${UPLOAD_CONFIG}`, "signingConfigs");
  out = replaceOnce(
    out,
    /(\n\s*release \{\n)(?:\s*\/\/[^\n]*\n)*\s*signingConfig signingConfigs\.debug/,
    `$1${RELEASE_SIGNING}`,
    "the release build type's signingConfig",
  );
  return `${out.trimEnd()}\n${GUARD}`;
}

const withStoreSigning = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") throw new Error("withStoreSigning: expected a Groovy build.gradle");
    mod.modResults.contents = applyStoreSigning(mod.modResults.contents);
    return mod;
  });

module.exports = withStoreSigning;
module.exports.applyStoreSigning = applyStoreSigning;
