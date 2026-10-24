# Browse refresh verification

Branch: `t3/browse-card-search-refresh`, based on `origin/dev` at
`ad0eae82bd2adff36dbb30b48c8870998efcc97e`. Implementation: Claude Opus 5.5;
independent code review and browser verification: Codex 6.1 Sol.

The flow under review is Library → inline reference/phrase search or a whole-card link → the
existing reader, search results, current weekly lesson, Notes, or volume page. No Notes/backend
redesign is included.

## Environment

- Node 24.21.0, Linux, local Next.js production build (`npm run build`, `npm run start -- --port 3001`).
- Existing development Clerk configuration and `fabulous-dogfish-606` Convex backend. Browser
  contexts were signed out. No account records were created or changed.
- Chrome 155 through an external Playwright harness. T3's preview could not start because the
  host's AppArmor blocks its browser sandbox; no host security settings were changed.

## Checks

- **Passed:** focused ESLint on the six changed TSX files; `npx tsc --noEmit`.
- **Passed:** `npm run test:cfm` (110 tests), `npm run cfm:check` (four guides), and
  `npm run test:notes` (24 tests).
- **Passed:** production build, including all 78 static pages.
- **Passed:** one inline search input, no duplicate quick-nav button on the Library; the other
  selection pages retain quick navigation.
- **Passed:** `Alma 32` + Enter opens the actual chapter reader; `faith` + Enter opens `/search?q=faith`
  and renders verse-text matches from the bundled library.
- **Passed:** whole Come Follow Me card opens `/come-follow-me/2026-10-19` and the Jeremiah lesson.
  It has one link and no nested buttons or chapter links. Notes and scripture-volume cards open
  their existing routes.
- **Passed:** phone touch selection of `John 3:16` opens the actual reader at `#v-16`.
- **Passed:** light/dark layouts at 320, 390, 768, and 1440 px: no page/card horizontal overflow,
  no rotated cards, consistent grid styling. Screenshots were visually inspected; the portrait
  stays on the right and fades left without obscuring the reading label.
- **Passed:** simple mode retains the five scripture-volume cards and hides the study cards/search.
- **Passed:** a simulated October 28 date opens that week's assigned-reading page when no guide
  is published; a date outside the available schedule opens the guide index.
- **Passed after repair:** the first Escape closes suggestions without clearing the query, and
  Arrow Down reopens them. The final production build passes; the production browser retest also
  passes phone touch, simple mode, and both date-boundary cases with no client errors.

## Limits

- **Not run:** authenticated Continue Reading persistence. Its existing query and chapter-link
  calculation are unchanged; code review verified its position between Come Follow Me and Notes.
  Signed-out checks confirmed it leaves no empty grid item.
- **Not run:** physical-phone or non-Chromium browser testing; deployment/remote CI.
- An existing AccountControl hydration warning appeared on the dev server before the Browse edits.
  The production phone-touch/date-boundary checks reported no client errors.

Art source and public-domain evidence are recorded in [browse-art-provenance.md](browse-art-provenance.md).
