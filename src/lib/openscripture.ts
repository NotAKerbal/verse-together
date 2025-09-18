export type ChapterResponse = {
  reference: string;
  verses: Array<{
    verse: number;
    text: string;
  }>;
};

const BASE_URL = "https://openscriptureapi.org/api/scriptures/v1/lds/en";

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
  const raw: any = await res.json();

  const reference: string =
    (typeof raw.reference === "string" && raw.reference) ||
    [raw.book?.title ?? bookId, raw.chapter?.number ?? String(chapterNumber)]
      .filter(Boolean)
      .join(" ");

  const sourceVerses: any[] = Array.isArray(raw.verses)
    ? raw.verses
    : Array.isArray(raw.chapter?.verses)
    ? raw.chapter.verses
    : Array.isArray(raw.content)
    ? raw.content
    : [];

  const verses = sourceVerses
    .map((v: any, idx: number) => {
      const verseNumber = Number(
        v.verse ?? v.number ?? v.verseNumber ?? idx + 1
      );
      const text = String(v.text ?? v.content ?? v.body ?? "").trim();
      return verseNumber > 0 && text
        ? { verse: verseNumber, text }
        : null;
    })
    .filter(Boolean) as ChapterResponse["verses"];

  return { reference: reference || `${bookId} ${chapterNumber}`, verses };
}


