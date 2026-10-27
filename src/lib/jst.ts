// Joseph Smith Translation (JST) passages for the Bible reader. The source is the JST appendix of the Latter-day
// Saint edition of the Bible: selected passages only, not the whole JST. Each upstream entry is keyed by its JST
// chapter and holds sections like "JST, Mark 9:40–48" that compare to a KJV passage ("Mark 9:43–48"). JST verse
// numbers often differ from the KJV's, so a section is never matched to a KJV verse by number: its whole text is
// aligned word by word with the whole KJV passage it compares to, and read in place of those verses, with its own
// JST label and verse numbers kept. A section that can't be read in place is shown whole before the text.
// Docs: https://openscriptureapi.org/docs/study-helps — see docs/joseph-smith-translation.md. Pure, so testable.

import { getBibleBooksForVolume, isBibleVolume } from "./bibleCanon.ts";
import { normalizeScriptureVolume } from "./scriptureVolumes.ts";

export const JST_API_BASE = "https://openscriptureapi.org/api/study-helps/v1/lds/en";
export const JST_SOURCE_DOCS_URL = "https://openscriptureapi.org/docs/study-helps";
export const JST_UPSTREAM_TIMEOUT_MS = 8000;
/** Larger than any appendix entry (the biggest is ~20 KB); anything past this is not an entry. */
export const JST_MAX_ENTRY_BYTES = 256 * 1024;

const MAX_SECTIONS_PER_ENTRY = 64;
const MAX_VERSES_PER_SECTION = 256;
const MAX_TEXT_LENGTH = 4000;

/**
 * Appendix entries that compare to a KJV chapter other than their own number, found by reading every entry in
 * `/entries?type=jst` (October 2026). Each KJV chapter also always asks for its same-numbered entry.
 */
const CROSS_CHAPTER_ENTRIES: Record<string, string[]> = {
  // JST Genesis 1:1–8:18 compares to Genesis 1:1–6:13 (published as the Book of Moses).
  "genesis:1": ["jst-genesis-1-8"],
  "genesis:2": ["jst-genesis-1-8"],
  "genesis:3": ["jst-genesis-1-8"],
  "genesis:4": ["jst-genesis-1-8"],
  "genesis:5": ["jst-genesis-1-8"],
  "genesis:6": ["jst-genesis-1-8"],
  // JST Genesis 9:4–6 compares to Genesis 8:20–22.
  "genesis:8": ["jst-genesis-9"],
  // JST Matthew 3:4–6 and 3:24–26 compare to Matthew 2:4–6 and 2:23.
  "matthew:2": ["jst-matthew-3"],
};

export type JstChapterTarget = { volume: "oldtestament" | "newtestament"; book: string; chapter: number };

export type JstVerse = { number: string; text: string };

/** A KJV verse span inside the chapter being read; `end: null` runs to the end of the chapter. */
export type JstVerseSpan = { start: number; end: number | null };

export type JstExcerpt = {
  id: string;
  /** The source's own label, e.g. "JST, Mark 9:40–48". */
  label: string;
  /** The KJV passage it compares to, as the source writes it, e.g. "Mark 9:43–48"; empty when the source gives none. */
  compareReference: string;
  /** First KJV verse in this chapter the excerpt compares to; null when it can't be placed at a verse. */
  anchorVerse: number | null;
  /** The KJV verses in this chapter the excerpt compares to. */
  comparedSpans: JstVerseSpan[];
  /** The JST text, numbered as the JST numbers it. Empty for an excerpt published elsewhere (see `note`). */
  verses: JstVerse[];
  /** The source's description, given only for an excerpt that has no verses of its own here. */
  note?: string;
};

export type JstChapterExcerpts = {
  volume: JstChapterTarget["volume"];
  book: string;
  chapter: number;
  excerpts: JstExcerpt[];
};

/** The Bible chapter to look up, or null for anything else (another volume, an unknown book, an out-of-range chapter). */
export function jstChapterTarget(volume: string, book: string, chapter: number | string): JstChapterTarget | null {
  const canonicalVolume = normalizeScriptureVolume(String(volume ?? "").trim().toLowerCase());
  if (!isBibleVolume(canonicalVolume)) return null;
  const slug = String(book ?? "").trim().toLowerCase();
  const bookInfo = getBibleBooksForVolume(canonicalVolume).find((item) => item.slug === slug);
  if (!bookInfo) return null;
  const chapterText = String(chapter ?? "").trim();
  if (!/^\d{1,3}$/.test(chapterText)) return null;
  const chapterNumber = Number(chapterText);
  if (chapterNumber < 1 || chapterNumber > bookInfo.chapters) return null;
  return { volume: canonicalVolume as JstChapterTarget["volume"], book: bookInfo.slug, chapter: chapterNumber };
}

/** The appendix entry ids that can hold excerpts for a KJV chapter: its own number first, then any listed above. */
export function jstEntryIdsForChapter(target: Pick<JstChapterTarget, "book" | "chapter">): string[] {
  const ids = [`jst-${target.book}-${target.chapter}`, ...(CROSS_CHAPTER_ENTRIES[`${target.book}:${target.chapter}`] ?? [])];
  return Array.from(new Set(ids));
}

type ReferenceRange = { startChapter: number; startVerse: number; endChapter: number; endVerse: number };

export type ParsedCompareReference = { book: string; ranges: ReferenceRange[] };

function normalizeBookName(name: string): string {
  const compact = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return compact === "psalm" ? "psalms" : compact;
}

/**
 * Parse a reference like "Mark 9:43–48", "1 Corinthians 7:1–2, 5, 26, 29–38" or "Genesis 1:1–6:13".
 * Returns null for anything else, rather than guessing.
 */
export function parseCompareReference(reference: string): ParsedCompareReference | null {
  const match = /^\s*(.+?)\s+(\d+):(.+?)\s*$/.exec(reference ?? "");
  if (!match) return null;
  const book = normalizeBookName(match[1]);
  let chapter = Number(match[2]);
  const ranges: ReferenceRange[] = [];
  for (const rawPart of match[3].split(",")) {
    const part = rawPart.trim();
    const piece = /^(?:(\d+):)?(\d+)(?:\s*[–—-]\s*(?:(\d+):)?(\d+))?$/.exec(part);
    if (!piece) return null;
    if (piece[1]) chapter = Number(piece[1]);
    const startChapter = chapter;
    const startVerse = Number(piece[2]);
    const endChapter = piece[3] ? Number(piece[3]) : startChapter;
    const endVerse = piece[4] ? Number(piece[4]) : startVerse;
    if (endChapter < startChapter || (endChapter === startChapter && endVerse < startVerse)) return null;
    ranges.push({ startChapter, startVerse, endChapter, endVerse });
    chapter = endChapter;
  }
  return ranges.length > 0 ? { book, ranges } : null;
}

/** The spans of `chapter` a parsed reference covers, in order. */
export function spansInChapter(reference: ParsedCompareReference, chapter: number): JstVerseSpan[] {
  const spans: JstVerseSpan[] = [];
  for (const range of reference.ranges) {
    if (chapter < range.startChapter || chapter > range.endChapter) continue;
    spans.push({
      start: chapter === range.startChapter ? range.startVerse : 1,
      end: chapter === range.endChapter ? range.endVerse : null,
    });
  }
  return spans;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH) : "";
}

function readVerses(value: unknown): JstVerse[] {
  if (!Array.isArray(value)) return [];
  const verses: JstVerse[] = [];
  for (const item of value.slice(0, MAX_VERSES_PER_SECTION)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const number = cleanText(typeof record.verseNumber === "number" ? String(record.verseNumber) : record.verseNumber);
    const text = cleanText(record.text);
    if (!text) continue;
    verses.push({ number, text });
  }
  return verses;
}

/** The source's description from an entry title like "JST, X. Compare Y This text … ." — the part after the reference. */
function titleNote(title: string, compareReference: string): string | undefined {
  if (!compareReference) return undefined;
  const marker = `Compare ${compareReference}`;
  const at = title.indexOf(marker);
  if (at < 0) return undefined;
  const note = title.slice(at + marker.length).replace(/\s+([.,;:])/g, "$1").trim();
  return note || undefined;
}

/**
 * The excerpts from raw appendix entries that belong to one KJV chapter, ordered by where they anchor. Sections
 * comparing to another chapter are left for that chapter; unlabeled sections repeating labeled ones are dropped;
 * any other section that can't be placed is kept, unanchored, from the chapter's own entry, so no text is lost.
 */
export function buildJstChapterExcerpts(target: Pick<JstChapterTarget, "book" | "chapter">, entries: unknown[]): JstExcerpt[] {
  const ownEntryId = `jst-${target.book}-${target.chapter}`;
  const excerpts: JstExcerpt[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const entryId = cleanText(record._id);
    const title = cleanText(record.title);
    const rawSections = Array.isArray(record.sections) ? record.sections.slice(0, MAX_SECTIONS_PER_ENTRY) : [];
    const sections = rawSections.map((section) => {
      const value = (section && typeof section === "object" ? section : {}) as Record<string, unknown>;
      return { label: cleanText(value.label), compareReference: cleanText(value.compareReference), verses: readVerses(value.verses) };
    });
    const labeledVerseKeys = new Set(
      sections.filter((section) => section.compareReference).flatMap((section) => section.verses.map((verse) => `${verse.number}|${verse.text}`))
    );

    sections.forEach((section, index) => {
      const parsed = section.compareReference ? parseCompareReference(section.compareReference) : null;
      const placeable = parsed !== null && parsed.book === target.book;
      let comparedSpans: JstVerseSpan[] = [];
      if (placeable) {
        comparedSpans = spansInChapter(parsed, target.chapter);
        // Compares to another KJV chapter: that chapter shows it.
        if (comparedSpans.length === 0) return;
      } else {
        if (section.verses.length === 0) return;
        if (!section.compareReference && section.verses.every((verse) => labeledVerseKeys.has(`${verse.number}|${verse.text}`))) return;
        // Can't be placed at a verse: keep it with the chapter its entry is numbered for, and nowhere else.
        if (entryId !== ownEntryId) return;
      }
      const id = `${entryId || "jst"}#${index}`;
      if (seen.has(id)) return;
      seen.add(id);
      const anchorVerse = comparedSpans.length > 0 ? Math.min(...comparedSpans.map((span) => span.start)) : null;
      excerpts.push({
        id,
        label: section.label || "JST excerpt",
        compareReference: section.compareReference,
        anchorVerse,
        comparedSpans,
        verses: section.verses,
        ...(section.verses.length === 0 ? { note: titleNote(title, section.compareReference) } : {}),
      });
    });
  }

  // Array sort is stable, so excerpts at the same verse keep the source's order.
  return excerpts.sort((a, b) => (a.anchorVerse ?? 0) - (b.anchorVerse ?? 0));
}

// ---- Reading a passage in place: the JST's words, aligned with the KJV verses they compare to. ----

/** One run of a JST row, in reading order. Only `same` and `added` are the JST's text. */
export type JstPiece =
  /** Wording the JST shares with this KJV verse, written as the JST writes it (punctuation and case may differ). */
  | { kind: "same"; text: string }
  /** Wording the JST adds here, or puts in place of the KJV's. */
  | { kind: "added"; text: string }
  /** KJV wording the JST passage doesn't have. Not part of the JST reading; kept so it can be pointed out. */
  | { kind: "omitted"; text: string }
  /** Where a JST verse begins, by the JST's own number. */
  | { kind: "verse"; number: string };

/** The JST reading that stands in for one KJV verse. */
export type JstRow = {
  /** The KJV verse it stands in for. */
  verse: number;
  excerptId: string;
  label: string;
  compareReference: string;
  /** The first row of a run of its passage, where the passage is labeled. */
  first: boolean;
  pieces: JstPiece[];
};

export type JstChapterReading = {
  /** KJV verse → its JST row. Verses not here read as the KJV, untouched. */
  rows: Map<number, JstRow>;
  /** Shown whole before the text: notes, and passages that can't be read in place. */
  leading: JstExcerpt[];
  /** The passages read in place. */
  integrated: JstExcerpt[];
};

type KjvVerse = { verse: number; text: string };
type KjvToken = { word: string; key: string; verse: number };
type JstToken = { word: string; key: string; verseNumber: string; startsVerse: boolean };

/** Word cells an alignment may use; the largest appendix section needs about 540,000. */
const MAX_ALIGNMENT_CELLS = 2_000_000;
/** A coincidental match ("the", "unto him") between two changes is read as part of the change, up to this long. */
const MAX_INCIDENTAL_MATCH = 2;

function wordKey(word: string): string {
  return word.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]/g, "") || word;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

type Block = { kind: "same"; pairs: Array<[number, number]> } | { kind: "change"; kjv: number[]; jst: number[] };

/** Longest-common-subsequence alignment of the two word lists, as alternating same / change blocks. */
function alignWords(kjv: KjvToken[], jst: JstToken[]): Block[] {
  const n = kjv.length;
  const m = jst.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = kjv[i].key === jst[j].key
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const blocks: Block[] = [];
  const change = (): Extract<Block, { kind: "change" }> => {
    const last = blocks[blocks.length - 1];
    if (last?.kind === "change") return last;
    const next: Block = { kind: "change", kjv: [], jst: [] };
    blocks.push(next);
    return next;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && kjv[i].key === jst[j].key) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "same") last.pairs.push([i, j]);
      else blocks.push({ kind: "same", pairs: [[i, j]] });
      i++;
      j++;
    } else if (i < n && (j >= m || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      change().kjv.push(i++);
    } else {
      change().jst.push(j++);
    }
  }
  return shareChangeEdges(dropIncidentalMatches(blocks), kjv, jst);
}

/**
 * A change that starts or ends with the same word on both sides ("into" … "hell; into") keeps that word as
 * shared, so an addition reads as an addition rather than as a replaced word.
 */
function shareChangeEdges(blocks: Block[], kjv: KjvToken[], jst: JstToken[]): Block[] {
  const out: Block[] = [];
  const same = (pair: [number, number]) => {
    const last = out[out.length - 1];
    if (last?.kind === "same") last.pairs.push(pair);
    else out.push({ kind: "same", pairs: [pair] });
  };
  for (const block of blocks) {
    if (block.kind === "same") {
      for (const pair of block.pairs) same(pair);
      continue;
    }
    const k = [...block.kjv];
    const t = [...block.jst];
    while (k.length && t.length && kjv[k[0]].key === jst[t[0]].key) same([k.shift()!, t.shift()!]);
    const tail: Array<[number, number]> = [];
    while (k.length && t.length && kjv[k[k.length - 1]].key === jst[t[t.length - 1]].key) tail.unshift([k.pop()!, t.pop()!]);
    if (k.length || t.length) out.push({ kind: "change", kjv: k, jst: t });
    for (const pair of tail) same(pair);
  }
  return out;
}

/** Fold short matches sandwiched between larger changes into one change, so a rewrite reads as one. */
function dropIncidentalMatches(blocks: Block[]): Block[] {
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 1; index < blocks.length - 1; index++) {
      const before = blocks[index - 1];
      const same = blocks[index];
      const after = blocks[index + 1];
      if (same.kind !== "same" || before.kind !== "change" || after.kind !== "change") continue;
      const length = same.pairs.length;
      const size = (block: typeof before) => Math.max(block.kjv.length, block.jst.length);
      if (length > MAX_INCIDENTAL_MATCH || length > size(before) || length > size(after)) continue;
      blocks.splice(index - 1, 3, {
        kind: "change",
        kjv: [...before.kjv, ...same.pairs.map(([k]) => k), ...after.kjv],
        jst: [...before.jst, ...same.pairs.map(([, t]) => t), ...after.jst],
      });
      changed = true;
      break;
    }
  }
  return blocks;
}

/** Each KJV verse's pieces of the JST reading, in order, for one aligned group of verses. */
function readGroup(kjvVerses: KjvVerse[], jstVerses: JstVerse[]): Map<number, JstPiece[]> | null {
  const kjv: KjvToken[] = kjvVerses.flatMap((verse) => words(verse.text).map((word) => ({ word, key: wordKey(word), verse: verse.verse })));
  const jst: JstToken[] = jstVerses.flatMap((verse) =>
    words(verse.text).map((word, index) => ({ word, key: wordKey(word), verseNumber: verse.number, startsVerse: index === 0 }))
  );
  if ((kjv.length + 1) * (jst.length + 1) > MAX_ALIGNMENT_CELLS) return null;
  const blocks = alignWords(kjv, jst);
  const rows = new Map<number, JstPiece[]>(kjvVerses.map((verse) => [verse.verse, []]));

  function push(verse: number, piece: JstPiece) {
    const pieces = rows.get(verse)!;
    const last = pieces[pieces.length - 1];
    if (last && last.kind === piece.kind && last.kind !== "verse" && piece.kind !== "verse") last.text += ` ${piece.text}`;
    else pieces.push(piece);
  }
  function pushJst(verse: number, index: number, kind: "same" | "added") {
    const token = jst[index];
    if (token.startsVerse) push(verse, { kind: "verse", number: token.verseNumber });
    push(verse, { kind, text: token.word });
  }

  let previousVerse: number | undefined;
  blocks.forEach((block, index) => {
    if (block.kind === "same") {
      for (const [k, t] of block.pairs) pushJst(kjv[k].verse, t, "same");
      previousVerse = kjv[block.pairs[block.pairs.length - 1][0]].verse;
      return;
    }
    const next = blocks[index + 1];
    const nextPair = next?.kind === "same" ? next.pairs[0] : undefined;
    const nextVerse = nextPair ? kjv[nextPair[0]].verse : undefined;
    // The verses whose wording this change replaces, each with the KJV words the JST leaves out.
    const replaced: number[] = [];
    const omitted = new Map<number, string[]>();
    for (const k of block.kjv) {
      const verse = kjv[k].verse;
      if (!omitted.has(verse)) {
        omitted.set(verse, []);
        replaced.push(verse);
      }
      omitted.get(verse)!.push(kjv[k].word);
    }
    // Where each added word goes. A replacement is spread over the verses it replaces, a JST verse at a time,
    // and the end of a JST verse begun earlier stays with it; an addition stays with the verse it follows, except
    // a JST verse that runs on into the next KJV verse.
    const targets: number[] = [];
    if (replaced.length > 0) {
      const finishesPrevious = previousVerse !== undefined && previousVerse !== replaced[0] &&
        block.jst.length > 0 && !jst[block.jst[0]].startsVerse && block.jst.some((t) => jst[t].startsVerse);
      let chunk = finishesPrevious ? -1 : 0;
      block.jst.forEach((t, position) => {
        if (position > 0 && jst[t].startsVerse) chunk++;
        targets.push(chunk < 0 ? previousVerse! : replaced[Math.min(chunk, replaced.length - 1)]);
      });
    } else {
      const fallback = previousVerse ?? nextVerse ?? kjvVerses[0].verse;
      let split = block.jst.length;
      if (previousVerse !== undefined && nextVerse !== undefined && nextVerse !== previousVerse && !jst[nextPair![1]].startsVerse) {
        for (let position = block.jst.length - 1; position >= 0; position--) {
          if (jst[block.jst[position]].startsVerse) {
            split = position;
            break;
          }
        }
      }
      block.jst.forEach((_, position) => targets.push(position >= split ? nextVerse! : fallback));
    }
    for (const verse of replaced) {
      push(verse, { kind: "omitted", text: omitted.get(verse)!.join(" ") });
      block.jst.forEach((t, position) => {
        if (targets[position] === verse) pushJst(verse, t, "added");
      });
    }
    block.jst.forEach((t, position) => {
      if (!omitted.has(targets[position])) pushJst(targets[position], t, "added");
    });
    if (block.kjv.length > 0) previousVerse = kjv[block.kjv[block.kjv.length - 1]].verse;
  });
  return rows;
}

const sharesWording = (pieces: JstPiece[] | undefined) => !!pieces?.some((piece) => piece.kind === "same");

/**
 * One group read in place. KJV verses at either end that share no wording with the JST text are only named by
 * the compare reference, so they stay KJV rather than reading as if the JST removed them.
 */
function readGroupTrimmed(kjvVerses: KjvVerse[], jstVerses: JstVerse[]): Map<number, JstPiece[]> | null {
  let verses = kjvVerses;
  for (;;) {
    const rows = readGroup(verses, jstVerses);
    if (!rows) return null;
    let from = 0;
    let to = verses.length;
    while (from < to && !sharesWording(rows.get(verses[from].verse))) from++;
    while (to > from && !sharesWording(rows.get(verses[to - 1].verse))) to--;
    if (from === to || (from === 0 && to === verses.length)) return rows;
    verses = verses.slice(from, to);
  }
}

/**
 * How a section's text lines up with the KJV verses it compares to. Usually one group: all of it against all of
 * them. When the JST verses are numbered like the KJV's and skip some ("1–2, 5, 26, 29–33, 38" compared with
 * "29–38"), each numbered run is its own group and the KJV verses between runs, which the appendix doesn't
 * reprint, stay KJV.
 */
function alignmentGroups(kjvVerses: KjvVerse[], jstVerses: JstVerse[]): Array<{ kjv: KjvVerse[]; jst: JstVerse[] }> {
  const whole = [{ kjv: kjvVerses, jst: jstVerses }];
  const numbers = jstVerses.map((verse) => (/^\d+$/.test(verse.number) ? Number(verse.number) : NaN));
  const kjvNumbers = new Set(kjvVerses.map((verse) => verse.verse));
  if (numbers.some((number, index) => !kjvNumbers.has(number) || (index > 0 && number <= numbers[index - 1]))) return whole;
  const runs: Array<{ start: number; end: number; jst: JstVerse[] }> = [];
  jstVerses.forEach((verse, index) => {
    const last = runs[runs.length - 1];
    if (last && numbers[index] === last.end + 1) {
      last.end = numbers[index];
      last.jst.push(verse);
    } else runs.push({ start: numbers[index], end: numbers[index], jst: [verse] });
  });
  if (runs.length < 2) return whole;
  return runs.map((run, index) => ({
    jst: run.jst,
    kjv: kjvVerses.filter(
      (verse) => (index === 0 || verse.verse >= run.start) && (index === runs.length - 1 || verse.verse <= run.end)
    ),
  }));
}

/**
 * The chapter as read with the JST: each passage's text read in place of the KJV verses it compares to, aligned
 * word by word across the whole passage, so every JST word appears once, in order, and JST verses beyond the
 * KJV's (nine JST verses for six KJV ones) are all kept. KJV verses outside a passage, including the gaps in a
 * discontinuous one, are untouched. Notes, sections the text can't place, and passages overlapping one already
 * read in place go first, whole, instead.
 */
export function readJstChapter(excerpts: JstExcerpt[], verses: KjvVerse[]): JstChapterReading {
  const rows = new Map<number, JstRow>();
  const leading: JstExcerpt[] = [];
  const integrated: JstExcerpt[] = [];
  for (const excerpt of excerpts) {
    const covered = verses.filter((verse) =>
      excerpt.comparedSpans.some((span) => verse.verse >= span.start && (span.end === null || verse.verse <= span.end))
    );
    if (excerpt.verses.length === 0 || covered.length === 0 || covered.some((verse) => rows.has(verse.verse))) {
      leading.push(excerpt);
      continue;
    }
    const read = new Map<number, JstPiece[]>();
    let readable = true;
    for (const group of alignmentGroups(covered, excerpt.verses)) {
      const groupRows = readGroupTrimmed(group.kjv, group.jst);
      if (!groupRows) {
        readable = false;
        break;
      }
      for (const [verse, pieces] of groupRows) read.set(verse, pieces);
    }
    if (!readable) {
      leading.push(excerpt);
      continue;
    }
    integrated.push(excerpt);
    let previous: number | undefined;
    for (const verse of covered) {
      const pieces = read.get(verse.verse);
      if (!pieces) continue;
      const index = verses.indexOf(verse);
      rows.set(verse.verse, {
        verse: verse.verse,
        excerptId: excerpt.id,
        label: excerpt.label,
        compareReference: excerpt.compareReference,
        first: previous === undefined || verses[index - 1]?.verse !== previous,
        pieces,
      });
      previous = verse.verse;
    }
  }
  return { rows, leading, integrated };
}

/** A row's JST wording, as plain text. */
export function jstRowText(row: Pick<JstRow, "pieces">): string {
  return row.pieces
    .filter((piece): piece is Extract<JstPiece, { text: string }> => piece.kind === "same" || piece.kind === "added")
    .map((piece) => piece.text)
    .join(" ");
}

/** A passage's whole JST text, read back from its rows in order: what the appendix prints, word for word. */
export function jstPassageText(reading: JstChapterReading, excerptId: string): string {
  return Array.from(reading.rows.values())
    .filter((row) => row.excerptId === excerptId)
    .sort((a, b) => a.verse - b.verse)
    .map(jstRowText)
    .filter(Boolean)
    .join(" ");
}

/** Whether a row changes the KJV's wording (not just its punctuation or numbering). */
export function jstRowChangesWording(row: Pick<JstRow, "pieces">): boolean {
  return row.pieces.some((piece) => piece.kind === "added" || piece.kind === "omitted");
}

export function formatJstSpans(spans: JstVerseSpan[]): string {
  return spans.map((span) => (span.end === span.start ? `${span.start}` : `${span.start}–${span.end ?? "end"}`)).join(", ");
}

// ---- Browser state: one chapter's excerpts at a time; a late answer for another chapter is never shown. ----

export type JstOutcome = { status: "ready"; excerpts: JstExcerpt[] } | { status: "failed"; message: string };

export type JstLoadState = { key: string; outcome?: JstOutcome };

export const EMPTY_JST_STATE: JstLoadState = { key: "" };

export type JstView =
  | { status: "off" }
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "empty" }
  | { status: "ready"; excerpts: JstExcerpt[] };

export function jstRequestKey(target: JstChapterTarget | null): string {
  return target ? `${target.book}/${target.chapter}` : "";
}

export function recordJstOutcome(state: JstLoadState, key: string, outcome: JstOutcome): JstLoadState {
  if (!key) return state;
  return { key, outcome };
}

/** What to show for `key`: an outcome recorded for another key reads as still loading. */
export function summarizeJst(key: string, state: JstLoadState, cached?: JstExcerpt[]): JstView {
  if (!key) return { status: "off" };
  const outcome: JstOutcome | undefined = cached ? { status: "ready", excerpts: cached } : state.key === key ? state.outcome : undefined;
  if (!outcome) return { status: "loading" };
  if (outcome.status === "failed") return { status: "failed", message: outcome.message };
  return outcome.excerpts.length === 0 ? { status: "empty" } : { status: "ready", excerpts: outcome.excerpts };
}

/** Read the API's response body; anything that isn't for `target` is rejected rather than shown. */
export function readJstResponse(body: unknown, target: JstChapterTarget): JstExcerpt[] | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Partial<JstChapterExcerpts>;
  if (record.book !== target.book || record.chapter !== target.chapter || !Array.isArray(record.excerpts)) return null;
  return record.excerpts;
}

// ---- Preference: off unless this device turned it on. ----

export const JST_PREFERENCE_STORAGE_KEY = "vt_bible_jst_v1";

export function parseJstPreference(raw: string | null | undefined): boolean {
  return raw === "1";
}

export function serializeJstPreference(enabled: boolean): string {
  return enabled ? "1" : "0";
}
