# Verse Together

A scripture study app for the Latter-day Saint standard works: read, mark and annotate, explore words and passages,
keep a journal, and follow the weekly Come, Follow Me readings.

One repository holds the web app, native Android/iOS app, and native Rust desktop app. They share scripture,
Come, Follow Me content, artwork and backend APIs. See [the monorepo guide](docs/monorepo.md) for setup and boundaries.

```bash
npm run apps                         # list apps
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

Install [`portless`](https://github.com/vercel-labs/portless) first:

```bash
npm install -g portless
```

Then run the development server:

```bash
npm run dev
```

`portless` prints the local hostname it assigns for the app. Open that URL in your browser once the server is ready.

If you need the plain Next.js localhost flow instead, use:

```bash
npm run dev:local
```

That fallback uses the default Next.js development server URL, typically `http://localhost:3000`.

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
