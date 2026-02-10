import { getBibleBookBySlug } from "@/lib/bibleCanon";

export type HelloaoTranslation = {
  id: string;
  name: string;
  englishName?: string;
  shortName?: string;
  language?: string;
  languageEnglishName?: string;
};

export type HelloaoChapterResponse = {
  reference: string;
  translationId: string;
  translationName?: string;
  verses: Array<{ verse: number; text: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function get(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function getString(obj: unknown, key: string): string | undefined {
  const value = get(obj, key);
  return typeof value === "string" ? value : undefined;
}

function getNumber(obj: unknown, key: string): number | undefined {
  const value = get(obj, key);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function flattenContent(content: unknown[]): string {
  return content
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (!isRecord(entry)) return "";
      const text = getString(entry, "text");
      if (text) return text;
      const heading = getString(entry, "heading");
      if (heading) return heading;
      if (get(entry, "lineBreak") === true) return "\n";
      return "";
    })
    .join("")
    .replace(/\s+\n/g, "\n")
    .trim();
}

export async function fetchAvailableHelloaoTranslations(): Promise<HelloaoTranslation[]> {
  const url = "https://bible.helloao.org/api/available_translations.json";
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) {
    throw new Error(`HelloAO translations error ${res.status}`);
  }
  const raw: unknown = await res.json();
  const translations = Array.isArray(get(raw, "translations")) ? (get(raw, "translations") as unknown[]) : [];
  return translations
    .map((item) => {
      const id = getString(item, "id")?.trim();
      if (!id) return null;
      const name = getString(item, "name")?.trim() || id;
      return {
        id,
        name,
        englishName: getString(item, "englishName")?.trim() || undefined,
        shortName: getString(item, "shortName")?.trim() || undefined,
        language: getString(item, "language")?.trim() || undefined,
        languageEnglishName: getString(item, "languageEnglishName")?.trim() || undefined,
      };
    })
    .filter(Boolean) as HelloaoTranslation[];
}

export async function fetchHelloaoChapter(
  bookSlug: string,
  chapterNumber: number,
  translationId: string
): Promise<HelloaoChapterResponse> {
  const book = getBibleBookBySlug(bookSlug);
  if (!book) throw new Error(`Unknown Bible book: ${bookSlug}`);
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
    throw new Error("Invalid chapter number");
  }
  const normalizedTranslationId = translationId.trim();
  if (!normalizedTranslationId) {
    throw new Error("Missing translation id");
  }

  const attemptIds = [normalizedTranslationId];
  const upper = normalizedTranslationId.toUpperCase();
  if (upper !== normalizedTranslationId) attemptIds.push(upper);

  let res: Response | null = null;
  for (const candidateId of attemptIds) {
    const url = `https://bible.helloao.org/api/${encodeURIComponent(candidateId)}/${encodeURIComponent(book.id)}/${encodeURIComponent(String(chapterNumber))}.json`;
    const candidateRes = await fetch(url, { next: { revalidate: 60 } });
    if (candidateRes.ok) {
      res = candidateRes;
      break;
    }
    res = candidateRes;
  }
  if (!res?.ok) {
    throw new Error(`HelloAO chapter error ${res?.status ?? 500}`);
  }

  const raw: unknown = await res.json();
  const chapter = isRecord(get(raw, "chapter")) ? (get(raw, "chapter") as Record<string, unknown>) : undefined;
  const content = Array.isArray(chapter?.content) ? (chapter?.content as unknown[]) : [];

  const verses = content
    .map((entry) => {
      if (!isRecord(entry) || getString(entry, "type") !== "verse") return null;
      const verseNumber = getNumber(entry, "number");
      const verseContent = Array.isArray(get(entry, "content")) ? (get(entry, "content") as unknown[]) : [];
      const text = flattenContent(verseContent);
      if (!verseNumber || !text) return null;
      return { verse: verseNumber, text };
    })
    .filter(Boolean) as Array<{ verse: number; text: string }>;

  if (verses.length === 0) {
    throw new Error("HelloAO returned no verses");
  }

  const translation = isRecord(get(raw, "translation"))
    ? (get(raw, "translation") as Record<string, unknown>)
    : undefined;
  const translationName =
    getString(translation, "englishName") || getString(translation, "name") || undefined;
  const bookName = getString(get(raw, "book"), "commonName") || book.label;
  const chapterNum = getNumber(chapter, "number") || chapterNumber;
  return {
    reference: `${bookName} ${chapterNum}`,
    translationId: getString(translation, "id") || normalizedTranslationId,
    translationName,
    verses,
  };
}
