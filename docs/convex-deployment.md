# Automatic Convex deployment

Vercel's Git integration remains the only automatic release pipeline. `vercel.json` selects
`npm run build:vercel`; `npm run build` remains a frontend-only local build. The guarded build
in `scripts/vercel-build.mjs` couples the backend and frontend from the same Git commit.

| Git branch | Vercel target | Convex deployment | Activation value |
| --- | --- | --- | --- |
| `dev` | Preview, **branch `dev` only** | `dev:fabulous-dogfish-606` | `dev:fabulous-dogfish-606` |
| `master` | Production | `prod:lovable-seal-140` | `prod:lovable-seal-140` |
| Any feature branch | Preview | No backend push | Must be unset |

This is prepared automation, **not an activated deployment**. No Vercel settings, credentials,
aliases, Convex configuration, or production backend were changed while implementing it. Once
this configuration reaches `dev` or `master`, missing activation/credentials **fail the build**;
there is no successful frontend-only fallback on those branches. Configure each environment
before merging this change into that branch. Do not merge to `master` as a way to test setup.

## Activation

1. Review and test the automation PR against `dev`. Enable Vercel's system environment variables.
   Confirm project `scriptures-sharing` (`prj_I55xbo17nxAMQHMBXSEjAxpNt97k`), team
   `team_5zEN6A1TNn3xXcfWMrHKpVAd`, Git repository `NotAKerbal/verse-together`, production
   branch **`master`**, and a Node.js 24 build runtime (the repository requires Node >=24).
   `vercel.json` takes precedence over the dashboard Build Command; leave it selecting the guarded
   build. Do not override it back to `npm run build` in deployment-specific settings.
2. In Project Settings → Build and Deployment → On-Demand Concurrent Builds, select
   **Run up to one build per branch** (`WAIT_FOR_NAMESPACE_QUEUE`). Verify the effective setting,
   including any team inheritance, before activation. Do not use urgent builds that bypass this
   queue or run another CLI/manual backend writer concurrently. Dev and master can build in
   parallel because they target different backends.
3. Generate a **separate deployment-scoped key** for `fabulous-dogfish-606` in that deployment's
   Convex settings. Its type/target must be `dev:fabulous-dogfish-606`. Grant permission to deploy
   and read function metadata (`function-spec` preflight); verify the preflight works with the
   actual key before enabling the pipeline. Prefer the least privileges supported by Convex.
   Store it as a Sensitive `CONVEX_DEPLOY_KEY` in Vercel **Preview, Git branch `dev` only**.
   Do not paste credentials into chat, Git, command arguments, PRs, or logs. If an agent needs a
   credential, use T3's `request_secret` private card/file delivery.
4. On the same **Preview / `dev` branch** scope set:

   | Variable | Value |
   | --- | --- |
   | `CONVEX_AUTOMATIC_DEPLOYMENT` | `dev:fabulous-dogfish-606` |
   | `NEXT_PUBLIC_CONVEX_URL` | `https://fabulous-dogfish-606.convex.cloud` |
   | `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://fabulous-dogfish-606.convex.site` |

   Retain the existing branch-scoped `AUTH_PROXY_SECRET` matching that backend. Do not set the
   activation marker Preview-wide. The previously configured Preview-wide `CONVEX_DEPLOY_KEY`
   has **not been decrypted or verified**, and is not accepted as a substitute: the build checks
   the exact key type/target and verifies the authenticated URL. Feature previews never invoke
   the Convex CLI and receive no Convex credentials in their Next.js build subprocess. Review the
   old Preview-wide key's other consumers before removing or rotating it.
5. Merge the reviewed change to `dev`. The Git-triggered deployment must log the exact commit,
   `Verified ... -> dev:fabulous-dogfish-606`, frontend success, Convex success, and final target
   verification before Vercel reports Ready. Smoke-test signed-out and signed-in journal/goal
   reads and writes through `https://scripture-sharing-dev.vercel.app`, including Google sign-in.
   A feature PR preview proves only the frontend path; it does not prove authenticated deployment.
6. **Production is a separate activation/release decision.** After a successful dev rehearsal and
   review of production auth/configuration and backend compatibility, create a different key
   scoped to `prod:lovable-seal-140`. Store it only in Vercel **Production**. Set the Production
   activation marker to `prod:lovable-seal-140`, and both public URLs to that deployment's
   `.convex.cloud` / `.convex.site` endpoints. Verify `AUTH_PROXY_SECRET` and backend auth settings
   match production. No dev key, Preview/project-wide key, local login token, or frontend public
   URL proves permission to deploy production. A normal reviewed merge to `master` then runs the
   pipeline. This implementation task does not authorize that production release.

`CONVEX_DEPLOYMENT` may be absent or match the exact target. Self-hosted settings, alternative
deployment tokens, access-token overrides, custom provision hosts, and anonymous agent mode are
rejected. The CLI is the version from `package-lock.json`, invoked directly from `node_modules`;
no `npx` download or interactive login is used. Invalid key values are never included in guard errors.

## Ordering and concurrent builds

The script performs these steps, stopping on the first error:

1. Validate branch/environment/project, activation marker, key type and deployment, and both public URLs.
2. Check the checkout SHA against Vercel metadata and the current remote branch head.
3. Authenticate with the scoped key and read `convex function-spec`; require the expected cloud URL.
4. Build Next.js with the existing `--turbopack` options and public URLs, without Convex credentials.
5. Recheck the branch head, rejecting a build superseded while Next.js was building.
6. Run `convex deploy --yes --typecheck enable` with the scoped key and a branch/SHA audit message.
   Convex generates code, validates/bundles, and deploys schema/functions/indexes. No application
   data migration, environment mutation, seed function, snapshot import, or frontend promotion is invoked.
7. Read the authenticated function spec again and require the same target. Return success to Vercel,
   which may then publish/assign frontend aliases according to the existing project settings.

The remote SHA checks are an additional stale-build guard, **not a distributed lock**. The per-branch
Vercel queue and one backend writer are required to prevent overlapping pushes. A newer Git push can
arrive after the final check; the queued newer build runs afterward. Old dashboard redeploys and manual
CLI uploads are not the automation entrypoint. An unavailable Git remote or failed auth preflight fails
closed. The fixed repository is public, so the remote-head check does not need a GitHub credential.

## Failure and rollback

| Failure point | Result / response |
| --- | --- |
| Target, credential, SHA, or preflight check | Build fails before any backend write or frontend publication. Fix configuration or build the current branch head. |
| Next.js build | Convex deploy is never invoked; existing backend and live frontend remain. |
| Convex validation/deploy | Vercel build fails; the new frontend is not published. Inspect Convex state/logs before retrying: a timeout/cancellation does not prove the backend stayed unchanged. |
| Post-deploy check or Vercel publication | Backend may already be updated while the old frontend is still live. Inspect both platforms and prefer a forward fix from the current branch head. |

Convex and Vercel do not share an atomic transaction. Old browser sessions, the old live frontend, feature
previews using a shared backend, and rollback frontends must remain compatible with the new backend.
Use additive optional fields and APIs, keep old contracts until old clients age out, and stage index
backfills deliberately. Breaking auth/schema/API changes require a separately coordinated release;
this automation cannot determine their compatibility. See `docs/auth-migration.md` for auth cutover and
legacy ownership constraints. Do not automatically restore a snapshot or revert schema after new writes.

For an incident, first stop new merges/builds and remove the affected environment's activation marker
(or revoke only its deployment key). New dev/master builds then fail closed; **running builds keep
their original environment** and require explicit cancellation/state inspection. Use an authorized Vercel
frontend rollback only when that frontend is compatible with the current backend. Vercel rollback does
not roll Convex back. For backend repair, review a forward-fix commit retaining fields/indexes needed
by existing data and clients, merge it to the appropriate branch, and retry that branch's current Git
deployment. If backend rollback is essential, treat it as a separate reviewed manual operation; do not
bypass the freshness guard to push an old commit. Vercel rollback may disable automatic domain assignment;
restoring aliases/promotion requires a separate release decision.

## Verification

`npm run test:deploy` exercises dev/production target isolation, key and override rejection,
feature-branch no-push behavior, stale revisions, and failure propagation at every orchestration step.
It uses fake credentials and a controlled command runner; it never contacts or deploys a backend.
`npm run build` checks the actual Next.js build without enabling deployment.

The manual development rollout immediately preceding this automation was reported complete at
`4db1bf6e19d2cfc4104edf36cb1babc8f61bef60`: target `fabulous-dogfish-606`, typecheck and push passed,
`deviceStudyImports.by_owner_device` added, goal query/mutation present, unsigned goals `null`, journal
`[]`, and goal save `Unauthorized` as expected. That manual success does not validate the new automatic
credential path. No live automatic dev push or production release was run for this change.

References: [Convex deploy sequence](https://docs.convex.dev/cli/reference/deploy),
[deployment key types](https://docs.convex.dev/cli/deploy-key-types),
[Vercel branch concurrency](https://vercel.com/docs/builds/managing-builds),
[system variables](https://vercel.com/docs/environment-variables/system-environment-variables).
