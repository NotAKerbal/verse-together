import { NextRequest } from "next/server";

type ToolType = "tg" | "bd" | "ety" | "1828";

function baseIndexUrl(type: Exclude<ToolType, "ety">): string {
  return type === "tg"
    ? "https://www.churchofjesuschrist.org/study/scriptures/tg?lang=eng"
    : "https://www.churchofjesuschrist.org/study/scriptures/bd?lang=eng";
}

function buildUrl(type: ToolType, slug: string): string {
  if (type === "tg") {
    return `https://www.churchofjesuschrist.org/study/scriptures/tg/${encodeURIComponent(slug)}?lang=eng`;
  }
  if (type === "bd") {
    return `https://www.churchofjesuschrist.org/study/scriptures/bd/${encodeURIComponent(slug)}?lang=eng`;
  }
  if (type === "ety") {
    return `https://www.etymonline.com/word/${encodeURIComponent(slug)}`;
  }
  // 1828 Webster's
  return `https://webstersdictionary1828.com/Dictionary/${encodeURIComponent(slug)}`;
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateCandidates(term: string): string[] {
  const base = slugify(term);
  const candidates = new Set<string>();
  candidates.add(base);

  // Singularization heuristics
  if (base.endsWith("ies")) {
    candidates.add(base.slice(0, -3) + "y");
  }
  if (/(sses|xes|zes|ches|shes)$/.test(base)) {
    candidates.add(base.slice(0, -2)); // remove 'es'
  }
  if (base.endsWith("s") && !base.endsWith("ss")) {
    candidates.add(base.slice(0, -1));
  }

  // Also try removing hyphens (e.g., abed-nego -> abednego)
  candidates.add(base.replace(/-/g, ""));

  return Array.from(candidates).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") as ToolType) || "tg";
  const term = (searchParams.get("term") || "").trim();

  if (!term) {
    return new Response(JSON.stringify({ ok: false, available: false, reason: "missing_term" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const candidates = generateCandidates(term);

  try {
    if (type === "tg" || type === "bd") {
      const indexUrl = baseIndexUrl(type);
      for (const slug of candidates) {
        const targetUrl = buildUrl(type, slug);
        const res = await fetch(targetUrl, { redirect: "follow", cache: "no-store" });
        const finalUrl = res.url;
        if (res.status === 200 && finalUrl && !finalUrl.startsWith(indexUrl)) {
          return new Response(
            JSON.stringify({ ok: true, available: true, url: targetUrl, finalUrl, slug }),
            { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }
          );
        }
      }
    } else if (type === "ety") {
      for (const slug of candidates) {
        const targetUrl = buildUrl(type, slug);
        const res = await fetch(targetUrl, { redirect: "follow", cache: "no-store" });
        const urlObj = new URL(res.url);
        const path = urlObj.pathname;

        // If redirected to search or explicit 404, unavailable
        if (res.status === 404 || path.startsWith("/search")) {
          continue;
        }

        if (path.startsWith("/word/") && res.status === 200) {
          const html = await res.text();
          const lower = html.toLowerCase();
          const titleMatch = lower.match(/<title>([^<]*)<\/title>/i);
          const titleText = titleMatch ? titleMatch[1].trim() : "";
          const isGenericTitle = /etymonline\s*-\s*online etymology dictionary/i.test(titleText);
          const robotsMatch = lower.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i);
          const robots = robotsMatch ? robotsMatch[1] : "";
          const hasNoIndex = /\bnoindex\b/i.test(robots);
          const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
          const canonicalHref = canonicalMatch ? canonicalMatch[1] : "";
          const canonicalLooksValid = canonicalHref.includes("/word/");
          const is404 = hasNoIndex || isGenericTitle || !canonicalLooksValid;
          if (!is404) {
            return new Response(
              JSON.stringify({ ok: true, available: true, url: targetUrl, finalUrl: res.url, slug }),
              { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }
            );
          }
        }
      }
    } else if (type === "1828") {
      for (const slug of candidates) {
        const targetUrl = buildUrl(type, slug);
        const res = await fetch(targetUrl, { redirect: "follow", cache: "no-store" });
        if (res.status !== 200) continue;
        const html = await res.text();
        const lower = html.toLowerCase();
        const didYouMean = lower.includes("did you mean one of these words?");
        if (!didYouMean) {
          return new Response(
            JSON.stringify({ ok: true, available: true, url: targetUrl, finalUrl: res.url, slug }),
            { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }
          );
        }
      }
    }

    // None matched; unavailable
    return new Response(
      JSON.stringify({ ok: true, available: false, tried: candidates }),
      { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, available: false, error: (e as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}


