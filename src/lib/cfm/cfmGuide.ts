// Come, Follow Me guide parser.
//
// Adapted from lib/cfm.ts in NotAKerbal/isaac-stuff-homepage at 52975b1c4b78c34a1c0d7af365422455b71148e4.
// Changes from the original:
// - Markdown is validated before rendering (no raw HTML, no images, public http(s) links only), and the
//   renderer escapes raw HTML and drops unsafe link schemes as a second line of defense.
// - Passage references inside the guide's own chapter range link to the paired scripture pane
//   (`#scripture-isaiah-50-v1-3`) instead of an external page, and are returned as `passages`.
// - The document title is returned so the page can render it as the h1.
// - The rendered guide is also returned in two parts, split at its first chapter section: the
//   introduction (read on its own) and the chapter-by-chapter reader (paired with the scripture).
// Every source paragraph, list, table, blockquote, heading, and link is still rendered.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Marked, type Token, type Tokens } from "marked";
import { passageHalves, scriptureAnchor, type VerseHalf } from "./cfmAnchors.ts";
import {
  escapeHtml,
  findBook,
  markPlainTokens,
  matchLocalLead,
  referenceUrl,
  renderTextToken,
  scriptureLink,
  scriptureUrl,
} from "./cfmScriptures.mjs";

export type Guide = {
  slug: string;
  title: string;
  scripture: string;
  startDate: string;
  endDate: string;
  dateLabel: string;
  author: string;
  summary: string;
  sha256: string;
};
export type TocVerse = { id: string; ref: string; short: string; text: string };
export type TocItem = {
  id: string;
  text: string;
  depth: number;
  kind: "chapter" | "section" | "sources";
  /** "introduction" for sections before the guide's first chapter section; "reader" from it on. */
  part: "introduction" | "reader";
  book?: string;
  number?: string;
  subtitle?: string;
  verses: TocVerse[];
};
/** A commentary block tied to verses of a chapter in the guide's own range. */
export type GuidePassage = {
  /** Commentary anchor: the verse heading or close-reading lead. */
  id: string;
  /** As printed, e.g. "57:13b–14". */
  label: string;
  chapter: number;
  /** Base verse numbers; "13a" and "13b" both select verse 13. */
  first: number;
  last: number;
  /** "b" when the passage starts halfway through `first` ("13b–14"). */
  firstHalf?: VerseHalf;
  /** "a" when the passage stops halfway through `last` ("11–13a"). */
  lastHalf?: VerseHalf;
};
export type GuideRange = { book: string; slug: string; volume: string; first: number; last: number };
export type ParsedGuide = {
  title: string;
  /** The complete guide in source order: exactly `introductionHtml + readerHtml`. */
  html: string;
  /**
   * The preamble and every section before the first chapter section of the guide's own range (front
   * matter, orientation). Empty when the guide has no such chapter section.
   */
  introductionHtml: string;
  /** From the first chapter section on: every chapter, then whatever follows them (synthesis, sources). */
  readerHtml: string;
  toc: TocItem[];
  passages: GuidePassage[];
  range: GuideRange | null;
  words: number;
};

export const CFM_CONTENT_DIR = path.join("content", "cfm");

// Book names like "Isaiah", "1 Nephi", or "Doctrine and Covenants".
const BOOK = String.raw`(?:[1-4] )?[A-Z][A-Za-z.]*(?: (?:of|and|the|[A-Z][A-Za-z.]*))*`;
// "Isaiah 50" or "Isaiah 40: The voice that ends the warfare"
const CHAPTER = new RegExp(String.raw`^(${BOOK}) (\d{1,3})(?:: (.+))?$`);
// "Isaiah 50:1–3 — Who ended the marriage, and who sold the children?"
const VERSE = new RegExp(String.raw`^(${BOOK} \d{1,3}:[0-9a-z:,– -]*?) — (.+)$`);
const SOURCES = /\b(?:sources?|bibliograph\w*|works cited|references)\b/i;
// Single-chapter verse refs with optional a/b half-verse suffixes; "52:13–53:12" does not match.
const VERSE_RANGE = /^(?:(.+) )?(\d{1,3}):(\d{1,3})[ab]?(?:[–-](\d{1,3})[ab]?)?$/;

const VOLUME_IDS: Record<string, string> = {
  ot: "oldtestament",
  nt: "newtestament",
  bofm: "bookofmormon",
  "dc-testament": "doctrineandcovenants",
};

/** "Isaiah 50–57" → the guide's own book and chapter span, when the book is known. */
export function guideRange(scripture: string): GuideRange | null {
  const match = /^(.+?) (\d{1,3})(?:[–-](\d{1,3}))?$/.exec(scripture);
  const book = match ? findBook(match[1]) : null;
  if (!match || !book) return null;
  const first = Number(match[2]);
  const last = Number(match[3] ?? match[2]);
  return { book: match[1], slug: book.slug, volume: VOLUME_IDS[book.volume] ?? book.volume, first, last };
}

/** Only absolute public http(s) URLs, site-relative paths, and in-page anchors. */
export function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^#[\w-]*$/.test(trimmed)) return trimmed;
  if (/^\/(?!\/)/.test(trimmed)) return /[\s"'<>\\]/.test(trimmed) ? null : trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return trimmed;
  } catch {
    return null;
  }
}

/** Mirrors the original importer's validateMarkdown (scripts/cfm-content.mjs). Throws on unsafe input. */
export function validateGuideMarkdown(markdown: string) {
  const checker = new Marked({ gfm: true });
  checker.walkTokens(checker.lexer(markdown), (token) => {
    if (token.type === "html" || token.type === "image") {
      throw new Error("Raw HTML and images are not accepted in CFM Markdown");
    }
    if (token.type === "link") {
      const url = new URL(token.href);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        /^(localhost|127\.|10\.|192\.168\.)/i.test(url.hostname) ||
        url.username ||
        url.password
      ) {
        throw new Error("Only public HTTP citations are accepted");
      }
    }
  });
  if (!/^# .+/m.test(markdown) || !/^## /m.test(markdown)) throw new Error("Guide needs a title and sections");
}

// Artwork in public/cfm/art: two public-domain paintings and one generated explanatory diagram. Each is
// placed once, right after the passage heading or lead it illustrates, as page chrome
// (data-cfm-added="art"), never inside the source Markdown.
type Art = {
  book: string;
  chapter: string;
  verse: number;
  src: string;
  width: number;
  height: number;
  maxWidth: number;
  alt: string;
  /** Caption HTML: full credit for paintings, provenance for generated illustrations. */
  credit: string;
  /** Exact scripture phrases the image points to, listed as text beside it. */
  labels?: { heading: string; phrases: string[] };
  kind?: "painting" | "diagram";
};
const ART: Art[] = [
  {
    book: "Isaiah", chapter: "40", verse: 11, src: "/cfm/art/tissot-good-shepherd.webp", width: 382, height: 713, maxWidth: 190,
    alt: "Jesus carries a sheep on His shoulders along a rocky path, in James Tissot’s The Good Shepherd.",
    credit: '<a href="https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_The_Good_Shepherd_(Le_bon_pasteur)_-_James_Tissot_-_overall.jpg"><cite>The Good Shepherd</cite></a>, James Tissot, 1886–1894. Brooklyn Museum. Public domain.',
  },
  {
    book: "Isaiah", chapter: "53", verse: 4, src: "/cfm/art/bloch-gethsemane.webp", width: 640, height: 896, maxWidth: 280,
    alt: "An angel comforts Jesus as He kneels in Gethsemane, in a painting by Carl Bloch.",
    credit: '<a href="https://commons.wikimedia.org/wiki/File:Carl_Heinrich_Bloch_-_Gethsemane.jpg"><cite>Christ in Gethsemane</cite></a>, Carl Bloch, 1873. Public domain, via Wikimedia Commons.',
  },
  {
    book: "Isaiah", chapter: "54", verse: 2, src: "/cfm/art/isaiah-54-enlarged-tent.webp", width: 840, height: 630, maxWidth: 280,
    kind: "diagram",
    alt: "Diagram of a goat-hair tent enlarged: curtains extended, cords lengthened, stakes strengthened, as described in Isaiah 54:2.",
    credit: "Illustration of Isaiah 54:2: enlarged curtains, lengthened cords, and strengthened stakes. Generated illustration; not a historical reconstruction.",
    labels: {
      heading: "Phrases from Isaiah 54:2 shown in the diagram",
      phrases: ["Enlarge the place of thy tent", "stretch forth the curtains", "lengthen thy cords", "strengthen thy stakes"],
    },
  },
];
const artFigure = (art: Art) =>
  `<figure class="cfm-art${art.kind === "diagram" ? " cfm-art-diagram" : ""}" data-cfm-added="art" style="--cfm-art-w:${art.maxWidth}px">` +
  `<img src="${art.src}" width="${art.width}" height="${art.height}" alt="${escapeHtml(art.alt)}" loading="lazy" decoding="async">` +
  (art.labels
    ? `<ul class="cfm-art-labels" aria-label="${escapeHtml(art.labels.heading)}">` +
      art.labels.phrases.map((phrase) => `<li>“${escapeHtml(phrase)}”</li>`).join("") +
      "</ul>"
    : "") +
  `<figcaption>${art.credit}</figcaption></figure>\n`;

export function readingTime(words: number) {
  const minutes = Math.ceil(words / 200);
  if (minutes < 60) return `About ${minutes} minutes`;
  const rounded = Math.round(minutes / 5) * 5;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `About ${hours} hr ${rest} min` : `About ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function readGuideMarkdown(guide: Guide, root = process.cwd()): string {
  const markdown = fs.readFileSync(path.join(root, CFM_CONTENT_DIR, `${guide.slug}.md`), "utf8");
  if (createHash("sha256").update(markdown).digest("hex") !== guide.sha256) {
    throw new Error(`CFM source hash mismatch: ${guide.slug}`);
  }
  return markdown;
}

export function readGuides(root = process.cwd()): Guide[] {
  return JSON.parse(fs.readFileSync(path.join(root, CFM_CONTENT_DIR, "guides.json"), "utf8")) as Guide[];
}

export function readGuide(guide: Guide, root = process.cwd()): ParsedGuide {
  return parseGuide(guide, readGuideMarkdown(guide, root));
}

export function parseGuide(guide: Guide, markdown: string): ParsedGuide {
  validateGuideMarkdown(markdown);
  const toc: TocItem[] = [];
  const passages: GuidePassage[] = [];
  const counts = new Map<string, number>();
  // Book and chapter of the h2 section being rendered, for local close-reading leads like "**40:1–2, …**".
  let context: { book: string; chapter: string } | null = null;
  const scriptureBook = /^(.+?) \d/.exec(guide.scripture)?.[1];
  const guideBook = scriptureBook && findBook(scriptureBook) ? scriptureBook : undefined;
  const range = guideRange(guide.scripture);
  const leadIds = new Set<string>();
  const placedArt = new Set<Art>();

  /** In-page anchor into the scripture pane, when the reference is inside this guide's chapters. */
  const localTarget = (book: string, chapter: number, first?: number, last?: number) => {
    if (!range || book !== range.book || chapter < range.first || chapter > range.last) return null;
    return scriptureAnchor(range.slug, chapter, first, last);
  };
  const localLink = (anchor: string, html: string, chapter: number, first?: number, last?: number) =>
    `<a class="cfm-scripture cfm-local" data-cfm-local href="#${anchor}" data-chapter="${chapter}"` +
    (first != null ? ` data-first="${first}" data-last="${last ?? first}"` : "") +
    `>${html}</a>`;
  const passageAttrs = (passage: GuidePassage) =>
    ` data-cfm-passage data-chapter="${passage.chapter}" data-first="${passage.first}" data-last="${passage.last}"` +
    (passage.firstHalf ? ` data-first-half="${passage.firstHalf}"` : "") +
    (passage.lastHalf ? ` data-last-half="${passage.lastHalf}"` : "");

  const parser = new Marked({
    gfm: true,
    renderer: {
      // Bare "44:28" refs resolve to the chapter section's book, else the guide's own book ("Isaiah 40–49").
      text(token) {
        return renderTextToken(token, context?.book ?? guideBook);
      },
      // Raw HTML from the source is shown as text, never executed. Validation already rejects it.
      html({ text }) {
        return escapeHtml(text);
      },
      image({ text }) {
        return escapeHtml(text);
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const safe = safeHref(href);
        if (!safe) return inner;
        const external = /^https?:/.test(safe);
        return (
          `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ""}` +
          `${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${inner}</a>`
        );
      },
      heading({ text, depth, tokens }) {
        const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
        const count = (counts.get(base) ?? 0) + 1;
        counts.set(base, count);
        const id = count === 1 ? base : `${base}-${count}`;
        const plain = text.replace(/[*_]/g, "");
        let inner = this.parser.parseInline(tokens);
        let className = "";
        let attrs = "";
        // Structured headings only add wrappers; every source word and separator stays in the DOM.
        if (depth === 2) {
          const item: TocItem = { id, text: plain, depth, kind: "section", part: "reader", verses: [] };
          const chapter = CHAPTER.exec(plain);
          const shown = CHAPTER.exec(inner);
          if (chapter && shown) {
            Object.assign(item, { kind: "chapter", book: chapter[1], number: chapter[2], subtitle: chapter[3] });
            className = "cfm-h-chapter";
            const label = `<span class="cfm-ch-book">${shown[1]}</span> <span class="cfm-ch-num">${shown[2]}</span>`;
            const anchor = localTarget(chapter[1], Number(chapter[2]));
            inner =
              (anchor ? localLink(anchor, label, Number(chapter[2])) : label) +
              (shown[3] ? `<span class="cfm-sr">: </span><span class="cfm-ch-title">${shown[3]}</span>` : "");
          } else if (SOURCES.test(plain)) item.kind = "sources";
          toc.push(item);
        } else if (depth === 3) {
          const verse = VERSE.exec(plain);
          const shown = VERSE.exec(inner);
          if (verse && shown) {
            className = "cfm-h-verse";
            const ref = VERSE_RANGE.exec(verse[1]);
            const chapter = ref ? Number(ref[2]) : NaN;
            const first = ref ? Number(ref[3]) : NaN;
            const last = ref ? Number(ref[4] ?? ref[3]) : NaN;
            const anchor = ref && ref[1] ? localTarget(ref[1], chapter, first, last) : null;
            let refHtml: string;
            if (anchor) {
              const label = verse[1].slice(verse[1].lastIndexOf(" ") + 1);
              const passage: GuidePassage = { id, label, chapter, first, last, ...passageHalves(label) };
              passages.push(passage);
              attrs = passageAttrs(passage);
              refHtml = localLink(anchor, shown[1], chapter, first, last);
            } else {
              const url = referenceUrl(verse[1]);
              refHtml = url ? scriptureLink(url, shown[1]) : shown[1];
            }
            inner = `<span class="cfm-vref">${refHtml}</span><span class="cfm-sr"> — </span><span class="cfm-vtitle">${shown[2]}</span>`;
            toc[toc.length - 1]?.verses.push({ id, ref: verse[1], short: verse[1].replace(/^.*? (?=\d{1,3}:)/, ""), text: verse[2] });
          }
        }
        return `<h${depth} id="${id}"${className ? ` class="${className}"` : ""}${attrs}>${inner}</h${depth}>\n`;
      },
      // Mark paragraphs that open with a bold run-in ("**40:1–2, …**", "**Verse 1**").
      paragraph({ tokens }) {
        const lead = tokens[0]?.type === "strong";
        let inner = this.parser.parseInline(tokens);
        const leadText = lead ? (tokens[0] as Tokens.Strong).text : "";
        const local = lead && context ? matchLocalLead(leadText, context.chapter) : null;
        let id = "";
        let attrs = "";
        if (local && context) {
          // Close-reading leads get their own anchors (prefixed so they can never collide with heading ids)
          // and join the chapter > verse contents just like verse headings.
          const base = `cfm-v-${local.chapter}-${local.first}${local.last ? `-${local.last}` : ""}`;
          id = base;
          for (let n = 2; leadIds.has(id); n++) id = `${base}-${n}`;
          leadIds.add(id);
          const chapter = Number(local.chapter);
          const first = Number(local.first);
          const last = Number(local.last ?? local.first);
          const anchor = localTarget(context.book, chapter, first, last);
          const url = anchor ? null : scriptureUrl(context.book, local.chapter, local.first, local.last);
          // The text renderer may already have linked the lead ref to its passage page; either way the
          // lead's own ref becomes one link, to the local pane when the verses are in this guide's range.
          const linked = new RegExp(
            String.raw`^<strong><a class="cfm-scripture" data-cfm-scripture href="[^"]*">${local.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</a>`
          ).exec(inner);
          const leadLength = linked ? linked[0].length : inner.startsWith(`<strong>${local.text}`) ? 8 + local.text.length : 0;
          if ((anchor || url) && leadLength) {
            const link = anchor ? localLink(anchor, local.text, chapter, first, last) : scriptureLink(url, local.text);
            inner = `<strong>${link}${inner.slice(leadLength)}`;
          }
          if (anchor) {
            const passage: GuidePassage = { id, label: local.text, chapter, first, last, ...passageHalves(local.text) };
            passages.push(passage);
            attrs = passageAttrs(passage);
          }
          const title = leadText
            .slice(local.text.length)
            .replace(/[*_]/g, "")
            .replace(/^[\s,.:;—–-]+/, "")
            .replace(/[\s.:]+$/, "");
          toc[toc.length - 1]?.verses.push({ id, ref: `${context.book} ${local.text}`, short: local.text, text: title });
        }
        return `<p${id ? ` id="${id}"` : ""}${lead ? ' class="cfm-lead"' : ""}${attrs}>${inner}</p>\n`;
      },
    },
  });

  // The document title becomes the page's h1; the rest renders below it.
  const title = /^# (.+)$/m.exec(markdown)?.[1].trim() ?? guide.title;
  const body = markdown.replace(/^# .+\r?\n/, "");
  // Group top-level blocks by h2 so each chapter renders as its own <section>.
  const tokens = parser.lexer(body);
  markPlainTokens(tokens);
  const groups: Token[][] = [[]];
  for (const token of tokens) {
    if (token.type === "heading" && token.depth === 2) groups.push([]);
    groups[groups.length - 1].push(token);
  }
  const renderBlocks = (blocks: Token[]) =>
    parser
      .parser(blocks)
      .replace(/<table>/g, '<div class="cfm-table" role="region" aria-label="Scrollable table" tabindex="0"><table>')
      .replace(/<\/table>/g, "</table></div>");

  // A verse subsection is a verse h3 ("Isaiah 50:1–3 — …") or a close-reading lead ("**40:1–2, …**"),
  // running until the next heading or lead. Its Sources panel lists the primary passage plus only
  // the links that actually appear inside that subsection.
  type Primary = { label: string; url: string | null; book: string; chapter: string; first: number; last: number };
  const primaryFor = (token: Token): Primary | null => {
    if (token.type === "heading" && token.depth === 3) {
      const m = VERSE.exec(String(token.text).replace(/[*_]/g, ""));
      if (!m) return null;
      // Single-chapter refs only; "52:13–53:12" gets no verse range.
      const r = / (\d{1,3}):(\d{1,3})[ab]?(?:[–-](\d{1,3})[ab]?)?$/.exec(m[1]);
      return {
        label: m[1],
        url: referenceUrl(m[1]),
        book: m[1].slice(0, m[1].lastIndexOf(" ")),
        chapter: r?.[1] ?? "",
        first: Number(r?.[2] ?? 0),
        last: Number(r?.[3] ?? r?.[2] ?? 0),
      };
    }
    if (token.type === "paragraph" && context && token.tokens?.[0]?.type === "strong") {
      const local = matchLocalLead((token.tokens[0] as Tokens.Strong).text, context.chapter);
      return local
        ? {
            label: `${context.book} ${local.text}`,
            url: scriptureUrl(context.book, local.chapter, local.first, local.last),
            book: context.book,
            chapter: local.chapter,
            first: Number(local.first),
            last: Number(local.last ?? local.first),
          }
        : null;
    }
    return null;
  };
  const artFor = (primary: Primary) => {
    const art = ART.find(
      (a) =>
        !placedArt.has(a) &&
        a.book === primary.book &&
        a.chapter === primary.chapter &&
        a.verse >= primary.first &&
        a.verse <= primary.last
    );
    if (!art) return "";
    placedArt.add(art);
    return artFigure(art);
  };
  const sourcesPanel = (primary: Primary, blocks: Token[]) => {
    const cited = new Map<string, string>();
    parser.walkTokens(blocks, (token) => {
      if (token.type !== "link") return;
      const href = safeHref(token.href);
      if (href && !cited.has(href)) cited.set(href, String(token.text).replace(/[*_]/g, ""));
    });
    if (!primary.url && cited.size === 0) return "";
    const items = [
      primary.url
        ? `<li><a href="${escapeHtml(primary.url)}">${escapeHtml(primary.label)}</a> <span>(scripture text)</span></li>`
        : "",
      ...Array.from(cited).map(
        ([href, text]) =>
          `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a></li>`
      ),
    ].join("");
    const note = cited.size === 0 ? `<p>Commentary is the guide's interpretation.</p>` : "";
    return `<details class="cfm-sources" data-cfm-added="sources"><summary>Sources</summary><ul>${items}</ul>${note}</details>\n`;
  };
  const render = (group: Token[]) => {
    let html = "";
    let blocks: Token[] = [];
    let primary: Primary | null = null;
    const flush = () => {
      if (!primary) {
        html += renderBlocks(blocks);
        blocks = [];
        return;
      }
      // Keep the trailing thematic break last so the chapter rule still replaces it.
      let end = blocks.length;
      while (end > 1 && (blocks[end - 1].type === "hr" || blocks[end - 1].type === "space")) end--;
      // Artwork, when it belongs to this passage, sits right after the verse heading or lead paragraph.
      html +=
        renderBlocks(blocks.slice(0, 1)) +
        artFor(primary) +
        renderBlocks(blocks.slice(1, end)) +
        sourcesPanel(primary, blocks.slice(0, end)) +
        renderBlocks(blocks.slice(end));
      blocks = [];
      primary = null;
    };
    for (const token of group) {
      const next = primaryFor(token);
      if (next || token.type === "heading") {
        flush();
        primary = next;
      }
      blocks.push(token);
    }
    flush();
    return html;
  };
  const [preamble, ...sections] = groups;
  // The paired reader starts at the first chapter section of the guide's own range (a section the parser
  // has already identified as chapter N of this guide's book); everything before it is introduction, and
  // everything from it on, including the closing synthesis and sources, is the reader.
  let introductionHtml = preamble.some((token) => token.type !== "space")
    ? `<div class="cfm-preamble">\n${render(preamble)}</div>\n`
    : "";
  let readerHtml = "";
  let reading = false;
  for (const group of sections) {
    const first = toc.length;
    const head = group[0] as Tokens.Heading;
    const chapter = CHAPTER.exec(head.text.replace(/[*_]/g, ""));
    context = chapter && findBook(chapter[1]) ? { book: chapter[1], chapter: chapter[2] } : null;
    const content = render(group);
    const item = toc[first];
    const chapterAttr =
      context && localTarget(context.book, Number(context.chapter)) ? ` data-chapter="${context.chapter}"` : "";
    const section = `<section class="cfm-section" data-kind="${item.kind}"${chapterAttr} aria-labelledby="${item.id}">\n${content}</section>\n`;
    if (chapterAttr) reading = true;
    if (reading) {
      readerHtml += section;
    } else {
      item.part = "introduction";
      introductionHtml += section;
    }
  }
  if (!reading) {
    // No chapter of the range to pair with: the whole guide stays in the reader, as one document.
    readerHtml = introductionHtml;
    introductionHtml = "";
    for (const item of toc) item.part = "reader";
  }
  const html = introductionHtml + readerHtml;
  return { title, html, introductionHtml, readerHtml, toc, passages, range, words: markdown.split(/\s+/).length };
}
