Reviewer: Codex (model not exposed to reviewer) / accessibility and resilience
Revision reviewed: 240c5d6f, production build on localhost:3124
Evidence opened: E1–E12, P1–P2, K3; could not open: none. E10 and E11 identify the same image, as disclosed in the bundle. K3 is attributed lead-tool observation, not a test independently performed by this reviewer.

| Category | Score | Confidence | Evidence | Gap |
| --- | --- | --- | --- | --- |
| Task flow and information architecture | 8 | Medium | E1–E7, E12, K3 | The library, book list, chapter grid and reader show a legible route, but full navigation and return paths were not independently exercised; the meaning of Simple is unclear. |
| Visual hierarchy | 8 | Medium | E1–E9 | Titles and scripture lead the scan; the persistent navigation competes with reading on the smallest viewport. Non-default controls and states are not fully shown. |
| Layout and spacing | 7 | Medium | E2–E9, E12 | Generous reading spacing is consistent, but floating bars cover content while scrolling and cost a significant portion of the 320px viewport. The end verse is reachable above the bottom bar per K3; intermediate scrolling remains affected. |
| Typography | 8 | Medium | E3–E9 | The warm serif and comfortable reader line spacing fit the purpose. Small uppercase metadata and dense reader toolbar labels are less comfortable; zoom and alternate text settings were not examined. |
| Iconography and imagery | 8 | Medium | E1–E8 | Book imagery supports recognition and controls mostly have labels; Simple's eye icon and label do not clearly communicate the result. Other icon states are not examined. |
| Color and contrast | 8 | Medium | E5, E7–E9, K3 | Primary body text is visually distinct in light and dark reader views; K3 supplies light body colors only. Other text, control boundaries, focus, imagery and dark theme contrast were not measured. No conformance claim or numerical cap is made. |
| Components and consistency | 8 | Medium | E2–E9 | Book cards, chapter buttons and floating navigation use a coherent visual language across shown sizes. Full interactive and state consistency is unverified. |
| States and feedback | unknown | Low | E7, E10–E11, K3 | Tip dismissal, focus transfer and persistence are observed; loading, errors, success and other controls' feedback are not represented enough to score the category. |
| Accessibility | unknown | Low | E9–E11, K3 | K3 reports named 44px reader controls and visible focus after dismissal, but no complete keyboard traversal, screen-reader test, 200% zoom or reduced-motion check. Picker has no aria-current, but the picker is not shown as having a current chapter, so this alone is not a defect. |
| Responsive and adaptive behavior | 7 | Medium | E2–E9, E12, K3 | Reader has no horizontal overflow at 320px per K3 and the last verse can clear the bottom bar. Persistent controls overlay the reading area at small sizes; other 320px screens, zoom, translation and touch operation remain unverified. |
| Content and microcopy | 7 | Medium | E2–E7 | Book and chapter names and the tip are clear; Simple does not describe the resulting mode, and the action labeled Log is ambiguous without context. Error and empty copy are unobserved. |
| Motion and perceived performance | unknown | Low | K3 | No measured response times, loading transitions, layout shift or reduced-motion behavior. |

Blockers: None established by this evidence. The bars cover text temporarily in E9 and E12, but K3 confirms the final verse can be scrolled above the bottom bar; this does not establish permanently hidden essential content. Keyboard and assistive-technology reachability remain unverified rather than passed.

F1, P2 — Layout and spacing; responsive and adaptive behavior
Location: 320×568 reader while scrolling.
Evidence: E9, E12, K3.
User impact: The fixed top and bottom bars obscure parts of the passage as it passes behind them and reduce the unobstructed reading window, particularly on short screens. The last verse itself can be brought clear, as measured in K3.
Proposed change: Consider allowing the bars to recede during reading or giving readers a deliberate, discoverable way to hide them, while retaining easy access to navigation and preserving the warm reading surface.
Verification: At 320×568 and 390×844, scroll the whole chapter in both directions with touch and keyboard; confirm each verse can rest fully in view, navigation remains discoverable and focus is never hidden. Recheck the final verse and orientation changes.
Tradeoffs: A disappearing bar can make navigation harder to discover or induce motion; provide a stable accessible alternative and respect reduced motion. Raised by / dissent: accessibility reviewer; no other reviewer input available.

F2, P2 — Content and microcopy; iconography
Location: reader toolbar, desktop and mobile.
Evidence: E5, E7–E9; K3 confirms accessible names exist for the controls.
User impact: “Simple” and an eye icon do not explain what will change; “Log” also has multiple plausible meanings. Readers may hesitate before using them. This is a clarity observation, not an assertion that the actions fail.
Proposed change: Use labels or a concise explanatory affordance that describes each actual outcome, informed by the existing behavior; preserve short mobile labels where space requires it.
Verification: Ask representative users to predict each action before activation, then verify the visible and accessible names match the actual outcome at desktop and 320px widths.
Tradeoffs: Longer labels consume scarce toolbar space; a well-named control with contextual explanation may fit better than a longer permanent label. Raised by / dissent: accessibility reviewer; no other reviewer input available.

F3, P2 — Accessibility; states and feedback (verification gap)
Location: full library → Old Testament → Genesis → chapter 1 flow.
Evidence: K3, E9–E11.
User impact: The partial focus and dismissal evidence is encouraging, but it cannot establish that keyboard and screen-reader users can complete the route or recover from unavailable content. No failure is inferred.
Proposed change: Complete a structured keyboard, screen-reader and 200% zoom pass, and exercise loading/error/retry states; repair only evidenced issues.
Verification: Record focus order and visible focus from the library through the reader and back, names and roles for each action, zoom reflow, and an actual recoverable error. Confirm the tip remains dismissed without disorienting focus.
Tradeoffs: Test setup and potential fixes take time; avoid changing the serif/artwork identity to resolve issues that require only semantics, spacing or focus adjustments. Raised by / dissent: accessibility reviewer; no other reviewer input available.

Peer observations (accessed 2026-11-05 UTC; screenshots only, interactions and other states not independently verified):
- P1, https://www.bible.com/bible/1/GEN.1.KJV: The Genesis reader uses a centered, constrained text column and chapter context at the top. That technique supports reading focus and is already partly present in E5. Taste: the dense continuous paragraphs are less suited to Verse Together's clearly separated verses; do not transfer the peer's visual identity wholesale. Cookie notice obscures part of P1, limiting comparison.
- P2, https://www.churchofjesuschrist.org/study/scriptures/ot?lang=eng: A persistent contents hierarchy identifies the Old Testament and shows Genesis in a book list. This makes location explicit and could inform accessible navigation labels, but its dense desktop sidebar should not be copied into the narrow reader. The image shows a contents page, not the full chapter-selection or reader flow.

Additional gaps: dark mode is shown only for the mobile reader; full-width and comparison states were not rerun in this cycle; authenticated states are outside this scope. The bundle supplies no timing, full keyboard, assistive-technology, zoom, loading, error or reduced-motion evidence. No assumption about WCAG target, compliance or timings is made.
