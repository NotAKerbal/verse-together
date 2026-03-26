import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchVerseCitations, mapBookKeyToByuId } from "@/lib/citations";
import type { CitationsResponse, CreateScriptureResourceRequest, ScriptureResource } from "@/lib/citationsApi";
import { convexMutation, convexQuery } from "@/lib/convexHttp";
import { getLocalLdsBooks } from "@/lib/ldsLocalData.server";

async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    return await convexQuery<boolean>("users:isAdmin", { clerkId: userId });
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const volume = (searchParams.get("volume") || "").toLowerCase();
  const book = (searchParams.get("book") || "").toLowerCase();
  const chapterStr = searchParams.get("chapter") || "";
  const verses = searchParams.get("verses") || "";
  const selectedVersesParam = searchParams.get("selectedVerses") || "";
  const selectedText = searchParams.get("selectedText") || undefined;

  if (!book || !chapterStr || !verses) {
    return NextResponse.json({ error: "Missing book, chapter, or verses" }, { status: 400 });
  }
  const chapter = Number(chapterStr);
  if (!Number.isFinite(chapter) || chapter <= 0) {
    return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });
  }
  const [startRaw, endRaw] = verses.split("-");
  const verseStart = Number(startRaw);
  const verseEnd = Number(endRaw ?? startRaw);
  const selectedVerses = selectedVersesParam
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const byuId = mapBookKeyToByuId(volume, book);
  if (!byuId) {
    return NextResponse.json({ error: "Unsupported book mapping" }, { status: 400 });
  }

  const books = await getLocalLdsBooks(volume);
  const bookOrder = books.findIndex((item) => item.id === book);
  const selection = {
    volume,
    book,
    chapter,
    verseStart,
    verseEnd,
    verseSpec: verses,
    selectedVerses:
      selectedVerses.length > 0 ? selectedVerses : Array.from({ length: verseEnd - verseStart + 1 }, (_, index) => verseStart + index),
    selectedText,
  };

  let resources: ScriptureResource[] = [];
  try {
    resources = await convexQuery<ScriptureResource[]>("resources:listForSelection", {
      volume,
      book,
      bookOrder: bookOrder >= 0 ? bookOrder : undefined,
      chapter,
      verseStart,
      verseEnd,
    });
  } catch {
    resources = [];
  }

  try {
    const cached = await convexQuery<{ talks: unknown[]; stale: boolean } | null>("cache:getCitation", {
      bookByuId: byuId,
      chapter,
      verseSpec: verses,
    });
    if (cached && Array.isArray(cached.talks) && cached.talks.length > 0) {
      if (cached.stale) void refreshCitation(byuId, chapter, verses);
      const response: CitationsResponse = { bookId: byuId, chapter, verseSpec: verses, talks: cached.talks as any, resources, selection };
      return NextResponse.json(response);
    }
  } catch {
    // continue to live fetch
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
  const response: CitationsResponse = { ...data, resources, selection };
  return NextResponse.json(response);
}

export async function POST(req: NextRequest) {
  const authState = await auth();
  const userId = authState.userId;
  if (!(await isAdmin(userId))) {
    return NextResponse.json({ error: "Only admins can add resources" }, { status: 403 });
  }

  const token = await authState.getToken({ template: "convex" });
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const body = (await req.json()) as CreateScriptureResourceRequest & {
    book?: string;
    bookEnd?: string;
    bookOrder?: number;
    bookEndOrder?: number;
    resourceType?: "verse" | "verse_range" | "chapter" | "chapter_range";
    chapterStart?: number;
    chapterEnd?: number;
    verseStart?: number;
    verseEnd?: number;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const coverages =
    Array.isArray(body.coverages) && body.coverages.length > 0
      ? body.coverages
      : body.book &&
          body.resourceType &&
          typeof body.chapterStart === "number" &&
          typeof body.chapterEnd === "number"
        ? [
            {
              book: body.book,
              bookEnd: body.bookEnd ?? body.book,
              bookOrder: body.bookOrder,
              bookEndOrder: body.bookEndOrder,
              resourceType: body.resourceType,
              chapterStart: body.chapterStart,
              chapterEnd: body.chapterEnd,
              verseStart: body.verseStart ?? null,
              verseEnd: body.verseEnd ?? null,
            },
          ]
        : [];

  if (coverages.length === 0) {
    return NextResponse.json({ error: "At least one coverage is required" }, { status: 400 });
  }

  await convexMutation(
    "resources:create",
    {
      volume: body.volume,
      coverages: coverages.map((coverage) => ({
        ...coverage,
        bookEnd: coverage.bookEnd ?? coverage.book,
        verseStart: coverage.verseStart ?? undefined,
        verseEnd: coverage.verseEnd ?? undefined,
      })),
      title: body.title,
      description: body.description,
      url: body.url,
    },
    token
  );

  return NextResponse.json({ ok: true });
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
