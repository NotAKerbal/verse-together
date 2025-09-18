export type CitationTalk = {
  id?: string;
  title: string;
  speaker?: string;
  conference?: string;
  year?: string;
  session?: string;
  href?: string;
  talkUrl?: string;
  watchUrl?: string;
  listenUrl?: string;
  talkId?: string;
};

export type VerseCitations = {
  bookId: number;
  chapter: number;
  verseSpec: string; // e.g. "1" or "1-2"
  talks: CitationTalk[];
};

// Root: https://scriptures.byu.edu/citation_index/citation_ajax/Any/1830/2025/all/s/f?verses=
const ROOT = "https://scriptures.byu.edu/citation_index/citation_ajax/Any/1830/2025/all/s/f";
const ABS_BASE = "https://scriptures.byu.edu";

export function buildRootUrl(): string {
  return `${ROOT}?verses=`;
}

export function buildBookUrl(bookId: number): string {
  return `${ROOT}/${bookId}?verses=`;
}

export function buildChapterUrl(bookId: number, chapter: number): string {
  return `${ROOT}/${bookId}/${chapter}?verses=`;
}

export function buildVersesUrl(bookId: number, chapter: number, verseSpec: string): string {
  return `${ROOT}/${bookId}/${chapter}?verses=${encodeURIComponent(verseSpec)}`;
}

// Very lightweight HTML chunk text scraper. The BYU endpoint returns HTML fragments.
function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/>/gi, "\n")
    .replace(/<br\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|li|ul|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absoluteUrl(href: string): string {
  try {
    return new URL(href, ABS_BASE).toString();
  } catch {
    return href;
  }
}

// Extract the first http(s) URL found inside a string
function extractHttpUrlFromString(source: string): string | undefined {
  const m = source.match(/https?:\/\/[^"'\s<>]+/i);
  return m ? m[0] : undefined;
}

// Sanitize anchor URLs that might be javascript:... wrappers. Prefer http(s) or absolute URLs.
function sanitizeAnchorUrl(rawHref: string | undefined, fullAnchorHtml: string): string | undefined {
  if (rawHref) {
    const trimmed = rawHref.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("/")) return absoluteUrl(trimmed);
    const embedded = extractHttpUrlFromString(trimmed);
    if (embedded) return embedded;
  }
  const inTag = extractHttpUrlFromString(fullAnchorHtml);
  if (inTag) return inTag;
  return undefined;
}

// Extract candidate talks from the verse HTML fragment
function parseTalksFromHtml(html: string): CitationTalk[] {
  // Strategy 1: Parse each <li> block independently to keep anchors scoped to a talk
  const liBlocks = Array.from(html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)).map((m) => m[0]);
  const talksFromLi: CitationTalk[] = [];
  if (liBlocks.length > 0) {
    for (const liHtml of liBlocks) {
      const blockTextRaw = textFromHtml(liHtml).replace(/^•\s*/, "");
      const blockText = blockTextRaw.replace(/\s+(Watch|Listen)(\s|$)/gi, " ").trim();

      // Extract core identifiers
      const combined = /^(\d{4})-([OA]):(\d+),\s+([^,]+?)\s+(.+)$/; // year-session:index, speaker title
      const bulletOnly = /^(\d{4})-([OA]):(\d+),\s+(.+)$/;

      let year: string | undefined;
      let sess: string | undefined;
      let idx: string | undefined;
      let speaker: string | undefined;
      let title: string | undefined;

      const mCombined = blockText.match(combined);
      if (mCombined) {
        [, year, sess, idx, speaker, title] = mCombined as unknown as [string, string, string, string, string, string];
      } else {
        const mBullet = blockText.match(bulletOnly);
        if (mBullet) {
          [, year, sess, idx, speaker] = mBullet as unknown as [string, string, string, string, string];
        }
      }

      // Extract anchors within this block
      const talkAnchor = liHtml.match(/<a[^>]+href="([^"]*?(?:content\/)?talks_ajax\/(\d+)\/?[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      const talkUrl = talkAnchor ? absoluteUrl(talkAnchor[1]) : undefined;
      const talkId = talkAnchor ? talkAnchor[2] : undefined;
      const anchorTitle = talkAnchor ? decodeEntities(textFromHtml(talkAnchor[3])) : undefined;

      // Prefer explicit onclick handlers which contain the canonical URLs
      const onWatch = liHtml.match(/watchTalk\([^,]+,\s*'([^']+)'\)/i);
      const onListen = liHtml.match(/listenTalk\([^,]+,\s*'([^']+)'\)/i);
      let watchUrl = onWatch ? onWatch[1] : undefined;
      let listenUrl = onListen ? onListen[1] : undefined;
      if (!watchUrl) {
        const mWatchTag = liHtml.match(/(<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Watch[\s\S]*?<\/a>)/i);
        watchUrl = mWatchTag ? sanitizeAnchorUrl(mWatchTag[2], mWatchTag[1]) : undefined;
      }
      if (!listenUrl) {
        const mListenTag = liHtml.match(/(<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Listen[\s\S]*?<\/a>)/i);
        listenUrl = mListenTag ? sanitizeAnchorUrl(mListenTag[2], mListenTag[1]) : undefined;
      }

      const talk: CitationTalk = {
        id: year && sess && idx ? `${year}-${sess}:${idx}` : talkId,
        year,
        session: sess === "O" ? "October" : sess === "A" ? "April" : undefined,
        speaker: speaker?.trim(),
        title: (title || anchorTitle || "").trim(),
        talkUrl,
        watchUrl: watchUrl,
        listenUrl: listenUrl,
        talkId,
      };

      // Avoid empty/invalid entries (must have at least a title or talkUrl)
      if (talk.title || talk.talkUrl) {
        talksFromLi.push(talk);
      }
    }
  }

  // If LI parsing yielded results, use them
  const talks: CitationTalk[] = talksFromLi;
  if (talks.length === 0) {
    // Strategy 2 (fallback): text-line parsing across the whole fragment
    const text = textFromHtml(html);
    const rawLines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const lines: string[] = rawLines.filter((l) => {
      if (/^citation(\s|\u00A0)?index$/i.test(l)) return false;
      if (/^index$/i.test(l)) return false;
      if (/^[A-Za-z0-9\- ]+\s+\d+\s*: ?\d+$/i.test(l)) return false;
      return true;
    });

    const bulletOnly = /^•?\s*(\d{4})-([OA]):(\d+),\s+(.+)$/;
    const combined = /^(\d{4})-([OA]):(\d+),\s+([^,]+?)\s+(.+)$/;

    // Capture talk anchors to later enrich talks with URLs
    const talkAnchors = Array.from(html.matchAll(/<a[^>]+href="([^"]*?(?:content\/)?talks_ajax\/(\d+)\/?[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi));
    const talkIdToBase: Record<string, { talkUrl: string; title?: string; index: number; end: number }> = {};
    for (const m of talkAnchors) {
      const href = absoluteUrl(m[1]);
      const tId = m[2];
      const tTitle = decodeEntities(textFromHtml(m[3]));
      const index = m.index ?? 0;
      const end = index + m[0].length;
      talkIdToBase[tId] = { talkUrl: href, title: tTitle || undefined, index, end };
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mCombined = line.match(combined);
      if (mCombined) {
        const [, year, sess, idx, speaker, title] = mCombined;
        talks.push({
          id: `${year}-${sess}:${idx}`,
          year,
          session: sess === "O" ? "October" : sess === "A" ? "April" : undefined,
          speaker: speaker.trim(),
          title: title.trim(),
        });
        continue;
      }
      const mBullet = line.match(bulletOnly);
      if (mBullet) {
        const [, year, sess, idx, speaker] = mBullet;
        const next = lines[i + 1] || "";
        const isNextAlsoBullet = bulletOnly.test(next) || combined.test(next);
        const isNoise = /^watch|^listen/i.test(next);
        const title = !isNextAlsoBullet && !isNoise ? next : "";
        talks.push({
          id: `${year}-${sess}:${idx}`,
          year,
          session: sess === "O" ? "October" : sess === "A" ? "April" : undefined,
          speaker: speaker.trim(),
          title: title || speaker.trim(),
        });
        if (title) i += 1;
        continue;
      }
    }

    // Enrich with nearby anchors for URLs and watch/listen links
    for (const t of talks) {
      const candidates = Object.entries(talkIdToBase).sort((a, b) => a[1].index - b[1].index);
      if (candidates.length > 0) {
        const [tId, base] = candidates[0];
        t.id = t.id || tId;
        t.talkId = tId;
        t.talkUrl = base.talkUrl;
        if (!t.title && base.title) t.title = base.title;
        const start = Math.max(0, base.index - 400);
        const end = Math.min(html.length, base.end + 400);
        const windowHtml = html.slice(start, end);
        const wOn = windowHtml.match(/watchTalk\([^,]+,\s*'([^']+)'\)/i);
        const wUrl = wOn ? wOn[1] : (windowHtml.match(/(<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Watch[\s\S]*?<\/a>)/i)?.[2] ?? undefined);
        const wUrlSanitized = wUrl ? sanitizeAnchorUrl(wUrl, wOn ? wOn[0] : "") : undefined;
        if (wUrlSanitized) t.watchUrl = wUrlSanitized;
        const lOn = windowHtml.match(/listenTalk\([^,]+,\s*'([^']+)'\)/i);
        const lUrl = lOn ? lOn[1] : (windowHtml.match(/(<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Listen[\s\S]*?<\/a>)/i)?.[2] ?? undefined);
        const lUrlSanitized = lUrl ? sanitizeAnchorUrl(lUrl, lOn ? lOn[0] : "") : undefined;
        if (lUrlSanitized) t.listenUrl = lUrlSanitized;
        delete talkIdToBase[tId];
      }
    }
  }

  // Deduplicate by normalized key
  const seen: Record<string, boolean> = {};
  return talks.filter((t) => {
    const key = `${t.talkId || t.id || ""}__${(t.title || "").toLowerCase()}__${(t.speaker || "").toLowerCase()}__${t.year || ""}__${t.session || ""}`;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

export async function fetchChapterListing(bookId: number): Promise<{ chapterNumbers: number[] } | null> {
  try {
    const res = await fetch(buildBookUrl(bookId), { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    // Look for chapter numbers like "* 1[102]" in text version
    const text = textFromHtml(html);
    const numbers = Array.from(text.matchAll(/\b(\d{1,3})\s*\[/g)).map((m) => Number(m[1]));
    const unique = Array.from(new Set(numbers)).sort((a, b) => a - b);
    return { chapterNumbers: unique };
  } catch {
    return null;
  }
}

export async function fetchVerseCitations(bookId: number, chapter: number, verseSpec: string): Promise<VerseCitations | null> {
  try {
    const res = await fetch(buildVersesUrl(bookId, chapter, verseSpec), { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    const talks = parseTalksFromHtml(html);
    return { bookId, chapter, verseSpec, talks };
  } catch {
    return null;
  }
}

// Mapping of OpenScripture canonical book keys to BYU Citation book numeric ids.
// This is a partial map. Extend as needed.
const BOOK_TO_BYU_ID: Record<string, number> = {
  // Book of Mormon
  "1-nephi": 205,
  "2-nephi": 206,
  "jacob": 207,
  "enos": 208,
  "jarom": 209,
  "omni": 210,
  "words-of-mormon": 211,
  "mosiah": 212,
  "alma": 213,
  "helaman": 214,
  "3-nephi": 215,
  "4-nephi": 216,
  "mormon": 217,
  "ether": 218,
  "moroni": 219,
  // New Testament (examples)
  "matthew": 101,
  "mark": 102,
  "luke": 103,
  "john": 104,
};

export function mapBookKeyToByuId(volume: string, book: string): number | null {
  const key = book.toLowerCase();
  if (BOOK_TO_BYU_ID[key]) return BOOK_TO_BYU_ID[key];
  return null;
}


