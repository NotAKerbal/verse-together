import assert from "node:assert/strict";
import test from "node:test";
import { getVerseLessonResources, parseResourceSelection } from "./verseResources.ts";
import { parseGuide, readGuide, readGuides } from "./cfmGuide.ts";
import { resourcePassageFromLink } from "../../features/comeFollowMe/passagePreview.ts";

const selection = (overrides = {}) => ({ volume: "oldtestament", book: "jeremiah", chapter: 1, verses: [5], ...overrides });

test("resource requests preserve exact verses and reject malformed selections", () => {
  assert.deepEqual(parseResourceSelection(new URLSearchParams({ volume: "old-testament", book: "jeremiah", chapter: "1", verses: "7,5,7" })), selection({ verses: [5, 7] }));
  for (const changes of [{ chapter: "0" }, { chapter: "1.5" }, { verses: "" }, { verses: "0" }, { verses: "200" }, { verses: "5,nope" }, { book: "../guides" }, { volume: "unknown" }]) {
    assert.equal(parseResourceSelection(new URLSearchParams({ volume: "oldtestament", book: "jeremiah", chapter: "1", verses: "5", ...changes })), null);
  }
});

test("a verse pulls its commentary and only the citations in its lesson subsection", () => {
  const resources = getVerseLessonResources(selection());
  assert.equal(resources.length, 1);
  const [resource] = resources;
  assert.equal(resource.title, "Known, Sanctified, Ordained");
  assert.equal(resource.reference, "Jeremiah 1:4–5");
  assert.match(resource.bodyHtml, /four verbs/);
  assert.match(resource.bodyHtml, /<em>Formed<\/em>/);
  assert.match(resource.bodyHtml, /<strong>Christ connection\.<\/strong>/);
  assert.match(resource.bodyHtml, /Every other calling takes its meaning from His\./);
  assert.ok(resource.bodyHtml.length > 2000);
  assert.ok(!resource.bodyHtml.includes("I Cannot Speak"));
  assert.equal(resource.sources.length, 1);
  assert.equal(resource.sources[0].title, "Scripture Helps");
  assert.match(resource.sources[0].url, /^https:\/\/www.churchofjesuschrist.org\//);
  assert.equal(resource.href, "/come-follow-me/2026-10-19#jeremiah-1-4-5-known-sanctified-ordained");
});

test("noncontiguous selections do not pull commentary from the gap", () => {
  const resources = getVerseLessonResources(selection({ verses: [5, 7, 8] }));
  assert.deepEqual(resources.map((resource) => resource.reference), ["Jeremiah 1:4–5", "Jeremiah 1:7–8"]);
  assert.equal(new Set(resources.map((resource) => resource.id)).size, resources.length);
});

test("unpublished chapters, skipped chapters, other volumes, and uncovered verses have no lesson matches", () => {
  for (const target of [selection({ chapter: 19 }), selection({ book: "genesis" }), selection({ volume: "newtestament", book: "john", chapter: 3, verses: [16] }), selection({ verses: [199] })]) {
    assert.deepEqual(getVerseLessonResources(target), []);
  }
});

test("close-reading leads and half-verse sections match their base verses", () => {
  const early = getVerseLessonResources(selection({ book: "isaiah", chapter: 40, verses: [1] }));
  assert.ok(early.length > 0);
  assert.ok(early.every((resource) => resource.href.startsWith("/come-follow-me/2026-09-28#")));
  assert.ok(early.some((resource) => resource.bodyHtml.length > 0));
  assert.ok(early.every((resource) => !resource.bodyHtml.includes('href="#')));
  assert.ok(early.some((resource) => resource.bodyHtml.includes('href="/come-follow-me/2026-09-28#scripture-isaiah-40-v1-2"')));
  const halves = getVerseLessonResources(selection({ book: "isaiah", chapter: 57, verses: [13] }));
  assert.equal(halves.length, 2);
});

test("every published passage resource deep-links to an existing lesson anchor", () => {
  for (const guide of readGuides()) {
    const parsed = readGuide(guide);
    assert.equal(parsed.passageResources.length, parsed.passages.length, guide.slug);
    for (const resource of parsed.passageResources) {
      assert.ok(parsed.html.includes(`id="${resource.passageId}"`), `${guide.slug} ${resource.passageId}`);
      assert.ok(resource.bodyHtml.length > 0);
      assert.ok(parsed.html.includes(resource.bodyHtml), `${guide.slug} preserves the full rendered insight`);
      assert.ok(resource.sources.every((source) => /^https?:\/\//.test(source.url)));
    }
  }
});


test("complete insights retain paragraphs, emphasis, quotations, lists, and tables without the next insight", () => {
  const parsed = parseGuide({ ...readGuides()[0], scripture: "Jeremiah 1" }, `# A test lesson

## Jeremiah 1: Calling

### Jeremiah 1:4–5 — Known

**A bold lead.** ${"Full commentary continues. ".repeat(30)}*Emphasis stays.*

> A quoted insight.

- First point
- Second point

1. First step
2. Second step

| Question | Answer |
| --- | --- |
| Calling | Service |

The final paragraph is included too.

### Jeremiah 1:6 — The next insight

This belongs only to verse six.
`);
  const html = parsed.passageResources[0].bodyHtml;
  for (const pattern of [/<strong>A bold lead\.<\/strong>/, /<em>Emphasis stays\.<\/em>/, /<blockquote>/, /<ul>/, /<ol>/, /<table>/, /The final paragraph is included too\./]) assert.match(html, pattern);
  assert.ok(html.length > 1000);
  assert.ok(!html.includes("This belongs only to verse six"));
  assert.ok(!html.includes("The next insight"));
});

test("scripture in a resource's insight and citations opens as a preview in the reader; other citations stay external", () => {
  const links = (resource) => Array.from(resource.bodyHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g), ([, attributes, text]) => ({
    href: /\bhref="([^"]*)"/.exec(attributes)?.[1] ?? null,
    last: /\bdata-last="([^"]*)"/.exec(attributes)?.[1] ?? null,
    scripture: /\bdata-cfm-(?:scripture|local)\b/.test(attributes),
    text: text.replace(/<[^>]+>/g, ""),
  }));
  const preview = (resource, link) => resourcePassageFromLink(link.href, link.last, { slug: "isaiah", volume: "oldtestament" }, link.text);

  const [jeremiah] = getVerseLessonResources(selection());
  const jeremiahLinks = links(jeremiah);
  assert.ok(jeremiahLinks.filter((link) => link.scripture).length >= 5);
  for (const link of jeremiahLinks.filter((link) => link.scripture)) assert.ok(preview(jeremiah, link), link.href);
  assert.deepEqual(preview(jeremiah, jeremiahLinks.find((link) => link.text === "Doctrine and Covenants 138:53–56")), {
    volume: "doctrineandcovenants", book: "doctrineandcovenants", label: "Doctrine and Covenants", chapter: 138, first: 53, last: 56,
  });
  // Scripture Helps is a manual, not scripture: it still opens on the Church's site.
  const helps = jeremiahLinks.find((link) => link.text === "Scripture Helps");
  assert.equal(preview(jeremiah, helps), null);
  assert.equal(resourcePassageFromLink(jeremiah.sources[0].url, null, { slug: "jeremiah", volume: "oldtestament" }, jeremiah.sources[0].title), null);

  const [comfort] = getVerseLessonResources(selection({ book: "isaiah", chapter: 40, verses: [1] }));
  const comfortLinks = links(comfort);
  // The lesson's own anchor for these verses, and a Gospel Library citation the insight names by reference.
  const local = comfortLinks.find((link) => link.href === "/come-follow-me/2026-09-28#scripture-isaiah-40-v1-2");
  assert.deepEqual(preview(comfort, local), { volume: "oldtestament", book: "isaiah", label: "Isaiah", chapter: 40, first: 1, last: 2 });
  const cited = comfort.sources.find((source) => source.title === "Isaiah 61:7");
  assert.ok(cited);
  assert.deepEqual(resourcePassageFromLink(cited.url, null, { slug: "isaiah", volume: "oldtestament" }, cited.title), {
    volume: "oldtestament", book: "isaiah", label: "Isaiah", chapter: 61, first: 7, last: 7,
  });
  for (const link of comfortLinks.filter((link) => link.scripture)) assert.ok(preview(comfort, link), link.href);
});
