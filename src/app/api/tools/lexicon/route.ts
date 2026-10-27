import { NextRequest, NextResponse } from "next/server";
import { isStrongsLanguage, lookupStrongs } from "@/lib/strongsLexicon.server";

// GET ?language=hebrew|greek&term=<English word>: Strong's entries for the word (see strongsLexicon.ts).
export async function GET(request: NextRequest) {
  const language = request.nextUrl.searchParams.get("language");
  const term = (request.nextUrl.searchParams.get("term") ?? "").trim();
  if (!isStrongsLanguage(language) || !term || term.length > 64) {
    return NextResponse.json({ ok: false, error: "Expected language=hebrew|greek and a term." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const lookup = await lookupStrongs(language, term);
    return NextResponse.json(
      { ok: true, lookup },
      { headers: { "cache-control": "public, max-age=86400, s-maxage=604800" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "The lexicon could not be read." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
