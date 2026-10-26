import { expect, test } from "vitest";
import { scriptureSourceOffsets } from "../src/lib/verseSelection";

test("CFM typographic dashes map to canonical scripture offsets in both directions", () => {
  const offsets = scriptureSourceOffsets("A--B--C", "A—B—C");
  expect(offsets).toEqual([0, 1, 3, 4, 6, 7]);
  expect(offsets?.indexOf(6)).toBe(4);
  expect(scriptureSourceOffsets("A—B", "A—B")).toEqual([0, 1, 2, 3]);
});

test("text differences beyond typography are refused rather than marking different words", () => {
  expect(scriptureSourceOffsets("Old words", "New words")).toBeNull();
  expect(scriptureSourceOffsets("A--B", "A—BC")).toBeNull();
  expect(scriptureSourceOffsets("A--BC", "A—B")).toBeNull();
});
