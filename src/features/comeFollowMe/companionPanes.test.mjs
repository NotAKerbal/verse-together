import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { guideSectionAt, returnsToGuide, ScriptureDeparture, scripturePositionAt } from "./companionPanes.ts";
import { alignAtReadingLine } from "./scrollSync.ts";
import { readGuide, readGuides } from "../../lib/cfm/cfmGuide.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const guides = new Map(readGuides(root).map((guide) => [guide.slug, readGuide(guide, root)]));
const early = guides.get("2026-09-28-isaiah-40-49").passages;
const late = guides.get("2026-10-05-isaiah-50-57").passages;

/** The commentary anchor of the passage printed as `label` ("57:13b–14"). */
function passage(passages, label) {
  const found = passages.filter((item) => item.label === label);
  assert.equal(found.length, 1, `exactly one passage ${label}`);
  return { kind: "passage", id: found[0].id };
}
const at = (chapter, verse, half = "a") => ({ chapter, verse, half });

test("a verse opens its own passage's commentary at the start, however long that commentary is", () => {
  // The owner's case: reading inside 50:7–9 (long prose) lands on its heading, not part-way through it.
  for (const verse of [7, 8, 9]) {
    for (const half of ["a", "b"]) assert.deepEqual(guideSectionAt(at(50, verse, half), late), passage(late, "50:7–9"));
  }
  assert.deepEqual(guideSectionAt(at(53, 4), late), passage(late, "53:4"));
  // Close-reading leads in the earlier guide are passages too.
  assert.deepEqual(guideSectionAt(at(40, 10), early), passage(early, "40:9–11"));
});

test("a verse the guide splits goes with the half being read", () => {
  assert.deepEqual(guideSectionAt(at(57, 13, "a"), late), passage(late, "57:11–13a"));
  assert.deepEqual(guideSectionAt(at(57, 13, "b"), late), passage(late, "57:13b–14"));
  assert.deepEqual(guideSectionAt(at(57, 12, "b"), late), passage(late, "57:11–13a"));
  assert.deepEqual(guideSectionAt(at(57, 14, "a"), late), passage(late, "57:13b–14"));
});

test("overlapping, uncovered, and trailing verses resolve the way the sync assigns them", () => {
  // 47:5–7 and 47:7–10 share verse 7: it is read with the first, as in the sync's forward spans.
  assert.deepEqual(guideSectionAt(at(47, 7, "b"), early), passage(early, "47:5–7"));
  assert.deepEqual(guideSectionAt(at(47, 8), early), passage(early, "47:7–10"));
  // 47:4 has no close reading: it waits for the next one, 47:5–7, never the next chapter.
  assert.deepEqual(guideSectionAt(at(47, 4), early), passage(early, "47:5–7"));
  // 43:26–28 follow the chapter's last close reading: they stay with it.
  assert.deepEqual(guideSectionAt(at(43, 27), early), passage(early, "43:22–25"));
  // A chapter heading opens the chapter's own section.
  assert.deepEqual(guideSectionAt(at(53, null), late), { kind: "chapter", chapter: 53 });
});

test("verses before a chapter's first passage, or in a chapter without passages, open the chapter", () => {
  const passages = [
    { id: "p-3-5", chapter: 9, first: 3, last: 5 },
    { id: "p-8", chapter: 9, first: 8, last: 8 },
  ];
  assert.deepEqual(guideSectionAt(at(9, 1), passages), { kind: "chapter", chapter: 9 });
  assert.deepEqual(guideSectionAt(at(9, 2, "b"), passages), { kind: "chapter", chapter: 9 });
  assert.deepEqual(guideSectionAt(at(9, 6), passages), { kind: "passage", id: "p-8" });
  assert.deepEqual(guideSectionAt(at(9, 12), passages), { kind: "passage", id: "p-8" });
  assert.deepEqual(guideSectionAt(at(10, 4), passages), { kind: "chapter", chapter: 10 });
});

test("every passage in both guides opens on its own first verse unless an earlier passage already covers it", () => {
  // Verse 13 of 57:11–13a does not cover the start of 57:13b–14: the guide split it between them.
  const splitBetween = (other, item) => other.last === item.first && other.lastHalf === "a" && item.firstHalf === "b";
  let checked = 0;
  for (const passages of [early, late]) {
    for (const [index, item] of passages.entries()) {
      const covered = passages
        .slice(0, index)
        .some((other) => other.chapter === item.chapter && other.first <= item.first && item.first <= other.last && !splitBetween(other, item));
      if (covered) continue;
      const start = at(item.chapter, item.first, item.firstHalf === "b" ? "b" : "a");
      assert.deepEqual(guideSectionAt(start, passages), { kind: "passage", id: item.id }, item.label);
      checked += 1;
    }
  }
  assert.ok(checked > 80, `${checked} passages checked`);
});

// A scripture pane: chapter 57's heading at 0, verse 12 at 100–180, verse 13 at 190–290 (middle 240),
// verse 14 at 300–360, then chapter 58's heading at 420 and its verse 1 at 520–600.
const marks = [
  { chapter: 57, verse: null, top: 0, height: 0 },
  { chapter: 57, verse: 12, top: 100, height: 80 },
  { chapter: 57, verse: 13, top: 190, height: 100 },
  { chapter: 57, verse: 14, top: 300, height: 60 },
  { chapter: 58, verse: null, top: 420, height: 0 },
  { chapter: 58, verse: 1, top: 520, height: 80 },
];
const position = (line, scrollTop = 50) => scripturePositionAt(marks, { scrollTop, line });

test("the scripture at the reading line is the verse there, and which half of it", () => {
  assert.deepEqual(position(60), at(57, null), "between a heading and its first verse");
  assert.deepEqual(position(200), at(57, 13, "a"));
  assert.deepEqual(position(239.5), at(57, 13, "a"));
  assert.deepEqual(position(240), at(57, 13, "b"), "the middle starts the second half, as in the sync");
  assert.deepEqual(position(295), at(57, 13, "b"), "the gap after a verse stays with it");
  assert.deepEqual(position(450), at(58, null), "the next chapter's heading");
  assert.deepEqual(position(5000), at(58, 1, "b"), "past the end");
  assert.deepEqual(position(-20), at(57, null), "above the first heading");
  assert.equal(scripturePositionAt([], { scrollTop: 0, line: 0 }), null);
});

test("a pane at its very top reads from the start of the scripture, not from its reading line", () => {
  assert.deepEqual(position(200, 0), at(57, null));
  assert.deepEqual(position(200, 0.5), at(57, null));
  assert.deepEqual(position(200, 1), at(57, 13, "a"));
});

test("a scripture target placed on the reading line opens that target's own commentary", () => {
  // As a scripture deep link places it: the target's start, nudged just inside, on the 30% line of a
  // 600px pane (scroll offsets are whole pixels).
  const height = 600;
  const landed = (start) => {
    const scrollTop = Math.round(alignAtReadingLine(start, height, 0.3));
    return guideSectionAt(position(scrollTop + height * 0.3, scrollTop), late);
  };
  // 57:13b–14 starts at verse 13's middle; a whole-verse target, 57:13, starts at its top (its first half).
  assert.deepEqual(landed(240), passage(late, "57:13b–14"));
  assert.deepEqual(landed(190), passage(late, "57:11–13a"));
});

test("leaving the scripture side is noticed once per departure, and only after resting there", () => {
  const max = 390;
  const departure = new ScriptureDeparture();
  assert.equal(departure.scrolled(0, max), false, "on the guide side");
  assert.equal(departure.scrolled(200, max), false, "moving toward the scripture");
  assert.equal(departure.scrolled(max, max), false, "arrived");
  assert.equal(departure.scrolled(max - 1.5, max), false, "sub-pixel rest still counts as resting");
  assert.equal(departure.scrolled(max - 12, max), true, "the first movement away");
  // The gesture wavers across the halfway point and back: no further departures.
  for (const left of [300, 180, 220, 150, 260, 40, 0]) assert.equal(departure.scrolled(left, max), false, `at ${left}`);
  // Back to rest on the scripture, then away again: a new departure.
  assert.equal(departure.scrolled(max, max), false);
  assert.equal(departure.scrolled(max - 3, max), true);
});

test("departures hold for right-to-left strips, and not for strips without width or after a reset", () => {
  const rtl = new ScriptureDeparture();
  rtl.scrolled(-390, 390);
  assert.equal(rtl.scrolled(-300, 390), true);
  const empty = new ScriptureDeparture();
  empty.scrolled(0, 0);
  assert.equal(empty.scrolled(0, 0), false);
  const reset = new ScriptureDeparture();
  reset.scrolled(390, 390);
  reset.reset();
  assert.equal(reset.scrolled(0, 390), false, "a layout change back to the guide side is not a swipe");
});

test("a change of strip width is never a departure; the next return after re-snapping is, once", () => {
  // Phone (393 wide) to tablet (768 wide) while staying in strip mode, resting on the scripture.
  const phone = 393;
  const tablet = 768;
  const resized = new ScriptureDeparture();
  assert.equal(resized.scrolled(phone, phone), false, "resting on the scripture");
  // The re-snap reports the old offset against the new maximum: a layout change, not a swipe.
  assert.equal(resized.scrolled(phone, tablet), false, "changed maximum, off rest");
  for (const left of [500, 700]) assert.equal(resized.scrolled(left, tablet), false, `re-snapping through ${left}`);
  assert.equal(resized.scrolled(tablet, tablet), false, "resting again at the new width");
  assert.equal(resized.scrolled(tablet - 30, tablet), true, "the next genuine return");
  for (const left of [600, 300, 0]) assert.equal(resized.scrolled(left, tablet), false, `still the same return at ${left}`);

  // The same with the component's ResizeObserver measuring the strip first (before or after the re-snap).
  const observed = new ScriptureDeparture();
  observed.scrolled(phone, phone);
  observed.resized(phone, tablet);
  assert.equal(observed.scrolled(tablet, tablet), false);
  assert.equal(observed.scrolled(tablet - 5, tablet), true);
  const snappedFirst = new ScriptureDeparture();
  snappedFirst.scrolled(phone, phone);
  snappedFirst.resized(tablet, tablet);
  assert.equal(snappedFirst.scrolled(tablet, tablet), false);
  assert.equal(snappedFirst.scrolled(tablet - 5, tablet), true);

  // A height-only resize mid-gesture (a phone's URL bar) changes nothing: resting stays resting, and a
  // departure already reported is not reported again.
  const urlBar = new ScriptureDeparture();
  urlBar.scrolled(phone, phone);
  urlBar.resized(phone, phone);
  assert.equal(urlBar.scrolled(phone - 20, phone), true);
  urlBar.resized(phone - 20, phone);
  assert.equal(urlBar.scrolled(phone - 60, phone), false);

  // Even with the reader's input still recent, the gate gets no departure to act on during the resize.
  const input = { touches: 0, at: 1000 };
  const gate = new ScriptureDeparture();
  gate.scrolled(phone, phone);
  assert.equal(returnsToGuide(gate.scrolled(phone, tablet), false, input, 1010, 400), false);
  assert.equal(returnsToGuide(gate.scrolled(tablet, tablet), false, input, 1020, 400), false);
  // A shrinking width (tablet to phone) clamps the offset to the new maximum: still at rest, no departure.
  assert.equal(gate.scrolled(phone, phone), false);
  assert.equal(gate.scrolled(phone - 40, phone), true);
});

/**
 * The phone strip's decision, as onStripScroll makes it: each horizontal scroll goes to the departure tracker,
 * and a departure opens the guide at the scripture's section when it is the reader's swipe.
 */
function strip(width = 390) {
  const departure = new ScriptureDeparture();
  const input = { touches: 0, at: Number.NEGATIVE_INFINITY };
  let now = 0;
  let heading = false;
  let landings = 0;
  const scroll = (left) => {
    now += 16;
    if (returnsToGuide(departure.scrolled(left, width), heading, input, now, 400)) landings += 1;
  };
  return {
    get landings() {
      return landings;
    },
    /** A programmatic move (deep link, reference, pager, Back to the guide). */
    reveal(lefts) {
      heading = true;
      lefts.forEach(scroll);
      heading = false;
    },
    /** The reader's swipe: a finger on the strip through `lefts`, then lifted (momentum continues). */
    swipe(lefts, momentum = []) {
      input.touches = 1;
      input.at = now;
      lefts.forEach(scroll);
      input.touches = 0;
      input.at = now;
      momentum.forEach(scroll);
    },
    /** The strip moving with no one on it and no programmatic move under way. */
    drift(lefts) {
      lefts.forEach(scroll);
    },
    /** Time passes with no strip input (reading either side vertically does not touch the strip). */
    wait(ms) {
      now += ms;
    },
  };
}

test("every reader return from the scripture opens the guide, the first after a deep link included", () => {
  const phone = strip();
  // A scripture deep link (or a reference in the guide): the strip is moved to the scripture programmatically.
  phone.reveal([390]);
  assert.equal(phone.landings, 0, "arriving on the scripture is not a return");
  phone.wait(5000);
  // The first swipe back, with no scripture scrolling in between, lands.
  phone.swipe([370, 250, 120], [40, 0]);
  assert.equal(phone.landings, 1, "the first return after a deep link");
  // Reading the guide, then guide -> scripture -> guide again, repeatedly: each return lands once.
  for (let round = 2; round <= 4; round += 1) {
    phone.wait(3000);
    phone.swipe([30, 200, 330], [380, 390]);
    assert.equal(phone.landings, round - 1, "turning to the scripture does not land");
    phone.wait(3000);
    phone.swipe([360, 200], [60, 0]);
    assert.equal(phone.landings, round, `return ${round}`);
  }
});

test("a cancelled or wavering swipe off the scripture lands at most once per departure", () => {
  const phone = strip();
  phone.reveal([390]);
  // Partial: away and back to rest on the scripture. One departure, one landing.
  phone.swipe([380, 300, 340], [380, 390]);
  assert.equal(phone.landings, 1);
  // From rest again, a new departure lands once; wavering across the halfway point and back adds nothing.
  phone.swipe([370, 150, 260, 120, 300], [350, 390]);
  assert.equal(phone.landings, 2, "one landing for the whole wavering gesture");
  // Programmatic moves off the scripture (pager, Back to the guide) never land through the strip; the pager
  // lands itself, once, before it moves the strip.
  phone.reveal([300, 100, 0]);
  assert.equal(phone.landings, 2);
  // A movement off rest with nobody on the strip, long after any input (a scroll-snap correction), does not
  // land, and uses that departure up; the reader's next return from rest still does.
  phone.reveal([390]);
  phone.wait(5000);
  phone.drift([386, 390]);
  phone.drift([380, 330]);
  assert.equal(phone.landings, 2);
  phone.drift([390]);
  phone.wait(2000);
  phone.swipe([375, 200], [0]);
  assert.equal(phone.landings, 3);
});

test("only the reader's own input on the strip counts as a return", () => {
  const now = 10_000;
  assert.equal(returnsToGuide(true, false, { touches: 1, at: 0 }, now, 400), true, "a finger on the strip");
  assert.equal(returnsToGuide(true, false, { touches: 0, at: now - 100 }, now, 400), true, "a recent wheel turn or flick");
  assert.equal(returnsToGuide(true, false, { touches: 0, at: now - 400 }, now, 400), false, "input long past");
  assert.equal(returnsToGuide(true, true, { touches: 1, at: now }, now, 400), false, "a programmatic move");
  assert.equal(returnsToGuide(false, false, { touches: 1, at: now }, now, 400), false, "no departure");
});
