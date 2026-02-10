import { NextRequest, NextResponse } from "next/server";
import { fetchVerseCitations, mapBookKeyToByuId } from "@/lib/citations";
import { convexMutation, convexQuery } from "@/lib/convexHttp";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const volume = (searchParams.get("volume") || "").toLowerCase();
  const book = (searchParams.get("book") || "").toLowerCase();
  const chapterStr = searchParams.get("chapter") || "";
  const verses = searchParams.get("verses") || ""; // e.g. "1" or "1-2"

  if (!book || !chapterStr || !verses) {
    return NextResponse.json({ error: "Missing book, chapter, or verses" }, { status: 400 });
  }
  const chapter = Number(chapterStr);
  if (!Number.isFinite(chapter) || chapter <= 0) {
    return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });
  }
  const byuId = mapBookKeyToByuId(volume, book);
  if (!byuId) {
    return NextResponse.json({ error: "Unsupported book mapping" }, { status: 400 });
  }
  try {
    const cached = await convexQuery<{ talks: unknown[]; stale: boolean } | null>(
      "cache:getCitation",
      { bookByuId: byuId, chapter, verseSpec: verses }
    );
    if (cached && Array.isArray(cached.talks) && cached.talks.length > 0) {
      if (cached.stale) {
        void refreshCitation(byuId, chapter, verses);
      }
      return NextResponse.json({ bookId: byuId, chapter, verseSpec: verses, talks: cached.talks });
    }
  } catch {
    // Fall through to live fetch.
  }

  const data = await fetchVerseCitations(byuId, chapter, verses);
  if (!data) return NextResponse.json({ error: "Failed to load citations" }, { status: 502 });
  try {
    await convexMutation("cache:upsertCitation", {
      bookByuId: byuId,
      chapter,
      verseSpec: verses,
      talks: data.talks,
      fetchedAt: Date.now(),
    });
  } catch {
    // Non-fatal cache write failure.
  }
  return NextResponse.json(data);
}

async function refreshCitation(bookByuId: number, chapter: number, verseSpec: string) {
  try {
    const fresh = await fetchVerseCitations(bookByuId, chapter, verseSpec);
    if (!fresh) return;
    await convexMutation("cache:upsertCitation", {
      bookByuId,
      chapter,
      verseSpec,
      talks: fresh.talks,
      fetchedAt: Date.now(),
    });
  } catch {
    // Best-effort stale refresh.
  }
}


