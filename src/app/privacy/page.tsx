import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Privacy policy · Verse Together",
  description: "How the Verse Together website and app for Android and iOS handle your information.",
};

/*
  The public privacy policy for the website and the Android and iOS app, linked from Google Play. Keep it true to
  the code: when what the site or app collects, stores or sends changes, update this page and LAST_UPDATED.
*/
const LAST_UPDATED = { iso: "2026-10-27", label: "October 27, 2026" };
const CONTACT_EMAIL = "isaachcochran@gmail.com";

function ContactLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

export default function PrivacyPage() {
  return (
    <article className={`page-shell ${styles.policy}`}>
      <header className="page-hero space-y-3">
        <div className="page-eyebrow">Verse Together</div>
        <h1 className="page-title">Privacy policy</h1>
        <p className="page-subtitle">How the Verse Together website and app handle your information.</p>
        <p className={styles.updated}>
          Last updated <time dateTime={LAST_UPDATED.iso}>{LAST_UPDATED.label}</time>
        </p>
      </header>

      <div className={styles.body}>
        <p>
          This policy covers the Verse Together website at <a href="https://www.versetogether.org">www.versetogether.org</a>{" "}
          and the Verse Together app for Android and iOS. In it, &ldquo;we&rdquo; means Verse Together. If you have a
          question about your information, write to <ContactLink />.
        </p>

        <section className={styles.section} aria-labelledby="short-version">
          <h2 id="short-version">The short version</h2>
          <ul>
            <li>
              Verse Together shows no ads and uses no analytics, advertising or tracking services, on the website or in
              the app. We don&apos;t sell your information.
            </li>
            <li>
              On the website an account is optional. If you sign in with Google, the study you save (notes, journal,
              highlights, reading plans) is kept with your account so it&apos;s there on any device.
            </li>
            <li>The app has no account. Your study is saved on your device and the app doesn&apos;t send it to us.</li>
            <li>
              Some study tools look up a word, topic or chapter for you. They send what you looked up, never your
              notes or journal.
            </li>
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="website">
          <h2 id="website">The website</h2>

          <h3>Without an account</h3>
          <p>
            You can read the scriptures and use the study tools without signing in, and the site doesn&apos;t ask for
            your name or email to do so. Your browser keeps a few things on your device so the site works the way you
            left it: reader choices such as simple mode, your faith tradition and panel layout (in your browser&apos;s
            local storage), a copy of the scripture text so chapters open quickly (in IndexedDB), and a cookie that
            tells the site your default Bible. They aren&apos;t used to track you. Clearing this site&apos;s data in your
            browser removes them.
          </p>

          <h3>Signing in with Google</h3>
          <p>
            Accounts use Google sign-in. When you continue with Google, Google tells us your name, email address and
            profile picture, and we create your account from them. For your account we keep:
          </p>
          <ul>
            <li>your name (you can change it in Settings), email address and a link to your Google profile picture;</li>
            <li>the connection to your Google account, including the sign-in tokens Google issues for it;</li>
            <li>
              your signed-in sessions. Each records the device&apos;s IP address and browser type, so Settings can list
              your signed-in devices and so we can slow down repeated sign-in attempts.
            </li>
          </ul>
          <p>
            Signing in sets cookies that keep you signed in. They&apos;re needed for your account and aren&apos;t used
            for anything else. To slow down repeated sign-in attempts we also keep short-lived counters keyed by a
            scrambled (hashed) form of your IP address.
          </p>

          <h3>What your account saves</h3>
          <p>
            When you&apos;re signed in, what you create is saved to your account: journal entries and notes, their
            folders and tags, highlights, underlines and notes on verses and in Come, Follow Me guides, your reading
            log, the chapters you&apos;ve marked read and where you stopped reading, reading plans and goals, reader
            settings and mark presets, and podcast episodes you&apos;ve marked as watched.
          </p>
          <p>
            Your study is private to your account. If you choose to publish or share a note, the note and your name
            are visible to the people the visibility you pick allows, for example anyone with its link.
          </p>
          <p>
            If you send feedback, we keep your message, any contact details you add, the page you sent it from and,
            if you&apos;re signed in, which account sent it.
          </p>

          <h3>Where it&apos;s kept</h3>
          <p>
            Accounts and saved study are stored with <a href="https://www.convex.dev">Convex</a>, the database
            service the site runs on; your browser connects to it directly while you use the site. The site is hosted
            by <a href="https://vercel.com">Vercel</a>.
          </p>

          <h3>Study tools that use other services</h3>
          <p>
            Some tools need information from another service. Our server asks for it on your behalf, so the other
            service receives the request from our server rather than from your browser, and the request carries only
            what&apos;s needed to answer it, never your account, notes or journal.
          </p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">When you</th>
                  <th scope="col">What&apos;s sent</th>
                  <th scope="col">To</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Look up a word</td>
                  <td>the word</td>
                  <td>
                    Free Dictionary API (dictionaryapi.dev), Wiktionary, Webster&apos;s 1828 dictionary
                    (webstersdictionary1828.com) and, when the site is set up for it, Merriam-Webster
                  </td>
                </tr>
                <tr>
                  <td>Open a Bible Dictionary, Guide to the Scriptures or Topical Guide entry</td>
                  <td>the entry&apos;s name</td>
                  <td>churchofjesuschrist.org</td>
                </tr>
                <tr>
                  <td>Read a Bible translation or Joseph Smith Translation passage</td>
                  <td>the translation, book and chapter</td>
                  <td>HelloAO Bible API (bible.helloao.org), bible-api.com or Open Scripture API (openscriptureapi.org)</td>
                </tr>
                <tr>
                  <td>See talks that cite a verse</td>
                  <td>the scripture reference or talk</td>
                  <td>Scripture Citation Index (scriptures.byu.edu)</td>
                </tr>
                <tr>
                  <td>Open a chapter&apos;s study paths</td>
                  <td>
                    nothing about you. They were written in advance with OpenAI from the chapter&apos;s text. If a chapter
                    has none yet and you&apos;re signed in, its reference and text are sent to OpenAI to write them.
                  </td>
                  <td>OpenAI</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            The podcast feed lists episodes the site gets from Spotify, and their artwork loads in your browser from
            Spotify&apos;s servers. Your Google profile picture loads from Google&apos;s servers. Links to other sites,
            such as Bible Hub or churchofjesuschrist.org, open those sites under their own privacy policies.
          </p>

          <h3>Hosting logs</h3>
          <p>
            Like most hosts, Vercel records the requests it serves: the address requested (including anything in it,
            such as a word you looked up), the time, your browser type and your IP address. Vercel&apos;s documentation
            says these logs are kept for between one hour and 30 days, depending on the hosting plan. Convex, which
            runs the site&apos;s database, keeps its own operational logs. We use logs only to keep the site running
            and fix problems. See <a href="https://vercel.com/legal/privacy-policy">Vercel&apos;s privacy notice</a>{" "}
            and <a href="https://www.convex.dev/legal/privacy">Convex&apos;s privacy policy</a> for how they handle
            them.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="app">
          <h2 id="app">The app for Android and iOS</h2>
          <p>
            The app has no account or sign-in, no ads, and no analytics, crash-reporting or tracking services. It
            asks for no access to your contacts, photos, files, microphone, camera or location, and it doesn&apos;t
            read advertising or device identifiers.
          </p>

          <h3>What stays on your device</h3>
          <p>
            Your study (journal entries, highlights and underlines, notes, reading log, weekly goals, quick-mark
            presets and reader settings) is saved in the app&apos;s private storage on your device. The app doesn&apos;t
            send it to us or anyone else. The scriptures and Come, Follow Me guides are included in the app, so
            reading them sends nothing over the internet.
          </p>
          <p>
            <strong>Device backups.</strong> On Android, if backup is turned on for your device, Android may include
            the app&apos;s data, including your study, in your device backup in your Google account, and may copy it to
            a new phone when you set one up. On iPhone, the app&apos;s data may likewise be included in your iCloud or
            computer backups. These backups are made by your device under your Google or Apple account settings; we
            don&apos;t receive them or have access to them. You can turn backup off in your device&apos;s settings.
          </p>

          <h3>What&apos;s sent when you use online tools</h3>
          <p>These run only when you open them, and need an internet connection:</p>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">When you</th>
                  <th scope="col">The app sends</th>
                  <th scope="col">To</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Explore a selected word</td>
                  <td>the word</td>
                  <td>
                    www.versetogether.org, which looks it up as described for the website above (Free Dictionary API,
                    Wiktionary and, when set up, Merriam-Webster)
                  </td>
                </tr>
                <tr>
                  <td>Open a Bible Dictionary, Guide to the Scriptures or Topical Guide entry in Explore</td>
                  <td>the entry&apos;s name</td>
                  <td>www.versetogether.org, which fetches the entry from churchofjesuschrist.org</td>
                </tr>
                <tr>
                  <td>Open Translations for Bible verses</td>
                  <td>the translation, book and chapter (and asks for the list of translations)</td>
                  <td>HelloAO Bible API (bible.helloao.org), directly from the app</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            These requests don&apos;t include your journal, marks, notes or any account or device identifier. Like any
            internet request, they reach the server with your device&apos;s IP address and basic technical details
            such as the app&apos;s network library. Requests to www.versetogether.org are recorded in the hosting logs
            described above. HelloAO and the dictionary and study-help services have their own privacy policies.
          </p>
          <p>
            <strong>Sharing.</strong> When you choose Share, the words you selected, their reference and a
            versetogether.org link go to the app you pick in your device&apos;s share sheet. Links to websites open in
            your browser.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="sharing">
          <h2 id="sharing">Who receives your information</h2>
          <p>
            We don&apos;t sell or rent your information, share it for advertising, or build profiles of you. Besides
            the people you choose to share a note with, information goes only to the services described above, so they
            can do their part: Google for sign-in, Convex for storage, Vercel for hosting, OpenAI for writing chapter
            study paths from scripture text, and the public scripture and dictionary services for lookups. We may also
            disclose information if the law requires it.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="deleting">
          <h2 id="deleting">Deleting your data</h2>
          <h3>Website</h3>
          <p>
            Your account and the study saved in it are kept until you delete them. You can delete notes and journal
            entries, highlights and other marks, folders and reading plans in the site at any time. The site
            doesn&apos;t yet have a button to delete your whole account: to delete it, email <ContactLink /> from the
            address you sign in with, and we&apos;ll delete your account and the study saved in it. You can also ask us
            to delete feedback you&apos;ve sent.
          </p>
          <p>
            Signing out removes the sign-in cookies from your browser, and Settings &gt; Account &gt; Sign out other
            devices ends your other sessions. Clearing this site&apos;s data in your browser removes the preferences and
            scripture copy kept there. Hosting logs expire on their own schedule, described above.
          </p>
          <h3>App</h3>
          <p>
            In the app, Settings &gt; delete this device&apos;s study removes your study from the device. Uninstalling
            the app removes it too. Copies in your device backups are managed in your Google or Apple account
            settings.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="security">
          <h2 id="security">Security</h2>
          <p>
            The website and the app use encrypted connections (HTTPS) for every request they make. No system is
            perfectly secure, but we take care to keep your information safe and to collect only what Verse Together
            needs to work.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="children">
          <h2 id="children">Children</h2>
          <p>
            Verse Together isn&apos;t directed at children under 13, and we don&apos;t knowingly collect personal
            information from them. If you believe a child under 13 has created an account, contact us and we&apos;ll
            delete it.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="changes">
          <h2 id="changes">Changes and contact</h2>
          <p>
            If this policy changes, we&apos;ll update this page and its date. Questions or requests:{" "}
            <ContactLink />.
          </p>
        </section>

        <p className={styles.backLink}>
          <Link href="/">Back to Verse Together</Link>
        </p>
      </div>
    </article>
  );
}
