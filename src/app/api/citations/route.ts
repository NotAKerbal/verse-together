import { NextRequest, NextResponse } from "next/server";
import { fetchVerseCitations, mapBookKeyToByuId } from "@/lib/citations";

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
  const data = await fetchVerseCitations(byuId, chapter, verses);
  if (!data) {
    return NextResponse.json({ error: "Failed to load citations" }, { status: 502 });
  }
  return NextResponse.json(data);
}


