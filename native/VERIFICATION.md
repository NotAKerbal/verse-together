# Independent Journal review — October 28, 2026

Reviewed the Claude Journal pass on desktop base `8a9acc6`, including one-document editing, composer
creation, reading metadata, published-note guards and responsive layouts. Inspected the paired reference/native
captures and the current dev website in the existing Chrome session (read-only, no account or study changes).

Review found and repaired two persistence issues:
- Incoming synced Markdown now uses the same lossless split as the editor: leading blank lines, heading spacing,
  a heading without a trailing body, and long title lines round-trip unchanged. The regression compares the
  complete reassembled text, not just its displayed title.
- An account switch first saves a written New entry under its original owner, then clears the composer and reading
  dialog. Explicit sign-out saves it before counting unsent changes, preserving the confirmation. A regression
  covers guest→account and expired account→guest; no draft is copied into another owner's study.

**Passed independently:** 183 native tests (1 optional exporter ignored), strict all-target clippy. 5 renderer tests, formatting, whitespace, release-history check and locked release build also **Passed**.
Final binary SHA-256: `c58271a8203b799fa1534bff568926b33ea05b05a655c7685faaaf2330ac0820`.

**Passed independently in the final release window:** isolated `/tmp/verse-journal-root-qa-1028`,
`--no-account`: Journal → Write a reflection → New entry; typed a heading, bold text and quote; SQLite confirmed
zero notes before Save entry and one exact-text note afterwards. Appended a second paragraph and confirmed
autosave in SQLite plus the Saved-at footer. Closed and restarted on the same profile and checked persistence.
Screenshot: `/tmp/verse-journal-reviewed.png`. No keyring or account write. Remaining cosmetic/editor differences
are listed in the Claude entry below; fresh account sync and platform/accessibility checks were not rerun. Logs `/tmp/verse-journal-root-{tests,clippy,release}.log`.
The previous live account rehearsal remains historical evidence; no new native grant or production write was made.

# Journal fidelity pass — October 28, 2026 (Claude, implementation)

**Tree:** `t3/rust-desktop-app` at `8a9acc6` plus this pass's **uncommitted** native changes. There was no commit,
push, PR, merge or deployment, no web/Convex/mobile/auth/env file changed, no release version, and no account,
keyring or feedback use. Reference: production `1647d51` (2.14.0) at `https://www.versetogether.org/notes`, signed
out in a throwaway headless Chrome. Its journal lives only in that browser's storage: there were no server writes and
no production data. The dev site answers headless browsers with Vercel SSO, so it wasn't used; the Journal code is the
same on dev. Environment: Ubuntu GNOME Wayland 1280×800 (window content 1214×734), Rust from
`/tmp/verse-native-tools/env.sh`, `CARGO_BUILD_JOBS=4`, about 299 GiB and 88% of inodes free. Evidence:
`/tmp/verse-journal-parity-1028/{ref,native-before,native-after,snapshots,logs}`.

## Audit (screenshots at the same viewport and states, measured boxes and computed styles)

The gaps found before editing, most visible first:

1. The note had a separate 30px title field, a toolbar (← / trash / Save·Saved), a date line and a rule. The website
   has one Markdown editor whose first line is the title, a rubric time line, the reading chip / "From …" /
   "Personal note", an X at the corner, and a footer with the save state and Delete note.
2. Write a reflection opened a note at once. The website opens the day's **New entry** composer and saves it only
   on Save entry.
3. The rail beside a note showed the full date, its cards were ruled rows with the time outside them, and New note
   sat at the bottom. The website has ‹, the short date, New note at the top, and bordered cards with their source
   line inside.
4. The day-list rows had the source line set apart with the wrong wording ("Written 10:41 AM" against "You wrote a
   personal note (no reading source) · 10:41 AM") and unclamped excerpts.
5. The goals panel was 20–35px tighter than the website, and "This month" showed in the first screen.
6. The goal dialog sat under the header (the header stayed bright), had no stepper dividers, was 26px shorter and
   didn't close on Escape.
7. There was no reading chip or reading editor: the native "Log reading" was a toggle.
8. Below 1024px the website shows its calendar, a day and the note as separate screens; native kept two columns.
9. The editor placeholder ("Write a note…" / the prompt) never drew.

## What changed

All of the above was fixed (details and remaining gaps in `PARITY.md` → Journal):

- **One editor:** `store.rs` `Note::markdown` / `set_markdown`, a lossless title/body split, and `display_title` as
  `deriveNoteTitle`. Excerpts now cover the whole Markdown (`markdownExcerpt`). Sync still sends `note_markdown`, and
  `split_markdown` moved into `store.rs` and is re-exported. There is no schema or migration change.
- **Composer:** `Composer` with its prompt, editor, Day, Save entry and Close. A written draft keeps its day, an
  untouched one follows the selected day, and a draft is saved when the app is closed normally.
- **Reading chip and editor:** a dashed outline widget, `popup` placement, verse checks and the move to the day
  read. Remove keeps the editor open when the note has no text.
- **Rail and rows:** `NoteSourceLine` with "You" or the account's name, and a `clamp_lines` helper. The list resets
  to its top on open and close (`snap_list`). Found during QA: it inherited the main list's scroll.
- **Goals:** goals spacing, and the goal dialog as a window-covering layer that Escape closes.
- **Narrow layout:** `journal_stages_view`.
- **Editor fixes (`md_editor.rs`):** the placeholder is a cached paragraph (it was never drawn); `grow` lets the
  composer's editor size to its text; `on_focus` gives the composer its accent border.
- **Icons:** `faFeather` and `faArrowRight` added through the icon generator.

## Checks (final tree)

| Check | Command / procedure | Result |
| --- | --- | --- |
| Native tests | `cargo test --locked` | **Passed**: 182, 1 ignored (snapshot exporter). 4 new: one-editor round trip and titles, composer, reading chip, narrow stages. 4 existing assertions updated to the website's behaviour (title in the body, excerpt over the whole Markdown, reading row text) (`logs/final-tests.log`) |
| Renderer tests | `cargo test --locked -p iced_tiny_skia` | **Passed**: 5 |
| Clippy / format / whitespace | `cargo clippy --locked --all-targets -- -D warnings`, `cargo fmt --check`, `git diff --check` | **Passed** |
| Release notes current | `node native/scripts/generate-release-notes.mjs --check` | **Passed** |
| Release build | `cargo build --release --locked` | **Passed**; SHA-256 `ca661881d33221e481ce914ffbb07ec03591cd7eb222e530c92b737643f548ce` |
| Headless snapshots (supporting only) | `VERSE_SNAPSHOTS=… cargo test snapshots -- --ignored` | See `logs/snapshots.log`; includes `journal-composer` |
| Web / Convex tests | — | **Not run**: no web or Convex file changed |

## Real desktop check (release builds, Linux Computer Use, `--no-account`, session bus disabled)

Profiles `/tmp/verse-journal-parity-1028/profile-after{1..4}`. The last QA build differs from the final binary only by
`cargo fmt` and a type alias. Shots are in `native-after/`, with the web's in `ref/` under the same names.

**Passed:**

- Empty day (01).
- Write a reflection → New entry scrolled into view, prompt shown, Write a reflection dimmed (02).
- Live Markdown typed (03); Save entry → the note opens with the rail (05).
- Caret on the title shows "#" (07); typing → "Saved at 11:18 AM" after autosave (07b).
- Delete confirmation (08); Escape and Cancel keep the note.
- The rail's New note (09) and a second, plain-first-line note titled by that line, wrapping in two lines exactly
  as on the website (10).
- Close → populated day (12); goal dialog over the whole window with the stepper changing 5→6 and Escape discarding
  it (14).
- Reader 1 Nephi 1:2 → Add to a journal note → dashed Log reading and "From 1 Nephi 1:2" (20); the reading editor
  (21); Log reading → "Read 1 Nephi 1:2 ⌄", the arrow, and "Reading logged" in the card (22).
- Narrow 920px window: the note under its day (30), the calendar stage (31).
- Window close → relaunch on the same profile: notes, reading and the verse's Note link and check were all kept (40).

Measured against the website: calendar, goals, invitation, day rows, rail cards, note header and footer all within
1–5px. Escape closes the reading editor first.

**Not run:** published or archived notes live (covered by state tests), a signed-in account (no new grant made),
dark mode, macOS/Windows, accessibility/IME. 280ms mid-glide frames aren't captured reliably by the desktop tool;
the motion code is unchanged.

# Dev account acceptance — October 28, 2026

**Live account code tested:** `9fcee660ae146878600e7d6f13c8b0a6ba5d38d8` on `t3/rust-desktop-app`.
**Final native source:** `ea6d869e61176e8ce0f4c5ffa6bd83315e0055e7`. This follow-up only closes the account
popover after accepted sign-out; its existing lifecycle regression also checks that state.
**Dev server:** `ab8b2b013dd258b497cc4eac0ea83b64df7046ea` (merged PR #70),
`https://scripture-sharing-dev.vercel.app`, `dev:fabulous-dogfish-606`.
**Production:** unchanged at `1647d51` (web 2.14.0); desktop production activation is still pending a separately
authorized release. Mobile auth/deletion files and desktop backend match `origin/dev` exactly.

## Repairs found by real account QA

- Native account HTTP now uses the configured Convex deployment's matching `.convex.site` API. Approval remains
  in the website browser. Vercel preview protection was refusing native requests to the website proxy; no
  protection was disabled and no provider/environment setting changed. Custom and localhost endpoints retain
  their proxy. Credentials are still scoped to website, deployment and profile.
- Convex JSON writes integral JavaScript values as floats (`2.0`). Normalize safe exact integers at the client
  boundary so revisions, verse numbers, word offsets, read chapters and typed plan/goal models are read correctly.
  Earlier stand-in tests used integer JSON and missed this wire-format difference.
- A clean open journal editor now reloads synced text and metadata, including its local revision. Previously a
  subsequent edit could fork unnecessarily. Unsaved local writing remains intact and still forks for a real
  concurrent change.
- Loopback callbacks tolerate a TCP-fragmented request line with the existing timeout and size bound.
- Accepted sign-out closes the account popover (it previously remained open with a stale Sign out action).
- Embedded release notes now match the merged 2.14.0/dev source.

## Checks

| Check | Result |
| --- | --- |
| Native `cargo test --locked` | **Passed:** 178, 1 optional snapshot exporter ignored |
| Patched renderer tests | **Passed:** 5 |
| Strict all-target clippy; fmt; whitespace; release-history generation | **Passed** |
| Locked release build | **Passed** |
| Dev integration web/backend suite | **Passed:** 484 tests with two workers, including 77 focused desktop/mobile/deletion/sync contracts; root/Convex types, changed-file lint, release check and 53 deploy-guard tests also passed before the dev merge. Native-only repairs did not change that backend |

Live-account-tested binary SHA-256: `baba80c6a38c054afebbfde7a65346c4ceeb586b443f5224e1b571625b751b4e`.
Final release/package binary SHA-256 (including the popover fix):
`cccaf1cec2aecd4bfe7b88c8b4fbcd7f18655465d14aac01ad96aaf0187672bf`.
All 178 native tests and strict clippy passed again on final source `ea6d869`.
Logs: `/tmp/verse-final-{native-tests,clippy,renderer,release}.log`; activation logs use
`/tmp/verse-activation-*` and `/tmp/verse-dev-activation-*`.

## Live dev acceptance

Real Linux release window, GNOME Wayland, isolated `/tmp/verse-dev-acceptance`, explicit dev site and Convex
overrides. Study writes were made only to dev. The user explicitly approved the desktop account grant.

- **Passed:** browser approval using an existing Google-backed website session, one-time code exchange, account
  profile/session loading, real OS-keyring storage and signed-in restore across app restart.
- **Passed:** native exact-word blue highlight on 1 Nephi 1:2 appears on the web and comes back to native with its
  UTF-16 range; a new native whole-verse green mark and verse note on 1:3 appear on the web and remain locally
  acknowledged (`dirty=0`).
- **Passed:** native journal excerpt reaches the web; web edits persist after reload and return with incremented
  revisions; renaming that synced note in native updates the same web entry, with no new duplicate. An extra
  earlier draft from the discovered defect is retained safely. The main test entry and verse annotation name desktop QA; the earlier untitled conflict copy is retained.
- **Passed:** a web goal change (3 to 4 reflections) appears in the native journal; native changes it back to 3 and the web confirms it. Original goals restored (5 study days, 3 reflections).
- **Passed:** a further web edit appears in the already-open, clean native journal editor without reopening it (remote revision 4, acknowledged locally). Screenshot: `/tmp/verse-dev-account-evidence/native-journal-live-sync.png`.
- **Passed, read-only:** signed-in empty plan list and full new-plan builder open against dev. No live plan was saved; create/edit/delete remain covered by backend contracts.
- **Passed:** desktop sign-out removes its cached account notes/marks (both counts zero); reloading the dev website still shows the signed-in account and its journal. The test app/window and browser tab were closed. The final release was reopened on the same profile and stayed signed out with an empty account cache, then was closed again. QA study entries remain on dev, while the original goals are restored.

**Not run:** a fresh Google OAuth round trip (approval reused the existing Google-backed web login), published
note/device-import acceptance, live account deletion, macOS/Windows, accessibility/IME. Historical entries below
record earlier states; their blanket deployment blockers are superseded for dev by this entry. Production is
still not activated. No credentials or study database belong in the distributed package.

# Independent final-polish acceptance — October 28, 2026

Codex reviewed the seventh Claude pass on base `cb9cf21`, including publication races and owner-scoped recovery,
read-only UI/store guards, reading-log matching, overlay placement, animation subscriptions and dialog handling.
**Passed independently:** 175 native tests (1 optional exporter ignored), 5 renderer tests, strict clippy,
formatting, whitespace and release-history generation check. Logs: `/tmp/verse-polish-review-{tests,renderer,clippy}.log`.
The release and packaged executables have the same SHA-256:
`ac11798ad9e7c8d39ba68cb0d2594b0d199d5b0991a142b2eb2d86ce342a72e0`.

**Passed, actual release window:** isolated `/tmp/verse-polish-root-qa`, `--no-account`, GNOME Wayland. Opened Settings,
switched to Translations, expanded Your Bibles to the window-sized dialog, opened the live catalog and exercised its
focused search/Escape. No account, keyring or feedback was used. The QA window was closed after review.
Published-account flows remain covered by state/sync tests, not a live deployment. Remaining differences are named
in `PARITY.md`; full visual/functional parity is not claimed.

Prepared `/tmp/verse-native-account-activation.patch` from the minimal file set in `ACCOUNT_ACTIVATION.md`.
**Passed:** patch applicability to current `origin/dev` `8022458` in a temporary source-only snapshot. No dev or
production branch/deployment was changed. Live Google/account acceptance remains **Blocked** on deployment;
macOS/Windows and accessibility/IME remain **Not run**.

# Final polish: motion, dialogs, reading log and published notes — October 28, 2026 (seventh Claude pass)

**Tree:** `t3/rust-desktop-app` at `cb9cf21` plus this pass's **uncommitted** native changes (no commit, push, PR,
merge or deployment; no web, Convex, provider or environment files changed; backend security untouched; no release
bump). Target: production 2.13.0 source (`2929d8a`). Environment: Ubuntu GNOME Wayland 1280×800, Rust from
`/tmp/verse-native-tools/env.sh`, `CARGO_BUILD_JOBS=4`, ≥300 GiB free. The previous pass's journal-only migration
backup and hidden-content window title fixes are kept. Release binary SHA-256:
`ac11798ad9e7c8d39ba68cb0d2594b0d199d5b0991a142b2eb2d86ce342a72e0` (the package's own hash is in `dist/*.sha256`,
written after this file).

## What changed (details and remaining gaps per row in `PARITY.md`)

1. **Settings tab motion** (`settings_ui.rs` `TabMotion`): the open tab's name reveals by the website's `max-width`
   (10rem) and `margin-left`, padding and `flex-grow` over 280ms `cubic-bezier(0.22,0.61,0.36,1)`, fades over 180ms and
   tints over 120ms; header and simple-mode placements; keyboard; reduced motion; frames only while moving.
2. **Your Bibles full-screen dialog** (`reader_tools_ui.rs` `bibles_dialog`): list in place with the full-screen
   button; catalog and language chooser in a window-covering modal with ‹ Back, title and Done, Escape steps.
3. **Floating note picker** (`note_links.rs` `floating`, `popup.rs` `Placement`): an overlay right-aligned to the
   marker, inside the window, following scroll; the chapter no longer moves when it opens.
4. **Reading-log marker** (`note_links.rs` `chapter_read_passages`, `margin.rs`, `store.rs` `chapter_reading_log`):
   the website's rule and check from this computer's or the signed-in account's log, owner-isolated; readings are
   not note links. Found during desktop QA and fixed: marking a chapter read didn't refresh the marker until the
   chapter was reopened.
5. **Published notes read-only** (`store.rs`, `sync.rs`, `journal_ui.rs`, `md_editor.rs` `read_only`): every
   mutation path guarded in the store and the UI; a `READ_ONLY` refusal or a publish while writing keeps the text as a
   separate draft of the same owner; refused deletes come back; status pill and list tags as on the website.
6. **Plan builder faith filter**: a rendered-view regression for other denominations, including editing a saved plan
   that keeps its Book of Mormon selection.
7. **Drag auto-scroll** past the window's edge (`main.rs` `edge_scroll`, `select_text.rs` re-picks on redraw). The
   caption italic was **not** changed (see PARITY: the website's slant is browser-synthesized; not a small change).

## Checks

| Check | Command / procedure | Result |
| --- | --- | --- |
| Native tests | `cargo test --locked` | **Passed**: 175, 1 ignored (snapshot exporter); 10 new (`/tmp/verse-polish-tests.log`) |
| Renderer tests | `cargo test --locked -p iced_tiny_skia` | **Passed**: 5 |
| Clippy / format / whitespace | `cargo clippy --locked --all-targets -- -D warnings`, `cargo fmt --check`, `git diff --check` | **Passed** |
| Release notes current | `node native/scripts/generate-release-notes.mjs --check` | **Passed** |
| Headless snapshots | `VERSE_SNAPSHOTS=/tmp/verse-polish-snap cargo test snapshots -- --ignored` | **Passed**; reviewed `journal-published`, `journal-published-list`, `reader-reading-log(-picker)`, `settings-tabs-120ms`, `settings-translations`, `bibles-dialog-list/-catalog` |
| Release build, package | `cargo build --release --locked`, `native/package-linux.sh` | **Passed** (hash above) |
| Web / Convex tests | — | **Not run**: no web or Convex file changed |

## Real desktop check (release build, Linux Computer Use, `--no-account --data-dir /tmp/verse-polish-qa/profile`)

Screenshots `/tmp/verse-polish-qa/screens/01…13.png`. **Passed:** Mark chapter read on 1 Nephi 1 → rule and check
at the verses' left edge with the text unmoved (x=229 before and after); "Logged as read" on hover; the check opened
Oct 28 in the journal with "Read 1 Nephi 1". Settings → Reading: a mid-transition frame and the settled tabs; 0 CPU
ticks over 5s idle afterwards. Translations: full-screen button → dialog over the whole window; "+ Add Bible" → live
catalog with the search focused; Change › → "espanol" → Spanish · español; Escape back to the catalog; BSB added →
dialog list; Escape closed. Reader: two notes added on 1:2 → "2 notes" → the picker floated over verse 3 (unmoved),
followed a wheel scroll, Down + Enter opened "First thought". The QA window was closed; no account, keyring or
feedback was used.

## Not run / Blocked

- **Blocked:** live sign-in/sync (deployment, `ACCOUNT_ACTIVATION.md`). Published/archived read-only notes, the
  account's reading log, the `READ_ONLY` sync recovery and the plan builder are verified by unit/state tests against
  the real views and a stand-in following `convex/nativeSync.ts`, and by headless renders — **not live**.
- **Not run:** drag auto-scroll in a live window (the desktop tool can't hold the button outside the window; verified
  headlessly); macOS/Windows; accessibility/IME.

# Independent settings acceptance — October 28, 2026

Codex reviewed the sixth Claude pass on base `27c2908`, including asynchronous translation loading and stale-result
checks, word-mark matching across translations, owner-scoped note statuses, draft-safe note opening, feedback
transport and filtering. **Passed independently:** 165 native tests (1 optional exporter ignored), 5 renderer tests,
strict clippy, formatting, whitespace and release-history generation check. Evidence is in
`/tmp/verse-settings-review-{tests,renderer,clippy,build}.log`.

Review found and fixed a migration-backup gap: journal-only profiles now get a backup before upgrading, as do
profiles containing only reading logs or guide marks. A regression verifies the original note and v4 schema in
the backup. The window title also stops naming hidden scripture when the faith-tradition notice is shown.

**Passed, actual release window:** isolated `/tmp/verse-settings-root-qa`, `--no-account`, Linux GNOME Wayland.
Opened Settings/Reading, changed faith tradition and confirmed the LDS navigation disappeared; opened the real
release-notes viewer with its embedded screenshots. No feedback was submitted and no account/keyring was used.
The QA window was closed. Those GUI checks preceded the backup/title corrections; their final build passed.

Final release SHA-256: `c41d543e03b77c44319c7142e2e2073a9937d35374e8e98deeb063994962feab`.
Account deployment/live Google QA remains **Blocked**. Remaining UI polish and published-note read-only handling
are continuing work; this does not claim full parity. macOS/Windows and accessibility remain **Not run**.

# Website 2.12–2.13 core features — October 28, 2026 (sixth Claude pass)

**Tree:** `t3/rust-desktop-app` at `27c2908` plus this pass's **uncommitted** native changes (no commit, push, PR,
merge or deployment; no web, Convex, provider or environment files changed; no release bump). Environment: Ubuntu
GNOME Wayland 1280×800, Node 24, Rust from `/tmp/verse-native-tools/env.sh`, `CARGO_BUILD_JOBS=4`. Release binary
SHA-256: `1e37e4da7543b9e4d04aa02bf91a23d36a1ecb5f69eb2a6c96806a65bcf8ba4a` (the package's own hash is in
`dist/*.sha256`, written after this file).

## What changed

The six gaps the merge of production 2.13.0 listed are implemented against the website's source (details, tests and
remaining gaps per feature in `PARITY.md`, "Website 2.12–2.13 additions"):

1. **Settings tabs** (`settings_ui.rs`): Account, Reading, Translations, Study tools, Release notes, Feedback, in the
   header from 900px or on the page in simple mode, with the website's keyboard rules; existing account/sync,
   simple mode, appearance and quick-mark controls moved to their sections.
2. **Faith tradition** (`faith.rs`): the website's rules and every filter it applies (navigation, Library, volume
   picker, search, reader tools, JST, labels, plan builder, hidden-content notice, Browse return); a device
   preference that never deletes study data.
3. **Default Bible** (`reader_tools.rs` `Primary`): Make default in Settings and Reader settings; Bible chapters
   read the default from the website off the UI thread, cached in memory, falling back to the bundled KJV with the
   website's notice; marks follow `matchingTextMarks`; never compared with itself; JST on the bundled KJV only.
4. **Feedback** (`feedback.rs`): the website's form rules, limits, states and `feedback:submitFeedback` request.
5. **Release notes** (`release_notes.rs`, `assets/release-notes.json`, `scripts/generate-release-notes.mjs`,
   `build.rs`): the website's history and screenshots embedded, without claiming a desktop history.
6. **Note links beside verses** (`note_links.rs`, schema v5 `note_status`, `sync.rs` records listed statuses): the
   website's body-link rule, grouping, picker and statuses; drafts saved before a note opens.

Also: Font Awesome `comment-dots` and `rotate-left` icons; underlined controls draw their underline as a rule (the
note marker's at 25%, as on the website); search takes a Bible-only flag.

## Checks

| Check | Command / procedure | Result |
| --- | --- | --- |
| Native tests | `cargo test --locked` | **Passed**: 164, 1 ignored (snapshot exporter). 24 new: `faith::tests` (3), `feedback::tests` (5), `note_links::tests` (3), `release_notes::tests` (2), `settings_ui::tests` (2), `parity_tests` (8), `ui_tests::settings_has_the_websites_six_tabs_in_the_header_and_follows_the_keyboard` |
| Renderer tests | `cargo test --locked -p iced_tiny_skia` | **Passed**: 5 |
| Clippy / format / whitespace | `cargo clippy --locked --all-targets -- -D warnings`, `cargo fmt --check`, `git diff --check` | **Passed** |
| Release notes current | `node native/scripts/generate-release-notes.mjs --check` | **Passed** |
| Headless snapshots | `VERSE_SNAPSHOTS=/tmp/verse-snap-213 cargo test snapshots -- --ignored` | **Passed** (rendered and reviewed: every Settings section, simple-mode tabs, release viewer, note links, fallback notice, other-denomination Library and notice) |
| Release build, package | `cargo build --release --locked`, `native/package-linux.sh` | **Passed** (binary hash above; package holds only the binary, docs, icon, installer and licenses) |
| Web / Convex tests and typecheck | — | **Not run**: no web or Convex file changed in this pass (the previous pass's 50 backend contracts and typechecks stand) |

## Real desktop check (release build, Linux Computer Use, `--no-account --data-dir /tmp/verse-qa-213/profile`)

Screenshots: `/tmp/verse-qa-213/screens/01…15-*.png`. **Passed:**

- Note links: Add to a journal note twice on 1 Nephi 1:2 → "2 notes" beside verse 2; the picker listed both as Draft;
  a verse-note draft typed first was saved (SQLite `annotations` row "Draft verse thought") when Down + Enter opened
  "Learning of my father" in the journal.
- Settings: tabs at the header's right; Right/Left/End moved between sections, wrapping.
- Faith tradition: "Other denominations" removed Come Follow Me from the navigation; Browse went to the Library
  (Journal, Old and New Testaments only, "Search or jump to John 3:16"); the reader at 1 Nephi showed the website's
  notice; its Settings link opened Reading; Translations named "King James Bible" with no JST section; search scopes
  All/OT/NT; Resources absent for verses. Switching back restored the three links.
- Default Bible: BSB added from the live catalog (saved, not shown for comparison), Make default; John 3:16 opened
  in the BSB fetched live from `/api/scriptures/chapter` with the jump kept on verse 16; Reader settings showed BSB as
  Default without a Show switch.
- Release notes: the website's entries and thumbnails; a screenshot opened full size and Escape closed it.
- Feedback and fallback, with `VERSE_TOGETHER_SITE`/`VERSE_TOGETHER_CONVEX_URL` set to a recording stand-in on
  `127.0.0.1:47613` (`/tmp/verse-qa-tools/mock_convex.py`, log `/tmp/verse-qa-213/mock.log`): John 3 showed the
  bundled KJV with "Your default Bible couldn't load this chapter. Showing King James Bible (LDS edition) instead.";
  "hi" showed "Write at least 5 characters." and sent nothing; the first real send got the stand-in's 502 and kept the
  draft with the website's failure message; the retry showed "Thanks! Your feedback was sent." and cleared the form.
  The stand-in recorded exactly two `POST /api/mutation` bodies `{"path":"feedback:submitFeedback","args":{"message":…,
  ["contact":"qa@example.invalid",] "path":"/native/account"},"format":"json"}` with no Authorization header.
  **No feedback was sent to production.**

The QA app and stand-in were stopped; no personal keyring, account or study data was used.

## Not run / Blocked

- **Blocked:** live sign-in/sync (deployment, `ACCOUNT_ACTIVATION.md`), so feedback linked to an account and the
  account's Published statuses are verified by tests only.
- **Not run:** feedback against the live deployment (not authorized); macOS/Windows; accessibility/IME; the plan
  builder's faith-tradition filtering in a window (code review only; the builder needs sign-in).

# Independent production-integration review — October 28, 2026

Codex reviewed the merge of production `2929d8a` into desktop `e36e8a2`, including the minimal account diff
against production, bearer hooks in the installed Convex/Better Auth source, revised scripture excerpts and
the single guide catalog. **Passed independently:** 140 native tests (1 optional exporter ignored), 50 real
backend/auth contracts, strict clippy, formatting and whitespace. Evidence:
`/tmp/verse-integration-review-{rust,backend,clippy}.log`.

The Convex plugin includes the bearer request hook, while the removed full bearer plugin also added a
script-readable session response header. The regression test confirms website sign-in has no such header
and app requests without cookies or Origin still authenticate. Live Google/sign-in/sync remain **Blocked**
on deployment. New web settings and per-verse Journal links remain active native implementation work.

# Production integration and account activation prep — October 28, 2026 (fifth Claude pass)

**Tree:** `t3/rust-desktop-app` HEAD `e36e8a2` with production `origin/master` **2929d8a** (release 2.13.0) merged
locally (`git merge --no-commit --no-ff`; `MERGE_HEAD` 2929d8a, merge base `d973319`). This tree is **uncommitted**, with no
push, PR, merge to master or deployment. The auto-merge had no conflicts (`convex/insights.ts`, `package*.json`,
`tests/journalEntry.test.ts` merged automatically). Compared with `origin/master`, the resolved tree adds only the native and desktop files and
keeps every production web change. Environment: Ubuntu GNOME Wayland 1280×800, Node 24, Rust from
`/tmp/verse-native-tools/env.sh`, `CARGO_BUILD_JOBS=4`. Release SHA-256:
`ed1df9f3e38a72031181b1945715dda565a9e08881efdfd04f6427a878f3a901`.

## What changed in this pass

- **Note anchors (production 2.13.0):** a note's reading source no longer marks verses on the website; only verse
  links in the body do. Native's reader **Add to a journal note** wrote a native-only quote ("> **2** text … — 1 Nephi
  1:2-3") with no verse link, so its synced notes would show no markers on the website. It now writes the website's
  `onAddToNote` blocks through `journal::scripture_block`/`verse_passages`: per run of consecutive verses, a bold
  reference linked to its first verse, with verses as separate quote paragraphs. The goldens were generated by the website's
  own `scriptureExcerpt`/`selectedVersePassages`/`blockToMarkdown`/`scriptureLinksForChapter`.
- **Lesson excerpts:** non-consecutive verses were labelled "Jeremiah 31:3-6", which would also mark verse 5 on the
  website. The label is now `formatPassageReference` ("Jeremiah 31:3–4, 6").
- **Guides:** production's catalog now lists the October 26 guide, so `native/upstream-guides.json` was removed and
  the build embeds `content/cfm/guides.json` only, refusing a slug listed twice.
- **Auth security fix:** `convex/auth.ts` no longer adds Better Auth's `bearer()` plugin. In better-auth 1.6.33
  its response hook copies every website session token into a script-readable `set-auth-token` header (a new test
  proved that website sign-up exposed it). `@convex-dev/better-auth` 0.12.5's Convex plugin already runs the bearer
  request hook the app needs. Every app call still passes.
- **New contract tests:** exchange and sign-out sent as the app sends them (no Origin, no cookie); website sign-in
  has no `set-auth-token`; the approval URL survives Google sign-in and the sign-in page; a note created as the app
  creates it marks exactly its linked verses, while a reading source alone marks nothing, including after a revision-checked save.
- `native/ACCOUNT_ACTIVATION.md`: minimal server/frontend change set, configuration checks, release order,
  rollback, and the live Google/account/sync acceptance steps. `PARITY.md` lists the 2.12–2.13 additions.

## Checks (final tree)

| Check | Command | Result |
| --- | --- | --- |
| Full Vitest (web + Convex, real Better Auth) | `npx vitest run` | **Passed**: 55 files, 457 tests. A first run under load average ~9 timed out once in `authRateLimitHttp` (5 s limit); that test passed alone, and two later full runs passed |
| Native backend contracts | `npx vitest run tests/convex/nativeSync.test.ts tests/convex/nativeAuthHttp.test.ts tests/nativeAuth.test.ts tests/journalEntry.test.ts` | **Passed**: 50 (nativeSync 14, nativeAuthHttp 8, nativeAuth 4, journalEntry incl. production's new reading-reflection test) |
| Typecheck | `npx tsc --noEmit -p .`, `-p convex` | **Passed** |
| Lint (changed files) | `npx eslint convex/auth.ts convex/nativeAuth*.ts convex/nativeSync.ts convex/noteScriptureLinks.ts src/features/auth/NativeAuthorize.tsx src/app/native src/lib/chapterClient.ts src/lib/desktop.ts tests/… scripts/desktop` | **Passed**. `convex/insights.ts` has 45 problems, the same as production master's copy (pre-existing) |
| CFM, release, deploy, desktop scripts | `npm run test:cfm`, `test:release`, `release:check`, `test:deploy`, `test:desktop` | **Passed**: 160 CFM; release tests; "Version 2.13.0: release notes, package.json, package-lock.json and screenshots agree"; deploy guard tests; 5 desktop |
| Native tests | `cargo test --locked` | **Passed**: 140, 1 ignored (snapshot exporter). New: `scripture_blocks_are_written_like_the_websites_excerpts`, `the_readers_add_to_note_quotes_each_run_under_its_verse_link_like_the_website` |
| Renderer tests | `cargo test --locked -p iced_tiny_skia` | **Passed**: 5 |
| Clippy / format / whitespace | `cargo clippy --locked --all-targets -- -D warnings`, `cargo fmt --check`, `git diff --check` | **Passed** |
| Release build, package | `cargo build --release --locked`, `native/package-linux.sh` | **Passed** (hash above) |
| Production probes (unauthenticated GET) | `curl` | `versetogether.org` → 307 `www`; `/api/auth/get-session` 200; `/native/authorize` and `/api/auth/native/token` **404** (not deployed) |

## Real desktop check (release build, Linux Computer Use, `--no-account --data-dir /tmp/verse-merge-qa`, session bus disabled)

**Passed:** dragged across 1 Nephi 1:2–3 in the reader, then Add to note opened a journal note showing a bold
"1 Nephi 1:2–3" reference over two separate quoted verse paragraphs. After Save, SQLite held
`**[1 Nephi 1:2–3](</browse/bookofmormon/1nephi/1#v-2>)**\n> Yea, I make a record …\n>\n> And I know …`, with the
reading source kept as context. Production serves both `/browse/bookofmormon/1nephi/1` and `/1-nephi/1` (200), and
the website's marker parser normalizes the book key. The QA window was closed and the other agent's desktop was left
untouched. Multiple-run selections were verified by tests only (the desktop tool can't hold Shift/Ctrl during a click).

## Not run / Blocked

- **Blocked:** live Google sign-in, approval, sync and plans against any deployment. They need the activation
  PR deployed (dev rehearsal first) and parent approval; see `ACCOUNT_ACTIVATION.md`.
- **Not run:** macOS/Windows, accessibility/IME, the website's new faith-tradition/default-Bible/feedback/release
  notes features in native (listed as Not ported in `PARITY.md`).

# Independent acceptance — October 28, 2026 (fourth pass)

Codex independently reviewed the native widget, selection mapping, editor, persistence and navigation changes
on base `5593e22`. **Passed:** 138 native tests (1 optional exporter ignored), 5 renderer tests, 47 real
Convex/Better Auth backend contracts, strict clippy, format and whitespace checks. Logs are retained at
`/tmp/verse-pass4-review-{tests,renderer,backend,clippy}.log` on the review machine.

**Passed, actual release window:** `--no-account --data-dir /tmp/verse-pass4-root-qa`, Ubuntu GNOME Wayland.
Dragged across 1 Nephi 1:2–3 and applied blue; SQLite confirmed each verse's own selected text and UTF-16
range. Opened the Library grid and Journal, wrote a heading, emphasis, scripture link and a continued list;
verified heading size, hidden syntax off the caret line, syntax revealed at Ctrl+Home, undo/redo, and the full
Markdown persisted by autosave without Save or leaving the editor. The QA profile is separate from personal
data and the QA window was closed after review. The packaged executable matches the reviewed release hash below.

Account deployment/live Google QA remains **Blocked**; macOS/Windows execution and accessibility/IME validation
remain **Not run**. This review does not claim those integrations have been exercised.

# Final core-study parity pass — October 28, 2026 (fourth Claude pass)

Base `5593e22` (`t3/rust-desktop-app`), uncommitted working tree in the shared checkout. Rust 1.99.1
(`/tmp/verse-native-tools/env.sh`), Ubuntu GNOME Wayland 1280×800. Implementation evidence follows; independent
acceptance is recorded above. Claude made no commit, push, PR, merge or deployment. Release SHA-256 (packaged binary identical):
`e7ae4eab19b995f8811f5517d0236c7b88c93d1961b12f292ab4d10fcbedca8f`; package
`verse-together-native-linux-x86_64.tar.gz` SHA-256 in `dist/…tar.gz.sha256`.

## What changed

- **Selection** (`select_text.rs`, `text_selection.rs`): one selectable-text widget for reader verses, comparison
  verses, lesson verses and guide prose, replacing the per-verse stock text editors and `rich_select.rs`. A drag
  runs across paragraphs; display offsets map back to each verse's own words (UTF-16 of the KJV text) through a
  display map that excludes indents and other Bibles' words; guide drags map to part offsets with multi-block
  anchors. Text is shaped once per change of text or width; selections/marks are painted from the glyph layout.
  `design::measure` results are now cached (views measured every verse number indent on every redraw).
- **Lesson page**: word selection across verses and chapter breaks, the selection menu (reference, Copy, Add to
  note with per-chapter excerpts, verse note on the first verse, quick marks and every style). The reader's mark
  tools now act on lesson targets across chapters (`MarkTarget`).
- **Guide prose**: multi-paragraph selections; "Saved passages here"; marks apply to exactly the selected span;
  Copy and Add to note.
- **Journal editor** (`md_editor.rs`, `md_live.rs`): a native editor widget with the website's live preview
  (hidden syntax off the caret line, heading sizes, link underlines, quote rule, code), Ctrl/⌘-click on safe
  links, list continuation, undo/redo with the caret restored; the Write/Preview switch is removed. Day previews
  follow `markdownExcerpt`.
- **Browse** (`library_ui.rs`, generated `book_art.rs`): the `/browse` Library grid with Continue reading, volume
  book lists with the website's book art and categories, chapter grids, selection controls in the header, and the
  website's Browse-link return behavior.
- **Plans**: browser-style date fields with a calendar popup (`popup.rs`) and validation.
- **Your Bibles**: the website's catalog picker and language chooser (`bible_catalog.rs`).

## Automated checks (final tree)

| Check | Command | Result |
| --- | --- | --- |
| Native tests | `cargo test --manifest-path native/Cargo.toml` | **Passed**: 138, 1 ignored (snapshot exporter). New: cross-verse marking, comparison selection (inline/side by side), lesson cross-chapter marks/excerpt/verse note, multi-paragraph guide anchors, Library navigation and art, Markdown live-preview rules, editor editing/list continuation/undo caret/layout mapping/link hit-testing, plan date typing and calendar keyboard, catalog/language ranking, simulated language-chooser clicks, display-map and glyph-painting unit tests |
| Renderer tests | `cargo test -p iced_tiny_skia` | **Passed**: 5 |
| Clippy / format / whitespace | `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `git diff --check` | **Passed** |
| Backend contracts (unchanged backend) | `npx vitest run tests/convex/nativeSync.test.ts tests/convex/nativeAuthHttp.test.ts tests/nativeAuth.test.ts tests/journalEntry.test.ts` | **Passed**: 47 |
| Release build, package | `cargo build --release --locked`, `native/package-linux.sh` | **Passed**; package holds the binary, README/PARITY/VERIFICATION, icon, installer and licenses only (no QA data or credentials) |
| Headless renders | `VERSE_SNAPSHOTS=… cargo test snapshots -- --ignored` | **Passed**; `/tmp/verse-claude4-evidence/headless/` incl. `plans-date-picker`, `library`, `library-volume`, `library-book` |

## Real desktop checks (release builds, Linux Computer Use, `--no-account --data-dir /tmp/verse-claude4-qa`, session bus disabled)

Screenshots: `/tmp/verse-claude4-evidence/` (numbered).

- **Passed:** 1 Nephi 1: a drag from mid-verse 2 into verse 4 selected across three verses; blue quick mark drawn
  on exactly those words; SQLite holds three per-verse UTF-16 ranges with the exact text; persisted after restart.
- **Passed:** Journal: typed a heading, bold, italic, a link, a list (continued on Enter) and a quote; syntax hidden
  off the caret line, shown on it ("#" revealed on the heading); heading larger. Found and fixed: a heading inside a
  quote wasn't recognized; empty-note placeholder. Ctrl/⌘-click could not be exercised (the desktop tool can't hold
  a modifier during a click) — **Not run** live; covered by unit tests.
- **Passed:** Browse: Library grid with art; Book of Mormon → books with categories; Alma → chapter grid; chapter 32
  opened in the reader; Browse from the Journal returned to the reader at the same place. Found and fixed: art edge
  hairline and square corners, header search text alignment, selection controls moved to the header, and the
  Library landing page being remembered as the return point (the website doesn't).
- **Passed:** October 26 lesson: a guide selection across four blocks (paragraphs and list items, bold kept) marked
  green and stored with its multi-block quote; a verse selection from Jeremiah 31:40 into 32:1 ("Jeremiah 31:40;
  32:1") marked pink in both chapters and a note written on 31:40 from the menu; the note appears in today's Journal.
- **Passed:** Mark 9 with the live BSB: Add a Bible → Change › → "espanol" → Spanish · español → Spanish Bibles;
  "BSB" in Spanish → "No Bibles match … in Spanish" → Search all languages → added BSB. Inline comparison: a drag
  through "/ radiantly" took only "became shining, exceeding white as" (stored exactly); side by side shows the mark
  on the LDS box, and a drag across 9:3–4 boxes selected both verses.
- **Not run live:** the plan builder's calendar (the builder needs a signed-in account; verified by tests and a
  headless render). Found and fixed in the render: the calendar panel stretched to the window width.
- **Observed, not changed:** one screenshot right after a Library card click still showed the previous active nav
  label; the next capture showed the correct one (likely capture timing; not reproduced).
- **Not profiled numerically:** dragging on the lesson page (about 300 selectable verses plus guide blocks) was
  visually immediate in the release build; text is reshaped only for changed paragraphs and measurement is cached.

## Remaining external blockers

Live account features (sign-in, sync, Settings account sections, Plans signed in) still need `convex/nativeAuth.ts`,
`convex/nativeSync.ts`, the `createJournalEntry` revision change and `/native/authorize` integrated with current
production source, deployed, and verified with live Google sign-in. macOS/Windows execution, accessibility and IME
composition are not verified.

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
