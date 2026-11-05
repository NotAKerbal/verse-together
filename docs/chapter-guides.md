# AI chapter guides

Signed-in readers can request a substantial, passage-by-passage guide for any chapter from the Resources panel.
Once written, a guide is saved for everyone: anyone can read it without an account, and nobody pays for it again.
Editorial Come, Follow Me guides are separate and unchanged. The chapter guide page says in its footer that the guide was prepared with AI.

## How readers see a guide

A guide is written once, for the whole chapter, and broken into small verse groups. It's then read at two levels,
following Come, Follow Me:

- **Resources.** Selecting verses in the reader shows only the groups that overlap those exact verses, as cards like
  the lessons'. A disjoint selection (verses 1 and 20) doesn't pull in the groups between them. Changing the selection
  never starts a job or re-reads anything but the saved guide, and each card has **Open chapter guide**.
- **The full guide**, at `/chapter-guides/<volume>/<book>/<chapter>`. It uses the Come, Follow Me study companion:
  scripture first, contents, **Context for verses N–M** disclosures, reading controls, and scripture previews. A link
  ending in `#passage-<first>-<last>` opens that group's context. The page is public and only reads what's saved.

`src/lib/chapterGuideCompanion.ts` builds both levels from the saved guide. It writes HTML directly from the structured
fields and escapes every generated string, so no generated text passes through Markdown or reaches the page as markup.
Highlights on a guide are stored under `ai-guide-<volume>-<book>-<chapter>`, which can't equal a lesson's date key. Notes
link to the guide as a page, not as a Come, Follow Me lesson.

A guide saved before these rules can still hold wording the current prompts would reject. The page removes an opening
AI disclaimer and an `Application:` prefix when showing it, but doesn't change the saved text.

Merging this feature spends nothing. Generation stays off until the steps below are done.

## Turning it on

Set these yourself. Never put a key in the repository, a command argument, a chat, or a log.

| Where | Variable | Purpose |
| --- | --- | --- |
| Convex environment | `OPENAI_API_KEY` | Research and review (`gpt-5.6-luna`, `gpt-5.6-terra`) |
| Convex environment | `ANTHROPIC_API_KEY` | Writing and repair (`claude-opus-5-5`) |
| Convex environment | `CHAPTER_GUIDE_SERVICE_SECRET` | Long random value; must match the Vercel value |
| Vercel (server only) | `CHAPTER_GUIDE_SERVICE_SECRET` | Lets the site vouch for the scripture text it sends to Convex |

Generation also reads `SITE_URL`, which the Convex deployment already sets for sign-in, to look up scripture text (see
below). Without it, guides still generate, but cited scripture isn't checked against its text.

Do not give the secret a `NEXT_PUBLIC_` prefix. Generate it with `openssl rand -hex 32`. Use separate values and
separate provider keys for the development and production deployments.

Then, as an admin, open the resource manager at `/resources/manage` and follow **AI chapter guide controls** to
`/resources/manage/chapter-guides`. Check that the keys and both copies of the secret show as set, and choose
**Resume generation**. A deployment with no settings saved starts paused. With a key or either copy of the secret
missing, readers see that guides aren't set up, and no spending is reserved.

## How spending is limited

The application cap is **$100 per UTC month**, set by `HARD_MONTHLY_CAP_MICROS` in `convex/chapterGuideBudget.ts`. An
owner can lower it on the admin page but can't raise it above that value without a code change.

This cap is the application's own ledger, not a limit the providers enforce. It stops new calls based on what it has
reserved and counted, so it can't stop a charge it doesn't know about: the search usage described below, a price that
changed, or a provider billing something it doesn't report. Set a spending limit in each provider's console if you need
one that holds regardless.

- **Reservation before any call.** `chapterGuides:requestGeneration` is one serializable Convex mutation. It reserves
  the job's maximum in `chapterGuideBudgetPeriods`, and rejects the request if spent + reserved + the new reservation +
  a $2 margin would pass the cap. Concurrent requests can't both take the last of the budget.
- **What the maximum covers.** `jobReservationMicros` covers every stage at its maximum attempts: 2 calls each for
  research, writing, and the first review, then for each of the 3 correction rounds, 1 repair call and up to 2 review
  calls. That's 15 calls at most, 9 of them in correction rounds. It includes output token caps, web search calls, and an
  input bound for each stage, including the cited scripture below. It comes to about $12.53 for a 43-verse chapter
  (about $6.92 with one correction round), and about $21.03 for the largest chapter allowed, and that amount is held only
  while the job runs. SDK retries are off (`maxRetries: 0`), so each retry is a counted attempt.
- **Rounds and retries are counted separately.** `MAX_CORRECTION_ROUNDS` limits correction rounds for the whole job.
  `STAGE_MAX_ATTEMPTS` limits provider calls each time a stage is entered, so a round's calls don't use up the next
  round's, and an unreadable review doesn't use up a round. The number of rounds can only go up, and only
  `completeStage` raises it, refusing to pass the job's limit, so the loop always ends.
- **Jobs keep the limit they reserved for.** Each job records its own `maxCorrectionRounds` when its reservation is made.
  A job already running when the limit changed has no such field, so it keeps its one correction round and its smaller
  reservation. No job is given rounds it hasn't reserved. The only way to raise the limit is an owner's **Continue
  generation**, which reserves those rounds first (see [Human review](#human-review)).
- **How input is bounded.** `requestInputBytes` measures the system prompt, the user message, the JSON schema, and any
  tool definition, and adds a fixed allowance for provider framing. A request over its stage's bound isn't sent. The cost
  calculation treats each byte as at most one token. That is a conservative estimate rather than a tokenizer guarantee,
  and hidden provider framing isn't documented, so reported usage above the maximum pauses generation (below).
- **Research is held at its maximum.** OpenAI bills web search content at model rates. Its [pricing
  page](https://developers.openai.com/api/docs/pricing), its web search guide, and the `openai` SDK's `tool_usage` type
  don't say whether `usage.input_tokens` includes that content, so a research attempt is never reduced to its reported usage. It
  stays spent at its maximum (`held_at_maximum`, with the reported usage kept on the attempt row), which is about $0.50
  per attempt. That maximum assumes one full 128K search context on each of the 7 possible model turns; OpenAI documents
  the 128K limit and the 6-call `max_tool_calls` cap, but not that bound as a guaranteed ceiling.
- **Each call has a ledger row first.** `beginStage` writes a `chapterGuideAttempts` row and checks that the job is
  still allowed to run before any provider is contacted. Pausing or lowering the cap stops a running job at its next
  stage. A worker that starts too late to finish inside its lease makes no call.
- **Fails closed.** When a call times out, returns a 5xx, reports malformed usage (anything other than non-negative
  whole numbers, or cached tokens above input tokens), or its worker disappears, the cost is unknown, so the attempt
  keeps its full maximum as spent. `sweepStaleJobs` does this for lost workers every 5 minutes. Unused reservation is
  released only when a job finishes.
- **Automatic pauses.** Generation pauses after 4 failed guides in a row, or if a call's reported cost ever exceeds
  its reserved maximum, which would mean the prices or bounds here are out of date.

### Across a month boundary

Each month's ledger has to cover whatever could land in that month, so spending never depends on a job's starting month:

- **Next stage, next month.** `beginStage` moves the job's remaining reservation into the current month before any call.
  If the new month can't hold it, including the $2 margin, the job stops as `budget_stopped` and its reservation is
  released.
- **A call running across midnight.** If a call's lease reaches the next month, `beginStage` also holds that call's
  maximum in the next month before starting it, and refuses to start if the next month can't hold it.
- **Settling.** A call that finishes before midnight releases that hold and charges only its own month. A call that
  finishes after midnight, or whose worker is swept after midnight, is charged to both months and its hold released,
  because which month the provider bills it to isn't known. The two months' ledgers can therefore overlap by a few calls
  at each boundary, and the job's own `spentMicros` counts them once.

Other limits, in `convex/chapterGuideBudget.ts`: one job per chapter (a repeat request joins it), 2 running jobs,
20 jobs a day overall, 2 a day and 8 per 30 days per reader, and a 12-hour wait before retrying a chapter whose guide
failed. A continuation is the same job, so it doesn't count against those daily or per-reader limits, but it does count
as a running job.

### Prices

Verified on 2026-11-04 from each provider's pricing and model pages. Recheck them and update `MODEL_PRICES` and
`PRICES_VERIFIED_ON` when models or prices change. The ledger is only as accurate as this table and each provider's
reported usage, so compare it with the providers' billing pages.

| Model | Used for | Input / cached / 30-minute cache write / output per 1M tokens |
| --- | --- | --- |
| `gpt-5.6-luna` | Research | $0.20 / $0.02 / $0.25 / $1.20 ($0.40 / $0.04 / $0.50 / $1.80 above 272K input tokens) |
| `gpt-5.6-terra` | Review, reviews of corrections | $2.00 / $0.20 / $2.50 / $12.00 ($4.00 / $0.40 / $5.00 / $18.00 above 272K input tokens) |
| `claude-opus-5-5` | Writing, repair | $4.00 / $0.20 / $5.00 / $20.00 |
| OpenAI web search | Research | $10 per 1,000 calls, plus search content tokens at the model's input rate |

These sources give the figures: [OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[`gpt-5.6-terra`](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
[Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing).

OpenAI requests set `prompt_cache_options.mode` to `explicit` with no breakpoints, which by [OpenAI's
guide](https://developers.openai.com/api/docs/guides/prompt-caching) neither writes nor reads the cache, because these
prompts aren't reused. Claude requests set no `cache_control`. Any cache tokens a provider still reports are charged at
the rates above.

Two test guides have been generated to completion on an isolated local deployment, both for 1 Nephi 1 (20 verses). The
original run, before canonical cited scripture was added as evidence, came to $0.842402 on the ledger. The revised run,
at `promptVersion` 2, came to $0.775452, for $1.617854 combined. Two runs of one chapter don't establish a typical cost
or a monthly guide count, so check the first few on the admin page and against each provider's billing page.

## How a guide is made

Each stage is its own scheduled Convex action, so a failure loses one stage rather than the job. The research step
chooses its own searches, within the limits below. Everything after it is a fixed sequence, not an open-ended agent.

1. **Research.** OpenAI web search, limited to the Church's site and named Latter-day Saint scholarship, writes short
   attributed notes tied to verses. A note is kept only if its URL came back from that search. It also lists passages
   of other scriptures worth comparing, as coordinates only.
2. **Writing.** Claude picks the significant insights and writes the guide from the chapter's text, the notes, and the
   text of those passages, with no web access. Every verse must fall in exactly one passage, each passage covers at most
   12 verses and needs its original meaning and a question. Later readings go in a separate, labeled application field.
3. **Review.** A different model checks the draft against the chapter, the notes, and the text of the scriptures it
   cites. Each required correction must
   name a real section (`overview`, `historical_context`, `limitations`, `insight:<index>`, or `passage:<start>-<end>`).
   A review that names anything else is retried and then waits for human review, as do too many required corrections.
4. **Repair.** If needed, Claude replaces the flagged sections. Each round makes one repair call, and a failed call
   isn't retried. A repair isn't applied if it leaves a flagged section unchanged (`repair_noop`), replaces a section
   nobody flagged (`repair_out_of_scope`), no longer validates (`repair_invalid`), or can't be read
   (`repair_unparseable`). The job then waits for human review with the last valid draft.
5. **Review of the corrections.** The same review model checks the repaired guide, with the findings it was repaired
   against as data. The guide is published only if no required correction remains. If corrections remain, the next round
   sends the writer that review's findings, not the earlier ones, up to 3 rounds in all. Findings still open after the
   third round send the job to human review as `repair_unresolved`, keeping that last review's findings. Before a repair
   is sent, the findings are held to the same limits as the first review: a review naming a section that doesn't exist
   is retried and then waits for human review (`recheck_invalid_target`), and too many findings, or findings too large,
   wait for it straight away (`recheck_rejected`). A published guide's provenance records the first review's correction
   count, that it was repaired, and how many rounds it took.

### Human review

A job with a useful draft and reviewer findings that the automatic steps can't finish becomes `needs_review` instead of
failing. It keeps its scripture, research, draft (always the last valid one), and latest findings, and its unused
reservation is released, so waiting costs nothing. It isn't a failure: there's no 12-hour wait, no count toward the
automatic pause, and the 5-minute sweep ignores it because it holds no lease or running worker.

The codes that lead here are `repair_unresolved`, `repair_noop`, `repair_out_of_scope`, `repair_invalid`,
`repair_unparseable`, `review_rejected`, `review_invalid_target`, `recheck_rejected`, `recheck_invalid_target`, and
`recheck_unparseable`. Anything else on a first run (a provider or service error, a pause, a missing artifact) still
fails as described above, because there's nothing a person could decide.

**What readers see.** Resources and the full guide page say "This one needs a little additional human review." They get
no timing, draft, or findings: `getChapterState` returns only `availability: "needs_review"`. A reader's request returns
that same answer before any limit or reservation, so it can't start a second job or use up an allowance. If the
chapter's scripture text has changed, the held draft no longer applies: a new request retires it as `superseded` and
starts fresh.

**What an owner sees.** **Needs review** at `/resources/manage/chapter-guides` lists the queue, and each item opens the
draft, the outstanding findings, and the continuation's cost. `getReviewQueue` and `getReviewDetail` return `null` to
anyone but an admin. There's no editing or approving here, and doing nothing leaves the item queued.

**Continue generation.** `chapterGuides:continueReview` authenticates an admin, then, in one serializable mutation,
checks the configuration, the pause, the running-job limit, and the current month's room (including the $2 margin),
reserves the cost in the current UTC month, records a `chapterGuideContinuations` row, and schedules the worker. The
same job continues, so its round numbers keep counting and its attempts carry a `continuation` number. The row records
who continued, the reason it was queued, the findings as they stood, and the amount reserved. If that admin later deletes
their account, the row stays and is credited to no one.

- **What it allows.** 3 more correction rounds, counted from the job's current round: 1 repair call and up to 2 review
  calls each, so 9 calls, about $8.43 for a 43-verse chapter. Findings that can go straight to the writer start a repair.
  Findings that can't (too many, too large, or naming a section that doesn't exist), or a repair nobody has reviewed yet,
  start with a fresh review instead, which adds up to 2 calls, about $9.86 in all.
- **Nothing skips the checks.** It publishes only through the same path as any guide: a review with no required
  corrections, after each repair has passed validation. Otherwise it returns to the queue with the newest draft and
  findings, and no further round starts until an owner chooses again, so there's no automatic loop.
- **Repeat clicks.** Each queue entry has its own `queuedAt`. A second click finds the job running and reserves nothing,
  and a click from a stale page finds a different `queuedAt` and starts nothing.
- **If a continuation stops early.** A pause, a budget stop, a provider error, or a lost worker returns the job to the
  queue with what it last saved, and the unused reservation is released. Only those service errors count toward the
  automatic pause. The usual month-boundary rules apply to each call.

There's no way yet to discard a held draft from the admin page, so a chapter stays queued until a continuation publishes
it or its scripture changes.

### What readers see while it runs

The Resources panel and the full guide page both show the job's real stage in `ChapterGuideProgress`, polling every 15
seconds. The bar counts finished stages, so it moves only when the worker reaches a new stage; time never moves it. It
starts as three steps (research, writing, review). Each correction round adds two more, corrections and a review of them,
so a job can reach nine. Finished steps are never taken back: a further round adds new steps rather than returning to
earlier ones, which can make the filled share of the bar shrink even though the count of finished steps went up. A stage
being retried stays on the same step. When the guide is saved, the full page refreshes itself.

The full page is rendered knowing a job is running, so it keeps retrying even if its first check fails. While a check is
failing it says it can't confirm the job is still running and names the last known step, then returns to the bar once a
check succeeds. The Resources panel doesn't assume a job is running, so it starts polling only after a check reports one.

If a job fails, readers see which stage it stopped in and roughly how long the 12-hour wait has left, from `cooldown` in
`chapterGuides:getChapterState`. The wait itself is unchanged and is still enforced by `requestGeneration`. Failure
codes stay internal: an admin sees them under **Recent guides** on the admin page. A continued job shows the same
progress bar, with its later rounds added.

### Cited scripture

The writing, review, repair, and later review stages get the canonical text of other scriptures, so a model doesn't
have to judge them from memory. `convex/chapterGuideEvidence.ts` takes the coordinates and any exact references in the
prose, validates them against the canon, and fetches only `<SITE_URL origin>/api/scriptures/lds-chapter`, with a query
built from the validated coordinates and redirects refused. A model can't choose a URL.

Input is limited to 40 references, 24 chapters, 30 verses per reference, and 24 KiB in all, and that bound is part of
each stage's reservation. Each entry says whether its text was supplied. If it wasn't, the reviewer is told to abstain
and list it as unverifiable rather than judge it from memory; a reference to verses that don't exist is a real problem to
report. Lookups cost nothing, and a failed lookup doesn't stop the job. The guide's footer says how many cited scriptures
the reviewer could read.

The prompts also tell both models that a chapter's silence doesn't prove a negative, and to check negatives against the
research notes and mark inference. These are instructions to a model, not guarantees, so wrong claims can still get
through.

### Validation

Validation checks verse coverage, that sources come from the research packet, length, and that any quotation of six
words or more matches the chapter. A guide that fails isn't published.

Headings and Resources cards call it a chapter guide, in the same style as Come, Follow Me resources, with no AI badge.
The page's footer says what was and wasn't done: AI writing, no human review (or, if an owner continued it, that no person approved the text), and that the writer saw research notes rather than the source pages. No source is described as read in full, because the search API doesn't report that reliably.

## Security

- Provider keys exist only in the Convex environment and are read only in the worker.
- `requestGeneration` needs both the service secret and a live signed-in session, because it trusts the scripture text
  it's given. Only the site's server has the secret.
- Every function that records spending or publishes a guide is internal, so a client can't call it. The one exception
  is `continueReview`, which rejects anyone but an admin before it reads a job, and can only reserve and schedule.
- Study paths no longer generate anything: `/api/insights/chapter` only reads the batch cache, so opening a chapter
  never costs money, and the public `upsertChapterInsight` mutation is gone.

To remove a bad guide, run `npx convex run chapterGuides:retireGuide` with its volume, book, chapter, and scripture
hash. A new request for that chapter will then generate it again.

Source titles: when a search returned no page title, the stored title is the hostname, and the site shows a label read
from the URL instead (for example "Guide to the Scriptures: Zedekiah"). That label describes the address only, not what the
page says.
