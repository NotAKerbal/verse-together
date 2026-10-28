import { describe, expect, test } from "vitest";
import { groupVerseInsightRefsByVerse, type VerseInsightRef } from "../src/features/insights/VerseInsightMarker";

const ref = (draftId: string, verseStart: number, verseEnd = verseStart): VerseInsightRef => ({
  draftId, draftTitle: draftId, verseStart, verseEnd, status: "draft",
});

describe("reader note links", () => {
  test("links once per cited passage while retaining separate passages and every note", () => {
    const first = ref("first", 3, 7);
    const second = ref("second", 3, 5);
    const later = ref("first", 9, 10);
    const grouped = groupVerseInsightRefsByVerse([first, first, second, later]);
    expect([...grouped.keys()]).toEqual([3, 9]);
    expect(grouped.get(3)).toEqual([first, second]);
    expect(grouped.get(9)).toEqual([later]);
    expect([...groupVerseInsightRefsByVerse([ref("reversed", 7, 3)]).keys()]).toEqual([3]);
  });
});
