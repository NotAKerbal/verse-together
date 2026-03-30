import { NextResponse } from "next/server";
import { getCuratedFeedSectionPage, getCuratedFeedSectionSummaries } from "@/lib/feedCatalog";
import { isSpotifyConfigured } from "@/lib/spotify";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("sectionId");

    if (!sectionId) {
      return NextResponse.json(
        {
          ok: true,
          configured: isSpotifyConfigured(),
          sections: getCuratedFeedSectionSummaries(),
        },
        {
          headers: {
            "cache-control": "public, s-maxage=1800, stale-while-revalidate=1800",
          },
        }
      );
    }

    const offsetsRaw = searchParams.get("offsets");
    const offsets = offsetsRaw ? (JSON.parse(offsetsRaw) as Record<string, number | null>) : undefined;
    const payload = await getCuratedFeedSectionPage(sectionId, offsets);
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
