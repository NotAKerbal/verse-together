import { NextResponse } from "next/server";
import { getCuratedFeedSections } from "@/lib/feedCatalog";

export async function GET() {
  try {
    const payload = await getCuratedFeedSections();
    return NextResponse.json(
      { ok: true, ...payload },
      {
        headers: {
          "cache-control": "public, s-maxage=1800, stale-while-revalidate=1800",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load curated feed",
      },
      {
        status: 500,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  }
}
