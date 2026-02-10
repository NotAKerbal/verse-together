import { NextRequest } from "next/server";

type ToolType = "tg" | "bd" | "1828";

function baseIndexUrl(type: ToolType): string {
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


