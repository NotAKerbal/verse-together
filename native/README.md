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
  macOS) adds/removes individual verses. Copy a selected passage, highlight it or bookmark it.
- **Log** opens the chapter's panel: mark the chapter read and revisit this chapter's notes and marks.
- Personal plain-text notes on verses, a local journal of notes/marks, and chapter read/unread tracking.
  Save a note explicitly or leave the passage: changing selection, chapter, screen, or closing the window saves
  the draft. A failed save displays an error and prevents leaving the draft. Notes on a range attach to its
  first verse. The journal shows the 1,000 most recently updated marked/annotated verses.
- Reader settings (gear in the chapter pill): simple mode, the website's 85–130% text-size range in 1% steps, serif/sans, and text width
  (comfortable/wide/full). Appearance (light/dark) is under the navigation's settings gear. Preferences persist;
  profiles from earlier builds keep their notes and move from the old 22px default to the website's 16px.
- Header animations follow GNOME's "Animations" setting (off = no motion) and only run while a transition is active.
- The four checked-in Come, Follow Me guides, with section navigation. Recognized scripture links open locally;
  other HTTP(S) links open in the system browser. These are the repository's stored guides, not a live lesson feed.

## Keyboard

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd K | Search |
| Enter in search | Open the first matching passage |
| Escape | Close the open header panel, leave simple mode, clear the verse selection, or close Log |
| Alt Left / Right | Previous / next chapter |
| Ctrl/Cmd J | Journal |
| Ctrl/Cmd S | Save the current note |
| Ctrl/Cmd C | Copy selected words in a text field; otherwise copy selected verses |

## Data

Personal data is local. On Linux it normally lives in `~/.local/share/versetogethernative/` (respecting
`XDG_DATA_HOME`). `study.sqlite` holds notes, highlights, bookmarks, preferences and read chapters. Back up
this file while the app is closed, or back up the entire directory. Do not delete it to update the app.
The `scriptures-<hash>.sqlite` files are replaceable caches of the embedded dataset. Notes are kept separately
so updating the embedded corpus does not overwrite them.

`./verse-together --data-dir /path/to/folder` uses a separate study directory. Development and GUI verification
used isolated temporary data, not your personal notes. There are no cloud credentials or services in the binary.

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
catalog and embeds it into the executable. The fonts and four study guides are also embedded. `src/icons.rs` is
generated from the website's `@fortawesome/free-solid-svg-icons` package by `node native/scripts/generate-icons.mjs`
(an asset step only; the generated file is checked in and the app has no Node or JavaScript at runtime). Font
Awesome Free icons are CC BY 4.0; the license ships in `licenses/`. The renderer uses
Iced's native Tiny Skia backend. Linux packaging includes font and dependency notices; Python 3 is used only for
collecting packaging notices. Cargo.lock is checked in for reproducibility.

The root npm scripts `native:dev`, `native:test`, `native:build` and `native:package` are convenience aliases.
The earlier Tauri target remains separate under `src-tauri`; it is not used by this native edition.

## Current scope

This is a working offline native reader and study app, not full web-feature parity. Google sign-in, Convex sync,
shared/social content, remote translation comparisons, online reference tools, AI insights and the web app's rich
note editor have not been ported. Local notes do not automatically appear on the website. Accessibility, IME,
long-form editing, cross-verse word dragging, macOS and Windows builds need further verification before a broad
release. Native rendering follows the same visual language but is not pixel-identical to browser rendering.

Use `./verse-together --benchmark --data-dir /tmp/verse-benchmark` for local data initialization, repeated chapter
reads and FTS queries. These measure the local data path, not end-to-end startup or a comparison with the website.
See `VERIFICATION.md` for the tested build and observations.

The pinned Tiny Skia renderer has a small local correction for shadow clipping and dirty-region invalidation,
found during real native testing of the animated header and popovers. Its source and pixel-level regression tests
are checked in under `vendor/iced_tiny_skia`; see its `PATCH.md`. Run those tests with
`cargo test --manifest-path native/Cargo.toml -p iced_tiny_skia shadow_`.
