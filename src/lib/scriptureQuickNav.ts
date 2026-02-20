import { BIBLE_BOOKS } from "@/lib/bibleCanon";
import { toScriptureVolumeUrlSlug } from "@/lib/scriptureVolumes";

export type QuickNavBook = {
  volume: string;
  book: string;
  label: string;
  chapters: number;
  abbreviations: string[];
};

export type QuickNavSuggestion = {
  key: string;
  label: string;
  href: string;
  verse?: number;
  volume: string;
  book: string;
  chapter: number;
};

const BIBLE_ABBREVIATIONS: Record<string, string[]> = {
  genesis: ["Gen"],
  exodus: ["Ex"],
  leviticus: ["Lev"],
  numbers: ["Num"],
  deuteronomy: ["Deut"],
  joshua: ["Josh"],
  judges: ["Judg"],
  ruth: ["Ruth"],
  "1samuel": ["1 Sam"],
  "2samuel": ["2 Sam"],
  "1kings": ["1 Kgs"],
  "2kings": ["2 Kgs"],
  "1chronicles": ["1 Chr"],
  "2chronicles": ["2 Chr"],
  ezra: ["Ezra"],
  nehemiah: ["Neh"],
  esther: ["Esth"],
  job: ["Job"],
  psalms: ["Ps", "Psalm"],
  proverbs: ["Prov"],
  ecclesiastes: ["Eccl"],
  songofsolomon: ["Song", "Song of Solomon"],
  isaiah: ["Isa"],
  jeremiah: ["Jer"],
  lamentations: ["Lam"],
  ezekiel: ["Ezek"],
  daniel: ["Dan"],
  hosea: ["Hosea"],
  joel: ["Joel"],
  amos: ["Amos"],
  obadiah: ["Obad"],
  jonah: ["Jonah"],
  micah: ["Micah"],
  nahum: ["Nahum"],
  habakkuk: ["Hab"],
  zephaniah: ["Zeph"],
  haggai: ["Hag"],
  zechariah: ["Zech"],
  malachi: ["Mal"],
  matthew: ["Matt"],
  mark: ["Mark"],
  luke: ["Luke"],
  john: ["John"],
  acts: ["Acts"],
  romans: ["Rom"],
  "1corinthians": ["1 Cor"],
  "2corinthians": ["2 Cor"],
  galatians: ["Gal"],
  ephesians: ["Eph"],
  philippians: ["Philip", "Phil"],
  colossians: ["Col"],
  "1thessalonians": ["1 Thes"],
  "2thessalonians": ["2 Thes"],
  "1timothy": ["1 Tim"],
  "2timothy": ["2 Tim"],
  titus: ["Titus"],
  philemon: ["Philem"],
  hebrews: ["Heb"],
  james: ["James"],
  "1peter": ["1 Pet"],
  "2peter": ["2 Pet"],
  "1john": ["1 Jn"],
  "2john": ["2 Jn"],
  "3john": ["3 Jn"],
  jude: ["Jude"],
  revelation: ["Rev"],
};

const RESTORATION_BOOKS: QuickNavBook[] = [
  { volume: "bookofmormon", book: "1nephi", label: "1 Nephi", chapters: 22, abbreviations: ["1 Ne"] },
  { volume: "bookofmormon", book: "2nephi", label: "2 Nephi", chapters: 33, abbreviations: ["2 Ne"] },
  { volume: "bookofmormon", book: "jacob", label: "Jacob", chapters: 7, abbreviations: ["Jacob"] },
  { volume: "bookofmormon", book: "enos", label: "Enos", chapters: 1, abbreviations: ["Enos"] },
  { volume: "bookofmormon", book: "jarom", label: "Jarom", chapters: 1, abbreviations: ["Jarom"] },
  { volume: "bookofmormon", book: "omni", label: "Omni", chapters: 1, abbreviations: ["Omni"] },
  { volume: "bookofmormon", book: "wordsofmormon", label: "Words of Mormon", chapters: 1, abbreviations: ["W of M", "Words of Mormon"] },
  { volume: "bookofmormon", book: "mosiah", label: "Mosiah", chapters: 29, abbreviations: ["Mosiah"] },
  { volume: "bookofmormon", book: "alma", label: "Alma", chapters: 63, abbreviations: ["Alma"] },
  { volume: "bookofmormon", book: "helaman", label: "Helaman", chapters: 16, abbreviations: ["Hel"] },
  { volume: "bookofmormon", book: "3nephi", label: "3 Nephi", chapters: 30, abbreviations: ["3 Ne"] },
  { volume: "bookofmormon", book: "4nephi", label: "4 Nephi", chapters: 1, abbreviations: ["4 Ne"] },
  { volume: "bookofmormon", book: "mormon", label: "Mormon", chapters: 9, abbreviations: ["Morm", "Mormon"] },
  { volume: "bookofmormon", book: "ether", label: "Ether", chapters: 15, abbreviations: ["Ether"] },
  { volume: "bookofmormon", book: "moroni", label: "Moroni", chapters: 10, abbreviations: ["Moro", "Moroni"] },
  {
    volume: "doctrineandcovenants",
    book: "doctrineandcovenants",
    label: "Doctrine and Covenants",
    chapters: 138,
    abbreviations: ["D&C", "DC", "Doctrine and Covenants"],
  },
  { volume: "pearl", book: "moses", label: "Moses", chapters: 8, abbreviations: ["Moses"] },
  { volume: "pearl", book: "abraham", label: "Abraham", chapters: 5, abbreviations: ["Abr", "Abraham"] },
  {
    volume: "pearl",
    book: "josephsmithmatthew",
    label: "Joseph Smith-Matthew",
    chapters: 1,
    abbreviations: ["JSM", "JS-M", "Joseph Smith-Matthew"],
  },
  {
    volume: "pearl",
    book: "josephsmithhistory",
    label: "Joseph Smith-History",
    chapters: 1,
    abbreviations: ["JSH", "JS-H", "Joseph Smith-History"],
  },
  { volume: "pearl", book: "articlesoffaith", label: "Articles of Faith", chapters: 1, abbreviations: ["A of F", "AOF"] },
];

const BIBLE_QUICK_NAV: QuickNavBook[] = BIBLE_BOOKS.map((book) => ({
  volume: book.testament === "old" ? "oldtestament" : "newtestament",
  book: book.slug,
  label: book.label,
  chapters: book.chapters,
  abbreviations: BIBLE_ABBREVIATIONS[book.slug] ?? [book.label],
}));

export const QUICK_NAV_BOOKS: QuickNavBook[] = [...BIBLE_QUICK_NAV, ...RESTORATION_BOOKS];

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function buildBookTokens(book: QuickNavBook): string[] {
  return unique([book.label, book.book, ...book.abbreviations].map(norm).filter(Boolean));
}

const BOOK_TOKENS: Array<{ book: QuickNavBook; tokens: string[] }> = QUICK_NAV_BOOKS.map((book) => ({
  book,
  tokens: buildBookTokens(book),
}));

function parseCompactNumberPairs(digits: string): Array<{ chapter: number; verse?: number }> {
  const out: Array<{ chapter: number; verse?: number }> = [];
  if (!/^\d+$/.test(digits)) return out;
  if (digits.length === 1) {
    out.push({ chapter: Number(digits) });
    return out;
  }
  for (let i = 1; i < digits.length; i += 1) {
    out.push({ chapter: Number(digits.slice(0, i)), verse: Number(digits.slice(i)) });
  }
  if (digits.length === 3) {
    // Support fast forms like j151 -> 1:15 in addition to 1:51 and 15:1.
    out.push({ chapter: Number(digits[0]), verse: Number(`${digits[0]}${digits[1]}`) });
  }
  const dedup = new Map<string, { chapter: number; verse?: number }>();
  for (const item of out) {
    if (!Number.isFinite(item.chapter) || item.chapter <= 0) continue;
    const key = `${item.chapter}:${item.verse ?? ""}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }
  return Array.from(dedup.values());
}

function parseRemainder(remainder: string): Array<{ chapter: number; verse?: number }> {
  if (!remainder) return [];
  const clean = remainder.trim();
  const explicit = clean.match(/^(\d{1,3})(?::(\d{1,3}))?$/);
  if (explicit) {
    const chapter = Number(explicit[1]);
    const verse = explicit[2] ? Number(explicit[2]) : undefined;
    if (chapter > 0) return [{ chapter, verse }];
  }
  const digits = clean.replace(/[^0-9]/g, "");
  return parseCompactNumberPairs(digits);
}

function matchBooksByToken(token: string): QuickNavBook[] {
  const needle = norm(token);
  if (!needle) return [];
  return BOOK_TOKENS
    .filter(({ tokens }) => tokens.some((value) => value.startsWith(needle)))
    .map(({ book }) => book);
}

function buildSuggestion(book: QuickNavBook, chapter: number, verse?: number): QuickNavSuggestion {
  const volumeSlug = toScriptureVolumeUrlSlug(book.volume);
  const hrefBase = `/browse/${volumeSlug}/${book.book}/${chapter}`;
  const href = verse ? `${hrefBase}#v-${verse}` : hrefBase;
  const label = `${book.label} ${chapter}${verse ? `:${verse}` : ""}`;
  return {
    key: `${book.volume}:${book.book}:${chapter}:${verse ?? ""}`,
    label,
    href,
    verse,
    volume: book.volume,
    book: book.book,
    chapter,
  };
}

export function getQuickNavSuggestions(query: string, limit = 12): QuickNavSuggestion[] {
  const raw = query.trim();
  if (!raw) return [];

  const compactWithColon = raw.toLowerCase().replace(/[\s.\-]+/g, "").replace(/[\u2014\u2013]/g, "");
  const plainToken = raw.toLowerCase().replace(/[\s.\-:]+/g, "").replace(/[\u2014\u2013]/g, "");

  const suggestions: QuickNavSuggestion[] = [];
  const inputMatch = plainToken.match(/^([1-4]?[a-z]+)(.*)$/);
  const typedBookToken = inputMatch?.[1] ?? "";
  const numericTailFromPlain = inputMatch?.[2] ?? "";
  const inputWithColonMatch = compactWithColon.match(/^([1-4]?[a-z]+)(.*)$/);
  const numericTailFromColon = inputWithColonMatch?.[2] ?? "";
  const numericTail = numericTailFromColon || numericTailFromPlain;

  if (typedBookToken && numericTail) {
    for (const { book, tokens } of BOOK_TOKENS) {
      const tokenMatches = tokens.some((token) => token.startsWith(typedBookToken));
      if (!tokenMatches) continue;
      const pairs = parseRemainder(numericTail);
      if (pairs.length === 0) continue;
      for (const pair of pairs) {
        if (pair.chapter < 1 || pair.chapter > book.chapters) continue;
        suggestions.push(buildSuggestion(book, pair.chapter, pair.verse));
      }
    }
  }

  // If there are no numeric candidates, fall back to book-only quick links.
  if (suggestions.length === 0) {
    const books = matchBooksByToken(typedBookToken || plainToken).slice(0, limit);
    return books.map((book) => buildSuggestion(book, 1));
  }

  const dedup = new Map<string, QuickNavSuggestion>();
  for (const suggestion of suggestions) {
    if (!dedup.has(suggestion.key)) dedup.set(suggestion.key, suggestion);
  }

  return Array.from(dedup.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function getBookAbbreviation(bookSlug: string): string | null {
  const item = QUICK_NAV_BOOKS.find((book) => book.book === bookSlug);
  if (!item || item.abbreviations.length === 0) return null;
  return item.abbreviations[0] ?? null;
}
