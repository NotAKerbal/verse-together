# Independent review and draft autosave — October 28, 2026

Codex reviewed the third Claude pass on top of `98e4df9`. Independent checks: **Passed** 117 native tests
(1 optional snapshot exporter ignored), 5 renderer tests, 47 real Convex/Better Auth contract tests, strict
clippy, formatting and whitespace. The initial full native run exposed a wall-clock-sensitive undo test under
parallel machine load; its uninterrupted-typing sequence now controls the grouping clock between edits, and
the full suite passes. Production undo behavior still uses real input timing.

Codex added dirty-only draft autosaving at approximately 750ms for verse notes and Journal entries. Failed
writes keep the editor and error intact and retry every 10 seconds; idle editors have no autosave timer.
Two new tests verify open-draft persistence and write-failure recovery. A force quit may lose only text entered
since the last successful save, rather than the entire unsaved editing session.

Reviewed release SHA-256: `f17890bb2b833b68498bd550b3190079d157a4ef26db0e70cc9c0a238de539c1`.
Native GUI QA for autosave uses `/tmp/verse-autosave-gui-review --no-account`, separate from personal study data.
**Passed:** typed a new title and body through the real release editor without Save/navigation, confirmed both
in SQLite, sent SIGTERM only to that QA process, then confirmed the complete note survived termination.
Live account operation remains **Blocked** on server/page deployment and Google sign-in verification; macOS and
Windows execution are **Not run**. Current consumer gaps are documented in `PARITY.md` and remain active work.

Earlier implementation and review evidence follows.

# Remaining consumer parity — October 27–28, 2026 (third Claude pass)

Base `98e4df9` (`t3/rust-desktop-app`), uncommitted working tree in the shared checkout. Rust 1.99.1
(`/tmp/verse-native-tools/env.sh`), Ubuntu GNOME Wayland 1280×800. Not yet independently reviewed. No commit, push,
PR, merge or deployment was made. Release SHA-256 of the final build:
`4dda74e8a30de4966f65a99693854a83265e07be85926b361dd809412d0ed2ac`.

## What changed

- **JST read in place** (`jst.rs`, `jst_text.rs`): port of the website's `readJstChapter` alignment, rendered as
  `JstVerseText`, with the status line and "Show/Hide omitted KJV words".
- **Comparison view** (Reader settings "Inline / Side by side"): the website's inline diff (`renderInlineDiff`
  offsets) and side-by-side boxes replace the earlier under-verse rows.
- **Come, Follow Me lesson page, scripture-first** (`lessons.rs` `companion`, `lesson_page.rs`). The live website
  replaced the guide-plus-scripture-dock layout with this one on October 26 (`StudyCompanion`, confirmed on
  www.versetogether.org), so the brief's "dock scroll-following" has no website counterpart any more; the native page
  now matches the live one instead.
- **Plans** (`plan_model.rs`, `plans.rs`): plan list, plan page and the full builder/editor as on the website;
  Monday-first reading days (an earlier Sunday-first reading was wrong); exact `createPlan`/`updatePlan` arguments.
- **Journal editor**: live Markdown styling (`md_highlight.rs`) and undo/redo.
- **Share links**: website `/share/…` and `/browse/…` links opened from notes open the passage natively.

## Automated checks (final tree)

| Check | Command | Result |
| --- | --- | --- |
| Native tests | `cargo test --manifest-path native/Cargo.toml` | **Passed**: 115, 1 ignored (snapshot exporter). New: JST golden comparison with the website's own output, JST text runs, comparison diff offsets, lesson pairing/reading groups on the real October 26 guide and every guide, plan model (Monday-first days, pace, schedule, builder resolution), builder → exact Convex arguments, Markdown styling, undo/redo, share links |
| Renderer tests | `cargo test -p iced_tiny_skia` | **Passed**: 5 |
| Clippy / format / whitespace | `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `git diff --check` | **Passed** |
| Backend contracts (real Convex + Better Auth test runtime) | `npx vitest run tests/convex/nativeSync.test.ts tests/convex/nativeAuthHttp.test.ts tests/nativeAuth.test.ts tests/journalEntry.test.ts` | **Passed**: 47 (new: the builder's plan created and edited with selections, pace and reading days; other accounts refused; delete) |
| Typecheck / lint | `npx tsc --noEmit -p .`, `npx eslint tests/convex/nativeSync.test.ts native/scripts/generate-jst-golden.mjs` | **Passed** |
| Release build | `cargo build --release --locked` | **Passed** |

## Real desktop checks (final-pass release builds, Linux Computer Use, `--no-account --data-dir /tmp/verse-claude3-qa`, session bus disabled)

Screenshots: `/tmp/verse-claude3-evidence/` (headless renders in `headless/`).

- **Passed:** Mark 9 with the JST on: 9:3 read at verse 4 with its addition underlined; JST 9:40–48 across 43–48 with
  raised JST numbers; status line; omitted KJV words struck through after "Show omitted KJV words".
- **Passed:** Berean Standard Bible added from the catalog; Mark 9 inline ("KJV / BSB" changes) and side by side; the
  choice persisted across a restart; the JST verse shows BSB's plain wording beneath.
- **Passed:** October 26 lesson: Contents → Jeremiah 31 heading; "Context for verses 1–3" opens with its rubric
  reference, title and first paragraph; "Read full commentary" shows the rest; verses 1–2 selected and marked green
  (drawn under exactly the words; stored in SQLite for Jeremiah 31:1–2). Compared with the live page screenshot.
- **Found and fixed:** the first opening of the lesson made the window unresponsive for several seconds once; after
  removing duplicate anchors and repeated measuring, reopening and scrolling were responsive. Cold layout of the
  page measured headlessly at ~200 ms (release); not profiled further.
- **Passed:** Journal: a reflection with a heading, bold, italic, list, link and quote shows live styling (bold/italic
  fixed during the check: the text engine picks a word's font from its first character); Ctrl+Z undid the last word;
  Ctrl+S stored the Markdown exactly.
- **Observed (not changed):** an unsaved note is lost if the process is terminated (SIGTERM) rather than closed; the
  native editor saves on leave/close/Ctrl+S, while the website saves continuously.

## Signed-in pages

Plans (list, plan page, builder, editor) were rendered headlessly through the real view with a test session and plan
data shaped as `readingPlans:getPlan` returns it (`headless/plans-*.png`); the arguments the builder sends were
checked in Rust and accepted by the real functions in the Convex test runtime. They were **not** exercised against a
live account: sign-in and sync still need `convex/nativeAuth.ts`, `convex/nativeSync.ts` and `/native/authorize`
deployed, then live Google QA.

# Independent review of the repaired native expansion

Codex reviewed the final implementation on top of `756dfec` and independently passed 104 native tests
(1 optional snapshot exporter ignored), 5 renderer tests, 46 real Convex/Better Auth contract tests, strict
clippy, formatting and whitespace checks. The originally failing rapid-edit sync regression passes unchanged.
The account changes now use logical revisions, field-specific atomic mutations, idempotent creates, scoped
credentials, guarded drafts and generation-bound jobs. Live Google authentication and cloud sync are still
blocked on deploying the server and website changes; they have not been validated against production.

Reviewed release SHA-256: `52da3e7b618b6dda0c55c5e8547ded3da37913aa563281a3eaddd4d4269cdf70`.
The packaged binary matches. Native desktop verification used `/tmp/verse-final-parent-qa --no-account`:
Mark 9 with the live BSB comparison rendered; the new Journal opened, created and saved a reflection, and
Escape returned to the day. SQLite confirmed the exact title and body entered through the native editor.
Earlier independent checks also verified CFM Contents, the scripture dock, green highlights and persistence.
The release package contains no QA databases or credentials. Full remaining-feature inventory: `PARITY.md`.

The sections below retain the implementation agent's evidence and earlier build history.

# Native repair and parity continuation — October 27, 2026 (evening)

Base `756dfec`, uncommitted working tree on `t3/rust-desktop-app` (shared checkout
`/home/jeffrey-home/.t3/worktrees/verse-together/t3-b6b04554`). Rust 1.99.1 from `/tmp/verse-native-tools/env.sh`.
Linux GNOME Wayland 1280×800. No commit, push, PR, merge or deployment was made.

## Automated checks (all on the final tree unless noted)

| Check | Command | Result |
| --- | --- | --- |
| Native tests | `cargo test --manifest-path native/Cargo.toml` | **Passed**: 104 passed, 1 ignored (snapshot exporter). Includes the reviewer's `review_sync_ack_does_not_discard_a_second_edit_within_one_second`, 16 sync tests against a contract stand-in (lost replies, in-flight edits, conflicts kept once, deletions after lost creates, cancellation, backlog, canonical progress keys), 8 account lifecycle tests through the real update loop with an in-memory credential store, auth/loopback tests incl. decline and cancel-then-revoke |
| Renderer tests | `cargo test --manifest-path native/Cargo.toml -p iced_tiny_skia` | **Passed**: 5 |
| Strict clippy | `cargo clippy --manifest-path native/Cargo.toml --all-targets -- -D warnings` | **Passed** (no findings) |
| Format | `cargo fmt --check` | **Passed** |
| Release build | `cargo build --manifest-path native/Cargo.toml --release --locked` | **Passed** |
| Full Vitest (web + Convex, real Better Auth component) | `npx vitest run` | **Passed** (48 files) after updating `tests/journalEntry.test.ts` for `createJournalEntry`'s new `markdownRevision` field. One earlier full run had the rate-limit test time out under load; it passed alone and in the later full run |
| Native backend contracts | `npx vitest run tests/convex/nativeSync.test.ts tests/convex/nativeAuthHttp.test.ts tests/nativeAuth.test.ts tests/journalEntry.test.ts` | **Passed**: 46 (nativeSync 12: field-level verse sync, removals, coded refusals, ownership, UNAUTHENTICATED; idempotent creates with revisions, REVISION_CONFLICT, metadata-only saves, idempotent deletes; readings; device import replay; guide spans; plans. nativeAuthHttp 8: expired grant, foreign Origin refused, three concurrent exchanges → exactly one 200, account changed → 409, signed-out page → 401, bearer account management) |
| Typecheck | `npx tsc --noEmit -p .` and `-p convex` | **Passed** |
| Lint (new/changed files) | `npx eslint convex/nativeSync.ts convex/nativeAuth*.ts src/features/auth/NativeAuthorize.tsx src/app/native tests/…` | **Passed**. `convex/insights.ts` has pre-existing `@ts-nocheck`/`any` lint errors unrelated to this change |

## Real desktop checks (release build, Linux Computer Use, profile `/tmp/verse-claude-qa`, D-Bus isolated so the real keyring was never read)

- Study paths: live markers on 1 Nephi 1 (verses 1, 4, 5) and John 3; panels show kind, title, direction, notice list
  and sources. A click is presented within 300 ms (the debug build's long relayout had delayed it).
- Contents jump (October 26 guide → Jeremiah 31:1–3) presented within 600 ms without further input — the reported
  deferred redraw is fixed by redrawing after every programmatic scroll/focus (`presented`).
- Guide prose: dragging across words selects them (formatting kept); the green quick mark is drawn on exactly the
  span and stored with `part=reader`, the heading's block id, UTF-16 offsets, quote and 32-unit context.
- Your Bibles: Add a Bible → Berean Standard Bible; BSB shown under each KJV verse with changed words colored;
  preferences persisted. JST switch: Mark 9:43 shows the JST Mark 9:40–48 passage; a navigation jump stays on its
  verse after the extras load (fixed during this check).
- Explore "hand" (Mark 9): study helps topics, Strong's Greek entries with Greek lemmas, English meanings.
- Settings and Sign in screens (gear → Settings, no active nav link; Sign in card centered); the keyring-unavailable
  notice appeared because D-Bus was deliberately isolated. "Continue with Google" was not pressed (the production
  server does not have the endpoints yet).
- Plans signed out: "Sign in to keep a plan" card. Lesson cards, the featured card and the journal art have rounded
  corners (renderer change).
- Journal: wrote a reflection, Escape closed it to its day; a pasted `Ḥesed — covenant love ✓` was stored exactly.
- Synthetic clicks without prior pointer motion were sometimes missed on the first try; with a pointer move first
  they always registered (a real pointer always moves first). Not reproduced in the Iced simulator.

## Not verified / blocked

- All account features (sign-in, sync, Settings account sections, Plans signed in, copying device study) need
  `convex/nativeAuth.ts`, `convex/nativeSync.ts`, the `/native/authorize` page and the `createJournalEntry`
  revision change deployed, then a live Google sign-in test. Verified only against the repository's Convex and
  Better Auth test runtime and local stand-ins.
- macOS/Windows, accessibility, IME and long-form editing were not verified.
- The original handoff window (PID 666794) was already gone before this session's GUI work; it was not touched.

# Native web-parity expansion — October 27, 2026

Branch `t3/rust-desktop-app`, working tree on top of `756dfec37c7d327a7917ce1e743568abaa9f9105` (uncommitted;
the parent agent commits after independent review). Ubuntu 24.04.5, GNOME/Wayland 1280×800, Rust 1.99.1.
Claude implemented this expansion; it has not yet been independently reviewed. Feature inventory: `PARITY.md`.

Optimized executable SHA-256 (the build used for the final desktop checks): 50346ab5823f1c96e3021358981a994e5528741535f438e2f45cc6d891801abb.

## Automated checks

- **Passed:** `cargo test` — 65 passed, 1 ignored (snapshot export). New: mark model (UTF-16 offsets, range
  split/merge, presets), mark layer layout, journal model, lesson schedule/overview/covers/checksums/sections,
  store migration from an earlier profile with backup, failed-migration rollback, account/device isolation,
  journal persistence, sync payload mapping, PKCE vector, loopback callback validation, a full native sign-in
  round trip against a local stand-in server, word-range marking through the app, quick-mark editing.
- **Passed:** `cargo test -p iced_tiny_skia` — 5 renderer tests, including two new local corrections (below).
- **Passed:** `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `git diff --check`.
- **Passed:** `cargo build --release --locked`; `ldd` shows only libc/libm/libgcc (keyring uses pure-Rust D-Bus).
- **Passed:** `npx vitest run` — 46 files / 397 tests (one earlier run under high machine load had timeouts; the
  re-run passed). New `tests/convex/nativeAuthHttp.test.ts` runs the real Better Auth handler on Convex's test
  runtime: website session → `/native/grant` → `/native/token` with the PKCE verifier → bearer `get-session` →
  Convex JWT from `/convex/token` → code reuse refused → wrong verifier refused and burns the code → app
  sign-out ends only the app's session. `tests/nativeAuth.test.ts` covers the rules (RFC 7636 vector).
- **Passed:** `tsc --noEmit` for the app and `convex/`; ESLint on all new/changed web and backend files.
- **Passed:** a package staged at `/tmp/verse-parity-package` (from the build before the last renderer fix) (README, PARITY, VERIFICATION, licenses with 361
  dependency notices); `--version` runs with an empty environment; no databases or credentials in the archive.
  `native/dist` was not repackaged because the earlier handoff app is still running from it.

## Real native desktop checks (release build, Linux Computer Use)

Profile `/tmp/verse-parity-qa`, seeded with a SQLite backup copy of the earlier QA profile (`/tmp/verse-native-qa`
untouched; its handoff window was left running). Screenshots: `/tmp/verse-parity-evidence/`.

- **Passed:** the earlier profile migrated on first open: Alma 32:21's highlight became the web's yellow, its
  bookmark and note were kept, `study-before-v2.sqlite` was written.
- **Passed:** Journal: calendar, goals, invitation art and prompts, verse-note entry, writing a reflection
  (title focus during the glide, Markdown body, preview), closing back to the calendar, Ctrl+S, persistence
  across restarts, goal progress updating, opening a verse entry in the reader at that verse.
- **Passed:** Reader: highlight drawn under the words only; drag-selecting words and applying a green highlight
  and red underline to exactly those words; active-state rings and remove tooltips; marks persisted.
- **Passed:** Come, Follow Me overview (Oct 26 featured with Rembrandt cover and credit, chips, previous lessons),
  lesson hero, Contents jump, scripture dock opening at the section's verses, marking in the dock, the same marks
  shown in the reader via "Open in reader".
- **Passed:** Settings: account section (signed out), quick-mark rename/reorder/remove, dark and light themes.
- **Found and fixed during these checks:** Journal glide stalled without input events (frame ticker added); the
  title lost focus mid-glide (stable layer positions); opening the dock reset the guide's scroll (stable layout);
  dock and reader jumps ran before the target existed (deferred one message); dock marks misaligned (advanced
  shaping); cover/journal images spilled outside their frames and dark patches remained after switching to light
  (both renderer defects, fixed in `vendor/iced_tiny_skia` with regression tests; see its `PATCH.md`).

## Not verified / blocked

- **Blocked:** live sign-in and sync. The backend plugin, bearer plugin and `/native/authorize` page are not
  deployed; production currently answers 404, which the app reports. No live Google account was used; no
  browser was opened against production. Convex sync calls are verified for payload shape only.
- **Not run:** writing a session to the real system keyring (avoided touching the user's keyring); macOS and
  Windows builds; screen readers/IME; long-running sync stress.

# Native design-fidelity verification — October 27, 2026

Environment: Ubuntu 24.04.5 x86_64, GNOME/Wayland, 1280×800 desktop. Rust 1.99.1, Iced 0.14,
Tiny Skia with the checked-in correction described in `vendor/iced_tiny_skia/PATCH.md`, bundled SQLite.
Tested working-tree implementation on branch `t3/rust-desktop-app`, based on
`d973319cf46f5fc95e0cbb83eefe245a38183860`. The isolated toolchain lives under `/tmp/verse-native-tools`.

Claude implemented the main design-fidelity rewrite. Codex independently reviewed the source, measured the
live website, exercised the real native window, and repaired the renderer and search issues found in review.

Optimized executable SHA-256: 43f9829fd893b7795b5c84727d60c12d86554c372667a62805542daad445b604

## Design reference and acceptance

Reference: https://www.versetogether.org/browse/bookofmormon/alma/32, inspected live on October 27.
The implementation also follows the repository's Navbar, ReaderHeaderSlot, reader settings and global CSS.

- One header row with the navigation pill and current-chapter controls pill. Only the active destination has a label.
- Navigation uses the website's 280ms easing, 180ms label fades, sliding/resizing active indicator and rotating
  collapse chevron. Reversal continues from the visible position; animations stop requesting frames when settled.
- No default library sidebar, repeated scripture title/subtitle, permanent chapter strip, device/offline labels,
  or footer instructions. Previous/next links appear only in simple mode; keyboard chapter navigation remains.
- Default reader geometry at 1280px: header y16/height48, verse rows start y80, centered 896px text column,
  16px serif type with fixed 28px line height, 12px verse gaps, inline verse numerals and the web icon set.
- Reader settings use the website's 85–130% size range in 1% increments and comfortable/wide/full widths.
- The website's installed serif stack resolves to P052 on this host. A permissively licensed Pagella fallback
  and DM Sans are embedded. Native and browser text rasterization can differ; no pixel-identical claim is made.

## Automated checks

- **Passed:** `cargo test --manifest-path native/Cargo.toml` — 36 passed, 1 opt-in snapshot export ignored.
  Includes real Iced layout/click simulation, header transitions and reversal, reduced motion, one-row geometry,
  absence of removed reader furniture, minimum-width long breadcrumbs, panel navigation, inline number indents,
  immutable scripture, clipboard text, reference/FTS search, pending-query Enter handling and stale-result
  suppression, note draft preservation, profile migration and persistent notes/marks/read state.
- **Passed:** `cargo test --manifest-path native/Cargo.toml -p iced_tiny_skia shadow_` — 3 pixel-level renderer
  regressions. Damage clipping, shadow-only/tiled drawing versus full-frame rendering, and removed-shadow damage.
- **Passed:** `cargo clippy --manifest-path native/Cargo.toml --all-targets -- -D warnings`.
- **Passed:** `cargo fmt --manifest-path native/Cargo.toml --check` and `git diff --check`.
- **Passed:** `cargo build --manifest-path native/Cargo.toml --release --locked`.
- **Passed:** `bash native/package-linux.sh`; archive executable matches the tested release hash. Includes brand
  icon, optional installer, README, this verification report, font/icon/dependency licenses and renderer MIT license.
- **Passed:** packaged executable `--version` without the toolchain environment; archive contains no QA database
  or credentials. The earlier per-user installer check used an isolated XDG data path containing spaces.

## Actual native desktop checks

The optimized native app was launched and operated using Linux Computer Use on the real Wayland desktop.
The QA study directory `/tmp/verse-native-qa` is separate from the default profile and personal notes.

- **Passed:** expanded and collapsed navigation, re-expansion, and compact active-destination labels.
- **Passed:** opening search, typing a real FTS query, replacing it with a reference, Enter-to-open and exact
  verse selection/jump. Immediate Enter after typing is checked against the final build.
- **Passed:** repeated open/type/dismiss of the search panel leaves no accumulated gray shadow bands or stale
  panel pixels. The defect was found in real incremental rendering and corrected in the pinned renderer.
- **Passed:** book/chapter popovers and reader settings; local note and mark persistence retained after restart.
- **Passed:** screenshots captured directly from the final native release window, including the polished reader.
- **Passed:** native window closes cleanly with Alt+F4. The final packaged executable is left open for handoff
  using the isolated QA study directory.

Earlier end-to-end native checks also covered word selection/copy/paste, highlight/bookmark writes, note editing,
Ctrl+S, journal entries, all four stored guides, dark appearance and simple mode. Their automated persistence and
navigation coverage remains in the current test suite.

## Remaining limits

- **Not run:** macOS/Windows builds, broad Linux distribution compatibility, screen-reader/IME validation,
  long-running stress tests or browser/native pixel-diff testing.
- **Not implemented in this native edition:** Google sign-in, cloud note sync, shared/social content, remote
  Bible translations, online reference tools, AI insights or the web rich-text note editor.
- Native word dragging is within a verse; verse-number/range selection supports multi-verse copying.
  The journal lists the 1,000 most recently updated annotated/marked verses.

The Linux archive contains the application and bundled content, not the QA notes/database.
