# Authenticated development QA — October 23, 2026

Implementation tested: `5eb9503e751302647a93bf0fdf24b197869519f0`, branch `feat/notes-journal-and-reading-log`.

Preview: https://scriptures-sharing-arkqhopme-notakerbals-projects.vercel.app/notes

Backend: existing `dev:fabulous-dogfish-606`, https://fabulous-dogfish-606.convex.cloud. Vercel development/preview configuration was checked against this URL before writes. Production `lovable-seal-140`, live site, master, credentials and security/access settings were left unchanged.

## Real authenticated browser results

The owner approved using the existing Google account and creating/editing development test notes. Normal Google/Clerk sign-in succeeded without creating credentials or expanding access. These checks used the actual deployed app and authenticated Convex persistence, not the fixture harness or a fabricated identity.

| Check | Result |
| --- | --- |
| Signed-in Notes load | Pass; actual calendar and editor render, no client exception. |
| Personal note create/save | Pass; UI reports Saved and real reload retains title/body. |
| Edit after reload | Pass; revision two saves and survives another reload. |
| Live Markdown headings | Pass; active heading shows its marker, inactive headings hide markers; inline `#faith` remains visible. |
| Existing Browse path | Pass; Library → Book of Mormon → 1 Nephi → chapter 1. |
| Desktop sidebar note/source | Pass; new test note recorded from 1 Nephi 1, attributed to the signed-in author and actual chapter link. |
| Sidebar expansion/calendar | Pass; current note opens in full Notes, empty-day selection hides unrelated note, Today restores the day's list. |
| Scripture reading history | Pass; log one verse, reload Notes, open `1 Nephi 1:1` → actual reader `#v-1`. Chapter-completion checkbox stays unchecked. |
| CFM index/guide | Pass; index lists all four real available guides; current Jeremiah guide opens. Existing plans remain reachable. |
| CFM history/day selection | Pass; guide log saved today and on October 22; historical log survives reload, selected day shows it, source link reopens the guide. |
| Phone note editing | Pass at 390×844; edit saved and survived reload. |
| Phone navigation | Pass; Notes is full-screen, bottom Browse/CFM/Notes persists; Browse returns to last chapter and CFM opens actual index/guide. |
| Phone month/entry controls | Pass; expand month, return week and switch between test notes. |
| Narrow reading dialog | Pass at 320×740; dialog remains within viewport, options/date/cancel visible. |
| Horizontal overflow | None observed: scrollWidth 375 at viewport390; 305 at viewport320 (native scrollbar excluded). |
| Client console errors | None captured across tested authenticated note/log/navigation/reload flows. |

The automation's direct date `fill` changed the DOM value without updating React state. A native date-control key edit was then used and the resulting October 22 date was verified before submission and after reload. This was a test-input limitation, not a reproduced app date-control defect.

## Retained development test records

Two notes were created and edited; no existing note was edited or deleted:

- `[DEV TEST 2026-10-23] Notes persistence` — personal note, including explicit second revision.
- `[DEV TEST 2026-10-23] Reader source` — actual 1 Nephi 1 source; includes the phone-edit verification line.

Three development reading records remain: 1 Nephi 1:1 on October 23, the current Jeremiah CFM guide on October 23, and that guide on October 22 to verify historical-day organization. These are private development test history. No chapter was marked read or unmarked for this test. Legacy draft titles were still present in the sidebar selector; their contents were not changed.

## Automated verification and limits

- 24 Notes/guard tests pass, including backend authorization/revision/compatibility/history, serialized save outbox and four deployment guard rejection cases.
- Root and Convex-specific strict TypeScript checks pass; focused lint passes; build with actual verified development public configuration passes.
- Previously run CFM suites (9 files), all four guide content checks and existing AI helper suites pass. No AI request was enabled or sent by this feature.
- Full-repository lint still has pre-existing violations in unrelated legacy files.
- The earlier screenshot's original authenticated crash was not reproduced before backend deployment, because sign-in initially lacked account authorization. Actual development API responses did prove the new functions were missing. After the guarded development backend deployment, the actual signed-in preview passes the flows above. Do not claim the historical screenshot's exact exception was captured.
- Browser checks used Chromium responsive viewports, not physical phones. Cross-device offline behavior, network-failure recovery, simultaneous real browser editors, every old-note conversion and destructive flows were not exercised against account data; relevant persistence/conflict/compatibility cases are covered by automated tests.
- No production migration, production write, live deployment or master merge occurred. A production release remains a separate user decision.

Browser-captured JPEG evidence is retained with the task under `notes-implementation/integration/evidence/`: `actual-desktop-reader-authenticated.jpg`, `actual-desktop-calendar-authenticated.jpg`, `actual-mobile-notes-authenticated.jpg`, and `actual-mobile-month-authenticated.jpg`. Captures show only the authorized synthetic test note text in the real development app.
