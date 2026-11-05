import { NextRequest, NextResponse } from "next/server";
import type { GenerationRequestResult } from "../../../../convex/chapterGuides";
import { chapterGuideSelectionState } from "@/lib/chapterGuideCompanion";
import { type ChapterParams, readChapterGuideState, scriptureFingerprint } from "@/lib/chapterGuideState.server";
import { CHAPTER_GUIDE_UNAVAILABLE_MESSAGES, type ChapterGuideAvailability } from "@/lib/chapterGuideView";
import { convexMutation } from "@/lib/convexHttp";
import { getLocalLdsChapter } from "@/lib/ldsLocalData.server";
import { getRequestViewer } from "@/lib/requestViewer";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_VERSE_SPEC_CHARS = 1000;
const MAX_VERSE = 199;

function chapterParams(volume: unknown, book: unknown, chapter: unknown): ChapterParams | null {
  const validSlug = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
  if (!validSlug(volume) || !validSlug(book)) return null;
  if (typeof chapter !== "number" || !Number.isInteger(chapter) || chapter < 1 || chapter > 250) return null;
  return { volume: normalizeScriptureVolume(volume), book, chapter };
}

function selectedVerses(spec: string): number[] | null {
  if (spec.length > MAX_VERSE_SPEC_CHARS || !/^\d+(,\d+)*$/.test(spec)) return null;
  const verses = [...new Set(spec.split(",").map(Number))].sort((left, right) => left - right);
  return verses.every((verse) => verse >= 1 && verse <= MAX_VERSE) ? verses : null;
}

function isCrossSiteRequest(request: NextRequest): boolean {
  if (request.headers.has("authorization")) return false;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "cross-site";
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const params = chapterParams(search.get("volume"), search.get("book"), Number(search.get("chapter")));
  if (!params) return NextResponse.json({ error: "Invalid chapter." }, { status: 400, headers: NO_STORE });
  const spec = search.get("verses");
  const verses = spec === null ? null : selectedVerses(spec);
  if (spec !== null && !verses) return NextResponse.json({ error: "Invalid verses." }, { status: 400, headers: NO_STORE });
  const scripture = await getLocalLdsChapter(params.volume, params.book, params.chapter);
  if (!scripture) return NextResponse.json({ error: "Chapter not found." }, { status: 404, headers: NO_STORE });
  try {
    const state = await readChapterGuideState(params, scripture);
    return NextResponse.json(verses ? chapterGuideSelectionState(state, params, verses) : state, { headers: NO_STORE });
  } catch (error) {
    console.warn("Chapter guide read failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Chapter guides are temporarily unavailable." }, { status: 503, headers: NO_STORE });
  }
}

function unavailableStatus(reason: ChapterGuideAvailability): number {
  if (reason === "user_limit" || reason === "daily_limit") return 429;
  if (reason === "cooldown" || reason === "busy" || reason === "needs_review") return 409;
  return 503;
}

export async function POST(request: NextRequest) {
  if (isCrossSiteRequest(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: NO_STORE });

  let body: { volume?: unknown; book?: unknown; chapter?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }
  const params = chapterParams(body.volume, body.book, body.chapter);
  if (!params) return NextResponse.json({ error: "Invalid chapter." }, { status: 400, headers: NO_STORE });

  const { viewer, token } = await getRequestViewer(request);
  if (!viewer || !token) {
    return NextResponse.json({ error: "Sign in to request a chapter guide." }, { status: 401, headers: NO_STORE });
  }
  const scripture = await getLocalLdsChapter(params.volume, params.book, params.chapter);
  if (!scripture) return NextResponse.json({ error: "Chapter not found." }, { status: 404, headers: NO_STORE });

  const serviceSecret = process.env.CHAPTER_GUIDE_SERVICE_SECRET?.trim();
  if (!serviceSecret) {
    return NextResponse.json({ status: "unavailable", reason: "not_configured", error: CHAPTER_GUIDE_UNAVAILABLE_MESSAGES.not_configured }, { status: 503, headers: NO_STORE });
  }

  try {
    const result = await convexMutation<GenerationRequestResult>(
      "chapterGuides:requestGeneration",
      {
        ...params,
        serviceSecret,
        reference: scripture.reference,
        scriptureHash: scriptureFingerprint(scripture).scriptureHash,
        verses: scripture.verses.map(({ verse, text }) => ({ verse, text })),
      },
      token
    );
    if (result.status === "unavailable") {
      const message = result.reason === "available" ? CHAPTER_GUIDE_UNAVAILABLE_MESSAGES.busy : CHAPTER_GUIDE_UNAVAILABLE_MESSAGES[result.reason];
      return NextResponse.json({ status: result.status, reason: result.reason, error: message }, { status: unavailableStatus(result.reason), headers: NO_STORE });
    }
    return NextResponse.json({ status: result.status }, { status: result.status === "started" ? 202 : 200, headers: NO_STORE });
  } catch (error) {
    console.warn("Chapter guide request failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Chapter guides are temporarily unavailable." }, { status: 503, headers: NO_STORE });
  }
}
