import { QUICK_NAV_BOOKS } from "@/lib/scriptureQuickNav";
import { toScriptureVolumeUrlSlug } from "@/lib/scriptureVolumes";

export type FootnoteStudyLink = {
  kind: "tg" | "bd" | "jst" | "it" | "gs" | "heb" | "gr" | "ie" | "or" | "hc";
  label: string;
  query?: string;
  href?: string;
};

type AliasEntry = {
  alias: string;
  canonical: string;
};

type BookRoute = {
  volume: string;
  book: string;
};

export type ParsedFootnoteScriptureReference = {
  volume: string;
  book: string;
  bookLabel: string;
  chapter: number;
  verses: number[];
};

const TOOL_LABELS: Record<FootnoteStudyLink["kind"], string> = {
  tg: "Topical Guide",
  bd: "Bible Dictionary",
  jst: "Joseph Smith Translation",
  it: "Index to the Triple Combination",
  gs: "Guide to the Scriptures",
  heb: "Hebrew note",
  gr: "Greek note",
  ie: "Idiom explanation",
  or: "Alternate wording",
  hc: "History of the Church",
};

const TOOL_TOKENS = ["TG", "BD", "JST", "IT", "GS", "HEB", "GR", "IE", "OR", "HC"] as const;

const BOOK_ROUTE_MAP: Record<string, BookRoute> = Object.fromEntries(
  QUICK_NAV_BOOKS.map((book) => [book.book, { volume: book.volume, book: book.book }])
);

const BOOK_ALIAS_ENTRIES: AliasEntry[] = (() => {
  const byAlias = new Map<string, AliasEntry>();

  function push(alias: string, canonical: string) {
    const clean = alias.replace(/\u00a0/g, " ").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!byAlias.has(key)) {
      byAlias.set(key, { alias: clean, canonical });
    }
  }

  for (const book of QUICK_NAV_BOOKS) {
    const aliases = [book.label, ...book.abbreviations];
    for (const alias of aliases) {
      push(alias, book.label);
      if (!alias.endsWith(".")) push(`${alias}.`, book.label);
      push(alias.replace(/\./g, ""), book.label);
      if (!alias.endsWith(".")) push(`${alias.replace(/\./g, "")}.`, book.label);
    }
  }

  return Array.from(byAlias.values()).sort((a, b) => b.alias.length - a.alias.length);
})();

const BOOK_LOOKUP_BY_LABEL: Record<string, { volume: string; book: string; label: string }> = Object.fromEntries(
  QUICK_NAV_BOOKS.map((book) => [book.label.toLowerCase(), { volume: book.volume, book: book.book, label: book.label }])
);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function splitFootnoteSegments(footnote: string): string[] {
  return normalizeWhitespace(footnote)
    .split(";")
    .map((segment) => normalizeWhitespace(segment))
    .map((segment) => segment.replace(/\u2013|\u2014/g, "-"))
    .filter(Boolean);
}

function splitFootnoteClauses(footnote: string): Array<{ text: string; separatorBefore: ";" | "." | null }> {
  const normalized = normalizeWhitespace(footnote).replace(/[\u2013\u2014]/g, "-");
  if (!normalized) return [];
  const out: Array<{ text: string; separatorBefore: ";" | "." | null }> = [];
  let start = 0;
  let separatorBefore: ";" | "." | null = null;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch !== ";" && ch !== ".") continue;
    const chunk = normalizeWhitespace(normalized.slice(start, i));
    if (chunk) out.push({ text: chunk, separatorBefore });
    separatorBefore = ch as ";" | ".";
    start = i + 1;
  }
  const tail = normalizeWhitespace(normalized.slice(start));
  if (tail) out.push({ text: tail, separatorBefore });
  return out;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:)\]]+$/g, "").trim();
}

function parseVerseToken(token: string): number[] {
  const clean = trimTrailingPunctuation(token).replace(/\s+/g, "");
  if (!clean) return [];
  const range = clean.match(/^(\d{1,3})-(\d{1,3})$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) return [];
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const out: number[] = [];
    for (let v = lo; v <= hi && out.length < 250; v += 1) out.push(v);
    return out;
  }
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? [n] : [];
}

function parseVerseList(raw: string): number[] {
  const expanded = raw.replace(/\(([^)]+)\)/g, ",$1");
  const tokens = expanded.split(",").map((t) => t.trim()).filter(Boolean);
  const out = new Set<number>();
  for (const token of tokens) {
    for (const v of parseVerseToken(token)) out.add(v);
  }
  return Array.from(out.values()).sort((a, b) => a - b);
}

function buildStudyLink(kind: FootnoteStudyLink["kind"], query: string): FootnoteStudyLink {
  if (kind === "tg" || kind === "bd") {
    const slug = slugify(query);
    return {
      kind,
      label: `${kind.toUpperCase()}${query ? ` ${query}` : ""}`,
      query,
      href: slug
        ? `https://www.churchofjesuschrist.org/study/scriptures/${kind}/${encodeURIComponent(slug)}?lang=eng`
        : `https://www.churchofjesuschrist.org/study/scriptures/${kind}?lang=eng`,
    };
  }
  return {
    kind,
    label: `${kind.toUpperCase()}${query ? ` ${query}` : ""}`,
    query,
  };
}

export function extractFootnoteStudyLinks(footnote: string): FootnoteStudyLink[] {
  const links: FootnoteStudyLink[] = [];
  const clauses = splitFootnoteClauses(footnote);
  let activeKind: FootnoteStudyLink["kind"] | null = null;

  for (const entry of clauses) {
    const clause = trimTrailingPunctuation(entry.text);
    if (!clause) continue;
    const match = clause.match(/^(TG|BD|JST|IT|GS|HEB|GR|IE|OR|HC)\b\s*(.*)$/i);
    if (match) {
      const token = match[1].toLowerCase() as FootnoteStudyLink["kind"];
      const query = normalizeWhitespace(match[2] || "");
      links.push(buildStudyLink(token, query));
      if (token === "tg" || token === "bd") {
        activeKind = token;
      } else {
        activeKind = null;
      }
      continue;
    }

    // TG/BD clauses can continue across semicolons: "TG X; Y; Z."
    if (activeKind && entry.separatorBefore === ";" && !isScriptureSegment(clause) && !isToolSegment(clause)) {
      links.push(buildStudyLink(activeKind, normalizeWhitespace(clause)));
      continue;
    }

    activeKind = null;
  }

  return links;
}

export function normalizeFootnoteScriptureReferences(footnote: string): string {
  let out = normalizeWhitespace(footnote);

  // Strip non-scripture tool clauses before parsing references.
  out = out
    .split(/[.;]/)
    .map((clause) => normalizeWhitespace(clause))
    .filter((clause) => {
      if (!clause) return false;
      const upper = clause.toUpperCase();
      if (TOOL_TOKENS.some((token) => upper.startsWith(`${token} `) || upper === token)) {
        return false;
      }
      return true;
    })
    .join("; ");

  // Expand abbreviations from LDS scripture list into canonical book labels.
  for (const { alias, canonical } of BOOK_ALIAS_ENTRIES) {
    const re = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegex(alias)})(?:\\.)?\\s+(?=\\d)`, "gi");
    out = out.replace(re, (_m, pre) => `${pre}${canonical} `);
  }

  // Convert grouped verses, e.g. 9:6 (6, 23) -> 9:6,6,23
  out = out.replace(/(\d{1,3}:\d{1,3})\s*\(\s*([\d,\-\s]{1,30})\s*\)/g, (_m, base, group) => {
    const cleaned = group.replace(/\s+/g, "");
    return `${base},${cleaned}`;
  });

  out = out
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s+,\s+/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  return out;
}

export function buildScriptureBrowseHref(bookId: string, chapter: number, verse?: number): string | null {
  const route = BOOK_ROUTE_MAP[bookId];
  if (!route) return null;
  const volumeSlug = toScriptureVolumeUrlSlug(route.volume);
  const base = `/browse/${volumeSlug}/${route.book}/${chapter}`;
  if (Number.isFinite(verse) && (verse as number) > 0) {
    return `${base}#v-${verse}`;
  }
  return base;
}

export function getToolLabel(kind: FootnoteStudyLink["kind"]): string {
  return TOOL_LABELS[kind] ?? kind.toUpperCase();
}

export function parseFootnoteScriptureReferences(footnote: string): ParsedFootnoteScriptureReference[] {
  const segments = splitFootnoteSegments(footnote);
  if (segments.length === 0) return [];

  const refs: ParsedFootnoteScriptureReference[] = [];
  for (const segment of segments) {
    const upper = segment.toUpperCase();
    if (TOOL_TOKENS.some((token) => upper.startsWith(`${token} `) || upper === token)) {
      continue;
    }

    let matchedAlias: AliasEntry | null = null;
    for (const alias of BOOK_ALIAS_ENTRIES) {
      const re = new RegExp(`^${escapeRegex(alias.alias)}(?:\\.)?\\s+`, "i");
      if (re.test(segment)) {
        matchedAlias = alias;
        break;
      }
    }
    if (!matchedAlias) continue;

    const remainder = segment.replace(new RegExp(`^${escapeRegex(matchedAlias.alias)}(?:\\.)?\\s+`, "i"), "");
    const cv = remainder.match(/^(\d{1,3})(?::\s*([\d,\-\s()]{1,120}))?/);
    if (!cv) continue;
    const chapter = Number(cv[1]);
    if (!Number.isFinite(chapter) || chapter <= 0) continue;
    const verses = cv[2] ? parseVerseList(cv[2]) : [];

    const route = BOOK_LOOKUP_BY_LABEL[matchedAlias.canonical.toLowerCase()];
    if (!route) continue;
    refs.push({
      volume: route.volume,
      book: route.book,
      bookLabel: route.label,
      chapter,
      verses,
    });
  }

  return refs;
}

function isToolSegment(segment: string): boolean {
  const upper = segment.toUpperCase();
  return TOOL_TOKENS.some((token) => upper.startsWith(`${token} `) || upper === token);
}

function isScriptureSegment(segment: string): boolean {
  let matchedAlias: AliasEntry | null = null;
  for (const alias of BOOK_ALIAS_ENTRIES) {
    const re = new RegExp(`^${escapeRegex(alias.alias)}(?:\\.)?\\s+`, "i");
    if (re.test(segment)) {
      matchedAlias = alias;
      break;
    }
  }
  if (!matchedAlias) return false;

  const remainder = segment.replace(new RegExp(`^${escapeRegex(matchedAlias.alias)}(?:\\.)?\\s+`, "i"), "");
  const cv = remainder.match(/^(\d{1,3})(?::\s*([\d,\-\s()]{1,120}))?\s*\.?$/);
  if (!cv) return false;
  const chapter = Number(cv[1]);
  return Number.isFinite(chapter) && chapter > 0;
}

export function hasUnparsedFootnoteContent(footnote: string): boolean {
  const segments = splitFootnoteSegments(footnote);
  if (segments.length === 0) return false;
  return segments.some((segment) => !isToolSegment(segment) && !isScriptureSegment(segment));
}
