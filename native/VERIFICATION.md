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
