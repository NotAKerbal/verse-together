# Current status — Android 1.1.0 submitted to Alpha (2026-10-29)

- **1.1.0 / versionCode 7** has been submitted to the existing **Closed testing – Alpha** track, named **1.1.0 — Reader and journal parity**. Publishing overview visibly shows **Changes in review**. Quick checks are still running; Google says the changes will be sent for review automatically after they pass. Managed publishing remains off, so approval will publish the update automatically.
- **1.0.5 remains the serving Alpha release** until the new release is approved and made available.
- Signed AAB: `/tmp/verse-together-play-1.1.0.aab`, SHA-256 `648a55a6f8e26309df8c1a8f0d06b7f0d15c7629ec342551a38b7bbf83aa8325`. All **20 bundle checks passed**, including the upload certificate, 3 ABIs, native reflection fields and 16 KB alignment.
- Source: `61149946e17df684f11b8c2f82ce3254c5eded86`, integrated through [PR 74](https://github.com/NotAKerbal/verse-together/pull/74). **438 mobile tests**, mobile and website typecheck, **27 Android native tests**, and **12 website authorization/association tests** passed. The earlier phone/tablet signed-out runtime checks are in `../qa/`.
- Supporting website **2.19.0 is live**, master `ddd553ca48df253e58de127ff45d77bab23bf3ee`, deployment `dpl_4pnht7DrvTFoxNH6QyjeCaw2EEiK`. Production build logs verified `prod:lovable-seal-140`. The Play certificate is configured; the live assetlinks file and Google's Digital Asset Links API both confirm the association.
- **Not run:** real signed-in Google/sync/plan/deletion acceptance, physical devices, TalkBack and iOS. This is an update to the existing controlled test track, not a public-production launch.
- Details and release notes: [1.1.0 release record](releases/1.1.0.md).

## Previous release status — 1.0.5

- **1.0.4 is live:** Play Console shows Alpha **Active** and **Available to selected testers**, released Oct 28 at 3:45 PM. The first listing/content submission has published.
- **1.0.5 / versionCode 6 is serving:** Play Console’s Test and release page shows **1.0.5 — Explore, Settings and CFM** on Alpha with a serving time, and **You have no unpublished changes**. Managed publishing remains off.
- Includes the refreshed Settings, upgraded Explore sources and exact selections, and native CFM prose selection/links/local annotations. **Account-study sync is excluded from this Play bundle**. Its source is integrated with account-transition regression checks in the monorepo PR; a subsequent native build and real-device QA are still required.
- AAB: `/tmp/verse-together-play-1.0.5.aab`, SHA-256 `89516f3e53288b3ac184b69470317ba7bfd20f624c16baaa3d9c7f82cd4812f9`. APK: `/tmp/verse-together-native-1.0.5.apk`, signed with the upload key; an existing Play-signed install must receive its update through Play.
- **Passed:** 191 mobile Jest tests (3 live-only skipped), mobile typecheck, generated data check, fresh production guide manifest and direct live guide pages, signed bundle build, all 20 bundle checks, signed APK build and 26 native tests. R8 retains all 5 native records and 30 fields, including the new style field. **Not run:** actual device/gesture/Google runtime QA and iOS Swift compilation.
- Source evidence: `/tmp/verse-together-1.0.5-build-source.json`, `/tmp/verse-together-play-1.0.5-candidate-evidence.json`, `/tmp/verse-together-play-1.0.5-verification.json`. All 782 frozen source hashes and the original HEAD/index were unchanged during the build. Older AAB hashes and modification times are preserved. These release docs are updated afterwards.
- The generated Android cache backup at `/tmp/verse-android-pre-1.0.5-backup` is incomplete because prebuild started before its copy finished. The source checkpoint, feature commits, external upload key, and older generated-project backups remain available; no application source was lost.
- Closed-test link remains https://play.google.com/apps/testing/org.versetogether.app . Country **United States**, approved tester email list and feedback contact are unchanged. Production eligibility still requires 12 opted-in closed testers for 14 continuous days; eligibility has not been established.

## Historical first closed-test submission

- **Verified in Play Console:** Publishing overview says **Changes in review** and **Your changes are now in review**. The submission includes **1.0.4 — First closed test** on **Closed testing - Alpha**, versionCode **5**, plus the listing and app-content declarations (14 changes submitted together).
- The closed test targets **United States** only. The existing **Verse Together internal testers** email list is selected, currently containing only the owner's approved email. Feedback goes to isaachcochran@gmail.com. Additional testers will be added as the owner supplies their emails.
- Closed-test opt-in link: https://play.google.com/apps/testing/org.versetogether.app . The test is **awaiting Google approval**, not yet confirmed available. Managed publishing is off, so approved changes publish automatically.
- The production-access requirement remains **12 opted-in closed testers for 14 continuous days**. Submitting this release with one eligible email does not start that qualifying period. Anyone enrolled in the internal test must leave it before joining the closed test.
- This uses the existing signed 1.0.4 bundle unchanged. Account-study sync, upgraded Explore, CFM annotations and Settings parity are separate work in progress and are **not included** in this submission.
- Console: https://play.google.com/console/u/0/developers/8480991615941368259/app/4974891149717537388/publishing

## Existing internal release and deployment evidence

- Play Console visibly confirms **1.0.4 — Google sign-in internal test**, versionCode **5**, **Available to internal testers**, released Oct 28 at 9:03 AM (America/Denver), **Not reviewed**.
- Tester link: https://play.google.com/apps/internaltest/4698837825591920761 (existing approved tester list unchanged).
- Bundle hash: `d2bd8a3890771127912034a966ed5116817b2910a8e9a0466d90915cfafeb6a0`; all 20 bundle checks passed. The approved bundle was published unchanged, including the secure-store library's two normal biometric permissions; the app does not request biometric authentication.
- Backend and website deployed as web release **2.14.0**, master merge `1647d5162c427eddd5f69f7dae5a55dfe7cbc0e0`. PR69 merged into dev, then release prepared on dev and merged to master. Vercel production deployment `dpl_756FH13px1SSiNTe3QHGh51yDSY7` is READY; logs verify the successful push to `prod:lovable-seal-140` before publishing the frontend.
- Live `/privacy` and `/delete-account` return HTTP 200. `/api/auth/get-session` returns JSON null signed out; malformed `/api/auth/native-sign-in/exchange` returns HTTP400 `INVALID_SIGN_IN_CODE`. This checks routing and failure behavior, not a real Google sign-in.
- Play privacy policy URL saved as https://www.versetogether.org/privacy. Complete account-enabled Data safety saved: optional collected Name, Email address, User IDs and Other user-generated content for functionality/account management; the previous optional lookup/translation disclosures retained. OAuth account creation and https://www.versetogether.org/delete-account declared. These listing/policy changes are now **in review**, not a claim that Google approved or published the public listing.
- Real-phone Google sign-in/cancel/restart/sign-out/account-switch/test-account-deletion remains **not run by the agent**. Update through Play and test Settings → Account → Continue with Google. Full study sync remains absent; Copy to my account is explicit and local study is retained.
- Before public release, add a direct privacy-policy link in the native app, finish device QA and all applicable store review requirements. The existing internal test is not a public production launch.
- Desktop coordination: desktop owns subsequent DEV/backend writes for its separately authorized QA. It reports dev `ab8b2b013dd258b497cc4eac0ea83b64df7046ea` deployed with additive desktop endpoints, preserving mobile contracts. This thread has no further backend writes planned.
- Original mobile checkout remains uncommitted at the old base with the staged app work preserved. **Never deploy its backend directly**; the production integration lives on master. PR69's merged feature branch and its two temporary Vercel previews were cleaned up.

## Historical build and 1.0.3 notes (superseded where noted above)

# Play Console status — 1.0.3

Recorded after browser verification on 2026-10-27 (America/Denver).

- App: `org.versetogether.app`, developer `8480991615941368259`, app `4974891149717537388`.
- Signed Android App Bundle version **1.0.3**, versionCode **4**, uploaded and published to **Internal testing**. Google displays **Available to internal testers**, **Not reviewed**. The owner-approved email list is now selected and saved for this internal track (one tester email). The owner still needs to accept the opt-in invitation.
- Internal release: https://play.google.com/console/u/0/developers/8480991615941368259/app/4974891149717537388/tracks/4698837825591920761?tab=releases
- Tester opt-in URL (requires tester-list membership): https://play.google.com/apps/internaltest/4698837825591920761
- Default listing: title, short/full description, store icon, feature graphic, five original phone captures, asset-specific AI labels. Saved with status **Ready to send for review**. This is not a public listing or a policy approval.
- Category **Books & Reference**, public support **isaachcochran@gmail.com**, website **https://www.versetogether.org** saved.
- Saved app-content answers: no ads, no restricted native access in this build, no advertising ID, not a government app, no financial features, no health features.
- **Data safety:** complete draft saved. Optional dictionary lookup history: collected for functionality, not shared. Optional translation/chapter actions: collected and shared for functionality. Neither is claimed ephemeral; requests use HTTPS. No account creation or sign-in in this release. Optional data-deletion claim left unanswered. The target audience is now saved. Final submission remains blocked until the public privacy-policy URL is provided.
- **Content rating:** IARC status Completed, after the owner explicitly approved the separate terms and contact-email use. Ratings: ESRB Everyone 10+ (North America), PEGI Parental guidance (Europe), USK 12+ (Germany), All ages (Brazil), 12+ (rest of world, Russia, South Korea). Textual scripture and online reference content were disclosed separately from visual or interactive material; the app is primarily educational.
- **Target audience:** owner selected ages 13 and up; saved brackets are 13–15, 16–17, 18 and over.
- **Testers:** the owner explicitly approved using isaachcochran@gmail.com as tester identity and creating the account-level reusable list. `Verse Together internal testers` contains only that email; selected and saved for this track only. The opt-in page visibly invites this signed-in Google account. Accept invite remains for the owner; the invite separately agrees to sharing usage information with the developer.
- Public production access requires a closed release with at least **12 opted-in testers for 14 continuous days** before applying. The internal release does not start that closed-test requirement.

## Source and verification

Bundle `/tmp/verse-together-play-1.0.3.aab` SHA-256 `c5cf47686e4e0a4a6092137cea7d40ee2cd3a04e87e3cef318e1abc2880112c7`. Parent independently reran mobile typecheck, 86 Jest tests (2 opt-in network tests skipped), and all 19 general bundle verification checks; the signer fingerprint matches the dedicated upload certificate. More evidence: `/tmp/verse-together-play-1.0.3-parent-review.json`.

The owner reports the 1.0.2 app works on his phone and provided the native captures in `assets/screenshots/`. The agent did not run the 1.0.3 branding on a device. Google accepted the original captures during listing validation without cropping.

Debug-signed previews cannot be updated by Play-signed installs. Uninstalling the preview deletes local study data; keep it installed until an explicit data-preservation plan is available. Google sign-in is not in 1.0.3; the owner requested it as follow-up work.

## Not in Console: Google sign-in work (2026-10-28)

The working tree now has optional Google sign-in, an explicit copy of device study to the account, sign-out and
account deletion (`mobile/src/account/`, backend in `convex/`). It is **not in 1.0.3** and nothing in Play
Console was changed for it. Before releasing a build with it: deploy and test the backend, raise the version, then
redo Data safety (account creation, personal info, user content, deletion including a web deletion link) and the
listing as drafted in `privacy/data-safety-draft.md`, `privacy/privacy-policy-draft.md` and `listing/en-US.md`.
The former security release blocker (the session cookie in the `versetogether://` return URL) is replaced in code
by a one-time code the app redeems over HTTPS with a private verifier (`mobile/README.md`, "Why a code and not the
session"). It still needs independent review, backend deployment and real-device sign-in tests; none has been run.


## Candidate 1.0.4 (versionCode 5): built locally, NOT uploaded (2026-10-28)

A signed test candidate of the sign-in work above. **Not uploaded to Play Console; nothing in Console changed.**
Do not upload it yet: the backend it needs is **not deployed**, so its Google sign-in cannot work until it is.

- Bundle `/tmp/verse-together-play-1.0.4.aab`, SHA-256
  `d2bd8a3890771127912034a966ed5116817b2910a8e9a0466d90915cfafeb6a0`, 62,208,955 bytes, version **1.0.4**,
  versionCode **5** (iOS build 5), signed by the upload certificate
  `cfa6f617978adc01cfbfb978edf4016788b564d76ccf2ccb799f14128b53fcd4`. Built from `d973319` plus the uncommitted
  working tree, with `EXPO_PUBLIC_SITE_URL=https://www.versetogether.org` and
  `EXPO_PUBLIC_CONVEX_URL=https://lovable-seal-140.convex.cloud` (public production URLs) in the build environment.
- `npm run verify:android:bundle`: 20/20 checks passed (`/tmp/verse-together-play-1.0.4-verification.json`). Manual
  checks (`/tmp/verse-together-play-1.0.4-candidate-evidence.json`): both URLs and the one-time-code exchange are
  in the Hermes bundle, no Google client secret, private key or password; expo-secure-store, expo-crypto and
  expo-web-browser native classes present; backup rules exclude only `SecureStore.xml`, so the SQLite study stays
  in Android backup; `ACCESS_WIFI_STATE` absent.
- New permissions compared with 1.0.3: `USE_BIOMETRIC` and `USE_FINGERPRINT`, merged in by expo-secure-store
  (normal install-time permissions, no prompt; the app never asks for biometric unlock). Decide before upload
  whether to block them in `app.json`.
- Preflight: generated data and the git guide check (`origin/master` 2929d8a) passed. The live-site guide check
  could not run (the `/come-follow-me` page no longer lists lessons in its HTML); checked by hand instead: the site
  has guides for exactly the five bundled weeks (2026-09-28 to 2026-10-26).
- **Runtime untested**: not installed or run on any device or emulator; real Google sign-in, sign-out and deletion
  not tried. **Full sync is absent**: signed in, the screens still read and write only the device's study (copy to
  the account is explicit).
- Before uploading: deploy the backend, then the site (`mobile/README.md`, "Deployment and OAuth checklist"); test
  on devices; update Data safety, privacy policy and listing from the local drafts in `privacy/` and `listing/`
  (still drafts, not entered in Console), including the account-deletion link once `/delete-account` is live.
- 1.0.3 (`/tmp/verse-together-play-1.0.3.aab`, SHA-256 `c5cf4768…12c7`) is unchanged and remains the uploaded
  internal release.
