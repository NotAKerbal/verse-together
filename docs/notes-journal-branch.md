# Notes journal feature branch

This branch implements the selected Journal design in the actual VerseTogether app. It does not migrate a database, deploy Convex, or release the site.

## Data compatibility and release order

- Existing insight drafts, blocks, publications, verse annotations, folders, folder assignments, chapter completion records, reading positions, and plans remain valid. No field or table is removed.
- New notes use canonical Markdown. Old notes are projected from their existing ordered blocks until the first explicit Markdown save. That save retains the original draft block rows as a recovery snapshot; subsequent block-level editing is refused to avoid two divergent editable copies.
- New fields are optional. Deploy the additive Convex schema/functions to an approved development environment before exercising the connected frontend. A production release needs a separate review and authorization; no migration command belongs in this branch's validation workflow.
- Dates on new entries are the local calendar day selected by the user. Old entries had timestamps but no recorded timezone/day, so their fallback day is the timestamp's UTC date. Earlier rereads cannot be reconstructed from the legacy single latest-completion record.
- Reading history is append-only through the new APIs and separate from chapter-completion/plan state. Before a future reread/unmark changes a legacy completion row, its last timestamp is retained in history when not already covered; no bulk migration is run. Unmarking a chapter changes completion state but retains already logged history. A guide/partial-reading log does not mark an entire chapter complete.
- Sources are captured from real app pages, with same-app relative links and optional scripture coordinates. Notes without recorded provenance remain personal notes. Legacy verse annotation text appears as read-only journal activity linking to its original editor.
- Each mutation checks the authenticated Clerk subject through Convex. New Markdown saves require the current revision; stale clients cannot silently overwrite newer edits. Reading request IDs prevent retry duplication per owner.
- `summaryHeading` is a dormant optional storage seam. This feature adds no model request, automatic summary job, enable switch, or settings interface.

## Review boundaries

The existing header, theme behavior, navigation icons, Browse reader and CFM split reader remain the foundation. The primary Study Plans destination becomes Come Follow Me; existing `/plans` routes and data remain available from the CFM index. Mobile Notes uses the existing persistent bottom navigation.

Implementation uses the existing authenticated Claude account with exact model `claude-opus-5-5`; Codex/Sol performs research, review and verification. Raw CLI transcripts remain outside the application repository. Final validation and known limitations are recorded below when complete.

## Verification

- `npm run test:notes`: 20 tests pass across persistence/authorization, legacy/publication compatibility, reading history, heading syntax, dates, and the serialized save outbox.
- `npx tsc --noEmit`: passes.
- Targeted ESLint for all new Notes modules and the modified provider/sidebar/progress components: passes without warnings. The old FlatCompat configuration was replaced with Next 16's flat exports so lint can run. Full-repository lint still reports legacy violations in existing backend/reader code; this branch does not broadly disable rules.
- `npm run test:cfm`: all 9 suite files pass. `npm run cfm:check`: all four content guides verify. `npm run test:ai-insights`: both existing helper suites pass without any model calls.
- `npm run build`: passes using a syntactically valid synthetic Clerk public key and a loopback Convex URL, without a real backend connection. Production credentials were not loaded or copied.
- Browser component QA covers desktop and phone calendar/day selection, empty-day behavior, opening notes, live heading markers, inline hashtags, editing/autosave, source links, reading submission and persistent mobile navigation. See `qa/notes/README.md` for the separate fixture harness.

Authenticated browser-to-development-Convex verification is pending: no development Clerk/Convex environment configuration was present in this isolated checkout. The additive backend schema/functions still need an approved development deployment before that verification. No production migration, backend deployment, live-site deployment or merge was performed.

Unsaved Markdown stays in a per-user in-memory outbox while navigating within the app. Failures retain the text and offer retry/copy; conflicts require an explicit choice. Closing/reloading with unsaved text raises the browser's normal unsaved-changes prompt. This is not an offline durable storage promise.
