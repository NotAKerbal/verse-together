# Native desktop accounts on development

This additive change enables the Rust desktop app's browser approval and field-level study sync on the shared
development deployment. Isaac authorized the dev rollout and desktop sign-in/sync testing. Production is a separate
release decision. The mobile owner confirmed this thread owns the next dev/backend write; mobile sign-in and
account deletion must remain compatible with Android 1.0.4.

## Scope

- Keep mobile `nativeSignIn(ctx)`, `/native-sign-in/exchange`, account deletion, schema and cleanup unchanged.
- Add desktop `nativeAppAuth(ctx)`: a cookie-authenticated, trusted-origin `/native/grant` creates a short-lived,
  hashed, one-use PKCE approval. `/native/token` exchanges it for a separate desktop session. Neither endpoint
  approves accounts with deletion pending. An exchange rechecks account availability and revokes a newly created
  session if deletion started meanwhile. The approval page also shows the pending-deletion state.
- Keep the full Better Auth bearer plugin absent: Convex already supplies its request hook, and the full plugin
  would expose website session tokens through a script-readable response header.
- Add `nativeSync` atomic field-specific verse writes, revision-checked journal saves, idempotent deletes and reading
  removal. Existing owner/session checks refuse writes once deletion removes the app user.
- Return `markdownRevision` from `createJournalEntry` without changing its arguments. Existing clients can ignore it.
- Add `/native/authorize`. The Rust/Tauri apps, packages, assets and desktop build hooks are excluded from this PR.

No new schema, index, package dependency or environment variable is required. Existing auth configuration and signed
proxy client-IP rate limits remain in use. Codes, sessions and secret configuration must never be printed in logs.

## Deployment and checks

1. Review combined desktop/mobile/deletion/sync tests, full Vitest, root and Convex typechecks and changed-file lint.
2. Merge the reviewed PR to `dev`. The existing guarded Vercel Git build must deploy only
   `dev:fabulous-dogfish-606`, then publish `https://scripture-sharing-dev.vercel.app` from the same commit. Verify
   the exact commit, target, backend success and Ready status in build logs. No manual concurrent backend writer.
3. Run the release Rust app with a fresh profile:

   ```sh
   VERSE_TOGETHER_SITE=https://scripture-sharing-dev.vercel.app \
   VERSE_TOGETHER_CONVEX_URL=https://fabulous-dogfish-606.convex.cloud \
   ./verse-together --data-dir /tmp/verse-dev-acceptance
   ```

4. Check real Google sign-in → correct-account approval → loopback return → scoped keyring session; cancel/decline;
   one-use codes; app sign-out preserving the website session. Do not claim Google QA from email test fixtures.
5. Check marks, verse notes, journal creation/edit/delete, readings, goals, guide marks and plan creation/edit/delete
   both ways with the dev website. Verify word-range anchors and nonconsecutive verse links. Test an offline edit
   conflict and keep both versions. Preserve personal study and unrelated sessions during QA.
6. Re-run mobile auth/deletion contracts. Confirm mobile exchange and account deletion routes have not changed.
7. Record Passed/Failed/Blocked/Not run separately. Production remains untouched until separately authorized.

## Recovery

Old web/mobile clients remain compatible with the additive backend. To disable new desktop approvals, remove only
`nativeAppAuth(ctx)` from the dev auth plugin list; preserve the mobile plugins. Existing desktop sessions can be
revoked independently. A frontend rollback does not roll Convex back. Prefer a reviewed forward fix; do not restore
a database snapshot or remove existing shared tables after new study writes.
