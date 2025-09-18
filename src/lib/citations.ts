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

// Extract candidate talks lines from the verse HTML fragment
function parseTalksFromHtml(html: string): CitationTalk[] {
  const text = textFromHtml(html);
  const rawLines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const lines: string[] = rawLines.filter((l) => {
    // Remove generic headers/noise commonly present in the fragment
    if (/^citation(\s|\u00A0)?index$/i.test(l)) return false;
    if (/^index$/i.test(l)) return false;
    // Lines like "Ether 12 :4" or "Ether 12:4"
    if (/^[A-Za-z0-9\- ]+\s+\d+\s*: ?\d+$/i.test(l)) return false;
    return true;
  });

  const talks: CitationTalk[] = [];
  const bulletOnly = /^•?\s*(\d{4})-([OA]):(\d+),\s+(.+)$/;
  const combined = /^(\d{4})-([OA]):(\d+),\s+([^,]+?)\s+(.+)$/; // year-session:index, speaker title

  // First, find explicit talk anchors to capture talk URLs and titles
  const talkAnchors = Array.from(html.matchAll(/<a[^>]+href="([^"]*?(?:content\/)?talks_ajax\/(\d+)\/?[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi));
  const talkIdToBase: Record<string, { talkUrl: string; title?: string; index: number; end: number }> = {};
  for (const m of talkAnchors) {
    const href = absoluteUrl(m[1]);
    const talkId = m[2];
    const title = decodeEntities(textFromHtml(m[3]));
    const index = m.index ?? 0;
    const end = index + m[0].length;
    talkIdToBase[talkId] = { talkUrl: href, title: title || undefined, index, end };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Case 1: combined line has speaker and title
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

    // Case 2: bullet-only line with year/session/index and speaker; next line is title
    const mBullet = line.match(bulletOnly);
    if (mBullet) {
      const [, year, sess, idx, speaker] = mBullet;
      // Title is typically the next line
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
      if (title) i += 1; // consume the title line
      continue;
    }
    // Other lines ignored
  }

  // Enrich talks with URLs by matching nearby talk anchors and Watch/Listen links
  for (const t of talks) {
    // Find a talk anchor block that is near the corresponding year/index info.
    // Best effort: choose the first unmatched anchor.
    const candidates = Object.entries(talkIdToBase)
      .sort((a, b) => a[1].index - b[1].index);
    if (candidates.length > 0) {
      const [talkId, base] = candidates[0];
      t.id = t.id || talkId; // ensure unique id
      t.talkId = talkId;
      t.talkUrl = base.talkUrl;
      if (!t.title && base.title) t.title = base.title;
      // Slice a local window around this anchor and look for Watch/Listen anchors
      const start = Math.max(0, base.index - 400);
      const end = Math.min(html.length, base.end + 400);
      const windowHtml = html.slice(start, end);
      const mWatch = windowHtml.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Watch[\s\S]*?<\/a>/i);
      if (mWatch) t.watchUrl = absoluteUrl(mWatch[1]);
      const mListen = windowHtml.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Listen[\s\S]*?<\/a>/i);
      if (mListen) t.listenUrl = absoluteUrl(mListen[1]);
      // Remove so next talk takes next anchor
      delete talkIdToBase[talkId];
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


