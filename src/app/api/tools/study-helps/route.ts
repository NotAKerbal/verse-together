import { NextRequest, NextResponse } from "next/server";
import {
  StudyHelpRequestError,
  isPublishedStudyHelpTopic,
  loadStudyHelpEntry,
} from "@/lib/studyHelpContent.server";

// GET ?guide=bd|gs|tg&slug=<published topic slug>: the entry's text as structured content (see studyHelpContent.ts).
export async function GET(request: NextRequest) {
  const guide = request.nextUrl.searchParams.get("guide");
  const slug = request.nextUrl.searchParams.get("slug");
  if (!isPublishedStudyHelpTopic(guide, slug)) {
    return NextResponse.json({ ok: false, error: "Unknown study helps topic." }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  try {
    const entry = await loadStudyHelpEntry(guide, slug as string);
    return NextResponse.json(
      { ok: true, entry },
      { headers: { "cache-control": "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400" } }
    );
  } catch (error) {
    const status = error instanceof StudyHelpRequestError ? error.status : 502;
    const message = status === 404 ? "The entry was not found." : status === 504 ? "The entry took too long to load." : "The entry could not be loaded.";
    return NextResponse.json({ ok: false, error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
