import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { guideSectionAt, MOBILE_SIDE_ORDER, sideAtScroll } from "../../features/comeFollowMe/companionPanes.ts";
import { chapterHref, passageFromLink } from "../../features/comeFollowMe/passagePreview.ts";
import { targetStart } from "../../features/comeFollowMe/scrollSync.ts";
import {
  decodeFragment,
  localScriptureTarget,
  normalizeTarget,
  parseRangeAnchor,
  parseScriptureAnchor,
  passagesOverlapping,
  rangeAnchor,
  rangeKey,
  rangeLabel,
  rangeScriptureTarget,
  rangeVerseId,
  scriptureAnchor,
  scriptureVerseId,
} from "./cfmAnchors.ts";
import { guideRange, parseGuide, readGuide, readGuides, safeHref } from "./cfmGuide.ts";
import { COME_FOLLOW_ME_WEEKS, getComeFollowMeWeekByStart } from "../comeFollowMe.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

// Pinned from the verified source bundle (NotAKerbal/isaac-stuff-homepage@52975b1c4b78c34a1c0d7af365422455b71148e4).
// Isaiah 58–66 guide and updated manifest from NotAKerbal/isaac-stuff-homepage@d7dd5c3edf5dc620d07de41909fd8eac563a32ef.
// Jeremiah guide (October 19), matching its isaacstuff publication.
// Jeremiah 31–33; 36–39; Lamentations 1; 3 guide (October 26) and the current five-guide manifest, imported byte-identically from isaacstuff.
const SOURCE_FILES = {
  "content/cfm/2026-09-28-isaiah-40-49.md": ["714cfbaa5b5bc1c55a938d530b077f8008f0f886c455e6aee2156c51c04e5604", 75234],
  "content/cfm/2026-10-05-isaiah-50-57.md": ["b94def284cb09ac079a1831a30aa83a0ec45832efb8c9483e9a910f187ac10e5", 145604],
  "content/cfm/2026-10-12-isaiah-58-66.md": ["3b961a70aa9deb9af3f04ae266193ad5af0f3062e426932acf44bd48ea1f2c5d", 74659],
  "content/cfm/2026-10-19-jeremiah-1-3-7-16-18-20.md": ["e2a55290b045c2786a64daed1bcbbed822d734e16997b636cbcfa78e293b5880", 85627],
  "content/cfm/2026-10-26-jeremiah-31-33-36-39-lamentations-1-3.md": ["e6c3e669c181420edafae9da5ba1a5fc9ed38deaff921d7c7008e5806f43b237", 133565],
  "content/cfm/guides.json": ["f06a33c380a472955d31986e62beaf85a251deb9df3311f364c73b4caff85752", 2740],
  "public/cfm/art/bloch-gethsemane.webp": ["662fae8d460212a7463c5ac3a8eaedd9baef03fa6ef08604eeb4de00f19ce1a2", 71832],
  "public/cfm/art/tissot-good-shepherd.webp": ["c12267233200e7b1a19bc7712a231282d390f1ad1ef26d0e9a506eab802bf463", 49526],
};

const guides = readGuides(root);
const parsed = new Map(guides.map((guide) => [guide.slug, readGuide(guide, root)]));
const early = parsed.get("2026-09-28-isaiah-40-49");
const late = parsed.get("2026-10-05-isaiah-50-57");
const latest = parsed.get("2026-10-12-isaiah-58-66");
const jeremiah = parsed.get("2026-10-19-jeremiah-1-3-7-16-18-20");
const mixed = parsed.get("2026-10-26-jeremiah-31-33-36-39-lamentations-1-3");

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
const squash = (text) => text.replace(/\s+/g, " ").trim();

/** Visible guide text, minus the page-added art captions and Sources panels. */
function renderedText(html) {
  const source = html
    .replace(/<figure class="cfm-art"[\s\S]*?<\/figure>/g, " ")
    .replace(/<details class="cfm-sources"[\s\S]*?<\/details>/g, " ");
  const inline = /<\/?(?:a|strong|em|cite|span|code|del)(?:\s[^>]*)?>/g;
  return squash(decode(source.replace(inline, "").replace(/<[^>]+>/g, " ")));
}

test("guide, manifest, and painting bytes match the verified source", () => {
  for (const [file, [hash, size]] of Object.entries(SOURCE_FILES)) {
    assert.equal(fs.statSync(path.join(root, file)).size, size, file);
    assert.equal(sha256(file), hash, file);
  }
  for (const guide of guides) assert.equal(sha256(`content/cfm/${guide.slug}.md`), guide.sha256);
});

test("a changed guide byte is rejected", () => {
  assert.throws(() => readGuide({ ...guides[0], sha256: "0".repeat(64) }, root), /hash mismatch/);
});

test("every source word renders, in order, for both guides", () => {
  for (const guide of guides) {
    const markdown = fs.readFileSync(path.join(root, "content/cfm", `${guide.slug}.md`), "utf8");
    const { html, title } = parsed.get(guide.slug);
    assert.equal(title, /^# (.+)$/m.exec(markdown)[1]);
    const text = renderedText(html);
    const lexer = new Marked({ gfm: true });
    const tokens = lexer.lexer(markdown.replace(/^# .+\r?\n/, ""));
    let position = 0;
    let leaves = 0;
    lexer.walkTokens(tokens, (token) => {
      if (!["text", "escape", "codespan"].includes(token.type) || token.tokens) return;
      const piece = squash(token.text);
      if (!piece) return;
      const found = text.indexOf(piece, position);
      assert.ok(found >= 0, `${guide.slug}: missing or out of order: ${piece.slice(0, 80)}`);
      position = found + piece.length;
      leaves += 1;
    });
    assert.ok(leaves > 500, `${guide.slug}: only ${leaves} text runs checked`);
  }
});

test("every heading, table, blockquote, list item, and link survives", () => {
  for (const guide of guides) {
    const markdown = fs.readFileSync(path.join(root, "content/cfm", `${guide.slug}.md`), "utf8");
    const { html } = parsed.get(guide.slug);
    const lexer = new Marked({ gfm: true });
    const counts = { heading2: 0, heading3: 0, table: 0, blockquote: 0, list_item: 0 };
    const hrefs = new Set();
    lexer.walkTokens(lexer.lexer(markdown), (token) => {
      if (token.type === "heading" && token.depth > 1) counts[`heading${token.depth}`] += 1;
      if (token.type in counts) counts[token.type] += 1;
      if (token.type === "link") hrefs.add(token.href);
    });
    const tag = (name) => (html.match(new RegExp(`<${name}[\\s>]`, "g")) ?? []).length;
    assert.equal(tag("h2"), counts.heading2, `${guide.slug} h2`);
    assert.equal(tag("h3"), counts.heading3, `${guide.slug} h3`);
    assert.equal(tag("table"), counts.table, `${guide.slug} tables`);
    assert.equal(tag("blockquote"), counts.blockquote, `${guide.slug} blockquotes`);
    // Sources panels and art labels add their own <li> items; source list items are those outside them.
    const withoutPanels = html
      .replace(/<details class="cfm-sources"[\s\S]*?<\/details>/g, "")
      .replace(/<figure class="cfm-art[\s\S]*?<\/figure>/g, "");
    assert.equal((withoutPanels.match(/<li[\s>]/g) ?? []).length, counts.list_item, `${guide.slug} list items`);
    assert.equal((html.match(/<section class="cfm-section"/g) ?? []).length, counts.heading2, `${guide.slug} sections`);
    for (const href of hrefs) {
      assert.ok(html.includes(`href="${href.replace(/&/g, "&amp;")}"`), `${guide.slug}: lost citation ${href}`);
    }
    assert.ok(hrefs.size > 10);
  }
});

test("introductions and source lists are kept as their own sections", () => {
  const kinds = (guide) => guide.toc.map((item) => `${item.kind}:${item.text}`);
  assert.deepEqual(kinds(early).filter((kind) => !kind.startsWith("chapter:")), [
    "section:How to use this guide",
    "section:Historical orientation",
    "section:Synthesis",
    "sources:Source notes",
  ]);
  assert.ok(kinds(late).includes("section:Historical and literary orientation"));
  assert.ok(kinds(late).includes("sources:Source method and bibliography note"));
  assert.equal(early.toc.filter((item) => item.kind === "chapter").length, 10);
  assert.equal(late.toc.filter((item) => item.kind === "chapter").length, 8);
});

test("every guide splits into introduction, reader, and closing sections, losing and repeating nothing", () => {
  const ids = (html) => Array.from(html.matchAll(/ id="([^"]+)"/g), (match) => match[1]);
  const sections = (html) => (html.match(/<section class="cfm-section"/g) ?? []).length;
  const closes = (html) => (html.match(/<\/section>/g) ?? []).length;
  const opens = (guide, chapter, item) =>
    `<section class="cfm-section" data-kind="chapter" data-chapter="${chapter}" aria-labelledby="${item.id}">`;
  assert.equal(parsed.size, 5);
  for (const guide of parsed.values()) {
    const name = guide.title;
    const parts = { introduction: guide.introductionHtml, reader: guide.readerHtml, closing: guide.closingHtml };
    // The complete guide, in source order, is exactly the three parts back to back.
    assert.equal(guide.html, parts.introduction + parts.reader + parts.closing, name);
    assert.ok(parts.introduction.length > 1000, `${name}: introduction`);
    assert.ok(parts.closing.length > 1000, `${name}: closing`);
    // The reader runs from the first chapter of the guide's own range to its last, as parsed (not a string search).
    const chapters = guide.toc.filter((item) => item.kind === "chapter");
    const firstChapter = chapters[0];
    const lastChapter = chapters[chapters.length - 1];
    // Each boundary is its range entry's own book and chapter; its paired section carries that entry's key (the
    // chapter number in a single-book week, a key of its own for a later book's chapter).
    const firstEntry = guide.range.entries[0];
    const lastEntry = guide.range.entries[guide.range.entries.length - 1];
    assert.deepEqual([firstChapter.book, Number(firstChapter.number)], [firstEntry.book, firstEntry.chapter], name);
    assert.deepEqual([lastChapter.book, Number(lastChapter.number)], [lastEntry.book, lastEntry.chapter], name);
    assert.deepEqual([firstEntry.key, lastEntry.key], [guide.range.first, guide.range.last], name);
    assert.ok(parts.reader.startsWith(opens(guide, firstEntry.key, firstChapter)), `${name}: reader starts at ${firstEntry.book} ${firstEntry.chapter}`);
    assert.ok(
      parts.reader.startsWith(opens(guide, lastEntry.key, lastChapter), parts.reader.lastIndexOf('<section class="cfm-section"')),
      `${name}: reader ends with ${lastEntry.book} ${lastEntry.chapter}`
    );
    // No chapter section, passage, or verse anchor is outside the reader.
    for (const outside of [parts.introduction, parts.closing]) {
      assert.ok(!/data-chapter="\d+" aria-labelledby/.test(outside), `${name}: chapter outside the reader`);
      assert.ok(!outside.includes("data-cfm-passage"), `${name}: passage outside the reader`);
    }
    for (const passage of guide.passages) assert.ok(parts.reader.includes(` id="${passage.id}"`), passage.id);
    // Nothing appears twice: every anchor is unique, and in exactly one part.
    const all = ids(guide.html);
    assert.equal(new Set(all).size, all.length, `${name}: duplicate anchors`);
    const homes = Object.values(parts).map((html) => new Set(ids(html)));
    for (const id of all) assert.equal(homes.filter((home) => home.has(id)).length, 1, `${name}: ${id}`);
    // Each part is whole sections (or the preamble), so none cuts a section in two.
    for (const html of Object.values(parts)) assert.equal(sections(html), closes(html), name);
    // The contents follow the same split, in document order, and each entry is in its own part.
    const rank = { introduction: 0, reader: 1, closing: 2 };
    const order = guide.toc.map((item) => rank[item.part]);
    assert.ok(order.every((value, index) => index === 0 || order[index - 1] <= value), `${name}: contents order`);
    assert.equal(guide.toc.find((item) => item.part === "reader"), firstChapter, name);
    assert.equal(guide.toc.findLast((item) => item.part === "reader"), lastChapter, name);
    for (const item of guide.toc) assert.ok(parts[item.part].includes(` id="${item.id}"`), `${name}: ${item.id} in its part`);
  }
  // Front matter and orientation come first; synthesis, study plans, and sources come after the chapters.
  const sectionsOf = (guide, part) => guide.toc.filter((item) => item.part === part && item.kind !== "chapter").map((item) => item.text);
  assert.deepEqual(sectionsOf(early, "introduction"), ["How to use this guide", "Historical orientation"]);
  assert.deepEqual(sectionsOf(early, "reader"), []);
  assert.deepEqual(sectionsOf(early, "closing"), ["Synthesis", "Source notes"]);
  assert.deepEqual(sectionsOf(late, "introduction"), [
    "Come, Follow Me study guide: Isaiah 50–57, October 5–11, 2026",
    "Historical and literary orientation",
  ]);
  assert.deepEqual(sectionsOf(late, "reader"), []);
  assert.deepEqual(sectionsOf(late, "closing"), ["Synthesis", "Source method and bibliography note"]);
  // October 12: Isaiah 58 through 66 are the reader; the study plan and sources after Isaiah 66 are closing.
  assert.deepEqual(sectionsOf(latest, "introduction"), ["Introduction and Historical Context", "Significant Points for This Week"]);
  assert.deepEqual(
    latest.toc.filter((item) => item.part === "reader").map((item) => item.number),
    ["58", "59", "60", "61", "62", "63", "64", "65", "66"]
  );
  assert.deepEqual(sectionsOf(latest, "closing"), ["Study Plan and Teaching Discussion", "Sources and Access Notes"]);
  assert.deepEqual(
    latest.toc.filter((item) => item.part === "closing").map((item) => item.kind),
    ["section", "sources"]
  );
  // The untitled preambles are introduction too.
  assert.ok(early.introductionHtml.startsWith('<div class="cfm-preamble">'));
  assert.ok(early.introductionHtml.includes("Come, Follow Me, September 28–October 4, 2026"));
  assert.ok(latest.introductionHtml.startsWith('<div class="cfm-preamble">'));
  for (const guide of parsed.values()) {
    assert.ok(!guide.readerHtml.includes("cfm-preamble") && !guide.closingHtml.includes("cfm-preamble"), guide.title);
  }
  // Anchors are unchanged by the split.
  assert.ok(early.introductionHtml.includes('<h2 id="historical-orientation">'));
  assert.ok(late.introductionHtml.includes('<h2 id="historical-and-literary-orientation">'));
  assert.ok(early.readerHtml.includes('<p id="cfm-v-40-9-11" class="cfm-lead"'));
  assert.ok(late.readerHtml.includes('<h3 id="isaiah-53-4-the-great-reversal"'));
  assert.ok(early.closingHtml.startsWith('<section class="cfm-section" data-kind="section" aria-labelledby="synthesis">\n<h2 id="synthesis">'));
  assert.ok(latest.closingHtml.startsWith('<section class="cfm-section" data-kind="section" aria-labelledby="study-plan-and-teaching-discussion">'));
  assert.ok(latest.closingHtml.includes('<section class="cfm-section" data-kind="sources" aria-labelledby="sources-and-access-notes">'));
  assert.ok(latest.readerHtml.includes('<h2 id="isaiah-66-all-flesh-shall-come-to-worship" class="cfm-h-chapter">'));
});

test("a section between two chapters keeps its place in the reader; everything after the last chapter is closing", () => {
  const guide = { ...guides.find((entry) => entry.slug === "2026-10-05-isaiah-50-57") };
  const blocks = ["Preamble.", "Before.", "First chapter.", "Between chapters.", "Second chapter.", "After.", "Outside the range.", "Last."];
  const markdown = [
    "# Title",
    blocks[0],
    `## About\n\n${blocks[1]}`,
    `## Isaiah 50\n\n${blocks[2]}`,
    `## Interlude\n\n${blocks[3]}`,
    `## Isaiah 51\n\n${blocks[4]}`,
    `## Synthesis\n\n${blocks[5]}`,
    `## Isaiah 61\n\n${blocks[6]}`,
    `## Sources\n\n${blocks[7]}`,
  ].join("\n\n");
  const result = parseGuide(guide, `${markdown}\n`);
  assert.deepEqual(
    result.toc.map((item) => `${item.part}:${item.text}`),
    [
      "introduction:About",
      "reader:Isaiah 50",
      "reader:Interlude",
      "reader:Isaiah 51",
      "closing:Synthesis",
      "closing:Isaiah 61",
      "closing:Sources",
    ]
  );
  assert.equal(result.html, result.introductionHtml + result.readerHtml + result.closingHtml);
  // Every block once, in source order, in the part it belongs to.
  let at = -1;
  for (const block of blocks) {
    const found = result.html.indexOf(block);
    assert.ok(found > at && result.html.indexOf(block, found + 1) < 0, block);
    at = found;
  }
  const homes = [result.introductionHtml, result.introductionHtml, result.readerHtml, result.readerHtml, result.readerHtml];
  homes.push(result.closingHtml, result.closingHtml, result.closingHtml);
  blocks.forEach((block, index) => assert.ok(homes[index].includes(block), block));
  // A chapter outside the week's range is not paired with the scripture, wherever it falls.
  assert.ok(result.closingHtml.includes('<section class="cfm-section" data-kind="chapter" aria-labelledby="isaiah-61">'));
});

test("the guides' Gospel Library scripture citations preview their passages; other citations stay links", () => {
  const book = { slug: "isaiah", volume: "oldtestament" };
  // Every external link as rendered: its href and its visible text (what the click handler reads).
  const links = (html) =>
    Array.from(html.matchAll(/<a href="(https?:[^"]*)"[^>]*>([\s\S]*?)<\/a>/g), ([, href, inner]) => ({
      href: decode(href),
      label: decode(inner.replace(/<[^>]+>/g, "")),
    }));
  // The October 12 introduction's own citations, outside the week's chapters: chapter-only URLs whose text
  // names the verse.
  const intro = links(latest.introductionHtml);
  const isa = intro.find((link) => link.label === "Isaiah 1:1");
  assert.equal(isa.href, "https://www.churchofjesuschrist.org/study/scriptures/ot/isa/1?lang=eng");
  assert.deepEqual(passageFromLink(isa.href, null, book, isa.label), {
    volume: "oldtestament",
    book: "isaiah",
    label: "Isaiah",
    chapter: 1,
    first: 1,
    last: 1,
  });
  const moses = intro.find((link) => link.label === "Moses 7:18");
  assert.equal(moses.href, "https://www.churchofjesuschrist.org/study/scriptures/pgp/moses/7?lang=eng");
  const mosesTarget = passageFromLink(moses.href, null, book, moses.label);
  assert.deepEqual(mosesTarget, { volume: "pearl", book: "moses", label: "Moses", chapter: 7, first: 18, last: 18 });
  assert.equal(chapterHref(mosesTarget), "/browse/pearl/moses/7#v-18");
  // The Bible Dictionary entry beside Isaiah 1:1 is not scripture.
  const dictionary = intro.find((link) => link.href.includes("/study/scriptures/bd/"));
  assert.equal(dictionary.label, "Bible Dictionary entry on Isaiah");
  assert.equal(passageFromLink(dictionary.href, null, book, dictionary.label), null);
  // Every scripture citation in every guide previews: narrowed where its text is exactly its verses, the whole
  // chapter where its text is that chapter or no reference ("Isaiah 58 (KJV)", "59", a bare URL). The
  // exceptions are the complex citations below, a chapter range or verse list on one chapter's or verse's link
  // ("1 Nephi 20–21", "Mosiah 18:10, 13"), each at exactly its own href, which stay the links they were rather
  // than showing part of what they name. Every other citation stays a link.
  const complex = new Map([
    ["1 Nephi 20–21", "https://www.churchofjesuschrist.org/study/scriptures/bofm/1-ne/20?lang=eng"],
    ["Jeremiah 43–44", "https://www.churchofjesuschrist.org/study/scriptures/ot/jer/43?lang=eng"],
    ["Mosiah 18:10, 13", "https://www.churchofjesuschrist.org/study/scriptures/bofm/mosiah/18?lang=eng&id=p10#p10"],
    ["2 Kings 22:11, 19", "https://www.churchofjesuschrist.org/study/scriptures/ot/2-kgs/22?lang=eng&id=p11#p11"],
    ["Jeremiah 27–28", "https://www.churchofjesuschrist.org/study/scriptures/ot/jer/28?lang=eng&id=p13-p14#p13"],
  ]);
  const seen = new Map(Array.from(complex.keys(), (label) => [label, 0]));
  let narrowed = 0;
  let whole = 0;
  let ordinary = 0;
  const scripture = /^https:\/\/www\.churchofjesuschrist\.org\/study\/scriptures\/(?:ot|nt|bofm|dc-testament|pgp)\//;
  for (const guide of parsed.values()) {
    for (const { href, label } of links(guide.html)) {
      const target = passageFromLink(href, null, book, label);
      if (!scripture.test(href)) {
        assert.equal(target, null, `${guide.title}: ${label} ${href}`);
        ordinary += 1;
      } else if (complex.has(label)) {
        assert.equal(href, complex.get(label), `${guide.title}: ${label}`);
        assert.equal(target, null, `${guide.title}: ${label}`);
        seen.set(label, seen.get(label) + 1);
      } else {
        assert.ok(target, `${guide.title}: ${label} ${href}`);
        if (target.first != null) narrowed += 1;
        else whole += 1;
      }
    }
  }
  assert.ok(narrowed > 50 && whole > 20 && ordinary > 20, `${narrowed} narrowed, ${whole} whole, ${ordinary} ordinary`);
  // 1 Nephi 20–21 is cited at least twice, as before; every other complex citation at least once.
  assert.ok(seen.get("1 Nephi 20–21") >= 2, `${seen.get("1 Nephi 20–21")} 1 Nephi 20–21 citations`);
  for (const [label, count] of seen) assert.ok(count >= 1, `${label}: not cited`);
  // Out-of-lesson citations from the October 12 guide, in the New Testament, Doctrine and Covenants, and Book of Mormon.
  const cited = (label) => {
    const link = links(latest.html).find((entry) => entry.label === label);
    return passageFromLink(link.href, null, book, link.label);
  };
  assert.deepEqual(cited("Luke 4:16–21"), { volume: "newtestament", book: "luke", label: "Luke", chapter: 4, first: 16, last: 21 });
  assert.deepEqual(cited("Doctrine and Covenants 19:16–19"), {
    volume: "doctrineandcovenants",
    book: "doctrineandcovenants",
    label: "Doctrine and Covenants",
    chapter: 19,
    first: 16,
    last: 19,
  });
  assert.deepEqual(cited("Mosiah 3:7"), { volume: "bookofmormon", book: "mosiah", label: "Mosiah", chapter: 3, first: 7, last: 7 });
  assert.deepEqual(cited("2 Kings 25"), { volume: "oldtestament", book: "2kings", label: "2 Kings", chapter: 25 });
});

test("a guide with no chapter of its own range keeps everything in the reader", () => {
  const guide = { ...guides.find((entry) => entry.slug === "2026-10-05-isaiah-50-57") };
  const parsedOnly = parseGuide(guide, "# Title\n\nPreamble.\n\n## About\n\nText.\n\n## Isaiah 61\n\nOutside the range.\n");
  assert.equal(parsedOnly.introductionHtml, "");
  assert.equal(parsedOnly.closingHtml, "");
  assert.equal(parsedOnly.readerHtml, parsedOnly.html);
  assert.ok(parsedOnly.html.includes("Preamble.") && parsedOnly.html.includes("Outside the range."));
  assert.ok(parsedOnly.toc.every((item) => item.part === "reader"));
});

test("every scripture link the guides write is a passage the preview reads, at the full chapter", () => {
  const book = { slug: "isaiah", volume: "oldtestament" };
  let checked = 0;
  for (const guide of parsed.values()) {
    for (const [, attributes] of guide.html.matchAll(/<a ([^>]*)>/g)) {
      const href = /href="([^"]*)"/.exec(attributes)?.[1];
      // In-page anchors and external citations are not site paths.
      if (!href?.startsWith("/")) continue;
      const last = /data-last="([^"]*)"/.exec(attributes)?.[1] ?? null;
      assert.match(href, /^\/browse\/[a-z]+\/[a-z0-9]+\/\d+(?:#v-\d+)?$/, `${guide.title}: ${href}`);
      const target = passageFromLink(href, last, book);
      assert.ok(target, `${guide.title}: ${href} ${last}`);
      assert.equal(chapterHref(target), href);
      if (last != null) assert.ok(target.last > target.first, `${href} ${last}`);
      checked += 1;
    }
    assert.ok(!guide.html.includes('href="/share/'), `${guide.title}: share page link`);
  }
  assert.ok(checked > 100, `only ${checked} scripture links checked`);
  // The October 12 closing sections: a Gospel, Doctrine and Covenants, and one of the week's own chapters.
  assert.ok(
    latest.closingHtml.includes('<a class="cfm-scripture" data-cfm-scripture href="/browse/newtestament/luke/4#v-16" data-last="21">Luke 4:16–21</a>')
  );
  assert.ok(latest.closingHtml.includes('href="/browse/dnc/doctrineandcovenants/19#v-16" data-last="19">Doctrine and Covenants 19:16–19</a>'));
  assert.ok(latest.closingHtml.includes('href="/browse/oldtestament/isaiah/61#v-1" data-last="3">Isaiah 61:1–3</a>'));
  assert.deepEqual(passageFromLink("/browse/dnc/doctrineandcovenants/19#v-16", "19", book), {
    volume: "doctrineandcovenants",
    book: "doctrineandcovenants",
    label: "Doctrine and Covenants",
    chapter: 19,
    first: 16,
    last: 19,
  });
  // A passage's own Sources panel links its scripture text the same way.
  assert.match(
    latest.readerHtml,
    /<details class="cfm-sources" data-cfm-added="sources"><summary>Sources<\/summary><ul><li><a href="\/browse\/oldtestament\/isaiah\/58#v-1" data-last="2">Isaiah 58:1–2<\/a> <span>\(scripture text\)<\/span><\/li>/
  );
});

test("both contents formats nest verses under their chapter, in reading order", () => {
  // Older guide: bold close-reading leads ("**40:1–2, …**"). Newer guide: verse H3s ("Isaiah 50:1–3 — …").
  const formats = [
    [early, /^cfm-v-(\d+)-/],
    [late, /^isaiah-(\d+)-/],
  ];
  for (const [guide, pattern] of formats) {
    const chapters = guide.toc.filter((item) => item.kind === "chapter");
    assert.equal(chapters.length, guide.range.last - guide.range.first + 1);
    for (const item of chapters) {
      assert.equal(item.book, "Isaiah");
      assert.ok(item.verses.length > 0, `${item.id}: no verses`);
      let last = -1;
      for (const verse of item.verses) {
        assert.equal(pattern.exec(verse.id)?.[1], item.number, `${verse.id} under ${item.id}`);
        assert.match(verse.short, new RegExp(`^${item.number}:\\d`), verse.id);
        assert.ok(verse.text.length > 0, verse.id);
        // Every entry is a real anchor in the reader, after its chapter heading and the entry before it.
        const at = guide.readerHtml.indexOf(` id="${verse.id}"`);
        assert.ok(at > guide.readerHtml.indexOf(` id="${item.id}"`) && at > last, verse.id);
        last = at;
      }
    }
    // Sections that are not chapters carry no verse entries.
    for (const item of guide.toc.filter((entry) => entry.kind !== "chapter")) assert.deepEqual(item.verses, [], item.id);
  }
});

test("newer H3 ranges with a/b halves select the base verse and keep distinct anchors", () => {
  const a = late.passages.find((passage) => passage.label === "57:11–13a");
  const b = late.passages.find((passage) => passage.label === "57:13b–14");
  assert.deepEqual([a.chapter, a.first, a.last], [57, 11, 13]);
  assert.deepEqual([b.chapter, b.first, b.last], [57, 13, 14]);
  assert.notEqual(a.id, b.id);
  // The halves are marked so the scripture sync can split verse 13 between them.
  assert.equal(a.lastHalf, "a");
  assert.equal(b.firstHalf, "b");
  assert.match(late.html, new RegExp(`<h3 id="${a.id}"[^>]* data-last="13" data-last-half="a">`));
  assert.match(late.html, new RegExp(`<h3 id="${b.id}"[^>]* data-first="13" data-last="14" data-first-half="b">`));
  assert.equal(late.passages.filter((p) => p.firstHalf || p.lastHalf).length, 2);
  assert.match(late.html, new RegExp(`<h3 id="${a.id}"[^>]*><span class="cfm-vref"><a [^>]*href="#scripture-isaiah-57-v11-13"`));
  assert.match(late.html, new RegExp(`<h3 id="${b.id}"[^>]*><span class="cfm-vref"><a [^>]*href="#scripture-isaiah-57-v13-14"`));
  // Verse 13 leads to both halves of the commentary.
  assert.deepEqual(
    passagesOverlapping(late.passages, { chapter: 57, first: 13, last: 13 }).map((passage) => passage.id),
    [a.id, b.id]
  );
});

test("earlier bold close-reading leads link to the local scripture pane", () => {
  const lead = early.passages.find((passage) => passage.id === "cfm-v-40-9-11");
  assert.deepEqual([lead.chapter, lead.first, lead.last, lead.label], [40, 9, 11, "40:9–11"]);
  assert.match(
    early.html,
    /<p id="cfm-v-40-9-11" class="cfm-lead" data-cfm-passage data-chapter="40" data-first="9" data-last="11"><strong><a class="cfm-scripture cfm-local" data-cfm-local href="#scripture-isaiah-40-v9-11"/
  );
  // Plain "**Verse 10**" leads in the newer guide stay ordinary paragraphs.
  assert.match(late.html, /<p class="cfm-lead"><strong>Verse 10<\/strong>/);
});

test("every passage and chapter heading in the guide's range points at real local verses", () => {
  const bundle = JSON.parse(fs.readFileSync(path.join(root, "public/scripture-data/oldtestament.json"), "utf8"));
  const isaiah = bundle.books.find((book) => book.title === "Isaiah");
  const verseCount = (chapter) => isaiah.chapters.find((entry) => entry.chapter === chapter).verses.length;
  for (const guide of [early, late]) {
    assert.ok(guide.passages.length > 40);
    for (const passage of guide.passages) {
      assert.ok(passage.chapter >= guide.range.first && passage.chapter <= guide.range.last, passage.id);
      assert.ok(passage.first >= 1 && passage.last >= passage.first && passage.last <= verseCount(passage.chapter), passage.id);
    }
    for (let chapter = guide.range.first; chapter <= guide.range.last; chapter += 1) {
      assert.ok(guide.html.includes(`href="#scripture-isaiah-${chapter}"`), `chapter ${chapter} heading link`);
    }
    // Commentary anchors never collide with scripture-pane anchors.
    assert.ok(!/ id="scripture-/.test(guide.html));
  }
  // The newer guide covers every one of its 124 verses.
  const covered = new Set(late.passages.flatMap((p) => Array.from({ length: p.last - p.first + 1 }, (_, i) => `${p.chapter}:${p.first + i}`)));
  assert.equal(covered.size, 124);
});

test("cross references outside the week stay ordinary links", () => {
  // Isaiah 61:7 is cited from the 40–49 guide; it is not one of the week's chapters.
  assert.match(early.html, /href="https:\/\/www\.churchofjesuschrist\.org\/study\/scriptures\/ot\/isa\/61\?lang=eng"/);
  assert.ok(!early.html.includes("#scripture-isaiah-61"));
  // Other passages link to their full chapter in the reader, at the verse (the guide previews them first).
  assert.ok(early.html.includes('<a class="cfm-scripture" data-cfm-scripture href="/browse/newtestament/john/10#v-11">John 10:11</a>'));
  const book = { slug: "isaiah", volume: "oldtestament" };
  const chapters = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49];
  assert.deepEqual(localScriptureTarget("/share/oldtestament/isaiah/44/28", book, chapters), { chapter: 44, first: 28, last: 28 });
  assert.deepEqual(localScriptureTarget("/browse/oldtestament/isaiah/40", book, chapters), { chapter: 40 });
  assert.equal(localScriptureTarget("/share/oldtestament/isaiah/61/7", book, chapters), null);
  assert.equal(localScriptureTarget("/share/newtestament/john/10/11", book, chapters), null);
  assert.equal(localScriptureTarget("https://www.churchofjesuschrist.org/study/scriptures/ot/isa/40", book, chapters), null);
  assert.deepEqual(localScriptureTarget("#scripture-isaiah-40-v9-11", book, chapters), { chapter: 40, first: 9, last: 11 });
});

test("malformed URL fragments are ignored instead of throwing", () => {
  const book = { slug: "isaiah", volume: "oldtestament" };
  for (const fragment of ["#%", "#%E0%A4%A", "#scripture-isaiah-50-v%", "%zz"]) {
    assert.equal(decodeFragment(fragment), null, fragment);
    assert.doesNotThrow(() => localScriptureTarget(fragment.startsWith("#") ? fragment : `#${fragment}`, book, [50, 51]));
    assert.equal(localScriptureTarget(fragment.startsWith("#") ? fragment : `#${fragment}`, book, [50, 51]), null);
  }
  assert.equal(decodeFragment("#isaiah-53-4-the-great-reversal"), "isaiah-53-4-the-great-reversal");
  assert.equal(decodeFragment("#scripture%2Disaiah-50-v1"), "scripture-isaiah-50-v1");
  assert.deepEqual(localScriptureTarget("#scripture%2Disaiah-50-v1", book, [50, 51]), { chapter: 50, first: 1, last: 1 });
  assert.equal(decodeFragment(""), "");
});

test("deep links resolve to real verses, keeping a/b halves on their base verse", () => {
  const bundle = JSON.parse(fs.readFileSync(path.join(root, "public/scripture-data/oldtestament.json"), "utf8"));
  const isaiah = bundle.books.find((book) => book.title === "Isaiah");
  const count = (chapter) => (chapter >= 50 && chapter <= 57 ? isaiah.chapters.find((c) => c.chapter === chapter).verses.length : undefined);
  // Both halves of the 57:13 split, as their heading links write them.
  for (const passage of late.passages.filter((p) => /[ab]/.test(p.label))) {
    const anchor = scriptureAnchor("isaiah", passage.chapter, passage.first, passage.last);
    assert.deepEqual(normalizeTarget(parseScriptureAnchor(anchor, "isaiah"), count), { chapter: 57, first: passage.first, last: passage.last });
  }
  assert.deepEqual(normalizeTarget({ chapter: 53, first: 4, last: 99 }, count), { chapter: 53, first: 4, last: 12 });
  assert.deepEqual(normalizeTarget({ chapter: 53, first: 40, last: 41 }, count), { chapter: 53 });
  assert.deepEqual(normalizeTarget({ chapter: 53, first: 6, last: 4 }, count), { chapter: 53, first: 6, last: 6 });
  assert.equal(normalizeTarget({ chapter: 61, first: 1 }, count), null);
});

test("a phone swipe settles on whichever side covers more of the strip", () => {
  assert.deepEqual(MOBILE_SIDE_ORDER, ["guide", "scripture"]);
  assert.equal(sideAtScroll(0, 390), "guide");
  assert.equal(sideAtScroll(190, 390), "guide");
  assert.equal(sideAtScroll(200, 390), "scripture");
  assert.equal(sideAtScroll(390, 390), "scripture");
  assert.equal(sideAtScroll(5000, 390), "scripture", "overscroll stays on the last side");
  assert.equal(sideAtScroll(-390, 390), "scripture", "right-to-left offsets are negative");
  assert.equal(sideAtScroll(120, 0), "guide", "before layout the strip is on its first side");
});

test("deep-link targets start where the guide's matching passage does", () => {
  const start = (anchor) => targetStart(parseScriptureAnchor(anchor, "isaiah"), late.passages);
  // #scripture-isaiah-57-v13-14 is exactly the guide's 57:13b–14: it starts mid-verse 13.
  assert.deepEqual(start("scripture-isaiah-57-v13-14"), { chapter: 57, verse: 13, secondHalf: true });
  // #…-v11-13 is the guide's 57:11–13a, which starts at the top of verse 11.
  assert.deepEqual(start("scripture-isaiah-57-v11-13"), { chapter: 57, verse: 11, secondHalf: false });
  // A bare verse 13 matches neither half exactly, so the whole verse is included from its top.
  assert.deepEqual(start("scripture-isaiah-57-v13"), { chapter: 57, verse: 13, secondHalf: false });
  assert.deepEqual(start("scripture-isaiah-53-v4"), { chapter: 53, verse: 4, secondHalf: false });
  assert.deepEqual(start("scripture-isaiah-53"), { chapter: 53, verse: null, secondHalf: false });
  // Out-of-range verses are normalized to the chapter before they get here.
  const count = (chapter) => (chapter === 53 ? 12 : undefined);
  assert.deepEqual(targetStart(normalizeTarget({ chapter: 53, first: 40 }, count), late.passages), {
    chapter: 53,
    verse: null,
    secondHalf: false,
  });
});

test("scripture anchors round-trip", () => {
  for (const target of [{ chapter: 53 }, { chapter: 53, first: 4, last: 4 }, { chapter: 57, first: 13, last: 14 }]) {
    assert.deepEqual(parseScriptureAnchor(scriptureAnchor("isaiah", target.chapter, target.first, target.last), "isaiah"), target);
  }
  assert.equal(parseScriptureAnchor("scripture-isaiah-53-v6-4", "isaiah"), null);
  assert.equal(parseScriptureAnchor("isaiah-53-4-the-great-reversal", "isaiah"), null);
});

test("paintings sit at their passages with full credits", () => {
  const tissot = early.html.indexOf('<figure class="cfm-art"');
  assert.ok(tissot > early.html.indexOf('id="cfm-v-40-9-11"') && tissot < early.html.indexOf('id="cfm-v-40-12-26"'));
  assert.ok(
    early.html.includes(
      '<figcaption><a href="https://commons.wikimedia.org/wiki/File:Brooklyn_Museum_-_The_Good_Shepherd_(Le_bon_pasteur)_-_James_Tissot_-_overall.jpg"><cite>The Good Shepherd</cite></a>, James Tissot, 1886–1894. Brooklyn Museum. Public domain.</figcaption>'
    )
  );
  const bloch = late.html.indexOf('<figure class="cfm-art"');
  assert.ok(bloch > late.html.indexOf('id="isaiah-53-4-the-great-reversal"') && bloch < late.html.indexOf('id="isaiah-53-5-6'));
  assert.ok(
    late.html.includes(
      '<figcaption><a href="https://commons.wikimedia.org/wiki/File:Carl_Heinrich_Bloch_-_Gethsemane.jpg"><cite>Christ in Gethsemane</cite></a>, Carl Bloch, 1873. Public domain, via Wikimedia Commons.</figcaption>'
    )
  );
  assert.equal((early.html.match(/<figure /g) ?? []).length, 1);
  assert.equal((late.html.match(/<figure /g) ?? []).length, 2);
});

test("the generated tent diagram sits between the Isaiah 54:2–3 heading and its first paragraph", () => {
  const heading = /<h3 id="isaiah-54-2-3-make-room"[^>]*>[\s\S]*?<\/h3>\n/.exec(late.html);
  assert.ok(heading, "Isaiah 54:2–3 heading");
  const after = late.html.slice(heading.index + heading[0].length);
  const figure = /^<figure class="cfm-art cfm-art-diagram" data-cfm-added="art"[^>]*>[\s\S]*?<\/figure>\n/.exec(after);
  assert.ok(figure, "figure immediately follows the heading");
  // The section's first source block (the quoted verse) follows the figure, unchanged.
  assert.match(after.slice(figure[0].length), /^<blockquote>\n<p>&quot;Enlarge the place of thy tent, and let them stretch forth/);
  assert.ok(
    figure[0].includes(
      'src="/cfm/art/isaiah-54-enlarged-tent.webp" width="840" height="630" alt="Diagram of a goat-hair tent enlarged: curtains extended, cords lengthened, stakes strengthened, as described in Isaiah 54:2."'
    )
  );
  assert.ok(
    figure[0].includes(
      "<figcaption>Illustration of Isaiah 54:2: enlarged curtains, lengthened cords, and strengthened stakes. Generated illustration; not a historical reconstruction.</figcaption>"
    )
  );
  // Each label quotes the KJV verse exactly as the scripture pane shows it.
  const bundle = JSON.parse(fs.readFileSync(path.join(root, "public/scripture-data/oldtestament.json"), "utf8"));
  const verse = bundle.books
    .find((book) => book.title === "Isaiah")
    .chapters.find((chapter) => chapter.chapter === 54)
    .verses.find((entry) => entry.verse === 2).text;
  for (const phrase of ["Enlarge the place of thy tent", "stretch forth the curtains", "lengthen thy cords", "strengthen thy stakes"]) {
    assert.ok(figure[0].includes(`<li>“${phrase}”</li>`), phrase);
    assert.ok(verse.includes(phrase), `Isaiah 54:2 contains "${phrase}"`);
  }
  const webp = fs.readFileSync(path.join(root, "public/cfm/art/isaiah-54-enlarged-tent.webp"));
  assert.equal(webp.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(webp.subarray(8, 12).toString("latin1"), "WEBP");
});

test("raw HTML, images, and unsafe links are refused", () => {
  const guide = { ...guides[0] };
  const page = (body) => `# Title\n\n## Section\n\n${body}\n`;
  assert.throws(() => parseGuide(guide, page("<script>alert(1)</script>")), /Raw HTML/);
  assert.throws(() => parseGuide(guide, page('Text <img src=x onerror="alert(1)">')), /Raw HTML/);
  assert.throws(() => parseGuide(guide, page("![x](https://example.com/x.png)")), /images/);
  assert.throws(() => parseGuide(guide, page("[x](javascript:alert(1))")), /public HTTP/);
  assert.throws(() => parseGuide(guide, page("[x](http://localhost/admin)")), /public HTTP/);
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref("//evil.example/x"), null);
  assert.equal(safeHref("https://user:pw@example.com/"), null);
  assert.equal(safeHref("https://example.com/a?b=1&c=2"), "https://example.com/a?b=1&c=2");
  assert.equal(safeHref("/share/oldtestament/isaiah/53/4"), "/share/oldtestament/isaiah/53/4");
  const html = parseGuide(guide, page('A & B < C "quoted" [cite](https://example.com/?a=1&b=2)')).html;
  assert.match(html, /A &amp; B &lt; C &quot;quoted&quot;/);
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer"/);
});

test("each guide belongs to the schedule week whose start it links from", () => {
  for (const guide of guides) {
    const week = getComeFollowMeWeekByStart(guide.startDate);
    assert.ok(week, guide.slug);
    assert.equal(week.end, guide.endDate);
    assert.equal(week.block, guide.scripture);
  }
  assert.equal(getComeFollowMeWeekByStart("2026-10-06"), null);
  assert.equal(new Set(COME_FOLLOW_ME_WEEKS.map((week) => week.start)).size, COME_FOLLOW_ME_WEEKS.length);
});

test("a same-book guide with skipped chapters pairs exactly its own chapters", () => {
  // Contiguous ranges in every standard work still parse; ";" continues the same book in ascending order.
  const { entries: singleEntries, ...single } = guideRange("Isaiah 50–57");
  assert.deepEqual(single, {
    book: "Isaiah",
    slug: "isaiah",
    volume: "oldtestament",
    first: 50,
    last: 57,
    chapters: [50, 51, 52, 53, 54, 55, 56, 57],
  });
  // One book: each chapter's key is its own number.
  assert.deepEqual(
    singleEntries,
    single.chapters.map((chapter) => ({ key: chapter, book: "Isaiah", slug: "isaiah", volume: "oldtestament", chapter }))
  );
  assert.deepEqual(guideRange("Moses 7").chapters, [7]);
  assert.deepEqual(guideRange("1 Nephi 20–21").chapters, [20, 21]);
  assert.equal(guideRange("Doctrine and Covenants 19").volume, "doctrineandcovenants");
  const range = guideRange("Jeremiah 1–3; 7; 16–18; 20");
  assert.deepEqual([range.book, range.slug, range.volume, range.first, range.last], ["Jeremiah", "jeremiah", "oldtestament", 1, 20]);
  assert.deepEqual(range.chapters, [1, 2, 3, 7, 16, 17, 18, 20]);
  // Malformed, backward, overlapping, and out-of-bounds metadata is refused, never misread (mixed-book weeks: below).
  for (const bad of [
    "Isaiah 57–50", "Isaiah 0", "Isaiah 67", "Jeremiah 50–53", "Jeremiah 1–3; 2", "Jeremiah 7; 3", "Jeremiah 1;",
    "Jeremiah 1; ; 3", "Jeremiah 1–3; 7a", "Jeremiah", "Nobook 1", "Isaiah 1:1",
  ]) {
    assert.equal(guideRange(bad), null, bad);
  }

  // The imported guide pairs exactly its eight chapters, in order.
  const jeremiahChapters = [1, 2, 3, 7, 16, 17, 18, 20];
  assert.deepEqual(jeremiah.range.chapters, jeremiahChapters);
  const paired = Array.from(
    jeremiah.html.matchAll(/<section class="cfm-section" data-kind="chapter" data-chapter="(\d+)"/g),
    (match) => Number(match[1])
  );
  assert.deepEqual(paired, jeremiahChapters);
  // Local pane links target only those chapters; references to skipped chapters (4–6, 8–15, 19) stay ordinary.
  const local = new Set(Array.from(jeremiah.html.matchAll(/href="#scripture-jeremiah-(\d+)/g), (match) => Number(match[1])));
  assert.deepEqual([...local].sort((a, b) => a - b), jeremiahChapters);
  assert.ok(!jeremiah.html.includes("#scripture-jeremiah-19"));

  // 84 passage groups covering every one of the 204 verses in the local scripture data.
  assert.equal(jeremiah.passages.length, 84);
  const bundle = JSON.parse(fs.readFileSync(path.join(root, "public/scripture-data/oldtestament.json"), "utf8"));
  const book = bundle.books.find((entry) => entry.title === "Jeremiah");
  const counts = jeremiahChapters.map((chapter) => book.chapters.find((entry) => entry.chapter === chapter).verses.length);
  assert.deepEqual(counts, [19, 37, 25, 34, 21, 27, 23, 18]);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 204);
  const covered = new Set();
  for (const passage of jeremiah.passages) {
    assert.ok(jeremiahChapters.includes(passage.chapter), passage.id);
    const count = counts[jeremiahChapters.indexOf(passage.chapter)];
    assert.ok(passage.first >= 1 && passage.last >= passage.first && passage.last <= count, passage.id);
    for (let verse = passage.first; verse <= passage.last; verse += 1) covered.add(`${passage.chapter}:${verse}`);
  }
  assert.equal(covered.size, 204);

  // A skipped chapter between two paired ones stays in the reader, unpaired, with ordinary preview links.
  const guide = { ...guides.find((entry) => entry.slug === "2026-10-19-jeremiah-1-3-7-16-18-20") };
  const result = parseGuide(
    guide,
    "# Title\n\n## About\n\nIntro.\n\n## Jeremiah 18\n\n### Jeremiah 18:1–4 — Potter\n\nA.\n\n## Jeremiah 19\n\n### Jeremiah 19:1–2 — Flask\n\nB.\n\n## Jeremiah 20\n\nC.\n\n## Sources\n\nD.\n"
  );
  assert.deepEqual(
    result.toc.map((item) => `${item.part}:${item.text}`),
    ["introduction:About", "reader:Jeremiah 18", "reader:Jeremiah 19", "reader:Jeremiah 20", "closing:Sources"]
  );
  assert.deepEqual(result.passages.map((passage) => [passage.chapter, passage.first, passage.last]), [[18, 1, 4]]);
  assert.ok(result.readerHtml.includes('<section class="cfm-section" data-kind="chapter" aria-labelledby="jeremiah-19">'));
  assert.ok(result.readerHtml.includes('<a class="cfm-scripture" data-cfm-scripture href="/browse/oldtestament/jeremiah/19#v-1" data-last="2">'));
  assert.ok(!result.html.includes("#scripture-jeremiah-19"));
  assert.ok(result.html.includes('href="#scripture-jeremiah-20"'));
});

// The October 26 week: two books, each with chapters it skips.
const MIXED = "Jeremiah 31–33; 36–39; Lamentations 1; 3";
const MIXED_CHAPTERS = [
  ["Jeremiah", 31],
  ["Jeremiah", 32],
  ["Jeremiah", 33],
  ["Jeremiah", 36],
  ["Jeremiah", 37],
  ["Jeremiah", 38],
  ["Jeremiah", 39],
  ["Lamentations", 1],
  ["Lamentations", 3],
];
const oldTestament = () => JSON.parse(fs.readFileSync(path.join(root, "public/scripture-data/oldtestament.json"), "utf8"));
const verseCount = (bundle, book, chapter) =>
  bundle.books.find((entry) => entry.title === book).chapters.find((entry) => entry.chapter === chapter).verses.length;

test("a mixed-book week reads each book's own chapters in order, keyed so the books never mix", () => {
  const range = guideRange(MIXED);
  assert.deepEqual(range.entries.map((entry) => [entry.book, entry.chapter]), MIXED_CHAPTERS);
  assert.deepEqual(
    range.entries.map((entry) => [entry.slug, entry.volume]),
    MIXED_CHAPTERS.map(([book]) => [book.toLowerCase(), "oldtestament"])
  );
  // Jeremiah, the first book, keeps its chapter numbers as keys; Lamentations 1 and 3 get keys of their own, never
  // Jeremiah 1's or 3's.
  assert.deepEqual(range.chapters, [31, 32, 33, 36, 37, 38, 39, rangeKey(1, 1), rangeKey(1, 3)]);
  assert.deepEqual(range.chapters, range.entries.map((entry) => entry.key));
  assert.ok(rangeKey(1, 1) > 52, "past every chapter of Jeremiah");
  assert.equal(new Set(range.chapters).size, MIXED_CHAPTERS.length);
  assert.deepEqual([range.book, range.slug, range.volume, range.first, range.last], ["Jeremiah", "jeremiah", "oldtestament", 31, rangeKey(1, 3)]);
  // Against the local scripture data: 297 verses in all.
  const bundle = oldTestament();
  const counts = range.entries.map((entry) => verseCount(bundle, entry.book, entry.chapter));
  assert.deepEqual(counts, [40, 44, 26, 32, 21, 28, 18, 22, 66]);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 297);
  // Each book's chapters ascend within it, and a book is never returned to; anything else is refused.
  for (const bad of [
    "Jeremiah 31–33; Lamentations 6",
    "Jeremiah 31–33; Lamentations 3; 1",
    "Jeremiah 31–33; Lamentations 1–3; 2",
    "Jeremiah 31; Lamentations 3–1",
    "Jeremiah 31; Lamentations 1; Jeremiah 33",
    "Jeremiah 31; Lamentations",
    "Jeremiah 31; Nobook 1",
    "Jeremiah 31; ; Lamentations 1",
    "Jeremiah 31; Lamentations 1:1",
    "Lamentations 0; 3",
    "31–33; Lamentations 1",
  ]) {
    assert.equal(guideRange(bad), null, bad);
  }
  // Every guide before October 26 reads one book, keyed by its own chapter numbers (that week's guide: below).
  for (const guide of [early, late, latest, jeremiah]) {
    assert.equal(new Set(guide.range.entries.map((entry) => entry.slug)).size, 1, guide.title);
    assert.deepEqual(guide.range.chapters, guide.range.entries.map((entry) => entry.chapter), guide.title);
  }
});

test("a mixed-book week's anchors and local links name their own book, even where chapter numbers repeat", () => {
  const { entries } = guideRange(MIXED);
  const lam1 = rangeKey(1, 1);
  const lam3 = rangeKey(1, 3);
  for (const entry of entries) {
    for (const target of [{ chapter: entry.key }, { chapter: entry.key, first: 2, last: 2 }, { chapter: entry.key, first: 3, last: 5 }]) {
      const anchor = rangeAnchor(entries, target);
      assert.deepEqual(parseScriptureAnchor(anchor, entry.slug), { ...target, chapter: entry.chapter }, anchor);
      assert.deepEqual(parseRangeAnchor(anchor, entries), target, anchor);
      assert.deepEqual(rangeScriptureTarget(`#${anchor}`, entries), target, anchor);
    }
    assert.equal(rangeVerseId(entries, entry.key, 4), scriptureVerseId(entry.slug, entry.chapter, 4));
  }
  // Jeremiah 1 and 3 share numbers with this week's Lamentations, but are not this week's; Lamentations 2 and
  // Jeremiah 34 are skipped.
  for (const anchor of ["scripture-jeremiah-1", "scripture-jeremiah-3-v22", "scripture-lamentations-2-v1", "scripture-jeremiah-34"]) {
    assert.equal(parseRangeAnchor(anchor, entries), null, anchor);
    assert.equal(rangeScriptureTarget(`#${anchor}`, entries), null, anchor);
  }
  assert.equal(rangeAnchor(entries, { chapter: 1 }), null);
  assert.equal(rangeVerseId(entries, 3, 1), null);
  assert.deepEqual(rangeScriptureTarget("/share/oldtestament/lamentations/3/22-23", entries), { chapter: lam3, first: 22, last: 23 });
  assert.deepEqual(rangeScriptureTarget("/browse/oldtestament/lamentations/1", entries), { chapter: lam1 });
  assert.deepEqual(rangeScriptureTarget("/browse/oldtestament/jeremiah/33", entries), { chapter: 33 });
  assert.equal(rangeScriptureTarget("/browse/oldtestament/jeremiah/1", entries), null);
  assert.equal(rangeScriptureTarget("/share/oldtestament/lamentations/2/1", entries), null);
  assert.equal(rangeScriptureTarget("#%", entries), null);
  // Commentary keyed to Lamentations 1 is never found from Jeremiah 1, or the reverse.
  const sample = [
    { id: "jeremiah-1", chapter: 1, first: 1, last: 3 },
    { id: "lamentations-1", chapter: lam1, first: 1, last: 3 },
  ];
  assert.deepEqual(passagesOverlapping(sample, { chapter: lam1, first: 2, last: 2 }).map((passage) => passage.id), ["lamentations-1"]);
  assert.deepEqual(guideSectionAt({ chapter: lam1, verse: 2, half: "a" }, sample), { kind: "passage", id: "lamentations-1" });
  assert.deepEqual(guideSectionAt({ chapter: 1, verse: 2, half: "a" }, sample), { kind: "passage", id: "jeremiah-1" });
  assert.deepEqual(targetStart({ chapter: lam1, first: 1, last: 3 }, sample), { chapter: lam1, verse: 1, secondHalf: false });
  // The scripture pane's name, book by book; the single-book weeks read as they did.
  assert.equal(rangeLabel(entries), "Jeremiah 31, 32, 33, 36, 37, 38, 39; Lamentations 1, 3");
  assert.equal(rangeLabel(late.range.entries), "Isaiah 50–57");
  assert.equal(rangeLabel(jeremiah.range.entries), "Jeremiah 1, 2, 3, 7, 16, 17, 18, 20");
});

test("a mixed-book guide pairs exactly its nine chapters, in reading order, and covers all 297 verses", () => {
  const bundle = oldTestament();
  const { entries } = guideRange(MIXED);
  const lam1 = rangeKey(1, 1);
  const lam3 = rangeKey(1, 3);
  // Synthetic Markdown over the real chapters: two passages a chapter (verse headings, and close-reading leads in
  // Lamentations 3), Jeremiah 1 before the week's chapters, and Lamentations 2, skipped, between two of them.
  const blocks = ["# A mixed-book guide", "Preamble.", "## Orientation", "Context: Lamentations 2:1 and Jeremiah 1:5.", "## Jeremiah 1", "### Jeremiah 1:4–10 — Before the week", "Text."];
  for (const entry of entries) {
    const count = verseCount(bundle, entry.book, entry.chapter);
    const half = Math.ceil(count / 2);
    blocks.push(`## ${entry.book} ${entry.chapter}: Reading`);
    if (entry.key === lam3) {
      blocks.push(`**3:1–${half}, the first half.** Read with 1:1 and Lamentations 2:2.`, `**3:${half + 1}–${count}, the second half.** Text.`);
    } else {
      blocks.push(`### ${entry.book} ${entry.chapter}:1–${half} — Opening`, "Text.", `### ${entry.book} ${entry.chapter}:${half + 1}–${count} — Close`, "Text.");
    }
    if (entry.key === lam1) blocks.push("## Lamentations 2", "### Lamentations 2:1–3 — A skipped chapter", "Text.");
  }
  blocks.push("## Synthesis", "Text.", "## Sources", "Text.");
  const guide = { ...guides.find((entry) => entry.slug === "2026-10-19-jeremiah-1-3-7-16-18-20"), scripture: MIXED };
  const result = parseGuide(guide, `${blocks.join("\n\n")}\n`);
  assert.equal(result.html, result.introductionHtml + result.readerHtml + result.closingHtml);
  const texts = (part) => result.toc.filter((item) => item.part === part).map((item) => item.text);
  assert.deepEqual(texts("introduction"), ["Orientation", "Jeremiah 1"]);
  assert.deepEqual(
    result.toc.filter((item) => item.part === "reader").map((item) => `${item.book} ${item.number}`),
    [...MIXED_CHAPTERS.slice(0, 8), ["Lamentations", 2], MIXED_CHAPTERS[8]].map(([book, chapter]) => `${book} ${chapter}`)
  );
  assert.deepEqual(texts("closing"), ["Synthesis", "Sources"]);
  // Paired sections, in reading order, carry their chapter's key; Lamentations 2 between them is unpaired.
  const paired = Array.from(result.html.matchAll(/<section class="cfm-section" data-kind="chapter" data-chapter="(\d+)"/g), (match) => Number(match[1]));
  assert.deepEqual(paired, entries.map((entry) => entry.key));
  // Every local link is an anchor into one of the range's chapters, in its own book, with that chapter's key.
  const locals = Array.from(result.html.matchAll(/data-cfm-local href="#([^"]+)" data-chapter="(\d+)"/g), ([, anchor, key]) => [anchor, Number(key)]);
  assert.equal(locals.length, entries.length * 3);
  for (const [anchor, key] of locals) assert.equal(parseRangeAnchor(anchor, entries)?.chapter, key, anchor);
  assert.deepEqual(new Set(locals.map(([, key]) => key)), new Set(entries.map((entry) => entry.key)));
  // References to skipped chapters, in either book, stay previews.
  const previews = new Set(
    Array.from(result.html.matchAll(/data-cfm-scripture href="(\/browse\/[^"]+)"/g), ([, href]) => {
      const target = passageFromLink(href, null);
      return `${target.label} ${target.chapter}`;
    })
  );
  for (const name of ["Jeremiah 1", "Lamentations 2"]) assert.ok(previews.has(name), name);
  // Two passages a chapter, keyed to the range, covering each of its 297 verses once.
  assert.equal(result.passages.length, entries.length * 2);
  assert.equal(new Set(result.passages.map((passage) => passage.id)).size, result.passages.length);
  const covered = new Set();
  for (const passage of result.passages) {
    const entry = entries.find((item) => item.key === passage.chapter);
    assert.ok(entry, passage.id);
    assert.ok(passage.first >= 1 && passage.last >= passage.first && passage.last <= verseCount(bundle, entry.book, entry.chapter), passage.id);
    for (let verse = passage.first; verse <= passage.last; verse += 1) covered.add(`${entry.slug} ${entry.chapter}:${verse}`);
    assert.ok(result.readerHtml.includes(` id="${passage.id}"`), passage.id);
  }
  assert.equal(covered.size, 297);
  // Lamentations 3's leads name their book, and nest under it in the contents.
  const leads = result.passages.filter((passage) => passage.chapter === lam3);
  assert.equal(leads.length, 2);
  for (const lead of leads) assert.ok(lead.id.includes("lamentations"), lead.id);
  const lamentations3 = result.toc.find((item) => item.book === "Lamentations" && item.number === "3");
  assert.deepEqual(lamentations3.verses.map((verse) => verse.id), leads.map((lead) => lead.id));
  // Nothing of the week's chapters is outside the reader.
  for (const outside of [result.introductionHtml, result.closingHtml]) {
    assert.ok(!outside.includes("data-cfm-passage") && !outside.includes("data-cfm-local"));
  }
});

test("the October 26 guide pairs Jeremiah 31–33, 36–39 and Lamentations 1, 3, covering each of their 297 verses once", () => {
  const bundle = oldTestament();
  const { entries } = mixed.range;
  const lam1 = rangeKey(1, 1);
  const lam3 = rangeKey(1, 3);
  assert.deepEqual([lam1, lam3], [1001, 1003]);
  // Its own range, book by book, in reading order.
  assert.deepEqual(entries.map((entry) => [entry.book, entry.chapter]), MIXED_CHAPTERS);
  assert.deepEqual(mixed.range.chapters, [31, 32, 33, 36, 37, 38, 39, lam1, lam3]);
  // Each of the nine is a chapter in the reader's contents, and paired in reading order.
  for (const entry of entries) {
    const item = mixed.toc.find((toc) => toc.kind === "chapter" && toc.book === entry.book && Number(toc.number) === entry.chapter);
    assert.ok(item, `${entry.book} ${entry.chapter}`);
    assert.equal(item.part, "reader", `${entry.book} ${entry.chapter}`);
  }
  const paired = Array.from(mixed.html.matchAll(/<section class="cfm-section" data-kind="chapter" data-chapter="(\d+)"/g), (match) => Number(match[1]));
  assert.deepEqual(paired, entries.map((entry) => entry.key));
  // The introduction and closing sections stay apart from the reader, with no chapter or passage of the week.
  assert.equal(mixed.html, mixed.introductionHtml + mixed.readerHtml + mixed.closingHtml);
  assert.ok(mixed.introductionHtml.length > 1000 && mixed.closingHtml.length > 1000);
  for (const outside of [mixed.introductionHtml, mixed.closingHtml]) {
    assert.ok(!/data-chapter="\d+" aria-labelledby/.test(outside));
    assert.ok(!outside.includes("data-cfm-passage"));
  }
  // 114 passage groups over the local scripture data's 297 verses: each verse exactly once, none missing or past
  // its chapter's end. (A "b" half starts on the verse its "a" half already covers.)
  assert.equal(mixed.passages.length, 114);
  const counts = entries.map((entry) => verseCount(bundle, entry.book, entry.chapter));
  assert.deepEqual(counts, [40, 44, 26, 32, 21, 28, 18, 22, 66]);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 297);
  const covered = new Map();
  for (const passage of mixed.passages) {
    const index = entries.findIndex((entry) => entry.key === passage.chapter);
    assert.ok(index >= 0, passage.id);
    assert.ok(passage.first >= 1 && passage.last >= passage.first && passage.last <= counts[index], passage.id);
    assert.ok(mixed.readerHtml.includes(` id="${passage.id}"`), passage.id);
    for (let verse = passage.firstHalf === "b" ? passage.first + 1 : passage.first; verse <= passage.last; verse += 1) {
      const name = `${entries[index].slug} ${entries[index].chapter}:${verse}`;
      covered.set(name, (covered.get(name) ?? 0) + 1);
    }
  }
  entries.forEach((entry, index) => {
    for (let verse = 1; verse <= counts[index]; verse += 1) {
      assert.equal(covered.get(`${entry.slug} ${entry.chapter}:${verse}`), 1, `${entry.book} ${entry.chapter}:${verse}`);
    }
  });
  assert.equal(covered.size, 297);
  // Local links name their own book: Lamentations' carry its own keys, never Jeremiah 1's or 3's.
  const locals = Array.from(mixed.html.matchAll(/data-cfm-local href="#([^"]+)" data-chapter="(\d+)"/g), ([, anchor, key]) => [anchor, Number(key)]);
  assert.ok(locals.length >= entries.length, `${locals.length} local links`);
  for (const [anchor, key] of locals) assert.equal(parseRangeAnchor(anchor, entries)?.chapter, key, anchor);
  const lamentations = new Set(locals.filter(([anchor]) => anchor.startsWith("scripture-lamentations-")).map(([, key]) => key));
  assert.deepEqual([...lamentations].sort((a, b) => a - b), [lam1, lam3]);
  for (const [anchor, key] of locals) {
    if (anchor.startsWith("scripture-jeremiah-")) assert.ok(key < lam1, anchor);
  }
});
