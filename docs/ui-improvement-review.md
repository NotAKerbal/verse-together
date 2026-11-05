# UI improvement review ledger

## Baseline

| Item | Value |
| --- | --- |
| Revision | `635aa60d` |
| Scope | Library → Old Testament books → Genesis chapters → reader |
| Viewports | Desktop 1280×800 and mobile 390×844, light appearance |
| Council | gpt-6.1-sol (UX), gpt-6-astra (visual), gpt-6.1-terra (accessibility) |
| Target score | 9 |
| Gate | Not met |
| Confirmed blockers | None |
| Peer sources accessed | 2026-11-05 UTC |

### Lowest category scores

Scores follow rubric order and record the lowest score any reviewer gave in that category.

| Rubric position | Lowest score |
| --- | --- |
| 1 | 7 |
| 2 | 7 |
| 3 | 7 |
| 4 | 7 |
| 5 | 7 |
| 6 | 7 (low confidence) |
| 7 | 7 |
| 8 | Unknown |
| 9 | Unknown |
| 10 | Unknown |
| 11 | 7 |
| 12 | Unknown |

### Scores by reviewer

| # | Category | gpt-6.1-sol (UX) | gpt-6-astra (visual) | gpt-6.1-terra (accessibility) |
| --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 7 | 7 | 7 |
| 2 | Visual hierarchy | 7 | 7 | 7 |
| 3 | Layout and spacing | 8 | 7 | 7 |
| 4 | Typography | 7 | 7 | 7 |
| 5 | Iconography and imagery | 7 | 8 | 7 |
| 6 | Color and contrast | 8 | 8 | 7 (low confidence) |
| 7 | Components and consistency | 8 | 7 | 7 |
| 8 | States and feedback | Unknown | Unknown | Unknown |
| 9 | Accessibility | Unknown | Unknown | Unknown |
| 10 | Responsive and adaptive behavior | Unknown | Unknown | Unknown |
| 11 | Content and microcopy | 8 | 7 | 8 |
| 12 | Motion and perceived performance | Unknown | Unknown | Unknown |

### Evidence

Every reviewer opened all of these screenshots. Files are in `/home/jeffrey-home/.t3/userdata/browser-artifacts/`.

| Label | View | File |
| --- | --- | --- |
| E1 | Mobile library | `browser-screenshot-localhost-mw35py4z-1a233eae.png` |
| E2 | Mobile Old Testament | `browser-screenshot-localhost-mw35qcb7-6d7a109c.png` |
| E3 | Desktop Old Testament | `browser-screenshot-localhost-mw35qpja-8c38eff4.png` |
| E4 | Desktop Genesis chapters | `browser-screenshot-localhost-mw35rtpu-32165670.png` |
| E5 | Desktop reader | `browser-screenshot-localhost-mw35sils-2b48f83c.png` |
| P1 | [Bible.com Genesis 1](https://www.bible.com/bible/1/GEN.1.KJV) | `browser-screenshot-www-bible-com-mw35r3jp-54dd9bdc.png` |
| P2 | [Church of Jesus Christ Old Testament](https://www.churchofjesuschrist.org/study/scriptures/ot?lang=eng) | `browser-screenshot-www-churchofjesuschrist-org-mw35rjvd-eea1eeb4.png` |

### Findings

All three reviewers independently identified:

- The desktop Genesis picker and reader have no prominent in-content heading, only a small title at the top right.
- The reader's default line length is excessively long.
- Inactive primary navigation destinations show only icons.

Peer techniques observed are a prominent chapter heading, a bounded reading measure, and persistent context. They
inform the approach only; peer identities are not to be copied.

### Gaps not reviewed

- Dark appearance
- Keyboard use
- Zoom
- Mobile chapters and mobile reader
- Runtime states
- Timing
- Authenticated data

## Round 1 proposed fixes

These fixes do not establish a score. Scores come only from fresh review of captures taken after the change.

1. Show clear in-content book and chapter titles in the book chapter picker and reader, with one exposed `h1`.
2. Constrain the comfortable reader width while keeping explicit wide and full preferences and comparison layouts.
3. Show persistent labels in the mobile primary navigation and expanded desktop navigation.

## Round 1 fresh review

| Item | Value |
| --- | --- |
| Revision | `e5337a97` |
| Scope | Signed-out library → Old Testament books → Genesis chapters → Genesis 1 reader; unchanged from the baseline path |
| Viewports | Desktop 1280×800 and mobile 390×844, with a partial 320×740 keyboard and reflow check |
| Build | `npm run build`, then `next start` on port 3124; K1 ran the same revision in development on port 3123 |
| Council | gpt-6.1-sol (UX), gpt-6-astra (visual), gpt-6.1-terra (accessibility) |
| Target score | 9 |
| Gate | Not met |
| Confirmed blockers | None |
| Evidence manifest | `/tmp/verse-ui-round1.json` |
| Reviewer reports | `/tmp/verse-round1-ux.md`, `/tmp/verse-round1-visual.md`, `/tmp/verse-round1-access.md` |
| Peer sources accessed | 2026-11-05 UTC |

### Provenance notes

- Models are labeled from the harness assignment recorded by the lead. The reports self-identify generically as Codex and do
  not expose a model identifier.
- The reports state a peer date of 2026-11-04 or say no date was supplied. The peer sources were accessed on
  2026-11-05 UTC. The reports themselves are left unedited.
- Report paths and scope did not change during this round.

### What the evidence added

R1 opened evidence the baseline did not have: mobile picker (E6), mobile reader (E7), dark mobile reader (E8), and the
partial keyboard and reflow observation K1. Baseline labels E1 to E5 and R1 labels E1 to E8 name different captures.

The numeric R1 scores for States and feedback, Accessibility, and Responsive and adaptive behavior replace Unknown
because of this evidence expansion. They are not proven improvements.

| Label | Manifest description | File or source |
| --- | --- | --- |
| E1 | R1library | `browser-screenshot-localhost-mw36puye-7521ad3f.png` |
| E2 | R1mobilebooks | `browser-screenshot-localhost-mw36pou3-fb84db7c.png` |
| E3 | R1books | `browser-screenshot-localhost-mw36u17u-54c653b2.png` |
| E4 | R1picker | `browser-screenshot-localhost-mw36ttet-763b3857.png` |
| E5 | R1reader | `browser-screenshot-localhost-mw36tjq1-1eaebe15.png` |
| E6 | R1mobilepicker | `browser-screenshot-localhost-mw36q0x7-347d4b32.png` |
| E7 | R1mobilereader | `browser-screenshot-localhost-mw36uw2v-dc72febd.png` |
| E8 | R1darkreader | `browser-screenshot-localhost-mw36v18w-0c54183f.png` |
| P1 | [Bible.com Genesis 1](https://www.bible.com/bible/1/GEN.1.KJV) | `browser-screenshot-www-bible-com-mw35r3jp-54dd9bdc.png` |
| P2 | [Church of Jesus Christ Old Testament](https://www.churchofjesuschrist.org/study/scriptures/ot?lang=eng) | `browser-screenshot-www-churchofjesuschrist-org-mw35rjvd-eea1eeb4.png` |
| K1 | Partial keyboard, target, and reflow observation at 320×740 | `behavior.K1` in the manifest |

Screenshot files are in `/home/jeffrey-home/.t3/userdata/browser-artifacts/`.

Rows in the next three tables are copied verbatim from each report; only the `#` column is added.

### gpt-6.1-sol (UX)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | Medium | E1–E7, K1 | Library, book, chapter and reader hierarchy is understandable and K1 reaches real scripture by keyboard. The mobile reader has no explicit visible back/up control, unlike the preceding screens; exit and chapter-switch discoverability remain uncertain. Reverse navigation and end-of-chapter states were not observed. |
| 2 | Visual hierarchy | 8 | Medium | E1–E8 | Book names and chapter numbers are easy to identify; reading text is the focal point. The mobile first-use tip and persistent bottom navigation compete with the passage at the bottom of the viewport. Relevant opened menus and focused states are absent. |
| 3 | Layout and spacing | 7 | Medium | E3–E8 | Desktop grids and reading width are deliberate. In both mobile reader themes the tip and bottom navigation overlap, and the passage continues visibly underneath them. Overlay spacing needs repair; the effect while scrolling and after dismissal is unverified. |
| 4 | Typography | 8 | Medium | E1–E8, K1 | The serif passage and titles, restrained sans-serif metadata, and measured 608px desktop reading width support reading. The mobile tip wraps into the navigation region. Long-title, enlarged-text and 200% zoom cases are missing. |
| 5 | Iconography and imagery | 8 | Medium | E1–E8 | Warm book artwork is coherent and gives the library a distinct identity; arrows consistently signal entry. The eye and mobile book/log icons do not explain their outcome visually. Accessible names and tooltips were not observed. |
| 6 | Color and contrast | 8 | Medium | E1–E8 | Light and dark reader colors preserve the warm identity and distinguish verse numbers from passage text without relying on color to identify verses. Muted metadata and subtle borders need measurement; no contrast ratios or AA conclusion can be established. Dark library, books and chapter picker are missing. |
| 7 | Components and consistency | 8 | Medium | E1–E8, K1 | Rounded surfaces, outlined borders, arrow controls, title typography and navigation are cohesive across captured pages. Reader navigation changes substantially on mobile, with labels and the back/up affordance absent. Open-control behavior is unverified. |
| 8 | States and feedback | 7 | Medium | K1, E5, E7, E8 | K1 directly observes destination headings, real chapter content and focus transfer after navigation. The first-use instruction is visible but its placement interferes with reading on mobile. Dismissal, persistence, loading, errors, empty states and recovery were not exercised. This is a partial score for observed navigation feedback, not a claim about all states. |
| 9 | Accessibility | 8 | Medium | K1 | K1 supports the tested Go back → Genesis → Chapter 1 keyboard segment, focus indication, heading focus after navigation, and measured 48px-high navigation controls. Full library-to-reader traversal, reverse traversal, names/roles, screen reader behavior, contrast, 200% zoom and reduced motion remain unverified. This is a partial keyboard/target assessment, not an AA certification or measured AA failure. |
| 10 | Responsive and adaptive behavior | 7 | Medium | E2–E8, K1 | Book cards reflow from three desktop columns to one mobile column, and chapter tiles reflow from nine to four. K1 measures scrollWidth 320 at books, picker and reader. Mobile reader overlays still collide. Full scroll coverage, touch interactions, translated strings, enlarged text and dark browse states are missing. |
| 11 | Content and microcopy | 8 | Medium | E1–E8 | Book names, chapter totals and the passage heading clearly describe destinations. The selection tip is actionable but too wordy for its compact mobile placement; icon-only reader tools provide weak visible outcome labels. Tool names after opening, search results and error copy were not observed. |
| 12 | Motion and perceived performance | unknown | Low | K1 does not measure timing or animation; screenshots are static | No measured response time, layout-shift sequence, loading behavior or reduced-motion observation. Successful navigation alone does not establish perceived speed. |

### gpt-6-astra (visual)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | Medium | E1–E7, K1 | Collection/book/chapter progression and successful keyboard opening are evidenced. Reader mobile toolbar loses the explicitly visible parent/back affordance present in the picker; return path and chapter continuation untested. |
| 2 | Visual hierarchy | 8 | High | E1–E8 | Attractive artwork/title separation, clear chapter grid and reading focal point. Mobile library promotes weekly reading and journal ahead of collection selection, creating additional scrolling for the scoped browse task; reader tip competes with reading. |
| 3 | Layout and spacing | 7 | High | E2–E8 | Consistent cards, gutters and reader measure. Mobile tip collides with bottom navigation and scripture; desktop tip also covers passage text. Need nonoverlapping onboarding placement. |
| 4 | Typography | 8 | High | E1–E8, K1 | Warm serif hierarchy is readable and distinctive, with comfortable measured desktop reader width of 608px. Tiny desktop uppercase category labels add low-value visual noise; reader verse spacing is uneven between some consecutive verses. Zoom and alternative text-size states missing. |
| 5 | Iconography and imagery | 8 | High | E1–E8 | The warm illustrated collection/book imagery is coherent and meaningfully distinguishes content. Mobile reader eye/book-shaped actions lack visible explanatory labels; meaning is less immediate than labeled navigation. |
| 6 | Color and contrast | 8 | Medium | E1–E8 | Warm surface/ink pairing and restrained accent verse numbers remain coherent in light and dark reader. Contrast is visually assessed only, not measured; dark browse/picker and interactive state parity missing. No WCAG claim. |
| 7 | Components and consistency | 8 | Medium | E2–E8 | Capsules, outlines, rounding and card arrows form a coherent family. Mobile reader omits the visible back control used by books/picker, and desktop has two gear icons without visible differentiation. Menu contents and control behavior untested. |
| 8 | States and feedback | 7 | Medium | K1, E5, E7, E8 | K1 reports successful route change, real passage display and heading focus after navigation. Reader tip is a visible onboarding state but overlaps navigation on mobile. Loading, empty, errors, success after mutations and dismissal behavior unknown. |
| 9 | Accessibility | 7 | Medium | K1, E2–E8 | K1 gives partial keyboard activation, focus outline and heading-focus evidence plus measured navigation targets. Full traversal, assistive technology names/roles, 200% zoom, reduced motion and contrast measurements missing. This is a partial-evidence usability score, not certification or an AA failure claim. |
| 10 | Responsive and adaptive behavior | 7 | Medium | K1, E2–E8 | Desktop grid becomes mobile list; reader and chapters reflow. K1 measures scrollWidth 320 for books/picker/reader. Mobile reader tip and bottom navigation collide. Long labels, translated content, zoom, additional widths and full touch interaction missing. |
| 11 | Content and microcopy | 8 | Medium | E1–E8 | Familiar titles, counts and concise weekly-reading labels are clear. Selection tip provides actionable guidance but is concealed in mobile state; eye and book-shaped reader actions need contextual names. Error and empty copy unobserved. |
| 12 | Motion and perceived performance | unknown | Low | K1 | Successful navigation does not establish speed, layout stability or motion quality. No timings, recordings, loading transitions or reduced-motion behavior observed. |

### gpt-6.1-terra (accessibility)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | Medium | E1–E7, K1 | The visible hierarchy and partial keyboard route work, but the full route from library and back navigation, including alternate chapters, remain unverified. |
| 2 | Visual hierarchy | 8 | Medium | E1–E8 | Clear titles and chapter grid; the mobile reader's tip competes with navigation and reading content. Other states are unexamined. |
| 3 | Layout and spacing | 7 | Medium | E1–E8 | Mobile reader tip overlaps bottom navigation and its own content; long content and other scroll positions untested. |
| 4 | Typography | 8 | Medium | E1–E8, K1 | Generous reader line spacing and measured desktop width support reading; the small uppercase metadata and obscured tip merit checks, and zoom is untested. |
| 5 | Iconography and imagery | 7 | Medium | E1–E8 | Artwork is coherent and purposeful; the reader's eye and book icons have no visible labels on mobile, making their outcomes less apparent. Accessible names are unknown. |
| 6 | Color and contrast | 8 | Low | E1–E8 | Light and dark reader text appears legible, but no contrast measurement, theme-wide parity, or applicable standard has been established. |
| 7 | Components and consistency | 7 | Medium | E1–E8 | Cards and grids are consistent; mobile reader swaps labeled actions for icons and overlays a tip onto persistent navigation. Behavior across states remains untested. |
| 8 | States and feedback | 6 | Low | E5, E7–E8, K1 | Route transitions and focus movement were observed in K1, but the partially hidden tip is a visible feedback problem. Loading, error, empty, success, and dismissal behavior remain untested. |
| 9 | Accessibility | 6 | Low | E7–E8, K1 | K1 demonstrates part of the keyboard route, focus, and measured navigation sizes; the tip is visually obscured. Full traversal, names and roles, screen reader, 200% zoom, reduced motion, and contrast remain untested. No WCAG failure is asserted. |
| 10 | Responsive and adaptive behavior | 7 | Medium | E2–E8, K1 | K1 reports no horizontal overflow at 320 px for three pages; mobile screenshots show the tip and navigation collision. Long text, translated strings, and touch behavior remain untested. |
| 11 | Content and microcopy | 7 | Medium | E1–E8 | Book and chapter labels are clear, but the mobile reader's icon-only controls obscure action meaning and the tip text is clipped by navigation. Error and empty copy are untested. |
| 12 | Motion and perceived performance | unknown | Low | K1 | Navigation occurred, but no response timings, layout shift, wait feedback, or motion behavior were measured. |

### Lowest category scores

| # | Category | Lowest score |
| --- | --- | --- |
| 1 | Task flow and information architecture | 8 |
| 2 | Visual hierarchy | 8 |
| 3 | Layout and spacing | 7 |
| 4 | Typography | 8 |
| 5 | Iconography and imagery | 7 |
| 6 | Color and contrast | 8 |
| 7 | Components and consistency | 7 |
| 8 | States and feedback | 6 |
| 9 | Accessibility | 6 |
| 10 | Responsive and adaptive behavior | 7 |
| 11 | Content and microcopy | 7 |
| 12 | Motion and perceived performance | Unknown |

### Findings

Raised by all three reviewers:

- UX F1, visual V1, accessibility F1: the first-visit tip overlaps the mobile bottom navigation and the passage.

Raised by the UX and visual reviewers:

- UX F2, visual V2: the mobile reader title opens the chapter picker but has no visible sign of it.

Raised and left out of round 2's scope:

- UX F3, visual V4, accessibility F2: icon-only reader tools.
- Visual V3: verse spacing rhythm.
- Accessibility F3: small uppercase metadata.

### Remaining gaps

No full keyboard traversal, 200% zoom, screen reader, error recovery, reduced motion, loading timings, authenticated
data, or measured contrast. Dark appearance covers the mobile reader only. Peers are desktop screenshots only.

### Automated checks at `e5337a97`

Run independently by the lead.

| Check | Status | Result |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | |
| `npm run test:browse` | Passed | 36 tests |
| `npm run test:cfm-reader` | Passed | 34 tests |
| `npm run build` | Passed | |
| `git diff --check` | Passed | |
| ESLint | Failed | 2 errors and 4 warnings in `src/components/ChapterReader.tsx`, matching the baseline's rules and counts |

Exact ESLint outputs are `/tmp/verse-baseline-eslint.json` and `/tmp/verse-current-eslint.json`.

## Round 2 proposed fixes

These fixes do not establish a score. Scores come only from fresh review of captures taken after the change.

1. Place the first-visit tip fully above the mobile bottom navigation, including the safe area, on an opaque surface,
   with a labeled, non-modal region and a visible dismiss button large enough to tap.
2. Mark the mobile reader title with a chevron and give it an accessible name saying it chooses a chapter. Desktop
   breadcrumbs and simple mode stay as they are.

## Score ledger

Lowest score any reviewer gave in each category. Earlier rounds are not rewritten.

| Round | Revision | Gate | Confirmed blockers |
| --- | --- | --- | --- |
| R0 | `635aa60d` | Not met | None |
| R1 | `e5337a97` | Not met | None |
| R2 | Pending | Pending | Pending |

| # | Category | R0 lowest | R1 lowest | R2 lowest | Comparability of R0 and R1 |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 7 | 8 | Pending | R1 evidence set is larger than R0, so this is not a pure before and after |
| 2 | Visual hierarchy | 7 | 8 | Pending | R1 evidence set is larger than R0, so this is not a pure before and after |
| 3 | Layout and spacing | 7 | 7 | Pending | R1 evidence set is larger than R0, so this is not a pure before and after |
| 4 | Typography | 7 | 8 | Pending | R1 evidence set is larger than R0, so this is not a pure before and after |
| 5 | Iconography and imagery | 7 | 7 | Pending | R1 evidence set is larger than R0, so this is not a pure before and after |
| 6 | Color and contrast | 7 (low confidence) | 8 | Pending | R1 evidence set is larger than R0, so this is not a pure before and after |
| 7 | Components and consistency | 7 | 7 | Pending | R1 evidence set is larger than R0, so this is not a pure before and after |
| 8 | States and feedback | Unknown | 6 | Pending | New numeric score from evidence expansion, not a proven improvement |
| 9 | Accessibility | Unknown | 6 | Pending | New numeric score from evidence expansion, not a proven improvement |
| 10 | Responsive and adaptive behavior | Unknown | 7 | Pending | New numeric score from evidence expansion, not a proven improvement |
| 11 | Content and microcopy | 7 | 7 | Pending | R1 evidence set is larger than R0, so this is not a pure before and after |
| 12 | Motion and perceived performance | Unknown | Unknown | Pending | Unknown in both |

R2 is pending capture and review.
