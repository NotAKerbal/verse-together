import { fetchAvailableHelloaoTranslations } from "@/lib/helloaoApi";

export async function GET() {
  try {
    const translations = await fetchAvailableHelloaoTranslations();
    return new Response(JSON.stringify({ ok: true, translations }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load translations",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }
    );
  }
}
