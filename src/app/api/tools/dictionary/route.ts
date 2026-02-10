import { NextRequest } from "next/server";

type Edition = "1828" | "1844" | "1913";
type DictionaryEntry = {
  id: string;
  edition: Edition;
  word: string;
  heading: string | null;
  entryText: string;
  pronounce: string | null;
};
type EtymologyItem = {
  id: string;
  source: string;
  word: string;
  text: string;
};
type EditionLookup = { matchedKey: string; entries: DictionaryEntry[] };
type DictionaryPayload = {
  ok: boolean;
  enabled: boolean;
  term: string;
  candidates: string[];
  byEdition: Record<Edition, EditionLookup | null>;
  providerLabels: Record<Edition, string>;
  etymology: { items: EtymologyItem[] };
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const CACHE_VERSION = "v2";
const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: DictionaryPayload }>();
const MERRIAM_WEBSTER_KEY =
  process.env.MERRIAM_WEBSTER_API_KEY || process.env.MW_DICTIONARY_API_KEY || "";

const PROVIDER_LABELS: Record<Edition, string> = {
  "1828": "Merriam-Webster",
  "1844": "Unavailable",
  "1913": "Free Dictionary API",
};

function normalizeLookupKey(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateLookupCandidates(term: string): string[] {
  const base = normalizeLookupKey(term);
  if (!base) return [];
  const out = new Set<string>([base]);
  if (base.endsWith("ies")) out.add(`${base.slice(0, -3)}y`);
  if (/(sses|xes|zes|ches|shes)$/.test(base)) out.add(base.slice(0, -2));
  if (base.endsWith("s") && !base.endsWith("ss")) out.add(base.slice(0, -1));
  out.add(base.replace(/-/g, ""));
  return Array.from(out).filter(Boolean);
}

function toBulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function cleanEtymologyText(input: string): string {
  return String(input || "")
    .replace(/\{\/?[^}]+\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMerriamEtymologyParts(value: unknown, out: string[]): void {
  if (!value) return;
  if (typeof value === "string") {
    const cleaned = cleanEtymologyText(value);
    if (cleaned) out.push(cleaned);
    return;
  }
  if (Array.isArray(value)) {
    for (const part of value) extractMerriamEtymologyParts(part, out);
    return;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.t === "string") extractMerriamEtymologyParts(obj.t, out);
    for (const entry of Object.values(obj)) extractMerriamEtymologyParts(entry, out);
  }
}

async function fetchFreeDictionaryEntries(
  term: string
): Promise<{ entries: DictionaryEntry[]; etymology: EtymologyItem[] }> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`;
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) return { entries: [], etymology: [] };
  const json = (await res.json()) as Array<{
    word?: string;
    origin?: string;
    phonetic?: string;
    phonetics?: Array<{ text?: string }>;
    meanings?: Array<{
      partOfSpeech?: string;
      definitions?: Array<{
        definition?: string;
        example?: string;
        synonyms?: string[];
        antonyms?: string[];
      }>;
    }>;
  }>;
  if (!Array.isArray(json) || json.length === 0) return { entries: [], etymology: [] };

  const entries = json
    .slice(0, 3)
    .map((item, idx) => {
      const word = String(item.word || term).trim() || term;
      const pronounce =
        String(item.phonetic || "").trim() ||
        String(item.phonetics?.find((p) => p?.text)?.text || "").trim() ||
        null;
      const sectionLines: string[] = [];
      for (const meaning of item.meanings ?? []) {
        const part = String(meaning.partOfSpeech || "").trim();
        if (part) sectionLines.push(`<pos>${part}</pos>`);
        const defs = (meaning.definitions ?? []).slice(0, 3);
        for (const [defIdx, def] of defs.entries()) {
          const definition = String(def.definition || "").trim();
          if (!definition) continue;
          sectionLines.push(`${defIdx + 1}. ${definition}`);
          const example = String(def.example || "").trim();
          if (example) sectionLines.push(`<cd>Example:</cd> "${example}"`);
          const synonyms = (def.synonyms ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8);
          if (synonyms.length) sectionLines.push(`<sd>Synonyms:</sd> ${toBulletList(synonyms)}`);
          const antonyms = (def.antonyms ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8);
          if (antonyms.length) sectionLines.push(`<sd>Antonyms:</sd> ${toBulletList(antonyms)}`);
        }
        if (sectionLines.length > 0) sectionLines.push("");
      }
      return {
        id: `free-${normalizeLookupKey(word)}-${idx}`,
        edition: "1913" as const,
        word,
        heading: null,
        entryText: sectionLines.join("\n").trim(),
        pronounce,
      };
    })
    .filter((entry) => entry.entryText.length > 0);

  const etymology = json
    .map((item, idx) => {
      const text = cleanEtymologyText(item.origin || "");
      if (!text) return null;
      const word = String(item.word || term).trim() || term;
      return {
        id: `free-ety-${normalizeLookupKey(word)}-${idx}`,
        source: "Free Dictionary API",
        word,
        text,
      } as EtymologyItem;
    })
    .filter((item): item is EtymologyItem => item !== null);

  return { entries, etymology };
}

async function fetchMerriamWebsterEntries(
  term: string
): Promise<{ entries: DictionaryEntry[]; etymology: EtymologyItem[] }> {
  if (!MERRIAM_WEBSTER_KEY) return { entries: [], etymology: [] };
  const url =
    `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(term)}` +
    `?key=${encodeURIComponent(MERRIAM_WEBSTER_KEY)}`;
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) return { entries: [], etymology: [] };
  const json = (await res.json()) as Array<{
    meta?: { id?: string };
    hwi?: { hw?: string; prs?: Array<{ mw?: string }> };
    fl?: string;
    shortdef?: string[];
    et?: unknown[];
  } | string>;
  if (!Array.isArray(json)) return { entries: [], etymology: [] };

  const structuredEntries = json
    .filter((item): item is Exclude<(typeof json)[number], string> => typeof item === "object" && item !== null)
    .slice(0, 3);

  const entries = structuredEntries
    .slice(0, 3)
    .map((item, idx) => {
      const word = String(item.hwi?.hw || term).replace(/\*/g, " ").trim() || term;
      const pronounce = String(item.hwi?.prs?.[0]?.mw || "").trim() || null;
      const part = String(item.fl || "").trim();
      const defs = (item.shortdef ?? []).map((d) => d.trim()).filter(Boolean).slice(0, 6);
      const lines: string[] = [];
      if (part) lines.push(`<pos>${part}</pos>`);
      if (defs.length > 0) lines.push(toBulletList(defs));
      return {
        id: `mw-${normalizeLookupKey(item.meta?.id || word)}-${idx}`,
        edition: "1828" as const,
        word,
        heading: "Merriam-Webster Collegiate",
        entryText: lines.join("\n").trim(),
        pronounce,
      };
    })
    .filter((entry) => entry.entryText.length > 0);

  const etymology = structuredEntries
    .map((item, idx) => {
      const parts: string[] = [];
      extractMerriamEtymologyParts(item.et ?? [], parts);
      const text = cleanEtymologyText(parts.join(" "));
      if (!text) return null;
      const word = String(item.hwi?.hw || term).replace(/\*/g, " ").trim() || term;
      return {
        id: `mw-ety-${normalizeLookupKey(word)}-${idx}`,
        source: "Merriam-Webster",
        word,
        text,
      } as EtymologyItem;
    })
    .filter((item): item is EtymologyItem => item !== null);

  return { entries, etymology };
}

async function fetchWiktionaryEtymology(term: string): Promise<EtymologyItem[]> {
  try {
    const sectionsUrl =
      `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(term)}` +
      "&prop=sections&format=json&origin=*";
    const sectionsRes = await fetch(sectionsUrl, { cache: "force-cache" });
    if (!sectionsRes.ok) return [];
    const sectionsJson = (await sectionsRes.json()) as {
      parse?: {
        sections?: Array<{
          line?: string;
          level?: string;
          number?: string;
          index?: string;
        }>;
      };
    };
    const sections = sectionsJson.parse?.sections ?? [];
    if (!Array.isArray(sections) || sections.length === 0) return [];

    const englishSection = sections.find((section) => String(section.line || "").trim().toLowerCase() === "english");
    const englishPrefix = englishSection?.number ? `${englishSection.number}.` : "";
    const etymologySections = sections
      .filter((section) => {
        const line = String(section.line || "").trim().toLowerCase();
        const level = String(section.level || "").trim();
        const number = String(section.number || "").trim();
        if (!line.startsWith("etymology")) return false;
        if (level !== "3") return false;
        if (englishPrefix && !number.startsWith(englishPrefix)) return false;
        return true;
      })
      .slice(0, 2);
    if (etymologySections.length === 0) return [];

    const items = await Promise.all(
      etymologySections.map(async (section, idx) => {
        const sectionIndex = String(section.index || "").trim();
        if (!sectionIndex) return null;
        const textUrl =
          `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(term)}` +
          `&prop=text&section=${encodeURIComponent(sectionIndex)}&format=json&origin=*`;
        const textRes = await fetch(textUrl, { cache: "force-cache" });
        if (!textRes.ok) return null;
        const textJson = (await textRes.json()) as {
          parse?: {
            text?: { "*": string };
          };
        };
        const html = String(textJson.parse?.text?.["*"] || "");
        if (!html) return null;
        const firstParagraphMatch = html.match(/<p>([\s\S]*?)<\/p>/i);
        const paragraph = firstParagraphMatch ? firstParagraphMatch[1] : html;
        const text = cleanEtymologyText(paragraph).slice(0, 700);
        if (!text) return null;
        return {
          id: `wiktionary-ety-${normalizeLookupKey(term)}-${idx}`,
          source: "Wiktionary",
          word: term,
          text,
        } as EtymologyItem;
      })
    );

    return items.filter((item): item is EtymologyItem => item !== null);
  } catch {
    return [];
  }
}

async function buildPayload(term: string): Promise<DictionaryPayload> {
  const candidates = generateLookupCandidates(term);
  const normalizedTerm = candidates[0] || normalizeLookupKey(term);
  const [mw, free] = await Promise.all([
    fetchMerriamWebsterEntries(normalizedTerm),
    fetchFreeDictionaryEntries(normalizedTerm),
  ]);
  const etymologyByText = new Map<string, EtymologyItem>();
  for (const item of [...free.etymology, ...mw.etymology]) {
    if (!item.text) continue;
    const key = item.text.toLowerCase();
    if (!etymologyByText.has(key)) etymologyByText.set(key, item);
  }
  if (etymologyByText.size === 0) {
    const wiktionaryItems = await fetchWiktionaryEtymology(normalizedTerm);
    for (const item of wiktionaryItems) {
      const key = item.text.toLowerCase();
      if (!etymologyByText.has(key)) etymologyByText.set(key, item);
    }
  }

  return {
    ok: true,
    enabled: true,
    term,
    candidates,
    byEdition: {
      "1828": mw.entries.length ? { matchedKey: normalizedTerm, entries: mw.entries } : null,
      "1844": null,
      "1913": free.entries.length ? { matchedKey: normalizedTerm, entries: free.entries } : null,
    },
    providerLabels: PROVIDER_LABELS,
    etymology: { items: Array.from(etymologyByText.values()) },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get("term") || "").trim();

  if (!term) {
    return new Response(JSON.stringify({ ok: false, reason: "missing_term" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const cacheKey = `${CACHE_VERSION}:${normalizeLookupKey(term)}`;
  const now = Date.now();
  const cached = RESPONSE_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return new Response(JSON.stringify(cached.payload), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300, s-maxage=300" },
    });
  }

  try {
    const payload = await buildPayload(term);
    RESPONSE_CACHE.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, payload });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300, s-maxage=300" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        enabled: true,
        error: (error as Error).message,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
