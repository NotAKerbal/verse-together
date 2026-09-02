import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  CHAPTER_INSIGHT_PROMPT_VERSION,
  extractChapterInsightResponse,
  parseChapterStudyPaths,
  stableJsonStringify,
  type ChapterStudyPath,
  type OpenAiChapterInsightResponse,
} from "@/lib/chapterInsights";
import { buildChapterInsightResponseBody } from "@/lib/chapterInsightRequest";
import { convexMutation, convexQuery } from "@/lib/convexHttp";
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
  signature: string;
};

function boundedSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 100 ? normalized : null;
}

function cacheSignature(
  apiKey: string,
  payload: Omit<CachedChapterInsight, "signature">
): string {
  return createHmac("sha256", apiKey).update(stableJsonStringify(payload)).digest("hex");
}

function hasValidSignature(apiKey: string, cached: CachedChapterInsight): boolean {
  if (!/^[a-f0-9]{64}$/i.test(cached.signature)) return false;
  const expected = cacheSignature(apiKey, {
    reference: cached.reference,
    scriptureHash: cached.scriptureHash,
    promptVersion: cached.promptVersion,
    paths: cached.paths,
    generatedAt: cached.generatedAt,
  });
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(cached.signature, "hex"));
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "AI insights are not configured yet." }, { status: 503 });
  }

  let payload: ChapterRequest;
  try {
    payload = (await request.json()) as ChapterRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const volume = boundedSlug(payload.volume);
  const book = boundedSlug(payload.book);
  const chapter = typeof payload.chapter === "number" && Number.isInteger(payload.chapter) ? payload.chapter : null;
  if (!volume || !book || chapter === null || chapter < 1 || chapter > 250) {
    return NextResponse.json({ error: "Invalid chapter." }, { status: 400 });
  }

  const scripture = await getLocalLdsChapter(volume, book, chapter);
  if (!scripture) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  const chapterText = scripture.verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n");
  const scriptureHash = createHash("sha256").update(chapterText).digest("hex");

  try {
    const cached = await convexQuery<CachedChapterInsight | null>("chapterInsights:getChapterInsight", {
      volume,
      book,
      chapter,
    });
    if (
      cached &&
      cached.scriptureHash === scriptureHash &&
      cached.promptVersion === CHAPTER_INSIGHT_PROMPT_VERSION &&
      hasValidSignature(apiKey, cached)
    ) {
      return NextResponse.json({
        reference: cached.reference,
        paths: cached.paths,
        generated_at: new Date(cached.generatedAt).toISOString(),
        cached: true,
      });
    }
  } catch (error) {
    console.warn("Chapter insight cache read failed", error);
  }

  const authState = await auth();
  if (!authState.userId) {
    return NextResponse.json({ error: "Sign in to generate chapter insights." }, { status: 401 });
  }

  let convexToken: string | null = null;
  try {
    convexToken = await authState.getToken({ template: "convex" });
  } catch (error) {
    console.warn("Could not get a Convex token for chapter insight caching", error);
  }

  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildChapterInsightResponseBody(scripture.reference, scripture.verses)),
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });

    const response = (await openAiResponse.json()) as OpenAiChapterInsightResponse;
    if (!openAiResponse.ok) {
      console.error("OpenAI chapter insight request failed", openAiResponse.status, response.error?.message ?? "Unknown error");
      return NextResponse.json({ error: "Chapter insights could not finish researching." }, { status: 502 });
    }

    const extracted = extractChapterInsightResponse(response);
    const parsedPaths = parseChapterStudyPaths(
      extracted.text,
      new Set(scripture.verses.map((verse) => verse.verse)),
      extracted.sources
    );
    const paths = await Promise.all(
      parsedPaths.map(async (path) => ({
        ...path,
        scripture_links: (
          await Promise.all(
            path.scripture_links.map(async (link) => {
              const linkedChapter = await getLocalLdsChapter(link.volume, link.book, link.chapter);
              const lastVerse = linkedChapter?.verses.at(-1)?.verse ?? 0;
              return linkedChapter && link.verse_start <= lastVerse && link.verse_end <= lastVerse ? link : null;
            })
          )
        ).filter((link): link is NonNullable<typeof link> => link !== null),
      }))
    );
    if (paths.length === 0) {
      return NextResponse.json({ error: "No well-supported study paths were found." }, { status: 502 });
    }

    const generatedAt = Date.now();
    const unsignedCache = {
      reference: scripture.reference,
      scriptureHash,
      promptVersion: CHAPTER_INSIGHT_PROMPT_VERSION,
      paths,
      generatedAt,
    };
    const signature = cacheSignature(apiKey, unsignedCache);

    if (convexToken) {
      try {
        await convexMutation(
          "chapterInsights:upsertChapterInsight",
          { volume, book, chapter, ...unsignedCache, signature },
          convexToken
        );
      } catch (error) {
        console.warn("Chapter insight cache write failed", error);
      }
    }

    return NextResponse.json({
      reference: scripture.reference,
      paths,
      generated_at: new Date(generatedAt).toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error("OpenAI chapter insight request failed", error);
    return NextResponse.json({ error: "Chapter insights are temporarily unavailable." }, { status: 502 });
  }
}
