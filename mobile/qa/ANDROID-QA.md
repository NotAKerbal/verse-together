# Android runtime QA

Historical baseline before the later [web-parity implementation and QA](PARITY-QA.md). Scope gaps below describe
this earlier APK, not the current parity build.

Source under test: `7b9f9933711f1d00948f57d11143404cfce212d4` (2026-10-28 checkout).
This is a development-key signed standalone release APK, not a Play release.

## Environment

The Ubuntu VM has no `/dev/kvm`; use `isaac-omarchy` over its existing SSH connection.
User-local tools are installed there, with no system package or access-control changes:

- Environment: `~/Work/verse-android-qa/env.sh` (source before Android commands).
- SDK: `~/Android/Sdk`; Java 21: `~/Work/verse-android-qa/toolchains/`.
- Isolated source/build: `~/Work/verse-android-qa/source/`.
- AVDs: `verse_phone_api35` (Pixel 7) and `verse_tablet_api35` (Pixel Tablet), Android 15 Google APIs x86_64.
- KVM acceleration check passed. Initial phone cold boot: 26.5 seconds.
- T3 device panel access is disabled in the Ubuntu environment. Native testing uses ADB over SSH.

Boot the phone (use port 5556 and the tablet name for a second device):

```sh
source ~/Work/verse-android-qa/env.sh
emulator -avd verse_phone_api35 -port 5554 -no-window -no-audio \
  -gpu swiftshader -memory 4096 -cores 4
adb -s emulator-5554 shell getprop sys.boot_completed
```

Build and install the current source:

```sh
cd ~/Work/verse-android-qa/source/mobile
npm ci
# Public production URLs documented in store/CONSOLE-STATUS.md; no secrets.
export EXPO_PUBLIC_SITE_URL=https://www.versetogether.org
export EXPO_PUBLIC_CONVEX_URL=https://lovable-seal-140.convex.cloud
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease --no-daemon --max-workers=4 \
  -PreactNativeArchitectures=x86_64 -PverseDebugSignedPreview=true
adb -s emulator-5554 install -r app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell am start -n org.versetogether.app/.MainActivity
```

Use these dedicated AVDs only; do not uninstall or clear data on a personal device.
Stop the task's emulator with `adb -s emulator-5554 emu kill` when finished.

## Automated results

- **Passed:** mobile `npm run typecheck`.
- **Passed:** mobile `npm test -- --runInBand`: 20 suites, 235 tests; 3 live-only tests skipped.
- **Passed:** `LIVE_NETWORK=1 npm test -- --runInBand --silent __tests__/live-services.test.ts`: 3 tests against real dictionary, study-help and translation services.

Runtime results and remaining gaps follow.

## Confirmed defects repaired

1. **Quoted verse source lost on Save.** Long-press “was” in John 1:1 → Add to journal → Save entry. Before: the quote text was correct, but the source chip became “John 1” with no verse. The editor called `withRange(..., null)` even when not logging reading. It now preserves the original source unless reading-range controls apply. A real-route regression verifies the saved source, verse bounds, href, and absence of a reading log. On the repaired standalone APK the saved chip stays “John 1:1”. Existing saved notes are not migrated.
2. **Empty tablet grid cell on fresh installs.** A ContinueReadingCard element returning null still received a Grid cell. The parent now omits the element when there is no reading position. Verified on a fresh dedicated tablet profile: all three cells of the first row contain real cards. Phone behavior and existing Continue reading remain covered by route tests.

## Build and final checks

Final APK SHA-256: `1740f7d1c805dce2ce63ae8f2b35d3fe53a58b43a386e4b6f8fb935d869b8709`.
Built from the source revision above plus the two fixes and regression test in this change.
The public production endpoints above are included. No account was signed in and no production study was changed.

- **Passed:** final mobile typecheck.
- **Passed:** final full Jest suite: 20 suites, **236 tests**; the 3 live-only tests were separately passed earlier.
- **Passed:** `:scripture-text:testDebugUnitTest`: 11 tests, zero errors/failures/skips.
- **Passed:** fresh `assembleRelease` (6m45s); final incremental build (50s).
- **Passed:** `git diff --check` and review of the two UI changes against the React checklist.
- No store upload, production deployment, version bump, PR, or merge was performed.

## Observed runtime coverage

| Check | Result | Evidence / observation |
| --- | --- | --- |
| Phone launch, Browse art, navigation, reader deep link | Passed | Standalone APK installed and launched; John 1 renders real bundled scripture. |
| Long press and native selection handles | Passed | Selects one word, app menu replaces platform toolbar; handles remain after highlighting. |
| Drag across verses | Passed | Right handle extended John 1:1 into 1:2; menu reports `John 1:1–2`, with no chapter swipe. |
| Exact word marks | Passed | Yellow mark only on “was”; persisted after force-stop and offline restart. |
| Exact quote and Markdown preview | Passed | Journal body quoted only the selected word/phrase with the verse link; preview renders it. |
| Save and discard protection | Passed | Save changes new draft to stored entry; dirty Close prompts Keep editing / Discard; Keep editing retains text. |
| Keyboard | Passed | Journal auto-focus shows Android keyboard, typed text appears, Back dismisses it; Save stays reachable. |
| Reading log | Passed | John 1 logged with text; margin rule visible after restart. |
| Offline restart and search | Passed | Wi-Fi and cellular disabled through ADB; app force-stopped; scripture, saved mark and reading log remain; `1 ne 3:7` resolves. |
| Verse jump and chapter swipe | Passed | Search opens 1 Nephi 3:7 with verse in view; swipe advances to 1 Nephi 4 offline. |
| Reader settings | Passed | Sans and 105% size apply; native sheet closes with Android Back. |
| Dark and simple modes | Passed | System night mode updates app colors; simple mode hides chrome and provides explicit Exit simple mode. |
| Tablet landscape Browse and reader | Passed | Real multi-column cards; centered comfortable-width scripture; fresh-profile grid fix verified. |
| CFM guide and prose selection | Passed | Oct 26 guide renders bundled art/prose; long-press “publication” opens guide actions; highlight and Explore work. |
| Explore service through native UI | Passed | “publication” resolves to an English word-history entry; empty other sources show no-match counts. |
| Translation comparison | Passed | Catalog loads; BSB renders John 1:1 as Same wording and John 1:2 as “He was with God in the beginning.” |

## Web comparison and remaining limits

Production web Browse and John 1 were inspected in an incognito browser at Pixel 7 dimensions, plus Settings.
The native app carries the same art, paper/rubric palette, serif scripture, floating navigation, selection action
order and journal concepts. Android has additional back chrome and platform text handles; it is not pixel-identical.
The two confirmed mobile defects above were repaired; this is **not full web-parity or public-release sign-off**.

- **Blocked:** authenticated Google sign-in, cancellation/return, two-way sync, account switching, account deletion and multi-device conflicts. No disposable test account was supplied; these remain release-critical acceptance checks.
- **Not run:** physical-device performance, Play-installed build/signature, TalkBack/screen-reader navigation, edge-drag autoscroll, Android minimum API 24, iOS compilation/runtime, large-account and long-note stress tests.
- **Known scope gaps:** native still lacks web faith-tradition filtering, journal autosave, inline whole-chapter translation comparison, footnotes/JST/study paths, and native study-plan management (see README scope). These were not silently treated as implemented parity.
- **Observed behavior:** Android Back does not itself exit simple mode; the explicit Exit simple mode control works. This differs from the desktop keyboard behavior and is recorded rather than counted as a passing Back shortcut.

Additional final-APK checks:

- **Passed:** verse-note editing with the real Android keyboard; Add annotation renders an inline note card, and the text remains after a force-stop/relaunch. Existing word highlight remains.
- **Passed:** compact 360×640 dp rendering (720×1280 pixels at 320 dpi) of reader controls, selection action card, floating navigation and Settings → Reading. This uses an emulator display override, not a third Android version. Overrides were reset afterwards.
- **Passed:** captured phone/tablet AndroidRuntime and ReactNativeJS logs contain no `FATAL EXCEPTION` or JavaScript error entries during the captured QA window. This does not rule out every nonfatal warning or device-specific issue.

## Unedited screenshots

All screenshots are from the actual running standalone app on the dedicated emulators, with synthetic local QA notes only.

- [Cross-verse native selection](screenshots/cross-verse-selection.png)
- [Offline restart retaining a word mark and reading log](screenshots/offline-restart.png)
- [Fixed saved quote source](screenshots/fixed-quote-source.png)
- [Tablet before repair](screenshots/tablet-before.png) and [after repair](screenshots/tablet-after.png)
- [Live BSB comparison](screenshots/translation-comparison.png)
- [Verse note after process restart](screenshots/persisted-verse-note.png)
- [Compact 360×640 dp selection](screenshots/compact-selection.png)

The final APK is retained on `isaac-omarchy` as `~/Work/verse-android-qa/verse-together-qa.apk`.
Build and test logs are in that folder; runtime logs are under its `evidence/` directory. Emulators were gracefully
shut down after verification, preserving their profiles and test study data for later use. No Metro server is needed.
