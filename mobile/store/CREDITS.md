# Content, art and asset provenance

What the app and its store assets reuse, and where it came from. Where a license or permission isn't recorded in
this repository, that's said rather than assumed.

## Brand and store artwork (this folder)

| Asset | Provenance |
| --- | --- |
| Verse Together mark (bookmark, open book, rubric dot) | The site's existing icons, `public/brand/icons/{light,dark}/icon.png` (in the repository since commit 4b86999, 2026-10-12). Unchanged. |
| `store/assets/play-icon-512.png` | `public/brand/icons/light/icon.png`, pixel for pixel, with an opaque alpha channel added (Play asks for a 32-bit PNG). |
| Vector mark in `store/brand/render-brand.mjs` | Traced by hand in code from those icons' geometry and colors (no generated or AI imagery). Used for the Android adaptive foreground, themed (monochrome) icon, splash images and feature graphic. |
| `store/assets/feature-graphic-1024x500.png` | Composed in SVG by `render-brand.mjs`: the vector mark, the site's colors (`src/app/globals.css`), and type set in DM Sans and Noto Serif. |
| iOS and legacy Android (API 24–25) icons | The site's existing icons, unchanged. |

Fonts: **DM Sans** (Colophon Foundry, SIL Open Font License 1.1; via `@expo-google-fonts/dm-sans`), bundled in
the app and used for the store artwork. **Noto Serif** (Google, SIL Open Font License 1.1; Ubuntu
`fonts-noto-core`), used only to set the feature graphic's title; the app uses the device's serif. Font file
hashes are in `store/brand/manifest.json`.

## In the app

| Content | Provenance |
| --- | --- |
| Scripture text | `public/scripture-data/*.json`, generated from `public/lds-scriptures-2020.12.08/sqlite/lds-scriptures-sqlite.db` (repository README). Its upstream source and terms are not recorded in this repository: **owner to confirm and credit**. The guides call the Bible text the King James Version. |
| Come, Follow Me study guides | `content/cfm/*.md`, as published on versetogether.org. Written by Claude Opus 5.5 and reviewed by Isaac before publishing (confirmed 2026-10-27). The app credits each guide's author from `content/cfm/guides.json`, with the note "Written in collaboration with agents"; the 2026-09-28 guide's entry there says "Claude" rather than "Claude Opus 5.5". The schedule follows the Church's published 2026 Come, Follow Me reading; the app is not affiliated with the Church. |
| Lesson covers and painting credits | `public/cfm/covers/README.md` and `src/features/comeFollowMe/lessonCovers.ts`: public-domain historical paintings (artist and source credited in the app), and AI-generated landscape covers with no people or divine figures, as documented there. |
| Browse and journal artwork | `public/art/*.webp` (added in commit 23a571c, "Illustrate every Browse card with coordinated artwork"). Its provenance isn't recorded in this repository: **owner to confirm**. |
| Explore and Translations | Live results from the Free Dictionary API, Wiktionary, Merriam-Webster (when configured), churchofjesuschrist.org study helps (through versetogether.org) and the HelloAO Bible API. |

None of this artwork is used in the store graphics, which use only the brand mark and type.
