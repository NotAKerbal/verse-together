// Pure rules for Markdown-backed journal notes and reading-log sources, shared by convex/insights.ts,
// convex/readingProgress.ts and the schema. No database access here.

import { v } from "convex/values";
import { normalizeScriptureVolume, toScriptureVolumeUrlSlug } from "../src/lib/scriptureVolumes";

export type NoteSourceKind = "scripture" | "guide" | "page";

/** Where a note or a reading came from: always a same-app link, with scripture coordinates when known. */
export type NoteSource = {
  kind: NoteSourceKind;
  label: string;
  href: string;
  volume?: string;
  book?: string;
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
};

export const noteSourceValidator = v.object({
  kind: v.union(v.literal("scripture"), v.literal("guide"), v.literal("page")),
  label: v.string(),
  href: v.string(),
  volume: v.optional(v.string()),
  book: v.optional(v.string()),
  chapter: v.optional(v.number()),
  verseStart: v.optional(v.number()),
  verseEnd: v.optional(v.number()),
});

export const NOTE_MARKDOWN_MAX = 200_000;
export const NOTE_TITLE_MAX = 120;
export const SOURCE_LABEL_MAX = 200;
export const SOURCE_HREF_MAX = 2048;
export const REQUEST_ID_MAX = 128;
export const DEFAULT_NOTE_TITLE = "Untitled note";
/** createDraft's default title; a projection does not turn it into a heading. */
export const LEGACY_DEFAULT_TITLE = "Untitled insight";

const JOURNAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// C0/C1 controls, any whitespace, backslashes, and bidi overrides/isolates.
 
const UNSAFE_HREF_CHARS = /[\u0000-\u001f\u007f-\u009f\s\\‎‏‪-‮⁦-⁩]/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

/** A real calendar day written YYYY-MM-DD (rejects 2026-02-30 and the like). */
export function isJournalDate(value: string): boolean {
  const match = JOURNAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The UTC calendar day of a timestamp, used as the stable journal date of records that never stored one. */
export function journalDateFromTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** A path within this app: starts with a single "/", no scheme, no protocol-relative "//", no controls. */
export function isSafeSourceHref(href: string): boolean {
  if (typeof href !== "string" || !href || href.length > SOURCE_HREF_MAX) return false;
  if (UNSAFE_HREF_CHARS.test(href)) return false;
  return href.startsWith("/") && !href.startsWith("//");
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Why a source can't be stored, or null if it can. */
export function noteSourceProblem(source: NoteSource): string | null {
  if (source.kind !== "scripture" && source.kind !== "guide" && source.kind !== "page") return "Unknown source kind";
  const label = source.label.trim();
  if (!label) return "A source needs a label";
  if (label.length > SOURCE_LABEL_MAX) return "Source label is too long";
  if (!isSafeSourceHref(source.href)) return "Source link must be a page in this app";
  for (const key of ["chapter", "verseStart", "verseEnd"] as const) {
    if (source[key] !== undefined && !isPositiveInteger(source[key])) return "Invalid source reference";
  }
  if (source.verseEnd !== undefined && source.verseStart === undefined) return "Invalid source reference";
  if (source.verseStart !== undefined && source.verseEnd !== undefined && source.verseEnd < source.verseStart) {
    return "Invalid source reference";
  }
  if ((source.volume !== undefined && !source.volume.trim()) || (source.book !== undefined && !source.book.trim())) {
    return "Invalid source reference";
  }
  return null;
}

/** The stored form of a caller-supplied source; throws when it isn't storable. */
export function normalizeNoteSource(source: NoteSource): NoteSource {
  const problem = noteSourceProblem(source);
  if (problem) throw new Error(problem);
  const out: NoteSource = { kind: source.kind, label: source.label.trim(), href: source.href };
  if (source.volume !== undefined) out.volume = source.volume.trim();
  if (source.book !== undefined) out.book = source.book.trim();
  if (source.chapter !== undefined) out.chapter = source.chapter;
  if (source.verseStart !== undefined) out.verseStart = source.verseStart;
  if (source.verseEnd !== undefined) out.verseEnd = source.verseEnd;
  return out;
}

/**
 * A digest of what a journal-entry create carried (text, day, source and whether it logs reading), so a repeated
 * create can be told from one bringing changes. Not a security measure: a fast, stable 64-bit hash (cyrb53-style)
 * of the normalized content, prefixed with its length.
 */
export function entryContentFingerprint(content: {
  markdownBody: string;
  journalDate: string;
  source?: NoteSource;
  logReading: boolean;
}): string {
  const s = content.source;
  const text = JSON.stringify([
    content.markdownBody,
    content.journalDate,
    content.logReading,
    s ? [s.kind, s.label, s.href, s.volume ?? null, s.book ?? null, s.chapter ?? null, s.verseStart ?? null, s.verseEnd ?? null] : null,
  ]);
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${text.length}:${hex(h2)}${hex(h1)}`;
}

/** Why a client request id can't be used for idempotency, or null if it can. */
export function requestIdProblem(requestId: string): string | null {
  if (!requestId || requestId.length > REQUEST_ID_MAX || !REQUEST_ID_PATTERN.test(requestId)) {
    return "Invalid request id";
  }
  return null;
}

/**
 * History keys name one older reading wherever it is stored. A chapterReads row is keyed by its id and read time;
 * the readingLogs snapshot preserveLegacyChapterRead later takes of that same read carries the same key as its
 * requestId, so opening either one as an entry hides both. Any other log is keyed by its id.
 */
const LEGACY_CHAPTER_READ_PREFIX = "legacy-chapter-read:";

export function chapterReadHistoryKey(row: { _id: string; readAt: number }): string {
  return `${LEGACY_CHAPTER_READ_PREFIX}${row._id}:${row.readAt}`;
}

export function readingLogHistoryKey(row: { _id: string; requestId: string }): string {
  return row.requestId.startsWith(LEGACY_CHAPTER_READ_PREFIX) ? row.requestId : `reading:${row._id}`;
}

/** History keys share the entry request index; a client request id may not look like one. */
export function isHistoryKey(key: string): boolean {
  return key.startsWith(LEGACY_CHAPTER_READ_PREFIX) || key.startsWith("reading:");
}

/** Reader URL book segment: "1 Nephi" and "1-nephi" both become "1-nephi". */
function bookUrlSegment(book: string): string {
  return book
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The reader page for a chapter (/browse/:volume/:book/:chapter). */
export function scriptureChapterHref(volume: string, book: string, chapter: number): string {
  return `/browse/${toScriptureVolumeUrlSlug(normalizeScriptureVolume(volume))}/${bookUrlSegment(book)}/${chapter}`;
}

/** A readable book name from a slug when no display reference was stored: "1-nephi" -> "1 Nephi". */
export function bookLabelFromSlug(book: string): string {
  return book
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function scriptureSource(ref: {
  volume: string;
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  reference?: string;
}): NoteSource {
  const verseStart =
    ref.verseStart !== undefined && ref.verseEnd !== undefined ? Math.min(ref.verseStart, ref.verseEnd) : ref.verseStart;
  const verseEnd =
    ref.verseStart !== undefined && ref.verseEnd !== undefined ? Math.max(ref.verseStart, ref.verseEnd) : undefined;
  let label = ref.reference?.trim();
  if (!label) {
    label = `${bookLabelFromSlug(ref.book)} ${ref.chapter}`;
    if (verseStart !== undefined) label += verseEnd !== undefined && verseEnd !== verseStart ? `:${verseStart}-${verseEnd}` : `:${verseStart}`;
  }
  const source: NoteSource = {
    kind: "scripture",
    label: label.slice(0, SOURCE_LABEL_MAX),
    // ChapterReader gives each verse the element id "v-N".
    href: `${scriptureChapterHref(ref.volume, ref.book, ref.chapter)}${verseStart !== undefined ? `#v-${verseStart}` : ""}`,
    volume: ref.volume,
    book: ref.book,
    chapter: ref.chapter,
  };
  if (verseStart !== undefined) {
    source.verseStart = verseStart;
    source.verseEnd = verseEnd ?? verseStart;
  }
  return source;
}

/** The fields of an insightDraftBlocks / publishedInsightBlocks row that carry content. */
export type LegacyNoteBlock = {
  type: "scripture" | "text" | "quote" | "dictionary";
  text?: string;
  highlightText?: string;
  linkUrl?: string;
  scriptureRef?: {
    volume: string;
    book: string;
    chapter: number;
    verseStart: number;
    verseEnd: number;
    reference: string;
  };
  dictionaryMeta?: {
    edition: "1828" | "1844" | "1913" | "ETY";
    word: string;
    heading?: string;
    pronounce?: string;
  };
};

/**
 * The source an old note can honestly claim: its first scripture reference, else its first link that is a
 * page in this app. Nothing is guessed from text.
 */
export function inferSourceFromBlocks(blocks: LegacyNoteBlock[]): NoteSource | null {
  for (const block of blocks) {
    if (block.scriptureRef) return scriptureSource(block.scriptureRef);
  }
  for (const block of blocks) {
    const href = block.linkUrl?.trim();
    if (href && isSafeSourceHref(href)) return { kind: "page", label: href.slice(0, SOURCE_LABEL_MAX), href };
  }
  return null;
}

function escapeLinkLabel(label: string): string {
  return label.replace(/([\\[\]])/g, "\\$1");
}

/** A Markdown link, or the bare URL as text when it can't be a link destination. */
export function markdownLink(label: string, url: string): string {
  if (/[\s<>]/.test(url)) return `${label}: ${url}`;
  return `[${escapeLinkLabel(label)}](<${url}>)`;
}

/** Text as a Markdown block quote, line by line. */
export function quoteLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function dictionaryEditionLabel(edition: string): string {
  return edition === "ETY" ? "Etymology" : `Webster ${edition}`;
}

/** One legacy block as readable Markdown. Every stored text field appears; nothing is dropped. */
export function blockToMarkdown(block: LegacyNoteBlock): string {
  const text = block.text ?? "";
  const highlight = block.highlightText ?? "";
  const parts: string[] = [];

  if (block.scriptureRef) {
    const source = scriptureSource(block.scriptureRef);
    const heading = `**${markdownLink(source.label, source.href)}**`;
    if (block.type === "scripture" && text) {
      parts.push(`${heading}\n${quoteLines(text)}`);
    } else {
      parts.push(heading);
    }
  }

  if (block.dictionaryMeta) {
    const meta = block.dictionaryMeta;
    let line = `**${meta.word}**`;
    if (meta.pronounce) line += ` (${meta.pronounce})`;
    line += ` — ${dictionaryEditionLabel(meta.edition)}`;
    if (meta.heading) line += `\n_${meta.heading}_`;
    parts.push(line);
  }

  if (text && !(block.type === "scripture" && block.scriptureRef)) {
    parts.push(block.type === "quote" || block.type === "scripture" ? quoteLines(text) : text);
  }

  if (highlight && highlight !== text) parts.push(`_Highlighted:_ ${highlight}`);

  const link = block.linkUrl?.trim();
  if (link) parts.push(block.type === "quote" ? `— ${markdownLink("Source", link)}` : markdownLink("Link", link));

  return parts.join("\n\n");
}

/**
 * A readable Markdown rendering of an old block-based note, in block order, used until the note is first
 * saved as Markdown. A non-default title becomes the first heading so the derived title stays the same.
 */
export function blocksToMarkdown(title: string, blocks: LegacyNoteBlock[]): string {
  const chunks: string[] = [];
  const trimmedTitle = title.trim();
  if (trimmedTitle && trimmedTitle !== LEGACY_DEFAULT_TITLE && trimmedTitle !== DEFAULT_NOTE_TITLE) {
    chunks.push(`# ${trimmedTitle}`);
  }
  for (const block of blocks) {
    const chunk = blockToMarkdown(block);
    if (chunk) chunks.push(chunk);
  }
  return chunks.join("\n\n");
}

/** Appends a chunk after a blank line without rewriting any of the existing body. */
export function appendMarkdownChunk(body: string, chunk: string): string {
  if (!chunk) return body;
  if (!body) return chunk;
  const separator = body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n";
  return `${body}${separator}${chunk}`;
}

function plainLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/^(>\s?)+/, "")
    .replace(/^([-*+]|\d+[.)])\s+/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .trim();
}

/** The note's title: its first heading or nonempty line as plain text, else "Untitled note". */
export function deriveNoteTitle(markdown: string): string {
  for (const raw of markdown.split(/\r?\n/)) {
    if (/^\s*([-*_=]\s*){3,}$/.test(raw)) continue;
    const line = plainLine(raw);
    if (!line) continue;
    return line.length > NOTE_TITLE_MAX ? `${line.slice(0, NOTE_TITLE_MAX).trimEnd()}…` : line;
  }
  return DEFAULT_NOTE_TITLE;
}

/** A short plain-text preview of the body after its title line, for note lists. */
export function markdownExcerpt(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => plainLine(line) !== "");
  const rest = lines
    .slice(titleIndex >= 0 && /^\s*#{1,6}\s/.test(lines[titleIndex]) ? titleIndex + 1 : 0)
    .map(plainLine)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!rest) return null;
  return rest.length > 220 ? `${rest.slice(0, 220).trimEnd()}...` : rest;
}
