export const CHAPTER_INSIGHT_PROMPT_VERSION = 4;
export const CHAPTER_INSIGHT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const CHAPTER_INSIGHT_SOURCE_DOMAINS = [
  "churchofjesuschrist.org",
  "lds.org",
  "scripturecentral.org",
  "interpreterfoundation.org",
  "rsc.byu.edu",
  "byustudies.byu.edu",
  "mi.byu.edu",
  "josephsmithpapers.org",
  "fairlatterdaysaints.org",
  "dialoguejournal.com",
] as const;

export const CHAPTER_INSIGHT_KINDS = [
  "cross_reference",
  "doctrinal_context",
  "historical_context",
  "word_or_phrase",
  "textual_pattern",
  "open_question",
] as const;

export type ChapterInsightKind = (typeof CHAPTER_INSIGHT_KINDS)[number];

export type ChapterInsightSource = {
  title: string;
  url: string;
  format: "article" | "video";
};

export type ChapterInsightScriptureLink = {
  reference: string;
  volume: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
};

export type ChapterStudyPath = {
  kind: ChapterInsightKind;
  verse_numbers: number[];
  title: string;
  direction: string;
  why: string;
  look_for: string[];
  sources: ChapterInsightSource[];
  scripture_links: ChapterInsightScriptureLink[];
};

export type ChapterInsightResult = {
  reference: string;
  paths: ChapterStudyPath[];
  generated_at: string;
  cached: boolean;
};

type OpenAiUrlCitation = {
  type?: string;
  url?: string;
  title?: string;
};

type OpenAiWebSource = {
  url?: string;
  title?: string;
};

export type OpenAiChapterInsightResponse = {
  error?: { message?: string };
  output?: Array<{
    type?: string;
    action?: { sources?: OpenAiWebSource[] };
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: OpenAiUrlCitation[];
    }>;
  }>;
};

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)])
  );
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

type RawChapterStudyPath = {
  kind?: unknown;
  verse_numbers?: unknown;
  title?: unknown;
  direction?: unknown;
  why?: unknown;
  look_for?: unknown;
  source_urls?: unknown;
  video_urls?: unknown;
  scripture_links?: unknown;
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function canonicalSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const allowed = CHAPTER_INSIGHT_SOURCE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
    if (!allowed) return null;
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    return `https://${hostname}${pathname}`;
  } catch {
    return null;
  }
}

export function isAllowedChapterInsightSource(value: string): boolean {
  return canonicalSourceUrl(value) !== null;
}

export function extractChapterInsightResponse(response: OpenAiChapterInsightResponse): {
  text: string;
  sources: Map<string, ChapterInsightSource>;
} {
  const sourceMap = new Map<string, ChapterInsightSource>();
  let text = "";

  for (const item of response.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      const url = cleanText(source.url, 2000);
      const canonical = canonicalSourceUrl(url);
      if (!canonical) continue;
      sourceMap.set(canonical, {
        title: cleanText(source.title, 300) || new URL(canonical).hostname,
        url,
        format: "article",
      });
    }

    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        text = [text, content.text.trim()].filter(Boolean).join("\n");
      }
      for (const annotation of content.annotations ?? []) {
        if (annotation.type !== "url_citation") continue;
        const url = cleanText(annotation.url, 2000);
        const canonical = canonicalSourceUrl(url);
        if (!canonical) continue;
        sourceMap.set(canonical, {
          title: cleanText(annotation.title, 300) || sourceMap.get(canonical)?.title || new URL(canonical).hostname,
          url,
          format: "article",
        });
      }
    }
  }

  return { text, sources: sourceMap };
}

export function parseChapterStudyPaths(
  text: string,
  validVerseNumbers: ReadonlySet<number>,
  consultedSources: ReadonlyMap<string, ChapterInsightSource>
): ChapterStudyPath[] {
  let parsed: { paths?: unknown };
  try {
    parsed = JSON.parse(text) as { paths?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.paths)) return [];

  const paths: ChapterStudyPath[] = [];
  for (const candidate of parsed.paths as RawChapterStudyPath[]) {
    if (!candidate || typeof candidate !== "object") continue;
    if (!CHAPTER_INSIGHT_KINDS.includes(candidate.kind as ChapterInsightKind)) continue;

    const verseNumbers = Array.isArray(candidate.verse_numbers)
      ? Array.from(
          new Set(
            candidate.verse_numbers
              .filter((verse): verse is number => Number.isInteger(verse) && validVerseNumbers.has(verse))
              .slice(0, 2)
          )
        )
      : [];
    const title = cleanText(candidate.title, 120);
    const direction = cleanText(candidate.direction, 800);
    const why = cleanText(candidate.why, 500);
    const lookFor = Array.isArray(candidate.look_for)
      ? candidate.look_for.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 3)
      : [];
    const videoUrls = new Set(
      Array.isArray(candidate.video_urls)
        ? candidate.video_urls
            .map((item) => cleanText(item, 2000))
            .map((url) => canonicalSourceUrl(url))
            .filter((url): url is string => Boolean(url))
        : []
    );
    const sources = Array.isArray(candidate.source_urls)
      ? Array.from(
          new Set(candidate.source_urls.map((item) => cleanText(item, 2000)).filter(Boolean).slice(0, 5))
        )
          .map((url) => canonicalSourceUrl(url))
          .filter((url): url is string => Boolean(url))
          .map((url) => {
            const source = consultedSources.get(url);
            return source ? { ...source, format: videoUrls.has(url) ? "video" as const : "article" as const } : undefined;
          })
          .filter((source): source is ChapterInsightSource => Boolean(source))
          .slice(0, 3)
      : [];
    const scriptureLinks = Array.isArray(candidate.scripture_links)
      ? candidate.scripture_links
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            reference: cleanText(item.reference, 120),
            volume: cleanText(item.volume, 100),
            book: cleanText(item.book, 100),
            chapter: item.chapter,
            verse_start: item.verse_start,
            verse_end: item.verse_end,
          }))
          .filter(
            (item): item is ChapterInsightScriptureLink =>
              Boolean(item.reference && item.volume && item.book) &&
              Number.isInteger(item.chapter) &&
              Number.isInteger(item.verse_start) &&
              Number.isInteger(item.verse_end) &&
              Number(item.chapter) > 0 &&
              Number(item.verse_start) > 0 &&
              Number(item.verse_end) >= Number(item.verse_start)
          )
          .slice(0, 3)
      : [];

    if (verseNumbers.length === 0 || !title || !direction || !why || lookFor.length === 0 || sources.length === 0) {
      continue;
    }
    paths.push({
      kind: candidate.kind as ChapterInsightKind,
      verse_numbers: verseNumbers,
      title,
      direction,
      why,
      look_for: lookFor,
      sources,
      scripture_links: scriptureLinks,
    });
  }
  return paths;
}

export function groupChapterStudyPathsByVerse(paths: ChapterStudyPath[]): Map<number, ChapterStudyPath[]> {
  const grouped = new Map<number, ChapterStudyPath[]>();
  for (const path of paths) {
    const firstVerse = path.verse_numbers[0];
    if (firstVerse === undefined) continue;
    grouped.set(firstVerse, [...(grouped.get(firstVerse) ?? []), path]);
  }
  return grouped;
}
