# Verse marking QA

Run `npx vite --config vite.qa.annotations.config.mjs` and open
`http://127.0.0.1:4191/qa/annotations/index.html`.

This isolated harness renders the production `VerseAnnotationEditor`, `VerseMarkedText`, and global
marking CSS against synthetic Ruth 1:7 text and nested word/footnote markup. Only its Vite configuration
aliases `convex/react` to in-memory mutations. Saves reset on reload and never reach a deployed backend.
The production readers' query and routing integration is outside this fixture.

Verified October 25, 2026, in the local working tree based on `df90f53`:

- **Passed** — `npm run test:cfm`: 122 tests; `npx vitest run tests/verseMarkedText.test.ts
  tests/verseAnnotations.test.ts tests/journal.test.ts`: 21 tests. These include underline-only saves,
  independent mark updates, deletion, legacy rows and clients, privacy, and journal compatibility.
- **Passed** — application and Convex TypeScript checks, targeted lint on the annotation helpers/editor,
  shared wrapper, CFM annotation hook, new tests and this harness; `git diff --check`.
- **Failed** — lint in `ChapterReader.tsx` and `convex/annotations.ts` reports existing errors on unchanged
  hooks, `any`, and `@ts-nocheck` lines. Those unrelated errors were left unchanged.
- **Passed** — collaborative-browser component checks at 1280×800, 390×844, and 320×568: yellow highlight follows
  each wrapped line, highlight plus underline saves and reopens with the checkbox selected, and
  underline-only saves draw an underline over a transparent background. No empty highlight card appears.
- **Passed** — light and dark marking appearance, blue highlight plus underline with a note, and no
  horizontal overflow in the phone layout or annotation dialog. Toggling underline off retains the
  highlight and note. Deleting the annotation removes its marks and note while retaining verse text.
- **Passed** — selecting marked text retains its words, and the nested synthetic footnote button works.
- **Passed** — creating a new highlight plus underline at 320×568; empty annotations cannot be saved,
  and simple-mode CSS retains inline, visible marks without horizontal overflow.
- **Passed** — production build with temporary synthetic configuration:
  `NEXT_PUBLIC_CONVEX_URL=https://qa-placeholder.convex.cloud npm run build` completes compilation,
  TypeScript, and all 82 prerendered pages. This does not verify the placeholder service or authentication;
  the build warns that `CONVEX_SITE_URL` is missing. No environment file was written.
- **Blocked** — plain `npm run build` prerendering without a public Convex URL: this unconfigured checkout
  has no Convex auth provider. Compilation and TypeScript passed before that configuration failure.
- **Not run** — authenticated browser-to-deployed-Convex saves, real mobile devices, or deployment.
  In-memory Convex tests cover persistence, legacy rows, updates, deletion, and owner privacy separately.
  Full reader routing/comparison integration, forced-colors rendering and share-page hiding were reviewed
  in source but not exercised in this browser fixture.

## Full-app quick marks and account settings

Verified October 25, 2026 (America/Denver), worktree based on `df90f53` plus the uncommitted
highlight/underline, quick-menu and account-settings changes. These checks use the actual Next.js app
at `http://localhost:3191`, backed by an isolated local Convex deployment at `127.0.0.1:3231` (auth site
`:3232`), with a local Preview Reader account. They do not use the component fixture or mocked mutations.
Shared development and production were not changed.

- **Passed** — saved yellow highlight plus underline on Ruth 1:7 through the full annotation editor;
  both remained after a reload. Desktop light and phone dark screenshots were captured.
- **Passed** — selected Jeremiah 1:8 and applied a highlight and underline directly from the new top row,
  without a dialog. The text selection and menu remained open; the footer reads `Jeremiah 1:8`, and
  `Annotate` remains available for the complete editor.
- **Passed** — hid Blue and Purple in Account settings; an already-open reader immediately hid them,
  and the choices survived reloading Account settings. With every quick button hidden, the toolbar
  collapsed and `Annotate` still opened the full editor, including all color choices.
- **Passed** — saved a note through that editor, restored the quick buttons, selected Jeremiah 1:7–8,
  then applied green and underline to both. The footer displayed the range, the note stayed intact,
  and both marks and the note survived a full reload.
- **Passed** — desktop and 390×844 phone layouts in the real app: the menu and account settings have
  no horizontal overflow. Account toggles are 44px tall. ArrowRight moves Green → Pink and Home moves
  to Yellow, while preserving the text selection.
- **Passed** — `npm run build` against the isolated local backend: compilation, TypeScript and all 82
  prerendered pages complete. The app is served with `next start` for a stable preview after the dev
  session stalled during hot reload.
- **Passed** — implementation check: 192 Vitest tests and 127 CFM/helper tests, app and Convex
  TypeScript checks. After review fixes, reran the 15 affected backend/rendering/preferences tests,
  11 annotation helper tests, targeted toolbar/settings lint, and `git diff --check`.
- **Failed** — existing lint errors and warnings remain in unchanged portions of ChapterReader,
  annotations, preferences and appData. The new annotation/preference/account files and toolbar pass
  targeted lint.
- **Not run** — real iOS/Android touch interactions, cloud auth/deployment, or UI failure injection.
  The local backend contains no generated chapter insight cache, so unrelated insight requests return
  503; annotation and preference saves were verified successfully through the live local backend.

Review repairs keep `Annotate` disabled while quick marks are saving (an optimistic annotation can have
a temporary id) and serialize account-button changes until each save completes. Account settings do not
overwrite font/layout preferences, and quick marks do not overwrite note text.

## Colored style presets

The later colored-preset update replaces the earlier show/hide controls with an ordered list of
`highlight` or `underline` plus color. Red, yellow, blue, green, pink and purple work independently for
each style. Account settings can add, edit, reorder and remove up to 12 distinct pairs. Existing
uncolored underlines read as red, and the earlier button choices carry over into presets.

Verified October 25, 2026 (America/Denver), same worktree base `df90f53` plus uncommitted changes:

- **Passed** — implementation's full Vitest run: 204 tests; CFM/helper suite: 128 tests; application
  and Convex typechecks. Regression cases include independent colored marks, mixed selections, old
  callers/rows, preset migration/order/empty lists/limits, and preserving notes and reader settings.
- **Passed** — review rerun: 27 affected annotation, rendering, preset-preference and local-preference
  tests. Targeted lint passes for the editor, preset settings, shared samples, toolbar, validators and
  component harness; `git diff --check` passes.
- **Passed** — pushed schema/functions and generated API metadata only to the isolated local backend
  at `127.0.0.1:3231`; its typecheck completed. No cloud deployment was changed.
- **Passed** — `npm run build`: compilation, TypeScript and all 82 prerendered pages. The local full-app
  server was restarted with this build.
- **Not run** — browser interaction or visual QA for this colored-preset update. The screenshots and
  live UI checks above describe the preceding generic-underline/show-hide version.

Review also made the preset save queue ignore superseded errors and cancel queued saves after
account settings unmounts. The component-only harness now passes underline colors through its synthetic
save function; it remains separate from the actual app and is not used as the live preview.

### Subsequent full-app colored-preset demonstration

On the user's request to show the update, verified the current production-mode Next.js app and live
isolated Convex backend through the real UI (same `df90f53`-based working tree):

- **Passed** — removed three default presets, added Green underline, and moved Red underline to the top.
  Reloaded Account settings and read back the saved order: Red underline, Yellow highlight,
  Blue highlight, Green underline. No account-page errors or horizontal overflow were observed.
- **Passed** — applied Blue highlight plus Green underline to Jeremiah 1:7, then Yellow highlight plus
  Red underline to 1:8, directly from the selection menu. The underline colors computed as green
  `rgb(95, 208, 156)` and red `rgb(227, 144, 122)` in dark mode, independently of the highlight colors.
- **Passed** — both color combinations survived reloading the chapter; the existing note on 1:8 was kept.
  The selection bar showed exactly the four saved presets in order, kept Annotate, and displayed
  `Jeremiah 1:8` in its footer. Captured screenshots of the actual settings, passage, and selection menu.
- **Not run** — real mobile devices or cloud deployment for this update.

## Optional names and visual annotation pickers

Verified October 25, 2026, at base `df90f53` plus the uncommitted working tree:

- **Passed** — implementation suite: 218 Vitest tests and 132 CFM/helper tests; application and
  Convex typechecks. Names normalize, persist, rename and clear; defaults and migrated presets stay
  unnamed. Mark identity remains style plus color, independent of its optional name.
- **Passed** — independent review rerun:
  `npx vitest run tests/markPickers.test.ts tests/quickMarkPreferences.test.ts tests/readerMarkPresets.test.ts tests/verseAnnotations.test.ts tests/verseMarkedText.test.ts`
  (41 tests). These include backend/local persistence and server-rendered picker markup. They do not
  exercise browser click, focus, selection or keyboard behavior.
- **Passed** — targeted ESLint on the visual picker, account preset settings, selection bar, annotation
  helpers, pure backend rules, validators and picker tests; `git diff --check`.
- **Passed** — schema/functions pushed only to the existing isolated local Convex backend at port
  3231, including its typecheck; no cloud deployment changed.
- **Passed** — `npm run build`: compilation, application TypeScript and all 82 generated pages.
  Restarted the existing local Next.js app on port 3191 with this production build.
- **Not run** — browser interaction/visual checks for optional-name fields, visual radio pickers,
  inline Annotate panel, focus return, text-selection preservation or short/narrow viewport scrolling.
  Prior screenshots depict the preceding version. No Vercel preview was deployed for this update.

Account settings now use visual style/color radio groups and optional name fields. Header presets have
a 4px gap and show compact labels only when named. Annotate opens an inline panel with saved presets,
custom style/color selection and an explicit note-editor action. The note editor still waits for
pending quick-mark saves, to avoid editing an optimistic annotation without a real server id.

### Full-app demonstration and icon-only header refinement

Verified October 26, 2026, same `df90f53`-based uncommitted working tree, production Next.js app on
port 3191 and the persisted isolated local Convex backend on port 3231:

- **Passed** — named Red underline “Commandments” and Yellow highlight “Blessings” through Account
  settings; left the other two presets unnamed. Reloaded the account page and read back the saved
  names. Changed a swatch to Pink and used Home to return to Red. No dropdowns or page overflow.
- **Passed** — after the user's refinement, the top selection bar shows only the four mark samples,
  each 36px wide with a 4px gap. Names remain in accessible labels/tooltips and inside Annotate.
- **Passed** — Annotate opens its dedicated inline panel, focuses Back and keeps the live scripture
  selection. Custom Purple underline applied to Jeremiah 1:8 without changing Yellow highlight or
  the existing note. The named Commandments preset restored Red underline successfully.
- **Passed** — Escape returns to the action grid, focuses Annotate and preserves both selection and
  the open menu. The footer remains `Jeremiah 1:8`. Captured real screenshots of settings, icon-only
  selection actions and expanded Annotate.
- **Passed** — refinement's 25 affected tests and targeted toolbar/test lint; review `git diff --check`;
  production rebuild including TypeScript and all 82 generated pages.
- **Not run** — real touch devices, narrow/short-screen panel scrolling, failure injection, or Vercel
  deployment. These screenshots demonstrate the real local app and live local saves.

The header no longer displays names visually, superseding the named-header description above.

## Integration for development rollout

Merged current dev `1e1c10ef1a5ed165db0a9d4d2e39628b3b45270d` into feature commit
`81d1f7ed5d7f8fe82f63fe4b6904dd69b589fdac` on October 26, 2026. Resolutions preserve the newer Resources
panel and guest device-study behavior. Guest quick marks now persist on the device; sign-in imports
retain colored underlines and let existing account marks take precedence. Account presets remain private.

- **Passed** — integration implementation: full Vitest, 30 files / 253 tests; CFM/helpers, 139 tests;
  application and Convex TypeScript checks. Targeted lint adds no findings beyond existing exceptions.
- **Passed** — independent integration rerun, 49 tests across `deviceStudy`, `verseAnnotations`,
  `markPickers`, `quickMarkPreferences`, and `readerMarkPresets`.
- **Passed** — production `npm run build`: compilation, TypeScript, and 83 generated pages, including
  dev's newer Resources endpoint. Staged and unstaged whitespace checks pass.
- **Not run** — browser interaction after guest-study integration or a live guest sign-in import.
  Earlier screenshots demonstrate the pre-integration account path.
- **Blocked (existing configuration)** — dev's prior Vercel build at `1e1c10e` failed because
  `CONVEX_AUTOMATIC_DEPLOYMENT=dev:fabulous-dogfish-606` was not configured. A metadata-only read
  showed no dev-branch activation marker or deploy key. No provider settings or secrets were changed.

## Come, Follow Me selection menus and shared scripture annotations

Verified on 2026-10-26 in the local working tree based on `dd17dc6`. Both Come, Follow Me panes now use
the production `VerseActionBar`. Guide marks and notes belong to an anchored span of guide prose; scripture
annotations use the same canonical verse identity, guest store, account query, and editor as the chapter reader.

- **Passed** — `npm run test:cfm`: 147 tests, including legacy guide highlight compatibility, span recovery,
  overlapping passages, and independent mark changes.
- **Passed** — `npx vitest run --maxWorkers=2`: 33 files / 269 tests. New guide persistence tests cover
  ownership, validation, old rows, note-only spans, independent marks, deletion, and idempotent guest imports.
  New scripture sync tests cover both directions for guest and account rows, including canonical `dnc` identities.
- **Passed** — `npx tsc --noEmit` and `npx tsc --noEmit -p convex/tsconfig.json`.
- **Passed** — `npm run build`: optimized production compilation, TypeScript, and static page generation.
- **Passed** — targeted ESLint on the new/changed guide UI, shared selector, shared hooks, device store,
  import provider, annotation helpers/editor, schema, rules, and regression tests; `git diff --check`.
- **Failed (existing findings)** — `convex/annotations.ts` retains its four baseline lint errors
  (`@ts-nocheck` and three `any` usages). `ChapterReader.tsx` retains the previously documented hook lint errors.
  The initial unrestricted Vitest run timed out on 46 tests during parallel cold imports; the complete rerun
  with two workers passed without increasing test timeouts.
- **Passed** — real app in headless Chrome at `http://localhost:3107`, week `2026-09-28`: 20 desktop/phone
  checks plus four guide-section/drag checks. Guide presets, custom red highlights, visibly painted colored
  underlines, notes, reload persistence, exact saved-passage targeting, Escape/Back, touch, and dismissal work.
  Introduction and closing prose also save marks; note-only passages have a dotted underline.
- **Passed** — two live tabs in one guest browser context: create a scripture highlight, underline, and note
  in Come, Follow Me; read/edit them in the chapter reader; observe the changes in the open Come, Follow Me
  tab and after reload; delete in the reader and observe removal in Come, Follow Me. The note editor reopens
  the same note in either view, and opens empty after deletion.
- **Not run** — signed-in browser interactions, a live sign-in import, or deployment of the backend schema
  and mutations. Account persistence/import behavior is covered with the in-memory Convex backend.

Runtime scripts, result logs, and actual application screenshots are in `/tmp/cfm-guide-verify/`. The task's
browser contexts and local dev server were stopped after verification. No production data was changed.
