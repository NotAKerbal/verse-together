# Joseph Smith Translation (JST) in the Bible reader

Readers can turn on **Joseph Smith Translation (JST)** in Reader settings → Translations, on any Old or New
Testament chapter. It is off by default. The choice is stored on the device (`localStorage` key
`vt_bible_jst_v1`), so it carries from chapter to chapter and across reloads, and stays the same in every open tab.
It isn't synced to the account.

## What is shown

The source is the JST appendix of the Latter-day Saint edition of the Bible: **selected passages, not the full
JST**. 115 of the Bible's 1,189 chapters have a passage; the rest show "The JST appendix has no excerpts for this
chapter." The reader says so wherever it shows the toggle, so no one takes the passages for complete coverage.

Each passage is **read in place** of the KJV verses it compares to, as one continuous text in the reader's own type
(`readJstChapter` in `src/lib/jst.ts`, rendered by `src/components/JstVerseText.tsx`):

- The whole JST passage is aligned word by word with the whole KJV passage its compare reference names (never
  verse by verse, since JST numbering often differs), and its words are spread over those KJV verses' rows. Every
  JST word appears exactly once, in order: "JST, Mark 9:40–48" (nine JST verses) reads across KJV Mark 9:43–48 (six).
- Wording the JST shares with the KJV reads normally (in the JST's spelling and punctuation). Wording the JST adds
  or substitutes keeps the verse's own text color and has only a subtle dotted underline (an `<ins>`), so the
  passage reads as one text. KJV wording the JST leaves out is hidden by default; "Show omitted KJV words" in the
  JST notice above the chapter shows it in place, muted and struck through (a `<del>`, with "KJV wording not in the
  JST" for screen readers). A KJV verse with no JST wording at all says so.
- The KJV verse numbers stay. Each passage starts with a small, muted "JST 9:40–48" reference (the source label and
  compare reference in its tooltip and screen-reader text), and JST verse numbers that differ from the KJV's show
  inline as small muted numerals (announced as "JST verse 41").
- KJV verses outside a passage are untouched, including the gap in a discontinuous one (Exodus 34:1–2, 14 leaves
  3–13 alone). Where the JST verses are numbered like the KJV's and skip some ("1 Corinthians 7:1–2, 5, 26, 29–33,
  38" compared with "29–38"), each numbered run is aligned on its own and the verses between runs (34–37), which the
  appendix doesn't reprint, stay KJV. KJV verses at either end of a passage that share no wording with it (Matthew
  11:10–11 against JST Matthew 11:13–15) also stay KJV, rather than reading as if the JST removed them.
- JST Genesis 1:1–8:18 (compare Genesis 1:1–6:13) has no text in the appendix: it is the Book of Moses. Genesis 1–6
  show the source's note in a card above the text, linking to Moses 1 in the Pearl of Great Price. A passage that
  can't be read in place (no usable compare reference, its verses not in the text, or overlapping a passage already
  read there; none today) is also shown whole in a card above the text, so its text is never lost.

All 142 passages in the appendix (145 sections, less Exodus 34's two unlabeled repeats and the Moses note) read in
place this way; the full-corpus audit in the tests checks it.

### Highlights, notes, selections, and quotes

Saved highlights, underlines, and notes point at offsets in the KJV text, so a verse showing the JST's wording is
not part of the selectable scripture text (it has no `data-verse-text`, and `selectedVerseRanges` skips it). Its
words can't be highlighted, quoted, shared, or added to an insight as KJV, and a selection running into it only
acts on the KJV verses it covers. When added to a note, selections spanning a revised verse are saved as separate contiguous passage blocks, each with its own exact quotation and reference. A JST verse with a saved highlight or underline says the mark is on the KJV wording
and to turn off the JST to see it; a note still shows under the verse. Every other verse works as usual. Turning
the JST off restores the KJV text with its marks exactly.

Comparison translations (`?translation=…&compare=…`) work as before on KJV verses. On a verse read with the JST,
each overlay's wording is shown on its own under the JST reading, without repeating the KJV.

## Source and request path

- Docs: <https://openscriptureapi.org/docs/study-helps>
- Entry: `GET https://openscriptureapi.org/api/study-helps/v1/lds/en/entry/jst-{book}-{chapter}`, e.g.
  `jst-mark-9`. A 404 whose JSON body is the API's own `{"error": …}` means the appendix has no entry for that chapter.
- List: `GET …/entries?type=jst&limit=500` (109 entries, including `jst-introduction`).

Entries are keyed by **JST** chapter, and a few compare to a different KJV chapter. Each KJV chapter requests its
same-numbered entry plus any in `CROSS_CHAPTER_ENTRIES` (`src/lib/jst.ts`), then keeps only the sections whose
compare reference falls in that chapter:

| KJV chapter | Extra entry | Why |
| --- | --- | --- |
| Genesis 1–6 | `jst-genesis-1-8` | JST Genesis 1:1–8:18 compares to Genesis 1:1–6:13 |
| Genesis 8 | `jst-genesis-9` | JST Genesis 9:4–6 compares to Genesis 8:20–22 |
| Matthew 2 | `jst-matthew-3` | JST Matthew 3:4–6, 3:24–26 compare to Matthew 2:4–6, 2:23 |

This list was found by reading all 108 chapter entries (October 2026). Re-check it if the upstream list changes.

The browser calls `GET /api/scriptures/jst?volume=…&book=…&chapter=…` (`src/app/api/scriptures/jst/route.ts`,
logic in `src/lib/jstApi.server.ts`). The route:

- accepts only Old/New Testament books and in-range chapters (volume aliases like `new-testament` are normalized);
  anything else is a 400 and nothing is fetched upstream. Upstream URLs are built only from those validated values.
- times out each upstream request after 8 seconds (504) and rejects bodies over 256 KB; any other failure is a 502.
  Errors are `no-store`; results are cached publicly for an hour (a day at the edge).
- returns `200 { volume, book, chapter, excerpts: [] }` when there are none, so the reader can tell "no excerpts"
  from "couldn't load". Failures show a Retry button above the chapter text, including in simple mode.

The reader requests excerpts only while the toggle is on, only for Bible chapters, and only after the chapter text
is on screen. A response for a chapter the reader has already left is dropped.

## Tests

`npm run test:jst` covers reference parsing, anchoring (Mark 9:3 → 9:4, the nine-verse JST Mark 9:40–48),
cross-chapter entries, duplicate and unplaceable sections, reading in place (exact reconstruction, additions,
replacements, omissions, discontinuous passages, unprinted gaps, the toggle off), the selection boundary, request
validation, upstream failure handling, stale responses, and the preference. Its fixtures
(`src/lib/jst.fixtures.json`) are real upstream entries; KJV text comes from `public/scripture-data`.

To audit every appendix passage, save the upstream entries as `{ "<id>": { "body": <entry> } }` and run
`JST_CORPUS=/path/to/all.json npm run test:jst`.
