# Agent instructions

These instructions apply to every coding agent working in this repository, including Codex and Claude Code
(`CLAUDE.md` imports this file). This is the short version you must follow; the details live in `docs/` and the
per-app READMEs, listed under [Docs index](#docs-index).

## Code comments

- Do not add code comments. This includes inline, block, JSX, documentation comments, TODOs, and commented-out code.
- Express intent through clear names, types, and simple code. Put necessary explanations in project documentation.
- Before handing off changes, remove comments from code you add or change. Do not perform unrelated comment cleanup.
- Preserve legally required license notices and required machine-consumed directives. These are the only exceptions;
  do not use directives to bypass checks or carry explanatory prose.

## What Verse Together is

Verse Together is a scripture study app for the Latter-day Saint standard works: the Old and New Testaments, Book of
Mormon, Doctrine and Covenants and Pearl of Great Price. People read a chapter, select words or verses to mark,
annotate, explore and add to a journal, and follow the weekly Come, Follow Me readings. It is one repository for
three apps that share one Convex backend, one scripture dataset and one set of lesson content:

- **Web**, at the repository root: Next.js on Vercel. The other two apps follow the website.
- **Android and iOS**, in `mobile/`: a native Expo app with no WebView.
- **Desktop**, in `native/`: an offline Rust app, packaged for Linux.

## Principles

- **Study works without an account.** Signed-out readers keep notes, reading logs and marks on the device; signing
  in syncs them (`docs/device-study.md`). Don't make a reading or study feature require sign-in without being asked.
- **Bundled scripture text has one source.** The standard works bundled with the apps all come from one SQLite
  database. Regenerate the derived files (`docs/scripture-data.md`); never edit `public/scripture-data/` by hand.
  Additional Bible translations are fetched from the HelloAO API (`src/lib/helloaoApi.ts`), not bundled.
- **Never generate or AI-edit a depiction of Jesus Christ.** Use credited public-domain or licensed artwork, and record
  every image's provenance next to it (`public/art/README.md`, `public/cfm/covers/README.md`).
- **AI-written content is labeled and budgeted.** Chapter guides say they were prepared with AI and are generated
  under the application's monthly spending ledger (`docs/chapter-guides.md`). Never submit billable batch work unless
  asked (`docs/chapter-insights-batch.md`).
- **Released clients keep working.** Mobile and desktop builds already in people's hands call the same backend.
  Backend changes so far have been additive (new optional fields, nothing removed); keep to that unless asked.

## Stack

| Area | Choice |
| --- | --- |
| Web app | Next.js 16 App Router, React 19, TypeScript, in `src/` |
| Backend and database | Convex, in `convex/` |
| Authentication | Better Auth inside Convex (`@convex-dev/better-auth`), with the passkey and Expo plugins |
| Styling | Tailwind CSS v4 over the tokens and shared classes in `src/app/globals.css`; Font Awesome icons |
| Android and iOS | Expo SDK 58, React Native 0.88, Expo Router, in `mobile/` with its own `package.json` |
| Desktop | Rust 1.88+, Iced, SQLite through rusqlite, in `native/` |
| Tests | Vitest with `convex-test` (`tests/`), `node --test` (`*.test.mjs`), Jest in `mobile/`, `cargo test` in `native/` |
| Hosting | Vercel for the web app; Convex cloud deployments for the backend |
| Package manager | npm, Node 24 or later. The root and `mobile/` have separate lockfiles. |

Don't swap or add a framework, UI library or styling approach without being asked.

## Repository

```
src/app/              web routes (pages and API route handlers)
src/features/         web feature modules: annotations, auth, chapterGuides, comeFollowMe, notes, settings, ...
src/components/       shared web components (reader, navigation, panels)
src/lib/              web logic, data access, release notes (releaseNotes.ts), generated scripture catalog
convex/               backend: schema.ts, queries, mutations, crons, http routes, Better Auth setup
  betterAuth/         Better Auth's tables, a locally installed Convex component
mobile/               Android and iOS app (Expo)
native/               Rust desktop app
content/cfm/          Come, Follow Me guides: Markdown files plus guides.json
public/scripture-data/  generated per-volume scripture JSON and manifest
public/lds-scriptures-2020.12.08/  the source scripture database and its terms
public/art/, public/cfm/, public/brand/  artwork, lesson covers and brand assets, with provenance
public/release-notes/ release-note screenshots
scripts/              data generators, release and deploy scripts, app runner (apps.mjs)
tests/                Vitest suites; tests/convex/ covers auth and backend rules
qa/                   isolated Vite harnesses for the journal and verse marking, with synthetic data
docs/                 topic docs (see Docs index)
apps.json             app inventory: each app's directory and dev, build, test and check commands
supabase/migrations/  one 2025 SQL migration; nothing in the app uses Supabase
```

Run an app's commands through the inventory: `npm run apps` lists them, `npm run app -- <web|mobile|desktop> <command>`
runs one, and `npm run apps:check` runs every app's checks (`docs/monorepo.md`).

## Built so far

On the web:

- **Reader** at `/browse`: library, volume and book pages with artwork, and the chapter reader with verse selection,
  marks and annotations, footnotes, reading appearance settings, simple mode and a selection menu.
- **Bibles**: KJV built in, more translations from a catalog, side-by-side and inline comparison, and Joseph Smith
  Translation excerpts (`docs/joseph-smith-translation.md`).
- **Explore**: dictionary, Bible Dictionary, Guide to the Scriptures, Topical Guide and Hebrew and Greek entries for a
  selection (`docs/explore-sources.md`).
- **Journal** at `/notes`: Markdown notes and reading logs in one entry (`docs/unified-journal-entries.md`), folders,
  sharing and publishing (`/insights/*`), and study without an account.
- **Come, Follow Me** at `/come-follow-me`: weekly lessons from `content/cfm`, read beside the scripture.
- **AI chapter guides** at `/chapter-guides/<volume>/<book>/<chapter>`, requested from the Resources panel, with
  progress, human review and a reviewer role (`docs/chapter-guides.md`).
- **Search** at `/search`, talks that cite a verse from the BYU Scripture Citation Index (`/talk/<id>`), and
  passage share pages (`/share/...`).
- **Accounts**: Google sign-in and passkeys; email and password is built but off unless
  `AUTH_EMAIL_PASSWORD_ENABLED=true`; account deletion; sign-in for the mobile and desktop apps.
- **Settings** at `/account`: Account, Reading, Translations, Study tools, Release notes and Feedback, plus the
  feature guide at `/feature-guide`.
- **Tester signups** at `/testing`, unlisted (`docs/tester-signups.md`).

The main navigation is Browse, Journal and Come Follow Me. `/feed` and `/help` still exist but aren't in it. Chapter
study paths are no longer shown; only their batch cache remains (`docs/chapter-insights-batch.md`).

The mobile and desktop apps don't have every web feature: see `mobile/README.md` and `native/PARITY.md` for what each
has. Planned work is listed in `FEATURE_IDEAS.md`, which dates from 2026-09-26 and is partly out of date.

## Running locally

## Previews

## Branches

- `dev` is the integration branch. Feature branches merge into `dev`, and dev deploys to the Vercel preview and the
  shared development backend.
- `master` is production. Vercel builds `master` as Production (see `scripts/vercel-build.mjs`).
- Vercel skips pushes that change only `mobile/`, `native/`, `docs/` or root Markdown; see "Which commits deploy" in `docs/convex-deployment.md`.

## Running locally

- `npm run dev` gives each checkout (main or worktree) its own local Convex backend, port and hostname, then prints
  the URL and a test account (`tester@versetogether.test` / `verse-local-tester`) to sign in with. Use it to check
  signed-in features. `npm run dev -- --setup` prepares a worktree without starting the web app.
- It never touches the shared dev or production deployments. Stop it with Ctrl-C before you finish. Details are in
  README.md "Getting Started".

## Releases

Verse Together has versions. **2.0.0** is the Marker redesign that replaced the whole interface (d65680e,
2026-09-25), together with everything master received directly before releases began coming from dev. Since then,
**each merge of `dev` into `master` is one production release**, with either a minor or patch version bump.
The release history, with the master commit for each release, is `RELEASES` in `src/lib/releaseNotes.ts`, and
Settings → Release notes shows it. The release script loads that file with Node type stripping: keep it free
of imports and TypeScript syntax that needs compiling (enums, namespaces).

### When the owner says "merge dev into master"

Treat it as a request for a new release. The agent chooses a minor or patch bump based on everything being
released, unless the owner specifies the version or bump type:

- **Patch** (`2.N.P` → `2.N.(P+1)`): small bug fixes, tiny visual or wording adjustments, and maintenance without
  substantial new functionality. For example, 2.16.0 → 2.16.1 → 2.16.2.
- **Minor** (`2.N.P` → `2.(N+1).0`): new features or substantial improvements to the experience. A release mixing
  these with small fixes is still minor. For example, 2.16.2 → 2.17.0.

Use the current production version as the base; don't return to an older minor line. Choose without asking for
routine confirmation, and state the chosen bump and a brief reason in the release report. The major version
stays 2: never start 3.0.0 without the owner asking for it.

1. **Check there is something to release.** `git fetch origin`, then `git log --oneline origin/master..origin/dev`.
   If dev has nothing master doesn't, say so and stop: no version change for a no-op.
2. **Check it hasn't been prepared already.** `npm run release:status` compares this checkout's version with
   `origin/master`'s. "Prepared" means the bump is already done (an earlier attempt, a retry, a re-run after a
   failed push): don't bump again, finish the remaining steps.
3. **Prepare the release on dev**, in one commit (`Release <version>`):
   - `npm run release:next -- patch` or `npm run release:next -- minor` prints the chosen next version.
     With no argument, the command retains its minor-bump default; it does not assess the changes.
     Run it before editing the release notes, and reuse a prepared version without bumping again.
   - In `src/lib/releaseNotes.ts`, move the `UNRELEASED` items into a new first entry of `RELEASES` with that
     `version`, today's `date`, a short `title`, and the short hashes of the commits it describes in `commits`.
     Leave `masterCommit` off: the merge doesn't exist yet. Fill in the previous release's `masterCommit` if it is
     still missing. Reset `UNRELEASED.items` to `[]`.
   - Make the notes truthful: describe only what the merge actually ships, checked against
     `git log --no-merges origin/master..origin/dev`, in plain words for readers. Leave out internal changes
     (deployment, tests, refactors) unless readers notice them. Never describe work that isn't on dev.
   - Add screenshots for visible features (see below). Features you can't show truthfully get no screenshot.
   - `npm version <version> --no-git-tag-version` updates `package.json` and `package-lock.json` together. Do this
     exactly once per release.
   - Run `npm run release:check`, `npm run test:release`, `npx tsc --noEmit`, `npx eslint` on the changed files and
     the affected tests.
4. **Merge** dev into master (`git merge --no-ff origin/dev -m "Merge dev into master (<version>)"`) and push, as the
   owner asked. Record the merge's short hash in your report; the next release fills it in as this release's
   `masterCommit`.
5. **Tag only if authorized.** If the owner asks for tags or GitHub releases, tag the master merge
   `v<version>` (`git tag -a v<version> <merge> -m "Verse Together <version>"`) and push the tag. Otherwise mention
   that the tag can be added later.

Don't bump the version when merging a feature branch into dev, when retrying or re-running a release that was
already prepared, or for a merge that brings nothing new. Work merged into dev between releases goes in
`UNRELEASED` (add an item when you merge user-visible work into dev), so the next release's notes are ready.

### Release screenshots

- Capture them from the real running app, never mockups, stubbed data or edited images. Use a production build
  (`npm run build`, then `npx next start -p 3123`) and `scripts/capture-release-screenshots.mjs`, which signs no one
  in and crops each shot to its feature. Add a shot to its `SHOTS` list for each new feature worth showing.
- Show no personal data, account details or "unavailable" notices from a missing backend.
- A screenshot taken after the release it illustrates sets `currentInterface: true`, so the notes say it shows
  today's interface.
- Save WebP files under `public/release-notes/` named `<version>-<feature>.webp`, at most 1600px wide, with
  meaningful `alt` text and a `caption`. `npm run release:check` verifies each file exists at its stated size.

Features in the history without screenshots, on purpose: everything in 2.0.0 (the redesign's interface has since
changed), Google sign-in (it needs a real account), and changes readers can't see in a still image (reading width,
selection ranges, retries, account simplifications, guide publishing).

## Backend rules

- All server-side data goes through Convex functions in `convex/`, with the schema in `convex/schema.ts`. There is
  no other server database. Study kept on a device stays local: browser storage on the web, SQLite in the mobile
  and desktop apps.
- Better Auth runs inside Convex: `convex/auth.ts` configures it, `convex/http.ts` serves its routes, and the browser
  reaches them through the same-origin proxy at `src/app/api/auth/[...all]/route.ts`. Its tables are the local
  `betterAuth` component in `convex/betterAuth`; never rename or delete it (`docs/passkeys.md`).
- Get the current user only from the session, with the helpers in `convex/utils.ts`: `getViewerClerkId(ctx)` in
  queries (null when signed out: return an empty result, don't throw), and `requireClerkId(ctx)` or
  `requireViewerUser(ctx)` in mutations (throw when signed out). They also reject a token whose session has ended.
- **Never trust a user or owner id passed as an argument** to a public query, mutation or action. Only internal
  functions take one. Owned rows store the app owner key in a column named `clerkId`, for every account; it comes
  from the caller's linked `users` row, never from an email match or a client value (`docs/auth-migration.md`).
- A new table holding an owner key must be added to `DELETION_STEPS` in `convex/accountDeletion.ts` (a test in
  `tests/convex/nativeAuth.test.ts` fails otherwise) and to `OWNED_TABLE_CHECKS` in `convex/ownership.ts`.
- Next.js server code reads the viewer through `src/lib/auth-server.ts` and `src/lib/requestViewer.ts`; signing in
  and out happens in the browser through `authClient` (`src/lib/auth-client.ts`).
- Mobile signs in through the `nativeSignIn` plugin (`convex/nativeSignInPlugin.ts`, `convex/nativeSignIn.ts`) and
  the desktop through `nativeAppAuth` (`convex/nativeAuth.ts`; `docs/native-desktop-activation.md`). Both are
  registered in `convex/auth.ts`. Keep both working when changing auth.
- When a client must react to a specific failure, throw `ConvexError` with a `code`, as `convex/nativeSync.ts`,
  `convex/insights.ts` and `convex/testerSignups.ts` do. Messages a person will read should say what to do next.
- Convex deploys only through Vercel's guarded build for `dev` and `master` (`docs/convex-deployment.md`). Don't
  push functions to the shared deployments by hand unless asked.

## Design system

The 2.0.0 Marker redesign set today's interface. Its tokens now carry a study-page look: cream paper, warm ink, one
rubric red for emphasis, hairline rules rather than boxes, and serif display and reading type over a quiet sans.

1. **Tokens live in one place:** the custom properties at the top of `src/app/globals.css`, for light in `:root`
   and dark in `[data-theme="dark"]`. Use them (`var(--surface-card)`, `var(--accent-rubric)`, `var(--rule)` and so
   on); don't put literal colours in components.
2. **Reuse the shared classes in `src/app/globals.css`** (`surface-card`, `surface-button`, `panel-card`, `soft-input`,
   `pill-tag`, `page-shell`, `page-title` and others) and the components in `src/components` and `src/features`
   before adding new ones. Feature-specific layout goes in a CSS module beside the feature.
3. **Light and dark both work.** The theme follows the device's setting; there is no stored choice. Check every UI
   change in both.
4. **Type:** the serif stack (`--font-serif-text`, `font-serif`, `font-display`) for titles and scripture, DM Sans
   for labels and controls, Geist Mono for code.
5. **Icons:** Font Awesome solid icons.
6. **Simple mode** hides study chrome through `data-simple="true"` and the `simple-hide` and `simple-only` classes.
   Check that a new control behaves sensibly there.
7. The mobile and desktop apps follow the same colours and type in their own code (`mobile/README.md`,
   `native/README.md`).

## Docs

- Topic docs go in `docs/`, one file per topic. App-specific docs stay with their app (`mobile/`, `native/`), and
  provenance notes stay next to the data or images they describe. Don't add loose Markdown at the repository root;
  `README.md`, `AGENTS.md` and `CLAUDE.md` are the exceptions.
- Update docs in the same change as the code they describe, and add any new doc to the index below.
- Describe what exists. Mark planned or unverified work as such, with a date.
- Dated QA and verification records are history: don't rewrite them to match today, put current facts in the topic
  doc instead.
- Keep this file short. Put detail in a doc and link to it.

### Docs index

| Topic | Doc |
| --- | --- |
| Apps, shared boundaries, app commands | `docs/monorepo.md` |
| Convex deployment through Vercel | `docs/convex-deployment.md` |
| Better Auth setup, Clerk migration, Google-only rollout | `docs/auth-migration.md` |
| Passkeys | `docs/passkeys.md` |
| Desktop sign-in and sync | `docs/native-desktop-activation.md`, `native/ACCOUNT_ACTIVATION.md` |
| Study without an account | `docs/device-study.md` |
| Journal entries (notes and reading) | `docs/unified-journal-entries.md` |
| AI chapter guides | `docs/chapter-guides.md` |
| Chapter insight batch (study paths) | `docs/chapter-insights-batch.md` |
| Dictionary, study helps, Hebrew and Greek | `docs/explore-sources.md`, `docs/strongs-data.md` |
| Joseph Smith Translation | `docs/joseph-smith-translation.md` |
| Scripture data and regeneration | `docs/scripture-data.md`, `public/lds-scriptures-2020.12.08/README.md` |
| Artwork and provenance | `public/art/README.md`, `docs/scripture-book-art.md`, `docs/browse-art-provenance.md`, `public/cfm/covers/README.md` |
| Tester signups | `docs/tester-signups.md` |
| Feature guide clips | `scripts/feature-guide/README.md` |
| QA harnesses | `qa/notes/README.md`, `qa/annotations/README.md` |
| Android and iOS app | `mobile/README.md` |
| Desktop app and its parity with the web | `native/README.md`, `native/PARITY.md` |
| Roadmap (partly out of date) | `FEATURE_IDEAS.md` |
| Dated QA and review records | `docs/browse-refresh-verification.md`, `docs/notes-journal-authenticated-qa.md`, `docs/notes-journal-branch.md`, `docs/ui-improvement-review.md`, `docs/ui-review/`, `design-qa.md`, `native/VERIFICATION.md` |

## Checks

Run these after a change, by what it touches. A focused `npm run test:*` script or `npx vitest run <file>` is fine
while iterating; run the full set before handing off.

- **Web** (`src/`, `scripts/`, `content/`, root config): `npm run app -- web check`, which runs `release:check`,
  `next typegen`, `tsc --noEmit`, `cfm:check` and `npm test`. `npm test` runs every node:test file under `src/` and
  `scripts/` and every Vitest file under `tests/`. Also run `npx eslint` on the files you changed: the full lint has
  existing errors, so it is not part of the check yet.
- **Convex** (`convex/`): the web check, which typechecks `convex/` and runs its tests under `tests/convex/`. Mobile
  imports shared modules from `src/` and `convex/`, so also run the mobile check when you change one of them.
- **Release notes** (`src/lib/releaseNotes.ts`, `public/release-notes/`): `npm run release:check` and
  `npm run test:release`, then the desktop check, which verifies its generated copy of the notes.
- **Mobile** (`mobile/`): `npm run app -- mobile check` (typecheck, Jest and generated data).
- **Desktop** (`native/`): `npm run app -- desktop check` (`cargo fmt --check`, release-note data and
  `cargo test`).

Tests that need the network or secrets stay out of these runs. The full JST appendix audit runs only with
`JST_CORPUS` naming a saved copy of the upstream entries (see `docs/joseph-smith-translation.md`), and mobile's
live-service tests only with `LIVE_NETWORK=1`.
