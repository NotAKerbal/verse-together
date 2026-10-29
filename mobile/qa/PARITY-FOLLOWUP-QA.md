# Android parity follow-up — October 29, 2026

This follow-up addresses native authenticated study-path generation, HTTPS app links and durable account
Continue reading. It follows [the October 28 parity build](PARITY-QA.md). Claude implemented the fixes;
the parent reviewed the integration, wired research status into the reader and ran the checks below.

## Source and artifact

Base remains `7b9f9933711f1d00948f57d11143404cfce212d4` on `t3/android-app-qa`, with the uncommitted parity work.
[Source manifest](followup-source.sha256) records all 107 changed implementation/configuration/test files
used for this build. All hashes matched the remote build source and local source after testing.

APK on `isaac-omarchy`: `~/Work/verse-android-qa/verse-together-followup.apk`, SHA-256
`00d56d8f44fe97b86135d5b691d65ea3c5ab0b773549ae7fe7f7912b5d4eaad7`.
This is a development-key signed x86_64 release APK for emulators; version remains 1.0.5 (6).
No deployment, version bump, store upload, commit, push or production mutation was performed.

## Changes

- **Study-path generation:** public cache requests remain anonymous. An uncached chapter's 401 triggers a
  request authenticated with the verified owner's fresh Convex JWT. The site asks Convex to verify the token
  and live linked user before any paid research. Browser cookie authentication is preserved. Account/session
  changes invalidate in-flight results. Generation has a 75-second client timeout, researching/error/retry UI,
  and a 90-second configured server budget around the existing 45-second OpenAI request.
- **HTTPS links:** Android claims only HTTPS Browse/share paths on `www.versetogether.org`. Expo's native
  intent hook validates/maps the URL, preserves valid verse anchors and comparison parameters, and leaves the
  custom sign-in scheme intact. The site's Digital Asset Links endpoint fails closed until a real Play app-signing
  fingerprint is configured. It never publishes the public debug key. [Activation instructions](../store/APP-LINKS.md).
- **Offline Continue reading:** an account's latest known position and pending position are stored under its own
  SQLite key. Cold starts restore that owner's record, never the guest's or another account's. Pending writes
  survive restart and retry on reconnect, with server/local reconciliation and protection against stale replies.
  Normal sign-out keeps only an unsent position for that account; deletion clears everything. Storage failures,
  stale replies and cold restarts have focused regression coverage. Review also bounded stored timestamps to
  JavaScript's Date range, preventing corrupt finite values from crashing Continue reading; its regression fails
  without the bound and passes with it.

## Checks

| Check | Status | Evidence |
| --- | --- | --- |
| Production website `npm run build` | Passed | Both changed API routes registered, including `/.well-known/assetlinks.json`. `/tmp/verse-followup-web-build.log`. |
| Website authorization + asset-link tests | Passed | `npx vitest run tests/chapterInsightsAuth.test.ts tests/androidAssetLinks.test.ts`: 12 tests. `/tmp/verse-followup-web-tests.log`. No real OpenAI generation. |
| Focused native auth/account/reader tests | Passed | 59 tests across `studyPathsAuth`, `accountProvider`, `readerParity`. `/tmp/verse-followup-reader-tests.log`. |
| Full combined mobile suite | Passed | Final run: 35 suites, 432 tests; 3 opt-in network tests skipped. Remote `followup-final-tests.log`. |
| Mobile `npm run typecheck` | Passed | Remote `followup-final-typecheck.log`, no TypeScript errors. |
| Android release and native tests | Passed | `assembleRelease :scripture-text:testDebugUnitTest`, x86_64, `verseDebugSignedPreview=true`: initial build 2m52s, final incremental build 48s; 27 native tests, zero failures/errors/skips. Remote `followup-final-build.log`. |
| Explicit auth/reader ESLint with `--no-ignore` | Passed | Zero errors, two existing reader dependency warnings. `/tmp/verse-followup-auth-lint.log`. |
| Final cache/provider ESLint with `--no-ignore` | Passed | Zero errors or warnings. `/tmp/verse-followup-cache-lint.log`. |
| Real Next well-known endpoint | Passed | Local production server returns JSON 404 with `Cache-Control: no-store` without the certificate setting, rather than a misleading association. Test server stopped afterward. |
| Cold HTTPS share launch | Passed, final APK | Explicit per-device approval for the debug install; Android dispatches the HTTPS URL into the app and shows John 3:16–17. [Final screenshot](followup-screenshots/final-https-share.png). |
| Warm HTTPS scripture/anchor launch | Passed, emulator | Running app receives Alma 32 `#v-21` and brings verse 21 into view. [Screenshot](followup-screenshots/https-browse.png). |
| Custom scheme regression | Passed, emulator | `versetogether://browse/newtestament/john/1` still opens the reader. This is not a Google sign-in return test. |
| Cold offline HTTPS Browse | Passed, emulator | Both radios disabled, app force-stopped; Browse opens via HTTPS and guest Continue reading retains John 1. [Screenshot](followup-screenshots/offline-continue.png). |
| Final captured Android errors | Passed, captured window | AndroidRuntime/ReactNativeJS error capture empty. Remote `evidence/followup-final-phone-errors.log`. |
| Whitespace and source identity | Passed | `git diff --check`; all 107 manifest hashes matched. |

Runtime checks used the existing dedicated Pixel 7 Android 15 emulator on `isaac-omarchy`. These screenshots are
unedited captures of the real release APK, with synthetic local study. Networking was restored and the temporary
per-device domain approval removed afterward. No personal emulator or device was cleared.
Warm links, the custom scheme and offline Browse were exercised on the preceding follow-up APK. The final APK
adds only the sign-out option and corrupt-timestamp guard; its cold HTTPS launch was repeated after installation.
The emulator was gracefully stopped, retaining its profile and installed app for later QA.

## External activation and unverified acceptance

**Certificate lookup resolved October 29:** Chrome's existing signed-in Play Console showed the real fingerprint
in the App signing page's Digital Asset Links JSON. It is recorded in [the setup notes](../store/APP-LINKS.md).
The build-time missing-certificate evidence below remains historical; deployment configuration and activation
are still pending.

- **Blocked — automatic HTTPS verification:** the real Google Play app-signing certificate SHA-256 is missing.
  The owner has been asked for this public fingerprint. Configure `ANDROID_APP_SIGNING_CERT_SHA256` on the
  website deployment, deploy the website, and ship a Play build containing the intent filter. Use
  `npm run check:android-app-links -- --expect-sha256 <fingerprint> --google` afterward. The debug emulator
  reports `legacy_failure` for hosted domain verification, as expected; manual approval is not verification.
- **Pending deployment — native generation:** the revised website route must be deployed before an installed
  app can authenticate uncached generation against it. No deployment was made in this task.
- **Not run — real signed-in acceptance:** no Google test account was available. Real JWT exchange, generation,
  account-cache cold restart/reconnect, account switching and deletion were not exercised on Android against
  the backend. Their authorization/owner-boundary/restart checks use fake services and durable test storage.
- No paid research, real feedback, production study writes or account mutations were performed. Physical devices,
  TalkBack, Play signature behavior and iOS remain outside this run.
- Account position reconciliation compares device and server clocks; a badly incorrect device clock can select
  the wrong winner after an offline read. Failed sends retry on reconnect/account reopening/new chapter, not a timer.
- A source-text issue is visible in the screenshots: BSB John 3:16 says `onlySon`. A read-only request to the
  website's chapter API returned that exact text, matching Android's native accessibility text. Correcting that
  shared translation-source spacing is separate from these three integration fixes.
