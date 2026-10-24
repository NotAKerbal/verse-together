# Come, Follow Me lesson covers

Every displayed lesson receives a cover through `src/features/comeFollowMe/lessonCovers.ts`. Add a specific cover when publishing a new guide; scheduled weeks without one use the landscape fallback.

## Image policy

Never generate or AI-edit a depiction of Jesus Christ/the Savior. Use verified historical public-domain or appropriately licensed artwork for such images, with visible artist and source credits. AI-generated covers in this directory contain landscapes or objects only, with no people or divine figures. These are devotional illustrations, not archaeological reconstructions.

## Historical artwork (existing assets, unchanged)

- `/cfm/art/bloch-gethsemane.webp`: Carl Bloch, *Christ in Gethsemane*, 1873. [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:Carl_Heinrich_Bloch_-_Gethsemane.jpg). Public Domain Mark 1.0; source identifies the painting and faithful reproduction as public domain. Used for October 5, 2026. No generative edits.
- `/cfm/art/tissot-good-shepherd.webp`: James Tissot, *The Good Shepherd (Le bon pasteur)*, 1886–1894, Brooklyn Museum. [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_The_Good_Shepherd_(Le_bon_pasteur)_-_James_Tissot_-_overall.jpg). Public Domain Mark 1.0; source identifies the painting and faithful reproduction as public domain. Used for September 28, 2026. No generative edits.

Both source pages independently checked during this redesign. The original files remain intact; CSS may frame them in cover cards.

## Generated covers

Generated with the built-in image_gen tool, then encoded as WebP (quality 86). All three outputs were visually inspected: no people or depictions of the Savior appear.

### jeremiah-potter.webp

Final prompt:

> Use case: historical-scene. Asset type: wide landscape cover art for a Jeremiah 1–3;7;16–18;20 Come Follow Me scripture lesson. Primary request: a half-formed clay vessel centered on an ancient wooden potter's wheel in a quiet Judean pottery workshop, a few finished earthen vessels in soft background, warm light through a stone doorway. Style: painterly oil landscape, rich visible brush texture, restrained earth ochre and olive tones, dignified and contemplative. Composition: wide 3:2, objects fill central horizontal band for 16:9 cropping. No text. Absolutely NO people, NO hands, NO human figures, NO Jesus, NO Savior, NO deities, NO angels, NO religious figure depictions. No watermark.

### zion-dawn.webp

Final prompt:

> Use case: historical-scene. Asset type: wide landscape cover art for Isaiah 58–66, The Redeemer Shall Come to Zion, a Come Follow Me scripture lesson. Primary request: ancient Jerusalem's warm limestone rooftops and low stone walls across rolling Judean hills, an olive tree in foreground, radiant gentle dawn breaking through clouds. No modern buildings. Style: painterly oil landscape with rich visible brush texture, muted sage and warm gold palette, reverent and hopeful. Wide 3:2 composition, landscape fills central horizontal band for 16:9 cropping. No text. Absolutely NO people, NO human figures, NO Jesus, NO Savior, NO deities, NO angels, NO religious figure depictions. No watermark.

### scripture-landscape.webp

Final prompt:

> Use case: historical-scene. Asset type: wide cover art for Old Testament Come Follow Me lessons without a bespoke cover. Primary request: a peaceful ancient Judean landscape, winding footpath between olive trees on sunlit terraced hills, distant pale mountains and warm morning sky. Style: painterly oil landscape with textured brushwork, muted olive, sandstone and soft golden light, contemplative scripture study mood. Wide 3:2 composition suitable for 16:9 cropping. No text. Absolutely NO people, NO human figures, NO Jesus, NO Savior, NO deities, NO angels, NO religious figure depictions. No watermark.
