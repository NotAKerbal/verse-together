// Scripture previews in the study guide: which links are scripture passages, what a passage's verses are,
// and how an open preview is kept in the browser's history. Pure (no DOM), so these rules are testable;
// PassagePreview.tsx does the loading, the dialog, and the history calls.

import { decodeFragment, parseScriptureAnchor } from "../../lib/cfm/cfmAnchors.ts";
import { exactReference, findBookBySlug, findChurchBook } from "../../lib/cfm/cfmScriptures.mjs";
import { normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "../../lib/scriptureVolumes.ts";

/** A chapter of the local scripture, optionally narrowed to a verse range. */
export type PassageTarget = {
  /** Canonical volume id, as the local data and its API name it ("oldtestament", "doctrineandcovenants"). */
  volume: string;
  /** Book slug ("isaiah", "1nephi"). */
  book: string;
  /** The book's name ("Isaiah", "Doctrine and Covenants"). */
  label: string;
  chapter: number;
  first?: number;
  last?: number;
};

export type PassageVerse = { verse: number; text: string };

const MAX_VERSE = 199;

const isVerse = (value: number) => Number.isInteger(value) && value >= 1 && value <= MAX_VERSE;

/**
 * A validated target: the book must exist in that volume of the shared canon (cfmScriptures.mjs), the chapter
 * in that book, and a verse range must run forward. Null for anything else; nothing is clamped or guessed.
 */
export function passageTarget(volume: string, book: string, chapter: number, first?: number, last?: number): PassageTarget | null {
  const found = findBookBySlug(book);
  if (!found) return null;
  const canonical = found.canonicalVolume;
  if (normalizeScriptureVolume(volume) !== canonical) return null;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > found.chapters) return null;
  const target: PassageTarget = { volume: canonical, book: found.slug, label: found.name, chapter };
  if (first == null) return last == null ? target : null;
  const end = last ?? first;
  if (!isVerse(first) || !isVerse(end) || end < first) return null;
  return { ...target, first, last: end };
}

const BROWSE = /^\/browse\/([a-z]+)\/([a-z0-9]+)\/(\d{1,3})(?:#v-(\d{1,3}))?$/;
const SHARE = /^\/share\/([a-z]+)\/([a-z0-9]+)\/(\d{1,3})\/(\d{1,3})(?:-(\d{1,3}))?$/;

type VerseRange = { first: number; last: number };

// Gospel Library scripture URLs, read from the href exactly as written: never resolved or normalized, so
// dot segments, encoded separators, user info, ports, other schemes, and lookalike hosts simply don't match.
const CHURCH_HOSTS = new Set(["www.churchofjesuschrist.org", "churchofjesuschrist.org"]);
const N = "[1-9]\\d{0,2}";
// https://<host>/study/scriptures/<volume>/<book>/<chapter>[.<verse>[-<verse>]][?<query>][#<fragment>]
const CHURCH = new RegExp(
  `^https://([a-z.]+)/study/scriptures/([a-z]+(?:-[a-z]+)*)/([a-z0-9]+(?:-[a-z0-9]+)*)/(${N})(?:\\.(${N})(?:-(${N}))?)?(?:\\?([^#]*))?(?:#(.*))?$`
);
// Verse selectors: `id=p3` or `id=p3-p7` in the query, `#p3` as the fragment.
const CHURCH_ID = new RegExp(`^p(${N})(?:-p(${N}))?$`);
const CHURCH_ANCHOR = new RegExp(`^p(${N})$`);

/**
 * What a link's text says it is: whitespace collapsed, and one trailing parenthetical note without numbers set
 * aside ("Isaiah 58 (KJV)" is Isaiah 58; "Isaiah 1:1 (Isaiah 2:3)" stays as written). See exactReference: text
 * that begins as a reference must be exactly one.
 */
function labelReference(label: string) {
  const text = label.replace(/\s+/g, " ").trim();
  const noted = /^(.*\S) \([^()\d]*\)$/.exec(text);
  return exactReference(noted ? noted[1] : text);
}

const verseRange = (first: string, last?: string): VerseRange | null => {
  const range = { first: Number(first), last: Number(last ?? first) };
  return range.last >= range.first ? range : null;
};
const sameRange = (a: VerseRange, b: VerseRange) => a.first === b.first && a.last === b.last;

/**
 * The query of a Gospel Library scripture URL: only `lang=eng` (the scripture here is the English text) and
 * `id`, each at most once. Anything else, an empty query included, is not a URL this reads: null.
 */
function churchQuery(query: string | undefined): { id?: string } | null {
  if (query == null) return {};
  const found: { lang?: string; id?: string } = {};
  for (const part of query.split("&")) {
    const pair = /^(lang|id)=([^=]*)$/.exec(part);
    if (!pair) return null;
    const key = pair[1] as "lang" | "id";
    if (found[key] != null) return null;
    found[key] = pair[2];
  }
  if (found.lang != null && found.lang !== "eng") return null;
  return { id: found.id };
}

/**
 * The passage a Gospel Library scripture link names, or null. The URL decides the book and chapter. Its verse
 * selectors (`.<verse>[-<verse>]` after the chapter, `id=p<verse>[-p<verse>]`, `#p<verse>`) must agree with
 * each other; `#p<verse>` alone selects that verse. The link's text narrows a chapter to verses only when it is
 * exactly a valid reference to that same book and chapter ("Isaiah 1:1" on …/ot/isa/1); it must then agree with
 * any selector too. Text that begins as a reference must be exactly one (see labelReference), so text naming
 * another chapter, more or other than one same-chapter range ("Isaiah 1–2", "Isaiah 1:1,3"), an invalid
 * reference, or selectors that disagree leave the link as it is. Text that is no reference keeps the URL's scope.
 */
function churchPassage(href: string, label: string | null): PassageTarget | null {
  const m = CHURCH.exec(href);
  if (!m || !CHURCH_HOSTS.has(m[1])) return null;
  const book = findChurchBook(m[2], m[3]);
  if (!book) return null;
  const chapter = Number(m[4]);
  const query = churchQuery(m[7]);
  if (!query) return null;
  let inPath: VerseRange | null = null;
  if (m[5] != null) {
    inPath = verseRange(m[5], m[6]);
    if (!inPath) return null;
  }
  let inId: VerseRange | null = null;
  if (query.id != null) {
    const id = CHURCH_ID.exec(query.id);
    inId = id ? verseRange(id[1], id[2]) : null;
    if (!inId) return null;
  }
  let anchor: number | null = null;
  if (m[8] != null) {
    const fragment = CHURCH_ANCHOR.exec(m[8]);
    if (!fragment) return null;
    anchor = Number(fragment[1]);
  }
  if (inPath && inId && !sameRange(inPath, inId)) return null;
  const explicit = inPath ?? inId;
  if (explicit && anchor != null && anchor !== explicit.first) return null;
  let selection: VerseRange | null = explicit ?? (anchor != null ? { first: anchor, last: anchor } : null);
  const named = label == null ? null : labelReference(label);
  if (named) {
    if (!named.valid || named.book.slug !== book.slug || named.chapter !== chapter) return null;
    if (named.first != null) {
      const fromLabel = { first: named.first, last: named.last ?? named.first };
      if (explicit ? !sameRange(explicit, fromLabel) : anchor != null && anchor !== fromLabel.first) return null;
      selection = fromLabel;
    }
  }
  return passageTarget(book.canonicalVolume, book.slug, chapter, selection?.first, selection?.last);
}

/**
 * The passage a guide link points to, from these link forms and nothing else:
 * - `/browse/<volume>/<book>/<chapter>`, optionally `#v-<first>`, with a range's last verse in `data-last`
 *   (`rangeEnd`), as cfmScriptures.mjs writes every reference;
 * - the older `/share/<volume>/<book>/<chapter>/<first>[-<last>]` form;
 * - a scripture-pane anchor of the guide's own book (`#scripture-isaiah-58-v3-5`);
 * - a Gospel Library scripture URL, as the guides cite them (see churchPassage); `label` is the link's text.
 * Other citations, other site paths, query strings, and malformed ranges are not passages.
 */
export function passageFromLink(
  href: string | null,
  rangeEnd: string | null,
  guideBook?: { slug: string; volume: string },
  label: string | null = null
): PassageTarget | null {
  if (!href) return null;
  if (rangeEnd != null && !/^\d{1,3}$/.test(rangeEnd)) return null;
  if (href.startsWith("https:")) return rangeEnd == null ? churchPassage(href, label) : null;
  const end = rangeEnd != null ? Number(rangeEnd) : undefined;
  if (href.startsWith("#")) {
    if (!guideBook || end != null) return null;
    const anchor = decodeFragment(href);
    const target = anchor == null ? null : parseScriptureAnchor(anchor, guideBook.slug);
    return target ? passageTarget(guideBook.volume, guideBook.slug, target.chapter, target.first, target.last) : null;
  }
  const browse = BROWSE.exec(href);
  if (browse) {
    const first = browse[4] != null ? Number(browse[4]) : undefined;
    // A last verse means nothing without a first one.
    if (first == null && end != null) return null;
    return passageTarget(browse[1], browse[2], Number(browse[3]), first, end);
  }
  const share = SHARE.exec(href);
  if (share && end == null) {
    return passageTarget(share[1], share[2], Number(share[3]), Number(share[4]), share[5] != null ? Number(share[5]) : undefined);
  }
  return null;
}

const LESSON_ANCHOR = /^\/come-follow-me\/\d{4}-\d{2}-\d{2}(#.+)$/;

/**
 * The passage a link in a lesson resource points to, read away from its lesson (the reader's Resources panel).
 * The resource carries the lesson's in-page scripture anchors as links into the lesson
 * (`/come-follow-me/<week>#scripture-isaiah-40-v1-2`, see verseResources.ts); those name passages of the
 * lesson's own book, `lessonBook`, and their `data-last` repeats the anchor's range. Every other link reads as
 * in the lesson itself (passageFromLink); a lesson link to anything but its scripture is not a passage.
 */
export function resourcePassageFromLink(
  href: string | null,
  rangeEnd: string | null,
  lessonBook: { slug: string; volume: string },
  label: string | null = null
): PassageTarget | null {
  const lesson = href ? LESSON_ANCHOR.exec(href) : null;
  if (lesson) return passageFromLink(lesson[1], null, lessonBook);
  return passageFromLink(href, rangeEnd, undefined, label);
}

/** "Isaiah 58", "Luke 4:16–21", "Isaiah 66:24". */
export function passageTitle(target: PassageTarget): string {
  const chapter = `${target.label} ${target.chapter}`;
  if (target.first == null) return chapter;
  const last = target.last ?? target.first;
  return `${chapter}:${target.first}${last > target.first ? `–${last}` : ""}`;
}

/** The full chapter in the reader, at the passage's first verse (the reader scrolls to `#v-N`). */
export function chapterHref(target: PassageTarget, atVerse = true): string {
  const path = `/browse/${toScriptureVolumeUrlSlug(target.volume)}/${target.book}/${target.chapter}`;
  return atVerse && target.first != null ? `${path}#v-${target.first}` : path;
}

/** Identity of the chapter a target reads from (what is fetched and cached). */
export function chapterKey(target: PassageTarget): string {
  return `${target.volume}/${target.book}/${target.chapter}`;
}

/** Identity of the passage itself. */
export function passageKey(target: PassageTarget): string {
  return target.first == null ? chapterKey(target) : `${chapterKey(target)}:${target.first}-${target.last ?? target.first}`;
}

/**
 * A chapter's verses from local data (the companion's own chapters, or the lds-chapter API's answer), or
 * null unless they are exactly verses 1…n in order, each with text, and the data names this chapter where
 * it names one. Anything else is not shown, rather than risking the wrong verses under a verse number.
 */
export function chapterVerses(data: unknown, chapter: number): PassageVerse[] | null {
  if (!data || typeof data !== "object") return null;
  const { verses, reference } = data as { verses?: unknown; reference?: unknown };
  if (reference != null && (typeof reference !== "string" || !reference.endsWith(` ${chapter}`))) return null;
  if (!Array.isArray(verses) || verses.length === 0) return null;
  const out: PassageVerse[] = [];
  for (const [index, entry] of verses.entries()) {
    if (!entry || typeof entry !== "object") return null;
    const { verse, text } = entry as { verse?: unknown; text?: unknown };
    if (verse !== index + 1 || typeof text !== "string" || !text.trim()) return null;
    out.push({ verse: index + 1, text });
  }
  return out;
}

export type PassageSelection = { ok: true; verses: PassageVerse[] } | { ok: false; count: number };

/** The target's verses out of its whole chapter; a range reaching past the chapter's end is refused. */
export function selectPassage(target: PassageTarget, verses: readonly PassageVerse[]): PassageSelection {
  if (target.first == null) return { ok: true, verses: verses.slice() };
  const last = target.last ?? target.first;
  if (last > verses.length) return { ok: false, count: verses.length };
  return { ok: true, verses: verses.slice(target.first - 1, last) };
}

/**
 * The open preview lives in its own history entry at the same URL, so Back closes it and Forward opens it
 * again. Its state keeps every key already there (Next.js keeps its router state in history.state) and adds
 * the target under this key.
 */
export const PREVIEW_STATE_KEY = "cfmPassagePreview";

export function previewState(current: unknown, target: PassageTarget): Record<string, unknown> {
  const base = current && typeof current === "object" ? (current as Record<string, unknown>) : {};
  const { volume, book, chapter, first, last } = target;
  return { ...base, [PREVIEW_STATE_KEY]: first == null ? { volume, book, chapter } : { volume, book, chapter, first, last } };
}

/** The preview a history entry holds, checked again (an entry can outlive a deploy, or be anything). */
export function previewFromState(state: unknown): PassageTarget | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[PREVIEW_STATE_KEY];
  if (!value || typeof value !== "object") return null;
  const { volume, book, chapter, first, last } = value as Record<string, unknown>;
  if (typeof volume !== "string" || typeof book !== "string" || typeof chapter !== "number") return null;
  if ((first != null && typeof first !== "number") || (last != null && typeof last !== "number")) return null;
  const verse = (entry: unknown) => (typeof entry === "number" ? entry : undefined);
  return passageTarget(volume, book, chapter, verse(first), verse(last));
}
