# Explore sidebar design QA

final result: passed

## Target and evidence

- Approved visual target: `/tmp/explore-colored-sidebar-claude.html` (Claude Opus 5.5 interactive mockup).
- Reference capture: `/tmp/explore-approved-reference.png`, 410 × 332 pixels, 410 CSS-pixel sidebar, device scale 1.
- Running app capture: `/tmp/explore-implemented-reference.png`, 412 × 356 pixels including its existing 1px panel border, 410 CSS-pixel content, device scale 1.
- Full-view same-scale comparison: `/tmp/explore-design-comparison-final.png`; both captures show all groups collapsed in light mode for “born”. Actual source counts and passage interlinear summary differ intentionally from sample mock content.
- Browser viewports: 1440 × 1000 desktop light, 375 × 1000 mobile dark. Real route: `/browse/newtestament/john/3`, selected “born” in verse 3.
- Expanded mobile evidence: `/tmp/explore-cards-expanded-375.png`; collapsed desktop/mobile evidence: `/tmp/explore-cards-collapsed-1440.png`, `/tmp/explore-cards-collapsed-375.png`.

## Comparison history

1. P2: card summaries were truncated, hiding source names. Replaced truncation with wrapping in `ExploreSection.tsx`.
2. Captured the running app again and compared it at the same scale and collapsed state. Summaries now wrap, source names remain readable, and the three single-layer tinted cards retain the approved hierarchy. No remaining P0/P1/P2 findings.

## Fidelity surfaces

- Typography: existing product serif for word and card headings, sans source summaries and counts; readable wrapping at both widths. The product font is retained rather than forcing the mockup's Georgia fallback.
- Layout: same sidebar placement and frame; one rounded card per category, plain expandable result rows; spacing and 14px card radii match the target. No additional boxed result containers.
- Color: sage, blue, clay light tones match the mockup; scoped dark equivalents preserve readable contrast and category distinction.
- Assets: existing product book/chevron controls and typographic language glyphs; no raster imagery required.
- Content: actual API source titles, counts and entries replace mock data. Source attribution and verse-alignment caution remain. Empty sources disappear after completion.
- Focused region comparison: not separately needed; the full-view comparison contains the complete collapsed sidebar at readable native scale, and expanded/mobile controls were inspected in the running application.

## Runtime verification

Passed with real app APIs in headless Chrome via `/tmp/explore-cards-runtime.mjs` at both viewports:

- All three categories initially closed; no result rows rendered until expansion.
- Opening category and source row loads real study-help content; empty Bible Dictionary omitted.
- One category/result open at a time; Greek Strong's details and Bible Hub link work.
- Escape closes result, then category, and returns focus to their respective controls.
- Live English rows expose the existing Add to note control; no note writes performed.
- Close dismisses Explore; no horizontal overflow and no browser exceptions.

Local chapter-insight requests return 503 because NEXT_PUBLIC_CONVEX_URL is absent; the unrelated insight feature was not verified. Explore dictionary, lexicon and study-help API requests returned 200.

## Follow-up polish

No blocking visual findings. Existing outer sidebar frame and real-data-dependent counts/summary height intentionally differ from the standalone mockup.
