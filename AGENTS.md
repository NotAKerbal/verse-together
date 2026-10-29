# Agent instructions

These instructions apply to every coding agent working in this repository, including Codex and Claude Code
(`CLAUDE.md` imports this file).

## Code comments

- Do not add code comments. This includes inline, block, JSX, documentation comments, TODOs, and commented-out code.
- Express intent through clear names, types, and simple code. Put necessary explanations in project documentation.
- Before handing off changes, remove comments from code you add or change. Do not perform unrelated comment cleanup.
- Preserve legally required license notices and required machine-consumed directives. These are the only exceptions;
  do not use directives to bypass checks or carry explanatory prose.

## Branches

- `dev` is the integration branch. Feature branches merge into `dev`, and dev deploys to the Vercel preview and the
  shared development backend.
- `master` is production. Vercel builds `master` as Production (see `scripts/vercel-build.mjs`).

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
