# Verse Together — native Rust edition

A native offline study app, built with Rust, Iced and SQLite. It follows the website's reader layout: one header
row with the navigation pill (only the current destination labelled; collapsible) and the chapter's controls pill,
the same 896px reading column, 16px/28px reading type, inline rubric verse numbers, Font Awesome icons and the
website's 280ms header motion. Reading type uses the website's serif stack as installed (P052 on most Linux
systems), with bundled TeX Gyre Pagella as the fallback. It contains no webview, JavaScript runtime,
Node server, or remote page. The reader and controls are Rust widgets. SQLite is bundled through rusqlite.

## Run the Linux package

Extract `verse-together-native-linux-x86_64.tar.gz` and run:

```sh
./verse-together
```

Or double-click the executable in a file manager. The package targets Ubuntu 24.04 x86_64 and compatible
Linux systems with Wayland or X11. No Rust or Node installation is needed. Run `./install-desktop.sh` from
the extracted package if you want a per-user application-menu entry and branded dock icon. It installs
under your user data directory, needs no sudo, and creates no services or autostart entries.

## What works

- All five scripture volumes: 87 books, 1,582 chapters, and 41,995 verses from the repository's existing dataset.
- The header trail opens book (volume crumb) and chapter (chapter crumb) pickers for every volume, book and chapter.
  Previous/next links appear at the end in simple mode, as on the website. Alt Left/Right works in either mode,
  across book boundaries, and the last chapter is restored on launch.
- Offline SQLite FTS5 search, prefix word matching and references such as `Alma 32:21` or `John 3:16–17`.
  Searches can be scoped to any of the five volumes. The first 100 matches are shown; `100+` means refine the query.
- Native word selection and copying within a verse. Scripture text is immutable: typing cannot alter it.
- Click a verse **number** to study it. Shift-click another number to select a range; Ctrl-click (Cmd-click on
  macOS) adds/removes individual verses. Copy a selected passage, bookmark it, or add it to a journal note.
- The website's marks: highlights and underlines in red, yellow, blue, green, pink, purple or a custom `#rrggbb`
  color, on whole verses or on exactly the words you select (drag across words; a floating bar offers the quick
  marks, copy, and "add to a journal note"). Quick marks can be renamed, reordered, removed or added from
  **More styles**; manage them under the navigation's settings. Word ranges are stored in the website's UTF-16
  offsets, so they mean the same words in both apps, and a mark is never drawn on changed text.
- **Log** opens the chapter's panel: mark the chapter read and revisit this chapter's notes and marks.
- Personal notes on verses and chapter read/unread tracking (marking a chapter read also logs today's reading).
  Save a note explicitly or leave the passage: changing selection, chapter, screen, or closing the window saves
  the draft. A failed save displays an error and prevents leaving the draft. Notes on a range attach to its
  first verse.
- **Journal**, as on the website: a month calendar with entry dots, weekly goals (study days and reflections,
  Monday–Sunday, editable), this month's study days, the reflection invitation with its prompts, the selected
  day's entries (Markdown notes, logged readings, and verse notes), and a reflection worth revisiting. Opening a
  note glides the day's list into the rail. Notes have a title, a Markdown body written in the website's live
  editor (headings at their sizes, bold, italics, links, quotes, lists and code styled in place, syntax hidden
  off the caret's line, Ctrl/⌘-click to follow a safe link, list continuation on Enter, undo/redo), an optional
  source (scripture or lesson) and reading log, and save automatically, on leaving, closing or Ctrl+S.
- **Browse** (the website's `/browse` Library): this week's Come, Follow Me, Continue reading, the Journal and the
  five volumes as art cards; a volume's books with their art and categories; a book's chapters with read and
  current chapters marked. The navigation's Browse opens the Library from the reader and otherwise returns to where
  browsing was left. The art is the website's own generated scenery (see `docs/browse-art-provenance.md` and
  `docs/scripture-book-art.md`).
- **Text selection** as in a browser: drag (or double/triple click, Shift-click to extend) across words, on into
  the following verses, in the reader (plain or read against other Bibles), on a lesson's chapters (across a
  chapter break) and in guide prose (across paragraphs). Marks, Copy, Add to note and verse notes take exactly the
  scripture's own words, as UTF-16 ranges of the KJV text; another Bible's words or a verse number never are.
- Reader settings (gear in the chapter pill): simple mode, the website's 85–130% text-size range in 1% steps, serif/sans, and text width
  (comfortable/wide/full). Appearance (light/dark) is under the navigation's settings gear. Preferences persist;
  profiles from earlier builds keep their notes and move from the old 22px default to the website's 16px.
- Header animations follow GNOME's "Animations" setting (off = no motion) and only run while a transition is active.
- **Come, Follow Me**, as on the website: this week's lesson from the real 2026 schedule (read from the website's
  own source), earlier and upcoming published guides with their covers and painting credits, chapter chips, and
  each lesson's page read scripture-first as on the website (every chapter of the week in full, the guide's
  commentary in "Context for verses …" disclosures), with contents and log. The week's verses select, mark and
  take notes there as in the reader; scripture links outside the week open in a side panel.
  The guides are those published in the repository, plus the October 26 guide published upstream on `master`.
- **Reader study tools**, from the website's own public endpoints (network needed; the scripture itself stays
  embedded): study-path markers beside verses (AI chapter insights, cached on the website), **Explore** a selected
  word (Bible Dictionary/Guide/Topical Guide topics matched on this computer and read from the website, Strong's
  Hebrew and Greek, English dictionaries), **Resources** for selected verses from the published lessons, and for
  the Bible **Your Bibles** in Reader settings (other translations shown verse by verse beside the KJV with their
  changed words colored) and the **Joseph Smith Translation** passages for the chapter. Each shows loading and
  failure states; nothing is invented when a service is unavailable.
- **Guide prose marks**: drag across words in a Come, Follow Me guide (across paragraphs too) to highlight,
  underline or note them, with the same quick marks as the reader, Copy and Add to note; marks apply to exactly the
  selected text, and saved passages the selection overlaps can be selected to change them. Spans are anchored as the website anchors them (block, UTF-16 offsets, quote and
  context), so they find their words again after edits.
- **Plans** ("Your study plans" on Come, Follow Me): the account's reading plans with progress, today's chapters,
  the day-by-day schedule, marking chapters read, deleting a plan, the website's quick-start plans, and the plan
  builder and editor (dates typed as the browser shows them or chosen from a calendar).
- **Copy share link** for selected verses: the website's `/share/...` passage link.
- **Settings and sign-in**, as the website's `/account` and `/sign-in`: the navigation's gear opens Settings
  (account, simple mode, appearance, quick marks); signed in, the avatar opens the account menu. "Continue with
  Google" opens the website in your browser; after you approve there, the app receives its own session through a
  one-time, PKCE-protected code on `127.0.0.1` (Cancel on the website stops the app waiting). The session is kept
  in the system keyring, bound to the website, the Convex deployment and this study profile. Signed in: profile
  name, sign-in methods, sessions ("Sign out other devices"), sync status, and an explicit **Copy this computer's
  study** into the account (the website's idempotent import; copying again only adds what wasn't copied). Marks,
  verse notes, guide marks, journal notes, readings, read chapters and goals sync in the background — after
  changes, every minute while open, and with growing retry delays after failures. This computer's own study stays
  separate and is never merged or overwritten. **This needs the matching server change (`convex/nativeAuth.ts`,
  `convex/nativeSync.ts`, the `/native/authorize` page and the `createJournalEntry` revision field) deployed;
  until then, signing in reports that the server doesn't offer desktop sign-in yet.**

## Keyboard

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd K | Search |
| Enter in search | Open the first matching passage |
| Escape | Close the open header panel, close an open journal note (as Back does on the website), dismiss a guide selection, leave simple mode, clear the verse selection, or close Log |
| Alt Left / Right | Previous / next chapter (Alt Left closes an open journal note) |
| Ctrl/Cmd J | Journal |
| Ctrl/Cmd S | Save the current note |
| Ctrl/Cmd C | Copy selected words in a text field; otherwise copy selected verses |

## Data

Personal data is local unless you sign in. On Linux it normally lives in `~/.local/share/versetogethernative/`
(respecting `XDG_DATA_HOME`). `study.sqlite` holds notes, marks, bookmarks, journal notes, readings, preferences
and read chapters; a signed-in account's synced copy is kept beside this computer's own study and removed from
this computer when you sign out. Opening a profile from an earlier build upgrades it in one transaction after
writing a snapshot of the original to `study-before-v<version>.sqlite` (kept; delete it once you are satisfied). Back up
this file while the app is closed, or back up the entire directory. Do not delete it to update the app.
The `scriptures-<hash>.sqlite` files are replaceable caches of the embedded dataset. Notes are kept separately
so updating the embedded corpus does not overwrite them.

`./verse-together --data-dir /path/to/folder` uses a separate study directory. Development and GUI verification
used isolated temporary data, not your personal notes. The binary contains no credentials or secrets.
`VERSE_TOGETHER_SITE` and `VERSE_TOGETHER_CONVEX_URL` point the account at another deployment (for example a
preview); both must be set together, use https (plain http only for `127.0.0.1`/`localhost`), and a saved session
is only ever used with the deployment and profile it was made for. `--no-account` (or
`VERSE_TOGETHER_NO_ACCOUNT=1`) turns sign-in and sync off and never touches the keyring — use it for QA profiles.

## Build from source

Install a Rust toolchain compatible with the lockfile (this build was verified with Rust 1.99.1) and a C compiler
for bundled SQLite. On Ubuntu, `build-essential` supplies the compiler/linker. Iced loads the standard Wayland/X11
and xkbcommon runtime libraries; no WebKitGTK installation is needed. Then, from the repository root:

```sh
cargo run --manifest-path native/Cargo.toml
cargo test --manifest-path native/Cargo.toml
cargo clippy --manifest-path native/Cargo.toml --all-targets -- -D warnings
cargo build --manifest-path native/Cargo.toml --release --locked
bash native/package-linux.sh
```

### Build on macOS

Install Rust with rustup and Apple's command-line tools (`xcode-select --install`). Use the full repository
checkout: the build embeds content from `public/`, `content/` and `src/lib/generated/` alongside `native/`.
From the repository root, build and run for your Mac's architecture:

```sh
cargo build --manifest-path native/Cargo.toml --release --locked
./native/target/release/verse-together-native
```

No Node installation is needed. These commands produce a native executable; `.app`/DMG packaging is not yet
provided. macOS compilation and runtime behavior have not been verified on a Mac; Linux is the tested platform.
The Linux package and `package-linux.sh` are for Linux only.

The build script generates a SQLite database and FTS5 index from the existing scripture bundles and navigation
catalog and embeds it into the executable. The fonts, the published study guides and the study helps topic index are also embedded. `src/icons.rs` is
generated from the website's `@fortawesome/free-solid-svg-icons` package by `node native/scripts/generate-icons.mjs`
(an asset step only; the generated file is checked in and the app has no Node or JavaScript at runtime). Font
Awesome Free icons are CC BY 4.0; the license ships in `licenses/`. The renderer uses
Iced's native Tiny Skia backend. Linux packaging includes font and dependency notices; Python 3 is used only for
collecting packaging notices. Cargo.lock is checked in for reproducibility.

The root npm scripts `native:dev`, `native:test`, `native:build` and `native:package` are convenience aliases.
The earlier Tauri target remains separate under `src-tauri`; it is not used by this native edition.

## Current scope

See `PARITY.md` for the feature-by-feature inventory, including what is partial or not ported (for example the
social feed and other pages the website no longer links). Account sign-in and sync are implemented and tested against the real Better Auth and
Convex functions in the repository's test runtime, but need the server change deployed and have not been verified
against live Google sign-in. Accessibility, IME composition, very long notes, macOS and Windows builds need
further verification before a broad release. Native rendering follows the same visual language but is
not pixel-identical to browser rendering.

Use `./verse-together --benchmark --data-dir /tmp/verse-benchmark` for local data initialization, repeated chapter
reads and FTS queries. These measure the local data path, not end-to-end startup or a comparison with the website.
See `VERIFICATION.md` for the tested build and observations.

The pinned Tiny Skia renderer has small local corrections for shadow clipping, dirty-region invalidation and
image corner radii, found during real native testing. Its source and pixel-level regression tests
are checked in under `vendor/iced_tiny_skia`; see its `PATCH.md`. Run those tests with
`cargo test --manifest-path native/Cargo.toml -p iced_tiny_skia shadow_`.

Open verse-note and Journal drafts autosave approximately every 750 ms while changed. An idle editor does no
autosave work. Failed writes retain the draft and show the error, retrying every 10 seconds; Ctrl+S and saving
on navigation or close remain available. A force quit can still lose typing since the last successful save.
