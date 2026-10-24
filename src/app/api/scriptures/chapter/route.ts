import { NextRequest, NextResponse } from "next/server";
import { isBibleVolume } from "@/lib/bibleCanon";
import { isSubstitutedTranslation } from "@/lib/chapterRequestCache";
import { fetchChapterOnServer } from "@/lib/scriptureChapters.server";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * One chapter, in the bundled LDS text or (for the Bible) another translation. The reader loads comparison
 * translations through this after the primary text has rendered, so a slow translation API never delays it.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const volume = normalizeScriptureVolume((url.searchParams.get("volume") ?? "").trim());
  const book = (url.searchParams.get("book") ?? "").trim();
  const chapter = parsePositiveInt(url.searchParams.get("chapter"));
  const translation = (url.searchParams.get("translation") ?? "").trim() || undefined;

  if (!volume || !book || chapter == null) {
    return NextResponse.json({ error: "Missing volume, book, or chapter." }, { status: 400 });
  }

  try {
    const data = await fetchChapterOnServer(volume, book, chapter, { translation });
    if (!Array.isArray(data.verses) || data.verses.length === 0) {
      return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
    }
    // A translation that fell back to another text must not be cached, or recovery upstream would stay hidden.
    const substituted = isBibleVolume(volume) && isSubstitutedTranslation(translation, data.translation);
    const cacheControl = substituted ? "no-store" : "public, max-age=3600";
    return NextResponse.json(data, { status: 200, headers: { "cache-control": cacheControl } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load chapter." },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  }
}
