#!/usr/bin/env node
// Generates the native app's portable data from the repository's checked-in sources. Nothing here is
// hand-written content: every guide word comes from content/cfm/*.md through the web app's own parser
// (src/lib/cfm/cfmGuide.ts), and every image is a file under public/.
//
//   node scripts/generate-mobile-data.mjs          write src/generated/*
//   node scripts/generate-mobile-data.mjs --check  exit 1 when the checked-in output is stale
//
// Requires the repository root's dependencies (`npm ci` at the root) for `marked` and `htmlparser2`, which the
// web parser already uses. The mobile app itself reads only the generated output and public/ assets.
//
// Outputs:
//   src/generated/cfmGuides.json   every published guide as a native block tree (see src/cfm/guideTypes.ts), with
//                                  each guide root's text exactly as the website's DOM holds it (GuideRoot) and
//                                  where each run's words are in it, so guide highlights anchor as on the web
//   src/generated/images.ts        a static require() for each public/ image the app shows

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeHTML } from "entities";
import { parseDocument } from "htmlparser2";
import { parseFragment } from "parse5";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, "..");
const repoRoot = path.resolve(mobileRoot, "..");
const outDir = path.join(mobileRoot, "src", "generated");
const check = process.argv.includes("--check");

const { readGuides, readGuide, readingTime } = await import(path.join(repoRoot, "src/lib/cfm/cfmGuide.ts"));
const { findBook } = await import(path.join(repoRoot, "src/lib/cfm/cfmScriptures.mjs"));
const { GUIDE_BLOCK_PATTERN } = await import(path.join(repoRoot, "convex/annotationRules.ts"));

// ---------------------------------------------------------------------------------------------------------
// HTML (the web renderer's output) → native blocks. Every text node is kept, in order.

const text = (node) => (node.type === "text" ? node.data : (node.children ?? []).map(text).join(""));
const cls = (node) => (node.attribs?.class ?? "").split(/\s+/).filter(Boolean);
const hasClass = (node, name) => cls(node).includes(name);
const elements = (node) => (node.children ?? []).filter((child) => child.type === "tag");

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const VOLUME_PATHS = { oldtestament: "oldtestament", newtestament: "newtestament", bookofmormon: "bookofmormon", dnc: "doctrineandcovenants", doctrineandcovenants: "doctrineandcovenants", pearl: "pearl" };

/**
 * A link's target: a scripture passage (in this guide's chapters or anywhere), an in-page anchor, or a web URL.
 * A link into the guide's own chapters carries its chapter's key in the range (data-chapter, see RangeChapter
 * in src/lib/cfm/cfmAnchors.ts); the native ref names the real book and chapter instead, so "Lamentations 3:22"
 * in a guide that starts in Jeremiah opens Lamentations 3, never Jeremiah 3.
 */
function linkTarget(node, guideRange) {
  const href = decodeEntities(node.attribs?.href ?? "");
  if (node.attribs?.["data-cfm-local"] !== undefined) {
    const key = Number(node.attribs["data-chapter"]);
    const entry = guideRange.entries.find((item) => item.key === key);
    if (!entry) throw new Error(`Local link ${href} names chapter key ${key}, which is not in the guide's range`);
    const first = node.attribs["data-first"] ? Number(node.attribs["data-first"]) : undefined;
    const last = node.attribs["data-last"] ? Number(node.attribs["data-last"]) : first;
    return { ref: { volume: entry.volume, book: entry.slug, chapter: entry.chapter, first, last, local: true } };
  }
  const browse = /\/browse\/([a-z]+)\/([a-z0-9]+)\/(\d{1,3})(?:#v-(\d{1,3}))?$/.exec(href);
  if (browse && VOLUME_PATHS[browse[1]]) {
    const first = browse[4] ? Number(browse[4]) : undefined;
    const last = node.attribs?.["data-last"] ? Number(node.attribs["data-last"]) : first;
    const volume = VOLUME_PATHS[browse[1]];
    const chapter = Number(browse[3]);
    const local = guideRange.entries.some((entry) => entry.volume === volume && entry.slug === browse[2] && entry.chapter === chapter);
    return { ref: { volume, book: browse[2], chapter, first, last, ...(local ? { local: true } : {}) } };
  }
  if (href.startsWith("#")) return { anchor: href.slice(1) };
  if (/^https?:\/\//.test(href)) return { url: href };
  return {};
}

// Each run keeps where its characters are in its root's text (see GuideRoot): `_src` holds [run offset, root offset]
// pairs while runs are built (root offset -1: characters the page doesn't have as text, a line break's "\n" or an
// image's alt), finished by finishRuns as `at` (one stretch, in order) or `src` (the pairs, flattened).

function pushRun(runs, value, style, segments = [[0, -1]]) {
  if (!value) return;
  const last = runs[runs.length - 1];
  const sameStyle = (a, b) => JSON.stringify({ ...a, text: undefined, _src: undefined }) === JSON.stringify({ ...b, text: undefined, _src: undefined });
  const run = { text: value, ...style, _src: segments };
  if (last && sameStyle(last, run)) {
    const offset = last.text.length;
    last.text += value;
    last._src.push(...segments.map(([at, source]) => [at + offset, source]));
  } else runs.push(run);
}

/** A text node's characters as a run shows them (whitespace collapsed), with each stretch's offset in the root. */
function collapsedText(node, ctx) {
  const value = decodeEntities(node.data);
  // The browser decodes every entity; the runs decode these five. A guide using any other would show it raw.
  if (value !== decodeHTML(node.data)) throw new Error(`Unsupported HTML entity in ${JSON.stringify(node.data.slice(0, 80))}`);
  const base = ctx.offsets?.get(node);
  let text = "";
  const segments = [];
  const pattern = /\s+|\S+/g;
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
    segments.push([text.length, base == null ? -1 : base + match.index]);
    text += /^\s/.test(match[0]) ? " " : match[0];
  }
  return { text, segments };
}

/** Drops `count` characters from the front of a run's segments. */
function dropFront(segments, count, length) {
  const out = [];
  segments.forEach(([at, source], index) => {
    const end = index + 1 < segments.length ? segments[index + 1][0] : length;
    if (end <= count) return;
    if (at < count) out.push([0, source < 0 ? -1 : source + (count - at)]);
    else out.push([at - count, source]);
  });
  return out;
}

/** The run's map in its final form: `at` for one in-order stretch, else `src` [run offset, root offset, …]. */
function finishRun(run) {
  const segments = run._src ?? [[0, -1]];
  delete run._src;
  const merged = [];
  for (const [at, source] of segments) {
    if (at >= run.text.length) continue;
    const last = merged[merged.length - 1];
    if (last && (last[1] < 0 ? source < 0 : source === last[1] + (at - last[0]))) continue;
    merged.push([at, source]);
  }
  if (merged.length === 1 && merged[0][0] === 0 && merged[0][1] >= 0) run.at = merged[0][1];
  else if (merged.some(([, source]) => source >= 0)) run.src = merged.flat();
  return run;
}

/** Inline content as styled runs, trimmed at the paragraph's outer edges only. */
function inlineRuns(nodes, ctx) {
  const runs = collectRuns(nodes, ctx, {}, []);
  if (runs.length) {
    const first = runs[0];
    const trimmed = first.text.replace(/^\s+/, "");
    first._src = dropFront(first._src, first.text.length - trimmed.length, first.text.length);
    first.text = trimmed;
    const last = runs[runs.length - 1];
    last.text = last.text.replace(/\s+$/, "");
  }
  return runs.filter((run) => run.text).map(finishRun);
}

function collectRuns(nodes, ctx, style, runs) {
  for (const node of nodes) {
    if (node.type === "text") {
      const { text: value, segments } = collapsedText(node, ctx);
      pushRun(runs, value, style, segments);
      continue;
    }
    if (node.type !== "tag") continue;
    const name = node.name;
    if (name === "br") pushRun(runs, "\n", style);
    else if (name === "strong" || name === "b") collectRuns(node.children, ctx, { ...style, bold: true }, runs);
    else if (name === "em" || name === "i" || name === "cite") collectRuns(node.children, ctx, { ...style, italic: true }, runs);
    else if (name === "code") collectRuns(node.children, ctx, { ...style, code: true }, runs);
    else if (name === "a") collectRuns(node.children, ctx, { ...style, ...linkTarget(node, ctx.range) }, runs);
    else if (name === "img") pushRun(runs, node.attribs?.alt ?? "", style);
    else collectRuns(node.children ?? [], ctx, style, runs);
  }
  return runs;
}

function imageKey(src) {
  return src.replace(/^\//, "");
}

function convertBlocks(nodes, ctx) {
  const blocks = [];
  for (const node of nodes) {
    if (node.type === "text") {
      if (node.data.trim()) blocks.push({ kind: "p", runs: inlineRuns([node], ctx) });
      continue;
    }
    if (node.type !== "tag") continue;
    const id = node.attribs?.id;
    switch (node.name) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const depth = Number(node.name[1]);
        const block = { kind: "heading", depth, ...(id ? { id } : {}), runs: inlineRuns(node.children, ctx) };
        const find = (name) => {
          const stack = [...elements(node)];
          while (stack.length) {
            const el = stack.shift();
            if (hasClass(el, name)) return el;
            stack.unshift(...elements(el));
          }
          return null;
        };
        if (hasClass(node, "cfm-h-chapter")) {
          const book = find("cfm-ch-book");
          const num = find("cfm-ch-num");
          const title = find("cfm-ch-title");
          block.chapterLabel = `${text(book ?? { children: [] })} ${text(num ?? { children: [] })}`.trim();
          if (title) block.title = inlineRuns(title.children, ctx);
          if (node.attribs?.["data-chapter"]) block.chapter = Number(node.attribs["data-chapter"]);
        } else if (hasClass(node, "cfm-h-verse")) {
          const vref = find("cfm-vref");
          const vtitle = find("cfm-vtitle");
          if (vref) block.refRuns = inlineRuns(vref.children, ctx);
          if (vtitle) block.title = inlineRuns(vtitle.children, ctx);
        }
        blocks.push(block);
        break;
      }
      case "p":
        blocks.push({ kind: "p", ...(id ? { id } : {}), ...(hasClass(node, "cfm-lead") ? { lead: true } : {}), runs: inlineRuns(node.children, ctx) });
        break;
      case "ul":
      case "ol": {
        if (hasClass(node, "cfm-art-labels")) break;
        const start = node.attribs?.start ? Number(node.attribs.start) : undefined;
        const items = elements(node)
          .filter((li) => li.name === "li")
          .map((li) => {
            const hasBlockChild = elements(li).some((child) => ["p", "ul", "ol", "blockquote", "table"].includes(child.name));
            return hasBlockChild ? convertBlocks(li.children, ctx) : [{ kind: "p", runs: inlineRuns(li.children, ctx) }];
          });
        blocks.push({ kind: "list", ordered: node.name === "ol", ...(start ? { start } : {}), items });
        break;
      }
      case "blockquote":
        blocks.push({ kind: "quote", blocks: convertBlocks(node.children, ctx) });
        break;
      case "table": {
        const rows = [];
        const stack = [node];
        while (stack.length) {
          const el = stack.shift();
          if (el.name === "tr") {
            rows.push({
              header: elements(el).some((cell) => cell.name === "th"),
              cells: elements(el).filter((cell) => cell.name === "td" || cell.name === "th").map((cell) => inlineRuns(cell.children, ctx)),
            });
          } else stack.push(...elements(el));
        }
        blocks.push({ kind: "table", rows });
        break;
      }
      case "figure": {
        const img = elements(node).find((el) => el.name === "img");
        const caption = elements(node).find((el) => el.name === "figcaption");
        const labelList = elements(node).find((el) => hasClass(el, "cfm-art-labels"));
        if (img) {
          const src = img.attribs.src;
          ctx.images.add(imageKey(src));
          blocks.push({
            kind: "figure",
            image: imageKey(src),
            width: Number(img.attribs.width),
            height: Number(img.attribs.height),
            alt: decodeEntities(img.attribs.alt ?? ""),
            ...(caption ? { caption: inlineRuns(caption.children, ctx) } : {}),
            ...(labelList
              ? { labelsHeading: labelList.attribs["aria-label"], labels: elements(labelList).map((li) => decodeEntities(text(li))) }
              : {}),
          });
        }
        break;
      }
      case "details": {
        if (hasClass(node, "cfm-sources")) {
          const list = elements(node).find((el) => el.name === "ul");
          const note = elements(node).find((el) => el.name === "p");
          blocks.push({
            kind: "sources",
            items: list ? elements(list).map((li) => inlineRuns(li.children, ctx)) : [],
            ...(note ? { note: decodeEntities(text(note)) } : {}),
          });
        } else blocks.push(...convertBlocks(node.children, ctx));
        break;
      }
      case "hr":
        blocks.push({ kind: "rule" });
        break;
      case "pre":
        blocks.push({ kind: "p", runs: [finishRun({ text: decodeEntities(text(node)), code: true })] });
        break;
      default:
        // section, div, summary and other containers: their content, in order.
        blocks.push(...convertBlocks(node.children ?? [], ctx));
    }
  }
  return blocks;
}

function htmlBlocks(html, ctx) {
  return htmlRoot(html, ctx).blocks;
}

// ---------------------------------------------------------------------------------------------------------
// Guide roots: each piece of guide HTML the website renders into its own element (the introduction, a section's
// heading, a context block's preview and its full commentary, the fallback, the closing sections). The guide's
// highlights are anchored in the text of those elements exactly as the DOM holds it (useGuideHighlights'
// buildIndex: every text node's data in document order, and each element with a usable id at the offset where it
// starts), so the native app needs that same text, not the runs' tidied copy.

const isUsableBlockId = (id) => typeof id === "string" && id.length > 0 && GUIDE_BLOCK_PATTERN.test(id);

/** The root's text, its anchors, and each text node's offset in it (for the runs' maps). */
function rootIndex(document) {
  let text = "";
  const anchors = [];
  const offsets = new Map();
  const walk = (nodes, parent) => {
    nodes.forEach((node, index) => {
      if (node.type === "text") {
        let data = decodeHTML(node.data);
        // The HTML parser drops a newline straight after <pre>'s start tag.
        if (index === 0 && parent?.name === "pre" && data.startsWith("\n")) data = data.slice(1);
        offsets.set(node, text.length);
        text += data;
        return;
      }
      if (node.type !== "tag" && node.type !== "script" && node.type !== "style") return;
      if (isUsableBlockId(node.attribs?.id)) anchors.push([node.attribs.id, text.length]);
      walk(node.children ?? [], node);
    });
  };
  walk(document.children, null);
  return { text, anchors, offsets };
}

/** The same root as a browser parses it (parse5 is the HTML standard's parser), to check rootIndex against. */
function browserIndex(html) {
  let text = "";
  const anchors = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.nodeName === "#text") text += node.value;
      else if (node.tagName) {
        const id = node.attrs?.find((attr) => attr.name === "id")?.value;
        if (isUsableBlockId(id)) anchors.push([id, text.length]);
        walk(node.tagName === "template" ? node.content.childNodes : node.childNodes ?? []);
      }
    }
  };
  walk(parseFragment(html).childNodes);
  return { text, anchors };
}

/** A root's native blocks and its text index, checked against the browser's. */
function htmlRoot(html, ctx, label = "guide") {
  if (!html || !html.trim()) {
    return { blocks: [], root: { text: html ? browserIndex(html).text : "", anchors: [] } };
  }
  const document = parseDocument(html, { decodeEntities: false });
  const { text: rootText, anchors, offsets } = rootIndex(document);
  const browser = browserIndex(html);
  if (browser.text !== rootText || JSON.stringify(browser.anchors) !== JSON.stringify(anchors)) {
    let at = 0;
    while (at < rootText.length && rootText[at] === browser.text[at]) at++;
    throw new Error(`${label}: the root's text differs from the browser's at ${at}: ${JSON.stringify(rootText.slice(at, at + 40))} vs ${JSON.stringify(browser.text.slice(at, at + 40))}`);
  }
  const blocks = convertBlocks(document.children, { ...ctx, offsets });
  return { blocks, root: { text: rootText, anchors } };
}

// ---------------------------------------------------------------------------------------------------------

const guides = readGuides(repoRoot).sort((a, b) => a.startDate.localeCompare(b.startDate));
const images = new Set();
const out = [];
for (const guide of guides) {
  const parsed = readGuide(guide, repoRoot);
  if (!parsed.range) throw new Error(`Guide ${guide.slug} has no readable scripture range`);
  const ctx = { range: parsed.range, images };
  out.push({
    slug: guide.slug,
    title: parsed.title,
    scripture: guide.scripture,
    startDate: guide.startDate,
    endDate: guide.endDate,
    dateLabel: guide.dateLabel,
    author: guide.author,
    summary: guide.summary,
    sha256: guide.sha256,
    readingTime: readingTime(parsed.words),
    // Chapter keys (see RangeChapter): `chapters`, sections' and passages' `chapter`, and `key` in the contents.
    // `entries` turns each key back into its own book and chapter.
    range: parsed.range,
    toc: parsed.toc.map((item) => {
      const slug = item.book ? findBook(item.book)?.slug : undefined;
      const entry = slug ? parsed.range.entries.find((candidate) => candidate.slug === slug && candidate.chapter === Number(item.number)) : undefined;
      return {
        id: item.id,
        text: item.text,
        kind: item.kind,
        part: item.part,
        ...(item.number ? { number: Number(item.number) } : {}),
        ...(entry ? { key: entry.key } : {}),
        verses: item.verses.map((verse) => ({ id: verse.id, short: verse.short, text: verse.text })),
      };
    }),
    ...(() => {
      const introduction = htmlRoot(parsed.introductionHtml, ctx, `${guide.slug} introduction`);
      const fallback = parsed.readerSections.length ? null : htmlRoot(parsed.readerHtml, ctx, `${guide.slug} reader`);
      const closing = htmlRoot(parsed.closingHtml, ctx, `${guide.slug} closing`);
      return {
        introduction: introduction.blocks,
        introductionRoot: introduction.root,
        sections: parsed.readerSections.map((section) => {
          const heading = htmlRoot(section.headingHtml, ctx, `${guide.slug} ${section.id}`);
          return {
            id: section.id,
            ...(section.chapter != null ? { chapter: section.chapter } : {}),
            heading: heading.blocks,
            headingRoot: heading.root,
            blocks: section.blocks.map((block) => {
              const preview = htmlRoot(block.previewEnd ? block.html.slice(0, block.previewEnd) : block.html, ctx, `${guide.slug} ${block.id}`);
              const more = block.previewEnd ? htmlRoot(block.html.slice(block.previewEnd), ctx, `${guide.slug} ${block.id}-more`) : null;
              return {
                id: block.id,
                ...(block.passage
                  ? { passage: { label: block.passage.label, chapter: block.passage.chapter, first: block.passage.first, last: block.passage.last } }
                  : {}),
                preview: preview.blocks,
                previewRoot: preview.root,
                more: more ? more.blocks : [],
                ...(more ? { moreRoot: more.root } : {}),
              };
            }),
          };
        }),
        fallback: fallback ? fallback.blocks : [],
        ...(fallback ? { fallbackRoot: fallback.root } : {}),
        closing: closing.blocks,
        closingRoot: closing.root,
      };
    })(),
  });
}

// Every image the app shows: browse art, book art, lesson covers, and guide figures.
for (const dir of ["art", "art/books", "cfm/covers", "cfm/art"]) {
  for (const file of fs.readdirSync(path.join(repoRoot, "public", dir))) {
    if (/\.(webp|png|jpe?g)$/i.test(file)) images.add(`${dir}/${file}`);
  }
}
for (const key of images) {
  if (!fs.existsSync(path.join(repoRoot, "public", key))) throw new Error(`Missing image public/${key}`);
}

const imageModule =
  "// Generated by scripts/generate-mobile-data.mjs. Do not edit.\n" +
  "// Static requires for the public/ images the app shows, keyed by their path under public/.\n\n" +
  "export const PUBLIC_IMAGES: Record<string, number> = {\n" +
  [...images]
    .sort()
    .map((key) => `  ${JSON.stringify(key)}: require(${JSON.stringify(`../../../public/${key}`)}),`)
    .join("\n") +
  "\n};\n";

const files = {
  "cfmGuides.json": JSON.stringify(out) + "\n",
  "images.ts": imageModule,
};

let stale = false;
fs.mkdirSync(outDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const target = path.join(outDir, name);
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (current === content) continue;
  if (check) {
    console.error(`stale: src/generated/${name}`);
    stale = true;
  } else {
    fs.writeFileSync(target, content);
    console.log(`wrote src/generated/${name} (${Buffer.byteLength(content)} bytes)`);
  }
}
if (stale) process.exit(1);
if (check) console.log("generated mobile data is up to date");
