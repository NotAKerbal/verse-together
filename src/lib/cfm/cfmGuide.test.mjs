import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { MOBILE_SIDE_ORDER, sideAtScroll } from "../../features/comeFollowMe/companionPanes.ts";
import { decodeFragment, localScriptureTarget, normalizeTarget, parseScriptureAnchor, passagesOverlapping, scriptureAnchor } from "./cfmAnchors.ts";
import { parseGuide, readGuide, readGuides, safeHref } from "./cfmGuide.ts";
import { COME_FOLLOW_ME_WEEKS, getComeFollowMeWeekByStart } from "../comeFollowMe.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

// Pinned from the verified source bundle (NotAKerbal/isaac-stuff-homepage@52975b1c4b78c34a1c0d7af365422455b71148e4).
const SOURCE_FILES = {
  "content/cfm/2026-09-28-isaiah-40-49.md": ["714cfbaa5b5bc1c55a938d530b077f8008f0f886c455e6aee2156c51c04e5604", 75234],
  "content/cfm/2026-10-05-isaiah-50-57.md": ["b94def284cb09ac079a1831a30aa83a0ec45832efb8c9483e9a910f187ac10e5", 145604],
  "content/cfm/guides.json": ["b00dfb351b8634bd2ddd19c982be0238fe8943ea5de426a5e0151e0c0f6aeacb", 882],
  "public/cfm/art/bloch-gethsemane.webp": ["662fae8d460212a7463c5ac3a8eaedd9baef03fa6ef08604eeb4de00f19ce1a2", 71832],
  "public/cfm/art/tissot-good-shepherd.webp": ["c12267233200e7b1a19bc7712a231282d390f1ad1ef26d0e9a506eab802bf463", 49526],
};

const guides = readGuides(root);
const parsed = new Map(guides.map((guide) => [guide.slug, readGuide(guide, root)]));
const early = parsed.get("2026-09-28-isaiah-40-49");
const late = parsed.get("2026-10-05-isaiah-50-57");

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

test("newer H3 ranges with a/b halves select the base verse and keep distinct anchors", () => {
  const a = late.passages.find((passage) => passage.label === "57:11–13a");
  const b = late.passages.find((passage) => passage.label === "57:13b–14");
  assert.deepEqual([a.chapter, a.first, a.last], [57, 11, 13]);
  assert.deepEqual([b.chapter, b.first, b.last], [57, 13, 14]);
  assert.notEqual(a.id, b.id);
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
  assert.ok(early.html.includes('href="/share/newtestament/john/10/11"') || early.html.includes('href="/browse/newtestament/john/10"'));
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
