// @vitest-environment node
import { describe, expect, test } from "vitest";
import { GUIDE_KEY_PATTERN, guideHighlightProblem } from "../convex/annotationRules";
import { readingGroups } from "../src/features/comeFollowMe/scriptureFirst";
import {
  chapterGuideCompanion,
  chapterGuideResources,
  chapterGuideSelectionState,
  guideSubtitle,
  withoutAiDisclaimer,
} from "../src/lib/chapterGuideCompanion";
import { chapterGuideHref, chapterGuideKey, chapterGuideModelName, chapterGuideSourceTitle, crossReferenceView, type ChapterGuideView } from "../src/lib/chapterGuideView";
import { normalizeScriptureVolume } from "../src/lib/scriptureVolumes";

const LOCATION = { volume: "bookofmormon", book: "1nephi", chapter: 1 };
const ATTACK = `<img src=x onerror=alert(1)><script>alert(2)</script>"><svg/onload=alert(3)> [link](javascript:alert(4)) **bold** &lt;b&gt;`;

function passage(first: number, last: number, overrides: object = {}) {
  return {
    verse_start: first,
    verse_end: last,
    heading: `Heading ${first}`,
    original_meaning: [`Meaning ${first}.`, `More ${first}.`],
    latter_day_saint_application: [`Application: Reading ${first}.`],
    cross_references: [],
    questions: [`Question ${first}?`],
    source_ids: [],
    ...overrides,
  };
}

function guide(overrides: Partial<ChapterGuideView> = {}): ChapterGuideView {
  return {
    title: "1 Nephi 1: A record begins",
    overview: ["This is an AI-generated study guide. First Nephi 1 does two jobs."],
    historical_context: { paragraphs: ["Zedekiah reigned."], source_ids: ["S1"] },
    significant_insights: [{ title: "Prayer first", verse_start: 5, verse_end: 15, paragraphs: ["Insight."], source_ids: ["S1"] }],
    passages: [passage(1, 3), passage(4, 7), passage(8, 12), passage(13, 15), passage(16, 17), passage(18, 20)],
    source_use: [],
    limitations: ["Dates are uncertain."],
    reference: "1 Nephi 1",
    sources: [{ id: "S1", title: "Guide to the Scriptures: Zedekiah", url: "https://www.churchofjesuschrist.org/study/scriptures/gs/zedekiah?lang=eng", use: "Zedekiah." }],
    provenance: { researchModel: "gpt-5.6-luna", writerModel: "claude-opus-5-5", reviewModel: "gpt-5.6-terra", requiredCorrections: 1, repaired: true },
    generatedAt: 1,
    ...overrides,
  };
}

const references = (verses: number[], view = guide()) => chapterGuideResources(view, LOCATION, verses).map((item) => item.reference);

describe("exact selection overlap", () => {
  test("one verse is one group", () => {
    expect(references([5])).toEqual(["1 Nephi 1:4–7"]);
  });

  test("a range crossing a boundary is the two groups it touches", () => {
    expect(references([7, 8])).toEqual(["1 Nephi 1:4–7", "1 Nephi 1:8–12"]);
  });

  test("a disjoint selection doesn't pull the groups between it", () => {
    expect(references([1, 20])).toEqual(["1 Nephi 1:1–3", "1 Nephi 1:18–20"]);
    expect(references([2, 9, 19])).toEqual(["1 Nephi 1:1–3", "1 Nephi 1:8–12", "1 Nephi 1:18–20"]);
  });

  test("group edges are exact", () => {
    expect(references([3])).toEqual(["1 Nephi 1:1–3"]);
    expect(references([4])).toEqual(["1 Nephi 1:4–7"]);
  });

  test("verses outside the guide match nothing", () => {
    expect(references([99])).toEqual([]);
  });

  test("a resource holds one group, not the guide's overview, history, insights, or other groups", () => {
    const [resource] = chapterGuideResources(guide(), LOCATION, [5]);
    expect(resource!.bodyHtml).toContain("Meaning 4.");
    expect(resource!.bodyHtml).not.toContain("Meaning 1.");
    expect(resource!.bodyHtml).not.toContain("Zedekiah");
    expect(resource!.bodyHtml).not.toContain("Insight.");
    expect(resource!.bodyHtml).not.toContain("First Nephi 1 does two jobs");
    expect(resource!.href).toBe("/chapter-guides/bookofmormon/1nephi/1#passage-4-7");
    expect(resource!.linkLabel).toBe("Open chapter guide");
    expect(resource!.lessonTitle).toBe("Chapter guide");
  });

  test("selection state carries only matches, and no generation state changes", () => {
    const state = chapterGuideSelectionState({ reference: "1 Nephi 1", guide: guide(), generating: null, availability: null }, LOCATION, [5]);
    expect(state.resources).toHaveLength(1);
    expect(state).not.toHaveProperty("guide");
    const empty = chapterGuideSelectionState({ reference: "1 Nephi 1", guide: null, generating: null, availability: "paused" }, LOCATION, [5]);
    expect(empty).toMatchObject({ hasGuide: false, resources: [], availability: "paused" });
  });
});

describe("safe rendering", () => {
  const attacked = guide({
    title: ATTACK,
    overview: [ATTACK],
    historical_context: { paragraphs: [ATTACK], source_ids: ["S1", "S2"] },
    significant_insights: [{ title: ATTACK, verse_start: 1, verse_end: 2, paragraphs: [ATTACK], source_ids: [] }],
    passages: [
      passage(1, 20, {
        heading: ATTACK,
        original_meaning: [ATTACK, ATTACK],
        latter_day_saint_application: [ATTACK],
        cross_references: [{ reference: ATTACK, volume: "x", book: "y", chapter: 1, verse_start: 1, verse_end: 1, note: ATTACK, href: null, rangeEnd: null }],
        questions: [ATTACK],
        source_ids: ["S1", "S2", "S3"],
      }),
    ],
    limitations: [ATTACK],
    sources: [
      { id: "S1", title: ATTACK, url: "https://www.churchofjesuschrist.org/a", use: ATTACK },
      { id: "S2", title: "bad", url: "javascript:alert(5)", use: "" },
      { id: "S3", title: "bad", url: 'https://www.churchofjesuschrist.org/a"onclick="alert(6)', use: "" },
    ],
  });

  function renderedHtml() {
    const companion = chapterGuideCompanion(attacked, LOCATION);
    return [
      companion.introductionHtml,
      companion.closingHtml,
      ...companion.readerSections.flatMap((section) => [section.headingHtml, ...section.blocks.map((block) => block.html)]),
      ...chapterGuideResources(attacked, LOCATION, [1]).map((resource) => resource.bodyHtml),
    ].join("\n");
  }

  test("generated text never becomes markup, through either level", () => {
    const html = renderedHtml();
    expect(html).not.toMatch(/<img|<script|<svg/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;");
  });

  test("markdown in generated text stays literal, so it can't make a link or emphasis", () => {
    const html = renderedHtml();
    expect(html).toContain("[link](javascript:alert(4))");
    expect(html).toContain("**bold**");
    expect(html).not.toMatch(/href="javascript:/i);
  });

  test("a stored entity stays text", () => {
    expect(renderedHtml()).not.toContain("<b>");
  });

  test("unsafe source URLs are dropped, and attribute quotes can't break out", () => {
    const html = renderedHtml();
    expect(html).not.toContain("javascript:alert(5)");
    expect(html).toContain("&quot;onclick=&quot;alert(6)");
    expect(html).not.toMatch(/<a [^>]*"\s*onclick=/i);
  });

  test("the subtitle shown as the page title is plain text the page escapes itself", () => {
    expect(guideSubtitle("1 Nephi 1: A record begins", "1 Nephi 1")).toBe("A record begins");
    expect(guideSubtitle("A record begins", "1 Nephi 1")).toBe("A record begins");
  });
});

describe("reading the guide in the Come, Follow Me layout", () => {
  const VERSES = Array.from({ length: 20 }, (_, index) => ({ verse: index + 1, text: `Verse ${index + 1}.` }));
  const companion = chapterGuideCompanion(guide(), LOCATION);
  const [section] = companion.readerSections;

  test("every passage is a context block with its own anchor and exact verses", () => {
    expect(section!.blocks.map((block) => block.id)).toEqual(["passage-1-3", "passage-4-7", "passage-8-12", "passage-13-15", "passage-16-17", "passage-18-20"]);
    expect(section!.blocks[1]!.passage).toMatchObject({ id: "passage-4-7", label: "1:4–7", chapter: 1, first: 4, last: 7 });
    expect(section!.blocks[1]!.html).toContain('<h3 id="passage-4-7"');
    expect(section!.blocks[1]!.html).toContain('data-cfm-passage data-chapter="1" data-first="4" data-last="7"');
  });

  test("the reader alternates every verse with its group's context, once each", () => {
    const groups = readingGroups(VERSES, section!.blocks);
    expect(groups.map((group) => group.verses.map((verse) => verse.verse))).toEqual([[1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11, 12], [13, 14, 15], [16, 17], [18, 19, 20]]);
  });

  test("groups arrive in reading order even if stored out of order", () => {
    const shuffled = chapterGuideCompanion(guide({ passages: [passage(4, 7), passage(1, 3)] }), LOCATION);
    expect(shuffled.readerSections[0]!.blocks.map((block) => block.id)).toEqual(["passage-1-3", "passage-4-7"]);
  });

  test("the preview is the heading and first paragraph, and the rest is behind Read full commentary", () => {
    const block = section!.blocks[1]!;
    const preview = block.html.slice(0, block.previewEnd);
    expect(preview).toContain("Meaning 4.");
    expect(preview).not.toContain("More 4.");
    expect(block.html.slice(block.previewEnd)).toContain("More 4.");
    expect(block.html.slice(block.previewEnd)).toContain("Question 4?");
  });

  test("contents list the sections and each verse group, with ids found in the HTML", () => {
    const all = [companion.introductionHtml, companion.closingHtml, section!.headingHtml, ...section!.blocks.map((block) => block.html)].join("");
    const ids = companion.toc.flatMap((item) => [item.id, ...item.verses.map((verse) => verse.id)]);
    for (const id of ids) expect(all).toContain(`id="${id}"`);
    expect(companion.toc.map((item) => item.part)).toEqual(["introduction", "introduction", "reader", "closing", "closing", "closing"]);
    const chapter = companion.toc.find((item) => item.kind === "chapter");
    expect(chapter).toMatchObject({ book: "1 Nephi", number: "1" });
    expect(chapter!.verses[1]).toEqual({ id: "passage-4-7", ref: "1 Nephi 1:4–7", short: "1:4–7", text: "Heading 4" });
  });

  test("scripture links match the CFM link forms, so previews work", () => {
    const html = chapterGuideCompanion(
      guide({
        passages: [
          passage(1, 20, {
            original_meaning: ["See Moroni 10:3."],
            cross_references: [crossReferenceView({ reference: "Moses 1:9-10", volume: "pearlofgreatprice", book: "moses", chapter: 1, verse_start: 9, verse_end: 10, note: "Compare." }, 42)],
          }),
        ],
      }),
      LOCATION
    ).readerSections[0]!.blocks[0]!.html;
    expect(html).toContain('href="/browse/bookofmormon/moroni/10#v-3"');
    expect(html).toContain('href="/browse/pearl/moses/1#v-9" data-last="10"');
    expect(html).toContain('data-cfm-local href="#scripture-1nephi-1-v1-20"');
  });

  test("the disclaimer and label prefixes the writer added don't repeat in the prose", () => {
    expect(withoutAiDisclaimer("This is an AI-generated study guide. First Nephi 1 does two jobs.")).toBe("First Nephi 1 does two jobs.");
    expect(companion.introductionHtml).toContain("First Nephi 1 does two jobs.");
    expect(companion.introductionHtml).not.toContain("AI-generated");
    const block = section!.blocks[0]!.html;
    expect(block).toContain('<strong>Application.</strong> Reading 1.');
    expect(block).not.toContain("Application: Reading");
  });

  test("model ids stay out of the reading text", () => {
    const all = [companion.introductionHtml, companion.closingHtml, ...section!.blocks.map((block) => block.html)].join("");
    expect(all).not.toMatch(/gpt-5|claude-opus/);
    expect(chapterGuideModelName("gpt-5.6-luna")).toBe("OpenAI GPT-5.6 Luna");
    expect(chapterGuideModelName("mystery-model")).toBe("an AI model");
  });

  test("the sources section says the writer saw notes, not pages", () => {
    expect(companion.closingHtml).toContain("not from the pages themselves");
    expect(companion.closingHtml).toContain("Videos and audio weren't watched");
  });
});

describe("identity", () => {
  test("a generated guide's key can't be a week, and both are valid annotation keys", () => {
    const key = chapterGuideKey("pearlofgreatprice", "moses", 1);
    expect(key).toBe("ai-guide-pearl-moses-1");
    expect(GUIDE_KEY_PATTERN.test(key)).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(key)).toBe(false);
    expect(GUIDE_KEY_PATTERN.test("2026-10-26")).toBe(true);
    for (const bad of ["ai-guide-", "ai-guide-a-b", "../x", "2026-10", "ai-guide-a-b-1-extra"]) expect(GUIDE_KEY_PATTERN.test(bad)).toBe(false);
    const span = { part: "reader" as const, startBlock: "passage-1-3", startOffset: 0, endBlock: "passage-1-3", endOffset: 4, exact: "text", prefix: "", suffix: "" };
    expect(guideHighlightProblem({ ...span, guide: key })).toBeNull();
    expect(guideHighlightProblem({ ...span, guide: "2026-10-26" })).toBeNull();
    expect(guideHighlightProblem({ ...span, guide: "nope" })).toBe("Unknown guide");
  });

  test("pearl and pearlofgreatprice are one volume, in URLs and links", () => {
    expect(normalizeScriptureVolume("pearlofgreatprice")).toBe("pearl");
    expect(normalizeScriptureVolume("pearl")).toBe("pearl");
    expect(chapterGuideHref("pearlofgreatprice", "moses", 1)).toBe(chapterGuideHref("pearl", "moses", 1));
    expect(crossReferenceView({ reference: "Moses 1:9", volume: "pearlofgreatprice", book: "moses", chapter: 1, verse_start: 9, verse_end: 9, note: "" }, 42).href).toBe("/browse/pearl/moses/1#v-9");
  });

  test("generated guides have their own route, away from lessons", () => {
    expect(chapterGuideHref("bookofmormon", "1nephi", 1)).toBe("/chapter-guides/bookofmormon/1nephi/1");
    expect(chapterGuideHref("doctrineandcovenants", "doctrineandcovenants", 76)).toBe("/chapter-guides/dnc/doctrineandcovenants/76");
  });
});

describe("source titles", () => {
  const title = (url: string, stored = "") => chapterGuideSourceTitle({ title: stored, url });

  test("a real title is kept", () => {
    expect(title("https://scripturecentral.org/knowhy/x", "Did Ancient Israelites Write in Egyptian?")).toBe("Did Ancient Israelites Write in Egyptian?");
  });

  test("a hostname stands in for no title, and the label says only what the URL does", () => {
    expect(title("https://www.churchofjesuschrist.org/study/scriptures/gs/zedekiah?lang=eng", "www.churchofjesuschrist.org")).toBe("Guide to the Scriptures: Zedekiah");
    expect(title("https://www.churchofjesuschrist.org/study/scriptures/bd/jeremiah?lang=eng")).toBe("Bible Dictionary: Jeremiah");
    expect(title("https://www.churchofjesuschrist.org/study/scriptures/bofm/1-ne/1?lang=eng")).toBe("1 Nephi 1");
    expect(title("https://www.churchofjesuschrist.org/study/manual/book-of-mormon-student-manual/chapter-2-1-nephi-1-5?lang=eng")).toBe("Book of Mormon Student Manual: Chapter 2 1 Nephi 1 5 (ChurchofJesusChrist.org)");
    expect(title("https://www.churchofjesuschrist.org/bc/content/shared/content/english/pdf/language-materials/09411_eng.pdf")).toBe("PDF 09411_eng.pdf (ChurchofJesusChrist.org)");
    expect(title("https://scripturecentral.org/knowhy/did-ancient-israelites-write-in-egyptian", "scripturecentral.org")).toBe("Did Ancient Israelites Write in Egyptian (Scripture Central)");
    expect(title("https://www.churchofjesuschrist.org/")).toBe("ChurchofJesusChrist.org");
  });
});
