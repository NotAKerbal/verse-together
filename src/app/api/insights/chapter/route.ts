import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CHAPTER_INSIGHT_PROMPT_VERSION, type ChapterInsightResult, type ChapterStudyPath } from "@/lib/chapterInsights";
import { convexQuery } from "@/lib/convexHttp";
import { getLocalLdsChapter } from "@/lib/ldsLocalData.server";

type ChapterRequest = {
  volume?: unknown;
  book?: unknown;
  chapter?: unknown;
};

type CachedChapterInsight = {
  reference: string;
  scriptureHash: string;
  promptVersion: number;
  paths: ChapterStudyPath[];
  generatedAt: number;
};

function boundedSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 100 ? normalized : null;
}

async function cachedStudyPaths({ volume: rawVolume, book: rawBook, chapter }: ChapterRequest) {
  const volume = boundedSlug(rawVolume);
  const book = boundedSlug(rawBook);
  if (!volume || !book || typeof chapter !== "number" || !Number.isInteger(chapter) || chapter < 1 || chapter > 250) {
    return NextResponse.json({ error: "Invalid chapter." }, { status: 400 });
  }

  const scripture = await getLocalLdsChapter(volume, book, chapter);
  if (!scripture) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  const chapterText = scripture.verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n");
  const scriptureHash = createHash("sha256").update(chapterText).digest("hex");

  let cached: CachedChapterInsight | null;
  try {
    cached = await convexQuery<CachedChapterInsight | null>("chapterInsights:getChapterInsight", { volume, book, chapter });
  } catch (error) {
    console.warn("Chapter insight cache read failed", error);
    return NextResponse.json({ error: "Chapter insights are temporarily unavailable." }, { status: 503 });
  }

  const usable = cached && cached.scriptureHash === scriptureHash && cached.promptVersion === CHAPTER_INSIGHT_PROMPT_VERSION;
  const result: ChapterInsightResult = usable
    ? { reference: cached!.reference, paths: cached!.paths, generated_at: new Date(cached!.generatedAt).toISOString(), cached: true }
    : { reference: scripture.reference, paths: [], generated_at: null, cached: false };
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return await cachedStudyPaths({
    volume: params.get("volume"),
    book: params.get("book"),
    chapter: Number(params.get("chapter")),
  });
}

export async function POST(request: NextRequest) {
  let payload: ChapterRequest;
  try {
    payload = (await request.json()) as ChapterRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  return await cachedStudyPaths(payload ?? {});
}
