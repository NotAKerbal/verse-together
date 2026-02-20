import { NextRequest, NextResponse } from "next/server";
import { fetchChapter } from "@/lib/openscripture";
import { QUICK_NAV_BOOKS } from "@/lib/scriptureQuickNav";

type CacheEntry = {
  expiresAt: number;
  verseCounts: number[];
};

const META_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

function keyFor(volume: string, book: string): string {
  return `${volume}:${book}`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const volume = (url.searchParams.get("volume") || "").trim();
  const book = (url.searchParams.get("book") || "").trim();

  if (!volume || !book) {
    return NextResponse.json({ error: "Missing volume or book." }, { status: 400 });
  }

  const bookMeta = QUICK_NAV_BOOKS.find((item) => item.volume === volume && item.book === book);
  if (!bookMeta) {
    return NextResponse.json({ error: "Unknown book." }, { status: 404 });
  }

  const cacheKey = keyFor(volume, book);
  const cached = META_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ volume, book, chapterCount: bookMeta.chapters, verseCounts: cached.verseCounts });
  }

  const verseCounts = Array.from({ length: bookMeta.chapters }, () => 0);

  // Batch requests to avoid hammering upstream while still warming cache quickly.
  const BATCH_SIZE = 6;
  for (let chapter = 1; chapter <= bookMeta.chapters; chapter += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, bookMeta.chapters - chapter + 1) }, (_, idx) => chapter + idx);
    const results = await Promise.allSettled(
      batch.map((chapterNumber) => fetchChapter(volume, book, chapterNumber))
    );
    results.forEach((result, idx) => {
      const chapterNumber = batch[idx];
      if (!chapterNumber) return;
      if (result.status === "fulfilled") {
        verseCounts[chapterNumber - 1] = result.value.verses.length;
      }
    });
  }

  META_CACHE.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    verseCounts,
  });

  return NextResponse.json({ volume, book, chapterCount: bookMeta.chapters, verseCounts });
}
