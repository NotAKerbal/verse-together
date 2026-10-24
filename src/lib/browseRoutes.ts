// The Library's volume → book → chapter selection: which view a /browse URL shows, the canonical URLs between
// the views, and the view data, all from the bundled catalog. Pure, so the routing rules are testable; the
// client selector (components/BrowseSelector.tsx) renders these views without a server round trip.

import { isBibleVolume, normalizeBibleTranslationId } from "./bibleCanon.ts";
import type { ScriptureCatalogIndex } from "./scriptureCatalogIndex.ts";
import { getScriptureVolumeLabel, normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "./scriptureVolumes.ts";

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

/**
 * A one-chapter book (Enos, Jude, Joseph Smith—History, …) has nothing to choose, so it opens straight to its
 * only chapter: that chapter's URL, or null for every other book. D&C's single book is its section list.
 */
export function singleChapterBookHref(catalog: ScriptureCatalogIndex, volume: string, book: string): string | null {
  const canonical = normalizeScriptureVolume(volume);
  if (SINGLE_BOOK_VOLUMES[canonical] === book) return null;
  const entry = catalog.getBook(canonical, book);
  return entry && entry.chapterCount === 1 ? browseChapterHref(canonical, entry.book, 1) : null;
}

/** Where opening a book goes: its chapter list, or its only chapter. */
export function browseBookEntryHref(catalog: ScriptureCatalogIndex, volume: string, book: string): string {
  return singleChapterBookHref(catalog, volume, book) ?? browseBookHref(normalizeScriptureVolume(volume), book);
}

/** "?translation=…&compare=…" from a page's searchParams, in order, or "" when there are none. */
export function toSearchSuffix(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, item);
    }
  }
  const out = params.toString();
  return out ? `?${out}` : "";
}

/** Whether an href is a selection view the browse selector can show in place (library, volume, or book list). */
export function isBrowseSelectionHref(href: string): boolean {
  return /^\/browse(\/|$|[?#])/.test(href) && parseBrowseSelection(href) !== null;
}

export type BrowseChapterTarget = {
  volume: string;
  volumeSlug: string;
  book: string;
  chapter: number;
  pathname: string;
};

/** The chapter an in-app href opens, or null for anything else (selection views, other pages, other origins). */
export function parseBrowseChapterHref(href: string): BrowseChapterTarget | null {
  let url: URL;
  try {
    url = new URL(href, "http://app.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://app.invalid") return null;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeSegment);
  if (parts.length !== 4 || parts[0] !== "browse") return null;
  const chapter = Number(parts[3]);
  if (!parts[1] || !parts[2] || !Number.isInteger(chapter) || chapter < 1) return null;
  const volume = normalizeScriptureVolume(parts[1]);
  return { volume, volumeSlug: toScriptureVolumeUrlSlug(volume), book: parts[2], chapter, pathname: url.pathname };
}

/**
 * A navigation that should show the destination chapter's page at once, before its route arrives: one to a
 * chapter page other than the page already shown. Verse jumps and query changes on the current chapter keep the
 * page in place.
 */
export function chapterNavigationTarget(currentPathname: string, href: string): BrowseChapterTarget | null {
  const target = parseBrowseChapterHref(href);
  if (!target) return null;
  return target.pathname === currentPathname.split(/[?#]/)[0] ? null : target;
}

/** "Alma 32" style label for a chapter, from the catalog (the book slug when it is unknown). */
export function describeChapterTarget(
  catalog: ScriptureCatalogIndex,
  target: Pick<BrowseChapterTarget, "volume" | "book" | "chapter">
): string {
  const entry = catalog.getBook(normalizeScriptureVolume(target.volume), target.book);
  return `${entry?.label ?? target.book.replace(/-/g, " ")} ${target.chapter}`;
}

type ChapterQuery = {
  translation?: string | string[] | null;
  compare?: string | string[] | null;
};

function queryValues(value: string | string[] | null | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

/**
 * The comparison translations a chapter URL asks for (Bible volumes only): the `translation` first, then each
 * `compare`, normalized, without the bundled "lds" text, and without repeats (ignoring case).
 */
export function chapterOverlayTranslations(volume: string, query: ChapterQuery): string[] {
  if (!isBibleVolume(normalizeScriptureVolume(volume))) return [];
  return [...queryValues(query.translation).slice(0, 1), ...queryValues(query.compare)]
    .filter((value) => !!value)
    .map((value) => normalizeBibleTranslationId(value))
    .filter((id) => id.toLowerCase() !== "lds")
    .filter((id, index, list) => list.findIndex((item) => item.toLowerCase() === id.toLowerCase()) === index);
}

/** "?translation=…&compare=…" carrying a chapter's comparison translations to the chapters next to it. */
export function chapterQuerySuffix(overlayTranslations: string[]): string {
  const params = new URLSearchParams();
  if (overlayTranslations[0]) params.set("translation", overlayTranslations[0]);
  overlayTranslations.slice(1).forEach((id) => params.append("compare", id));
  const out = params.toString();
  return out ? `?${out}` : "";
}

export type ChapterCrumb = { label: string; href?: string };

/** Everything a chapter page shows around its text, known from the URL and the catalog before the text loads. */
export type ChapterChrome = {
  volume: string;
  volumeSlug: string;
  book: string;
  chapter: number;
  /** The chapter's canonical pathname, without query. */
  pathname: string;
  /** "Alma 32". For a bundled book this is exactly the reference its text carries. */
  reference: string;
  /** Whether the bundled catalog knows the book (otherwise the reference is a guess from the slug). */
  catalogued: boolean;
  breadcrumbs: ChapterCrumb[];
  prevHref?: string;
  nextHref?: string;
};

/**
 * A chapter page's title, breadcrumbs, and Previous/Next links. The server page and the page shown while a
 * chapter's route is on its way both build them here, so the page looks the same before and after it arrives.
 */
export function buildChapterChrome(
  catalog: ScriptureCatalogIndex,
  target: Pick<BrowseChapterTarget, "volume" | "book" | "chapter">,
  overlayTranslations: string[] = []
): ChapterChrome {
  const volume = normalizeScriptureVolume(target.volume);
  const volumeSlug = toScriptureVolumeUrlSlug(volume);
  const { book, chapter } = target;
  const entry = catalog.getBook(volume, book);
  const bookHref = `/browse/${volumeSlug}/${book}`;
  const suffix = chapterQuerySuffix(overlayTranslations);
  const volumeLabel = getScriptureVolumeLabel(volume);
  const bookLabel = entry?.label ?? book.replace(/-/g, " ");
  const duplicateVolumeBook =
    bookLabel.trim().toLowerCase() === volumeLabel.trim().toLowerCase() ||
    (volume === "doctrineandcovenants" && book === "doctrineandcovenants");

  return {
    volume,
    volumeSlug,
    book,
    chapter,
    pathname: `${bookHref}/${chapter}`,
    reference: describeChapterTarget(catalog, { volume, book, chapter }),
    catalogued: !!entry,
    breadcrumbs: [
      { label: "Browse", href: "/browse" },
      ...(duplicateVolumeBook ? [] : [{ label: volumeLabel, href: `/browse/${volumeSlug}` }]),
      // A one-chapter book's own URL opens this chapter, so it gets no crumb of its own (the reference names it).
      ...(entry?.chapterCount === 1 ? [] : [{ label: bookLabel, href: bookHref }]),
      { label: `Chapter ${chapter}` },
    ],
    prevHref: chapter > 1 ? `${bookHref}/${chapter - 1}${suffix}` : undefined,
    nextHref: entry && chapter >= entry.chapterCount ? undefined : `${bookHref}/${chapter + 1}${suffix}`,
  };
}

/** The chrome of the chapter an in-app href opens (keeping its comparison translations), or null for any other href. */
export function chapterChromeForHref(catalog: ScriptureCatalogIndex, href: string): ChapterChrome | null {
  const target = parseBrowseChapterHref(href);
  if (!target) return null;
  const { searchParams } = new URL(href, "http://app.invalid");
  const overlays = chapterOverlayTranslations(target.volume, {
    translation: searchParams.get("translation"),
    compare: searchParams.getAll("compare"),
  });
  return buildChapterChrome(catalog, target, overlays);
}

export type PendingChapterNavigation = {
  /** The page the navigation started from. */
  fromPathname: string;
  /** The href being opened, with its query (comparison translations carry over to the shown page's links). */
  href: string;
  target: BrowseChapterTarget;
};

/**
 * The destination's page stands in for the current one only while its navigation is still in flight from the page
 * it started on: arriving, going Back/Forward, navigating elsewhere, or the navigation ending in failure all put a
 * page back.
 */
export function isPendingChapterVisible(
  pending: PendingChapterNavigation | null,
  state: { pathname: string; navigating: boolean }
): boolean {
  return !!pending && state.navigating && state.pathname === pending.fromPathname;
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
    href: browseBookEntryHref(catalog, canonical, book.book),
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
