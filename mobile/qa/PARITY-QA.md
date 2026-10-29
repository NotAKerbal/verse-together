# Android web-parity implementation and QA

The later [October 29 follow-up](PARITY-FOLLOWUP-QA.md) adds native authenticated research, HTTPS link routing
and durable account reading positions. The gaps and artifact below describe the October 28 build.

QA date: October 28, 2026 (America/Denver; final checks continued October 29 UTC).
Implementation used Claude subagents, followed by independent review, repairs, integration checks and real
Android emulator testing. This report supersedes the scope gaps in [the historical baseline](ANDROID-QA.md).
It is signed-out acceptance evidence, not authenticated or public-release sign-off.

## Tested source and artifact

- Base: `7b9f9933711f1d00948f57d11143404cfce212d4`, branch `t3/android-app-qa`, plus the uncommitted working tree.
- [Source manifest](parity-source.sha256): SHA-256 of all 90 changed implementation/test files used for the final build.
  Its own SHA-256 is `27450fdd6a7c17788bb7ef97ced597bc290111d387ffba80279d717e94225ea4`.
  Run `sha256sum -c mobile/qa/parity-source.sha256` from the repository root to verify them.
- Final APK on `isaac-omarchy`: `~/Work/verse-android-qa/verse-together-parity.apk` (51 MiB), SHA-256
  `fe9d7511d690543182423efb6cfcf4f7f584f49f99c33c96d13411ace97a98c5`.
- Standalone release build, development-key signed, x86_64 only; native version remains 1.0.5 (6).
  This is an emulator QA artifact, not a Play-distribution artifact.
- No backend, environment, dependency, version, production deployment or store changes. No commit, push, PR or merge.
  Existing staged QA changes were preserved; implementation changes remain in the working tree.

The final APK was installed on both dedicated Android 15 Google APIs AVDs on `isaac-omarchy`:
Pixel 7 (`verse_phone_api35`, port 5554) and Pixel Tablet (`verse_tablet_api35`, port 5556).
The Ubuntu host has no KVM; the remote host has working hardware acceleration. Setup, boot and install commands
are in the historical report. No Metro server is needed.

## Implemented parity

| Area | Resulting behavior |
| --- | --- |
| Journal | Existing-entry autosave, durable new-entry drafts per owner, recovery, revision conflicts, retry/copy, read-only published/archived notes. Published deletion is refused; archived deletion follows the web. |
| Faith tradition | Device preference filters Browse, search, navigation and study helps; direct LDS routes show the hidden-content notice under Other denominations. |
| Bible library | Save/remove Bibles, choose the default primary text, real catalog search, JST switch, shared reader/settings chooser, bundled KJV fallback. |
| Reader | Whole-chapter inline and side-by-side comparisons, actual tablet columns at 768dp+, JST with native strike-through, cached study paths, offline lesson Resources, journal note markers and Android Back exiting simple mode. |
| Native plans | List, create/edit, quick starts, scope, pace, days/dates, chapter check-off and deletion through existing account APIs. Signed out stays native with a sign-in explanation. |
| Account | Owner-safe preference and reading-position sync, actual account chapter progress for lesson chips, display-name editing, sign-in-method/session lists and sign-out-other-devices. |
| Settings | Feedback validation and session-aware submission, clearly labelled Website release history alongside the separate native version. |
| Links | Validated custom-scheme share links open the passage in the reader. |

Review found and repaired two data-safety defects: merely opening a web verse-range entry no longer rewrites its
source label, and editing appearance/marks cannot overwrite account preferences before their initial load.
Additional draft-loss warnings and copy actions were repaired. Store guards independently reject non-draft edits.
The book's chapter grid now reads the owner-safe Continue reading position rather than the guest position.

## Final automated checks

All commands below passed against the final manifest. Tests mock native selection or account services unless
explicitly described otherwise; they do not count as device or authenticated acceptance.

| Check | Status | Result |
| --- | --- | --- |
| `npm run typecheck` in `mobile/` | Passed | No TypeScript errors. |
| `npm test -- --maxWorkers=2 --silent --testTimeout=120000` | Passed | 32 suites, 384 tests; one live-only suite / 3 tests skipped, separately run below. |
| `LIVE_NETWORK=1 npm test -- --runInBand --silent __tests__/live-services.test.ts` | Passed | All 3 read-only real dictionary, study-help and translation service tests. |
| `./gradlew assembleRelease :scripture-text:testDebugUnitTest --no-daemon --max-workers=4 -PreactNativeArchitectures=x86_64 -PverseDebugSignedPreview=true` | Passed | Release APK built; all 27 Android native tests passed (11 widget, 6 style, 10 press). |
| `npm --prefix mobile run generate:check` | Passed | Generated data current. |
| Explicit ESLint on changed mobile TS/TSX/JS using `--no-ignore` | Passed | 0 errors, 22 warnings; hook/dependency and unused-variable warnings remain. Root lint otherwise ignores mobile. |
| `git diff --check`, source-manifest verification | Passed | No whitespace errors; all 90 source hashes match. |

Build/test logs are retained under `~/Work/verse-android-qa/` on the remote host as `parity-final-typecheck.log`,
`parity-final-tests.log`, `parity-final-live.log` and `parity-final-build.log`.
The local lint JSON is `/tmp/verse-parity-final-lint.json`.
Earlier concurrent full-suite runs had timing failures under load; the final complete run with two workers passed.

## Observed Android runtime results

All screenshots are unedited captures of the actual standalone native app with synthetic local notes.
Core phone flows below first ran on the preflight parity APK. The final APK adds the tablet-column implementation,
the owner-safe book position hook and minor lint repairs. Final-APK checks are explicitly labelled.

| Journey | Status | Observation / evidence |
| --- | --- | --- |
| Faith tradition and restart | Passed, preflight | Other denominations removes LDS Browse/nav content; direct Alma and CFM links show the notice. Choice survives force-stop. [Bible-only Browse](parity-screenshots/bible-only-browse.png), [direct-link gate](parity-screenshots/hidden-lds.png). |
| Saved Bible/default | Passed, preflight and final | Actual HelloAO catalog loads; saved BSB can become primary text. Final phone share route renders BSB John 1 after reconnecting. [Default BSB](parity-screenshots/default-bsb.png). |
| Offline default fallback | Passed, final phone | Select BSB, disable Wi-Fi/cellular, force-stop, open previously uncached John 2: bundled KJV appears with an explicit default-Bible fallback notice; JST request failure offers retry. [Offline cold launch](parity-screenshots/offline-fallback.png). |
| JST and omitted words | Passed, preflight | Real John 1 excerpts load; Show omitted KJV words renders native strike-through. [JST](parity-screenshots/jst-strikethrough.png). |
| Cached study paths | Passed, preflight | John 1 light-bulb marker opens real cached doctrine text and linked sources. [Study path](parity-screenshots/study-path.png). |
| Journal markers | Passed, preflight | Verse marker opens chooser and existing linked local journal entry. [Note chooser](parity-screenshots/note-markers.png). |
| Journal autosave and restart | Passed | Typed `Parity autosave check` in an existing entry without Save; preflight showed saved status. After force-stop and final APK install, journal search still finds that exact text. [Saved](parity-screenshots/autosaved-entry.png), [after restart](parity-screenshots/autosave-after-restart.png). |
| New draft recovery | Passed, preflight | Typed `Recovered Android draft`, waited for persistence, force-stopped and reopened: exact text restored with recovery notice. Synthetic draft then deliberately discarded. [Recovered draft](parity-screenshots/recovered-draft.png). |
| Offline Resources | Passed, preflight | With both radios disabled, Lamentations 3:1 opens bundled lesson commentary, sources and Read in lesson. [Resources](parity-screenshots/offline-resources.png). |
| Plans signed out | Passed, preflight | Native Sign in to keep a plan screen; no website hand-off. No sign-in attempted. [Plans](parity-screenshots/plans-signed-out.png). |
| Feedback validation | Passed, preflight | Empty submission shows the minimum-length error. No real feedback sent. [Validation](parity-screenshots/feedback-validation.png). |
| Release history | Passed, preflight | About distinguishes native 1.0.5 (6) and Website 2.x history. [About](parity-screenshots/website-history.png). |
| Tablet comparison layout | Passed, final tablet | KJV left and BSB right align by verse in landscape; narrower 600dp display switches to stacked cards without clipping. Override reset afterward. [Two columns](parity-screenshots/tablet-columns.png), [stacked](parity-screenshots/responsive-stacked.png). |
| Tablet continuous selection | Passed, final tablet | Dragged a native handle from verse 2 into verse 3 across comparison rows; menu reports John 1:2–3. Add to journal quotes only selected primary-text words, with no BSB wording. Saved locally. [Selection](parity-screenshots/tablet-cross-verse.png), [exact quote](parity-screenshots/tablet-exact-quote.png). |
| Custom-scheme share | Passed, final phone | `versetogether://share/newtestament/john/1/2-3` opens John 1 through the new share route. HTTPS app-link dispatch remains unconfigured. |
| Runtime errors | Passed, captured final window | Both AndroidRuntime/ReactNativeJS error captures were empty. This does not establish absence of all warnings or device-specific failures. Logs are in the remote `evidence/parity-final-*-errors.log` files. |

The historical baseline separately covers marks, inline annotation persistence, reading logs, offline search,
chapter swipes, dark/simple mode, compact layout, fonts and CFM prose selection. These were not all repeated
on the final parity APK. Final automated tests cover their affected routes and selection behavior.

## Remaining acceptance gaps and differences

- **Blocked:** real Google sign-in/return/cancel, account switching, two-way sync, conflicts across actual clients,
  native plan creation/check-off, account preferences, rename, sessions and deletion. No disposable account was
  supplied. Their mock-backed checks pass; no authenticated production write was attempted.
- **Not run:** physical devices, TalkBack/VoiceOver order (especially absolute-positioned comparison cells),
  minimum Android API 24, Play-installed signature behavior, iOS compilation/runtime, edge-drag autoscroll,
  very long plans/notes or large-account performance. Tablet rotation/font changes and multiple comparison
  cells have automated coverage, but those complete combinations were not manually exercised on Android.
- Public study-path requests can read cached paths; generating an uncached path still needs website
  authentication. No native generation-auth bridge was added.
- Native email/password management and linking Google were not added. Email endpoints are disabled by default
  in the backend and deployment-dependent. Custom-scheme links work; HTTPS app links need domain verification
  and intent filters.
- Plan dates use typed YYYY-MM-DD and day-step controls. Plans are online-only. A signed-in reading position
  is retained for the current run; cold offline Continue reading waits for the server rather than showing guest data.
- First-time account preferences remain disabled until the account copy loads. The initial preview uses defaults.
  A migration merge of older pre-hydration pending edits cannot distinguish an intentional reset to a default.
- Drafts persist after 400ms and existing edits autosave after 900ms; a kill inside that window can lose recent
  text. When an earlier draft awaits a decision, current new text is protected by a warning/copy action until
  that draft is resolved, not a second durable draft slot.
- Footnotes are not a current web-reader feature, despite a leftover preference. Unlinked legacy feed/admin/talk
  routes were excluded from parity.

No production data was modified. Dedicated emulator profiles and installed tooling are retained for the next
signed-in QA pass; task-owned emulator processes are shut down after testing.
