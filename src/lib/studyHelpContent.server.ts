// Reads a Bible Dictionary, Guide to the Scriptures, or Topical Guide entry from its official page into the
// structured StudyHelpEntry the app renders. Only published topics (in the committed index) are fetched, from a
// URL built here; the page's article is parsed with an HTML parser and only its text, emphasis, and checked
// links are kept, so nothing from the page (scripts, styles, attributes, site navigation) reaches the app.

import { parseDocument, DomUtils } from "htmlparser2";
import type { ChildNode, Element } from "domhandler";
import studyHelpsIndexJson from "./generated/studyHelpsIndex.json";
import { passageFromLink, chapterHref } from "../features/comeFollowMe/passagePreview.ts";
import {
  slugifyStudyHelpTitle,
  studyHelpEntryUrl,
  type StudyHelpGuideId,
  type StudyHelpsIndex,
} from "./studyHelps";
import type { StudyHelpBlock, StudyHelpEntry, StudyHelpInline } from "./studyHelpContent";

const CHURCH_ORIGIN = "https://www.churchofjesuschrist.org";
const CHURCH_HOSTS = new Set(["www.churchofjesuschrist.org", "churchofjesuschrist.org"]);
const GUIDE_IDS: readonly StudyHelpGuideId[] = ["bd", "gs", "tg"];

/** Limits on what one entry keeps; the longest Topical Guide entries run past them and are marked truncated. */
export const STUDY_HELP_LIMITS = { maxBlocks: 400, maxListItems: 600, maxChars: 120_000 };

let topicSlugs: Record<StudyHelpGuideId, Set<string>> | null = null;

function publishedSlugs(guide: StudyHelpGuideId): Set<string> {
  if (!topicSlugs) {
    const index = studyHelpsIndexJson as unknown as StudyHelpsIndex;
    const slugsOf = (id: StudyHelpGuideId) =>
      new Set(index.guides[id].entries.map((entry) => (typeof entry === "string" ? slugifyStudyHelpTitle(entry) : entry[1])));
    topicSlugs = { bd: slugsOf("bd"), gs: slugsOf("gs"), tg: slugsOf("tg") };
  }
  return topicSlugs[guide];
}

export function isStudyHelpGuideId(value: unknown): value is StudyHelpGuideId {
  return typeof value === "string" && (GUIDE_IDS as readonly string[]).includes(value);
}

/** True only for a guide and slug in the committed topic index. */
export function isPublishedStudyHelpTopic(guide: unknown, slug: unknown): guide is StudyHelpGuideId {
  return isStudyHelpGuideId(guide) && typeof slug === "string" && publishedSlugs(guide).has(slug);
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing

// Never read, even for their text.
const DROPPED = new Set([
  "script", "style", "noscript", "template", "iframe", "frame", "object", "embed", "svg", "math", "canvas",
  "form", "input", "button", "select", "textarea", "img", "picture", "video", "audio", "source", "link", "meta",
  "head", "title",
]);
const HEADINGS = new Set(["h2", "h3", "h4", "h5", "h6"]);
const LISTS = new Set(["ul", "ol"]);
const BLOCKS = new Set([
  ...HEADINGS, ...LISTS, "p", "div", "section", "nav", "header", "footer", "aside", "blockquote", "figure",
  "table", "tbody", "thead", "tr", "li", "dl", "dt", "dd", "h1",
]);

const isElement = (node: ChildNode): node is Element => node.type === "tag" || node.type === "script" || node.type === "style";
const hasClass = (element: Element, name: string) => (element.attribs.class ?? "").split(/\s+/).includes(name);

export class StudyHelpParseError extends Error {}

/** A link the app may show: an absolute https URL on the Church's site, resolved from the page's own href. */
export function safeChurchUrl(href: string | undefined): URL | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, CHURCH_ORIGIN);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !CHURCH_HOSTS.has(url.hostname) || url.username || url.password || url.port) return null;
  return url;
}

type Budget = { chars: number; truncated: boolean };

function linkNode(element: Element, children: StudyHelpInline[]): StudyHelpInline[] {
  const url = safeChurchUrl(element.attribs.href);
  if (!url || children.length === 0) return children;
  const link: Extract<StudyHelpInline, { href: string }> = { href: url.href, children };
  const topic = /^\/study\/scriptures\/(bd|gs|tg)\/([a-z0-9-]+)$/.exec(url.pathname);
  if (topic && isPublishedStudyHelpTopic(topic[1], topic[2])) {
    link.topic = { guide: topic[1] as StudyHelpGuideId, slug: topic[2] };
  } else {
    const passage = passageFromLink(url.href, null);
    if (passage) link.appHref = chapterHref(passage);
  }
  return [link];
}

function inlineContent(nodes: ChildNode[], budget: Budget): StudyHelpInline[] {
  const out: StudyHelpInline[] = [];
  for (const node of nodes) {
    if (budget.chars <= 0) {
      budget.truncated = true;
      break;
    }
    if (node.type === "text") {
      const text = node.data.replace(/\s+/g, " ");
      if (!text) continue;
      const kept = text.length > budget.chars ? text.slice(0, budget.chars) : text;
      budget.chars -= kept.length;
      const previous = out[out.length - 1];
      if (typeof previous === "string") out[out.length - 1] = (previous + kept).replace(/ {2,}/g, " ");
      else out.push(kept);
      continue;
    }
    if (!isElement(node) || DROPPED.has(node.name)) continue;
    if (node.name === "br") {
      out.push(" ");
      continue;
    }
    const children = inlineContent(node.children, budget);
    if (node.name === "a") out.push(...linkNode(node, children));
    else if (children.length === 0) continue;
    else if (node.name === "em" || node.name === "i") out.push({ mark: "em", children });
    else if (node.name === "strong" || node.name === "b") out.push({ mark: "strong", children });
    else if (node.name === "small") out.push({ mark: "small", children });
    else if (node.name === "span" && hasClass(node, "key-word")) out.push({ mark: "key", children });
    else out.push(...children);
  }
  return out;
}

/** Inline content with its outer whitespace trimmed; empty when it has no visible text. */
function trimInline(content: StudyHelpInline[]): StudyHelpInline[] {
  const trimmed = [...content];
  const trimEdge = (index: number, side: "start" | "end") => {
    const node = trimmed[index];
    if (typeof node === "string") {
      const text = side === "start" ? node.trimStart() : node.trimEnd();
      if (text) trimmed[index] = text;
      else trimmed.splice(index, 1);
      return !text;
    }
    return false;
  };
  while (trimmed.length > 0 && trimEdge(0, "start"));
  while (trimmed.length > 0 && trimEdge(trimmed.length - 1, "end"));
  const visible = (nodes: StudyHelpInline[]): boolean =>
    nodes.some((node) => (typeof node === "string" ? node.trim() !== "" : visible(node.children)));
  return visible(trimmed) ? trimmed : [];
}

function containsBlock(element: Element): boolean {
  return element.children.some((child) => isElement(child) && (BLOCKS.has(child.name) || containsBlock(child)));
}

class BlockWriter {
  blocks: StudyHelpBlock[] = [];
  listItems = 0;
  budget: Budget = { chars: STUDY_HELP_LIMITS.maxChars, truncated: false };

  private full(): boolean {
    if (this.blocks.length >= STUDY_HELP_LIMITS.maxBlocks || this.budget.chars <= 0) {
      this.budget.truncated = true;
      return true;
    }
    return false;
  }

  private push(block: StudyHelpBlock) {
    if (!this.full()) this.blocks.push(block);
  }

  private text(nodes: ChildNode[]): StudyHelpInline[] {
    return trimInline(inlineContent(nodes, this.budget));
  }

  /** Reads a run of block-level children; loose inline text between blocks becomes its own paragraph. */
  walk(nodes: ChildNode[]) {
    let loose: ChildNode[] = [];
    const flush = () => {
      const content = this.text(loose);
      if (content.length > 0) this.push({ type: "paragraph", content });
      loose = [];
    };
    for (const node of nodes) {
      if (this.full()) return;
      if (isElement(node) && (BLOCKS.has(node.name) || containsBlock(node))) {
        flush();
        this.element(node);
      } else {
        loose.push(node);
      }
    }
    flush();
  }

  private element(element: Element) {
    if (DROPPED.has(element.name)) return;
    if (HEADINGS.has(element.name)) {
      const content = this.text(element.children);
      if (content.length > 0) this.push({ type: "heading", content });
    } else if (element.name === "p") {
      const content = this.text(element.children);
      if (content.length > 0) this.push(hasClass(element, "title") ? { type: "paragraph", style: "title", content } : { type: "paragraph", content });
    } else if (LISTS.has(element.name)) {
      this.list(element);
    } else if (element.name === "tr") {
      // Table rows read as one line each, cells separated.
      const cells = element.children.filter(isElement).map((cell) => this.text(cell.children)).filter((cell) => cell.length > 0);
      const content = cells.flatMap((cell, index) => (index === 0 ? cell : [" — ", ...cell]));
      if (content.length > 0) this.push({ type: "paragraph", content });
    } else {
      this.walk(element.children);
    }
  }

  private list(element: Element) {
    const items: StudyHelpInline[][] = [];
    const flushItems = () => {
      if (items.length > 0) this.push({ type: "list", items: items.splice(0) });
    };
    for (const item of element.children) {
      if (!isElement(item) || item.name !== "li") continue;
      // A list item holding a title paragraph (the "See also" line) reads as that paragraph, not as a list item.
      const title = item.children.find((child) => isElement(child) && child.name === "p" && hasClass(child, "title"));
      const nested = item.children.some((child) => isElement(child) && LISTS.has(child.name));
      if (title || nested) {
        flushItems();
        this.walk(item.children);
        continue;
      }
      if (this.listItems >= STUDY_HELP_LIMITS.maxListItems || this.full()) {
        this.budget.truncated = true;
        break;
      }
      const content = this.text(item.children);
      if (content.length > 0) {
        items.push(content);
        this.listItems += 1;
      }
    }
    flushItems();
  }
}

/**
 * The entry in an official study helps page. The page must hold the article for exactly this guide and slug
 * (a generic page or a different topic is rejected); only the article's title and body are read.
 */
export function parseStudyHelpPage(html: string, guide: StudyHelpGuideId, slug: string): StudyHelpEntry {
  const document = parseDocument(html, { decodeEntities: true });
  const uri = `/scriptures/${guide}/${slug}`;
  const articles = DomUtils.findAll((element) => element.name === "article" && element.attribs["data-uri"] != null, document.children);
  const article = articles.find((element) => element.attribs["data-uri"] === uri);
  if (!article) throw new StudyHelpParseError(`The page has no ${uri} article.`);

  const heading = DomUtils.findOne((element) => element.name === "h1", article.children);
  const title = heading ? DomUtils.textContent(heading).replace(/\s+/g, " ").trim() : "";
  const body = DomUtils.findOne((element) => element.name === "div" && hasClass(element, "body-block"), article.children);
  if (!title || !body) throw new StudyHelpParseError(`The ${uri} article has no title or text.`);

  const writer = new BlockWriter();
  writer.walk(body.children);
  if (writer.blocks.length === 0) throw new StudyHelpParseError(`The ${uri} article has no text.`);
  return {
    guide,
    slug,
    title,
    url: studyHelpEntryUrl(guide, slug),
    blocks: writer.blocks,
    truncated: writer.budget.truncated,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Fetching

export class StudyHelpRequestError extends Error {
  constructor(message: string, readonly status: 404 | 502 | 504) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;
/** The largest Topical Guide pages are about 1.5 MiB. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_CACHED = 200;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

async function readLimited(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new StudyHelpRequestError("The page is too large.", 502);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new StudyHelpRequestError("The page is too large.", 502);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Fetches and parses one published entry. Throws StudyHelpRequestError for anything but a readable entry. */
export async function fetchStudyHelpEntry(
  guide: StudyHelpGuideId,
  slug: string,
  { fetch: fetchImpl = fetch as Fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES }: { fetch?: Fetch; timeoutMs?: number; maxBytes?: number } = {}
): Promise<StudyHelpEntry> {
  if (!isPublishedStudyHelpTopic(guide, slug)) throw new StudyHelpRequestError("Unknown study helps topic.", 404);
  const signal = AbortSignal.timeout(timeoutMs);
  let html: string;
  try {
    const response = await fetchImpl(studyHelpEntryUrl(guide, slug), {
      signal,
      redirect: "follow",
      headers: { accept: "text/html" },
    });
    if (response.url && !safeChurchUrl(response.url)) throw new StudyHelpRequestError("The page moved off the Church's site.", 502);
    if (response.status === 404) throw new StudyHelpRequestError("The entry was not found.", 404);
    if (!response.ok) throw new StudyHelpRequestError(`The page answered ${response.status}.`, 502);
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) throw new StudyHelpRequestError("The page is not HTML.", 502);
    html = await readLimited(response, maxBytes);
  } catch (error) {
    if (error instanceof StudyHelpRequestError) throw error;
    if (signal.aborted) throw new StudyHelpRequestError("The page took too long to load.", 504);
    throw new StudyHelpRequestError("The page could not be loaded.", 502);
  }
  try {
    return parseStudyHelpPage(html, guide, slug);
  } catch (error) {
    if (error instanceof StudyHelpParseError) throw new StudyHelpRequestError(error.message, 502);
    throw error;
  }
}

type CacheEntry = { expiresAt: number; entry: StudyHelpEntry };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<StudyHelpEntry>>();

/**
 * fetchStudyHelpEntry with a bounded cache of parsed entries (12 hours, at most 200) and one shared request per
 * entry at a time. Failures are never cached, so the next request tries again.
 */
export function loadStudyHelpEntry(guide: StudyHelpGuideId, slug: string, options?: Parameters<typeof fetchStudyHelpEntry>[2]): Promise<StudyHelpEntry> {
  const key = `${guide}/${slug}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, cached);
    return Promise.resolve(cached.entry);
  }
  cache.delete(key);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetchStudyHelpEntry(guide, slug, options)
    .then((entry) => {
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, entry });
      while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
      return entry;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export function clearStudyHelpCache() {
  cache.clear();
  inFlight.clear();
}
