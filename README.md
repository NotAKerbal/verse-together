# Verse Together

A scripture study app for the Latter-day Saint standard works: read, mark and annotate, explore words and passages,
keep a journal, and follow the weekly Come, Follow Me readings.

One repository holds the web app, native Android/iOS app, and native Rust desktop app. They share scripture,
Come, Follow Me content, artwork and backend APIs. See [the monorepo guide](docs/monorepo.md) for setup and boundaries.

```bash
npm run apps                         # list apps
npm test                             # every web test: node:test files and Vitest
npm run app -- web check             # web release data, typecheck, CFM content and tests
npm run app -- mobile check          # mobile typecheck, tests and generated data
npm run app -- desktop dev           # native Rust app
npm run apps:check                   # all app checks, sequentially
```

The web app remains at the repository root (Next.js in `src/`, Convex backend in `convex/`), mobile is in
[mobile/](mobile/README.md), and the Rust desktop app is in [native/](native/README.md). The web and Convex deployment
paths are unchanged.

Coding agents start with [AGENTS.md](AGENTS.md): what is built, the repository map, the rules, and an index of the
docs in [docs/](docs/).

## Getting Started

Log in to Convex once on each machine (`npx convex login`), then run:

```bash
npm run dev
```

This gives the checkout it runs in, the main one or any git worktree, its own local Convex backend, data, port
and test account, so branches and agents run side by side without touching each other or the shared dev
deployment. When it is ready it prints the URL and the test account:

```
Verse Together is running
  URL       http://verse-together-1.localhost:3101
  Email     tester@versetogether.test
  Password  verse-local-tester
```

What it does (`scripts/dev.mjs`):

- **Dependencies.** Runs `npm ci` if `node_modules` is missing, as in a new worktree.
- **Backend.** The first time, it creates a Convex local deployment in the `isaac-cochran/verse-together`
  project. It runs on this machine and keeps its data in `.convex/local/default`, which git ignores. Later runs
  reuse it, with the same data and account. The command writes `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`,
  `NEXT_PUBLIC_CONVEX_SITE_URL` and `AUTH_PROXY_SECRET` to `.env.local` and leaves other lines alone. In the
  main checkout this moves `.env.local` off the shared dev deployment, so keep a copy of the old file if you
  want to switch back.
- **Ports and hostnames.** The main checkout is served at `http://verse-together.localhost:3100`. Each worktree
  gets the next free slot the first time and keeps it: `http://verse-together-<n>.localhost:<3100 + n>`, with its
  backend on ports `3500 + 2n` and `3501 + 2n`. Slots are found from `git worktree list` and each worktree's
  `.convex/local/default/config.json`. These ranges stay clear of other projects on this machine that use 3000
  and 3210 upwards. Each checkout has its own hostname because browsers share `localhost` cookies across ports,
  so two checkouts on plain `localhost` would sign each other out.
- **Backend settings.** Sets `SITE_URL` to the checkout's URL, a generated `BETTER_AUTH_SECRET`, the same
  `AUTH_PROXY_SECRET` as `.env.local`, and `AUTH_EMAIL_PASSWORD_ENABLED=true`. Email and password sign-in is
  turned on only on these local backends; the shared dev and production deployments stay Google only. Google,
  Resend, OpenAI, Anthropic, Merriam-Webster and Spotify keys are not set, so those features are unavailable
  locally. With no Resend key, new accounts need no email confirmation.
- **Test account.** Once the backend answers, it signs in as `tester@versetogether.test` and creates the account
  through the normal email sign-up if that fails. Running it again changes nothing. The account is the same one
  anyone can create from `/sign-up` on a local backend; the data is throwaway.
- **Web app.** Starts `next dev --webpack` on the checkout's port. Ctrl-C stops the web app and the backend.

`npm run dev -- --setup` does everything except start the web app, then stops; use it to prepare a new worktree.
To start over with an empty backend, stop the command and delete `.convex/local`. `scripts/test-account.mjs`
exports the test account and `ensureTestAccount` for other scripts that set up a backend.

`npm run dev:local` runs plain `next dev --webpack` against whatever `.env.local` names, on Next's default port.
Sign-in works there only when that backend's `SITE_URL` is the URL you open. The command no longer uses
`portless`: per-checkout hostnames and ports replace it, and a portless URL would not match the backend's
`SITE_URL`.

Both dev scripts run the webpack dev server on purpose. With Next 16.1 and Tailwind v4, `next dev --turbopack` spawns a new PostCSS worker process for every CSS compile and never reaps them; on 2026-09-25 that reached 780 workers and roughly 30 GB of RAM. Production builds (`npm run build`) still use Turbopack and are fine.

## Deployment

Vercel builds use the guarded Convex/frontend workflow in
[docs/convex-deployment.md](docs/convex-deployment.md). Configure the branch-scoped dev and separate
production credentials/activation settings before merging it to their release branches; missing settings
fail those builds. Feature previews and local `npm run build` do not push Convex.

## Accounts

Sign-in uses Better Auth inside Convex. The current rollout is **Google only**; email/password support is built
but stays switched off until `AUTH_EMAIL_PASSWORD_ENABLED=true` is set on the Convex deployment. Configuration,
the Clerk account migration, cutover and rollback are documented in [docs/auth-migration.md](docs/auth-migration.md).
Signed-in users can also add a passkey ([docs/passkeys.md](docs/passkeys.md)).

## More documentation

- [Scripture data](docs/scripture-data.md): the retained source database, regenerating `public/scripture-data/`, and
  one-off exports.
- [Dictionary, study helps and Biblical languages](docs/explore-sources.md): Explore's sources, the optional
  Merriam-Webster key, and refreshing the study-helps index.
- [AI chapter guides](docs/chapter-guides.md): requested from the Resources panel, which shows only the groups matching
  the selected verses, and read in full at `/chapter-guides/<volume>/<book>/<chapter>`. They're generated in Convex
  under an application-enforced $100 monthly spending ledger, which isn't a limit the providers enforce.
- [Chapter insight batch](docs/chapter-insights-batch.md): the retired study paths' cache and the OpenAI batch
  scripts that fill it.
