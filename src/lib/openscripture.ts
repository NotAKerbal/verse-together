export type Footnote = {
  footnote: string;
  start?: number;
  end?: number;
};

export type ChapterResponse = {
  reference: string;
  verses: Array<{
    verse: number;
    text: string;
    footnotes?: Footnote[];
  }>;
};

const BASE_URL = "https://openscriptureapi.org/api/scriptures/v1/lds/en";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function get(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function getString(obj: unknown, key: string): string | undefined {
  const v = get(obj, key);
  return typeof v === "string" ? v : undefined;
}

function getNumber(obj: unknown, key: string): number | undefined {
  const v = get(obj, key);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function getArray(obj: unknown, key: string): unknown[] {
  const v = get(obj, key);
  return Array.isArray(v) ? v : [];
}

function getObject(obj: unknown, key: string): Record<string, unknown> | undefined {
  const v = get(obj, key);
  return isRecord(v) ? v : undefined;
}

function coerceToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export type BookResponse = {
  _id: string;
  title: string;
  titleShort?: string;
  titleOfficial?: string;
  subtitle?: string;
  summary?: string;
  chapterDelineation?: string;
  chapters: Array<{
    _id: string;
    summary?: string;
  }>;
};

export async function fetchBook(volumeId: string, bookId: string): Promise<BookResponse> {
  // Try volume/book form first, then fallback to book/id form per docs
  // Docs: "GET /book/[id] OR /volume/[volume_id]/[book_id]" (Books) – see docs/books
  // https://openscriptureapi.org/docs/books
  const urls = [
    `${BASE_URL}/volume/${encodeURIComponent(volumeId)}/${encodeURIComponent(bookId)}`,
    `${BASE_URL}/book/${encodeURIComponent(bookId)}`,
  ];

  let lastStatus = 0;
  let raw: unknown = null;
  for (const url of urls) {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (res.ok) {
      raw = await res.json();
      break;
    }
    lastStatus = res.status;
  }
  if (!raw) {
    throw new Error(`OpenScripture API error ${lastStatus || 400}`);
  }
  const obj: Record<string, unknown> | undefined = isRecord(raw) ? raw : undefined;
  const chapters: unknown[] = obj ? (Array.isArray(obj.chapters) ? obj.chapters : []) : [];
  return {
    _id: getString(obj, "_id") ?? String(bookId),
    title: getString(obj, "title") ?? String(bookId),
    titleShort: getString(obj, "titleShort") ?? undefined,
    titleOfficial: getString(obj, "titleOfficial") ?? undefined,
    subtitle: getString(obj, "subtitle") ?? undefined,
    summary: getString(obj, "summary") ?? undefined,
    chapterDelineation: getString(obj, "chapterDelineation") ?? undefined,
    chapters: chapters.map((c: unknown) => {
      const id = getString(c, "_id") ?? "";
      const summary = getString(c, "summary") ?? undefined;
      return { _id: String(id), summary };
    }),
  };
}

export async function fetchChapter(
  volumeId: string,
  bookId: string,
  chapterNumber: string | number
): Promise<ChapterResponse> {
  const url = `${BASE_URL}/volume/${encodeURIComponent(volumeId)}/${encodeURIComponent(bookId)}/${encodeURIComponent(String(chapterNumber))}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`OpenScripture API error ${res.status}`);
  }
  const raw: unknown = await res.json();

  const explicitReference = getString(raw, "reference");
  const bookObj = getObject(raw, "book");
  const chapterObj = getObject(raw, "chapter");
  const bookTitle = getString(bookObj, "title") ?? bookId;
  const chapterNum = getNumber(chapterObj, "number") ?? Number(chapterNumber);
  const reference: string =
    explicitReference && explicitReference.length > 0
      ? explicitReference
      : [bookTitle, String(chapterNum)].filter(Boolean).join(" ");

  const versesFromRoot = getArray(raw, "verses");
  const versesFromChapter = chapterObj ? getArray(chapterObj, "verses") : [];
  const versesFromContent = getArray(raw, "content");
  const sourceVerses: unknown[] =
    versesFromRoot.length > 0
      ? versesFromRoot
      : versesFromChapter.length > 0
      ? versesFromChapter
      : versesFromContent;

  const verses = sourceVerses
    .map((v: unknown, idx: number) => {
      const verseNumber =
        getNumber(v, "verse") ?? getNumber(v, "number") ?? getNumber(v, "verseNumber") ?? idx + 1;
      const textRaw = coerceToString(
        get(v, "text") ?? get(v, "content") ?? get(v, "body")
      );
      const text = textRaw.trim();

      // Attempt to parse footnotes if present in API response
      const rawFootnotes = Array.isArray(get(v, "footnotes")) ? (get(v, "footnotes") as unknown[]) : [];
      const footnotes: Footnote[] = rawFootnotes
        .map((fn: unknown) => {
          const footnoteText = getString(fn, "footnote") ?? coerceToString(fn).trim();
          if (!footnoteText) return null;
          const s = getNumber(fn, "start");
          const e = getNumber(fn, "end");
          const out: Footnote = { footnote: footnoteText };
          if (typeof s === "number" && Number.isFinite(s)) out.start = s;
          if (typeof e === "number" && Number.isFinite(e)) out.end = e;
          return out;
        })
        .filter(Boolean) as Footnote[];

      if (verseNumber > 0 && text) {
        return footnotes.length > 0
          ? { verse: verseNumber, text, footnotes }
          : { verse: verseNumber, text };
      }
      return null;
    })
    .filter(Boolean) as ChapterResponse["verses"];

  return { reference: reference || `${bookId} ${chapterNumber}`, verses };
}


export async function fetchChapterByBook(
  bookId: string,
  chapterNumber: string | number
): Promise<ChapterResponse> {
  const url = `${BASE_URL}/book/${encodeURIComponent(bookId)}/${encodeURIComponent(String(chapterNumber))}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`OpenScripture API error ${res.status}`);
  }
  const raw: unknown = await res.json();

  const explicitReference = getString(raw, "reference");
  const bookObj = getObject(raw, "book");
  const chapterObj = getObject(raw, "chapter");
  const bookTitle = getString(bookObj, "title") ?? bookId;
  const chapterNum = getNumber(chapterObj, "number") ?? Number(chapterNumber);
  const reference: string =
    explicitReference && explicitReference.length > 0
      ? explicitReference
      : [bookTitle, String(chapterNum)].filter(Boolean).join(" ");

  const versesFromRoot = getArray(raw, "verses");
  const versesFromChapter = chapterObj ? getArray(chapterObj, "verses") : [];
  const versesFromContent = getArray(raw, "content");
  const sourceVerses: unknown[] =
    versesFromRoot.length > 0
      ? versesFromRoot
      : versesFromChapter.length > 0
      ? versesFromChapter
      : versesFromContent;

  const verses = sourceVerses
    .map((v: unknown, idx: number) => {
      const verseNumber =
        getNumber(v, "verse") ?? getNumber(v, "number") ?? getNumber(v, "verseNumber") ?? idx + 1;
      const textRaw = coerceToString(
        get(v, "text") ?? get(v, "content") ?? get(v, "body")
      );
      const text = textRaw.trim();

      const rawFootnotes = Array.isArray(get(v, "footnotes")) ? (get(v, "footnotes") as unknown[]) : [];
      const footnotes: Footnote[] = rawFootnotes
        .map((fn: unknown) => {
          const footnoteText = getString(fn, "footnote") ?? coerceToString(fn).trim();
          if (!footnoteText) return null;
          const s = getNumber(fn, "start");
          const e = getNumber(fn, "end");
          const out: Footnote = { footnote: footnoteText };
          if (typeof s === "number" && Number.isFinite(s)) out.start = s;
          if (typeof e === "number" && Number.isFinite(e)) out.end = e;
          return out;
        })
        .filter(Boolean) as Footnote[];

      if (verseNumber > 0 && text) {
        return footnotes.length > 0
          ? { verse: verseNumber, text, footnotes }
          : { verse: verseNumber, text };
      }
      return null;
    })
    .filter(Boolean) as ChapterResponse["verses"];

  return { reference: reference || `${bookId} ${chapterNumber}`, verses };
}


export type ReferenceParserResult = {
  valid: boolean;
  prettyString?: string;
  references?: Array<{
    book: string;
    chapters: Array<{
      start: number;
      end: number;
      verses: Array<{ start: number; end: number }>;
    }>;
  }>;
  error?: string;
};

// Uses the Open Scripture "Plain Text Reference Parser" to normalize a reference string.
// Docs: https://openscriptureapi.org/docs/reference-parser
export async function parseReferenceString(reference: string): Promise<ReferenceParserResult | null> {
  const apiKey = process.env.NEXT_PUBLIC_OPENSCRIPTURE_API_KEY;
  if (!apiKey || !reference || reference.trim().length === 0) return null;
  const url = `${BASE_URL}/referencesParser?reference=${encodeURIComponent(reference)}&api-key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    const out: ReferenceParserResult = {
      valid: Boolean(get(raw, "valid")),
      prettyString: getString(raw, "prettyString") ?? undefined,
      error: getString(raw, "error") ?? undefined,
      references: Array.isArray(get(raw, "references"))
        ? (get(raw, "references") as Array<{
            book: string;
            chapters: Array<{
              start: number;
              end: number;
              verses: Array<{ start: number; end: number }>;
            }>;
          }>)
        : undefined,
    };
    return out;
  } catch {
    return null;
  }
}


