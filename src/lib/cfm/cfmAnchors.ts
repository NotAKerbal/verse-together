// Pure anchor helpers shared by the guide parser (server) and the study companion (client).

/** A chapter, optionally narrowed to a verse range, in the scripture pane. */
export type ScriptureTarget = { chapter: number; first?: number; last?: number };

/** Decodes a URL fragment (with or without "#"); null for malformed percent-encoding such as "#%". */
export function decodeFragment(fragment: string): string | null {
  try {
    return decodeURIComponent(fragment.startsWith("#") ? fragment.slice(1) : fragment);
  } catch {
    return null;
  }
}

/** Scripture-pane anchor:`scripture-isaiah-50`, `scripture-isaiah-50-v4`, `scripture-isaiah-50-v1-3`. */
export function scriptureAnchor(slug: string, chapter: number, first?: number, last?: number): string {
  const base = `scripture-${slug}-${chapter}`;
  if (first == null) return base;
  return last != null && last > first ? `${base}-v${first}-${last}` : `${base}-v${first}`;
}

/** Element id of one verse in the scripture pane. */
export function scriptureVerseId(slug: string, chapter: number, verse: number): string {
  return scriptureAnchor(slug, chapter, verse);
}

/** Inverse of scriptureAnchor; null for anything else. */
export function parseScriptureAnchor(anchor: string, slug: string): ScriptureTarget | null {
  const match = new RegExp(`^scripture-${slug}-(\\d{1,3})(?:-v(\\d{1,3})(?:-(\\d{1,3}))?)?$`).exec(anchor);
  if (!match) return null;
  const chapter = Number(match[1]);
  if (!match[2]) return { chapter };
  const first = Number(match[2]);
  const last = match[3] ? Number(match[3]) : first;
  return first >= 1 && last >= first ? { chapter, first, last } : null;
}

/**
 * A guide link that points at this week's own chapters: an in-page scripture anchor, or a site-relative
 * `/share/<volume>/<book>/<chapter>/<verses>` or `/browse/<volume>/<book>/<chapter>` passage URL.
 * Everything else (other books, other chapters, external citations) returns null.
 */
export function localScriptureTarget(
  href: string | null,
  book: { slug: string; volume: string },
  chapters: readonly number[]
): ScriptureTarget | null {
  if (!href) return null;
  let target: ScriptureTarget | null = null;
  if (href.startsWith("#")) {
    const anchor = decodeFragment(href);
    target = anchor == null ? null : parseScriptureAnchor(anchor, book.slug);
  } else {
    const match = /^\/(share|browse)\/([a-z]+)\/([a-z0-9]+)\/(\d{1,3})(?:\/(\d{1,3})(?:-(\d{1,3}))?)?$/.exec(href);
    if (match && match[2] === book.volume && match[3] === book.slug && (match[1] === "browse") === !match[5]) {
      const chapter = Number(match[4]);
      target = match[5]
        ? { chapter, first: Number(match[5]), last: Number(match[6] ?? match[5]) }
        : { chapter };
    }
  }
  return target && chapters.includes(target.chapter) ? target : null;
}

export type VerseHalf = "a" | "b";

/**
 * Half-verse suffixes of a printed range: "57:11–13a" ends at the first half of verse 13, "57:13b–14"
 * starts at its second half. Plain ranges have neither.
 */
export function passageHalves(label: string): { firstHalf?: VerseHalf; lastHalf?: VerseHalf } {
  const match = /(?:^|\s|:)\d{1,3}([ab])?(?:[–-]\d{1,3}([ab])?)?$/.exec(label);
  if (!match) return {};
  const halves: { firstHalf?: VerseHalf; lastHalf?: VerseHalf } = {};
  if (match[1]) halves.firstHalf = match[1] as VerseHalf;
  // A single half-verse ("13a") is both its own first and last half.
  const last = match[2] ?? (/[–-]/.test(match[0]) ? undefined : match[1]);
  if (last) halves.lastHalf = last as VerseHalf;
  return halves;
}

/**
 * Clamp a target to real verses: unknown chapters are rejected, a first verse past the end falls back to
 * the whole chapter, and a last verse past the end is cut to the chapter's final verse.
 */
export function normalizeTarget(target: ScriptureTarget, verseCount: (chapter: number) => number | undefined): ScriptureTarget | null {
  const count = verseCount(target.chapter);
  if (count == null) return null;
  if (target.first == null) return { chapter: target.chapter };
  if (target.first < 1 || target.first > count) return { chapter: target.chapter };
  return { chapter: target.chapter, first: target.first, last: Math.min(Math.max(target.last ?? target.first, target.first), count) };
}

/** Passages whose verse span overlaps the target (a whole-chapter target overlaps every passage in it). */
export function passagesOverlapping<P extends { chapter: number; first: number; last: number }>(
  passages: readonly P[],
  target: ScriptureTarget
): P[] {
  const first = target.first ?? 1;
  const last = target.last ?? target.first ?? Number.MAX_SAFE_INTEGER;
  return passages.filter((passage) => passage.chapter === target.chapter && passage.first <= last && passage.last >= first);
}
