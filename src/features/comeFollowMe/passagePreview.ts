// Scripture previews in the study guide: which links are scripture passages, what a passage's verses are,
// and how an open preview is kept in the browser's history. Pure (no DOM), so these rules are testable;
// PassagePreview.tsx does the loading, the dialog, and the history calls.

import { decodeFragment, parseScriptureAnchor } from "../../lib/cfm/cfmAnchors.ts";
import { findBookBySlug } from "../../lib/cfm/cfmScriptures.mjs";
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

// The scripture volumes the guide parser links into (cfmScriptures.mjs), by their canonical ids.
const VOLUMES: Record<string, string> = {
  ot: "oldtestament",
  nt: "newtestament",
  bofm: "bookofmormon",
  "dc-testament": "doctrineandcovenants",
};
const MAX_VERSE = 199;

const isVerse = (value: number) => Number.isInteger(value) && value >= 1 && value <= MAX_VERSE;

/**
 * A validated target: the book must exist in that volume, the chapter in that book, and a verse range must
 * run forward. Null for anything else; nothing is clamped or guessed.
 */
export function passageTarget(volume: string, book: string, chapter: number, first?: number, last?: number): PassageTarget | null {
  const found = findBookBySlug(book);
  if (!found) return null;
  const canonical = VOLUMES[found.volume];
  if (!canonical || normalizeScriptureVolume(volume) !== canonical) return null;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > found.chapters) return null;
  const target: PassageTarget = { volume: canonical, book: found.slug, label: found.name, chapter };
  if (first == null) return last == null ? target : null;
  const end = last ?? first;
  if (!isVerse(first) || !isVerse(end) || end < first) return null;
  return { ...target, first, last: end };
}

const BROWSE = /^\/browse\/([a-z]+)\/([a-z0-9]+)\/(\d{1,3})(?:#v-(\d{1,3}))?$/;
const SHARE = /^\/share\/([a-z]+)\/([a-z0-9]+)\/(\d{1,3})\/(\d{1,3})(?:-(\d{1,3}))?$/;

/**
 * The passage a guide link points to, from the link forms the guide itself writes and nothing else:
 * - `/browse/<volume>/<book>/<chapter>`, optionally `#v-<first>`, with a range's last verse in `data-last`
 *   (`rangeEnd`), as cfmScriptures.mjs writes every reference;
 * - the older `/share/<volume>/<book>/<chapter>/<first>[-<last>]` form;
 * - a scripture-pane anchor of the guide's own book (`#scripture-isaiah-58-v3-5`).
 * External citations, other site paths, query strings, and malformed ranges are not passages.
 */
export function passageFromLink(
  href: string | null,
  rangeEnd: string | null,
  guideBook?: { slug: string; volume: string }
): PassageTarget | null {
  if (!href) return null;
  if (rangeEnd != null && !/^\d{1,3}$/.test(rangeEnd)) return null;
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
