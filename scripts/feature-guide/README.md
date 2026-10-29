# Feature guide clips

The silent demo clips on `/feature-guide` (`src/app/feature-guide`, content in `src/features/featureGuide/guide.ts`).
Each clip is a few seconds of the real app doing one thing, with the steps written out beside it on the page.

## What the clips are

- **Real footage.** Every app pixel is a CDP screencast frame of a production build (`next build`, `next start`) of
  dev at the revision in `clips.json` (`7b9f993`, 2026-10-28), driven by real mouse, wheel and keyboard input in
  fresh guest profiles (nobody signed in). DOM reads only locate targets and assert results; nothing is mocked,
  stubbed or rewritten. The example marks, notes and journal entries were typed in during capture; no personal data.
- **Editorial, and only this:** the pointer and click ring, drawn where the recorded mouse events were (headless
  frames contain no cursor), and three short cuts listed in `clips.json` that skip a page still loading. Clips play
  at real speed.
- **Silent.** Every MP4 is a single H.264 video track with no audio stream at all (encoded with `-an`; the renderer
  and `tests/featureGuide.test.ts` both refuse a file with any other track). There is no narration, music or
  subtitle track; the page's written steps are the text equivalent of each clip.
- **Not shown on purpose:** signing in (it needs a real account; Settings › Account is shown signed out), sending
  feedback (the form is shown empty), and single-verse notes and study plans, which are being retired. The Annotate
  panel still lists "Write a note"; the clips never use it and the guide doesn't mention it.
- Desktop footage (1280×720 CSS px, light theme). The page says so; phones arrange the same tools differently.

`capture-report.json` is the capture's own record for the clips here: for each scene, the revision, every
visibility and selection assertion, and the check run on the result (all 30 passed).

Output: `public/feature-guide/<id>.mp4` (1280×720, 24 fps, H.264 High, yuv420p, faststart, CRF 28) and
`<id>.webp` (960 px poster of the clip's result). `src/features/featureGuide/guideMedia.json` is written by the
renderer with each clip's measured duration, size and bytes. 32 clips, about 19 MB with posters.

## Re-recording

When a feature's interface changes, re-record its scene and re-render its clip, then update its steps in `guide.ts`.

Needs Node 24, Playwright with its Chromium (not an app dependency), Python 3 with Pillow and NumPy, and ffmpeg with
libx264 and libwebp. Work files (frames, profiles) stay outside the repository.

```bash
# 1. The app at the revision to record: production build, public Convex URLs only, a port of your own
npm ci && npm run build && npx next start -p 3245 -H 127.0.0.1 &

# 2. Capture scenes (all, or by name). Frames, marks and pointer events go to $VT_RAW/<scene>/frames.json,
#    assertions to $VT_RAW/capture-report.json. Scenes that share a profile build on each other; run them in order.
VT_PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs VT_BASE_URL=http://127.0.0.1:3245 \
  VT_REV=$(git rev-parse HEAD) VT_RAW=/tmp/vt-guide/raw VT_PROFILES=/tmp/vt-guide/profiles \
  node scripts/feature-guide/capture.mjs [scene ...]

# 3. Render clips and posters (all, or --only <id> ...), then check them
python3 -I scripts/feature-guide/render_clips.py --raw /tmp/vt-guide/raw --ffmpeg ffmpeg --jobs 6 [--only jst]
python3 -I scripts/feature-guide/render_clips.py --raw /tmp/vt-guide/raw --sheets /tmp/vt-guide/review   # 1 frame/s review sheets
npx vitest run tests/featureGuide.test.ts
```

Update `source.revision` in `clips.json` when you record from a newer revision. Review the sheets for loading
flashes, error notices or blank pages before committing; leave such a moment out with a `cut` span rather than
re-timing the rest. Keep each clip to one action and its result, held for a couple of seconds at the end.
