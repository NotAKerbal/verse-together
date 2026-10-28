# Native ↔ website parity inventory

Status of each website feature in the native Rust app (`native/`), with the web source it follows, where the
native implementation lives, how it is tested, and what remains. "Done" means implemented for real against local
data or the website's live public endpoints (and, where stated, the account); nothing listed as done is a
placeholder. **Full parity is not yet achieved**: see the Partial, Not ported and Blocked rows.

Legend: **Done** · **Partial** (named gaps) · **Not ported** · **Blocked** (needs a step outside this branch)

## Reader

| Web feature (source) | Native | Tests | Gaps |
| --- | --- | --- | --- |
| Header, breadcrumbs, pickers, search, simple mode, reader settings (`Navbar`, `ReaderHeaderSlot`, `ReaderSettings`) | **Done** (accepted earlier; geometry and motion unchanged) | `ui_tests.rs`, `main.rs` interaction tests | — |
| Mark palette, custom colors, highlight/underline, exact word ranges in UTF-16, quick-mark presets (`annotationRules.ts`, `MarkStylePicker`, `QuickMarkSettings`) | **Done** `marks.rs`, `mark_layer.rs`, `view_marks.rs` | `marks::tests`, reader tests | Hex entry instead of a color wheel; preset order by up-arrow moves |
| Verse notes, copy passage/words, add to note, chapter read + log | **Done** | store, interaction tests | Server collapses note whitespace (as on the website) |
| AI chapter study paths: verse markers and the Study paths panel (`/api/insights/chapter`, `VerseStudyPaths`) | **Done** `reader_tools.rs`, `reader_tools_ui.rs` — live endpoint, cached server-side; a chapter whose paths can't load shows none, as on the website | `payloads_from_the_website_parse`; real desktop check (1 Nephi 1, John 3) | Generation for uncached chapters needs the website's sign-in, as on the website |
| Explore a word (`WordStudyPanel`): scripture study helps (`studyHelps.ts` matching on the embedded index; entries from `/api/tools/study-helps`), Strong's Hebrew/Greek (`/api/tools/lexicon`), English dictionaries and word history (`/api/tools/dictionary`), loading/error/retry, "Nothing found" | **Done** | `study_helps_match_like_the_website`, payload tests; real desktop check ("hand", Mark 9) | Bible interlinear link and the "no matches" source list not shown |
| Resources for selected verses (`VerseResourcesPanel`, `/api/resources`), lesson text, cited sources, web search link | **Done** (lesson HTML rendered as Markdown) | `lesson_html_becomes_markdown` | Cited scripture opens in the reader, not the website's preview dialog |
| Your Bibles: other translations beside the KJV, changed words marked, Add a Bible catalog with search, save/remove/show (`BibleTranslationToolbar`, `useComparisonChapters`, HelloAO via `/api/helloao/translations` and `/api/scriptures/chapter`) | **Done** for OT/NT, in Reader settings as on the website | `comparisons_mark_only_the_changed_words`, `your_bibles_opens_its_catalog_from_reader_settings`; real desktop check (BSB, John 3, Mark 9) | Language chooser view is a search box; catalog shows English by default |
| Joseph Smith Translation (`/api/scriptures/jst`, `JstExcerptCard`, `JstVerseText`) | **Partial**: switch in Reader settings; every excerpt is shown as its card at its KJV verse | real desktop check (Mark 9:40–48) | The website also reads some passages *in place* with JST wording underlined (`readJstChapter`); not ported |
| Footnotes and citations (`FootnoteModal`, `CitationsModal`, `CitationsSidebarPanel`) | Not applicable | — | These components are not mounted anywhere in the current website's reader (citations only feed the admin resource manager); nothing to match |
| Share passage ("Focus scripture", `/share/...`, `passageShare.ts`) | **Partial**: "Copy share link" copies the website's share URL (the website's desktop fallback) | `share_links_match_the_websites_share_pages` | The share page itself (focused reading view and share image) is web-only |
| Bookmarks | Native-only feature; local, never synced (the website has none) | existing | — |

## Journal (`/notes`)

| Web feature | Native | Tests | Gaps |
| --- | --- | --- | --- |
| Calendar, weekly goals, invitation with art, day entries, revisit, opening animation (`JournalWorkspace`, `JournalHome*`) | **Done** `journal_ui.rs` (art now has the website's rounded corners) | journal tests, snapshots | — |
| Markdown note editor: title, body, preview, source, log reading, delete, save on leave/close/Ctrl+S | **Done** (`text_editor` + Markdown preview) | store, sync tests | Not the website's rich CodeMirror editor |
| Back closes an open note to its day (`journalHistory.ts`, browser history) | **Done**: Escape / Alt+Left | — | — |
| An open editor never saves over an edit a sync brought in; both are kept | **Done** (native safety, matching the website's revision checks) | `an_open_editor_never_saves_over_an_edit_that_arrived_meanwhile` | — |
| Note folders (`convex/noteFolders.ts`) | Not applicable | — | Backend only: no current website screen shows folders, so none is offered |
| Copying this computer's study into the account (`DeviceSyncStatus`, `importDeviceNote`, `upsertVerseAnnotation`/`saveGuideHighlight` device imports) | **Done** as an explicit choice in Settings → Sync (the website does it automatically on sign-in) | `copying_this_computers_study_uses_the_accounts_idempotent_imports`; Convex replay test | Blocked on deployment like all account features |

## Come, Follow Me

| Web feature | Native | Tests | Gaps |
| --- | --- | --- | --- |
| Schedule, published guides (incl. upstream October 26), overview cards with real covers (now with rounded corners), lesson page, Contents, Log | **Done** | lessons tests, snapshots | — |
| Scripture companion dock with marks | **Done** | `guide_sections_find_their_passages` | Dock does not follow the guide's scroll position automatically |
| Highlights, underlines and notes on guide prose (`useGuideHighlights`, `guideAnchors.ts`) | **Done** `rich_select.rs` (selectable rich text keeping bold/italics/links), `guide_text.rs` (web anchor describe/resolve in UTF-16 with quote + 32-unit context), `guide_marks.rs`; stored per owner, synced with `annotations:setGuideAnnotation`/`getGuideHighlights` | `spans_are_anchored_and_found_again_like_the_website`, `guide_marks_are_kept_per_owner…`, Convex test; real desktop check (green mark on "lovingkindne…" persisted with its anchor) | A selection stays within one paragraph; native block offsets follow the guide's Markdown, so a span made on one side is found on the other by its quote and context rather than its offsets |
| Plans link ("Your study plans") | **Done** | — | — |

## Plans (`/plans`)

| Web feature | Native | Tests | Gaps |
| --- | --- | --- | --- |
| Signed-out card, my plans with progress, today's chapters, day-by-day schedule with reading days, open chapter, mark read, delete (`PlansWorkspace`, `PlanDetail`, `planSchedule.ts`, `readingPlans:*`) | **Done** `plans.rs`; marking read goes through this computer's study and syncs | `schedules_follow_the_websites_plan_days`; Convex plan test | Blocked on deployment (account) |
| Quick starts: Book of Mormon in 30 days; a book a chapter a day | **Done** | Convex plan test | — |
| Custom plan builder and editing (`PlanBuilder`, 950 lines: selections, pace, reading days) | **Not ported** | — | — |
| Active plan card on other pages, continue reading card | **Not ported** | — | — |

## Account and sync

| Web feature | Native | Tests | Gaps |
| --- | --- | --- | --- |
| `/sign-in` card (448px, serif heading, Continue with Google, creation note) and `/account` Settings (`SignInForm`, `AccountManager`) | **Done** `account_ui.rs`: profile name edit, sign-in methods, sessions + sign out other devices, sign out, simple mode, appearance, quick marks | `the_gear_leads_to_settings_and_sign_in_like_the_website` (card at x416 y120 w448) ; Better Auth HTTP test of list/update/revoke with the app's bearer token | Avatar images from Google not shown (initials, the website's fallback) |
| Browser-approved native sign-in (`convex/nativeAuth.ts`, `/native/authorize`) | **Implemented, Blocked on deployment** | `cloud::tests` (loopback round trip, decline, cancel + revoke); `tests/convex/nativeAuthHttp.test.ts`: single use, wrong verifier, expired grant, foreign Origin refused, concurrent exchange → exactly one session, account changed since the page loaded → 409, signed-out page → 401 | Not verified against live Google |
| Session storage | **Done**: OS keyring, one entry per website + Convex deployment + study profile; keyring work off the UI thread; `--no-account` | `sessions_are_bound_to_their_deployment_and_profile` | — |
| Account lifecycle | **Done**: generation-bound results, sign-in/out/purge serialized by an account lock, drafts saved under their own owner before any switch, late or cancelled sessions revoked | `account::tests` (8) | — |
| Sync: verse marks/notes (field-level, atomic `nativeSync:applyVerse`), journal notes (idempotent `createJournalEntry` + revision-checked atomic `nativeSync:saveJournalNote`, coded deletes), readings (idempotent logs, `nativeSync:removeReading`), read chapters (canonical volume keys), guide marks, goals; local revisions acknowledge exact versions; retries with backoff; refresh every minute; backlogs drain | **Implemented, Blocked on deployment** | `sync::tests` (16, incl. lost replies, in-flight edits, conflicts kept once, cancellation, backlog), store regression `review_sync_ack_does_not_discard_a_second_edit_within_one_second`; `tests/convex/nativeSync.test.ts` (12) against the real functions | Needs `convex/nativeSync.ts` and the `createJournalEntry` revision change deployed |

## Not ported elsewhere

Social feed and podcasts (`/feed`, `CuratedFeed`), friends/sharing of notes (`social.ts`, `insights/shared`),
publishing notes, the search page's extra scopes, talks (`/talk`), help articles, the resources manager and admin
pages.
