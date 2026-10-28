# Releasing Verse Together on Google Play

App id `org.versetogether.app`. Live closed-test release: **1.0.4, versionCode 5**. Submitted UI update:
**1.0.5, versionCode 6** (iOS build 6); see `CONSOLE-STATUS.md` for current review status. Google Play App Signing
holds the app signing key; we sign uploads with our own **upload key**.

## 1. The upload key (private)

Created 2026-10-27 for this app: PKCS12 keystore, alias `verse-together-upload`, RSA 4096 / SHA256withRSA, valid
until 2056-10-19, subject `CN=Verse Together Upload Key, O=Verse Together`.

Upload certificate SHA-256 (public):
`CF:A6:F6:17:97:8A:DC:01:CF:BF:B9:78:ED:F4:01:67:88:B5:64:D7:6C:CF:2C:CB:79:9F:14:12:8B:53:FC:D4`

On the build machine (the `isaac` VM) it lives outside the repository and outside any worktree, so deleting a
checkout can't delete it:

```
~/.local/share/verse-together/release-secrets/          (mode 700; files 600)
  verse-together-upload.p12    the keystore
  upload.properties            storeFile, keyAlias, storePassword, keyPassword (random, 64 hex characters)
  README.txt                   what these are (no secrets)
~/.local/share/verse-together/release-secrets-backup/2026-10-27/   an identical copy (same disk)
```

- **Back it up off this machine.** Copy the keystore and `upload.properties` into the owner's password manager
  or an encrypted drive. The copy above only protects against deleting one folder, not against losing the disk.
- If the upload key is lost or exposed, Play Console > Test and release > Setup > App signing > "Request upload
  key reset" lets Google register a new one; the app signing key, and so installed users, are unaffected.
- Never commit, paste or attach these files. `mobile/.gitignore` ignores `.release-secrets/`, `*.p12`,
  `*.jks`, `*.keystore` and `upload.properties`.

Gradle finds `upload.properties` at the first of `$VERSE_UPLOAD_PROPERTIES`, `mobile/.release-secrets/`, then
`$XDG_DATA_HOME/verse-together/release-secrets/` (default `~/.local/share`). A relative `storeFile` is
resolved from the file's folder. To use the key on another machine, copy both files there, `chmod 700` the
folder and `chmod 600` the files.

## 2. Build the bundle

Signing is part of the native project that `expo prebuild` generates: `plugins/withStoreSigning.js` (listed in
`app.json`) makes every `release` build use the upload key, and makes a release build **fail** when the key is
missing, incomplete or a debug key. There's no silent fallback to the debug key.

```bash
source ~/.local/share/verse-android-env.sh      # Java 21, ANDROID_HOME (on the isaac VM)
cd mobile
git fetch origin master
npm run release:preflight                      # generated data is current; every published guide is bundled
npm run brand:check                            # launcher, splash and store art match their SVG sources
npm run build:android:store -- --skip-preflight --out /tmp/verse-together-play-<version>.aab
```

`build:android:store` checks the key and its file permissions first, runs a clean `expo prebuild`, builds
`bundleRelease` for arm64-v8a, armeabi-v7a and x86_64 (R8 on, as in the previews), then fails unless
`jarsigner` verifies the bundle and its signer is the upload certificate. Logs go to the terminal; redirect
them to `/tmp/verse-play-<version>-build.log`.

Then check the bundle and keep the report with the release:

```bash
# bundletool: the one the Android Gradle plugin cached in ~/.gradle, or BUNDLETOOL=/path/to/bundletool-all.jar
npm run verify:android:bundle -- /tmp/verse-together-play-<version>.aab \
  --expect-cert cfa6f617978adc01cfbfb978edf4016788b564d76ccf2ccb799f14128b53fcd4 \
  --report /tmp/verse-together-play-<version>-verification.json
```

It checks the signature and signer, package, version, target SDK, permissions, ABIs, 16 KB page alignment
(bundle config, ELF LOAD segments, and `zipalign -c -P 16` on the universal APK built from the bundle), that the
ScriptureText module and its record field names survived R8, the Hermes bundle, and every published guide.

A **local preview** signed with the public debug key (installs over the earlier previews, never for Play):
`./gradlew assembleRelease -PverseDebugSignedPreview=true` in `android/`.

For each new upload raise `version` and `android.versionCode` (and `ios.buildNumber`) in `app.json`; Play rejects
a versionCode it has seen.

## 3. In Play Console (the owner)

1. Use Play App Signing with a Google-generated app signing key (the default). The first upload registers its
   signer as the upload key; check that Console shows the upload certificate SHA-256 above.
2. Start with **Internal testing**. Personal developer accounts then need a **closed test with at least 12
   testers opted in for 14 continuous days** before applying for production access.
3. Store listing: `store/listing/en-US.md`. App content: `store/privacy/data-safety-draft.md`. A privacy
   policy URL is required; publish a completed `store/privacy/privacy-policy-draft.md` first.
4. Graphics: icon `store/assets/play-icon-512.png` (512 x 512, 32-bit PNG), feature graphic
   `store/assets/feature-graphic-1024x500.png` (1024 x 500, 24-bit PNG, no alpha).

### Still missing: screenshots

Screenshots must be captures of the real app on a device or emulator; none exist yet (this VM has no KVM, so the
emulator can't boot, and no device is attached). Don't substitute website captures or mockups.

- **Phone, required:** at least **2** (up to 8). JPEG or 24-bit PNG without alpha; each side 320–3840 px; the
  long side at most twice the short side. For eligibility for Play's promotional placements, provide **4 or
  more at 1080 x 1920 or larger in 9:16** (portrait) or 16:9.
- **Tablets (7-inch and 10-inch), recommended:** the app supports tablets. For large-screen placements, at least
  4 per type, 16:9 or 9:16, each side 1080–7680 px.
- Capture on Android: `adb exec-out screencap -p > shot.png` (strip the alpha channel before upload), with
  study content that isn't personal. Suggested screens: Browse library, a chapter with marks, the selection
  menu over a phrase, the journal, a Come, Follow Me guide, search.

## 4. Text lengths

```bash
node -e 'const t=require("fs").readFileSync("store/listing/en-US.md","utf8");const b=[...t.matchAll(/```\n([\s\S]*?)\n```/g)].map(m=>m[1]);console.log({short:b[0].length,full:b[1].length,notes:b[2].length})'
```

Limits: name 30, short description 80, full description 4000, release notes 500.
