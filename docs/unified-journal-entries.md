# Unified journal entries

The reader header's Log button opens one form. An entry can contain note text, reading, or both. Reading is an editable chip at the top of the entry, and whole chapters, partial verses, guides and selected dates still work. The journal counts and displays each combined entry once. Its navigation label is now Journal, and the floating Notes trigger and separate New note action are removed.

New entries use the existing private Markdown draft with an optional reading timestamp. Creation is atomic and idempotent per owner/request. Existing notes can gain reading, and reading-only entries can gain note text through the existing revision-checked save outbox. Reading changes leave chapter completion and plans alone. Removing reading from an otherwise empty entry is refused until a note has been added.

Older reading records open as editable entries on demand. The original record remains stored, and its history key prevents the original and the editable entry from appearing twice. Legacy chapter readings keep their original timestamp when subsequently unmarked or reread. No bulk migration runs. Reading metadata is returned only through owner queries, not shared-note queries.

This change requires the additive Convex schema and the new `insights:createJournalEntry`, `insights:openReadingEntry` and `insights:setJournalReading` functions before the connected frontend is released. They are deployed to the isolated cloud preview described below. Production is unchanged.

## Using this work from another branch

The feature branch is `t3/unify-notes-and-reading-log`, based on dev commit `10c1936`. Fetch it from origin and merge or cherry-pick its feature commit into the branch that needs the unified journal. Include the backend schema and functions along with the frontend changes.

## Current Vercel preview

The real app is deployed at https://verse-together-better-auth-preview.vercel.app from this worktree's changes on top of `origin/dev` (`10c1936`). Deployment `dpl_DHVj2r1erzGVveJPk6jcNUzXY9EK` built successfully and is READY. The alias assignment was read back against that deployment.

The entry editor places its reading chip to the right of the author/source attribution, sharing a centered row with the close button. The old negative top offset on the close button is removed. Component browser measurements of existing fixtures found a zero-pixel difference between chip and close-button centers at desktop and 390 x 844, with no phone overflow. This checks layout without creating journal data.

Reader and Come, Follow Me header Log actions open a nonmodal desktop sidebar; the reader reserves room beside it. Phones use a modal bottom sheet. The panel is portaled to the body so header docking does not clip it. It closes the older notebook panel when opened. The real authenticated local reader passed desktop nonmodal checks (text right edge 1124px, panel left edge 1140px) and phone sheet checks at 390 x 844 without saving an entry. TypeScript, focused ESLint, 131 journal tests and the hosted build pass. The previous automatic-review block on creating a test entry remains respected; authenticated save/reload on the new hosted version is still for owner testing.

The composer now puts its reading chip to the right of “Log an entry” in the heading row. A flexible textarea fills the remaining space above a bottom row containing Day and Save entry. The duplicate Cancel action is removed; the heading's X closes the form. Real authenticated local browser checks confirmed the large desktop editor and a 509px-tall text area in the 390 x 844 phone sheet, with Save entry visible at the bottom. The right-aligned reading editor was narrowed on phones so it stays inside the sheet; its verse inputs flex to fit. Opening its verse editor and cancelling made no journal writes. TypeScript and focused ESLint pass for this layout follow-up.

The note writer now starts hidden behind Add note. Reading-only entries can use Save entry immediately. Add note reveals and focuses the full-size writer, while Day and Save entry stay at the bottom. Reopening the composer resets it to the reading-only presentation. Real local desktop and phone browser checks covered the initial hidden state, enabled Save entry, focused writer after Add note, and reset after reopening. These browser checks made no journal writes. All 131 existing journal tests, TypeScript and focused ESLint pass.

It uses the existing isolated Convex preview `deafening-sandpiper-172`, with the journal functions and schema deployed before the frontend. Its existing Google callback and preview site URL are retained. Deployment-specific frontend configuration points to that backend; shared development and production are unchanged. The existing preview backend is scheduled to expire October 28, 2026.

Hosted smoke checks returned HTTP 200 for the real chapter reader (including Journal navigation and Log) and `/api/auth/get-session` (signed-out `null`). Google is enabled in the backend's auth capabilities. Authenticated chip editing and save/reload on this hosted version remain for owner testing; the earlier local Clerk verification below predates the move onto dev. Existing Vercel preview protection remains enabled.

## Verification

- 73 journal tests pass, including all three entry combinations, exact Markdown/source/day persistence, retry deduplication, owner isolation, editing reading without changing text revisions, and opening older manual/legacy readings without duplicating history.
- Root and Convex TypeScript checks and focused ESLint pass.
- Existing CFM and Browse suites pass.
- Browser component QA used the actual Log dialog, workspace, Markdown editor and outbox with synthetic in-memory fixtures. Desktop checks covered all three combinations, partial verse selection, single-entry counts, reopening and toggling reading. Phone checks at 390 x 844 covered dialog bounds, reading-only save, adding and autosaving a note to it, navigation, and failed-save retry with retained text and one resulting entry. The phone dialog stayed within the viewport without horizontal overflow.
- The T3 preview snapshots timed out twice, so browser QA continued in Chrome. The captured browser errors concerned an installed extension's storage access, not a failure of a tested journal action.
- `next build --webpack` compiled successfully and passed its TypeScript stage, then failed prerendering `/account` because this checkout has no Clerk publishable key. The first sandboxed attempt could not fetch Google Fonts; the network-enabled run fetched them. The default Turbopack build was stopped after remaining at compilation without progress.
- Authenticated local Clerk/Convex save/reload passed in the real worktree app as described below. Hosted deployment save/reload remains unverified. Fixture saves do not establish either result.


## Real worktree app

The actual Next.js app runs from `t3/unify-notes-and-reading-log` at `http://localhost:3197/browse/bookofmormon/1nephi/2`. It uses the existing development Clerk configuration and a real local Convex deployment on `http://127.0.0.1:3217`. The shared cloud development deployment has newer auth modules absent from this branch, so it was inspected but not overwritten. Production was not changed.

The ignored worktree `.env.local` is an independent file, initially copied from the main checkout's development configuration and then configured for the local backend. The main checkout's environment file was not changed. The local backend has the actual schema, indexes and unified-entry functions. Its signed-out reading-history query returns an empty list. Database records persist locally; this is not the Vite fixture harness.

To resume the real worktree app, run these in separate terminals from the worktree:

```sh
node node_modules/convex/bin/main.js dev --local --local-cloud-port 3217 --local-site-port 3218 --tail-logs disable
npm run dev:local -- --hostname localhost --port 3197
```

Bind Next.js to `localhost` as above. The earlier bind to `127.0.0.1` served static assets but hung on middleware-routed pages. The canonical chapter route is `1nephi`, not `1-nephi`. The real reader, development Clerk modal and Google account chooser were exercised in Chrome. After the owner explicitly selected the personal Gmail account, normal Google/Clerk sign-in succeeded.


### Authenticated local verification

The real Next.js app and local Convex backend passed authenticated checks on October 24, 2026. Through the actual reader header Log button, one private entry titled `Worktree Log verification` was saved with Markdown text and reading of 1 Nephi 2:3-5. Its source links to `/browse/bookofmormon/1nephi/2#v-3`, and the journal showed one entry on October 24. A full page reload retained both the note and the reading flag.

That same entry was changed to note-only, reloaded, changed to reading-only, reloaded, and given its note text again. The final combined entry was reloaded and reopened, with the text, reading flag and source still present and one card in the journal. These operations used normal authenticated browser requests to the real local backend, without a fixture provider or fabricated CLI identity. The single test entry remains in the local database for inspection. The signed-in journal is left open at `http://localhost:3197/notes`.

The local database has no precomputed chapter insights and the optional chapter-insights request returned 503. This did not affect the verified journal path. The shared development backend and production were unchanged.


## Dev base and reading chip follow-up

The branch was moved from the master release commit onto `origin/dev` at `10c1936`, restoring the task changes without replaying the release merge. The pre-move changes remain in a named Git stash as a recovery snapshot. Current dev's Better Auth migration, header docking and book artwork are retained.

Reading is now represented by a chip at the top of new and existing entries. Clicking it opens a reading editor for the passage, whole chapter or verse range, and date, with a remove action. There is no reading checkbox in the unified entry UI. Metadata changes preserve the Markdown body and revision, and moving an entry's date updates its calendar selection.

The real app now runs at `http://localhost:3000`, using current dev's Better Auth stack and the existing local Convex backend at port 3217. Local signing/proxy secrets were generated privately, and the existing development Google client credentials were copied privately to this local backend. Shared development and production were not changed. The preceding Clerk verification describes the earlier master-based run.

Validation after integration: 131 Vitest tests, 25 auth tests, 119 CFM tests and 35 Browse tests pass. Root/Convex TypeScript and focused ESLint pass. A new backend regression covers editing reading range/date without changing note text or revision, owner isolation and invalid dates. The signed-out real reader loads, but Google currently rejects `http://localhost:3000/api/auth/callback/google` with `redirect_uri_mismatch`. The owner subsequently approved adding that exact callback to the existing OAuth client. It was saved through Google Cloud Console and read back from the client settings. Google now accepts the redirect and reaches account selection/consent, but consent stayed on its loading overlay after Continue and one refresh/retry. No callback reached the local app during these attempts. The user was asked to finish that Google step in the open tab; authenticated browser verification of the chip remains pending on this dev base.


### Approved Google callback

Added only `http://localhost:3000/api/auth/callback/google` to the existing `scripture-sharing` OAuth web client after explicit owner approval. Existing redirect URIs and JavaScript origins were retained. Google Cloud Console confirmed `OAuth client saved`, and reopening the client showed the new URI alongside the existing callbacks. No client secret was changed.
