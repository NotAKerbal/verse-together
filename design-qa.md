# Notes panel slide experiment

## Scope and recovery

Desktop experiment: the same day chooser moves from the main panel into the left rail when a note opens; Back and X reverse it. The existing phone stages remain intact. The experiment is one commit directly after `cfa7f8eaedbaae7ce70a4bd2d0c7c91b7ef51581`; revert that single experiment commit to restore the previous implementation.

Reference preview: https://scriptures-sharing-l3lf9255x-notakerbals-projects.vercel.app/notes

## Visual evidence

- Source visual truth: `/tmp/verse-notes-qa/slide/before-closed.png` and `before-open.png`, captured from accepted `cfa7f8e`.
- Rendered implementation: `http://127.0.0.1:4189/qa/notes/index.html?active=none`, actual Notes components with synthetic fixtures and no backend connection.
- Implementation captures: `/tmp/verse-notes-qa/slide/after-closed.png` and `after-open-final.png`. The final open capture includes the scroll-reset repair in source commit `1f1e1ef`; the closed capture precedes that repair, whose only additional visible effect is resetting scroll on a mode change.
- Requested CSS viewport: 1199 × 800; observed `innerWidth=1199`, `innerHeight=800`, `devicePixelRatio=1`, document client width 1184. Both source and implementation PNGs are 1184 × 790. Compare equal-size captures directly; no density resampling was needed. The baseline closed capture has a small document-scroll offset, so assess local panel alignment rather than treating that global offset as design drift.
- State: light theme; synthetic QA user; Wednesday, October 21, 2026; five notes and one reading; open state is “Questions for family study.” Both captures use the same content and editor state.
- Full-view comparison: source and implementation were opened together in the same comparison input for both closed and open states. The settled open state preserves the previous composition, date/back alignment, rail width, editor placement, wrapping and visible content. The closed state preserves the month and chooser.
- Focused comparison: the full-size paired captures make the short date, back/X controls, source row, card titles/excerpts and editor typography legible. An additional crop was unnecessary.
- Motion evidence: intermediate chooser geometry was observed between its main position (`left=404`, width 748) and rail position (`left=32`, width 352), with CSS duration 280ms. Reverse frames are saved as `reverse-frame1.png` and `reverse-frame2.png`. Browser screenshot timing is not a frame-rate measurement.

## Required fidelity surfaces

- Fonts/typography: existing display and UI families, weights, sizes and hierarchy remain consistent. Two-line card clamping, source wrapping and short rail date match the reference. Text reflows during width interpolation; it is not scaled.
- Spacing/layout: settled 352px rail at lg and 384px at xl, original gap, card padding/radii and editor dimensions are preserved. No horizontal page overflow was observed at 1024, 1199 or 1440px requested widths.
- Colors/tokens: existing theme tokens, card surfaces, accent date, selected note and reading icon are retained. Motion fades existing surfaces; no palette change.
- Image/assets: existing wordmark, Font Awesome icons and source marks remain unchanged; no generated/replacement assets.
- Copy/content: existing headings, dates, note text, source links, published status and controls remain unchanged. No experiment controls were added to the product.

## Findings and iteration history

1. **P2, blocked at `432d3a8`: header scrolled out of view during opening.** At 1199 × 800, opening the lower Questions card changed chooser scrollTop from 0 to 36 and placed the date/back above the stage. Evidence: `after-open-fresh.png`.
2. **P2 remained at `f11e7df`: disabling scroll anchoring alone was insufficient.** Computed overflow-anchor was none, but opening the same card still produced scrollTop 56 and heading y≈108 above stage y≈166. Evidence: `after-anchor-fix-open.png`. The reverse transition improved; the opening case remained blocked.
3. **Resolved in `1f1e1ef`: reset the shared chooser to its top before paint when opening/closing**, retaining overflow-anchor:none during reflow. At 1199px, both directions now keep scrollTop 0; open heading y≈164 is visible. Evidence: `after-open-final.png`, compared together with `before-open.png`. Rechecked at 1024 and 1440px. No actionable P0/P1/P2 differences remain.

## Runtime checks

Environment: local Chrome via the browser connector. T3 preview_open was blocked by the host AppArmor sandbox, so Chrome was used after that explicit unavailable result.

- **Passed:** desktop opening, Back and X closing, repeated keyboard open/close, and switching notes while the rail stays in place. Focus moves to Open note on opening and Select a note on closing.
- **Passed:** 1024, 1199 and 1440px desktop checks; correct rail widths, visible header and no sideways overflow.
- **Passed:** phone calendar → day → note → day at 390px, narrow 320px layout, and resizing between phone and desktop. Phone screens remain separate.
- **Passed:** clicking lower card metadata opens the note; Control-clicking a source link opens its destination separately without selecting the note.
- **Passed:** native reading-log dialog opens; Cancel closes it and restores focus to Log reading.
- **Passed:** synthetic edit followed immediately by close appears in the chooser, establishing the editor flush in the local harness. Reload resets fixtures by design.
- **Passed:** published note remains read-only; one editor at most is present. Closed state does not mount an editor.
- **Passed:** local runtime error log checked after the interactions; no errors reported.
- **Passed by source inspection:** reduced-motion media rule removes all transitions. **Not run:** operating-system reduced-motion emulation in this browser.
- **Not run:** signed-in backend persistence against the deployed app. The fixture harness does not establish authenticated end-to-end verification.

## Automated verification

Source revision: `1f1e1ef52938f1120663cee1f9a0b5255afdc4d8`; the report is subsequently included by amending that same experiment commit without changing source.

- **Passed:** implementation agent ran `npx vitest run`: 7 files, 46 tests; `npx tsc --noEmit -p .`: exit 0; `npx eslint src/features/notes/ tests/journalView.test.ts`: exit 0.
- **Passed:** lead built the QA harness with Vite's API, specifying `rollupOptions.input="qa/notes/index.html"` and an external `/tmp` output directory. The default CLI command has no root index entry and fails; specifying the actual harness entry resolves that command configuration issue. Build completed with existing client-directive and bundle-size warnings.
- **Not run locally:** Next production build. The exact-head Vercel preview build is checked separately after push.
- **Passed:** frontend-only deployment review: the diff has no Convex, package, or build-script changes; `npm run build` runs `next build --turbopack`. The preceding preview's build log confirms `npm run build` and contains no backend deployment command.

## Implementation checklist

- Shared chooser motion and reverse transition implemented with CSS, without timers or dependencies.
- Inactive calendar/editor panels are inert; closed editor content is unmounted.
- Header scroll regression repaired and visually rechecked.
- Previous accepted Notes layout and phone navigation preserved.
- Keep the old preview available for the user's subjective comparison of the motion.

final result: passed
