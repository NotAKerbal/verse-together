# Scripture book artwork

The volume browser gives each book its own decorative landscape or symbolic still life. Related books share a
color palette. The section label stays visible beside the image, so color is not the only way to identify a group.

The 86 book thumbnails in `public/art/books/` were generated individually with the built-in `image_gen` tool.
Doctrine and Covenants already has its own meetinghouse illustration on the Library page and opens directly to
its section list. Its artwork is reused rather than adding an extra book selection step.

These are original decorative illustrations, not historical or archaeological reconstructions. All prompts
exclude people, human figures, statues, the Savior, angels, deities, and writing. See the final prompts and
asset checksums in [scripture-book-art-prompts.json](scripture-book-art-prompts.json). The existing D&C image is
documented in [browse-art-provenance.md](browse-art-provenance.md).

## Section palettes

| Volume | Section | Palette |
| --- | --- | --- |
| Old Testament | Law | Honey gold and olive |
| Old Testament | History | Terracotta and copper |
| Old Testament | Wisdom | Sage and moss |
| Old Testament | Major Prophets | Indigo and slate blue |
| Old Testament | Minor Prophets | Plum and heather |
| New Testament | Gospels | Gold and sandstone |
| New Testament | History | Teal and turquoise |
| New Testament | Pauline Epistles | Cobalt and slate |
| New Testament | General Epistles | Sage and forest green |
| New Testament | Apocalypse | Violet and pearl |
| Book of Mormon | Small Plates | Sage and jade |
| Book of Mormon | Mormon's Record | Terracotta and amber |
| Book of Mormon | Jaredite Record | Ocean teal and seafoam |
| Book of Mormon | Moroni's Writings | Violet and lavender |
| Pearl of Great Price | Moses and Abraham | Midnight blue and starlight gold |
| Pearl of Great Price | Joseph Smith's Writings | Sage and cream |

Images have empty alt text because they decorate links whose visible book names provide the accessible labels.
Next.js serves responsive, lazy-loaded images in reserved square spaces to keep the list stable while loading.
`npm run test:browse` verifies coverage of all 87 books and checks section labels against the artwork manifest.
