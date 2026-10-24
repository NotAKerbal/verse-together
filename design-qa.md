# Notes calendar card verification

## Current refinement and recovery

Put the Notes calendar in the same card style as the chooser/editor and remove the duplicate visible Notes heading. Source revision: `da289836571bce5e7a3517021413a320611bc180`; this record is amended into that unpublished refinement without changing source. It remains one reversible commit after `0e3eb62`.

- Calendar uses the existing panel surface, border, corner treatment and p-5 desktop / p-4 phone padding. It is naturally sized to the month, without empty card space below its legend.
- The page heading remains screen-reader only and receives focus on returning to the phone calendar. Global header/navigation and the calendar legend are unchanged.
- The desktop title row is removed and its 50.4px is returned to the stage height. The calendar and chooser have equal top coordinates and retain their prior bottom spacing.
- The account-only phone row hides at sm, matching AccountControl; back-control rows remain visible below lg. This removes the otherwise empty tablet row.

## Current visual comparison

Source visual truth: `/tmp/verse-notes-qa/calendar-card/before.png` (accepted `0e3eb62`). Implementation: real Notes components in `http://127.0.0.1:4189/qa/notes/index.html?active=none`, with synthetic fixtures. Captures: `desktop-after.png`, `final-desktop.png`, and `phone-320.png` in the same directory.

Desktop source and implementation were opened together in one comparison input at requested CSS viewport 1199 × 800, DPR 1; both captures are 1184 × 790. No density normalization needed. State is light theme, October 21, 2026, chooser closed. The intended differences are the calendar card, the removed title row and the resulting higher placement. Fonts, spacing rhythm, theme colors, icons/assets and app copy remain consistent with the established chooser card. No replacement assets were introduced. Full-size text, borders and controls are legible, so a separate focused crop was unnecessary.

The final desktop calendar and chooser tops both measure y≈115.59, with no horizontal overflow. The calendar is 352px wide, with the same background and corner treatment as the chooser. Phone capture is 320 × 740 at requested viewport 320 × 740; the month name wraps cleanly and controls fit. At 390px the month heading fits one line. No actionable P0/P1/P2 visual findings remain.

## Current checks

- **Passed:** desktop 1199/1024px card alignment, visible-heading removal, month navigation, Today, opening a note and Browser Back restoring the calendar/chooser.
- **Passed:** phone 320/390px layouts without horizontal overflow; day buttons retain 48px height. Day → note → Browser Back → calendar works; focus returns to the screen-reader heading.
- **Passed:** tablet 768px back button stays visible and returns to calendar. Empty account-row removal is additionally verified by source review: its sm:hidden matches the existing account control breakpoint; that control is not rendered by the synthetic harness.
- **Passed:** local browser runtime error log is empty. Browser used Chrome after T3 preview_open reported the existing AppArmor sandbox blocker; no host setup or security settings changed.
- **Passed:** all 61 Notes tests independently rerun at the final source revision. Existing unit tests were reused; none added for CSS strings.
- **Passed:** TypeScript and targeted ESLint at `da28983`; `git diff --check`.
- **Not run:** signed-in backend testing, actual OS reduced-motion emulation, local Next production build. This is a frontend-only refinement; the exact-head Vercel production build is verified separately after push. Selection, history, editor saving and oldest-first mixed ordering are unchanged.

## Earlier card and browser-navigation checks

### Scope and recovery

Current refinement: keep the original chooser's card surface, rounded corners, border, padding and prominent entry styling while it slides into the desktop rail. Opening a note also adds one browser-history entry; Back closes it, Forward reopens it, and switching notes reuses that entry.

Recovery is separated by change: original slide `b6557dd`, card preservation `d2c78cb`, and the following history commit. Revert the history commit to remove browser navigation, or the card commit to remove only the card refinement. No published commit was rewritten.

### Comparison target and evidence

- Source visual truth: `/tmp/verse-notes-qa/preserve-card/source-closed.png`, captured from the original closed chooser on `b6557dd`.
- Implementation: `http://127.0.0.1:4189/qa/notes/index.html?active=none`, the real Notes components and shared history hook with synthetic fixtures and no backend connection.
- Implementation screenshot: `/tmp/verse-notes-qa/preserve-card/final-selected.png`; initial shape verification is also saved as `selected.png`.
- Requested CSS viewport: 1199 × 800, DPR 1. Source and implementation PNGs are both 1184 × 790; compare them directly without density resampling. The reference has a small document-scroll offset, which is not treated as design drift.
- State: light theme, synthetic QA user, October 21, 2026. The reference shows the chooser before selection; the implementation shows Questions for family study selected. The state/width difference is intentional: the panel moves into the 352px rail while retaining its card treatment. The short date/back row remains the previously accepted open-state navigation.
- Full-view comparison: source and implementation were opened together in the same comparison input, including a final comparison after history integration. The bordered surface now stays present, with the original padding and entry typography. The editor and page shell retain their prior positions.
- Focused comparison: controls, note titles, excerpts, source metadata and editor text are legible in the full-size images; a separate crop was unnecessary. Computed checks confirmed opacity 1, the same background/corner treatment, and 21px chooser padding in both states.

### Fidelity surfaces

- Fonts/typography: existing display/UI families, hierarchy and weights retained. Entry titles use the original prominent size in both positions; two-line clamps and long-source wrapping remain. Text wraps naturally at the narrower width without scaling.
- Spacing/layout: original card padding retained throughout; no padding transition or surface fade. Rail width and editor gap unchanged. At 1024px the padded date/back header and list fit without horizontal overflow, and chooser scrollTop remains 0 after opening.
- Colors/tokens: existing panel surface, border, selected-note color and theme tokens retained.
- Images/assets: wordmark and Font Awesome/source icons unchanged; no replacement/generated imagery.
- Copy/content: existing headings, actions, notes and links retained. The compact date/back header remains intentional. No experiment controls added.

### Findings and history

- Earlier slide iteration `432d3a8` had a P2 scroll regression: opening a lower note hid the date/back row. Disabling anchoring alone in `f11e7df` did not fix opening. Resetting the chooser scroll before paint fixed it in the source later published as `b6557dd`. Evidence remains in `/tmp/verse-notes-qa/slide/after-open-fresh.png`, `after-anchor-fix-open.png` and `after-open-final.png`.
- User-directed follow-up: the original implementation faded the chooser surface and switched entries to compact styling. `d2c78cb` removes that change of treatment. Evidence: the paired source and final-selected captures above. The previous scroll repair is retained and rechecked.
- Current comparison: no actionable P0/P1/P2 differences remain. Narrowing the panel and changing its navigation header are intentional; preserving its original width would leave insufficient editor space.

### Runtime checks

Environment: local Chrome. T3 preview_open returned the host AppArmor unsupported error. Chrome briefly disconnected/timed out, then recovered; no host security or browser settings were changed. Native desktop control was occupied by another agent and was not used.

- **Passed:** desktop opening/closing, visible padded header at 1024px, and no horizontal list/page overflow.
- **Passed:** Browser Back returns to the calendar/chooser at the same URL; Forward reopens the correct note.
- **Passed:** switching notes then one Back returns to the chooser; reload restores the selected note; X after a complete reload closes it.
- **Passed:** X consumes the managed note entry. The next Back reached a deliberately established preceding QA URL (`?active=none&before=1`). Direct navigation to the harness's unserved `/browse` route was blocked by the browser (`net::ERR_BLOCKED_BY_CLIENT`), so this test used the preceding QA URL instead.
- **Passed:** an arrived note with no managed entry closes in place.
- **Passed:** phone calendar → day → note, Browser Back to day, Forward to note, and existing on-page back controls, at 390px.
- **Passed:** creating a synthetic note, typing text, and Browser Back closing it saves the final characters into its chooser entry. Rapid open/close/open remains navigable and keeps chooser scrollTop 0.
- **Passed:** local runtime error log checked after interactions: none reported.
- **Passed by source review:** state preserves existing router metadata; no note content is stored; event listener, restoration frame and navigation fallback timer are cleaned up. Same history implementation is used by the adapter and harness. React checklist reviewed: SSR-safe history port, stable controller, fresh handlers, effect cleanup, no added dependencies or backend changes.
- **Not run:** signed-in deployed Next/backend persistence, actual OS reduced-motion emulation, deleted-note restoration in the browser. Missing/invalid state and deleted-note fallback are covered by controller tests; reduced-motion CSS remains unchanged.

### Automated verification

- **Passed:** card source `d2c78cb`: TypeScript, targeted ESLint, 39 journal tests.
- **Passed:** history source `8b5579342a49d8ac9a5aa57b21c9c229985020da`: `npm run test:notes`, 8 files/61 tests; strict `npx tsc --noEmit -p .`; targeted ESLint covering Notes, QA and touched tests. Lead independently reran all 61 tests at that source revision.
- **Failed, unrelated existing scope:** child ran full-repository ESLint and reported 173 problems outside Notes, QA and touched files. Targeted lint passed.
- **Passed:** QA production bundle via Vite API with `rollupOptions.input="qa/notes/index.html"`, output `/tmp/verse-notes-qa/preserve-card/build`. Existing client-directive and bundle-size warnings remain.
- **Passed:** `git diff --check`.
- **Passed:** frontend-only classification against fetched `origin/dev`: existing configured backend, no Convex changes. Package/build configuration is unchanged; the preceding exact-head Vercel build ran `npm run build` → `next build --turbopack`, with no Convex deployment. Final Vercel build is verified separately after push.

final result: passed
