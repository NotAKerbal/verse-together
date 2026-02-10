import { getBibleBookBySlug, isBibleTranslationId, normalizeBibleTranslationId } from "@/lib/bibleCanon";

export type BibleApiChapterResponse = {
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

function parseVerses(raw: unknown): Array<{ verse: number; text: string }> {
  const list = Array.isArray(get(raw, "verses")) ? (get(raw, "verses") as unknown[]) : [];
  return list
    .map((item) => {
      const verse = getNumber(item, "verse");
      const text = getString(item, "text")?.trim() ?? "";
      if (!verse || !text) return null;
      return { verse, text };
    })
    .filter(Boolean) as Array<{ verse: number; text: string }>;
}

function buildResponse(raw: unknown, fallbackReference: string, translationId: string): BibleApiChapterResponse {
  const reference = getString(raw, "reference")?.trim() || fallbackReference;
  const translationName = getString(raw, "translation_name");
  const verses = parseVerses(raw);
  return {
    reference,
    translationId,
    translationName: translationName || undefined,
    verses,
  };
}

export async function fetchBibleApiChapter(
  bookSlug: string,
  chapterNumber: number,
  translationInput?: string
): Promise<BibleApiChapterResponse> {
  const normalized = normalizeBibleTranslationId(translationInput);
  const translationId = isBibleTranslationId(normalized) ? normalized : "kjv";
  const book = getBibleBookBySlug(bookSlug);
  if (!book) {
    throw new Error(`Unknown Bible book: ${bookSlug}`);
  }
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
    throw new Error("Invalid chapter number");
  }

  const fallbackReference = `${book.label} ${chapterNumber}`;
  const primaryUrl = `https://bible-api.com/data/${encodeURIComponent(translationId)}/${encodeURIComponent(book.id)}/${encodeURIComponent(String(chapterNumber))}`;
  const backupUrl = `https://bible-api.com/${encodeURIComponent(book.label)}+${encodeURIComponent(String(chapterNumber))}?translation=${encodeURIComponent(translationId)}`;

  const primary = await fetch(primaryUrl, { next: { revalidate: 60 } });
  if (primary.ok) {
    const raw: unknown = await primary.json();
    const parsed = buildResponse(raw, fallbackReference, translationId);
    if (parsed.verses.length > 0) return parsed;
  }

  const backup = await fetch(backupUrl, { next: { revalidate: 60 } });
  if (!backup.ok) {
    throw new Error(`Bible API error ${backup.status}`);
  }
  const backupRaw: unknown = await backup.json();
  const fallbackParsed = buildResponse(backupRaw, fallbackReference, translationId);
  if (fallbackParsed.verses.length === 0) {
    throw new Error("Bible API returned no verses");
  }
  return fallbackParsed;
}
