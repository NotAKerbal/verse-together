# Library and journal artwork

Provenance for every image in `public/art/`: the eight Library (`/browse`) cards, the 86 scripture-book
thumbnails in `books/`, and the journal homepage banner. All 95 are AI-generated decorative illustrations. None
is a historical artwork, stock photo or third-party image, and no Creative Commons or other license is claimed
for them.

## Image policy

Never generate or AI-edit a depiction of Jesus Christ/the Savior. Use verified historical public-domain or
appropriately licensed artwork for such images, with visible artist and source credits (see
[`public/cfm/covers/README.md`](../cfm/covers/README.md)). AI-generated images here show landscapes and objects
only, with no people, hands, faces, statues, angels or deities. They are devotional illustrations, not
historical or archaeological reconstructions.

**Policy check, 2026-10-27:** all 95 files were viewed. Each shows only landscapes, buildings, animals or
objects, with no person, body part, face, statue or divine figure, so all comply with the policy. The busier
scenes were also checked at 2× zoom (cities, harbors, ruins and camps). The only animals are lions (Daniel) and
a whale's tail (Jonah).

## Library cards (8 files)

Generated late on 2026-10-23 Mountain time (recorded as 2026-10-24) with the built-in `image_gen` tool in Codex
(OpenAI image generation; the underlying model version isn't recorded), in Codex session
`01a16c47-1089-7343-99de-7a84ca6c1cbf`. Each card came from one call with no source images. Each was then
center-cropped and resized to 640 × 640 and encoded as WebP (quality 80) with `sharp`, with no generative edits.
Added in 23a571c ("Illustrate every Browse card with coordinated artwork"). The Come, Follow Me footprints
followed in f7f6b4d and replaced a Heinrich Hofmann portrait that is no longer shipped. Both commits came through
[PR #33](https://github.com/NotAKerbal/verse-together/pull/33).

Final prompts, sizes and SHA-256 checksums: [`docs/browse-generated-art-prompts.json`](../../docs/browse-generated-art-prompts.json).
Notes: [`docs/browse-art-provenance.md`](../../docs/browse-art-provenance.md).

| File | Subject |
| --- | --- |
| `browse-come-follow-me.webp` | Footprints in sand along a shoreline (symbolic) |
| `browse-continue-reading.webp` | Open scripture book with a bookmark |
| `browse-notes.webp` | Blank journal, pen and ink |
| `browse-bookofmormon.webp` | Uninscribed gold plates (symbolic) |
| `browse-oldtestament.webp` | Scroll, desert hills and olive tree |
| `browse-newtestament.webp` | Empty fishing boat on Galilee |
| `browse-doctrineandcovenants.webp` | Early-19th-century-style white meetinghouse among trees (also reused as the D&C book image) |
| `browse-pearl.webp` | Stars above a desert with a small distant tent |

## Scripture book thumbnails (`books/`, 86 files)

Generated individually with the same built-in `image_gen` tool, one call per book, dated 2026-10-24 in the
record. Each was then center-cropped and resized to 256 × 256 and encoded as WebP (quality 82). Added in 10c1936
("Add scripture book artwork with colors by section") and released through
[PR #48](https://github.com/NotAKerbal/verse-together/pull/48). Every prompt excludes text, people, hands, human
figures, the Savior, angels, deities and portraits.

Per-book subject, palette, final prompt, size and SHA-256: [`docs/scripture-book-art-prompts.json`](../../docs/scripture-book-art-prompts.json).
Notes: [`docs/scripture-book-art.md`](../../docs/scripture-book-art.md). The original generation session log
wasn't found on this machine. The in-repo record is the source for these.

## Journal banner (`journal-dawn.webp`)

Used as the background of the journal homepage invitation (`src/features/notes/JournalHome.module.css`). Added
in 6130649 ("Build inspiring journal homepage with editable weekly goals") and merged to dev in f731271.

- **Made with:** the built-in `image_gen` tool in Codex, on 2026-10-25 (Codex session
  `01a1767e-70a4-7451-97ae-f750afd3815d`, subagent `journal_hero_asset`).
- **Reference input:** one image, the approved Verse Together journal mockup. That mockup was itself
  generated with `image_gen`, and the prompt used it "for visual art direction only". The mockup's own inputs
  were a screenshot of Verse Together's notes page and a screenshot of
  [scripture-study-tracker.vercel.app](https://scripture-study-tracker.vercel.app/), a friend's app that
  inspired the journal layout. That app's hero shows a figure before a sunset sea. The Verse Together mockup
  and this banner contain no figure and show a different subject: a mountain valley at dawn.
- **Processing:** the generated PNG (2200 × 715, SHA-256
  `608f8fec78fa748bae2beb4578b1ab0f3014db212d5f412a0f1823b45887fc39`) was converted to WebP (quality 88) with
  Pillow and wasn't resized or edited.
- **Shipped file:** 2200 × 715, 156,150 bytes, SHA-256
  `f14080103c804546ada74cf214defee3a2e45f016fadd7f54427a5f2396c0b6c`.

Final prompt:

> Use case: stylized-concept. Asset type: standalone background artwork for the VerseTogether journal hero. Input reference is the approved UI mockup; extract its visual art direction only. Generate a wide landscape image 1600 x 520, absolutely NO text, no UI, no boxes, no glyphs or borders. Match the painterly sunrise landscape visible in the mockup's upper-right hero: distant layered blue-gray mountains around a broad valley, warm golden early morning sky, softly glowing sun near right third of frame, clouds catching muted peach and gold light, rocky foreground with sparse plants and an elegant mature tree framing the far right edge. Left half of frame must be very dark, subdued, low-detail warm charcoal-green atmospheric mountains so live HTML text will read well on top. Artwork gets brighter and more detailed toward the right half. Preserve a continuous natural landscape across full image, no artificial straight fade boundary. Style: restrained cinematic classical oil-painting digital illustration, slight visible painterly brushwork, atmospheric depth, quiet reverent mood. Palette dark warm charcoal and muted mountain greens, antique gold dawn and terracotta-cloud highlights. No people, no buildings, no religious figures, no modern objects, no watermark, no typography. Full-bleed natural landscape. The only needed deliverable is the landscape art, not a UI screenshot.

## Outside this directory

`public/Gemini_Generated_Image_4qmpme4qmpme4qmp.jpeg` (2048 × 2048, open-book logo concept) was added in
7347741 with no description. Its filename suggests Google Gemini output, but nothing else records its origin.
Nothing in the app references it, but it is still served publicly from `/`. The app's live icons are in
`public/brand/`.

## Adding artwork

Record each new file here or in its prompts JSON with the tool, date, final prompt, processing and SHA-256. For
historical artwork, record the artist, title, date, source URL and license instead. View every image against
the policy above before committing it.
