import { describe, expect, test } from "vitest";
import { scriptureLinksForChapter } from "../convex/noteScriptureLinks";
import { blockToMarkdown } from "../convex/noteJournal";

const chapter = { volume: "oldtestament", book: "jeremiah", chapter: 31 };
const href = "/browse/oldtestament/jeremiah/31#v-5";
const ref = { verseStart: 5, verseEnd: 5 };

describe("verse note backlinks", () => {
  test("finds current inline and reference links, including old chapter-only labels", () => {
    expect(scriptureLinksForChapter(`**[Jeremiah 31](<${href}>)**`, null, chapter)).toEqual([ref]);
    expect(scriptureLinksForChapter(`[verse][ref]\n\n[ref]: ${href}`, null, chapter)).toEqual([ref]);
    expect(scriptureLinksForChapter("A thought with no link", null, chapter)).toEqual([]);
    expect(scriptureLinksForChapter("", null, chapter)).toEqual([]);
  });

  test("marks the quoted range and preserves gaps in a noncontiguous selection", () => {
    const block = { type: "scripture" as const, text: "Selected words", scriptureRef: {
      ...chapter, verseStart: 5, verseEnd: 7, reference: "Jeremiah 31:5–7",
    } };
    expect(scriptureLinksForChapter(blockToMarkdown(block), null, chapter)).toEqual([{ verseStart: 5, verseEnd: 7 }]);
    expect(scriptureLinksForChapter(`[Jeremiah 31:5, 7–8](${href})`, null, chapter)).toEqual([
      ref, { verseStart: 7, verseEnd: 8 },
    ]);
    expect(scriptureLinksForChapter(`[Jeremiah 31:2–7](${href})`, null, chapter)).toEqual([ref]);
  });

  test("ignores code, images, raw HTML, bare text, external URLs, chapter links and other chapters", () => {
    for (const body of [
      `\`[verse](${href})\``, `\`\`\`md\n[verse](${href})\n\`\`\``, `![verse](${href})`,
      `<a href="${href}">verse</a>`, href, `[verse](https://example.com${href})`,
      "[chapter](/browse/oldtestament/jeremiah/31)", "[other](/browse/oldtestament/jeremiah/32#v-5)",
    ]) expect(scriptureLinksForChapter(body, null, chapter)).toEqual([]);
  });

  test("source metadata needs a real verse backlink and matches its target, including aliases", () => {
    const source = { kind: "scripture" as const, label: "Jeremiah 31", href, ...chapter, verseStart: 5, verseEnd: 7 };
    expect(scriptureLinksForChapter("Thoughts", source, chapter)).toEqual([{ verseStart: 5, verseEnd: 7 }]);
    expect(scriptureLinksForChapter("Thoughts", { ...source, href: "/notes" }, chapter)).toEqual([]);
    expect(scriptureLinksForChapter("Thoughts", { ...source, href: "/browse/oldtestament/jeremiah/31" }, chapter)).toEqual([]);
    expect(scriptureLinksForChapter(`[verse](${href})`, { ...source, href }, chapter)).toEqual([
      { verseStart: 5, verseEnd: 7 }, ref,
    ]);
    expect(scriptureLinksForChapter("[verse](/browse/old-testament/jer-emiah/31?translation=kjv#v-5)", null, chapter)).toEqual([ref]);
  });
});
