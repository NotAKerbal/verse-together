# Unified journal entries

A journal entry can hold note text, reading, or both. It is one `insightDrafts` row: reading is an optional
`readingAt` on that row, logged for the entry's `source`. Each entry is one card and one count in the journal.
The navigation label for `/notes` is now Journal.

## Provenance

This combines two efforts on the same base (`10c1936`):

- **Unified notes and reading** (thread branch `t3/unify-notes-and-reading-log`, never pushed). Its source was
  recovered read-only from a ready preview deployment's source archive, and only code, tests and config were taken
  from it. This branch adopts its data model, its Convex functions (`createJournalEntry`, `openReadingEntry`,
  `setJournalReading`), its reading chip, unified counting and lazily opening older readings, and the Journal labels.
  Its document also described preview deployments, local Clerk runs and OAuth changes. Those notes concern that
  thread's environments, are not repeated here, and none of its verification results are claimed for this branch.
- **Mobile Log** (`a481bce`, this branch) and current `dev` (`4d7e404`). This branch keeps the approved phone sheet:
  one fixed compact header row, one scroll, 44px controls, 16px inputs, keyboard and visual-viewport handling, and
  opening straight into a blank note. From dev it keeps note deletion with the outbox, empty-day simplification,
  selection and account changes, and the removal of the legacy assistant.

## Behavior

**Log** (reader header and Come, Follow Me header) opens the Log panel immediately on the one unsaved entry. Phones
get the bottom sheet and desktop the nonmodal right panel, with the reader keeping room beside it. Nothing is stored
until **Save entry**. The entry starts with:

- a reading chip naming the chapter the header shows (`logOptions[0]`), passed explicitly so it is right while the
  chapter text is still loading;
- a visible blank Markdown writer;
- the day.

Because opening creates nothing, a slow or repeated tap or a navigation can't open a stale sheet or make an extra
entry.

- Removing the chip makes a note-only entry, still linked to the chapter. Leaving the writer empty makes a
  reading-only entry. Save refuses an entry with neither.
- The chip edits the passage or guide, the whole chapter or a verse range, and the day.
- **New note** in the panel header starts the same unsaved entry, linked to the page and without reading.
- **All notes** lists saved entries by day, and opening one shows the saved-entry editor: the existing Markdown
  outbox editor with the same chip above it. Its reading changes go through `setJournalReading`, which leaves the
  text and its revision alone.
- On a chapter page the panel also keeps the chapter's **Mark chapter as read** toggle. Chapter completion and plans
  stay separate from an entry's reading, so marking, unmarking, editing or deleting an entry never changes them.
- The unsaved entry lives in `InsightBuilderProvider`. Closing the sheet or panel keeps its text, and unloading the
  page with text in it asks first. It is cleared when the account changes. While untouched it follows the chapter
  in view (desktop navigation with the panel open). Once it has text or a chosen reading it stays as it is.
- One request id lasts for the whole unsaved entry, so every retry names the same entry. A retry made after editing
  replaces the entry's content only while nothing has touched the entry since; it never overwrites later edits.
- On the Journal page, a day's **New note** shows the same unsaved entry inline, as a personal note for that day.
  Its chip offers the open note's source, the day's sources and recent reading. Older readings there open as
  editable entries.

## Data and server rules

The schema changes are additive (`convex/schema.ts`):

- `insightDrafts` gains `readingAt`, `entryRequestId` and `readingHistoryKey`, plus the index
  `by_clerk_entry_request`.
- A new table, `journalEntryDeletions` (`clerkId`, `key`, `deletedAt`, indexed `by_clerk_key`), is registered in
  `convex/ownership.ts`.

No existing field changes, and no migration runs.

- **`createJournalEntry`**: owner-only, validates the day, source and length, and refuses an entry with neither
  note nor reading. It is idempotent per owner and request id. It refuses request ids shaped like history keys. A
  request whose entry was deleted returns `{ id: null, deleted: true }` and creates nothing. The client then keeps
  the text under a new request id, so saving again makes a new entry.
- **`openReadingEntry`**: opens an older `readingLogs` row, or a legacy `chapterReads` completion, as an editable
  entry once. The new entry keeps the reading's day, source and time (`readingAt` and `createdAt` are the original
  read time). The original row is left as it is.
- **History keys** (`convex/noteJournal.ts`):
  - A legacy completion's key is `legacy-chapter-read:<chapterReadsId>:<readAt>`. The snapshot that
    `preserveLegacyChapterRead` takes of that same read on unmark or reread carries the same key as its request id,
    so one opened entry stands for both.
  - Other logs use `reading:<logId>`.
- **`setJournalReading`**: logs, edits or removes reading on a draft entry, and keeps the first `readingAt` through
  edits. Removing reading from an entry without note text is refused; deleting the entry is the way to remove it.
- **`deleteDraft`**: records the entry's create request id and history key in `journalEntryDeletions` before
  deleting the row. A late create retry then stays deleted, and the original reading the entry was opened from
  doesn't reappear. The original rows and chapter completion are untouched.
- **`listMyReadingLog`**: lists entries that log reading, each with its `note_id`, and hides originals that were
  opened as entries or whose entries were deleted. Whether a chapter mark covers a completion is still decided from
  every stored log, so hiding a mark never makes its completion reappear as a legacy read.
- **Privacy**: `reading_at` is returned only by the owner queries `listMyDrafts`, `getDraft` and `listMyJournal`.
  It is not returned by `getSharedDraft` or the published feed.

## Retired UI and kept APIs

Removed:

- `ReadingLogButton` / `ReadingLogForm`, which logged readings as separate records;
- `ChapterLogView`;
- `useNewNoteLauncher`, which created an empty note when the sheet opened;
- the desktop Log | Notes switch.

The other thread's dialog composer was not ported; its behavior is in `JournalEntryComposer` inside the shared panel.
`readingProgress.logReading`, `markChapterRead`, `createJournalNote` (still used by reader verse actions) and older
stored rows remain, so older clients and data keep working.

## Verification (this branch, working tree on `1ae5bd4`)

- **Passed**: `npx vitest run`, 160 tests in 18 files. These include `tests/journalEntry.test.ts`, the recovered
  backend suite ported against this backend plus new regressions:
  - create → delete → retry leaves nothing in the journal or history;
  - a retry carries earlier edits only while the entry is untouched;
  - history-key request ids are refused;
  - a manual reading opened, edited (date and range), with its reading removed and then deleted stays out of
    history, can't be reopened, and keeps its original row;
  - deleting an opened chapter mark leaves completion alone and doesn't bring back the legacy read, through a later
    unmark and reread;
  - an opened legacy completion stays hidden after deletion, including the snapshot a reread keeps;
  - unmarking while the entry exists lists it once;
  - deleting a new entry keeps completion and its mark, and owner isolation holds.

  The suite also includes `tests/entryDraft.test.ts`, editor chip rendering, and single counting with
  older-reading opening in the workspace. All existing dev tests, including deletion, outbox and history, pass.
- **Passed**:
  - `npx tsc --noEmit -p tsconfig.json`, apart from a stale generated `.next/types/validator.ts` that references the
    assistant route dev removed; regenerated by the next build;
  - `npx tsc --noEmit -p convex/tsconfig.json`;
  - `npm run test:auth` (25), `npm run test:cfm` (119), `npm run test:browse` (35);
  - `git diff --check`.
- **Passed**: targeted ESLint on new and changed files reports nothing on changed lines. The pre-existing findings
  that remain are in `convex/insights.ts` (`@ts-nocheck`, `any`) and `src/components/ChapterReader.tsx`.
- **Not run**:
  - the production build (left to the parent);
  - browser QA of the real app or the `qa/notes` harness;
  - real-device keyboards;
  - authenticated backend end-to-end checks;
  - deployment.

## Rollout requirements

Deploy the Convex schema and functions before, or together with, the frontend. The frontend calls
`insights:createJournalEntry`, `insights:openReadingEntry` and `insights:setJournalReading`, and reads `reading_at`
and `note_id`. Against an older backend, Log's Save entry and the reading chip would fail; existing notes would still
load. The schema change is additive and needs no backfill.
