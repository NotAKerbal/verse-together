# Android App Links (www.versetogether.org → the app)

With the app installed, tapping a website link to scripture opens it in the app instead of the browser:

| Link | Opens |
| --- | --- |
| `https://www.versetogether.org/browse` | Browse (the library) |
| `…/browse/<volume>`, `…/browse/<volume>/<book>` | that volume or book |
| `…/browse/<volume>/<book>/<chapter>` (`#v-21`, `?translation=`, `?compare=`) | the chapter, at the verse, with those comparisons |
| `…/share/<volume>/<book>/<chapter>/<verses>` | the shared passage (or "Passage not found") |

Every other website path stays in the browser. Only `www.versetogether.org` is claimed: `versetogether.org`
redirects there (307), and Android won't verify a host whose `assetlinks.json` redirects. Preview domains are
not claimed.

## How it fits together

- `mobile/app.json` `android.intentFilters`: one `autoVerify` filter, https, host `www.versetogether.org`, path
  `/browse` and prefixes `/browse/` and `/share/`. The `versetogether://` scheme (Google sign-in's return) is a
  separate filter and is unchanged.
- `mobile/app/+native-intent.tsx` → `mobile/src/navigation/appLinks.ts` maps each incoming URL to an app path. Links
  to the library, volumes, books and chapters are checked against the catalog (an unknown book opens its volume,
  and so on); share links must have the share page's shape and the share screen checks the passage. Malformed
  links on the site open Browse; links to any other host, or over http, open the home screen; only the reader's
  own parameters are kept.
- The website serves `/.well-known/assetlinks.json` from `src/app/.well-known/assetlinks.json/route.ts`
  (`src/lib/androidAppLinks.ts`). It lists, for `org.versetogether.app`:
  1. **Google Play's app signing certificate**, from the deployment's `ANDROID_APP_SIGNING_CERT_SHA256`. Every
     install from Play is signed with this key.
  2. **Our upload certificate** `CF:A6:F6:…:FC:D4` (RELEASE.md), for APKs signed with the upload key and installed
     outside Play.

  Until `ANDROID_APP_SIGNING_CERT_SHA256` is set, the file answers **404** and nothing verifies. The route refuses
  a value that is the upload certificate or the public debug key (`FA:C6:17:…:3B:9C`), and never lists the debug
  key: anyone can sign an app with it.

## Turning it on (owner)

### Confirmed Play signing certificate

Read from Verse Together's **Digital Asset Links JSON** in the signed-in Play Console on October 29, 2026:

```text
40:06:E0:02:C3:90:40:4C:0B:B2:68:AD:0F:74:28:05:8F:9A:3C:38:DD:DB:9D:74:F1:7D:03:13:81:82:5C:69
```

This is a public app-signing certificate fingerprint, distinct from the upload certificate above.
[Play Console App signing page](https://play.google.com/console/u/0/developers/8480991615941368259/app/4974891149717537388/keymanagement).

1. The current navigation is Play Console > Verse Together > **Protected with Play** > **Play Store protection**
   (Show details) > **Manage Play app signing**. The page's Digital Asset Links JSON lists the fingerprint above.
   Recheck this page after a signing-key change.
2. In Vercel, set `ANDROID_APP_SIGNING_CERT_SHA256` to that value for **Production** (it is public, not a secret)
   and deploy master. No code change is needed.
3. Check the live file and Google's view of it:

   ```bash
   npm run check:android-app-links -- --expect-sha256 <app signing SHA-256> --google
   ```

   It needs 200 with no redirect, `application/json`, the package and the certificate, and no debug key.
4. Ship a Play build that contains the intent filter (the first build after this change). Android verifies when
   the app is installed or updated. On a device:

   ```bash
   adb shell pm get-app-links org.versetogether.app          # www.versetogether.org: verified
   adb shell pm verify-app-links --re-verify org.versetogether.app
   ```

## Debug-signed previews

A preview signed with the public debug key never verifies against the live site, by design. To try the links on
a preview, approve the domain for that install only (this is the user's per-app choice, not verification):

```bash
adb shell pm set-app-links-user-selection --user cur --package org.versetogether.app true www.versetogether.org
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE \
  -d "https://www.versetogether.org/share/bookofmormon/alma/32/21-23"
```

Settings > Apps > Verse Together > Open by default shows the same choice. A link opened this way proves the app's
filter and link mapping, not that the hosted file verifies.

## Not covered

iOS universal links (`associatedDomains` and `apple-app-site-association`) aren't set up; iOS opens these links in
the browser.
