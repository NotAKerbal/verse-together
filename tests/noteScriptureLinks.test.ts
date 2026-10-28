import { describe, expect, test } from "vitest";
import { scriptureLinksForChapter } from "../convex/noteScriptureLinks";
import { blockToMarkdown } from "../convex/noteJournal";

const chapter = { volume: "oldtestament", book: "jeremiah", chapter: 31 };
const href = "/browse/oldtestament/jeremiah/31#v-5";
const ref = { verseStart: 5, verseEnd: 5 };

describe("verse note backlinks", () => {
  test("finds current inline and reference links, including old chapter-only labels", () => {
    expect(scriptureLinksForChapter(`**[Jeremiah 31](<${href}>)**`, chapter)).toEqual([ref]);
    expect(scriptureLinksForChapter(`[verse][ref]\n\n[ref]: ${href}`, chapter)).toEqual([ref]);
    expect(scriptureLinksForChapter("A thought with no link", chapter)).toEqual([]);
    expect(scriptureLinksForChapter("", chapter)).toEqual([]);
  });

  test("marks the quoted range and preserves gaps in a noncontiguous selection", () => {
    const block = { type: "scripture" as const, text: "Selected words", scriptureRef: {
      ...chapter, verseStart: 5, verseEnd: 7, reference: "Jeremiah 31:5–7",
    } };
    expect(scriptureLinksForChapter(blockToMarkdown(block), chapter)).toEqual([{ verseStart: 5, verseEnd: 7 }]);
    expect(scriptureLinksForChapter(`[Jeremiah 31:5, 7–8](${href})`, chapter)).toEqual([
      ref, { verseStart: 7, verseEnd: 8 },
    ]);
    expect(scriptureLinksForChapter(`[Jeremiah 31:2–7](${href})`, chapter)).toEqual([ref]);
  });

  test("ignores code, images, raw HTML, bare text, external URLs, chapter links and other chapters", () => {
    for (const body of [
      `\`[verse](${href})\``, `\`\`\`md\n[verse](${href})\n\`\`\``, `![verse](${href})`,
      `<a href="${href}">verse</a>`, href, `[verse](https://example.com${href})`,
      "[chapter](/browse/oldtestament/jeremiah/31)", "[other](/browse/oldtestament/jeremiah/32#v-5)",
    ]) expect(scriptureLinksForChapter(body, chapter)).toEqual([]);
  });

  test("matches canonical volume and book aliases", () => {
    expect(scriptureLinksForChapter("[verse](/browse/old-testament/jer-emiah/31?translation=kjv#v-5)", chapter)).toEqual([ref]);
  });
});
