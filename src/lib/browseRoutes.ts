// The Library's volume → book → chapter selection: which view a /browse URL shows, the canonical URLs between
// the views, and the view data, all from the bundled catalog. Pure, so the routing rules are testable; the
// client selector (components/BrowseSelector.tsx) renders these views without a server round trip.

import type { ScriptureCatalogIndex } from "./scriptureCatalogIndex.ts";
import { normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "./scriptureVolumes.ts";

export type BrowseSelection =
  | { kind: "library" }
  | { kind: "volume"; volume: string; volumeSlug: string }
  | { kind: "book"; volume: string; volumeSlug: string; book: string };

/** D&C is a one-book volume: its volume URL redirects to the book. */
const SINGLE_BOOK_VOLUMES: Record<string, string> = {
  doctrineandcovenants: "doctrineandcovenants",
};

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The selection a pathname shows, or null for anything that is not a selection view (e.g. a chapter). */
export function parseBrowseSelection(pathname: string): BrowseSelection | null {
  const clean = pathname.split(/[?#]/)[0] ?? "";
  const parts = clean.split("/").filter(Boolean).map(decodeSegment);
  if (parts[0] !== "browse" || parts.length > 3) return null;
  if (parts.length === 1) return { kind: "library" };

  const volume = normalizeScriptureVolume(parts[1] ?? "");
  const volumeSlug = toScriptureVolumeUrlSlug(volume);
  if (parts.length === 2) {
    const onlyBook = SINGLE_BOOK_VOLUMES[volume];
    return onlyBook ? { kind: "book", volume, volumeSlug, book: onlyBook } : { kind: "volume", volume, volumeSlug };
  }
  return { kind: "book", volume, volumeSlug, book: parts[2] ?? "" };
}

export function browseVolumeHref(volume: string): string {
  const canonical = normalizeScriptureVolume(volume);
  const slug = toScriptureVolumeUrlSlug(canonical);
  const onlyBook = SINGLE_BOOK_VOLUMES[canonical];
  return onlyBook ? `/browse/${slug}/${onlyBook}` : `/browse/${slug}`;
}

export function browseBookHref(volume: string, book: string): string {
  return `/browse/${toScriptureVolumeUrlSlug(volume)}/${book}`;
}

export function browseChapterHref(volume: string, book: string, chapter: number): string {
  return `${browseBookHref(volume, book)}/${chapter}`;
}

/** Where a book view's back button goes: its volume, or the Library for a one-book volume. */
export function browseBookBackHref(volume: string): string {
  const canonical = normalizeScriptureVolume(volume);
  return SINGLE_BOOK_VOLUMES[canonical] ? "/browse" : `/browse/${toScriptureVolumeUrlSlug(canonical)}`;
}

export function browseSelectionHref(selection: BrowseSelection): string {
  if (selection.kind === "library") return "/browse";
  if (selection.kind === "volume") return browseVolumeHref(selection.volume);
  return browseBookHref(selection.volume, selection.book);
}

type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/** A click the page may handle itself; anything else (new tab, new window, download) stays with the browser. */
export function isPlainLeftClick(event: ClickLike, target?: string | null): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return !target || target === "_self";
}

const BOOK_GROUPS: Record<string, Array<{ label: string; books: string[] }>> = {
  oldtestament: [
    { label: "Law", books: ["genesis", "exodus", "leviticus", "numbers", "deuteronomy"] },
    {
      label: "History",
      books: [
        "joshua",
        "judges",
        "ruth",
        "1samuel",
        "2samuel",
        "1kings",
        "2kings",
        "1chronicles",
        "2chronicles",
        "ezra",
        "nehemiah",
        "esther",
      ],
    },
    { label: "Wisdom", books: ["job", "psalms", "proverbs", "ecclesiastes", "songofsolomon"] },
    { label: "Major Prophets", books: ["isaiah", "jeremiah", "lamentations", "ezekiel", "daniel"] },
    {
      label: "Minor Prophets",
      books: [
        "hosea",
        "joel",
        "amos",
        "obadiah",
        "jonah",
        "micah",
        "nahum",
        "habakkuk",
        "zephaniah",
        "haggai",
        "zechariah",
        "malachi",
      ],
    },
  ],
  newtestament: [
    { label: "Gospels", books: ["matthew", "mark", "luke", "john"] },
    { label: "History", books: ["acts"] },
    {
      label: "Pauline Epistles",
      books: [
        "romans",
        "1corinthians",
        "2corinthians",
        "galatians",
        "ephesians",
        "philippians",
        "colossians",
        "1thessalonians",
        "2thessalonians",
        "1timothy",
        "2timothy",
        "titus",
        "philemon",
        "hebrews",
      ],
    },
    { label: "General Epistles", books: ["james", "1peter", "2peter", "1john", "2john", "3john", "jude"] },
    { label: "Apocalypse", books: ["revelation"] },
  ],
};

const CATEGORY_BY_BOOK = new Map<string, string>(
  Object.entries(BOOK_GROUPS).flatMap(([volume, groups]) =>
    groups.flatMap((group) => group.books.map((book) => [`${volume}:${book}`, group.label] as const))
  )
);

export type LibraryVolumeItem = {
  id: string;
  label: string;
  shortLabel: string;
  chapterCount: number;
  href: string;
};

export type VolumeBookItem = {
  id: string;
  label: string;
  chapters: number;
  category?: string;
  subtitle?: string | null;
  titleOfficial?: string;
  href: string;
};

export type BookView = {
  volume: string;
  volumeSlug: string;
  book: string;
  label: string;
  chapterCount: number;
  delineation: string;
  compact: boolean;
  backHref: string;
};

export function buildLibraryVolumes(catalog: ScriptureCatalogIndex): LibraryVolumeItem[] {
  return catalog.volumes.map((volume) => ({
    id: volume.volume,
    label: volume.title,
    shortLabel:
      volume.volume === "doctrineandcovenants" ? `${volume.chapterCount} sections` : `${volume.bookCount} books`,
    chapterCount: volume.chapterCount,
    href: browseVolumeHref(volume.volume),
  }));
}

export function buildVolumeBooks(catalog: ScriptureCatalogIndex, volume: string): VolumeBookItem[] {
  const canonical = normalizeScriptureVolume(volume);
  return catalog.getBooks(canonical).map((book) => ({
    id: book.book,
    label: book.label,
    chapters: book.chapterCount,
    category: CATEGORY_BY_BOOK.get(`${canonical}:${book.book}`),
    subtitle: book.subtitle,
    titleOfficial: book.longTitle ?? undefined,
    href: browseBookHref(canonical, book.book),
  }));
}

export type BookViewSource = {
  volume: string;
  book: string;
  label: string;
  chapterCount: number;
  chapterDelineation: string;
};

export function toBookView(book: BookViewSource): BookView {
  const volume = normalizeScriptureVolume(book.volume);
  return {
    volume,
    volumeSlug: toScriptureVolumeUrlSlug(volume),
    book: book.book,
    label: book.label,
    chapterCount: book.chapterCount,
    delineation: book.chapterDelineation,
    compact: SINGLE_BOOK_VOLUMES[volume] === book.book,
    backHref: browseBookBackHref(volume),
  };
}

export function buildBookView(catalog: ScriptureCatalogIndex, volume: string, book: string): BookView | null {
  const entry = catalog.getBook(normalizeScriptureVolume(volume), book);
  return entry ? toBookView(entry) : null;
}
