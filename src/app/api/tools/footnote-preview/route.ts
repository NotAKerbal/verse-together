import { NextRequest, NextResponse } from "next/server";
import { fetchChapter, fetchChapterByBook } from "@/lib/openscripture";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

function parseVerses(value: string | null): number[] {
  if (!value) return [];
  const out = new Set<number>();
  for (const token of value.split(",")) {
    const n = Number(token.trim());
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) out.add(n);
  }
  return Array.from(out.values()).sort((a, b) => a - b);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const volume = (url.searchParams.get("volume") || "").trim();
  const book = (url.searchParams.get("book") || "").trim();
  const chapter = parsePositiveInt(url.searchParams.get("chapter"));
  const verses = parseVerses(url.searchParams.get("verses"));

  if (!volume || !book || chapter == null) {
    return NextResponse.json({ error: "Missing required params: volume, book, chapter." }, { status: 400 });
  }

  try {
    let chapterData;
    try {
      chapterData = await fetchChapter(volume, book, chapter);
    } catch {
      // Fallback mirrors known-working chapter path for edge cases.
      chapterData = await fetchChapterByBook(book, chapter);
    }
    const verseSet = verses.length > 0 ? new Set(verses) : null;
    const filtered = verseSet
      ? chapterData.verses.filter((v) => verseSet.has(v.verse))
      : chapterData.verses;

    return NextResponse.json(
      {
        ok: true,
        reference: chapterData.reference,
        verses: filtered.map((v) => ({ verse: v.verse, text: v.text })),
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch chapter preview." },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}
