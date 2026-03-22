import { NextRequest, NextResponse } from "next/server";
import { getLocalLdsBooks } from "@/lib/ldsLocalData.server";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";

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
  const volume = normalizeScriptureVolume((url.searchParams.get("volume") || "").trim());
  const book = (url.searchParams.get("book") || "").trim();

  if (!volume || !book) {
    return NextResponse.json({ error: "Missing volume or book." }, { status: 400 });
  }

  const bookMeta = (await getLocalLdsBooks(volume)).find((item) => item.id === book);
  if (!bookMeta) {
    return NextResponse.json({ error: "Unknown book." }, { status: 404 });
  }

  const cacheKey = keyFor(volume, book);
  const cached = META_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ volume, book, chapterCount: bookMeta.chapters, verseCounts: cached.verseCounts });
  }

  const verseCounts = bookMeta.chapterVerseCounts;

  META_CACHE.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    verseCounts,
  });

  return NextResponse.json({ volume, book, chapterCount: bookMeta.chapters, verseCounts });
}
