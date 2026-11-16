# Automatic Convex deployment

Vercel's Git integration remains the only automatic release pipeline. `vercel.json` selects
`npm run build:vercel`; `npm run build` remains a frontend-only local build. The guarded build
in `scripts/vercel-build.mjs` couples the backend and frontend from the same Git commit.

| Git branch | Vercel target | Convex deployment | Activation value |
| --- | --- | --- | --- |
| `dev` | Preview, **branch `dev` only** | `dev:fabulous-dogfish-606` | `dev:fabulous-dogfish-606` |
| `master` | Production | `prod:lovable-seal-140` | `prod:lovable-seal-140` |
| Any feature branch | Preview | No backend push | Must be unset |
| None (`npm run preview`) | Preview | Its own preview backend, pushed beforehand by the CLI | Must be unset |

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
   To test a branch with a working backend and sign-in, use `npm run preview` (see below).
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

## Previews from npm run preview

`npm run preview [name] [-- --fresh]` (`scripts/preview.mjs`) deploys the working tree, committed or not,
to its own Convex preview deployment and a Vercel preview. It never touches `fabulous-dogfish-606`,
`lovable-seal-140`, Vercel project settings, environment variables, domains or aliases.

1. Resolves `isaac-cochran:verse-together:preview/<name>` (the name defaults to the Git branch). If it
   is missing, or `--fresh` is passed, `convex deployment create ... --type preview` creates it; creating a
   name that exists replaces that deployment with an empty one.
2. Creates a temporary deploy key named `preview-script-<time>` for that deployment and checks it names
   that deployment, never a shared one. The key is deleted when the script ends, fails or is interrupted
   (SIGINT, SIGTERM, SIGHUP). If deletion fails it prints the `convex deployment token delete` command.
3. With the key, sets on the preview backend only: `BETTER_AUTH_SECRET` and `AUTH_PROXY_SECRET` (random,
   once, passed on stdin), `AUTH_EMAIL_PASSWORD_ENABLED=true`, and a placeholder `SITE_URL`. Then runs
   `convex deploy --codegen disable --typecheck enable`, which pushes the committed `_generated` code and
   leaves the working tree unchanged. Google sign-in and email delivery stay unconfigured, so new accounts
   need no email verification.
4. Runs `vercel deploy --archive=tgz --environment preview` with `GIT_DIR` pointing at nothing, so Vercel
   receives no Git metadata and cannot give the deployment a branch's domain. It passes
   `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` and `VERSE_PREVIEW=<name>` at build time, the
   public URLs and `AUTH_PROXY_SECRET` at run time, and `--meta versePreview=<name>`.
5. Sets `SITE_URL` to the new deployment URL, then creates `tester@versetogether.test` with the real
   Better Auth sign-up endpoint. If it already exists, it checks that its password still signs in.

`VERSE_PREVIEW` selects a separate path in `scripts/vercel-build.mjs`: allowed only on Vercel Preview, with
no Git branch or commit metadata and no `CONVEX_AUTOMATIC_DEPLOYMENT`, and only when both public Convex URLs
name the same deployment, which must not be `fabulous-dogfish-606` or `lovable-seal-140`. It builds the
frontend with every `CONVEX_*` variable blanked and never runs the Convex CLI.

Each run makes a new Vercel deployment URL and moves `SITE_URL` to it, so sign-in works only on the latest
URL. The project's Vercel Authentication covers `*.vercel.app`, so viewers need a Vercel sign-in on the team
or a share link from the dashboard. Convex deletes preview deployments 5 days after creating them.

To delete a preview, delete the deployment in the Convex dashboard (the `Backend` link the script prints,
Settings → Delete deployment), and remove its Vercel deployments:
`vercel ls scriptures-sharing --scope notakerbals-projects --meta versePreview=<name>`, then
`vercel remove <url> --scope notakerbals-projects` for each.

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

## Which commits deploy

`vercel.json`'s `ignoreCommand` runs `scripts/vercel-ignore.mjs` before every Vercel build. Vercel
skips the deployment when it exits 0 and builds when it exits 1. The setting lives in the repository,
so it applies to a branch only once this change has been merged into that branch.

It skips only when git shows that nothing the web app or Convex backend is built from changed since
the branch's last successful deployment (`VERCEL_GIT_PREVIOUS_SHA`) up to the pushed commit
(`VERCEL_GIT_COMMIT_SHA`). It checks both the net difference and every commit in between (merges
against their first parent), so a build-input change that a later commit reverts still builds.

**Not built from**, so changes only here skip: `mobile/`, `native/`, `docs/` and Markdown files at the
repository root (`README.md`, `AGENTS.md`, ...). **Everything else builds**, including any new file
or folder, because the build reads far more than `src/`:

| Reader | What it reads |
| --- | --- |
| Next.js | `src/`, `public/`, `next.config.ts`, `postcss.config.mjs`, `package.json`, `package-lock.json` (Vercel's install), `content/cfm/` (imported and traced into `/api/resources`), `convex/` (imported by `src/`, including `convex/_generated/`), `src/lib/generated/` |
| Next.js type check | Every `**/*.ts` and `**/*.tsx` in `tsconfig.json`'s `include`, so also `tests/`, `qa/`, `vitest.config.ts`; `tsconfig.json` excludes `mobile`, `native` and `docs` |
| Tailwind | Every file git doesn't ignore (`.gitignore`), except what `src/app/globals.css` excludes with `@source not`: the same `mobile`, `native`, `docs` and root `*.md` |
| Convex deploy | `convex/` (with `convex/tsconfig.json`) and the `src/lib` and `src/features` files it imports |
| Vercel | `vercel.json`, `scripts/vercel-build.mjs`, `scripts/vercel-ignore.mjs` |

Nothing the web build or Convex imports lives in `mobile/`, `native/` or `docs/`; references there are
prose. Before the Tailwind exclusions, those folders added three CSS rules the website never used
(`flex-grow`, `!inline`, `md:w-[min(36rem,…)]`). If the website ever needs something from these
folders, remove it from `notBuiltFrom` in `scripts/vercel-ignore.mjs` and from the `@source not` and
`tsconfig.json` exclusions; `npm run test:deploy` checks the three stay in step.

Anything the script can't tell builds:

- no `VERCEL_GIT_COMMIT_SHA` (a CLI deploy, including `npm run preview`) or `VERSE_PREVIEW` set;
- no previous SHA (a branch's first deployment) or a redeploy of the same commit;
- a pushed commit whose message contains `[force build]`;
- either commit missing from Vercel's shallow clone, or a commit in between whose parents are cut off;
- a pushed commit that doesn't descend from the last deployed one (a rewritten branch);
- any git failure.

**Dev and master stay in step.** On `dev` and `master`, a successful deployment means
`vercel-build.mjs` built the frontend, deployed Convex and verified it, all from one commit, before
Vercel published. A skip publishes nothing and writes nothing, so the live frontend and backend stay
exactly as that last successful deployment left them: one commit's pair. A skip happens only when no
commit since then touched a build input, so building would have produced the same frontend and the
same backend. A build that failed after its Convex deploy (see below) leaves the backend ahead of the
last successful deployment; its commit is in the next push's range, so that push builds, even if it
reverts the change. What git can't show still needs a build: Vercel environment variable changes,
backend writes from outside this pipeline (a manual `convex deploy`, `deploy:notes:development`),
and a failed build's commit later dropped by a force push. For those, push an empty commit to the
branch with `[force build]` in its message (`git commit --allow-empty -m "Rebuild dev [force build]"`).
Alternatively, redeploy the deployment of the branch's current head from the dashboard with **Use
project's Ignore Build Step** unchecked in the Redeploy dialog
([Vercel](https://vercel.com/docs/project-configuration/project-settings#ignore-build-step-on-redeploy)).
Redeploying an older commit doesn't help: `vercel-build.mjs` refuses any commit that isn't the branch head.

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
