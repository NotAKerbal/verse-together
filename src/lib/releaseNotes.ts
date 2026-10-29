export type ReleaseNoteKind = "new" | "improved";

export type ReleaseScreenshot = {
  /** A file under public/, e.g. /release-notes/2.10.0-explore.webp. */
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  /**
   * The screenshot was taken after this release, from the interface of the day. Set it on any screenshot
   * captured later than the release it illustrates, so it's never mistaken for how things looked then.
   */
  currentInterface?: boolean;
};

export type ReleaseNoteItem = {
  kind: ReleaseNoteKind;
  text: string;
  screenshot?: ReleaseScreenshot;
};

export type Release = {
  version: string;
  /** The day the release reached master (the release merge's commit date), YYYY-MM-DD. */
  date: string;
  /** For a release gathering earlier work on master, the day that work began. */
  since?: string;
  title: string;
  items: ReleaseNoteItem[];
  /** The master commit that made this release; omitted until a prepared release is merged. */
  masterCommit?: string;
  /** Short hashes of the commits the notes describe. Not shown. */
  commits: string[];
};

export type UnreleasedNotes = {
  title: string;
  items: ReleaseNoteItem[];
};

/** Changes waiting for the next dev-to-master release. Empty items when there are none. */
export const UNRELEASED: UnreleasedNotes = {
  title: "Upcoming changes",
  items: [
    { kind: "improved", text: "Settings tabs slide smoothly between sections, matching the main navigation and respecting reduced motion." },
    { kind: "improved", text: "The Rust desktop app adds the website's menu beside selected words, named and reorderable quick marks with any style or color, grouped lesson contents, a centered Bibles dialog, links to All settings and the privacy policy, and a compact layout for small windows." },
  ],
};

export const RELEASES: readonly Release[] = [
  {
    version: "2.17.0",
    date: "2026-10-28",
    title: "Mobile testing and account recovery",
    items: [
      {
        kind: "new",
        text: "Volunteer for Android app testing or join the iOS waiting list through a shared signup link.",
        screenshot: {
          src: "/release-notes/2.17.0-tester-signup.webp",
          width: 1292,
          height: 1176,
          alt: "The mobile testing signup form with Android and iOS choices, empty name and email fields, and email consent.",
          caption: "Join Android testing or the iOS waiting list without an account.",
        },
      },
      { kind: "improved", text: "Account settings asks you to sign in again when your session is too old to load devices, and shows progress when retrying sign-in methods and sessions." },
      { kind: "improved", text: "The privacy policy link stays at the bottom of Settings on short pages and follows the content on longer pages." },
    ],
    commits: ["202964b", "ea79c3a", "b6075c8"],
  },
  {
    version: "2.16.0",
    date: "2026-10-28",
    title: "Explore beside the lesson scripture",
    items: [
      {
        kind: "improved",
        text: "In Come, Follow Me lessons, Explore sits beside the scripture instead of at the far edge of the window.",
        screenshot: {
          src: "/release-notes/2.16.0-lesson-explore.webp",
          width: 1600,
          height: 1247,
          alt: "The Come, Follow Me lesson beside an Explore panel for knew, positioned next to the scripture column.",
          caption: "Explore stays beside the lesson’s scripture column.",
        },
      },
    ],
    masterCommit: "c964037",
    commits: ["a8be363"],
  },
  {
    version: "2.15.0",
    date: "2026-10-28",
    title: "Desktop sync, reading and word exploration",
    items: [
      { kind: "new", text: "Approve the native desktop app in your browser to connect your account and sync study data." },
      {
        kind: "improved",
        text: "On desktop, move between chapters with the Left and Right arrow keys, or use the next-chapter link below the verses.",
        screenshot: {
          src: "/release-notes/2.15.0-next-chapter.webp",
          width: 1600,
          height: 410,
          alt: "The last verse of 1 Nephi 1 with a Next chapter link below it on desktop.",
          caption: "Continue reading with the next-chapter link below the verses.",
        },
      },
      {
        kind: "improved",
        text: "Scripture and the Journal panel sit together in a centered layout. Log starts with reading only; choose Add a note to expand the full Markdown editor in the same panel.",
        screenshot: {
          src: "/release-notes/2.15.0-journal.webp",
          width: 1600,
          height: 761,
          alt: "1 Nephi 1 beside the Journal panel, showing a reading chip, Add a note, a day field and Log reading.",
          caption: "Log reading or start a note in the Journal beside the chapter.",
        },
      },
      {
        kind: "new",
        text: "Select a word anywhere in Come, Follow Me to explore study helps, biblical languages, definitions, and word history in a sidebar beside the lesson.",
        screenshot: {
          src: "/release-notes/2.15.0-lesson-explore.webp",
          width: 1600,
          height: 1153,
          alt: "The Come, Follow Me lesson Before I Formed Thee in the Belly I Knew Thee beside an Explore sidebar for knew, with a Topical Guide study help.",
          caption: "Explore a word selected in the lesson title.",
        },
      },
    ],
    masterCommit: "17ec108",
    commits: ["daec09e", "f11c790", "ca2d0cd", "7d21571"],
  },
  {
    version: "2.14.0",
    date: "2026-10-28",
    title: "Account control and desktop Bibles",
    items: [
    { kind: "improved", text: "Adding a Bible on desktop now opens in a centered panel with search and language controls beside the results, plus a language grid for easier browsing." },
    {
      kind: "new",
      text: "A privacy policy at versetogether.org/privacy explains what the website and the app keep, what they send to other services, and how to delete your data. It's linked from Settings and the sign-in page.",
    },
    {
      kind: "new",
      text: "Delete your account and all the study saved in it from Settings → Account, or at versetogether.org/delete-account. You confirm before anything is deleted, and a deletion that stops partway can be finished later.",
    },
    ],
    masterCommit: "1647d51",
    commits: ["02b3e19", "b20083f", "1ffbafd", "1ab52f4", "0b0b8ef", "3eb0a87"],
  },
  {
    version: "2.13.0",
    date: "2026-10-27",
    title: "Your Bibles, feedback and faith tradition",
    items: [
      {
        kind: "new",
        text: "Manage saved Bibles in Settings → Translations and make any saved translation your default Bible for chapter reading. Your choice is saved on this device; removing the default restores the King James Bible.",
        screenshot: {
          src: "/release-notes/2.13.0-translations.webp",
          width: 1600,
          height: 541,
          alt: "Bible translations settings showing Your Bibles, the King James Bible marked Default, and the Add Bible button.",
          caption: "Manage your Bibles and choose the default in Translations.",
        },
      },
      {
        kind: "new",
        text: "Send suggestions, report problems or request features in Settings → Feedback, with no sign-in required. Leave optional contact details if you would like a reply. If sending fails, your message stays in the form so you can try again.",
        screenshot: {
          src: "/release-notes/2.13.0-feedback.webp",
          width: 1600,
          height: 743,
          alt: "The signed-out Feedback section with an empty feedback message, optional contact field and Send feedback button.",
          caption: "Send feedback without signing in, with optional contact details.",
        },
      },
      {
        kind: "new",
        text: "Choose your faith tradition in Settings → Reading. Other denominations keeps Bible reading and your journal while hiding Latter-day Saint scriptures, Come Follow Me, Joseph Smith Translation and study resources. Your choice is saved on this device.",
        screenshot: {
          src: "/release-notes/2.13.0-faith-tradition.webp",
          width: 1270,
          height: 534,
          alt: "Faith tradition settings with Church of Jesus Christ of Latter-day Saints selected and an Other denominations option.",
          caption: "Choose which faith tradition’s content appears on this device.",
        },
      },
    ],
    masterCommit: "2929d8a",
    commits: ["f7db30f", "04b2637", "9592336"],
  },
  {
    version: "2.12.0",
    date: "2026-10-27",
    title: "Unified settings and illustrated release history",
    items: [
      {
        kind: "improved",
        text: "Settings shows one section at a time: your account, reading, study tools or these release notes. Choose one from the pill at the right of the app's header, beside the navigation; on phones and tablets, and in simple mode, the pill sits at the top of the page.",
        screenshot: {
          src: "/release-notes/2.12.0-settings-header.webp",
          width: 1600,
          height: 973,
          alt: "The Settings page. The app's navigation is at the top left and, at the top right of the same header, a pill with Account, Reading, Study tools and Release notes, Reading selected. Below, the Reading section spans the page: a John 1:1–3 preview beside text size, typeface, text width and comparison view controls, with simple mode below.",
          caption: "Settings' sections in the header, with Reading open.",
        },
      },
      {
        kind: "new",
        text: "Set text size, typeface, text width and comparison view in Settings with a live preview, or reset them. The reader's settings menu has the same controls.",
        screenshot: {
          src: "/release-notes/2.12.0-reader-settings.webp",
          width: 816,
          height: 1034,
          alt: "The reader's settings menu open over 1 Nephi 1, with simple mode, text size, typeface, text width, comparison view and a link to all settings.",
          caption: "The same appearance controls in the reader's settings menu.",
        },
      },
      { kind: "new", text: "Release notes show each release's version, with screenshots of what changed." },
    ],
    masterCommit: "e643719",
    commits: ["848fb3d", "4f24599"],
  },
  {
    version: "2.11.0",
    date: "2026-10-27",
    title: "Clearer note links and scripture quotes",
    items: [
      {
        kind: "improved",
        text: "In the reader, a note appears once, as a small Note link at the start of each passage it links to. The passage you were reading when you wrote it no longer counts as a link.",
      },
      { kind: "improved", text: "Verses quoted together in a note are separated by a blank line." },
    ],
    masterCommit: "163cc73",
    commits: ["4a93b63", "c92b364"],
  },
  {
    version: "2.10.0",
    date: "2026-10-27",
    title: "Simpler translations, Explore sections and custom mark colors",
    items: [
      {
        kind: "improved",
        text: "Choosing a Bible translation is simpler, and translations in other languages are easier to find.",
        screenshot: {
          src: "/release-notes/2.10.0-translations.webp",
          width: 1264,
          height: 1126,
          alt: "The Add a Bible screen in the reader: a search field, the language (English) with a Change option, suggested English Bibles each with an Add button, and a link to browse all English Bibles.",
          caption: "Adding a Bible from the reader's settings.",
          currentInterface: true,
        },
      },
      {
        kind: "improved",
        text: "Explore groups study sources into colored, expandable sections and leaves out sections with nothing in them.",
        screenshot: {
          src: "/release-notes/2.10.0-explore.webp",
          width: 1600,
          height: 743,
          alt: "Explore open for the word “commandments” in 1 Nephi 3:7, with a green Study helps section (Bible Dictionary, Guide to the Scriptures, Topical Guide) and a blue Biblical languages section (Hebrew and Greek), beside the chapter with the word selected.",
          caption: "Explore's colored source sections.",
          currentInterface: true,
        },
      },
      {
        kind: "new",
        text: "Pick custom colors for highlights and underlines in quick marks, and preview each mark.",
        screenshot: {
          src: "/release-notes/2.10.0-quick-mark-colors.webp",
          width: 1600,
          height: 567,
          alt: "Quick mark settings: the first preset uses a custom orange color, shown in its preview and its Custom button, above blue and green highlight presets with their color choices.",
          caption: "Quick marks with color previews, now in the Study tools tab.",
          currentInterface: true,
        },
      },
      { kind: "improved", text: "The Joseph Smith Translation reads more simply inline in the Bible." },
    ],
    masterCommit: "54fb2ab",
    commits: ["a7a4e9a", "dd444dd", "ca09d71", "86634f9"],
  },
  {
    version: "2.9.0",
    date: "2026-10-27",
    title: "Joseph Smith Translation, study helps and lesson notes",
    items: [
      {
        kind: "new",
        text: "Read the Joseph Smith Translation inline in the Bible reader.",
        screenshot: {
          src: "/release-notes/2.9.0-jst.webp",
          width: 1600,
          height: 637,
          alt: "Mark 9:42–45 in the Bible reader with the Joseph Smith Translation on: a small “JST 9:40–48” label, JST wording read in place with a dotted underline, and JST verse numbers in small type.",
          caption: "The Joseph Smith Translation inline in the Bible reader.",
          currentInterface: true,
        },
      },
      { kind: "new", text: "Explore adds scripture study helps and Hebrew and Greek definitions." },
      { kind: "new", text: "Preview scripture links from reader resources without leaving the chapter." },
      { kind: "new", text: "Share focused scripture pages." },
      { kind: "new", text: "Add lesson notes and save excerpts of selected text." },
      { kind: "improved", text: "Note backlinks include verse numbers." },
    ],
    masterCommit: "7026160",
    commits: ["68a7223", "aabd340", "7cb8fa9", "91268af", "17e9568", "de64abf"],
  },
  {
    version: "2.8.0",
    date: "2026-10-26",
    title: "Lesson artwork to the page edges",
    items: [
      {
        kind: "improved",
        text: "Come, Follow Me lesson artwork reaches the top and edges of the page.",
        screenshot: {
          src: "/release-notes/2.8.0-lesson-artwork.webp",
          width: 1600,
          height: 1075,
          alt: "The Come, Follow Me lesson for October 19–25, 2026, its painting of a potter's workshop filling the top of the page from edge to edge above the title “Before I Formed Thee in the Belly I Knew Thee”.",
          caption: "A lesson's artwork at the top of its page.",
          currentInterface: true,
        },
      },
    ],
    masterCommit: "68fbbe9",
    commits: ["ba7fb66"],
  },
  {
    version: "2.7.0",
    date: "2026-10-26",
    title: "A steadier reading width",
    items: [
      { kind: "improved", text: "Lesson context stays visible, with a consistent reading width." },
      { kind: "improved", text: "The default scripture reading column is narrower." },
    ],
    masterCommit: "1af9264",
    commits: ["df688d2", "58d65c9"],
  },
  {
    version: "2.6.0",
    date: "2026-10-26",
    title: "Scripture-first Come, Follow Me",
    items: [
      {
        kind: "improved",
        text: "Come, Follow Me lessons put the scriptures first, with expandable lesson context.",
        screenshot: {
          src: "/release-notes/2.6.0-scripture-first.webp",
          width: 1600,
          height: 1598,
          alt: "A Come, Follow Me lesson reading Jeremiah 1: the line “Read the scriptures. Open the context as you go.”, an opened Chapter context panel, then verses 1–3, then a closed Context for verses 1–3 panel.",
          caption: "Scriptures first in a Come, Follow Me lesson.",
          currentInterface: true,
        },
      },
      { kind: "new", text: "Annotate in both Come, Follow Me panes." },
      { kind: "improved", text: "Highlights keep the exact text you selected." },
      { kind: "improved", text: "Logged reading shows as a line in the margin." },
      { kind: "improved", text: "General settings work without signing in." },
    ],
    masterCommit: "1a975e5",
    commits: ["6f50717", "bfa1ce5", "cf17793", "4769b14", "f4cc271"],
  },
  {
    version: "2.5.0",
    date: "2026-10-26",
    title: "Inline verse marks",
    items: [
      {
        kind: "new",
        text: "Mark verses inline with quick marks at the top of the selection menu, and customize the presets.",
        screenshot: {
          src: "/release-notes/2.5.0-quick-marks.webp",
          width: 1600,
          height: 671,
          alt: "1 Nephi 3:7 selected in the reader, with the selection menu above it: a row of quick mark highlight and underline buttons at the top, then New Note, Annotate, Resources, Focus scripture and Copy text.",
          caption: "Quick marks in the selection menu.",
          currentInterface: true,
        },
      },
    ],
    masterCommit: "6faa5e4",
    commits: ["81d1f7e"],
  },
  {
    version: "2.4.0",
    date: "2026-10-25",
    title: "Journal and notes without an account",
    items: [
      { kind: "new", text: "Save notes and study without signing in." },
      {
        kind: "new",
        text: "The journal home page has weekly goals you can edit.",
        screenshot: {
          src: "/release-notes/2.4.0-journal-home.webp",
          width: 1600,
          height: 813,
          alt: "The journal home page without an account: a month calendar, weekly goals to study 5 days and write 3 reflections with an Edit goals link, and a reflection prompt for today.",
          caption: "The journal home page, without signing in.",
          currentInterface: true,
        },
      },
      { kind: "improved", text: "Notes render Markdown, in a more compact note panel." },
      { kind: "improved", text: "Verse resources load each Come, Follow Me lesson's complete insights." },
      { kind: "improved", text: "The Explore dictionary and etymology panel is more polished." },
    ],
    masterCommit: "f379baa",
    commits: ["e8e3b9f", "6130649", "d966f3e", "5be17c0", "d7d86a6", "b0b0707"],
  },
  {
    version: "2.3.0",
    date: "2026-10-25",
    title: "One journal on mobile and desktop",
    items: [
      { kind: "improved", text: "Journal notes and reading entries work the same on mobile and desktop, with notes beside Log on mobile." },
      { kind: "new", text: "Delete a note, with a confirmation first." },
      { kind: "improved", text: "Scripture selection tools are more polished, with direct links to a focused verse." },
      { kind: "improved", text: "The Come, Follow Me header has expanding icon controls." },
      { kind: "improved", text: "Account settings are simpler." },
      { kind: "new", text: "The October 26 Come, Follow Me guide, pairing scriptures from more than one book." },
    ],
    masterCommit: "4d68d54",
    commits: ["7abe450", "a481bce", "812ecc7", "5ee9132", "c29c96d", "4d7e404", "40601af", "ed29b66", "6e1ae94", "f5542b0"],
  },
  {
    version: "2.2.0",
    date: "2026-10-25",
    title: "Google sign-in and book artwork",
    items: [
      { kind: "new", text: "Sign in directly with Google." },
      {
        kind: "new",
        text: "Scripture books have artwork, colored by section.",
        screenshot: {
          src: "/release-notes/2.2.0-book-artwork.webp",
          width: 1600,
          height: 695,
          alt: "Book of Mormon books in Browse, each card with a painting: green-toned art for the small plates (1 Nephi to Omni) and warm orange art for Mormon's record (Words of Mormon to 4 Nephi).",
          caption: "Book artwork in Browse.",
          currentInterface: true,
        },
      },
      { kind: "improved", text: "Reading log and notes share one panel in the reader." },
      { kind: "improved", text: "A guide's Contents and Log stay in the header at every screen size." },
    ],
    masterCommit: "8bb840c",
    commits: ["b4b7191", "61ebef2", "10c1936", "c179eba", "e929412"],
  },
  {
    version: "2.1.0",
    date: "2026-10-24",
    title: "Floating navigation, faster browsing and the journal",
    items: [
      { kind: "new", text: "Keep journal notes and a reading history, linked from Come, Follow Me." },
      {
        kind: "improved",
        text: "Navigation is one collapsible floating bar, and Browse cards are illustrated with coordinated artwork.",
        screenshot: {
          src: "/release-notes/2.1.0-browse.webp",
          width: 1600,
          height: 779,
          alt: "The Browse page under the floating navigation bar and search field, with illustrated cards for this week's Come, Follow Me reading, the journal and each volume of scripture.",
          caption: "Floating navigation and illustrated Browse cards.",
          currentInterface: true,
        },
      },
      { kind: "improved", text: "Scripture browsing works from local data: chapters open at once and their text fades in." },
      { kind: "improved", text: "Search and page controls live in the floating header." },
      { kind: "improved", text: "Come, Follow Me opens at this week's lesson, with a cover card for each week." },
    ],
    masterCommit: "a977f5d",
    commits: ["d325f68", "c2d491d", "23a571c", "29d9721", "52be91e", "0065b4c", "01261ee", "37abbc0", "3e50145", "d2de70d", "9cbcae9"],
  },
  {
    version: "2.0.0",
    date: "2026-10-23",
    since: "2026-09-25",
    title: "Version 2: the Marker redesign",
    items: [
      { kind: "improved", text: "A new look throughout: a paper grid, ink borders, offset shadows and new typefaces." },
      { kind: "new", text: "Study plans, with reading progress in the reader and a plan builder." },
      { kind: "new", text: "Simple mode hides study tools so only the text remains." },
      { kind: "new", text: "Choose a text width for the reader, and share a passage by link." },
      { kind: "improved", text: "Notes moved to a Notebook panel in the reader and a three-column Notes page." },
      { kind: "new", text: "Study each Come, Follow Me lesson beside the scriptures it covers." },
      { kind: "improved", text: "Reader navigation is simpler, with chapter progress in the reader's settings." },
    ],
    masterCommit: "5f27da5",
    commits: ["d65680e", "c662a30", "27a4595", "d475a1d", "994cb4d", "721e165", "173c3fd", "a30c9bf", "fd5b0b5", "7cd297d"],
  },
];

/** The version master serves: the newest release. Matches package.json (npm run release:check). */
export const CURRENT_VERSION = RELEASES[0].version;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** "October 27, 2026": the same on the server and in every time zone. */
export function formatReleaseDate(date: string): string {
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}
