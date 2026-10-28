# Play Console Data safety and App content: draft answers for 1.0.3

> Draft for the owner. It records what the app's code does (reviewed for 1.0.3 at commit d973319 plus this
> branch's changes) and suggests answers; the owner decides and submits them. Items marked **Owner decision**
> depend on facts outside the app (website hosting logs) or on judgement.

## What the code does (evidence)

| Area | Finding | Where |
| --- | --- | --- |
| Dependencies | No analytics, crash reporting, ads, auth, push or tracking SDK. Runtime packages: Expo modules (router, font, image, sqlite, clipboard, splash, system UI, linking, constants, status bar), React Native, gesture handler, reanimated, safe area, screens, worklets, `marked`, `convex` (types/values only; no client is created). | `mobile/package.json`; `grep ConvexReactClient` finds nothing in `mobile/app`, `mobile/src` |
| Study data | Journal, marks, notes, reading log, goals, quick marks and reader settings are stored with `expo-sqlite/kv-store` in app-private storage. Nothing uploads them. | `mobile/src/storage`, README "Data and code shared with the web app" |
| Network: dictionary | `GET https://www.versetogether.org/api/tools/dictionary?term=<selected word>`; the site's server queries dictionaryapi.dev, en.wiktionary.org and (with a key) Merriam-Webster. | `mobile/src/features/explore/explore.ts`, `src/app/api/tools/dictionary/route.ts` |
| Network: study helps | `GET https://www.versetogether.org/api/tools/study-helps?guide=<guide>&slug=<topic>`; the server fetches the published topic from churchofjesuschrist.org. | `explore.ts`, `src/lib/studyHelpContent.server.ts` |
| Network: translations | `GET https://bible.helloao.org/api/available_translations.json` and `/api/<translation>/<book>/<chapter>.json`, directly from the app. | `src/lib/helloaoApi.ts` |
| Other network | None at run time: scripture, guides, covers and fonts are bundled. "Open on the web" and source links open the browser. Share uses the system share sheet. | `app/settings.tsx`, `VerseActions.tsx`, `Blocks.tsx` |
| Permissions (merged release manifest) | `INTERNET`, `ACCESS_NETWORK_STATE`, and AndroidX's app-private `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. Library defaults removed with `android.blockedPermissions`: `READ/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`, `VIBRATE` (and `RECORD_AUDIO`, not present). | `app.json`; see the bundle verification report |
| Android backup | `android:allowBackup="true"` (set explicitly in `app.json`; it was already Expo's default). Android Auto Backup may include app data, including the SQLite study store, in the user's Google account backup and in device-to-device transfer, under the user's device settings. The developer never receives it. | `app.json` |
| Identifiers | The app reads no advertising ID, Android ID, account or contact data. | code search |

## Suggested Data safety answers

**Does your app collect or share any of the required user data types?**

**Decision (Isaac, 2026-10-27): Yes, the conservative answer (formerly "Option B").** Whether the website's host
or HelloAO keep looked-up terms is unknown, so nothing is claimed as processed ephemerally. Declare:

- **App activity > In-app search history**: the word looked up in Explore, sent to www.versetogether.org (the
  developer's own service), which passes it to the dictionary APIs to answer. Collected: yes. Shared: no (they
  answer the request on the developer's behalf). Processed ephemerally: no (not confirmed). Optional (the user
  chooses Explore). Purpose: App functionality.
- **App activity > Other actions**: which Bible translation and chapter are opened in Translations, sent directly
  from the app to bible.helloao.org, a third-party public API. Collected: yes. Shared: yes (conservative: a third
  party not acting for the developer). Processed ephemerally: no (not confirmed). Optional. Purpose: App
  functionality.
- Location: not declared; the app doesn't use IP addresses to determine location.
- Study data (journal, marks, notes, goals, settings): not declared. It stays on the device; Android's own device
  backup goes to the user's Google account, which the developer can't access.

If Google Sign-in and sync are added, these answers change (account info, user content, and Play's account
deletion requirement); redo this form then.

The rejected alternative ("Option A", answering **No**) needed the hosts to confirm the requests are processed
ephemerally.

**Is all of the user data collected by your app encrypted in transit?** Yes: every request uses HTTPS.

**Do you provide a way for users to request that their data be deleted?** There is no account and the
developer stores no study data. Study data is deleted on the device (Settings > delete this device's study, or
uninstall). The looked-up words and chapters aren't tied to a user or account; the privacy policy gives the
contact email for questions.

**Independent security review:** No.

## Other App content answers (suggested)

| Item | Suggested answer |
| --- | --- |
| Privacy policy | Publish the completed `privacy-policy-draft.md` at a public URL first (for example on versetogether.org). |
| Ads | No ads. |
| App access | All functionality is available without login or special access. |
| Content rating | Completed in Console. Declared the bundled religious narratives and online dictionary/translation references as textual content, without visual depictions. No native user communication, location sharing, purchases, gambling, or rewards. Primary purpose is educational. See `../CONSOLE-STATUS.md` for resulting ratings. |
| Target audience | **Owner decision: ages 13 and up.** Saved as 13–15, 16–17, 18 and over. Some jurisdictions still consider users in these brackets children; follow the applicable Play policies. |
| News app | No. |
| Government app | No. |
| Financial features | None. |
| Health | None. |
| Generative AI | The app has no generative AI feature. Its bundled study guides are written by Claude Opus 5.5 and reviewed by Isaac before publishing; each is credited in the app, and the listing says so. |
| Data deletion URL | Not required without accounts; see above. |

## Next release with Google sign-in (draft; not 1.0.3, nothing changed in Console)

The answers above describe 1.0.3, which has no sign-in, and match what is saved in Console. A build with the
account code in `mobile/src/account/` changes them; redo the form for that release. Not yet run on a device.

| Area | Finding | Where |
| --- | --- | --- |
| New dependencies | `better-auth`, `@better-auth/expo`, `@convex-dev/better-auth` (auth client and Convex auth provider), `expo-secure-store` (session cookie), `expo-web-browser` (sign-in tab), `expo-network` (online state for the auth client), `expo-crypto` (the sign-in attempt id and private verifier from the secure random generator, and the verifier's SHA-256 challenge). Still no analytics, crash reporting, ads or tracking SDK. | `mobile/package.json` |
| Signed out (default) | No account request and no Convex connection until the user taps Continue with Google. | `AccountProvider.tsx` (the Convex client is created only for a saved session) |
| Sign-in | Optional. Google sign-in in a browser tab via `https://www.versetogether.org/api/auth` (Better Auth on Convex) and Google. Better Auth stores the account (name, email, Google profile picture URL, Google account id) and sessions (with IP address and user agent, as for the website). The return from the browser carries only a one-time code; the app exchanges it over HTTPS, with a verifier kept in secure storage, for the session cookie, which is kept on the device in secure storage. The server keeps a short-lived record per sign-in attempt (attempt id, OAuth state, the verifier's hash, the code's hash and the session id), swept within about 90 minutes. | `googleSignIn.ts`, `convex/nativeSignInPlugin.ts` |
| Signed in | The app connects to the Convex deployment to check the account. It reads no study from the account. | `AccountProvider.tsx` |
| Copy device study | Only when the user taps Copy to my account: journal entries (text, date, linked passage, reading time), verse notes, highlights and underlines, and guide notes and marks are uploaded to the user's account. They also stay on the device. | `guestCopy.ts` |
| Permissions and backup | Unchanged permissions: `expo-network`'s `ACCESS_WIFI_STATE` is removed with `blockedPermissions`. Android backup keeps the study as in 1.0.3 and leaves out only the secure-store file with the session (`plugins/withBackupRules.js`); a restored install starts signed out. Checked with `expo config --type introspect`, not in a built bundle. | `app.json` |
| Deletion | Settings > Account > Delete my account deletes the account and all of its study on the server (journal, notes, marks, reading history, goals, plans, shares, comments, friendships, feedback tied to the account). | `convex/accountDeletion.ts` |

Suggested answers for that release (**Owner decision** on each):

- **Does your app collect or share user data?** Yes (as for 1.0.3, plus the below).
- **Personal info > Name, Email address**; **Personal info > User IDs** (the account id): collected, not shared,
  optional (sign-in is optional), purposes **App functionality** and **Account management**.
- **App activity > Other user-generated content** (journal entries, notes, marks the user chooses to copy):
  collected, not shared, optional, purposes **App functionality** and **Account management**. Not processed
  ephemerally.
- **Photos**: not collected by the app (the Google profile picture URL is stored by the account, not an image the
  app uploads). **Owner decision** whether to declare it under Personal info.
- **Account creation**: the app lets users create an account, with OAuth (Google).
- **Data deletion**: yes, users can request deletion. In the app: Settings > Account > Delete my account. Play also
  asks for a **web link** where users can request deletion without the app: draft
  **https://www.versetogether.org/delete-account** (`src/app/delete-account`; Google sign-in, confirm, delete,
  and finishes a deletion that stopped partway). Not deployed yet: deploy the site and check the page loads before
  entering it.
- **Encrypted in transit**: yes.
- **App access**: all reading and study features still work without an account; sign-in uses the reviewer's own
  Google account. **Owner decision** whether to give Play review instructions.
