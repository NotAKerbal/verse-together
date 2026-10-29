# Native Explore parity

Reference: current web master `c964037d9ebcd7386bcdb3c53a0ab9ec3d0e9987`, inspected read-only. Source checkpoint report: `/tmp/verse-mobile-feature-thread-source.json`; checkpoint `c895c90` has an older root backend and must not be merged or deployed wholesale. Integrate only this feature commit.

## Inventory

The upgraded web panel uses three collapsible categories, not dictionary-only tabs: Study helps (sage), Biblical languages (blue), English meanings (clay). Native uses native controls with light/dark palettes, the same section/row reducer, counts, source labels, independent retry states and a disclosure naming sources with no matches.

- Bible Dictionary, Guide to the Scriptures and Topical Guide: bundled official topic matching, matching/related chips, preview/read more, same-guide links in place, scripture links into the native reader, truncation notice, source and browse links.
- Strong's Hebrew and Greek: testament ordering, KJV/definition groups, expandable entries, show more, lemma, transliteration, pronunciation, derivation, KJV renderings, attribution, Bible Hub entry/search and context-specific chapter interlinear. Results explicitly describe possibilities rather than claiming a verse's original word.
- All returned dictionary editions and etymologies: source labels, numbered entries, native rich-text blocks using the web normalization/sanitization pipeline, See/underlined-term lookup, Bible target navigation, and Add to note as a local journal draft with source attribution.
- Whole selection is retained, with optional individual meaningful-word chips. Display preserves selected punctuation/whitespace; lookup normalization never replaces a phrase with its first word. Selections beyond 64 lookup characters explicitly offer individual words and source search rather than inventing entries.
- Read-only public web dictionary/study-helps/lexicon contracts; shared pure modules are identical to current master. Requests timeout, abort and suppress stale responses, including late JSON after cancellation; failures are retryable and never cached.

## Integration contract

`ExploreSheet` takes `visible`, `onClose`, exact `text`, honest `reference`, optional `context` (`volume`, `book`, `chapter`, optional `verses`, `verseCount`). VerseActions has the sole shared edit. CFM prose caller belongs to the CFM thread: omit scripture context for guide prose. Scripture callers must use the selected chapter's actual book (including mixed-book lessons). No annotation redesign or action-order changes.

## Verification and limits

Independent review compared current web source and opened production Explore for “vision” in Isaiah 1; the live panel confirmed category layout, source counts and chapter interlinear. No preview was used to verify native edits.

Automated coverage includes real Expo route components with a mocked native selection bridge, exact phrases, mixed-book Lamentations context, category contents, source navigation, journal drafts, offline/retry, rate limits, timeout, abort and late responses. These tests do not validate phone gestures or native rendering.

Remaining platform differences: native has no faith-tradition preference, so study helps remain visible; Android Back dismisses the sheet; Add to note creates a local journal draft and retains the underlying reader selection. CFM prose caller is integrated separately. No emulator/device/Google gesture QA, AAB, version change, backend/env change, deployment, push, PR or merge is part of this feature.

Final verification on this VM (Node 24.21), staged feature tree:

- **Passed** `npm run typecheck`.
- **Passed** `npx jest --runInBand --silent`: 13 suites, 152 tests; 3 live-only tests skipped.
- **Passed** focused Explore suite: 29 tests, including the review fixes.
- **Passed** `LIVE_NETWORK=1 npx jest __tests__/live-services.test.ts --runInBand --silent`: 3 production read-only service tests.
- **Passed** staged `git diff --check`.
- An initial `expo export --platform all` failed on the unconfigured web target (`react-native-web` absent). Use explicit native platform exports; no dependency was added for web.
- **Passed** `npx expo export --platform android --output-dir /tmp/vt-explore-final-android --max-workers 2` and the equivalent `--platform ios --output-dir /tmp/vt-explore-final-ios`: both Hermes bundles exported (about 15 MB each).
