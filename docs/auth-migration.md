# Clerk → Better Auth migration

This branch replaces Clerk with [Better Auth](https://www.better-auth.com/) running inside Convex through
[`@convex-dev/better-auth`](https://labs.convex.dev/better-auth/framework-guides/next). This document covers
configuration, how existing accounts keep their data, the cutover runbook, rollback, and what is still
missing before production.

> **Status (2026-10-24):** implemented, unit/integration tested, and exercised end to end against an
> anonymous **local** Convex backend with Next.js development and production servers (see [Local runtime evidence](#9-local-runtime-evidence-2026-10-24-historical)).
> It is deployed to the isolated cloud preview in §12, where the user confirmed Google sign-in works.
> Production remains unchanged. No real Clerk export has been migrated. See
> [Missing configuration](#missing-configuration-and-open-gaps).
>
> **Current rollout: Google only.** Email/password sign-up, sign-in, password reset/change and email
> verification are built but **switched off** until `AUTH_EMAIL_PASSWORD_ENABLED=true` is set on the Convex
> deployment (see [§1a](#1a-current-rollout-google-only)). Resend/email delivery is **not** a prerequisite for
> the Google-only cutover.

## 1. What changed

| Area | Before (Clerk) | After (Better Auth) |
| --- | --- | --- |
| Identity provider | Clerk (hosted) | Better Auth component in Convex (`convex/convex.config.ts`, `convex/auth.ts`) |
| Auth routes | Clerk-hosted | `/api/auth/*` on this site, proxied to the Convex `.site` URL (`src/app/api/auth/[...all]/route.ts`) |
| Convex JWT issuer | `CLERK_JWT_ISSUER_DOMAIN`, template `convex` | Better Auth Convex plugin, issuer `CONVEX_SITE_URL`, audience `convex`, RS256 (`convex/auth.config.ts`) |
| Sign-in methods | Clerk UI | Native pages: `/sign-in`, `/sign-up` (both "Continue with Google" in the current rollout), `/account`; `/forgot-password` and `/reset-password` only point to Google until email/password is enabled |
| Google | Clerk social connection | Better Auth Google provider, **only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set on Convex**. The only sign-in method in the current rollout. |
| Email/password | Clerk | Better Auth (min 10, max 128 characters). **Dormant:** off unless `AUTH_EMAIL_PASSWORD_ENABLED=true` on Convex. |
| Email verification / password reset | Clerk emails | Better Auth + Resend, **only when email/password is enabled and `RESEND_API_KEY` and `AUTH_EMAIL_FROM` are set on Convex** |
| `/account` route guard | `clerkMiddleware` | `src/proxy.ts`: optimistic session-cookie check, redirect to `/sign-in?redirect=…` |
| Server routes | `auth()` from `@clerk/nextjs/server` | `getServerViewer()` / `getServerConvexToken()` in `src/lib/auth-server.ts` |
| Client hook | `useAuth()` wrapping Clerk | `useAuth()` backed by `AppAuthProvider` (same shape: `user`, `session`, `loading`, `getToken`, `promptSignIn`, `signOut`) |

`useAuth().getToken({ template: "convex" })` still works for the existing `ConvexHttpClient` calls; the
`template` option is ignored.

## 1a. Current rollout: Google only

`AUTH_EMAIL_PASSWORD_ENABLED` (Convex env) is the only switch for email/password. Anything other than exactly
`true` (unset, `1`, `yes`, `TRUE`, …) means Google only, **even when the Resend variables are set**.

While it is off (`convex/auth.ts`, `convex/authEnvironment.ts`):

* Better Auth runs with `emailAndPassword.enabled: false` and is given no reset-password or
  verification-email callbacks, so no auth email can be sent.
* Every email/password route answers **404**, for everyone, **including users who already have a password**:
  `/sign-up/email`, `/sign-in/email`, `/request-password-reset`, `/reset-password`, `/reset-password/:token`
  (the emailed link), `/change-password`, `/verify-password`, `/send-verification-email`, `/verify-email` and
  `/change-email`. Better Auth's `disabledPaths` refuses the literal paths before rate limiting, and a
  `hooks.before` check refuses them by route template, which also covers the dynamic reset-link path and
  direct `auth.api` calls. (`enabled: false` alone only stops email sign-up and sign-in in Better Auth
  1.6.) Better Auth's server-only `setPassword` has no HTTP route and is not called anywhere.
* Existing sessions, Google sign-in and linking, profile name updates, session listing/revocation and
  sign-out are unaffected. Account email and name come from the Google profile.
* `auth:capabilities` returns `{ emailPassword: false, google, emailDelivery: false,
  requireEmailVerification: false }`.
* UI: `/sign-in` and `/sign-up` show only **Continue with Google** (sign-up is the same Google flow), with no
  password fields, divider, "Forgot password" or "Create an account" link. Nothing but a loading line shows
  while capabilities load, so the password form never flashes. If Google is not configured, the pages say
  sign-in isn't available right now (no password fallback). `/forgot-password` and `/reset-password` explain
  that sign-in is Google-only for now and link to `/sign-in`; they contain no form. `/account` hides the
  Password section, the "Email and password" sign-in method, and email confirmation/resend controls; it keeps
  the profile, the email address, Google (connected / Connect Google), sessions and sign-out.
* App "Sign in" controls (`useAuth().promptSignIn`, `SignInLink`) go straight to Google in the same tab and
  return to the current page (or the control's explicit target), skipping `/sign-in`. They use `/sign-in`
  instead while capabilities are unknown, when email/password is enabled (so the visitor can choose), or when
  Google is not configured. A Google failure lands on `/sign-in?redirect=…&error=…`, which shows the message
  and never restarts OAuth on its own. `/sign-in` and `/sign-up` remain the manual and error entry points.

To enable email/password later: verify the sending domain in Resend, set `RESEND_API_KEY` and
`AUTH_EMAIL_FROM`, then set `AUTH_EMAIL_PASSWORD_ENABLED=true`, and run the email items of §8. With Resend
configured, new password accounts must confirm their address before signing in.

## 2. Ownership model (how existing data stays attached)

Every owned table already stores an owner key in a column named `clerkId` (or `requesterClerkId`,
`addresseeClerkId`, `createdByClerkId`). **Those columns and their indexes are unchanged; no content row is
rewritten.** The column now means "stable app user id":

* Legacy accounts keep their Clerk user id (`user_…`) as the owner key forever.
* Accounts created after cutover use their Better Auth user id as the owner key.

The `users` table gains `authUserId` (+ index `by_auth_user_id`), `authLinkedAt` and `authLinkSource`. At
runtime (`convex/utils.ts`):

1. Convex verifies the Better Auth JWT (signature, issuer, audience, expiry).
2. `getAuthenticatedAuthUserId` additionally requires the token's `sessionId` to name a **live, unexpired
   Better Auth session that belongs to the token's subject**. A signed-out, revoked or password-reset
   session therefore loses Convex access on its next request, not when the 15-minute JWT expires.
3. The Better Auth user id is looked up in `users.by_auth_user_id`; the row's `clerkId` is the owner key
   used by every query and mutation (`requireClerkId` / `getViewerClerkId`). Duplicate links make
   `.unique()` throw, so ambiguity fails closed.
4. Mutations use `requireClerkId` and throw `Unauthorized` without a live session. Public queries are live
   subscriptions that re-run the instant sign-out deletes the session, before the client unsubscribes, so
   they use `getViewerClerkId` and return an empty result (`[]`, `null`, or an empty workspace/account
   shape) — never another user's rows and never a throw into the UI.
   Shared-note reads also return `null` when access is lost; the page shows "Note unavailable" without
   exposing the note or crashing during sign-out.

A Better Auth user with no linked row owns nothing. `users:ensureCurrentUser` (called once by the client
after Convex accepts the token) creates a **new, separate** app user keyed by the Better Auth id. It never
attaches a sign-in to an existing row — not by email, not by any client-supplied value. The old
`users:upsertCurrentUser` is kept for stale clients but ignores its arguments.

Legacy accounts are linked **only** by the internal admin migration (`convex/authMigration.ts`), from an
operator-supplied Clerk id → email mapping. Admin status (`users.isAdmin`) lives on the legacy row, so it is
preserved once that row is linked.

Other hardening in this change:

* Only a **verified** email is copied onto `users.email` (used for friend lookup), so an unverified sign-up
  can't receive friend requests meant for someone else. `lookupUserByEmail` refuses to guess when an email
  matches more than one row.
* `chapterInsights:upsertChapterInsightBatch` is now an internal mutation (it was public and accepted any
  signed-in user). `scripts/processChapterInsightsBatch.mjs` no longer passes a fake `--identity`.
* Post-auth redirects only accept same-origin, path-absolute URLs (`src/lib/safeRedirect.ts`).
* Google may attach to an existing Better Auth user only when Google reports the address verified **and**
  the existing user's address is verified (`requireLocalEmailVerified: true`, Google is not a trusted
  provider). Linking a different email is disabled.

## 3. Configuration

### Convex deployment environment (`npx convex env set …`, per deployment)

| Variable | Required | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | **Yes** | Signs/encrypts Better Auth cookies and tokens. `openssl rand -base64 32`. Unique per deployment; rotating it signs everyone out. |
| `SITE_URL` | **Yes** | Public origin of the Next.js site, e.g. `https://versetogether.org` or `http://localhost:3000`. Auth requests are refused without it. |
| `AUTH_TRUSTED_ORIGINS` | No | Extra comma-separated origins allowed to call auth (e.g. a preview domain). |
| `AUTH_PROXY_SECRET` | **Yes** | Same value as on the Next.js server (at least 32 characters, `openssl rand -base64 32`). Verifies the client IP the auth proxy forwards (§4a). Without it auth still works, but every caller shares one rate-limit bucket per path. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **Yes** (current rollout) | Both must be set or Google stays hidden and disabled, and with email/password off nobody can sign in. |
| `AUTH_EMAIL_PASSWORD_ENABLED` | No — leave unset | Future switch. Only the exact value `true` enables email/password (§1a). Leave unset for the Google-only rollout. |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | Only with email/password | Not needed for Google only, and ignored unless `AUTH_EMAIL_PASSWORD_ENABLED=true`. Then they enable password reset and email verification, and **new email/password accounts must verify their address before signing in.** `AUTH_EMAIL_FROM` example: `Verse Together <no-reply@versetogether.org>` (domain must be verified in Resend). |
| `CLERK_JWT_ISSUER_DOMAIN` | Remove after cutover | No longer read. Keep it until rollback is no longer needed. |

`CONVEX_SITE_URL` is provided by Convex automatically and is the JWT issuer.

### Next.js environment (`.env.local`, Vercel)

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Yes | `https://<deployment>.convex.cloud` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Yes | `https://<deployment>.convex.site` (auth proxy target and server token helper) |
| `AUTH_PROXY_SECRET` | **Yes** | Server-only (never `NEXT_PUBLIC_`). Must equal the Convex value. |
| `AUTH_CLIENT_IP_HEADER` | Off Vercel | Name of a header the hosting edge **overwrites** with the connecting client's address (e.g. `cf-connecting-ip`). On Vercel (`VERCEL=1`) it defaults to `x-real-ip`. Never name a header clients can set. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, other `CLERK_*` | Remove after cutover | Unused by this code. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Not used | Google is configured server-side on Convex; nothing reads this variable. |

### Google OAuth client

In Google Cloud Console → APIs & Services → Credentials, use a **Web application** OAuth client:

* Authorized JavaScript origins: `https://versetogether.org` (and `http://localhost:3000` for local dev).
* Authorized redirect URIs: **`https://versetogether.org/api/auth/callback/google`** (and
  `http://localhost:3000/api/auth/callback/google`). The pattern is `${SITE_URL}/api/auth/callback/google`.
* OAuth consent screen: app name, support email, `email`/`profile`/`openid` scopes; publish it (or add test
  users) before launch.
* Put the client id and secret on the **Convex** deployment (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

If Clerk used its own shared development Google credentials, those cannot be reused; create a client.
Google account ids are not needed for migration: Better Auth links by verified email (see §5).

### Code generation

`convex/_generated/*` is produced by the Convex CLI against a deployment; it was regenerated by real codegen
against the local backend (§9). Do not edit it by hand; rerun `npx convex dev`/`npx convex codegen` after
changing Convex modules and commit the result.

## 4. Sessions, tokens and revocation

* Better Auth session: 7 days, extended when used after 1 day (library defaults). Cookies are first-party on
  the site domain via the `/api/auth` proxy.
* Convex JWT: RS256, 15-minute lifetime, issued by `/api/auth/convex/token`, cached client-side until about a
  minute before expiry.
* Every Convex function re-checks the session row (§2), so sign-out, "Sign out other devices", and (once
  email/password is enabled) password change (`revokeOtherSessions: true`) and password reset
  (`revokeSessionsOnPasswordReset: true`) take effect on the next Convex call.
* `src/proxy.ts` only checks that a session cookie exists (fast redirect for `/account`). It is not an
  authorization boundary; Convex is.
* After provisioning, the client keeps a live `users:viewer` subscription: admin status and legacy links
  update without a reload, and `user` is withdrawn as soon as the server stops recognising the session
  (signed out or revoked on another device) rather than when the JWT next refreshes.
* Server routes (`/api/citations` POST, `/api/insights/*`, `/api/feedback`, `/resources/manage`) obtain a token
  from the request cookies and ask Convex (`users:viewer`) who the caller is and whether they are an admin.

## 4a. Rate limiting and client IP

Better Auth's rate limiter is **enabled explicitly** in `convex/auth.ts` (by default it is on only when
`NODE_ENV=production`, which should not be relied on inside the Convex runtime). Its default in-memory store does not persist between
Convex HTTP actions, and its `"database"` store needs an adapter method (`incrementOne`) the Convex adapter
lacks, so counts are kept in the app table `authRateLimits` by one internal mutation per request
(`convex/authRateLimit.ts`). Convex mutations are serializable, so concurrent requests cannot overshoot.

Rules (fixed windows that start at the first request; requests over the limit get **HTTP 429**, body
`{"message":"Too many requests. Please try again later."}`, header `X-Retry-After` = seconds until the window
closes; refused requests do not extend the window):

| Path (under `/api/auth`) | Limit |
| --- | --- |
| `/sign-in/*`, `/sign-up/*`, `/change-password`, `/change-email` | 3 per 10 s |
| `/request-password-reset`, `/send-verification-email` | 3 per 60 s |
| `/get-session`, `/convex/token`, `/convex/jwks`, `/convex/.well-known/openid-configuration` | not limited |
| everything else | 100 per 10 s |

In the Google-only rollout the email/password routes in this table answer 404 instead (§1a); the literal
paths are refused before they are counted.

The excluded routes are reads guarded by high-entropy tokens, and the token/JWKS routes are also called
server-to-server (Next.js server rendering, Convex fetching its signing keys) without a client IP; a shared
bucket there would let anyone lock everybody out.

Buckets are keyed by SHA-256 of Better Auth's `ip|path` key (no IPs stored). Opening a new window deletes up
to 16 expired buckets, so the table stays near the number of live windows.

**Trust boundary.** Convex HTTP actions cannot see the socket address, and the `.convex.site` URL is public,
so any `X-Forwarded-For` arriving there may be forged. Instead (`convex/authProxy.ts`):

1. The Next.js proxy (`src/app/api/auth/[...all]/route.ts`) drops any caller-supplied `x-verse-client-ip*`
   headers, reads the client IP from a header its edge overwrites (`AUTH_CLIENT_IP_HEADER`, or `x-real-ip` on
   Vercel; a single valid address only), and signs `ip + method + path + timestamp` with HMAC-SHA256 using
   `AUTH_PROXY_SECRET`.
2. `convex/http.ts` verifies the signature (constant-time, ±60 s) before Better Auth sees the request, and
   strips the IP header if it does not verify. Better Auth reads **only** that header
   (`advanced.ipAddress.ipAddressHeaders`); `X-Forwarded-For` is ignored.
3. Requests without a valid signature — anyone calling the Convex site directly, or a misconfigured proxy —
   have no IP and share one bucket per path. They cannot spend a real visitor's allowance, and rotating forged
   IP headers does not create fresh buckets.

Limits: visitors behind one NAT share a bucket; IPv6 addresses are grouped by /64 (Better Auth default). A
missing `AUTH_PROXY_SECRET` or trusted IP header logs an error once per instance and degrades every visitor to
the shared bucket (3 sign-ins per 10 s site-wide), so set both before launch.

## 5. Existing-user migration

### Who needs what

During the Google-only rollout, a migrated (pre-created) account can be reached **only by signing in with a
Google account whose verified email is the same address**. Nobody can set or reset a password yet.

| Legacy Clerk account | After migration (`--create-missing`) | What the person does now (Google only) |
| --- | --- | --- |
| Google sign-in | Better Auth user pre-created with their verified email, linked to their Clerk id | **Continue with Google.** Google's verified email matches the verified local user, so Better Auth attaches the Google account and they land in their existing data. Requires Google configured. |
| Email + password, and the address is also a Google account (e.g. Gmail or Google Workspace) | Same, but with **no password** (Clerk password hashes are not imported) | **Continue with Google** with that address, as above. |
| Email + password, and there is no Google account with that address | Same | **Must wait for email/password support.** They cannot sign in to their legacy data until `AUTH_EMAIL_PASSWORD_ENABLED=true` and Resend are live, then use **Forgot password** once. Signing in with a different Google address creates a separate, empty account (the legacy data is not attached). |
| Both | Same | Continue with Google. |
| Clerk email unverified | Refused (`legacy_email_unverified`) | Operator handles manually. |
| Signed up fresh on Better Auth before being migrated, no content yet | Their empty new app user is retired and the Better Auth user is linked to the Clerk id | Nothing; their old data appears. |
| Same, but they already created content in the new account | Refused (`provisional_account_has_data`, lists tables) | Operator decides (e.g. ask the person; there is no automatic merge). |
| Someone registered the address but never verified it | Refused (`existing_auth_user_unverified`) | Operator deletes that unverified Better Auth user or has it verified, then re-runs. |

While an account is unlinked, a person who signs in with the same **verified** email sees a notice on
`/account` that an earlier account exists and has not been moved yet. Nothing is linked automatically.

### Mapping file

Produced by the operator from a trusted Clerk export (Dashboard → Users → Export, or the Backend API). This
repository does **not** call Clerk.

```json
{
  "entries": [
    { "legacyClerkId": "user_2abc…", "email": "alice@example.com", "emailVerified": true, "name": "Alice Smith" }
  ]
}
```

`npm run auth:migrate -- convert-clerk-csv --in clerk-users.csv --out .auth-migration/mapping.json` converts a
Clerk CSV export. It requires `id` and `primary_email_address` columns and marks an entry verified only when the
primary address appears in `verified_email_addresses`; check the column names of your actual export first.
Password digests in the export are never read. Keep mapping files and reports in `.auth-migration/`
(git-ignored); they contain email addresses.

### Commands

All commands call internal Convex functions with `npx convex run`, so they need deployment credentials
(`CONVEX_DEPLOYMENT` for dev, `CONVEX_DEPLOY_KEY`/`--prod` for production). Nothing here is reachable from a
browser.

```bash
# Dry run: per-entry plan and summary; writes <file>.plan-report.json (mode 600)
npm run auth:migrate -- plan  --file .auth-migration/mapping.json --create-missing [--prod]

# Apply: re-plans everything, refuses if any entry errors, then applies in atomic batches of 50
npm run auth:migrate -- apply --file .auth-migration/mapping.json --create-missing [--prod] --yes

# Status: totals, unlinked legacy ids, admins and whether they are linked, duplicate links
npm run auth:migrate -- audit [--prod] [--out .auth-migration/audit.json]

# Undo one link (dry run unless --yes)
npm run auth:migrate -- unlink --legacy-id user_2abc… [--prod] [--yes]
```

Properties: batches are all-or-nothing; re-running is idempotent (`already_linked`); a batch rejects
duplicate ids or emails; unknown Clerk ids are refused unless that id actually owns content; no content row
is modified; the only deletion is an empty provisional `users` row, re-checked inside the same transaction.
"Owns content" means a row in any owner-keyed table listed in `convex/ownership.ts`, including the Notes
journal's append-only reading history (`readingLogs`); a new owner-keyed table must be added there too.

## 6. Cutover runbook

Changing `convex/auth.config.ts` makes Convex stop accepting Clerk tokens the moment it is deployed, so the
Convex functions and the Next.js app must go out together. Do a full rehearsal on a dev or preview
deployment first.

1. **Prepare (no user impact):** create the Google OAuth client; generate `BETTER_AUTH_SECRET` and
   `AUTH_PROXY_SECRET`; export Clerk users and build the mapping file. Resend is **not** needed for the
   Google-only cutover. (Status: the dev deployment has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set,
   checked by name only; it still needs `SITE_URL`, `BETTER_AUTH_SECRET` and `AUTH_PROXY_SECRET`, and the
   Next.js server needs the matching `AUTH_PROXY_SECRET`. This branch has not been deployed there.)
2. **Back up:** `npx convex export --prod --path backups/pre-better-auth.zip` (store securely; contains user data).
3. **Configure production Convex env:** `BETTER_AUTH_SECRET`, `SITE_URL`, `AUTH_PROXY_SECRET`, `GOOGLE_*`.
   Leave `AUTH_EMAIL_PASSWORD_ENABLED` unset. Add `NEXT_PUBLIC_CONVEX_SITE_URL` and the same `AUTH_PROXY_SECRET`
   to Vercel.
4. **Deploy together:** deploy Convex (`npx convex deploy`, or Vercel's build command
   `npx convex deploy --cmd 'npm run build'`) and the Next.js app from the same commit. Index backfills for the
   new indexes run during deploy.
5. **Migrate immediately:** `plan` then `apply --create-missing --prod --yes`. Link admin accounts first and
   confirm with `audit` that every admin shows `linked: true`.
6. **Verify** (see §8) with a migrated test account, a new account, and an admin account.
7. **Tell users:** sign in with **Continue with Google** using the Google account for the same email address
   they used before. People whose old address has no Google account must wait for email/password support;
   do not tell anyone they can reset a password yet. Check `audit` and the mapping to know who that affects.
8. **Later:** run `audit` until `legacyUnlinked` is acceptable; then remove Clerk env vars and close the Clerk
   instance (after the rollback window).

## 7. Rollback

* **One account linked wrongly:** `unlink --legacy-id … --yes`. The Better Auth user and all content stay; that
  sign-in stops resolving to the legacy data. Re-link with a corrected mapping.
* **Whole cutover:** redeploy the previous Clerk-based app and Convex functions **but keep this branch's
  `convex/schema.ts` additions and the `betterAuth` component in `convex/convex.config.ts`.** The new fields
  are optional and the indexes additive, but Convex rejects a schema that no longer declares fields present
  on existing rows, and unmounting the component would drop the Better Auth tables. Restore
  `CLERK_JWT_ISSUER_DOMAIN` and the Clerk keys.
  * Legacy users get everything back, including content created during the Better Auth period (it was written
    under their Clerk id).
  * Accounts created after cutover are keyed by Better Auth ids and are unreachable under Clerk until you
    roll forward again. Nothing is deleted.
* **Last resort:** restore the step-2 export (`npx convex import --replace`). This discards everything written
  since the export and needs explicit approval.

## 8. Verification checklist

Automated (this branch): `npm run test:convex` (Google-only default with and without Resend, every
email/password route refused even for an existing password user, Google authorize URL state and PKCE,
identity resolution, session revocation — including private
live queries going empty rather than throwing while writes stay `Unauthorized` — cross-user isolation,
every migration path, rate-limit storage and pruning, signed client IP, and HTTP 429s through the real Better
Auth handler in email/password mode, plus the Notes journal and reading-history suites, which run through
the same live-session and linked-owner checks via `tests/convexAuthHarness.ts`), `npm run test:auth` (redirect safety, error mapping, Clerk CSV conversion), `npx tsc --noEmit`,
`npm run build`.

Manual, on a configured deployment (current Google-only rollout):

- [ ] `/sign-in` and `/sign-up` show only Continue with Google (no password form, even briefly while loading).
- [ ] Continue with Google (new account) lands back on the page you came from; sign out; `/account` redirect when signed out and back after sign-in.
- [ ] Migrated test user whose legacy email is their Google address: Continue with Google lands in the legacy notes/plans/highlights.
- [ ] `/forgot-password` and `/reset-password?token=x` show the Google-only notice and no form; `POST /api/auth/sign-in/email` answers 404.
- [ ] `/account`: profile, email, Google method, sessions and sign-out; no Password section or email confirmation controls.
- [ ] Admin: `/resources/manage` loads and `POST /api/citations` succeeds; a non-admin gets 403.
- [ ] Revoke "other devices" and confirm the other browser loses Convex data on its next action.
- [ ] Guest browsing, reading, search and Come Follow Me pages work signed out.

Later, after enabling email/password (`AUTH_EMAIL_PASSWORD_ENABLED=true` plus Resend):

- [ ] Sign up with email/password; confirm the verification email arrives and the link signs you in.
- [ ] Sign in, wrong password message, Forgot password → email → reset → other sessions signed out.
- [ ] Connect Google from `/account` on a verified password account.
- [ ] Migrated password-only test user: Forgot password lands in the legacy data.

## 9. Local runtime evidence (2026-10-24, historical)

> **Historical.** Recorded before the switch to the Google-only rollout, when email/password was always on.
> The email/password flows below are now off by default and were exercised in that earlier configuration.
> Checks of the Google-only change are recorded separately in §10.

Tested revision: `5f27da5` plus this branch's uncommitted migration changes, Node.js 24.21.0.
Environment: anonymous local Convex backend (`http://127.0.0.1:3211`, site `:3212`) and Next.js development
and production servers on `http://127.0.0.1:3199`, with a locally generated `BETTER_AUTH_SECRET`/`AUTH_PROXY_SECRET` and
`SITE_URL=http://127.0.0.1:3199` set only on that local backend. Nothing cloud or production was touched.

| Check | Result |
| --- | --- |
| Real `convex codegen`, Convex typecheck, local deployment of all functions and the `betterAuth` component | Passed |
| HTTP through the Next proxy: `/api/auth/ok` 200; email sign-up; session cookie and `get-session`; `convex/token` JWT; `ensureCurrentUser`; private preferences write and read back | Passed |
| Sign-out, then the same unexpired JWT is refused by `users:viewer` and the preferences write | Passed |
| Wrong password 401, correct password 200; signed-out `/account` 307 to sign-in; signed-out `POST /api/citations` 401 | Passed |
| Rate limit: 4 concurrent bad sign-ins from one signed IP → `401, 401, 401, 429`; another signed IP still 401; direct Convex-site calls rotating forged `x-verse-client-ip`/`x-forwarded-for` → `401, 401, 401, 429` (local-only `AUTH_CLIENT_IP_HEADER` stood in for an edge header) | Passed |
| Google authorize URL with temporary dummy credentials: `accounts.google.com`, callback `http://127.0.0.1:3199/api/auth/callback/google`, `state` and PKCE present (redirect not followed; dummy values removed afterwards) | Passed |
| Migration CLI rehearsal on a disposable local fixture (legacy admin + preferences): `plan`, `apply --create-missing`, `audit` → `legacyLinked 1`, `legacyUnlinked 0`, admin `linked: true`, `duplicateLinks 0`; re-running `plan` → `already_linked 1` | Passed |
| Browser (Chrome): native sign-up with a disposable account, signed-in account menu, `/account` Profile/Email/Password/Sign-in methods/Sessions, display-name edit saved and reflected in the header | Passed |
| Revoked-session regression: private subscriptions return empty results; shared private notes return `null`; cross-user access remains denied and writes still reject revoked tokens | Passed, Convex regression test |
| Final production browser flow: sign-out returns to signed-out browsing; email/password sign-in returns to `/account`; account methods and sessions load; no new console errors | Passed |
| Browser sign-out while the local frontend is stopped: error displayed, account retained and button available to retry | Passed |
| `npm run test:convex` and `npm run test:auth` | Passed, 37 + 12 tests |
| Existing `npm run test:cfm`, `npm run test:ai-insights`, and `npm run cfm:check` | Passed, 110 + 11 tests and content checks |
| `npx tsc --noEmit` and `npx tsc --noEmit -p convex/tsconfig.json` | Passed |
| `npm run build` with the isolated local Convex configuration | Passed, all 81 static pages generated |
| Focused lint of auth modules/components and the shared-note page using a temporary compatible Next.js flat config | Passed |
| Repository `npm run lint` | Blocked by the pre-existing FlatCompat/eslint-config-next configuration crash |

One transient `GET /api/auth/get-session` 500 (`SyntaxError: Unexpected end of JSON input`) occurred while the
dev server was recompiling during edits; a reload recovered. It did not reproduce during the final cold
production-server flow; its exact hot-reload cause was not established.

## 10. Google-only rollout checks (2026-10-24)

Tested revision: `5f27da5` plus this branch's uncommitted changes including the Google-only switch, Node.js
24.21.0, in the task worktree. Independent checks also used the isolated anonymous local Convex backend
and a production Next.js server on port 3199. Nothing cloud was touched.

| Check | Result |
| --- | --- |
| `npx vitest run` (`npm run test:convex`), including the new `tests/convex/authRollout.test.ts` (Google-only capabilities with and without Resend; all ten email/password routes return 404 for an existing password user with a live session, with no Resend call, the session intact and the password unchanged; Google authorize URL: client id, `${SITE_URL}/api/auth/callback/google`, `prompt=select_account`, scopes, fresh `state` bound to a cookie and a stored verifier whose SHA-256 matches the S256 `code_challenge`; the routes work again with `AUTH_EMAIL_PASSWORD_ENABLED=true`) and new `authEnvironment` cases (only exactly `true` enables email/password) | Passed, 48 tests in 6 files |
| Same suite with the `hooks.before` check removed | Failed as expected (`/reset-password/:token` reachable); with only `disabledPaths` or `enabled: false` removed it still passes, since the hook covers every route |
| `npm run test:auth` | Passed, 12 tests |
| `npx tsc --noEmit` and `npx tsc --noEmit -p convex/tsconfig.json` | Passed |
| Focused lint of the changed auth modules, pages and tests (temporary compatible flat config) | Passed |
| `npm run build` against the isolated local Convex configuration | Passed, all 81 static pages generated |
| Local HTTP checks: Google-only capabilities, all ten email/password routes blocked with 404, Google authorization URL with callback/state/PKCE | Passed, dummy Google configuration only; no external redirect followed |
| Production browser: sign-in and sign-up show Google only; forgot/reset-password pages contain no credential inputs | Passed |
| Production browser account page: password methods, controls and verification actions hidden; profile, Google, sessions and sign-out retained | Passed, disposable existing-password session created locally before disabling email/password again; no console errors |
| Production browser with Google configuration removed: unavailable notice and no password fallback | Passed |
| Real Google sign-in and callback | Not run; requires the real OAuth client and a deployed backend |

## 11. Sync onto current `origin/dev` (2026-10-24)

The uncommitted migration was moved from `5f27da5` onto `origin/dev` `b241aec` (fast-forward, then the
saved changes re-applied; nothing committed). Dev added the Notes journal (`convex/noteJournal.ts` rules,
new endpoints in `convex/insights.ts` and `convex/readingProgress.ts`, the `readingLogs` table) and the new
header/reader UI. Changes made while merging:

* Every new endpoint resolves its owner through `requireClerkId` / `getViewerClerkId`. `insights:listMyJournal`
  was a throwing query and now returns `[]` without a live linked session, like the other private reads.
* `readingLogs` is an owned table for the migration (§5): a provisional account with only reading history is
  not retired, and a legacy id owning only reading history is accepted as a real legacy owner.
* The Notes sign-in prompt is a native link to `/sign-in?redirect=%2Fnotes`. Clerk is gone from the code.
* The two Vitest configs are merged into `vitest.config.ts` (all of `tests/**/*.test.ts`). The incoming
  journal tests now sign in with real Better Auth sessions linked to the legacy-style owner keys, not a bare
  JWT subject.
* Browser review found the native account menu clipped by the new navigation's `overflow-x: clip`.
  It now renders in an anchored, fixed-position portal, with outside-click and keyboard dismissal, and
  closes when a resize or scroll hides its trigger.

Tested revision: `b241aec` plus uncommitted changes, Node.js 24, task worktree, no cloud target.

| Check | Result |
| --- | --- |
| `npx vitest run` (auth, rollout, rate limit, proxy, migration, journal, reading history, Notes UI models) | Passed, 118 tests in 14 files |
| New regressions: bare subject without a session, unlinked Better Auth user, revoked session (journal, reading log, progress, last position go empty; all journal/reading writes `Unauthorized`; content kept; a new session restores it), cross-user journal and reading isolation, `readingLogs`-only provisional and legacy migration cases | Passed; with `listMyJournal` back on `requireClerkId` and `readingLogs` removed from `ownership.ts`, 5 fail as expected |
| `npm run test:auth`, `test:cfm`, `test:browse`, `test:ai-insights` | Passed, 12, 119, 34, 11 tests |
| `npx tsc --noEmit` and `npx tsc --noEmit -p convex` | Passed |
| ESLint (dev's flat config, no FlatCompat crash) on every changed or new file | Every file at or below its `origin/dev` error count; new auth files clean. Remaining errors are existing `no-explicit-any` debt |
| `npx convex codegen` against the anonymous local deployment | Passed |
| `npm run build` | Passed, 83 static pages (root's verification on the synced tree) |
| Independent rerun: `npx vitest run tests/journal.test.ts tests/convex/auth.test.ts` | Passed, 37 tests |
| Final production build after the account-menu repair; focused AccountControl ESLint and app TypeScript | Passed; 83 static pages |
| Local HTTP: session read and Google authorization | Passed, both 200; expected callback and S256 PKCE. Dummy Google configuration, no external redirect followed |
| Production browser: Google-only sign-in; account password controls hidden; create, edit, save and reload a journal note | Passed against the anonymous local backend; exact Markdown confirmed in Convex |
| Production browser: desktop account menu clipping, Tab order, Escape focus, mobile breakpoint and mobile menu bounds | Passed; the formerly clipped point hits the menu; resizing to mobile withdraws the hidden dock's menu |
| Production browser: sign out from an open journal note, then revisit Notes | Passed; no client exception, session endpoint returns 200/null, private note withdrawn and sign-in prompt shown |

Browser checks used a disposable local existing-password session, created with the email switch briefly
enabled and tested after switching back to Google-only. The switch and dummy Google settings were removed
afterward. The local frontend and backend were stopped. No shared development or production code or
environment was changed. The existing Vercel preview still targets a Clerk backend without the new auth
functions, so its reported `auth:capabilities` error needs a coordinated backend deployment and matching
Next.js auth settings; syncing source alone does not repair that deployment mismatch.

## 12. Isolated cloud preview (2026-10-24)

Created and deployed an empty preview for Git branch `t3/migrate-clerk-to-better-auth`:

* Dashboard: https://dashboard.convex.dev/t/isaac-cochran/verse-together/deafening-sandpiper-172
* Client endpoint: `https://deafening-sandpiper-172.convex.cloud`
* HTTP/auth endpoint: `https://deafening-sandpiper-172.convex.site`
* Convex reference: `preview/t3-migrate-clerk-to-better-auth`; expires October 28, 2026 (four days after creation).

The preview has its own generated Better Auth and proxy secrets, Google credentials copied privately from
the development deployment, and email/password left disabled. No application data was imported. Deploy used
a verified preview-only key with a one-hour expiry. Shared development and production were not modified.
Cloud checks passed: `auth:capabilities` returns Google=true/emailPassword=false; session reads return 200/null;
Google authorization returns 200 with state and S256 PKCE.

The matching Vercel deployment is ready:

* Stable preview: https://verse-together-better-auth-preview.vercel.app
* Inspect: https://vercel.com/notakerbals-projects/scriptures-sharing/BirM2tw9EnmW9DjYNUAaRCMBb49C
* Deployment: `dpl_BirM2tw9EnmW9DjYNUAaRCMBb49C`, Preview target, current uncommitted tree on `b241aec`.

The connector rejects branch-scoped environment settings while the branch is unpublished, so the CLI
deployment uses environment overrides scoped to this deployment: both public Convex URLs and the matching
proxy secret. Nothing was pushed and no other preview settings changed. The stable alias matches Convex
`SITE_URL`; use that alias for Google sign-in rather than the deployment's unique hostname.

| Hosted check | Result |
| --- | --- |
| Vercel build | Passed, Ready; `npm run build`, no automatic Convex push |
| Session endpoint through Next.js | Passed, 200/null with short-lived development OIDC authentication |
| Sign-in HTML through Next.js | Passed, 200; client-side browser rendering remains behind Vercel login |
| Google authorization through Next.js | Passed, 200; expected callback, state and S256 PKCE |
| Vercel runtime error logs for this deployment | None found during verification |
| Google callback registration | Initially blocked by `redirect_uri_mismatch`; user subsequently confirmed Google sign-in works |

The Google Cloud OAuth client uses this exact Authorized redirect URI:
`https://verse-together-better-auth-preview.vercel.app/api/auth/callback/google`.
The user subsequently confirmed Google sign-in works. Agent browser automation has not completed consent;
the browser preview retains existing Vercel Authentication protection and opened its Vercel login screen.

Cleanup pending: `vercel curl` unexpectedly generated a project automation bypass token before failing
because the local curl executable is missing. Subsequent checks used short-lived OIDC instead. Automatic
approval review rejected fetching the bypass cleanup metadata because it may contain access secrets;
revocation of only that newly generated token requires user approval. No bypass value was printed.

## 13. Direct Google sign-in (2026-10-24)

On Google-only deployments, app Sign in controls now start Google OAuth in the same tab without first
visiting `/sign-in`. The shared action preserves the current path, query and hash (or an explicit control
target), rejects duplicate clicks, and resets when the browser restores the page from its back/forward
cache. Email-enabled deployments retain the method chooser. Provider/network errors use the manual
sign-in page with a safe return URL and an error message; that page never automatically restarts OAuth.

Tested on `b241aec` plus uncommitted changes, Node.js 24:

| Check | Result |
| --- | --- |
| Auth unit tests | Passed, 19/19, including 7 direct-routing/error regressions |
| Full Vitest suite (implementation agent) | Passed, 118/118 in 14 files |
| App TypeScript and focused ESLint (independent rerun) | Passed |
| Local browser with the real preview backend rejecting localhost origin | Passed: error fallback preserves query/hash; visible error and manual Google retry; no OAuth loop |
| Local browser with an isolated simulated successful auth response | Passed: one Google start request despite repeated clicks, callback path/query/hash preserved, busy/disabled controls, same tab navigates to accounts.google.com |
| Vercel preview build | Passed, READY; Next.js 16.1.6, about 53 seconds; existing alias switched to `dpl_BirM2tw9EnmW9DjYNUAaRCMBb49C` |
| New real Google consent/callback after this UI change | Not run by agent; the user confirmed the preceding preview flow works |

The browser fixture and task-owned local frontend were stopped after verification. No Convex code or
environment change is needed for this frontend update.

## 14. Shared development rollout

The development target is `fabulous-dogfish-606` and its existing site is
`https://scripture-sharing-dev.vercel.app`. Vercel's `dev` branch is a Preview environment; production is a
separate target and is not part of this rollout. The current reader/guide changes from `dev` `7fcb76f`
were integrated before release; the combined tree passed 118 Vitest tests, 19 auth tests, and both app and
Convex TypeScript checks.

Development configuration is scoped as follows:

* Convex dev has its own `BETTER_AUTH_SECRET`, `AUTH_PROXY_SECRET`, and
  `SITE_URL=https://scripture-sharing-dev.vercel.app`, alongside its existing Google credentials.
* Vercel Preview overrides on **Git branch `dev` only** select `fabulous-dogfish-606` for both public Convex
  URLs and provide the matching proxy secret. Other Preview branches and Production do not inherit them.
* The Google OAuth client must allow
  `https://scripture-sharing-dev.vercel.app/api/auth/callback/google` before switching the dev aliases.
* Build the frontend first, then deploy the reviewed Convex functions explicitly to this development
  deployment and switch the development aliases. The repo build command does not deploy Convex.
* Existing Clerk sessions will require Google sign-in. Existing content is retained under its original
  owner IDs; accessing legacy content still requires an explicit verified mapping from §3. No Clerk
  accounts or content are automatically linked by email during deployment.

**Callback URL correction.** A live smoke test on dev found that `POST /api/auth/sign-in/social` returned
403 `INVALID_CALLBACK_URL` for `callbackURL=/notes?authcheck=1#return`. Better Auth 1.6 accepts a relative
callback URL only if it avoids characters such as `#`, `:` and `!`. It also skips this check when
`NODE_ENV=test`, so the §13 simulated response and the unit tests did not catch the problem. The app now sends
Google and sign-up return URLs as absolute same-origin URLs (`appURL` / `socialCallbackURLs`). Each is built
from the browser's `location.origin` plus a path that has already passed `safeReturnPath`. The backend's
trusted-origin validation is unchanged. `tests/convex/authCallbackUrls.test.ts` runs the real handler with
`NODE_ENV=production`.

The rollout result and deployed revision are recorded in the release PR.

## Missing configuration and open gaps

* **Shared development configuration:** prepared as described in §14; its Google redirect URI must be
  registered before cutover. Production configuration has not been verified. Email delivery is not needed
  for the Google-only rollout.
* **Legacy password-only users without a Google account at the same address cannot reach their data** until
  email/password and Resend are enabled. The migration still pre-creates and links their accounts, so they
  will be able to use Forgot password then.
* **User confirmed:** Google sign-in on the isolated preview. Agent automation has not completed a real
  Google consent flow or Connect Google; email flows with Resend remain dormant and untested.
* Enabling email/password with Resend also turns on required verification: password accounts created while
  delivery was off (only in the earlier always-on local testing) are unverified and will be asked to confirm
  their email at their next sign-in.
* **Preview HTTP verification is recorded in §12.** The user confirmed Google sign-in works; production
  client-IP behavior has not been tested.
* **No Clerk export performed;** the migration was rehearsed only on a local fixture. The CSV column names
  assumed by `convert-clerk-csv` must be checked against a real export.
* **Clerk password hashes are not imported.** Importing bcrypt digests via a custom
  `emailAndPassword.password.verify` is possible but not implemented.
* Not implemented: account deletion, changing email address, unlinking Google, 2FA.
* `@convex-dev/better-auth` 0.12's `AuthClient` type rejects better-auth ≥ 1.6.18's client type; a single cast in
  `src/components/AppProviders.tsx` bridges it (better-auth 1.6.17 typechecks without it).
* Pre-existing, unrelated: `npm run lint` now runs (dev replaced the crashing FlatCompat config) but reports
  existing `no-explicit-any` errors in files this change didn't introduce;
  `npm run build` without `NEXT_PUBLIC_CONVEX_URL` fails prerendering because `InsightBuilderProvider` calls
  `useQuery` outside a Convex provider.
