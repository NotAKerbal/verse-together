# Verse Together app privacy policy (DRAFT, not published)

> **Status: draft for the owner to review, complete and publish.** It is not legal advice and makes no claim of
> compliance with any law. Before publishing it at a public URL (Play requires one), the owner must fill in the
> bracketed items, confirm the hosting facts marked "to confirm", and check it against the app being released.
> Facts below come from a review of the app's code for version 1.0.3 (see `data-safety-draft.md`).

**Effective date:** [date of publication]
**Who we are:** Verse Together. Contact: isaachcochran@gmail.com. Website: https://www.versetogether.org

This policy covers the Verse Together app for Android and iOS. The Verse Together website, which has its own
sign-in, is covered by [the website's policy, if any].

## The short version

- The app has no account, no sign-in, no ads, no analytics and no tracking.
- Your journal, marks, notes, goals and settings are stored on your device. The app doesn't send them to us or
  anyone else.
- Some optional online tools send the word or verses you chose to a server so it can answer. They are only used
  when you open them.

## What stays on your device

Your study (journal entries, highlights and underlines, notes, reading log, weekly goals, quick-mark presets and
reader settings) is saved in the app's private storage on your device. The scriptures and the Come, Follow Me
guides are included in the app, so reading them sends nothing over the internet. Settings > delete this
device's study removes it; uninstalling the app also removes it.

**Device backups (Android).** The app allows Android's standard app-data backup. If you have turned on backup
for your device, Android may include the app's data, including your study, in your device backup in your Google
account, and may copy it to a new phone during setup. This is done by Android under your Google account's
settings; we don't receive or have access to those backups. You can turn backup off in your device's settings.
[iOS: the app's data may likewise be included in your iCloud or computer backups, under your Apple account's
settings.]

## What is sent when you use online tools

These run only when you choose them, and need an internet connection:

| When you | The app sends | To |
| --- | --- | --- |
| Explore a selected word | the word (in the web address of the request) | www.versetogether.org, which looks it up with the Free Dictionary API (dictionaryapi.dev), Wiktionary (en.wiktionary.org) and, when the site has a key for it, Merriam-Webster (dictionaryapi.com) |
| Open a Bible Dictionary, Guide to the Scriptures or Topical Guide entry in Explore | the entry's name | www.versetogether.org, which fetches the entry from churchofjesuschrist.org |
| Open Translations for Bible verses | which translation, book and chapter (and the list of translations) | bible.helloao.org (HelloAO Bible API), directly from the app |

These requests don't include your journal, marks, notes or any account or device identifier. Like any internet
request, they reach the server with your device's IP address and basic technical information (such as the
app's network library user agent). [To confirm: whether and for how long www.versetogether.org's hosting
provider keeps request logs, which would include the looked-up word and IP address.] We don't control the
privacy practices of HelloAO or the dictionary and study-help services; see their own policies.

**Sharing and links.** When you choose Share, the words you selected, their reference and a
versetogether.org link go to the app you pick in your device's share sheet. Links to websites open in your
browser.

## What we don't do

We don't sell personal information, show ads, build profiles, or use analytics or crash-reporting services in
the app. The app asks for no access to your contacts, photos, files, microphone, camera or location.

## Children

The app is not directed at children under 13 and has no accounts. The owner selected ages 13 and up in Play Console.

## Changes and contact

If this policy changes, we'll update it here with a new effective date. Questions: isaachcochran@gmail.com.

## Additions for the release with Google sign-in (draft; not in 1.0.3)

Replace "The app has no account, no sign-in" in the short version, and add a section like this, when a build with
sign-in is released. Check it against that build first.

> **Signing in (optional).** You can sign in with Google, using the same Verse Together account as the website.
> Signing in sends you to Google in a browser tab; Google tells us your name, email address, profile picture
> and Google account id, which we keep as your account. We record each sign-in session (with your device's IP
> address and app or browser version) to keep you signed in and to limit abuse. The app keeps its sign-in on your
> device in the system's secure storage. Signing out removes it from the device.
>
> **Copying your study to your account.** Your study stays on your device when you sign in. Only if you choose
> "Copy to my account" are this device's journal entries, notes and marks uploaded to your account, where you can
> see them on the website. They stay on your device too.
>
> **Deleting your account.** In the app: Settings > Account > Delete my account. This permanently deletes your
> account and everything saved in it on our servers. Study saved only on your device is not affected; delete it
> separately in Settings or by uninstalling. Without the app: sign in at
> https://www.versetogether.org/delete-account and confirm. [Draft: that page is in the code but not deployed yet;
> check it loads before publishing this.]
