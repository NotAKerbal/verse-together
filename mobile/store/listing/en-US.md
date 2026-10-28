# Google Play store listing (en-US), draft

Every claim here describes what version 1.0.3 does. Before changing it, check the app (see `mobile/README.md`,
"What it does" and "Not in the app yet"). No accounts, sync, AI features or automatic guide updates are claimed.

## App details

| Field | Value |
| --- | --- |
| App name (max 30) | Verse Together |
| Default language | English (United States), en-US |
| App or game | App |
| Free or paid | Free |
| Category | Books & Reference |
| Contains ads | No (the app has no ad SDK or ads) |
| In-app purchases | None |
| Website | https://www.versetogether.org |
| Support email | isaachcochran@gmail.com |
| Phone | Optional; none given |
| Privacy policy URL | **Not yet published.** Being added to versetogether.org; draft: `store/privacy/privacy-policy-draft.md` |

Tags to consider in Play Console (pick from Google's list): Books & Reference, Religion, Reading.

## Short description (max 80 characters)

```
Read the standard works offline, mark exact words, and keep a study journal.
```

76 characters.

## Full description (max 4000 characters)

```
Verse Together is a quiet place to study the scriptures: read the standard works, mark the exact words that stand out, and keep your thoughts in a journal on your phone.

READ OFFLINE
• The Old Testament, New Testament, Book of Mormon, Doctrine and Covenants, and Pearl of Great Price are built into the app, so reading works without an internet connection.
• Browse by volume, book and chapter, swipe between chapters, and jump straight to a verse.
• Adjust text size, serif or sans-serif type, and text width, or switch to a simple reading mode. Light and dark themes follow your system.

MARK EXACT WORDS
• Long-press to select a word, then drag the handles to select an exact phrase, even across verses.
• Highlight or underline just those words in the colors you choose, save quick-mark presets, and add notes to verses.
• Copy or share the words you selected, with their reference.

KEEP A STUDY JOURNAL
• Write entries in Markdown with a preview, link them to the chapter or verses you read, and find them again with full-text search.
• See your study days on a month calendar, set weekly goals, and look back at a thought worth revisiting.
• Your journal, marks, notes and settings are stored on your device. There is no account and nothing is synced.

COME, FOLLOW ME
• The 2026 Come, Follow Me schedule with this week's reading.
• Study guides published on versetogether.org are included with the app: introductions, every assigned verse with context and commentary, cross-references and sources. The guides are written by Claude Opus 5.5, an AI model made by Anthropic, and reviewed by Verse Together before they are published; each guide credits its author. New guides arrive with app updates.

SEARCH
• Go to a reference such as "Alma 32" or "1 Ne 3:7", or search for a phrase across the scriptures, filtered by volume.

OPTIONAL ONLINE TOOLS
When you are online and choose to use them:
• Explore a selected word: dictionary definitions and etymology, plus matching Bible Dictionary, Guide to the Scriptures and Topical Guide entries.
• Compare the selected Bible verses in other translations, from the free HelloAO Bible API.

Verse Together is an independent study app. It is not made, sponsored or endorsed by The Church of Jesus Christ of Latter-day Saints.
```

2,274 characters. Run the length check in `store/RELEASE.md` after editing.

## Release notes for 1.0.3 (versionCode 4), max 500 characters

```
First Google Play release. Read the standard works offline, select and mark exact words, keep a journal on your device, and study the published Come, Follow Me guides.
```

## Claims to keep out unless the app changes

- Sign-in, accounts, sync or backup to Verse Together (none; Android's own device backup is described in the
  privacy policy draft).
- AI features (the app has none; the guides are static, bundled text with their author credited).
- Guides updating by themselves (they come with app updates only).
- "Official", or any wording or imagery implying the Church made or approved the app.
- Device features the app hasn't been verified on (see "Verification limits" in `mobile/README.md`).

## For the release with Google sign-in (draft; not 1.0.3)

The listing above stays correct for 1.0.3. If a build with sign-in is released, the line "There is no account and
nothing is synced" must change. Truthful wording for that build, for example:

```
• Optionally sign in with Google, using your Verse Together website account, to copy this device's journal and marks to your account or to delete your account. Your study stays on your device, and reading works offline without an account.
```

Still keep out: "sync", "backup", or anything saying account study appears in the app. The app doesn't read the
account's study yet (see `mobile/README.md`, "Not in the app yet").
