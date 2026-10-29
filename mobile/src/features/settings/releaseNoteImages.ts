/* eslint-disable @typescript-eslint/no-require-imports -- Metro requires literal require calls for bundled native images. */
// The website release notes' screenshots (src/lib/releaseNotes.ts names them by their path under public/), as
// bundled native assets. Metro needs each require written out: a screenshot added to the release notes is added here
// too (__tests__/settingsParity.test.tsx checks that every one is). One missing shows its caption without the image.

export const RELEASE_NOTE_IMAGES: Record<string, number> = {
  "/release-notes/2.1.0-browse.webp": require("../../../../public/release-notes/2.1.0-browse.webp"),
  "/release-notes/2.2.0-book-artwork.webp": require("../../../../public/release-notes/2.2.0-book-artwork.webp"),
  "/release-notes/2.4.0-journal-home.webp": require("../../../../public/release-notes/2.4.0-journal-home.webp"),
  "/release-notes/2.5.0-quick-marks.webp": require("../../../../public/release-notes/2.5.0-quick-marks.webp"),
  "/release-notes/2.6.0-scripture-first.webp": require("../../../../public/release-notes/2.6.0-scripture-first.webp"),
  "/release-notes/2.8.0-lesson-artwork.webp": require("../../../../public/release-notes/2.8.0-lesson-artwork.webp"),
  "/release-notes/2.9.0-jst.webp": require("../../../../public/release-notes/2.9.0-jst.webp"),
  "/release-notes/2.10.0-explore.webp": require("../../../../public/release-notes/2.10.0-explore.webp"),
  "/release-notes/2.10.0-quick-mark-colors.webp": require("../../../../public/release-notes/2.10.0-quick-mark-colors.webp"),
  "/release-notes/2.10.0-translations.webp": require("../../../../public/release-notes/2.10.0-translations.webp"),
  "/release-notes/2.12.0-reader-settings.webp": require("../../../../public/release-notes/2.12.0-reader-settings.webp"),
  "/release-notes/2.12.0-settings-header.webp": require("../../../../public/release-notes/2.12.0-settings-header.webp"),
  "/release-notes/2.13.0-faith-tradition.webp": require("../../../../public/release-notes/2.13.0-faith-tradition.webp"),
  "/release-notes/2.13.0-feedback.webp": require("../../../../public/release-notes/2.13.0-feedback.webp"),
  "/release-notes/2.13.0-translations.webp": require("../../../../public/release-notes/2.13.0-translations.webp"),
  "/release-notes/2.15.0-journal.webp": require("../../../../public/release-notes/2.15.0-journal.webp"),
  "/release-notes/2.15.0-lesson-explore.webp": require("../../../../public/release-notes/2.15.0-lesson-explore.webp"),
  "/release-notes/2.15.0-next-chapter.webp": require("../../../../public/release-notes/2.15.0-next-chapter.webp"),
  "/release-notes/2.16.0-lesson-explore.webp": require("../../../../public/release-notes/2.16.0-lesson-explore.webp"),
};
