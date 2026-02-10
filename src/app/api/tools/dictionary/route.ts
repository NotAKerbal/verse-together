import { NextRequest } from "next/server";
import { convexQuery } from "@/lib/convexHttp";

const ENABLE_IN_APP_DICTIONARY = process.env.NEXT_PUBLIC_USE_CONVEX_DICTIONARY === "1";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get("term") || "").trim();

  if (!term) {
    return new Response(JSON.stringify({ ok: false, reason: "missing_term" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!ENABLE_IN_APP_DICTIONARY) {
    return new Response(JSON.stringify({ ok: true, enabled: false, byEdition: {} }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  try {
    const data = await convexQuery<{
      term: string;
      candidates: string[];
      byEdition: Record<string, { matchedKey: string; entries: unknown[] } | null>;
    }>("dictionary:getEntriesByWord", { term });

    return new Response(
      JSON.stringify({
        ok: true,
        enabled: true,
        term: data.term,
        candidates: data.candidates,
        byEdition: data.byEdition,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        enabled: ENABLE_IN_APP_DICTIONARY,
        error: (error as Error).message,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
