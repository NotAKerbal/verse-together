import assert from "node:assert/strict";
import test from "node:test";
import { readingGroups } from "./scriptureFirst.ts";
import { readGuide, readGuides } from "../../lib/cfm/cfmGuide.ts";

const verses = Array.from({ length: 10 }, (_, index) => ({ verse: index + 1, text: `Verse ${index + 1}` }));
const block = (id, first, last, extra = {}) => ({ id, html: `<p>${id}</p>`, passage: { id, label: `1:${first}–${last}`, chapter: 1, first, last, ...extra } });

test("overlapping and half-verse commentary never duplicates, skips, or reorders scripture", () => {
  const blocks = [
    { id: "overview", html: "<p>Original overview</p>" },
    block("first", 2, 5, { lastHalf: "a" }),
    block("overlap", 5, 7, { firstHalf: "b" }),
    block("same", 7, 7),
    { id: "unmapped", html: "<h3>Cross-chapter reading</h3><p>Keep this too.</p>" },
    block("final", 9, 9),
  ];
  const groups = readingGroups(verses, blocks);
  assert.deepEqual(groups.flatMap((group) => group.verses), verses);
  assert.deepEqual(groups.flatMap((group) => group.context ? [group.context] : []), blocks);
  assert.equal(groups.find((group) => group.id === "same").verses.length, 0);
  assert.deepEqual(groups[1].verses.map((verse) => verse.verse), [1]);
});

test("chapters without commentary still render every verse", () => {
  assert.deepEqual(readingGroups(verses, []).flatMap((group) => group.verses), verses);
});

test("every published chapter preserves all scripture and original context fragments", () => {
  for (const metadata of readGuides()) {
    const guide = readGuide(metadata);
    for (const section of guide.readerSections.filter((section) => section.chapter != null)) {
      // The actual verse count is immaterial to interleaving; span the largest referenced verse plus a tail.
      const count = Math.max(1, ...section.blocks.map((block) => block.passage?.last ?? 0)) + 2;
      const chapter = Array.from({ length: count }, (_, index) => ({ verse: index + 1, text: String(index + 1) }));
      const groups = readingGroups(chapter, section.blocks);
      assert.deepEqual(groups.flatMap((group) => group.verses), chapter, `${metadata.slug} ${section.chapter}`);
      assert.deepEqual(groups.flatMap((group) => group.context ? [group.context] : []), section.blocks);
    }
  }
});
