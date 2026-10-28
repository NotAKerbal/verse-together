# Google Play release materials

- `RELEASE.md`: the upload key and where it is kept, building and verifying the signed bundle, Play Console
  steps, and what is still missing (screenshots).
- `listing/en-US.md`: store listing text (name, short and full description, release notes, category).
- `privacy/privacy-policy-draft.md`, `privacy/data-safety-draft.md`: drafts for the owner, from a review of the
  app's code and dependencies. Not published.
- `assets/`: `play-icon-512.png` (512 x 512, 32-bit PNG) and `feature-graphic-1024x500.png` (24-bit PNG).
- `brand/`: `render-brand.mjs` renders the adaptive icon, splash images and store graphics from one vector
  drawing of the mark (`svg/` sources, `manifest.json` hashes, `review/` mask and splash sheets).
- `CREDITS.md`: provenance of the content, art and fonts.

No signing keys or passwords belong in this folder.
