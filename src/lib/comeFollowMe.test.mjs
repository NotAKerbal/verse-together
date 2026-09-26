import assert from "node:assert/strict";
import test from "node:test";
import {
  COME_FOLLOW_ME_WEEKS,
  getAdjacentWeek,
  getComeFollowMeWeek,
  parseBlock,
} from "./comeFollowMe.ts";
import { getBibleBookBySlug } from "./bibleCanon.ts";

const ot = (book, from, to = from) => ({ volume: "oldtestament", book, from, to });
const pearl = (book, from, to = from) => ({ volume: "pearl", book, from, to });

test("bare numbers after a book continue that book", () => {
  assert.deepEqual(parseBlock("Exodus 19–20; 24; 31–34"), [ot("exodus", 19, 20), ot("exodus", 24), ot("exodus", 31, 34)]);
});

test("a new book name resets the continuation", () => {
  assert.deepEqual(parseBlock("Exodus 35–40; Leviticus 1; 4; 16; 19"), [
    ot("exodus", 35, 40),
    ot("leviticus", 1),
    ot("leviticus", 4),
    ot("leviticus", 16),
    ot("leviticus", 19),
  ]);
});

test("a book with no numbers means the whole book", () => {
  assert.deepEqual(parseBlock("Ruth; 1 Samuel 1–7"), [ot("ruth", 1, 4), ot("1samuel", 1, 7)]);
  assert.deepEqual(parseBlock("Amos; Obadiah; Jonah"), [ot("amos", 1, 9), ot("obadiah", 1, 1), ot("jonah", 1, 4)]);
});

test("abbreviated range ends expand against the start", () => {
  assert.deepEqual(parseBlock("Psalms 102–3; 110; 116–19; 127–28; 135–39; 146–50"), [
    ot("psalms", 102, 103),
    ot("psalms", 110),
    ot("psalms", 116, 119),
    ot("psalms", 127, 128),
    ot("psalms", 135, 139),
    ot("psalms", 146, 150),
  ]);
});

test("numbered books and Pearl of Great Price books resolve to their slugs and volumes", () => {
  assert.deepEqual(parseBlock("Moses 1; Abraham 3"), [pearl("moses", 1), pearl("abraham", 3)]);
  assert.deepEqual(parseBlock("Genesis 1–2; Moses 2–3; Abraham 4–5"), [
    ot("genesis", 1, 2),
    pearl("moses", 2, 3),
    pearl("abraham", 4, 5),
  ]);
  assert.deepEqual(parseBlock("2 Samuel 11–12; 1 Kings 3; 6–9; 11"), [
    ot("2samuel", 11, 12),
    ot("1kings", 3),
    ot("1kings", 6, 9),
    ot("1kings", 11),
  ]);
});

test("rejects unknown books and out-of-range chapters", () => {
  assert.throws(() => parseBlock("Nephi 1"), /unknown book/);
  assert.throws(() => parseBlock("Ruth 5"), /out of range/);
  assert.throws(() => parseBlock("24"), /has no book/);
});

test("special weeks have no refs but point somewhere fitting", () => {
  const easter = COME_FOLLOW_ME_WEEKS.find((week) => week.block === "Easter");
  assert.deepEqual(easter.refs, []);
  assert.deepEqual(easter.suggestion, { ref: ot("isaiah", 53), note: "Read about the Savior" });
  const christmas = COME_FOLLOW_ME_WEEKS.find((week) => week.block === "Christmas");
  assert.deepEqual(christmas.suggestion.ref, ot("isaiah", 9));
  assert.deepEqual(COME_FOLLOW_ME_WEEKS[0].suggestion.ref, ot("genesis", 1));
});

test("the schedule is 52 contiguous Monday-to-Sunday weeks within each book's chapter count", () => {
  assert.equal(COME_FOLLOW_ME_WEEKS.length, 52);
  const dayMs = 24 * 60 * 60 * 1000;
  const parse = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  COME_FOLLOW_ME_WEEKS.forEach((week, index) => {
    const start = parse(week.start);
    const end = parse(week.end);
    assert.equal(start.getDay(), 1, `${week.start} should be a Monday`);
    assert.equal(end.getDay(), 0, `${week.end} should be a Sunday`);
    assert.equal(Math.round((end - start) / dayMs), 6, `${week.block} should span seven days`);
    if (index > 0) {
      const previousEnd = parse(COME_FOLLOW_ME_WEEKS[index - 1].end);
      assert.equal(Math.round((start - previousEnd) / dayMs), 1, `${week.block} should follow the previous week`);
    }
    for (const ref of week.refs) {
      const chapters = ref.volume === "pearl" ? { moses: 8, abraham: 5 }[ref.book] : getBibleBookBySlug(ref.book)?.chapters;
      assert.ok(chapters, `${ref.book} should be a known book`);
      assert.ok(1 <= ref.from && ref.from <= ref.to && ref.to <= chapters, `${week.block}: ${ref.book} ${ref.from}–${ref.to}`);
    }
  });
});

test("week lookup respects Monday/Sunday boundaries in local time", () => {
  assert.equal(getComeFollowMeWeek(new Date(2025, 11, 28)), null);
  assert.equal(getComeFollowMeWeek(new Date(2025, 11, 29)).block, "Introduction to the Old Testament");
  assert.equal(getComeFollowMeWeek(new Date(2026, 0, 4, 23, 59, 59)).block, "Introduction to the Old Testament");
  assert.equal(getComeFollowMeWeek(new Date(2026, 0, 5, 0, 0, 0)).block, "Moses 1; Abraham 3");
  assert.equal(getComeFollowMeWeek(new Date(2026, 8, 26)).block, "Isaiah 13–14; 22; 24–30; 35");
  assert.equal(getComeFollowMeWeek(new Date(2026, 11, 27)).block, "Christmas");
  assert.equal(getComeFollowMeWeek(new Date(2026, 11, 28)), null);
});

test("adjacent weeks step through the schedule and stop at the ends", () => {
  const first = COME_FOLLOW_ME_WEEKS[0];
  const last = COME_FOLLOW_ME_WEEKS[COME_FOLLOW_ME_WEEKS.length - 1];
  assert.equal(getAdjacentWeek(first, -1), null);
  assert.equal(getAdjacentWeek(first, 1).block, "Moses 1; Abraham 3");
  assert.equal(getAdjacentWeek(getAdjacentWeek(first, 1), -1), first);
  assert.equal(getAdjacentWeek(last, 1), null);
  assert.equal(getAdjacentWeek(last, -1).block, "Malachi");
});
