# Verse Together Roadmap

Updated 2026-09-26 alongside the Marker redesign. This is the planning list: what exists, what is hidden, and what still needs to be built, roughly in the order it makes sense to build it.

## What exists today

- Reader for all five standard works with verse selection, per-verse annotations and highlight colors, footnotes, and reader settings (typeface, size, comparison view).
- Bible translation compare: KJV built in, more translations from the catalog picker, inline word diff or side by side.
- Notes (insights): block editor with scripture, text, quote, and dictionary blocks (Webster 1828, 1844, 1913, etymology), folders, tags, drafts vs. published, private / friends / link / public visibility, markdown export, share links.
- AI study paths per chapter (the lightbulb bubbles). All 1,582 chapters were generated once in a batch and are cached in Convex; reading them needs no API key. `OPENAI_API_KEY` is only for regenerating a chapter or the signed-in notes assistant.
- Word study: dictionary and etymology lookups from a selection.
- Citations and talks: General Conference talks that cite a verse, talk reader.
- Search across scriptures, notes, and talks.
- Curated podcast feed (Spotify) and social shares with reactions and comments.

## Hidden for now (code kept, removed from navigation)

- Feed (curated podcasts + social shares) at `/feed`.
- Guide at `/help`.
- Resources manager at `/resources/manage`.

Bring each back only once it has a real reason to exist in the nav.

## To build, in order

### 1. Study plans and reading progress
- Plans as a first-class object: a sequence of chapters or passages, optionally dated (Come Follow Me week, 30-day Book of Mormon, custom).
- Per-chapter read state so the Books and Chapters grids can show green / yellow tiles and a progress bar per book, as in the mockups.
- "Continue reading" card on the Library page from the last reading position.
- Streaks come out of this for free once check-ins exist. Keep the streak chip quiet until plans ship.
- Earlier attempts left `studyPlans`, `scheduledStudyPlans`, `studyPlanCheckins`, and `readingPositions` tables in the dev deployment and `lessonPlans` tables in production; audit those before designing the schema.

### 2. Cloud-synced folders for notes
- Folder membership and folder hierarchy currently live in `localStorage`; move them to Convex so notes look the same on every device.

### 3. Full-text note search
- Search inside block text, not only title, tags, and folder.

### 4. Insight version history
- Snapshot drafts on save; allow restore. Removes the fear of editing published work.

### 5. Verse-linked insights in the reader
- Show a small marker on verses that already appear in one of your insights, and open that insight from the marker. The lightbulb pattern is established now; reuse it with a different tint.

### 6. Mobile quick capture
- One-tap actions from a selection: save verse to current insight, add dictionary block, share with comment.

### 7. Social, once the above is solid
- Friends presence ("Jonah is in Alma 32") and shared verses in the reader side panel.
- Feed ranking with following, mute controls, and an insights-only filter.
- Study groups: persistent groups with shared insight collections and discussion.

### 8. Citation and source graph
- Visualize links between verses, talks, notes, and study paths. Builds on the citation cache and the scripture links inside study paths.

## Housekeeping

- ESLint fails at config load (circular structure in the legacy `eslintrc` bridge). Fix the flat config so `npm run lint` runs.
- Turbopack dev leaks PostCSS workers with Tailwind v4 on Next 16.1; dev scripts use webpack until that is fixed upstream.
- Clerk keys in `.env.local` are the test instance; production uses `clerk.versetogether.org`. Signed-in data (insights, annotations) is therefore per environment.
