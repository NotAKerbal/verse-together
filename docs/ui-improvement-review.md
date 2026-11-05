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
| Evidence manifest | [verse-ui-round1.json](ui-review/evidence/verse-ui-round1.json) |
| Reviewer reports | [ux](ui-review/reviews/verse-round1-ux.md), [visual](ui-review/reviews/verse-round1-visual.md), [access](ui-review/reviews/verse-round1-access.md) |
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

## Round 2 fresh review

| Item | Value |
| --- | --- |
| Revision | `0225f175` |
| Scope | Signed-out library → Old Testament books → Genesis chapters → Genesis 1 reader; unchanged from the earlier path |
| Viewports | Desktop 1280×800 and mobile 390×844, plus 320×568 and keyboard and dismissal states |
| Build | `npm run build`, then `next start` on port 3124 |
| Council | gpt-6.1-sol (UX), gpt-6-astra (visual), gpt-6.1-terra (accessibility) |
| Target score | 9 |
| Gate | Not met |
| Confirmed blockers | None established by any report |
| Evidence manifest | [verse-ui-round2.json](ui-review/evidence/verse-ui-round2.json) |
| Reviewer reports | [ux](ui-review/reviews/verse-round2-ux.md), [visual](ui-review/reviews/verse-round2-visual.md), [access](ui-review/reviews/verse-round2-access.md) |
| Peer sources accessed | 2026-11-05 UTC |

### Provenance notes

- Models are labeled from the harness assignment recorded by the lead. The reports self-identify generically as Codex and do
  not expose a model identifier.
- Every report says it opened E1 to E11, P1, P2, and the K2 record, and could open all of them. Each treats K2 as the
  lead's recorded observation, not a runtime test the reviewer repeated.
- The accessibility report writes its table without outer pipes. They are added here for rendering; cell text is unchanged.

### What the evidence added

R2 opened evidence R1 did not have: the 320×568 reader (E9), the focused dismiss state (E10), the dismissed state (E11), and
the K2 observation. R1 labels E1 to E8 and R2 labels E1 to E8 name different captures of matching views.

R2 scores therefore rest on a larger evidence set than R1. Differences from R1 are not a pure before and after, and
this ledger does not present them as proven improvements.

| Label | Manifest description | File or source |
| --- | --- | --- |
| E1 | R2library | `browser-screenshot-localhost-mw37s1vl-3033ab26.png` |
| E2 | R2mobilebooks | `browser-screenshot-localhost-mw37rvzs-3bac210d.png` |
| E3 | R2books | `browser-screenshot-localhost-mw37srfv-915bcf38.png` |
| E4 | R2picker | `browser-screenshot-localhost-mw37syny-72bd9278.png` |
| E5 | R2reader | `browser-screenshot-localhost-mw37t5wd-f02fa52c.png` |
| E6 | R2mobilepicker | `browser-screenshot-localhost-mw37rqmn-75d9ef40.png` |
| E7 | R2mobilereader | `browser-screenshot-localhost-mw37o4x3-4781fec9.png` |
| E8 | R2darkreader | `browser-screenshot-localhost-mw37obut-9676a8ba.png` |
| E9 | R2smallreader | `browser-screenshot-localhost-mw37p9h0-97ca4166.png` |
| E10 | R2focus | `browser-screenshot-localhost-mw37q3cg-ddb06fda.png` |
| E11 | R2dismissed | `browser-screenshot-localhost-mw37qd80-15728bf4.png` |
| P1 | [Bible.com Genesis 1](https://www.bible.com/bible/1/GEN.1.KJV) | `browser-screenshot-www-bible-com-mw35r3jp-54dd9bdc.png` |
| P2 | [Church of Jesus Christ Old Testament](https://www.churchofjesuschrist.org/study/scriptures/ot?lang=eng) | `browser-screenshot-www-churchofjesuschrist-org-mw35rjvd-eea1eeb4.png` |
| K2 | Keyboard, target, overlap, and reflow observation at 390×844 and 320×568 | `behavior.K2` in the manifest |

Screenshot files are in `/home/jeffrey-home/.t3/userdata/browser-artifacts/`.

K2, verbatim from the manifest:

> Lead tool observations at0225f175 production: at390x844 tip y696.4 bottom758.4/nav top770.4 gives12pxgap; button67.5x44 and tip bg rgb255253249 opaque. At320x568 scrollWidth320, tipbottom482.4/navtop494.4 gap12. Six Tab presses focused Got it dismiss tip with2px outline, Enter removedtip; focusBODY. Reload tipabsent. TwoTabs from freshreader focused Genesis1 choose a chapter link href /browse/oldtestament/genesis. Enter navigated to correct picker, one visible h1Genesis, scrollWidth320; focusBODY after router navigation. No fake data/backend changes. Article text loaded from bundled server scripture route; earlier lead source inspection confirms getLocalLdsChapter path for defaultLDS. No full keyboard or AA certification.

Rows in the next three tables are copied verbatim from each report; only the `#` column is added.

### gpt-6.1-sol (UX)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 9 | Medium | E1–E7, E11, K2, P1–P2 | Clear collection → book → chapter → text progression; K2 confirms chapter return. Complete keyboard traversal and reader-end navigation remain unobserved. |
| 2 | Visual hierarchy | 8 | High | E3–E11 | Reader text normally dominates; first-visit tip and navigation compete with it on the short viewport (F1). |
| 3 | Layout and spacing | 8 | High | E3–E11, K2 | Consistent cards and reading measure; the compact reader dedicates substantial space to persistent and introductory chrome (F1). |
| 4 | Typography | 9 | High | E2–E11, P1 | Warm serif titles/body, legible verse distinction, comfortable desktop measure, and intact narrow/dark reading. Zoom and alternate font settings not observed. |
| 5 | Iconography and imagery | 8 | Medium | E1–E9 | Artwork supports book recognition and identity. Reader's icon-only study controls require learned meanings (F2); their tooltip/accessibility names were not examined. |
| 6 | Color and contrast | 8 | Medium | E3–E10 | Light/dark reader hierarchy is visually clear. No measured text/component contrast; dark collection and picker parity unobserved. No AA claim. |
| 7 | Components and consistency | 9 | Medium | E2–E11, K2 | Repeated rounded surfaces, arrows, selected Browse, and reader controls cohere across shown sizes/themes. Other interactive states and dark browse surfaces remain unobserved. |
| 8 | States and feedback | 8 | Medium | E7–E11, K2 | Visible focus, successful tip removal, persisted dismissal, and actual chapter navigation are evidenced. Loading/error/recovery and post-navigation focus behavior beyond BODY were not exercised. |
| 9 | Accessibility | 8 | Medium | E9–E11, K2 | The observed chapter and dismissal keyboard paths work; dismiss focus is visible and target measured 67.5×44 CSS px. Full traversal, names/roles, assistive technology, zoom, and reduced motion remain unverified. No certification or measured failure established. |
| 10 | Responsive and adaptive behavior | 8 | Medium | E2–E11, K2 | Desktop/mobile structures adapt; K2 confirms 320px scroll width and 12px tip/nav separation. Short-screen reading remains crowded (F1); translated strings and other reader modes unobserved. |
| 11 | Content and microcopy | 9 | Medium | E1–E11, K2 | Collection/book/chapter names and counts describe destinations plainly; tip states the selection benefit and dismisses predictably. Error/empty copy and icon help remain unobserved. |
| 12 | Motion and perceived performance | unknown | — | K2 | State changes were observed, but no timing, transition, loading, or layout-shift evidence supports a performance score. |

### gpt-6-astra (visual)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | Medium | E1–E7, K2 | Clear library/book/chapter sequence; desktop chapter selector looks more like a breadcrumb label than an action. Full keyboard sequence and return journey absent. |
| 2 | Visual hierarchy | 8 | High | E1–E11 | Scripture and book names dominate appropriately. Mobile reader's large tool and navigation capsules compete with text, especially at short height. |
| 3 | Layout and spacing | 8 | High | E2–E11, K2 | Consistent alignment and rounded geometry. Fixed tip and bottom navigation leave fragmented readable space at 320×568 despite their measured 12px separation. |
| 4 | Typography | 9 | High | E1–E11, P1, P2 | Serif reading text and sans-serif utility labels are disciplined and readable in captured default/dark/focus/dismissed states; comparable to peers. Long translated labels and 200% zoom remain unobserved. |
| 5 | Iconography and imagery | 8 | High | E1–E8 | Art adds a coherent warm identity; arrows and search are recognizable. Mobile eye and book/log symbols do not disclose their outcomes. |
| 6 | Color and contrast | 8 | Medium | E1–E11 | Warm light and dark palettes preserve hierarchy visually. No measured contrast evidence; dark library/picker and interactive color states absent. No AA conclusion. |
| 7 | Components and consistency | 8 | High | E2–E11 | Card, capsule, border, and icon treatment are coherent. Reader chapter action has a chevron on mobile but no equivalent on desktop; desktop Journal is repeated in global and floating controls. |
| 8 | States and feedback | 8 | Medium | E7, E9–E11, K2 | Tip dismisses with Enter and remains absent after reload; focus is visibly acknowledged. Loading, error, empty, and substantive reading-action feedback absent. |
| 9 | Accessibility | 8 | Medium | E9–E11, K2 | Observed chapter-link keyboard activation and visible dismissal focus work; measured dismiss target is 67.5×44 CSS px. Focus returns to BODY after dismissal/navigation; complete traversal, semantics, assistive technology, contrast, reduced motion, and zoom unverified. No blocker or AA claim. |
| 10 | Responsive and adaptive behavior | 8 | Medium | E2–E11, K2 | Desktop grid becomes mobile list; chapter grid and reader reflow. Observed reader/picker scrollWidth 320 at 320px supports narrow reflow; tip/navigation crowd short height. Wide/full/comparison and translated content absent. |
| 11 | Content and microcopy | 8 | High | E1–E11 | Clear book names, chapter counts, and actionable selection tip. Log/eye purposes are insufficiently explicit on mobile; resource search wording assumes familiarity. |
| 12 | Motion and perceived performance | unknown | Low | K2 | Navigation/dismissal completion is observed, but response timing, progress, layout shift, and motion behavior were not captured. |

### gpt-6.1-terra (accessibility)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | Medium | E1–E7, K2 | Clear progression and chapter return; complete keyboard journey and other routes not observed. |
| 2 | Visual hierarchy | 8 | Medium | E1–E9 | Clear book/chapter/read hierarchy; fixed mobile overlays compete with reading. |
| 3 | Layout and spacing | 7 | Medium | E2–E9, E11 | Tip and navigation cover reading area on small screens; scroll reachability beneath navigation not verified. |
| 4 | Typography | 8 | Medium | E3–E9 | Serif reading text and hierarchy are clear; small metadata and non-default text settings not assessed. |
| 5 | Iconography and imagery | 7 | Medium | E1–E8 | Consistent artwork; reader eye and book icons lack visible text, so meaning is not self-evident. Accessible names unknown. |
| 6 | Color and contrast | 8 | Low | E3–E8 | Light and dark reader appear legible; contrast is unmeasured, and dark other screens unobserved. |
| 7 | Components and consistency | 8 | Medium | E2–E8 | Repeated cards and controls are consistent; interactive behavior beyond K2 is unverified. |
| 8 | States and feedback | 7 | Medium | E7, E9–E11, K2 | Tip dismisses and remains absent on reload; loading, error, success, and other interactions unobserved. |
| 9 | Accessibility | 6 | Medium | E9–E11, K2 | Visible focus and keyboard dismissal observed; focus returns to BODY after dismissal/navigation. Full path, names/roles, screen readers, zoom and reduced motion untested. |
| 10 | Responsive and adaptive behavior | 7 | Medium | E2, E6–E9, E11, K2 | Reader fits measured 320px width and tip clears navigation, but overlays cover passage; touch operation, final content reachability and long strings untested. |
| 11 | Content and microcopy | 8 | Medium | E1–E7 | Chapter counts and labels aid navigation; icon-only reader controls and error copy need evaluation. |
| 12 | Motion and perceived performance | unknown | Low | E1–E11, K2 | Static captures and the reported interactions do not measure timing, loading, layout shift, or motion. |

### Lowest category scores

| # | Category | Lowest score |
| --- | --- | --- |
| 1 | Task flow and information architecture | 8 |
| 2 | Visual hierarchy | 8 |
| 3 | Layout and spacing | 7 |
| 4 | Typography | 8 |
| 5 | Iconography and imagery | 7 |
| 6 | Color and contrast | 8 |
| 7 | Components and consistency | 8 |
| 8 | States and feedback | 7 |
| 9 | Accessibility | 6 |
| 10 | Responsive and adaptive behavior | 7 |
| 11 | Content and microcopy | 8 |
| 12 | Motion and perceived performance | Unknown |

### Findings

Raised by all three reviewers:

- UX F1, visual F3, accessibility F2: the fixed tip and bottom navigation crowd or obscure the passage, most of all at
  320×568.
- UX F2, visual F1, accessibility F3: the mobile book and eye reader controls do not show what they do.

Raised by one reviewer:

- Visual F2: the desktop chapter link reads as a breadcrumb, without the chevron mobile has.
- Accessibility F1: focus moves to `BODY` after tip dismissal and after route navigation.

Observed by the lead and not raised as a finding by a report:

- `aria-current="page"` sits on the link to the chapter picker, which is a different page.

### Remaining gaps

From the manifest: No complete keyboard traversal, assistive tech,200%zoom,loading/error/reducedmotion/timing/contrast; dark onlymobile reader; wide/full/comparison not rerun in thiscycle; authenticated states out ofscope. E9-E11 are extra states not in baseline. Motion unknown if not directly evidenced.

### Automated checks at `0225f175`

Reported by the lead, who ran them independently.

| Check | Status | Result |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | |
| `npm run test:browse` | Passed | 36 tests |
| `npm run test:cfm-reader` | Passed | 34 tests |
| `npm run build` | Passed | |
| `git diff --check` | Passed | |
| ESLint | Failed | Matches the baseline's rules and counts in `src/components/ChapterReader.tsx` |

## Round 3 proposed fixes

This is the third and final authorized implementation cycle. No further UI changes follow it without the owner's
approval. These fixes do not establish a score. Scores come only from fresh review of captures taken after the change;
that review is recorded under Round 3 fresh review.

1. Move the first-visit tip into the reader's content, between the chapter title and the scripture, so it covers neither
   the passage nor the navigation. It keeps its copy, opaque surface, named aside, 44px dismiss button, simple-mode hiding,
   and stored flag. Dismissing by keyboard moves focus to the chapter title without scrolling; dismissing by pointer moves
   no focus.
2. Show short labels under the mobile Log, Simple, and Settings icons, inside the existing pill and 44px targets, in the
   loaded reader and the loading shell. Search stays icon-only and desktop controls stay compact.
3. Show the chapter link's chevron on desktop too. Remove `aria-current="page"` from that link and keep its bold style through
   a class. The plain current chapter in one-chapter books keeps `aria-current`.

Consequences of putting the tip in the content:

- Selecting text marks the tip as seen but leaves it on screen until it is dismissed or the reader moves to another page,
  because removing it mid-selection would move the passage under the reader's finger or cursor. It also stays when a
  resource or word panel opens.
- A first visit that opens at a verse link shows no tip and does not mark it as seen, because adding the tip during the
  scroll would move the target verse off center. The tip appears on the next chapter opened without a verse link.

Left out of round 3's scope:

- Focus after route navigation (accessibility F1's second half).
- Reachability of every verse above the bottom navigation through a full chapter scroll (accessibility F2's verification).
- Verse spacing rhythm (R1 visual V3). Its source grouping was not settled, so spacing is unchanged.
- Optional chapter descriptions, seen on a peer (UX and visual peer observations).

## Round 3 fresh review

| Item | Value |
| --- | --- |
| Revision | `240c5d6f`. This is the frozen UI revision. A later docs-only commit does not invalidate the review |
| Scope | Signed-out library → Old Testament books → Genesis chapters → Genesis 1 reader; unchanged from the earlier path |
| Viewports | Desktop 1280×800, mobile 390×844, and small 320×568; light, plus the dark mobile reader |
| Build | `npm run build`, then `next start` on port 3124 |
| Data | Default LDS route, with the bundled server scripture route through `getLocalLdsChapter` and actual verse content. No fake data or backend writes |
| Council | gpt-6.1-sol (UX), gpt-6-astra (visual), gpt-6.1-terra (accessibility) |
| Target score | 9 |
| Gate | Not met |
| Confirmed blockers | None established by any report |
| Evidence manifest | [verse-ui-round3.json](ui-review/evidence/verse-ui-round3.json) |
| Reviewer reports | [ux](ui-review/reviews/verse-round3-ux.md), [visual](ui-review/reviews/verse-round3-visual.md), [access](ui-review/reviews/verse-round3-access.md) |
| Peer sources accessed | 2026-11-05 UTC |

### Provenance notes

- Models are labeled from the harness assignment recorded by the lead. The reports self-identify generically as Codex and do
  not expose a model identifier.
- Every report says it opened E1 to E12, P1, P2, and the K3 record, and could open all of them. Each treats K3 as the
  lead's recorded observation, not a runtime test the reviewer repeated.
- E10 and E11 are the same screenshot, so they count as one observation.
- P1 and P2 are legitimate desktop peer captures. They are not validation of peer behavior.

### What the evidence added

R3 opened evidence earlier rounds did not have: the chapter-end state (E12) and the K3 observation. The scope stayed the
same and the evidence expanded, so differences from R2 are not a pure before and after, and this ledger does not present them
as proven improvements.

| Label | Manifest description | File or source |
| --- | --- | --- |
| E1 | R3library | `browser-screenshot-localhost-mw38jq4i-c045add8.png` |
| E2 | R3mobilebooks | `browser-screenshot-localhost-mw38ja1f-40cd1a94.png` |
| E3 | R3books | `browser-screenshot-localhost-mw38in2u-630fa067.png` |
| E4 | R3picker | `browser-screenshot-localhost-mw38igik-51b60147.png` |
| E5 | R3reader | `browser-screenshot-localhost-mw38iax9-b2f51a7e.png` |
| E6 | R3mobilepicker | `browser-screenshot-localhost-mw38jif6-a48c8e59.png` |
| E7 | R3mobilereader | `browser-screenshot-localhost-mw38eumh-e246c368.png` |
| E8 | R3darkreader | `browser-screenshot-localhost-mw38f0k6-8e3d6e77.png` |
| E9 | R3smallreader | `browser-screenshot-localhost-mw38feff-ed0d40a6.png` |
| E10 | R3focus | `browser-screenshot-localhost-mw38gsif-a05c2ade.png` |
| E11 | R3dismissed | `browser-screenshot-localhost-mw38gsif-a05c2ade.png` |
| E12 | R3end | `browser-screenshot-localhost-mw38h3fr-4f0ea99e.png` |
| P1 | [Bible.com Genesis 1](https://www.bible.com/bible/1/GEN.1.KJV) | `browser-screenshot-www-bible-com-mw35r3jp-54dd9bdc.png` |
| P2 | [Church of Jesus Christ Old Testament](https://www.churchofjesuschrist.org/study/scriptures/ot?lang=eng) | `browser-screenshot-www-churchofjesuschrist-org-mw35rjvd-eea1eeb4.png` |
| K3 | Lead tool observation at 320×568 | `behavior.K3` in the manifest |

Screenshot files are in `/home/jeffrey-home/.t3/userdata/browser-artifacts/`.

K3, verbatim from the manifest:

> Lead tools at240c5d6f production:320x568 scrollWidth320; tip computedpositionstatic, bottom220.13,verse1top248.13; Search,Log,Simple,Settings controls44x44 with real accessible names. Pickerlink noaria-current. SixTabsfromreader focusedGotitdismissbutton2pxoutline, Enterremovedtip andfocusH1Genesis1 with2pxoutline;scrollY0before/after;reloadtipabsent. Atchapterend afterscroll, actualverse31 bottom263.94 versusnavtop494.41, so finalversevisibleabovebar. ScreenshotE12. These are observed toolresults, not full keyboard/AA certification. Earlier dataflowinspect bundledscripture serverroute to getLocalLdsChapter; actualGenesis1 textloaded. Nobackendwrites/fakedata. Bodytext rgb31,29,26 onrgb246,243,236 primarylightonly; noentireUIcontrastcertification.

Rows in the next three tables are copied verbatim from each report; only the `#` column is added.

### gpt-6.1-sol (UX)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | Medium | E1–E7, E12, K3 | The collection → book → numbered chapter → text sequence is clear, with location preserved in the reader. At chapter end there is no visible adjacent-chapter action; continuation relies on the header picker. Back-navigation behavior and picker operation were not exercised in this review. |
| 2 | Visual hierarchy | 9 | Medium | E1–E12, P1, P2 | Strong screen titles, clear book names, a restrained text column, and prominent chapter targets work across the captured states. Reader tools remain distinguishable from scripture. Dark browsing and additional non-default navigation states are absent; no material hierarchy problem is demonstrated in the available views. |
| 3 | Layout and spacing | 8 | Medium | E2–E12, K3 | The grid and reader adapt coherently, and the supplied end-state evidence establishes final-verse clearance. The short reader reserves substantial space for persistent chrome and chapter-end blank space without a continuation action. Full book-list/picker bottoms, intermediate widths and zoom are not shown. |
| 4 | Typography | 9 | Medium | E2–E10, E12, P1 | Serif book names and scripture are legible, with distinct sans-serif controls and visible verse numbers. Desktop line length is restrained and small-screen text wraps cleanly. User font adjustments, zoom and alternative content lengths were not captured. |
| 5 | Iconography and imagery | 9 | Medium | E1–E9, P1, P2 | Consistent warm illustrations help distinguish collections and books without entering the reader. Navigation icons are visually coherent; mobile secondary actions have text labels. Unshown interaction states and recognition testing prevent a reference-quality claim. |
| 6 | Color and contrast | 8 | Medium | E1–E10, E12, K3 | Light and mobile dark reader appearances remain visually coherent; verse numbers provide an additional positional cue rather than carrying meaning alone. K3 provides primary light text/background colors only. Full UI and dark-theme contrast have not been measured, and no WCAG target was supplied. This is not an AA conformance judgment. |
| 7 | Components and consistency | 9 | Medium | E1–E12, K3 | Rounded navigation shells, card outlines, arrow affordances and bottom selection treatment form a consistent system. The desktop/mobile presentation varies appropriately in the observed views. The tip-dismissed focus state fits this system. Most component interaction states were not captured. |
| 8 | States and feedback | 8 | Medium | E7–E12, K3 | The instructional tip has an explicit dismissal action. K3 reports that keyboard dismissal removes it, focuses the chapter heading, preserves scroll position and remains dismissed after reload; E10/E11 show the resulting state. Loading, error, navigation-progress and text-selection results are missing, so feedback coverage remains partial. |
| 9 | Accessibility | 8 | Medium | E9–E12, K3 | K3 reports real names and 44×44 controls for Search, Log, Simple and Settings, a visible keyboard outline, and successful Enter dismissal with focus restoration. This is meaningful partial behavior evidence, not a complete keyboard path. Full traversal, assistive technology, 200% zoom, reduced motion and broader contrast checks are absent. No confirmed accessibility blocker or measured AA failure is established. |
| 10 | Responsive and adaptive behavior | 8 | Medium | E2–E9, E12, K3 | Desktop grids become mobile lists and a four-column chapter grid; reader controls and tip fit the 320px capture. K3 reports scrollWidth 320 at viewport width 320 and the final verse clear of bottom navigation after scrolling. Small-width browsing, intermediate breakpoints, zoom, alternate reading widths, translated labels and dark browsing remain unverified. |
| 11 | Content and microcopy | 8 | Medium | E1–E9, E12 | Collection/book/chapter names and the text-selection instruction clearly support the task. “Log” and “Simple” give first-time readers less information about the action or current mode than the explicit instructional copy does. Resulting panels/modes were not opened, so this is a discoverability finding rather than a claim that their behavior is wrong. |
| 12 | Motion and perceived performance | unknown | Low | K3; E7, E10/E11 | K3 records a completed dismissal and unchanged scroll position, but no timed response, transition observation, loading sequence or reduced-motion behavior. Static endpoint screenshots cannot establish animation, layout shift during transitions or perceived speed. |

### gpt-6-astra (visual)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | Medium | E1–E7, E12, K3 | Collection → book → chapter → text is legible, with back affordances on browse views and a chapter selector in the reader. No visible next-chapter affordance at the captured chapter end; complete traversal and selector operation were not observed by this reviewer. |
| 2 | Visual hierarchy | 8 | High | E1–E9, E12 | Reading has a clear chapter heading and dominant text; artwork supports browsing. At small mobile widths the large fixed navigation and dense reader toolbar compete with the text, and the first-use tip takes substantial initial vertical space. |
| 3 | Layout and spacing | 8 | High | E2–E12, K3 | Cards, grids, and margins align consistently; K3 reports no horizontal overflow at 320px and a readable final verse above navigation. The small reader toolbar has little visible separation between Simple and Settings labels, and floating navigation covers portions of the scrolling text window. |
| 4 | Typography | 8 | High | E1–E12, P1 | Serif reading text and titles pair coherently with sans-serif controls, and reading measures are restrained on desktop. Utility labels become crowded at 320px; large mobile inter-verse spacing increases scrolling. No 200% zoom or alternative type-size evidence. |
| 5 | Iconography and imagery | 8 | High | E1–E9, P1, P2 | Artwork is purposeful, consistent in warmth and crop, and preserves a distinctive identity. Icons generally have strong silhouettes and familiar shapes. Desktop reader eye icon has no visible text counterpart, while mobile labels it Simple; unfamiliar users must infer its function. No tooltip interaction captured. |
| 6 | Color and contrast | 8 | Medium | E1–E10, K3 | Warm neutrals, rust verse numbers, and dark-theme inversion remain coherent. K3 supplies primary light body-text colors only. Secondary labels, control boundaries, focus states, and dark-mode contrast are not measured; no WCAG compliance or failure is asserted. |
| 7 | Components and consistency | 8 | High | E1–E12 | Pill navigation, rounded bordered cards, and serif labels recur deliberately. Mobile reader action labels and desktop icon-only actions differ in discoverability. Journal is present in desktop navigation and as a separate floating action on browse/picker views, adding a duplicate entry point. |
| 8 | States and feedback | 8 | Medium | E7–E12, K3 | The observed tip dismissal removes it, retains scroll position, transfers visible focus to the heading, and persists after reload according to K3. Loading, failure, empty, selector-open, and selection-action feedback remain unobserved. This score describes the demonstrated state transition, not comprehensive state coverage. |
| 9 | Accessibility | 8 | Medium | E9–E11, K3 | K3 reports named 44×44 reader actions and keyboard tip dismissal with visible focus; the resulting heading focus is visible in E10/E11. Complete keyboard path, assistive technology, 200% zoom, reduced motion, and comprehensive contrast measurements are missing. No certification is claimed. |
| 10 | Responsive and adaptive behavior | 8 | Medium | E2–E12, K3 | Desktop books reflow to mobile rows; chapter grids reflow; reader remains within the measured 320px viewport. End-of-chapter scroll evidence establishes final text is reachable. Toolbar labels are crowded at 320px. Dark browse/picker, wide/full/comparison modes, long translated labels, and zoom are not covered. |
| 11 | Content and microcopy | 8 | High | E1–E12 | Collection names, counts, and chapter labels are direct. The tip names concrete outcomes. Simple is ambiguous about what mode it activates, especially beside Log and Settings; chapter-end continuation is not explicitly named in the captured view. |
| 12 | Motion and perceived performance | unknown | Low | K3 | Stable scroll position during tip dismissal is a narrow observation, not evidence of response timing, transition quality, loading behavior, or layout shift across the flow. No measured timings or motion capture supplied. |

### gpt-6.1-terra (accessibility)

| # | Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | Medium | E1–E7, E12, K3 | The library, book list, chapter grid and reader show a legible route, but full navigation and return paths were not independently exercised; the meaning of Simple is unclear. |
| 2 | Visual hierarchy | 8 | Medium | E1–E9 | Titles and scripture lead the scan; the persistent navigation competes with reading on the smallest viewport. Non-default controls and states are not fully shown. |
| 3 | Layout and spacing | 7 | Medium | E2–E9, E12 | Generous reading spacing is consistent, but floating bars cover content while scrolling and cost a significant portion of the 320px viewport. The end verse is reachable above the bottom bar per K3; intermediate scrolling remains affected. |
| 4 | Typography | 8 | Medium | E3–E9 | The warm serif and comfortable reader line spacing fit the purpose. Small uppercase metadata and dense reader toolbar labels are less comfortable; zoom and alternate text settings were not examined. |
| 5 | Iconography and imagery | 8 | Medium | E1–E8 | Book imagery supports recognition and controls mostly have labels; Simple's eye icon and label do not clearly communicate the result. Other icon states are not examined. |
| 6 | Color and contrast | 8 | Medium | E5, E7–E9, K3 | Primary body text is visually distinct in light and dark reader views; K3 supplies light body colors only. Other text, control boundaries, focus, imagery and dark theme contrast were not measured. No conformance claim or numerical cap is made. |
| 7 | Components and consistency | 8 | Medium | E2–E9 | Book cards, chapter buttons and floating navigation use a coherent visual language across shown sizes. Full interactive and state consistency is unverified. |
| 8 | States and feedback | unknown | Low | E7, E10–E11, K3 | Tip dismissal, focus transfer and persistence are observed; loading, errors, success and other controls' feedback are not represented enough to score the category. |
| 9 | Accessibility | unknown | Low | E9–E11, K3 | K3 reports named 44px reader controls and visible focus after dismissal, but no complete keyboard traversal, screen-reader test, 200% zoom or reduced-motion check. Picker has no aria-current, but the picker is not shown as having a current chapter, so this alone is not a defect. |
| 10 | Responsive and adaptive behavior | 7 | Medium | E2–E9, E12, K3 | Reader has no horizontal overflow at 320px per K3 and the last verse can clear the bottom bar. Persistent controls overlay the reading area at small sizes; other 320px screens, zoom, translation and touch operation remain unverified. |
| 11 | Content and microcopy | 7 | Medium | E2–E7 | Book and chapter names and the tip are clear; Simple does not describe the resulting mode, and the action labeled Log is ambiguous without context. Error and empty copy are unobserved. |
| 12 | Motion and perceived performance | unknown | Low | K3 | No measured response times, loading transitions, layout shift or reduced-motion behavior. |

### Lowest category scores

The lowest column uses numeric scores only. An Unknown is flagged beside it, never converted into a number.

| # | Category | Lowest score | Unknown from |
| --- | --- | --- | --- |
| 1 | Task flow and information architecture | 8 | None |
| 2 | Visual hierarchy | 8 | None |
| 3 | Layout and spacing | 7 | None |
| 4 | Typography | 8 | None |
| 5 | Iconography and imagery | 8 | None |
| 6 | Color and contrast | 8 | None |
| 7 | Components and consistency | 8 | None |
| 8 | States and feedback | 8 | gpt-6.1-terra |
| 9 | Accessibility | 8 | gpt-6.1-terra |
| 10 | Responsive and adaptive behavior | 7 | None |
| 11 | Content and microcopy | 7 | None |
| 12 | Motion and perceived performance | No numeric score | All three |

### Dissent

Reviewers disagree, and the disagreement stands. No scores are averaged.

| Category | gpt-6.1-sol | gpt-6-astra | gpt-6.1-terra | Basis of the difference |
| --- | --- | --- | --- | --- |
| Visual hierarchy | 9 | 8 | 8 | Sol found no material problem; astra and terra say navigation competes with reading on the smallest viewport |
| Layout and spacing | 8 | 8 | 7 | Terra weighs bars covering content while scrolling more heavily |
| Typography | 9 | 8 | 8 | Astra and terra cite crowded or dense toolbar labels |
| Iconography and imagery | 9 | 8 | 8 | Astra and terra cite the Simple eye icon's unclear result |
| Components and consistency | 9 | 8 | 8 | Astra cites the mobile and desktop label difference and a duplicate Journal entry; terra cites unverified interactive consistency |
| States and feedback | 8 | 8 | Unknown | Terra says the evidence is not enough to score the category |
| Accessibility | 8 | 8 | Unknown | Terra says the evidence is not enough to score the category |
| Responsive and adaptive behavior | 8 | 8 | 7 | Terra weighs persistent controls overlaying the reading area |
| Content and microcopy | 8 | 8 | 7 | Terra weighs the ambiguity of Simple and Log |

Reviewers also differ on priority and remedy:

- Chapter-end continuation is P2 from UX and P3 and conditional from visual. Accessibility raised no finding on it.
- Simple and Log clarity is P2 from UX and accessibility and P3 from visual, whose finding names Simple and the eye icon only.
- For the floating bars, accessibility proposes letting them recede or be hidden. Visual prefers trying a compact, stable bar
  first, because auto-hiding adds motion and complexity.

The R3 Accessibility and States numbers are not an improvement over R2's 6 and 7. Those lows came from gpt-6.1-terra, which
did not score either category in R3, so the R3 lows come from the other two reviewers only.

### Remaining gaps

From the manifest: No completekeyboardtraversal,assistivetech,200%zoom,loading/error/reducedmotion/timing; darkonlymobilereader; wide/full/comparisonnotrerunthiscycle; authenticatedstatesoutsidefocusedflow. E10/E11 same screenshot keyboarddismissedstate. E12 extraendstate; expanded behaviorvspriorrounds not pureimprovement proof.

No screen reader, 200% zoom, full keyboard traversal, error, loading, or motion measurement was taken. Contrast was measured
for primary light body text only.

Layout shift remains unverified. The first-visit tip is now in the page flow, so it pushes the first verse down and
dismissing it removes that space. K3 shows only that `scrollY` stayed 0 on dismissal at the top of the chapter. No layout shift
measurement exists, and the movement of content on dismissal from another scroll position was not observed.

### Automated checks at `240c5d6f`

Run independently by the lead.

| Check | Status | Result |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | |
| `npm run test:browse` | Passed | 36 of 36 tests |
| `npm run test:cfm-reader` | Passed | 34 of 34 tests |
| `npm run build` | Passed | |
| `git diff --check` | Passed | |
| ESLint | Failed | 2 errors and 4 warnings in `src/components/ChapterReader.tsx`, the same baseline counts; `src/components/ChapterReaderChrome.tsx` clean |

Exact ESLint output is `/tmp/verse-round3-eslint.json`, which is not among the preserved copies.

### Runtime check at `240c5d6f`

Run by the lead on the production build at port 3124, with status Passed for the paths below only.

- At 320 wide, `scrollWidth` is 320.
- Search, Log, Simple, and Settings are 44×44 with real accessible names.
- The tip is `position: static`, with its bottom at 220.13 and verse 1's top at 248.13.
- Six Tabs focus Got it with a 2px outline. Enter dismisses the tip and focuses the `h1` Genesis 1, `scrollY` stays 0, and the
  tip is absent after reload.
- At chapter end, verse 31's bottom is 263.94 and the navigation's top is 494.41.

Default, light, dark, mobile, and desktop captures are real production captures with no fake data.

## Final changes

What the three cycles changed at `240c5d6f`, in plain terms:

- **Titles:** the book chapter picker and the reader show a clear title in the page, with one exposed `h1`.
- **Reading width:** the default reader line is measured at 608px on desktop. Explicit wide and full preferences and comparison
  layouts are preserved in the implementation, and were not rerun in R3.
- **Mobile labels:** primary navigation shows persistent labels, and the reader's Log, Simple, and Settings icons show short
  labels inside their 44px targets. Search stays icon-only.
- **First-visit tip:** it now sits in the page between the title and the scripture, so it covers neither the passage nor the
  navigation. Keyboard dismissal moves focus to the chapter title.
- **Chapter picker link:** it shows a chevron on desktop and mobile and no longer claims `aria-current="page"` for a different
  page.

## Final residual findings

Priorities are the reviewers' own. Proposed changes are recorded only: no further implementation is authorized.

**Chapter-end continuation.** UX F1 P2, visual V4 P3 (conditional).

- Finding: E12 shows no visible next-chapter action after Genesis 1's final verse, only blank space and the header picker.
- Impact: continuing means going back to navigation and choosing a chapter. It does not prevent reading Genesis 1.
- Proposed: a restrained Genesis 2 link after the final verse, after confirming no equivalent exists outside the capture.
- Verification: desktop, 390px, and 320px by pointer and keyboard, reaching Genesis 2 at its heading, with first and last chapter
  boundaries checked separately.
- Tradeoff: adds a control to a quiet page and needs boundary handling.

**Log and Simple meaning.** UX F2 P2, accessibility F2 P2, visual V3 P3.

- Finding: accessible names exist, but some visible meaning stays ambiguous. Simple and its eye icon do not say what changes,
  and Log does not say what gets logged. Visual's finding names Simple only.
- Impact: readers may hesitate before using them. No report asserts that the actions fail.
- Proposed: wording based on actual behavior, confirmed before choosing it.
- Verification: first-time readers predict each result; visible name, accessible name, and result then agree at desktop and 320px.
- Tradeoff: longer labels press on a compact toolbar.

**Compact labels at 320px.** Visual V1 P2.

- Finding: Simple and Settings sit close together in the 320px toolbar.
- Impact: usable, with more effort needed to tell the actions apart on the smallest viewport.
- Proposed: more horizontal separation, recovering space without shrinking text or the 44×44 targets.
- Verification: 320px and 390px captures, initial and dismissed, plus target boxes, overflow, and keyboard order.
- Tradeoff: a narrower chapter selector must still fit long book names.

**Floating navigation over reading text.** Visual V2 P2, accessibility F1 P2.

- Finding: fixed bars cover lines of text as they pass behind while scrolling, most of all at 320×568. The final verse is
  reachable above the bar per K3; no report establishes this as permanently hidden content.
- Impact: a shorter reading window and some visual interference, not a blocker.
- Proposed: a compact reader bar or a discoverable way to recede or hide it, keeping navigation recoverable.
- Verification: a full chapter scroll at 320×568 and 390×844 by touch and keyboard, confirming each verse can rest in view and
  focus is never hidden. Only the final verse has been measured.
- Tradeoff: persistent navigation supports orientation, and auto-hiding adds motion and interaction complexity.

**Unverified accessibility and states.** Accessibility F3 P2, a verification gap and not a failure.

- Finding: partial focus and dismissal evidence cannot establish the full keyboard or screen-reader route or error recovery.
- Proposed: a structured keyboard, screen-reader, and 200% zoom pass, plus loading, error, and retry states.
- Verification: record focus order and names from library through reader and back, zoom reflow, and an actual recoverable error.
- Tradeoff: takes test time, and the serif and artwork identity should not change to resolve semantics issues.

## Final tradeoffs accepted

- The in-flow tip pushes the first verse down on a first visit, in exchange for no longer covering text or navigation.
- Selecting text marks the tip as seen but leaves it on screen, and a first visit at a verse link shows no tip.
- Mobile labels make tools clearer and crowd the 320px toolbar.
- Persistent bottom navigation keeps orientation and shortens the reading window.

## Final verdict

**Not met.** Target 9 was not reached at UI revision `240c5d6f`. No blockers are established. Stop reason: the budget is spent,
after three of three implementation cycles. No further implementation is planned without the owner's approval.

| Stage | Status | Notes |
| --- | --- | --- |
| Implementation | Passed | Three cycles, ending at `240c5d6f` |
| Independent review | Passed as a process; gate Not met | Three fresh reports from the frozen revision |
| Automated checks | Mixed | Build, types, and 70 tests Passed; lint Failed at the baseline counts |
| Runtime verification | Passed for tested paths; Not run for the remaining gaps | See Runtime check and Remaining gaps |
| Merge and deployment | Not run | Not part of this review |

## Preserved reports and evidence

Verbatim copies of the reports are in `docs/ui-review/reviews/`, and the manifests are in `docs/ui-review/evidence/`. Rows in
this ledger link to those copies; their earlier `/tmp` locations are gone from the tables, and the contents are unchanged.

- R0 is preserved as its matrix only, in this ledger. No separate R0 report is kept.
- Screenshots stay in `/home/jeffrey-home/.t3/userdata/browser-artifacts/`, and manifests refer to that path. They were not copied.
- ESLint outputs stay in `/tmp` and were not copied.

## Score ledger

Lowest score any reviewer gave in each category. Earlier rounds are not rewritten.

| Round | Revision | Gate | Confirmed blockers |
| --- | --- | --- | --- |
| R0 | `635aa60d` | Not met | None |
| R1 | `e5337a97` | Not met | None |
| R2 | `0225f175` | Not met | None |
| R3 | `240c5d6f` | Not met | None established |

| # | Category | R0 lowest | R1 lowest | R2 lowest | R3 lowest | Comparability of R0 and R1 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Task flow and information architecture | 7 | 8 | 8 | 8 | R1 evidence set is larger than R0, so this is not a pure before and after |
| 2 | Visual hierarchy | 7 | 8 | 8 | 8 | R1 evidence set is larger than R0, so this is not a pure before and after |
| 3 | Layout and spacing | 7 | 7 | 7 | 7 | R1 evidence set is larger than R0, so this is not a pure before and after |
| 4 | Typography | 7 | 8 | 8 | 8 | R1 evidence set is larger than R0, so this is not a pure before and after |
| 5 | Iconography and imagery | 7 | 7 | 7 | 8 | R1 evidence set is larger than R0, so this is not a pure before and after |
| 6 | Color and contrast | 7 (low confidence) | 8 | 8 | 8 | R1 evidence set is larger than R0, so this is not a pure before and after |
| 7 | Components and consistency | 7 | 7 | 8 | 8 | R1 evidence set is larger than R0, so this is not a pure before and after |
| 8 | States and feedback | Unknown | 6 | 7 | 8, plus Unknown from gpt-6.1-terra | New numeric score from evidence expansion, not a proven improvement |
| 9 | Accessibility | Unknown | 6 | 6 | 8, plus Unknown from gpt-6.1-terra | New numeric score from evidence expansion, not a proven improvement |
| 10 | Responsive and adaptive behavior | Unknown | 7 | 7 | 7 | New numeric score from evidence expansion, not a proven improvement |
| 11 | Content and microcopy | 7 | 7 | 8 | 7 | R1 evidence set is larger than R0, so this is not a pure before and after |
| 12 | Motion and perceived performance | Unknown | Unknown | Unknown | Unknown | Unknown in both |

R2 rests on more evidence than R1 (E9 to E11 and K2), so R1 and R2 are also not a pure before and after. R3 rests on
more evidence than R2 (E12 and K3), so the same holds for R2 and R3. The scope stayed the same throughout; the evidence
expanded. Unknowns stay Unknown, and an Unknown beside a number is not an improvement.

Final row: R3 at `240c5d6f`. Gate Not met for target 9, no established blockers, stopped because the budget of three
cycles is spent.
