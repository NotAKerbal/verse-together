export type ChapterResponse = {
  reference: string;
  verses: Array<{
    verse: number;
    text: string;
  }>;
};

const BASE_URL = "https://openscriptureapi.org/api/scriptures/v1/lds/en";

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
  let raw: any = null;
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
  const chapters = Array.isArray(raw.chapters) ? raw.chapters : [];
  return {
    _id: String(raw._id ?? bookId),
    title: String(raw.title ?? bookId),
    titleShort: raw.titleShort ?? undefined,
    titleOfficial: raw.titleOfficial ?? undefined,
    subtitle: raw.subtitle ?? undefined,
    summary: raw.summary ?? undefined,
    chapterDelineation: raw.chapterDelineation ?? undefined,
    chapters: chapters.map((c: any) => ({ _id: String(c._id ?? ""), summary: c.summary ?? undefined })),
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


