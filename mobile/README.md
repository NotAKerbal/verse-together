# Verse Together for Android and iOS

A native app (Expo SDK 58, React Native 0.88, Expo Router) built from the current mobile website: the same
Browse / Journal / Come Follow Me floating navigation, the cream-paper and rubric-red theme from
`src/app/globals.css` (light and dark, following the system), DM Sans for labels and the book serif for titles
and scripture, and the site's own artwork. Screens are native views (`View`, `Text`, `Pressable`, `FlatList`); scripture is a
small native view of this app's own (`modules/scripture-text`, below) so words and phrases can be selected.
There is no WebView.

It is self-contained in this folder: its own `package.json`, lockfile and `node_modules`. The web app's root
TypeScript and ESLint configs exclude `mobile/`.

## Run it

```bash
cd mobile
npm ci
npx expo run:android    # or npx expo run:ios: a development build with the app's native code, then Metro
```

Expo Go can't run this app: the scripture text is custom native code (`modules/scripture-text`), which Expo Go
doesn't include. Use a development build (`npx expo run:android` / `run:ios`, or EAS Build) or the standalone
preview below; with a development build installed, `npx expo start` serves its JavaScript as usual.

Native builds (`npx expo prebuild` or EAS Build) use `app.json`: app id `org.versetogether.app`, deep-link
scheme `versetogether://` (paths match the website's, e.g. `versetogether://browse/bookofmormon/alma/32`).

### Standalone Android preview

With Java 21 and the Android SDK configured, build an APK with its JavaScript, scripture and artwork bundled.
The Come, Follow Me guides are bundled too, so run the release preflight first (see "Come, Follow Me guides"
below):

```bash
git fetch origin master
npm run release:preflight   # generated data is current and every published guide is bundled
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease --no-daemon --max-workers=4 -PreactNativeArchitectures=arm64-v8a,x86_64 -PverseDebugSignedPreview=true
```

The output is `android/app/build/outputs/apk/release/app-release.apk` relative to `mobile/`. `-PverseDebugSignedPreview=true`
signs this local preview with the public Android development key, even though the build variant is called
`release`. This is a development artifact, not store signing or publication. It runs without Metro. Without that
flag a release build is signed with the Google Play upload key, or fails when the key isn't configured
(`plugins/withStoreSigning.js`; see `store/RELEASE.md`). Keep the same `applicationId` and signing key, and raise
`version` / `android.versionCode` in `app.json` (then prebuild again) for each preview, so a newer APK installs over
the old one and keeps the study saved on the device. Prebuild may regenerate `android/` from the template; its
`app/debug.keystore` is the same development key (certificate SHA-256
`fa:c6:17:45:dc:09:03:78:6f:b9:ed:e6:2a:96:2b:39:9f:73:48:f0:bb:6f:89:9b:83:32:66:75:91:03:3b:9c`), so check it
before building: a different key can't update an installed preview. Previews (debug key) and Play installs
(Google's app signing key) can't update each other; uninstall one to install the other, which deletes the study
on the device. The last preview was 1.0.2 (versionCode 3, iOS build 3).

### Google Play

`store/` holds the Play release: `store/RELEASE.md` (upload key, store build, verification, Console steps and
what is still missing), the listing text, privacy and Data safety drafts, credits, and the store graphics. The
first Play build is 1.0.3 (versionCode 4, iOS build 4). 1.0.4 (versionCode 5, iOS build 5), with Google sign-in,
was published to internal testing and is now live on the closed Alpha track. The UI update **1.0.5 (versionCode 6,
iOS build 6)** is built, verified and submitted to that closed test; Google quick checks and review are pending.
It includes Settings, Explore and CFM prose annotations, with account-study sync excluded. See
`store/CONSOLE-STATUS.md` for the exact evidence and limitations. The matching auth backend first deployed as
web release 2.14.0; phone sign-in testing remains.

```bash
npm run build:android:store -- --out /tmp/verse-together-play-<next-version>.aab
npm run verify:android:bundle -- /tmp/verse-together-play-<next-version>.aab --report /tmp/verification.json
```

### Icons and splash

The launcher's adaptive icon (foreground, `#f8f4ed` background and a monochrome layer for Android's themed
icons), the light and dark splash images and the store graphics are rendered from one vector drawing of the
site's mark by `store/brand/render-brand.mjs` (SVG sources in `store/brand/svg/`, review sheets in
`store/brand/review/`). `npm run brand` re-renders them; `npm run brand:check` fails if they are stale. iOS and
Android 7 (API 24–25) use the site's own square icons, `public/brand/icons/`.

Library defaults the app doesn't use are removed from the Android manifest with `android.blockedPermissions`
(storage, overlay, vibrate, audio), leaving `INTERNET` and `ACCESS_NETWORK_STATE`. `android.allowBackup` is
`true` (Expo's default, set explicitly): Android's device backup may include the study, under the user's settings.

## Checks

```bash
npm run typecheck        # tsc over the app and the shared web modules it uses
npm test                 # Jest: data, persistence, Explore/translation errors, real Expo Router navigation, release signing
LIVE_NETWORK=1 npx jest __tests__/live-services.test.ts   # optional: the live dictionary/study helps/HelloAO APIs
npm run export:android   # Hermes bundle for Android (dist-android/)
npm run export:ios       # Hermes bundle for iOS (dist-ios/)
npm run doctor           # expo-doctor
npm run generate:check   # generated data matches the checked-in sources
npm run check:published  # every guide published on master and on versetogether.org is bundled (network)
npm run brand:check      # launcher, splash and store graphics match their vector sources (needs the root npm ci)
# after prebuild: the native scripture text's Android unit tests (Robolectric)
(cd android && ./gradlew :scripture-text:testDebugUnitTest --no-daemon)
```

## What it does

- **Browse.** Library cards (this week's Come, Follow Me, Continue reading, Journal, the five volumes), each
  volume's books with their art and categories, chapter grids (current chapter and chapters with logged reading
  tinted), one-chapter books opening straight to the chapter, and D&C straight to its sections. Same routes as the
  web (`/browse/...`), built by the web's own `browseRoutes.ts`.
- **Reader.** Real text from the bundled standard works (offline), header pill (back, search, chapter list,
  Log, simple mode, settings), swipe or buttons for the previous/next chapter, verse jump links with a highlight,
  reading-log margin line, text size / serif or sans / text width, and simple mode.
- **Text selection.** As on the web, the reader selects words, not verses: a long press selects a word and the
  platform's own handles extend it to an exact phrase, across verses (the whole chapter is one text; in a study
  guide, each run of verses between context blocks is). Verse numbers, notes and line breaks are never part of
  the selection. The selection opens the web's phone selection menu, in one card above the navigation: quick
  marks and Clear, then Explore (the selected words), Add to journal (quotes exactly the selected words in a new
  entry), Annotate, Translations (the selected verses, Bible chapters) and Share (the selected words, with a
  `versetogether.org/share/...` link to their verses), with Copy text (the selected words) and the reference in
  its footer. Annotate opens in the same card, as on the web: "Your quick marks" named in full, "Any style and
  color" (highlight or underline, the palette, the reader's custom colors, and any `#rrggbb` color typed in
  Custom) prepared first and put on with Apply or taken off with Remove, and "Write a note" / "Edit your note",
  which opens the full note editor on the first selected verse (note, highlight and underline, saved together;
  its marked words are kept). Marks go on the selected words only, with the web's rules
  (`convex/annotationRules.ts`): on all of the selection, some (mixed), or none; an existing mark is split or
  replaced only within the selection, a whole-verse mark becomes ranges when part of it changes, and a mark never
  changes a note or the other kind of mark. Marks are drawn on their exact words; a range saved against other
  words (another translation's) is never drawn. The selection stays while marks go on and off; Clear, Back (or
  Android's back button, after leaving Annotate) and leaving the chapter clear it.
- **Explore and Translations** (internet needed). Dictionary and etymology through the site's
  `/api/tools/dictionary`; matching Bible Dictionary / Guide to the Scriptures / Topical Guide topics from the
  web's committed index, with entry text from `/api/tools/study-helps`; any HelloAO Bible translation through the
  web's `helloaoApi.ts`. Loading, timeout (12–15 s) and offline errors are shown with Try again.
- **Search.** References ("alma 32", "1 ne 3:7") and phrase search over the bundled text, filterable by volume,
  with the web's rules (40 verse matches, grouped by chapter, ranked).
- **Journal.** Reflection invitation with the web's prompts, month calendar, weekly goals with an editor, this
  month's study days, a thought worth revisiting, a day view, full-text search, and an entry editor: Markdown
  with preview, a reading chip (whole chapter or verses, day), Save, revision-checked edits, Delete, and a
  discard-changes guard. Verse notes appear as read-only entries that open their verse.
- **Come, Follow Me.** The 2026 schedule, this week's lesson (or its reading when no guide is published),
  coming up and previous lessons with covers and painting credits, and each published guide as the web's
  scripture-first study page: introduction, every assigned verse with "Context for verses …" disclosures and
  full commentary, in-guide scripture links that scroll to the verse, other references that open the reader,
  contents, closing sections, sources, credits and week navigation. Weeks without a guide list their reading.
  The guide's own prose (introduction, chapter headings, commentary, closing sections) is selectable native text
  too, annotated as on the web (`useGuideHighlights`): quick marks, Annotate (any style and color, the saved
  passages a selection overlaps, and a note with its highlight and underline, guarded against losing unsaved
  changes), Explore, Add to journal (the selected words, linked to their place in the lesson), Share and Copy text.
  A span is saved against the website's own text of the guide (`GuideRoot`, below), so a span saved on either is
  found on the other; a link in the prose opens with a tap.
- **Settings.** The web's phone Settings (`src/app/account/page.tsx`): a pill of sections, one open at a time
  under its heading, and a Privacy policy link below (`app/settings.tsx`, `src/features/settings/`;
  `/settings?tab=reading` opens a section). **Account**: Google sign-in with the website's account, copying this
  device's study to it when asked, sign-out and account deletion (see "Account" below), and deleting this device's
  study. **Reading**: a John 1:1–3 preview, text size, typeface and text width with Reset, and simple mode.
  **Translations**: the bundled King James Bible and the remembered comparison translation (choose, change or
  forget it). **Study tools**: quick marks (name, reorder, restyle, remove, add, restore defaults). **About**: the
  build's version, help by email, the privacy policy and account deletion on the web. Not in the app, so not shown:
  the web's faith tradition, comparison view, saved Bible library and default Bible, release notes and feedback form.

## Data and code shared with the web app

| What | Where it comes from |
| --- | --- |
| Scripture text | `public/scripture-data/*.json`, bundled as is (Metro reads the repository's `public/`) |
| Browse routes, catalog, CFM schedule, lessons, covers, passage references, quick marks, journal store | the web's pure TypeScript in `src/` and `convex/`, imported through `src/shared/web.ts` |
| Art, covers, guide figures, app icons | `public/art`, `public/cfm`, `public/brand/icons` |
| Study guides | `content/cfm/*.md`, parsed by the web's `src/lib/cfm/cfmGuide.ts`, converted to native blocks |

`npm run generate` (needs the root's `npm ci` for `marked` and `htmlparser2`) rewrites
`src/generated/cfmGuides.json` and `src/generated/images.ts` from those sources; `generate:check` fails when
they are stale. Add a guide on the web side, then regenerate.

### Come, Follow Me guides

Guides are bundled into each build; the app does not download new guides at run time, so a build only has the
guides that were in `content/cfm/` when it was made. New guides are published from `master` (production deploys
from it), and a branch made from `dev` can be behind it: the first Android preview (1.0.0) shipped without the
October 26 guide that way. Before each build:

1. `git fetch origin master`, then `npm run check:published`. It compares `content/cfm/guides.json` with
   `origin/master` (slug and Markdown SHA-256) and with the lessons linked from
   `https://www.versetogether.org/come-follow-me` (a linked week whose page renders a guide must be bundled).
   It exits 1 naming each missing or different guide, and 2 when it couldn't check (unknown ref, no network);
   `--no-site`, `--no-git`, `--ref` and `--site` adjust it.
2. Bring any missing guide over from the branch that published it: its `content/cfm/*.md`, its entry in
   `content/cfm/guides.json`, its cover and credit (`public/cfm/covers/`, `lessonCovers.ts`), and any parser
   change it needs. Then `npm run generate` and the tests.

Guides may read more than one book ("Jeremiah 31–33; 36–39; Lamentations 1; 3"). The web parser names each
chapter by a key (the chapter number in the first book, plus 1000 per later book); the generated data keeps those
keys with `range.entries`, which map each key back to its own book and chapter, so links, contents, verse
anchors, marks and reader links in a later book never land in the first book's chapter of the same number.

Study data is stored on the device in SQLite (`expo-sqlite/kv-store`) by the web's own `DeviceStudyStore`, in
the same records and under the same keys as the website's signed-out study (`vt_device_study_v1`,
`reader_prefs_v1`), so the account import takes them unchanged.

## Account (Google sign-in)

The app signs in with the **same Google accounts as the website**: Better Auth inside Convex (`convex/auth.ts`),
reached through the site's own `/api/auth` proxy, and the site's existing Google callback
(`${SITE_URL}/api/auth/callback/google`). No new Google OAuth client or redirect URI is needed, no Google secret is
in the app, and the proxy's signed client IP keeps rate limits per device as on the web.

Signed out is the default and works as before: reading, the journal and marks are offline and on the device, and
the account code makes no network request until someone taps **Continue with Google**. Signed in, the journal,
verse notes and marks, goals and Come, Follow Me guide annotations are the account's, synced with the website
("Study sync" below).

How it works (`src/account/`):

- **Client.** `client.ts`: `createAuthClient` with `expoClient({ scheme: "versetogether", storagePrefix:
  "versetogether", storage })` and `convexClient()`. The session cookie lives in `expo-secure-store` (Keychain /
  Android Keystore), never in SQLite. `plugins/withBackupRules.js` leaves only that file (`SecureStore.xml`) out
  of Android backups: its Keystore key isn't backed up, so a restored copy signs out instead of failing. The
  study in SQLite stays in the backup as before (expo-secure-store's own rules, switched off in app.json, would
  have backed up shared preferences only). `expo-network`'s `ACCESS_WIFI_STATE` is blocked; the permission set is
  unchanged from 1.0.3.
- **Sign-in.** `googleSignIn.ts`: each attempt is a public id and a private verifier (32 random bytes each from
  `expo-crypto`), saved together in `expo-secure-store`. `POST /sign-in/social` with the return URL
  `versetogether://auth-callback?attempt=<id>` and the verifier's S256 challenge (RFC 7636); the server binds the
  attempt to the OAuth transaction it just created, once. Then the site's `/expo-authorization-proxy` in an auth
  browser tab (it plants the OAuth state cookie, then goes to Google; Google's PKCE and state are Better Auth's).
  Google returns to the site's callback, which signs in and redirects to the app with a **one-time code**, never
  the session. The app then `POST`s `{ attempt, code, verifier }` to `/native-sign-in/exchange` over HTTPS and
  stores the session cookie from that response body. The return is accepted only for this device's saved, unexpired,
  unused attempt, from the browser result or (Android, cold start) the `app/auth-callback.tsx` route; a
  `versetogether://` link this device didn't ask for signs nothing in, and a `cookie` parameter is never read. One
  attempt at a time, used once: it ends for good when the browser is closed (on Android after a 1.5 s grace for the
  route, which can arrive just after the tab reports closing), when the browser fails to open or Google's return
  fails, when a newer attempt starts, and when the reader signs out or deletes the account. A return arriving after
  that is ignored; an exchange still on its way is discarded and its session signed out; one caught mid-write is
  taken back (only that session, never one stored since). An ended attempt is recorded twice: its saved copy is
  deleted from secure storage and its id is written to SQLite (`account.endedSignInAttempts`, ids only), so it stays
  ended after a restart if either write works; if both fail, the app says so. A restart while the browser is open
  still finishes through the route, because nothing ended the saved attempt. Cancel, Google's refusal, offline, rate
  limits and storage failures each get their own message.
- **Why a code and not the session (the former release blocker).** A custom scheme isn't owned: another Android
  app can register `versetogether://` and be handed the return URL, and anything that sees one can forge another
  (RFC 8252 §8.1). Until this change the session cookie itself came back in that URL. Now (server:
  `convex/nativeSignInPlugin.ts` and `convex/nativeSignIn.ts`; the Expo plugin's cookie-in-the-URL hook is removed):
  - The return URL carries only the attempt id and a 256-bit code that expires in 5 minutes and redeems once.
    The server stores its SHA-256 and the session id, never the code or a session token. The callback's browser
    response sets no session cookie or Convex JWT and is `no-store`, `no-referrer`.
  - The code redeems only with the attempt it was issued for and the verifier whose S256 challenge was bound to
    that attempt at sign-in; a wrong attempt or verifier is refused without using the code up. Concurrent
    exchanges: exactly one succeeds. The session must still exist (not signed out, revoked, or deleted), and comes
    back in the JSON body only (no `Set-Cookie`, so no native HTTP cookie store keeps a copy), `no-store`. The
    exchange is rate-limited (10 a minute per client) on top of Better Auth's sign-in limits.
  - An attempt binds to one OAuth transaction, once: someone who learns an attempt id (and its public challenge)
    can't bind their own Google sign-in to it, and a forged return carrying their own code for this attempt is
    refused at the exchange. So an intercepted return can't be used, and a forged one can't sign the app in to
    another account.
  - The app scheme is accepted as a return URL only in that exact native shape (`/sign-in/social`, Google, S256);
    any other route naming it (linking, email and password flows) is refused. Web sign-in is unchanged.
  - Expired records are swept every 15 minutes (`convex/crons.ts`) and on each new attempt; a session whose code
    was never redeemed (a cancelled or intercepted return) is revoked then.
  - What remains: a forged or intercepted return can still end the pending attempt (sign-in then says it didn't
    finish; try again). Something that can read this app's secure storage could read the verifier, as it could the
    session. Verified App Links are not used.
  This has been tested against Better Auth's real routes with Google's token endpoint stubbed
  (`tests/convex/nativeAuth.test.ts`) and with fakes in the app (`__tests__/account*.test.ts*`). It has not been
  deployed or run with real Google on a device.
- **Session.** `AccountProvider.tsx` opens one Convex client per saved session (closed at sign-out, so nothing
  cached for one account outlives it) and shows the account only once Convex accepts the session and the app user
  is provisioned (`users:ensureCurrentUser`) and still recognised (`users:accountStatus`), as `src/lib/auth.tsx`
  does on the web. Before provisioning it asks `accountDeletion:pending` (the caller's own unfinished deletion,
  nobody else's); an account being deleted is never provisioned again. After provisioning it follows
  `users:accountStatus`, which returns the app user and any unfinished deletion from one read: starting a deletion
  removes the one and records the other together, and separate subscriptions could show the app user gone before
  the deletion arrived, which looked like a session that had ended. A session the server no longer knows (no app
  user and no deletion to finish) is forgotten with a notice; unreachable shows "can't be reached" with Try again, keeping the session. Signing in again (even
  with another Google account) starts a fresh client.
- **Study sync.** While signed in, the study screens read and write the account's own study, never this device's:
  - *Which study is shown* (`src/storage/studySession.ts`, published by `AccountProvider`): this device's when signed
    out; the verified account's when signed in; while a saved session is offline or being checked, the account that
    very session was verified as before, from its cache (changes are queued, nothing is sent). That account is
    recorded with a SHA-256 fingerprint of the session token (`sessionBinding.ts`), so any other session (a new
    sign-in, a restored backup) sees nothing of it until the server confirms whose it is. An unfinished deletion, or
    a session whose account isn't known yet, shows neither study.
  - *Reading* (`studySync.ts`): `insights:listMyJournal`, `readingProgress:listMyReadingLog` and
    `users:getJournalGoals` are subscribed; each note's full text (`insights:getDraft`) is fetched three at a time
    whenever the journal shows it changed (the journal query isn't paginated, so this loads every note, bounded in
    concurrency), so the editor and search work offline; `annotations:getChapterAnnotations` and
    `annotations:getGuideHighlights` are subscribed while a chapter or guide is on screen. All of it is cached per
    account in SQLite (`src/storage/accountStudy.ts`, keys named by the account; the 400 most recent chapters and 120
    guides).
  - *Writing*: changes are saved at once in a per-account outbox in SQLite, shown immediately (the cache with the
    outbox applied, by the server's own mark rules), and sent one at a time, in order, while connected:
    `insights:createJournalEntry` (by request id, so a retry after a lost reply names the same entry; a reply without
    `markdownRevision`, from an older backend, is resolved by reading the entry back and taking its revision only if
    it holds exactly what was sent), `insights:saveJournalNote` (with the revision the text was based on),
    `insights:setJournalReading`, `insights:deleteDraft` (a note already gone counts as deleted),
    `annotations:setVerseMarks` (quick marks, as patches), and the note editor's `annotations:upsertVerseAnnotation` /
    `deleteVerseAnnotation`, merged field by field with what the account holds when sent. Failures retry with
    backoff (and Try sync again); the outbox survives restarts.
  - *Conflicts are never overwritten*: a note saved on an older revision stops with both versions kept, and the
    editor offers Keep my version, Use the newer version, or Save mine as a new entry; a note deleted elsewhere keeps
    the app's text to save as new or discard; a create refused with `ENTRY_CONFLICT` offers the saved entry or a new
    one; a verse whose note (or a mark) the app and the website both changed asks in its note editor. The Journal
    lists what needs a choice.
  - *Guide annotations* (`src/storage/accountGuideAnnotations.ts`, used by the guide's own adapter): direct calls to
    `annotations:setGuideAnnotation` and `deleteGuideHighlight` while connected (no outbox), cached per account.
    Weekly goals and opening a reading logged on the website as an entry are online-only as well.
  - *Sign-out* forgets the account's cache; changes it hasn't received stay on the device for that account only
    (sent if it signs in here again), after a warning. *Deleting the account* forgets both. Another account signing
    in sees nothing of the first.
  - This device's own study is never uploaded by signing in: it stays as it was (the Journal says how much isn't in
    the account) and shows again after signing out. It reaches the account only by **Copy to my account**.
- **Copy this device's study.** `guestCopy.ts`, only when the owner taps **Copy to my account**: journal entries,
  verse notes and marks and guide notes and marks go through the web's idempotent device-import mutations
  (`insights:importDeviceNote`, `annotations:upsertVerseAnnotation`, `annotations:saveGuideHighlight`, keyed per
  account by `deviceStudyImports`), with the account named in each call and checked before each record. Unlike the
  web (which moves signed-out study into the account), the app keeps everything on the device, unchanged: a ledger
  (`vt_device_study_account_copies_v1`) records each record's account. Records are reserved before anything is
  sent, so an interrupted copy only ever finishes into that account and is never offered to another; a retry
  sends only what's left. Guest weekly goals are not copied (the web keeps them on the device too).
- **Sign-out** ends any pending Google sign-in first (including an exchange in flight), then forgets the session on
  the device even when offline (the server session then expires on its own) and keeps the device's study. If secure
  storage refuses to forget it, or neither store can record that the pending sign-in ended, the app is signed out
  for this run and says so.
- **Delete account** (`POST /delete-user`, Better Auth with `user.deleteUser` enabled): confirmed in a dialog;
  needs a session made in the last day (otherwise the app asks to sign in again); 3 attempts a minute. The server
  deletes every row the account owns (`convex/accountDeletion.ts`, in batches, resumable) before the Better Auth
  user, sessions and Google link; shared reference links it added are kept without the owner. The device's own
  study stays.
- **A deletion that stopped partway** (the connection dropped, the app was stopped, a batch failed) has already
  removed the app user, so there is no account to show. Settings shows "didn't finish" with **Finish deleting my
  account** and Sign out instead: after a restart, and after signing out and in again with that Google account.
  Finishing is the same `POST /delete-user` (same confirmation, fresh-session check and rate limit). Nothing is
  provisioned or written for that account meanwhile.
- **On the web**, `/delete-account` (`src/features/auth/DeleteAccount.tsx`, linked from the account page) does the
  same for people without the app: Google sign-in, a confirmation box, the same route, "sign in again" when the
  session isn't fresh, and finishing a deletion that stopped partway (it needs only the Better Auth session, not a
  loaded app account). Its public address once the site is deployed with it:
  `https://www.versetogether.org/delete-account` (deployed with web 2.14.0 and saved as the Play deletion link).

### Deployment and OAuth checklist

The app needs two public URLs at build time (copy `.env.example` to `.env.local`, or set them in the build
environment). Without them the build works signed out and Settings says sign-in isn't set up.

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_SITE_URL` | The site origin that is `SITE_URL` on the Convex deployment, e.g. `https://www.versetogether.org` |
| `EXPO_PUBLIC_CONVEX_URL` | The same deployment's `https://<deployment>.convex.cloud` |

Before a release with sign-in:

1. Deploy the backend changes (`convex/auth.ts`, `convex/authEnvironment.ts`, `convex/nativeSignInPlugin.ts`,
   `convex/nativeSignIn.ts`, `convex/accountDeletion.ts`, `convex/users.ts`, `convex/crons.ts`, `convex/schema.ts`:
   new `accountDeletions` and `nativeSignIns` tables and a `feedback.by_clerk_id` index) to the deployment the app
   points at, then the site (it serves `/api/auth` and `/delete-account`). Backend first: the site and the app
   both subscribe to the new `accountDeletion:pending` and `users:accountStatus` queries, which a backend without
   them rejects, and the app's sign-in needs `/native-sign-in/exchange`. No Convex environment change is needed:
   `versetogether://` is trusted in code, `SITE_URL`, `GOOGLE_*`, `BETTER_AUTH_SECRET` and `AUTH_PROXY_SECRET`
   stay as they are.
2. Google Cloud: nothing to add. The existing web client's redirect URI `${SITE_URL}/api/auth/callback/google`
   is the one the app uses; check it is listed for the URL in `EXPO_PUBLIC_SITE_URL` (`www` vs bare domain).
3. Confirm `EXPO_PUBLIC_SITE_URL` is exactly the deployment's `SITE_URL` origin: the proxy sets the state cookie
   on that origin and the callback reads it there.
4. Sign in on a real Android device and iPhone with a test Google account: cancel, decline, sign in, copy, sign
   out (including while the browser is open), sign in with a second account, a cold start while the browser is open
   (Android), and delete a **test** account. Check the return URL in the device log carries only `attempt` and
   `code`. None of this has been run (see "Verification limits").
5. Store: the Data safety and privacy drafts in `store/privacy/` have a section for this release; Play needs an
   account-deletion web link as well as the in-app path: `https://www.versetogether.org/delete-account` once the
   site is deployed with it (check it loads, signed out, before entering it).
6. The custom-scheme blocker is addressed in code by the one-time code exchange above. An independent review
   (2026-10-28) of the handoff, one-time redemption, callback, cancellation and deletion found no blocking issue in
   the reviewed paths, and the automated tests pass. Backend and website deployment completed in web release
   2.14.0; Android 1.0.4 is live in closed testing and UI-only 1.0.5 is submitted for review. The account-sync
   source in this checkout is newer than those builds. Step 4 still needs real-device testing before public release.

## Not in the app yet (and why)

- **Sync gaps.** The reading position (Continue reading) stays on the device; the lesson list's read chapters
  (`LessonParts.tsx`) still come from this device's journal; weekly goals, guide annotations and opening a website
  reading need a connection; the editor saves on Save (no autosave). Sync has been tested against an in-memory
  account with the server's rules (`__tests__/accountSync.test.ts`, `accountJournal.test.tsx`,
  `accountProvider.test.tsx`), not against a deployment or on a device.
- **Account-only pages:** study plans (linked to the website), the community feed, published and shared
  insights, talk pages, the resources manager, help and feedback.
- **Reader extras:** footnotes and citations, Joseph Smith Translation excerpts, AI chapter study paths,
  and inline whole-chapter translation comparison (the app compares the selected verses).
- **Marks:** custom colors are typed as hex (the web uses the browser's color picker). In a study guide, a selection
  can't run across a context block into the next passage (each passage is its own text), and a prose selection
  can't run out of a run of paragraphs and headings into a list, quote, table or figure (each is its own text).
  Guide prose marks are local while signed out and use the account's cached spans while signed in; changes
  require a verified online connection. An unknown owner or pending deletion never falls back to device rows.
  A span with only a note is underlined in a quiet solid line (the web's is dotted).

## The scripture text (`modules/scripture-text`)

A local Expo module (autolinked from `modules/`, so it survives `prebuild`), used through
`src/features/reader/ScriptureText.tsx`:

- **Android:** a `TextView` set to selectable, read-only text (no keyboard, no editing). Android's own long-press
  word selection, handles and drag do the selecting; its toolbar items are removed (the app's card is the menu)
  but the action mode is kept, so the handles stay. A long press claims the touch (`requestDisallowInterceptTouchEvent`),
  which stops the scroll view and gesture handler's chapter swipe from taking the drag; the swipe is also off
  while text is selected. Styles are spans; highlights, colored underlines (`max(1.5px, 0.08em)`, `0.22em` below
  the baseline, as `.verse-mark`), note cards, the jump flash and the reading rule are drawn over the laid-out
  text, so a mark going on or off never rewrites the text or drops the selection. Selection changes the reader
  makes are reported; changes the app makes (new text, a restored or cleared selection) are not. A plain tap
  (not a long press, a drag past the touch slop, a cancelled touch, or a tap that ends a selection) reports the
  character under it (`onTextPress`, its UTF-16 offset), which the guide prose uses for links. A run may carry a
  `style` (bold, italic, both) merged into its face with `Typeface.create`; without one the face is as named.
- **iOS:** a non-editable, selectable `UITextView` (TextKit 1) with the same props and events: underlines are the
  text's own colored underline attributes and highlights are layers behind the glyphs. `onTextPress` comes from a
  tap recognizer that recognizes alongside UITextView's own gestures and cancels or delays no touches; a run's
  `style` is merged into its font's symbolic traits.
- **Offsets:** the view reports UTF-16 offsets into its text; `scriptureDocument.ts` maps them to UTF-16 offsets of
  each verse's canonical text (`VerseTextRange`, the web's format), excluding verse numbers, notes and line
  breaks, trimming edge whitespace, keeping surrogate pairs whole, and mapping the displayed em dash back to the
  source's `--`. Guide prose (`src/features/cfm/guideProse.ts`) maps them to offsets of the website's DOM text of
  the guide (`GuideRoot` in the generated data: each rendered element's text nodes, whitespace included, checked
  against the HTML standard's parser at generation), from which `guideAnchors.ts` describes and finds spans.

## Verification limits

Native UI runtime remains unverified. The Android SDK, emulator and Android 15 image are installed, but this
VM exposes no KVM acceleration. Software boot reached adb, then hit Android runtime suspension timeouts and
system-service watchdog restarts without a reliable completed boot. The failed test emulator was stopped.
There is no macOS environment for iOS: the iOS scripture view is written but has never been compiled or run.
The Jest tests render the real routes and screens with React Native's test renderer; the scripture view's native
bridge is mocked there (a host element with the same props and events), so they check the offset mapping, the
selection state, marks and the menu's actions, not the platform's gestures. The Android view is compiled into the
APK and its Robolectric tests check its read-only configuration, which selection changes it reports, that marks
and restyling keep the selection, and its toolbar callback; they set the selection through Android's `Selection`
spans rather than simulating a long press or handle drag. Still unverified on a device: long-press word selection
and dragging the handles across verses, autoscroll while dragging near an edge, the emptied toolbar, the
scroll view and chapter swipe yielding to a selection, how the drawn marks, fonts and note cards look, keyboard
behaviour, and visual match with the website. The selection menu follows the web's `VerseActionBar` layout,
labels, sizes and behaviour, but it is a native rebuild, not a pixel-identical copy.


### Account study sync integration and verification (2026-10-28)

The reviewed mobile feature deltas are combined on current `dev` without importing their old backend history.
No new backend API, environment change or mobile store release is part of the source integration. The released
UI-only 1.0.5 source is preserved separately and excludes these account-sync changes.

Come, Follow Me reads verses through `useVerseAnnotations` and routes guide spans through the account facade
in the same source change as the account-aware write actions. Its lesson and guide editor remount on study-owner
identity changes; deferred save/delete callbacks assert the identity they were opened for. Integrated route tests
cover account-owned Lamentations marks, guide notes, guest/account switches and delayed actions. These use an
in-memory server and mocked native selection bridge, not authenticated production or real-device QA.

Production read-only queries confirmed `listMyJournal({})`, chapter annotations, guide highlights, reading log,
goals and account/deletion status. The public production web bundle confirms revision-aware
`saveJournalNote({draftId, markdownBody, expectedRevision})`, `markdownRevision`, `REVISION_CONFLICT`,
`ENTRY_CONFLICT`, `setJournalReading` and `deleteDraft`. Authenticated production mutations were not exercised;
the deployed create result is normalized as either an id or object and re-read when no revision is supplied.
Reference web source was inspected with `git show` at master `c964037` and dev `a7ed47c`, without changing backend
files. `listMyJournal` is not paginated; note bodies download with concurrency three, and failed reads retry.

Journal saves have server-enforced revision checks. Verse annotation APIs have no conditional revision argument:
mobile compares the latest server fields before sending queued verse edits and surfaces differing fields as
conflicts, but cannot atomically prevent an edit on another client between that read and mutation without a backend
change. Guide spans/goals require a connection and are not queued; a timed-out submitted mutation may still finish.
Unreadable account outboxes are preserved and block further writes rather than being replaced with an empty queue.
Sign-out ends account study immediately, retains unsynced work for that owner, and blocks new sign-in until the old
auth request's cookie cleanup settles. The saved cache owner is bound to the verified session fingerprint.

Automated checks use an in-memory server and real native routes under Jest; they do not establish authenticated
production round trips or real-device Google/keyboard/gesture behavior. Android export is held until the parent
explicitly sends `export ok` after its separate UI-only 1.0.5 Gradle release build.
