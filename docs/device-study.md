# Study without an account

Signed-out readers can save journal notes, reading logs, verse annotations, and guide highlights in browser storage. Scripture selections and dictionary cards can also be added to local notes. Saved entries survive navigation and reloads. Unsaved new-entry text still lives in the tab until Save entry is used.

The journal and reader panel explain that this study stays on the device. Account controls offer “Sign in to sync.” Signing in claims the device records for that account and imports them. They are removed from device storage only after the server confirms the import. Failed imports retain their local copy and offer a retry. Claimed records cannot be imported by a different account after an account switch.

Imports use durable receipts in `deviceStudyImports`. A lost response can be retried without duplicating a record, overwriting subsequent account edits, or recreating a deleted record. Journal dates and note/reading timestamps are retained. When a verse already has an account annotation, its text is kept and distinct local text is appended once; the existing highlight color is retained. A matching guide highlight also retains its account color.

Clearing site data removes local-only study. Account sharing and study plans keep their existing account requirements.

Deploy the updated Convex schema and functions with the frontend. No backend deployment was performed for this change.

Validation in this worktree: TypeScript and 184 Vitest tests passed, including storage failures, reload persistence, revisions, deletion, account ownership, import retries, and annotation merging. The existing reader/guide, auth, and browse suites passed. Real-app Chrome QA confirmed signed-out note creation, editing and persistence after reload, reader note-plus-reading saves, and verse annotation/highlight persistence. Live authenticated cross-device sync was not exercised because this checkout has no configured Convex backend.

## Journal goals

The journal homepage works signed out. Weekly study-day and reflection targets are saved in the same device notebook, remain after reload, and never alter recorded notes/readings. Existing device notebooks without targets use five study days and three reflections. Guest targets stay on this device; signing in uses that account's separate private targets. The homepage progress and revisit sections use the current guest or account journal, with no fabricated statistics.
