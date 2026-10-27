#!/usr/bin/env node
// Builds src/lib/generated/studyHelpsIndex.json: the topic titles and official URL slugs listed in the
// published tables of contents of the Bible Dictionary, Guide to the Scriptures, and Topical Guide.
// Only titles and links are kept; no entry content is copied. The Explore panel matches selected words
// against this list, so selecting a word never calls out to the Church site.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/generateStudyHelpsIndex.mjs   # fetch the three tables of contents
//   node scripts/generateStudyHelpsIndex.mjs --from-dir DIR   # or parse saved DIR/bd.html, gs.html, tg.html

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyStudyHelpTitle, studyHelpBrowseUrl } from "../src/lib/studyHelps.ts";

const GUIDES = ["bd", "gs", "tg"];
// Sanity floor: each published list holds roughly 950 to 3,500 topics; far fewer means the page changed.
const MIN_ENTRIES = 500;
const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/generated/studyHelpsIndex.json");

function readArgs(argv) {
  const index = argv.indexOf("--from-dir");
  return { fromDir: index >= 0 ? argv[index + 1] : null };
}

async function loadToc(guide, fromDir) {
  if (fromDir) return readFile(path.join(fromDir, `${guide}.html`), "utf8");
  const response = await fetch(studyHelpBrowseUrl(guide), {
    headers: { "User-Agent": "verse-together study-helps index generator" },
  });
  if (!response.ok) throw new Error(`${guide}: table of contents returned HTTP ${response.status}`);
  return response.text();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeHtml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function plainText(html) {
  return decodeHtml(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function parseToc(guide, html) {
  const linkPattern = new RegExp(`<a\\b([^>]*)href="/study/scriptures/${guide}/([^"?#/]+)\\?lang=eng"[^>]*>([\\s\\S]*?)</a>`, "g");
  const bySlug = new Map();
  for (const [, attributes, rawSlug, inner] of html.matchAll(linkPattern)) {
    const slug = decodeURIComponent(decodeHtml(rawSlug));
    const title = plainText(inner);
    // A letter holding one topic links its heading to that topic (Bible Dictionary "Y" is "Year"); the topic
    // is listed again under its own title. The page lists each topic twice; the introduction is not a topic.
    if (/\bsectionTitle/.test(attributes) || !title || slug === "introduction" || bySlug.has(slug)) continue;
    bySlug.set(slug, title);
  }
  return [...bySlug].map(([slug, title]) => (slugifyStudyHelpTitle(title) === slug ? title : [title, slug]));
}

function serialize(index) {
  const guides = GUIDES.map((guide) => {
    const { tocUrl, entries } = index.guides[guide];
    const lines = entries.map((entry) => `      ${JSON.stringify(entry)}`).join(",\n");
    return `    ${JSON.stringify(guide)}: {\n      "tocUrl": ${JSON.stringify(tocUrl)},\n      "entries": [\n${lines.replace(/^ {6}/gm, "        ")}\n      ]\n    }`;
  });
  return `{\n  "source": ${JSON.stringify(index.source)},\n  "retrieved": ${JSON.stringify(index.retrieved)},\n  "guides": {\n${guides.join(",\n")}\n  }\n}\n`;
}

async function main() {
  const { fromDir } = readArgs(process.argv.slice(2));
  const guides = {};
  for (const guide of GUIDES) {
    const entries = parseToc(guide, await loadToc(guide, fromDir));
    if (entries.length < MIN_ENTRIES) {
      throw new Error(`${guide}: found only ${entries.length} topics; the table of contents layout may have changed`);
    }
    guides[guide] = { tocUrl: studyHelpBrowseUrl(guide), entries };
    console.log(`${guide}: ${entries.length} topics`);
  }
  const index = {
    source: "Topic titles and links from the published tables of contents at churchofjesuschrist.org/study/scriptures (bd, gs, tg). Titles and URLs only.",
    retrieved: new Date().toISOString().slice(0, 10),
    guides,
  };
  await writeFile(OUTPUT, serialize(index));
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
