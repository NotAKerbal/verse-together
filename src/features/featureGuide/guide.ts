import guideMedia from "./guideMedia.json";

/*
  The feature guide (/feature-guide): every topic, its silent demo clips and the steps each clip shows, in reading
  order. Clips are real recordings of the app (scripts/feature-guide/README.md); guideMedia.json holds what the
  renderer measured for each one. When a feature changes, update its steps here and re-record its clip.
  Keep it true to the app: no feature that isn't on this branch, and nothing about single-verse notes or study
  plans, which are being retired.
*/

export const GUIDE_GROUPS = [
  { id: "read", title: "Read" },
  { id: "bibles", title: "Bibles and traditions" },
  { id: "study", title: "Mark and explore" },
  { id: "write", title: "Notes and Journal" },
  { id: "more", title: "Lessons, sharing and settings" },
] as const;

export type GuideGroupId = (typeof GUIDE_GROUPS)[number]["id"];

/** A clip's file name in public/feature-guide (without .mp4 / .webp), from scripts/feature-guide/clips.json. */
export type GuideClipId = keyof typeof guideMedia;

export type GuideClip = {
  id: GuideClipId;
  /** What the clip shows, as a short label: "Highlight a phrase". */
  title: string;
  /** The written equivalent of the clip, one action per step, using the app's own labels. */
  steps: readonly string[];
};

export type GuideSection = {
  /** The section's anchor (/feature-guide#bible-translations). Stable: people share these links. */
  id: string;
  group: GuideGroupId;
  title: string;
  summary: string;
  clips: readonly GuideClip[];
  /** Limits and details worth knowing, said plainly. */
  notes?: readonly string[];
  /** Latter-day Saint content: shown when Settings › Reading › Faith tradition is the Church of Jesus Christ. */
  latterDaySaint?: boolean;
  tryIt: { href: string; label: string };
  /** The topic's card in the index: one of its own clips' posters, enlarged around the part that shows the feature. */
  cover: GuideCover;
};

export type GuideCover = {
  clip: GuideClipId;
  /** The point of the poster to center on, as fractions of its width and height. */
  center: readonly [x: number, y: number];
  /** How far to enlarge the poster (1 shows all of it). */
  zoom: number;
};

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "browse",
    group: "read",
    title: "Find your place",
    summary: "Browse opens the library. Choose a volume, then a book, then a chapter, and the reader opens.",
    clips: [
      {
        id: "browse-library",
        title: "Open a chapter from the library",
        steps: [
          "Choose Browse in the top bar.",
          "Choose a volume, such as Book of Mormon.",
          "Choose a book, then a chapter number.",
        ],
      },
      {
        id: "browse-chapter-grid",
        title: "Jump to another chapter",
        steps: [
          "In the reader, choose the chapter name at the top (Alma 32).",
          "The book's chapters appear. Choose another one.",
        ],
      },
    ],
    notes: [
      "On a computer, the Left and Right arrow keys move to the previous and next chapter, and a Next chapter link waits at the end of each chapter.",
    ],
    cover: { clip: "browse-library", center: [0.74, 0.1], zoom: 2.6 },
    tryIt: { href: "/browse", label: "Open the library" },
  },
  {
    id: "search",
    group: "read",
    title: "Search by reference or phrase",
    summary: "One search box finds both: type a reference to go straight there, or a few words to find the verses that use them.",
    clips: [
      {
        id: "search-reference",
        title: "Go to a reference",
        steps: [
          "Choose the magnifying glass in the reader (or the search box in Browse).",
          "Type a reference, like Moroni 10:4.",
          "Press Enter. The chapter opens at that verse.",
        ],
      },
      {
        id: "search-phrase",
        title: "Find a phrase",
        steps: [
          "Type a few words, like nourish the word, and press Enter.",
          "Each chapter with matches is listed, with the matching words marked.",
          "Choose Open chapter to read the passage in context.",
        ],
      },
    ],
    notes: ["Phrase search uses the library stored in your browser, so it keeps working offline after the first visit."],
    cover: { clip: "search-phrase", center: [0.3, 0.5], zoom: 1.5 },
    tryIt: { href: "/search", label: "Open search" },
  },
  {
    id: "reading-comfort",
    group: "read",
    title: "Make reading comfortable",
    summary: "Set the text size, typeface and width you like, or switch to simple mode for nothing but the text.",
    clips: [
      {
        id: "reading-settings",
        title: "Change size, typeface and width",
        steps: [
          "In the reader, choose the gear (Reader settings).",
          "Drag Text size, and choose Serif or Sans.",
          "Choose a Text width: Comfortable, Wide or Full.",
          "Close the menu. Every chapter now reads this way.",
        ],
      },
      {
        id: "reading-simple-mode",
        title: "Read in simple mode",
        steps: [
          "Choose the eye in the reader's top bar to turn simple mode on.",
          "Study tools and navigation step aside, leaving the text.",
          "Choose Exit simple mode to bring them back.",
        ],
      },
    ],
    notes: ["These choices are saved on this device. Settings › Reading has the same controls, with a preview."],
    cover: { clip: "reading-simple-mode", center: [0.68, 0.8], zoom: 1.7 },
    tryIt: { href: "/account#reading", label: "Open Reading settings" },
  },
  {
    id: "bible-translations",
    group: "bibles",
    title: "Add Bibles and choose a default",
    summary:
      "Keep the Bibles you read in a short list. Your default Bible is the one Bible chapters open in; the others are ready to compare.",
    clips: [
      {
        id: "bibles-add",
        title: "Add a Bible",
        steps: [
          "Open Settings › Translations and choose + Add Bible.",
          "Find a Bible in the list and choose Add.",
          "It joins Your Bibles.",
        ],
      },
      {
        id: "bibles-language",
        title: "Add a Bible in another language",
        steps: [
          "In Add a Bible, choose Change language and type the language's name.",
          "Choose the language, then Add beside a Bible.",
          "Choose Done. Your Bibles now lists it.",
        ],
      },
      {
        id: "bibles-default",
        title: "Make a Bible your default",
        steps: [
          "In a Bible chapter, open Reader settings.",
          "Under Your Bibles, choose Make default beside a Bible.",
          "The chapter switches to that Bible, and so will every Bible chapter you open.",
        ],
      },
    ],
    notes: [
      "Your Bibles are saved on this device. The trash button removes one; removing your default brings back the King James Bible.",
    ],
    cover: { clip: "bibles-language", center: [0.32, 0.45], zoom: 1.6 },
    tryIt: { href: "/account#bible-translations", label: "Open Translations settings" },
  },
  {
    id: "compare-translations",
    group: "bibles",
    title: "Compare translations",
    summary: "Show a second Bible with the one you're reading, either woven into the text or verse by verse beside it.",
    clips: [
      {
        id: "compare-inline",
        title: "See the differences inline",
        steps: [
          "In a Bible chapter, open Reader settings.",
          "Under Your Bibles, turn on the switch beside the Bible to compare.",
          "Close the menu. Words that differ are shown in each Bible's color, as the key at the top explains.",
        ],
      },
      {
        id: "compare-side-by-side",
        title: "Read side by side",
        steps: [
          "Open Reader settings again.",
          "Under Comparison view, choose Side by side.",
          "Each verse now shows both Bibles next to each other.",
        ],
      },
    ],
    notes: ["Add the Bibles you want to compare first (see Add Bibles above)."],
    cover: { clip: "compare-inline", center: [0.33, 0.36], zoom: 1.7 },
    tryIt: { href: "/browse/newtestament/john/1", label: "Open John 1" },
  },
  {
    id: "jst",
    group: "bibles",
    title: "Read with the Joseph Smith Translation",
    summary: "Read the JST's revisions in place of the King James verses they change, with the JST's own words underlined.",
    latterDaySaint: true,
    clips: [
      {
        id: "jst",
        title: "Turn on the JST",
        steps: [
          "In a Bible chapter, open Reader settings.",
          "Open Joseph Smith Translation and turn on its switch.",
          "Close the menu. JST passages now read in place, with their wording underlined.",
        ],
      },
    ],
    notes: [
      "The JST applies when the King James Bible (LDS edition) is the main text. A line above the chapter can show the KJV words the JST leaves out.",
    ],
    cover: { clip: "jst", center: [0.3, 0.3], zoom: 2 },
    tryIt: { href: "/browse/newtestament/matthew/7", label: "Open Matthew 7" },
  },
  {
    id: "faith-tradition",
    group: "bibles",
    title: "Choose your faith tradition",
    summary:
      "Verse Together is built for Latter-day Saint study and welcomes every Bible reader. Your faith tradition decides which of those tools you see.",
    clips: [
      {
        id: "faith-tradition",
        title: "Switch to Other denominations",
        steps: [
          "Open Settings › Reading and find Faith tradition.",
          "Choose Other denominations.",
          "Come Follow Me leaves the top bar, and the library keeps the Bible and your Journal.",
        ],
      },
    ],
    notes: [
      "Other denominations hides Latter-day Saint scriptures, Come Follow Me, the Joseph Smith Translation and study resources. Choose the Church of Jesus Christ of Latter-day Saints to show them again. The choice is saved on this device.",
      "Topics marked Latter-day Saint in this guide are the ones it hides.",
    ],
    cover: { clip: "faith-tradition", center: [0.45, 0.24], zoom: 1.6 },
    tryIt: { href: "/account#reading", label: "Open Reading settings" },
  },
  {
    id: "highlights",
    group: "study",
    title: "Highlight and underline",
    summary: "Select exactly the words that matter, then mark them with a color, as a highlight or an underline.",
    clips: [
      {
        id: "marks-highlight",
        title: "Highlight a phrase",
        steps: [
          "Drag across the words you want, in any verse.",
          "In the menu that opens, choose a color in the top row.",
          "Just those words are highlighted.",
        ],
      },
      {
        id: "marks-underline",
        title: "Underline in any color",
        steps: [
          "Select the words, then choose Annotate.",
          "Under Any style and color, choose Underline and a color.",
          "Choose Apply.",
        ],
      },
      {
        id: "marks-remove",
        title: "Remove a mark",
        steps: [
          "Select the marked words again. The mark's button shows as pressed.",
          "Choose that button to remove the mark.",
        ],
      },
    ],
    notes: ["Marks are saved on this device, and with your account when you're signed in."],
    cover: { clip: "marks-highlight", center: [0.42, 0.47], zoom: 2.4 },
    tryIt: { href: "/browse/bookofmormon/alma/32", label: "Open Alma 32" },
  },
  {
    id: "quick-marks",
    group: "study",
    title: "Make your own quick marks",
    summary: "The colors at the top of the selection menu are yours to set up: name them, reorder them, or make one an underline.",
    clips: [
      {
        id: "quick-marks-name",
        title: "Name a quick mark",
        steps: [
          "Open Settings › Study tools.",
          "Type a name beside a mark, like Promises.",
          "Click away. The name is saved.",
        ],
      },
      {
        id: "quick-marks-use",
        title: "Use it while reading",
        steps: ["Select words and choose Annotate.", "Your named mark is listed under Your quick marks. Choose it."],
      },
    ],
    notes: ["Each mark can be a highlight or an underline in any color. The arrows reorder them, and Restore defaults starts over."],
    cover: { clip: "quick-marks-name", center: [0.3, 0.55], zoom: 1.8 },
    tryIt: { href: "/account#study-tools", label: "Open Study tools" },
  },
  {
    id: "explore",
    group: "study",
    title: "Explore words and study paths",
    summary:
      "Look into a word without leaving the chapter: study helps, the Hebrew and Greek behind it, and its English meanings. On some verses, a light bulb opens a study path.",
    clips: [
      {
        id: "explore-study-helps",
        title: "Explore a word's study helps",
        steps: [
          "Double-click a word (or select a few) and choose Explore.",
          "Open Study helps, then an entry such as the Bible Dictionary.",
          "Read more opens the full entry; Read at source opens it on churchofjesuschrist.org.",
        ],
      },
      {
        id: "explore-languages",
        title: "Look at the Hebrew and Greek",
        steps: [
          "Explore a word, then open Biblical languages.",
          "Strong's entries whose renderings use the word are listed. They're possibilities to explore, not the word in this verse.",
          "Choose one to read its definition.",
        ],
      },
      {
        id: "study-paths",
        title: "Follow a study path",
        steps: [
          "Choose the light bulb beside a verse.",
          "The study path suggests a direction to study and what to notice as you reread.",
          "Check its sources, listed below it.",
        ],
      },
    ],
    notes: [
      "Study paths are found by AI. Read the sources and decide what holds up.",
      "Study helps are Latter-day Saint resources, so Other denominations hides them; Biblical languages and English meanings stay.",
    ],
    cover: { clip: "explore-languages", center: [0.22, 0.45], zoom: 2 },
    tryIt: { href: "/browse/bookofmormon/alma/32", label: "Open Alma 32" },
  },
  {
    id: "study-notes",
    group: "write",
    title: "Write study notes",
    summary: "Gather passages into a note and write your thoughts around them. Notes save as you type and are kept in your Journal.",
    clips: [
      {
        id: "notes-quote",
        title: "Start a note with a passage",
        steps: [
          "Select words in a verse and choose New Note.",
          "The Journal opens beside the chapter with a new note.",
          "Choose Add to Note. The passage is quoted, with a link back to its verse.",
        ],
      },
      {
        id: "notes-write",
        title: "Write your own thoughts",
        steps: [
          "Click below the quote and write.",
          "The note saves as you type (Saved at shows when).",
          "Select more passages and choose Add to Note to keep collecting.",
        ],
      },
    ],
    cover: { clip: "notes-write", center: [0.8, 0.28], zoom: 2 },
    tryIt: { href: "/browse/bookofmormon/alma/32", label: "Open Alma 32" },
  },
  {
    id: "log",
    group: "write",
    title: "Log your reading",
    summary: "Record that you read a chapter, with a short reflection if you like. Logged reading counts toward your weekly goals.",
    clips: [
      {
        id: "log-reading",
        title: "Log a chapter with a reflection",
        steps: [
          "In the reader, choose Log.",
          "The Journal opens with the chapter you're reading. Choose Add a note… to write a reflection.",
          "Choose Save note (or Log reading without a note).",
        ],
      },
    ],
    cover: { clip: "log-reading", center: [0.8, 0.24], zoom: 2.1 },
    tryIt: { href: "/browse/bookofmormon/alma/32", label: "Open Alma 32" },
  },
  {
    id: "journal",
    group: "write",
    title: "Your Journal",
    summary: "Journal gathers your notes and logged reading by day, with weekly goals and a prompt when you want one.",
    clips: [
      {
        id: "journal-goals",
        title: "Set weekly goals",
        steps: ["Open Journal and choose Edit goals.", "Set study days and reflections per week.", "Choose Save goals."],
      },
      {
        id: "journal-prompts",
        title: "Reflect on a prompt",
        steps: [
          "Choose another prompt changes the question.",
          "Write a reflection opens a new entry under the prompt.",
          "Write, then choose Save entry, or Close to come back to it later.",
        ],
      },
      {
        id: "journal-day",
        title: "Open a day's entries",
        steps: ["Under Today's journal (or any day on the calendar), choose an entry.", "The day's entries are listed, with the one you chose open."],
      },
    ],
    cover: { clip: "journal-goals", center: [0.6, 0.4], zoom: 1.4 },
    tryIt: { href: "/notes", label: "Open Journal" },
  },
  {
    id: "come-follow-me",
    group: "more",
    title: "Study Come, Follow Me",
    summary:
      "This week's lesson as a scripture-first study guide, with context for each passage and notes that stay linked to the lesson.",
    latterDaySaint: true,
    clips: [
      {
        id: "cfm-week",
        title: "Open this week's study guide",
        steps: [
          "Choose Come Follow Me in the top bar.",
          "This week's lesson is first. Choose Open the study guide.",
          "Contents lists the guide's sections and chapters.",
        ],
      },
      {
        id: "cfm-context",
        title: "Read context and preview passages",
        steps: [
          "Under a group of verses, choose Context for verses.",
          "Choose a linked reference to preview it without leaving the lesson.",
          "Open it in the reader from the preview when you want the whole chapter.",
        ],
      },
      {
        id: "cfm-note",
        title: "Add a note to the lesson",
        steps: ["Choose Add note under the lesson's title.", "The Journal opens with a note linked to this lesson. Write, then Save note."],
      },
    ],
    notes: [
      "The guides are a personal Latter-day Saint study aid, not an official publication of the Church. You can select words in a lesson's scripture to Explore them, as in the reader.",
    ],
    cover: { clip: "cfm-week", center: [0.5, 0.4], zoom: 1.2 },
    tryIt: { href: "/come-follow-me", label: "Open Come Follow Me" },
  },
  {
    id: "focus-share",
    group: "more",
    title: "Focus and share a passage",
    summary: "Give a passage a page of its own to read slowly or send to someone.",
    clips: [
      {
        id: "focus-share",
        title: "Focus a passage and share it",
        steps: [
          "Select words in a verse and choose Focus scripture.",
          "The passage opens on its own page.",
          "Choose Share. Your device's share sheet opens where there is one; otherwise the link is copied.",
        ],
      },
    ],
    notes: ["Anyone can open a shared link, without an account."],
    cover: { clip: "focus-share", center: [0.5, 0.4], zoom: 1.6 },
    tryIt: { href: "/share/bookofmormon/alma/32/21", label: "Open a focused passage" },
  },
  {
    id: "settings",
    group: "more",
    title: "Settings, your account and feedback",
    summary:
      "Settings is the gear in the top bar. Its tabs hold your account, reading and Bible choices, quick marks, what's new, and a way to reach the developer.",
    clips: [
      {
        id: "settings-tour",
        title: "Look around Settings",
        steps: [
          "Choose the gear in the top bar.",
          "Account, Reading, Translations, Study tools, Release notes and Feedback each have a tab.",
          "Release notes shows your version and what changed in each release.",
          "Feedback takes a message and, if you like, a way to reach you. You don't need to sign in.",
        ],
      },
    ],
    notes: [
      "You can use Verse Together without an account: your study is saved in this browser. Sign in with Google from Settings › Account to keep your notes, Journal and marks with your account, on any device.",
      "Reading, translation and quick mark settings stay on each device.",
    ],
    cover: { clip: "settings-tour", center: [0.3, 0.38], zoom: 1.6 },
    tryIt: { href: "/account", label: "Open Settings" },
  },
];

export function clipMedia(id: GuideClipId) {
  return guideMedia[id];
}

export const clipVideoSrc = (id: GuideClipId) => `/feature-guide/${id}.mp4`;
export const clipPosterSrc = (id: GuideClipId) => `/feature-guide/${id}.webp`;

/** "0:12" */
export function formatClipDuration(seconds: number) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The section's clips, all together: "0:44". */
export const sectionDuration = (section: GuideSection) =>
  formatClipDuration(section.clips.reduce((total, clip) => total + clipMedia(clip.id).durationSeconds, 0));

/**
 * Where to enlarge a cover from (CSS transform-origin), so that its center lands in the middle of the card. Scaling
 * by z about origin o puts o + (0.5 − o) / z in the middle; solved for o, kept inside the poster.
 */
export function coverOrigin({ center, zoom }: GuideCover) {
  if (zoom <= 1) return "50% 50%";
  const origin = (c: number) => Math.min(1, Math.max(0, (c - 0.5 / zoom) / (1 - 1 / zoom)));
  return `${(origin(center[0]) * 100).toFixed(1)}% ${(origin(center[1]) * 100).toFixed(1)}%`;
}

export const sectionsInGroup = (group: GuideGroupId) => GUIDE_SECTIONS.filter((section) => section.group === group);
