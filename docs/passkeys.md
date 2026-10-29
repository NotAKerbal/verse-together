# Passkeys

Web users can register a passkey under Account → Passkeys after signing in with Google or another existing method. The sign-in page offers an explicit passkey button. Registration requires a fresh authenticated session; it does not create a new account. Keep an existing sign-in method available for account recovery.

The web client and Convex auth server use `@better-auth/passkey` on the same 1.6 version line as Better Auth. Native clients retain their existing authentication flows.

## Domain and rollout

`SITE_URL` on the Convex deployment supplies both the exact allowed WebAuthn origin and the relying-party hostname. Use the canonical HTTPS site URL in hosted environments, or `http://localhost:<port>` for local development. Passkeys registered on one hostname do not work on unrelated hostnames. Additional `AUTH_TRUSTED_ORIGINS` do not expand passkey verification origins; use the canonical site for passkey enrollment and sign-in. Changing its hostname requires users to enroll again.

Deploy the backend and frontend together. The local component at `convex/betterAuth` retains the `betterAuth` component name and all original tables and indexes from `@convex-dev/better-auth` 0.12.5, adding only `passkey`. Do not delete or rename the component when deploying. Existing account records remain in place. The schema snapshot must be reviewed alongside future Convex Better Auth upgrades.

Run `npx convex codegen` in a configured checkout before backend deployment. The component API types in `convex/betterAuth/_generated` are generated from the local adapter exports. Component adapter options include the passkey schema for reference and uniqueness metadata; runtime authentication configuration lives in `convex/auth.ts`.

Account deletion explicitly removes the user's passkeys in bounded batches before deleting their account. The plugin handles session checks, signed one-time challenges, credential ownership, origin/RP verification, and signature validation.

## Verification

`npx vitest run tests/convex/passkeys.test.ts` exercises real registration payloads and P-256 signatures through the HTTP routes and the in-memory Convex component, including sign-in with passwords disabled, replay rejection, wrong-origin rejection, cross-account isolation, and account deletion.

Before release, verify the complete flow on the canonical HTTPS development site with a real or browser virtual authenticator: sign in, add a named passkey, sign out, sign in with that passkey, verify the original account loads, remove it, and confirm it no longer signs in. Also check cancellation and an unsupported browser. These device/browser checks require a configured backend and are separate from the automated cryptographic tests.
