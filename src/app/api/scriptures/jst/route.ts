import { NextRequest, NextResponse } from "next/server";
import { handleJstRequest } from "@/lib/jstApi.server";

/**
 * A Bible chapter's Joseph Smith Translation appendix excerpts, each anchored at the KJV verse it compares to.
 * 200 with an empty list means the appendix has none for the chapter; 400 for a non-Bible or invalid chapter;
 * 502/504 when the source couldn't be read.
 */
export async function GET(request: NextRequest) {
  const result = await handleJstRequest(new URL(request.url).searchParams);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": result.cacheControl } });
}
