import { NextRequest, NextResponse } from "next/server";
import { getLocalLdsChapter } from "@/lib/ldsLocalData.server";

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const volume = (url.searchParams.get("volume") ?? "").trim();
  const book = (url.searchParams.get("book") ?? "").trim();
  const chapter = parsePositiveInt(url.searchParams.get("chapter"));

  if (!volume || !book || chapter == null) {
    return NextResponse.json({ error: "Missing volume, book, or chapter." }, { status: 400 });
  }

  const data = await getLocalLdsChapter(volume, book, chapter);
  if (!data) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  return NextResponse.json(data, { status: 200, headers: { "cache-control": "public, max-age=3600" } });
}
