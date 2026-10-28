// The native form of a published study guide (written by scripts/generate-mobile-data.mjs from the web parser's
// output). Blocks and runs keep every source word in order; links carry where they go instead of a URL to parse.

export type PassageRef = {
  /** The real scripture location (never a range key): "Lamentations 3:22" is lamentations, chapter 3. */
  volume: string;
  book: string;
  chapter: number;
  first?: number;
  last?: number;
  /** In the guide's own chapters: the lesson scrolls to it instead of opening the reader. */
  local?: boolean;
};

export type Run = {
  text: string;
  /**
   * Where the run's characters are in its root's text (GuideRoot): `at`, the offset of its first character when they
   * are one stretch in order; else `src`, [run offset, root offset, …] pairs, each the start of a stretch (root offset
   * -1: characters the page has no text for, a line break or an image's alt). Neither: none of its text is the page's.
   * Whitespace the page has as a line break or several spaces is one space in the run, at the same place.
   */
  at?: number;
  src?: number[];
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  ref?: PassageRef;
  url?: string;
  anchor?: string;
};

export type Block =
  | { kind: "heading"; depth: number; id?: string; runs: Run[]; chapterLabel?: string; chapter?: number; title?: Run[]; refRuns?: Run[] }
  | { kind: "p"; id?: string; lead?: boolean; runs: Run[] }
  | { kind: "list"; ordered: boolean; start?: number; items: Block[][] }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "table"; rows: Array<{ header: boolean; cells: Run[][] }> }
  | { kind: "figure"; image: string; width: number; height: number; alt: string; caption?: Run[]; labelsHeading?: string; labels?: string[] }
  | { kind: "sources"; items: Run[][]; note?: string }
  | { kind: "rule" };

/**
 * One piece of guide HTML as the website renders it into its own element, as the DOM holds its text: every text
 * node's data in document order (whitespace between elements included), and each element with a usable id
 * (GUIDE_BLOCK_PATTERN) at the offset where it starts. Guide highlights are anchored in these texts
 * (src/features/comeFollowMe/guideAnchors.ts), so the app finds the same words the website does.
 */
export type GuideRoot = { text: string; anchors: Array<[string, number]> };

/**
 * One chapter of the week's reading, in reading order (RangeChapter in src/lib/cfm/cfmAnchors.ts). `key` is how the
 * guide names it: the chapter number in the week's first book, plus 1000 for each book after it, so Jeremiah 1 and
 * Lamentations 1 never meet. Sections', passages' and contents' `chapter`/`key` are these keys.
 */
export type RangeEntry = { key: number; book: string; slug: string; volume: string; chapter: number };

export type GuideContextBlock = {
  id: string;
  /** `chapter` is the range key. */
  passage?: { label: string; chapter: number; first: number; last: number };
  preview: Block[];
  more: Block[];
  previewRoot: GuideRoot;
  /** Only when the block has more than its preview (the web's `${id}-more` element). */
  moreRoot?: GuideRoot;
};

/** `chapter`: the range key of a chapter section. */
export type GuideSection = { id: string; chapter?: number; heading: Block[]; headingRoot: GuideRoot; blocks: GuideContextBlock[] };

export type TocItem = {
  id: string;
  text: string;
  kind: "chapter" | "section" | "sources";
  part: "introduction" | "reader" | "closing";
  number?: number;
  /** A chapter heading's range key, when the chapter is one of the week's own. */
  key?: number;
  verses: Array<{ id: string; short: string; text: string }>;
};

export type NativeGuide = {
  slug: string;
  title: string;
  scripture: string;
  startDate: string;
  endDate: string;
  dateLabel: string;
  author: string;
  summary: string;
  sha256: string;
  readingTime: string;
  /** `book`/`slug`/`volume` name the first book; `chapters` are range keys, `entries` their books and chapters. */
  range: { book: string; slug: string; volume: string; first: number; last: number; chapters: number[]; entries: RangeEntry[] };
  toc: TocItem[];
  introduction: Block[];
  introductionRoot: GuideRoot;
  sections: GuideSection[];
  fallback: Block[];
  /** Only for a guide without chapter sections. */
  fallbackRoot?: GuideRoot;
  closing: Block[];
  closingRoot: GuideRoot;
};
