import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchVerseCitations, mapBookKeyToByuId } from "@/lib/citations";
import { convexMutation, convexQuery } from "@/lib/convexHttp";

type ScriptureResource = {
  id: string;
  resourceType: "verse" | "verse_range" | "chapter" | "chapter_range";
  title: string;
  description: string | null;
  url: string | null;
  chapterStart: number;
  chapterEnd: number;
  verseStart: number | null;
  verseEnd: number | null;
};

function parseAdminIds(): string[] {
  return (process.env.ADMIN_CLERK_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  return parseAdminIds().includes(userId);
}

export async function GET(req: NextRequest) {
  const authState = await auth();
  const canManageResources = isAdmin(authState.userId);
  const { searchParams } = new URL(req.url);
  const volume = (searchParams.get("volume") || "").toLowerCase();
  const book = (searchParams.get("book") || "").toLowerCase();
  const chapterStr = searchParams.get("chapter") || "";
  const verses = searchParams.get("verses") || "";

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

  const byuId = mapBookKeyToByuId(volume, book);
  if (!byuId) {
    return NextResponse.json({ error: "Unsupported book mapping" }, { status: 400 });
  }

  let resources: ScriptureResource[] = [];
  try {
    resources = await convexQuery<ScriptureResource[]>("resources:listForSelection", {
      volume,
      book,
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
      return NextResponse.json({ bookId: byuId, chapter, verseSpec: verses, talks: cached.talks, resources, canManageResources });
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
  return NextResponse.json({ ...data, resources, canManageResources });
}

export async function POST(req: NextRequest) {
  const authState = await auth();
  const userId = authState.userId;
  if (!isAdmin(userId)) {
    return NextResponse.json({ error: "Only admins can add resources" }, { status: 403 });
  }

  const token = await authState.getToken({ template: "convex" });
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const body = (await req.json()) as {
    volume: string;
    book: string;
    resourceType: "verse" | "verse_range" | "chapter" | "chapter_range";
    title: string;
    description?: string;
    url?: string;
    chapterStart: number;
    chapterEnd: number;
    verseStart?: number;
    verseEnd?: number;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  await convexMutation(
    "resources:create",
    {
      volume: body.volume,
      book: body.book,
      resourceType: body.resourceType,
      title: body.title,
      description: body.description,
      url: body.url,
      chapterStart: body.chapterStart,
      chapterEnd: body.chapterEnd,
      verseStart: body.verseStart,
      verseEnd: body.verseEnd,
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
