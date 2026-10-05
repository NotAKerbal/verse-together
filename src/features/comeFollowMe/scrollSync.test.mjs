import assert from "node:assert/strict";
import test from "node:test";
import { buildSegments, guideToScripture, scriptureToGuide, ScrollOwnership, segmentAt } from "./scrollSync.ts";
import { passageHalves } from "../../lib/cfm/cfmAnchors.ts";

// A small guide: an unmapped introduction, a chapter opening, two passages that split verse 13 into
// halves (as Isaiah 57:11–13a and 57:13b–14 do), the chapter's closing questions, and a bibliography.
// Scripture offsets: chapter heading 0, verse 11 at 40, verse 13 at 100–160 (middle 130), verse 14 to 220.
const markers = [
  { top: 0, kind: "unmapped", meta: "intro" },
  { top: 200, kind: "mapped", scripture: { start: 0, end: 40 }, meta: "57" },
  { top: 300, kind: "mapped", scripture: { start: 40, end: 130 }, meta: "57:11–13a" },
  { top: 700, kind: "mapped", scripture: { start: 130, end: 220 }, meta: "57:13b–14" },
  { top: 800, kind: "hold", meta: "questions" },
  { top: 1000, kind: "unmapped", meta: "bibliography" },
];
const segments = buildSegments(markers, 1400);

test("guide positions map through their own passage, however long its commentary", () => {
  assert.equal(guideToScripture(segments, 300), 40);
  // Halfway through 400px of commentary on 11–13a is halfway through its 90px of scripture.
  assert.equal(guideToScripture(segments, 500), 85);
  // 100px of commentary on 13b–14 spans the same 90px of scripture at a different rate.
  assert.equal(guideToScripture(segments, 750), 175);
});

test("lettered halves meet mid-verse, so the scripture does not jump between them", () => {
  const justBefore = guideToScripture(segments, 699.999);
  const atBoundary = guideToScripture(segments, 700);
  assert.ok(Math.abs(justBefore - atBoundary) < 0.01, `${justBefore} vs ${atBoundary}`);
  assert.equal(atBoundary, 130);
});

test("unmapped commentary holds the scripture still; closing material rests at the chapter's last verse", () => {
  assert.equal(guideToScripture(segments, 50), null, "introduction");
  assert.equal(guideToScripture(segments, 1200), null, "bibliography");
  assert.equal(guideToScripture(segments, -10), null, "above the guide");
  assert.equal(guideToScripture(segments, 850), 220, "questions after the passages");
  assert.equal(guideToScripture(segments, 990), 220);
});

test("guide-to-scripture never runs backward while the guide moves forward", () => {
  let previous = -Infinity;
  for (let y = 200; y < 1000; y += 3) {
    const value = guideToScripture(segments, y);
    assert.ok(value >= previous, `at ${y}: ${value} < ${previous}`);
    previous = value;
  }
});

test("scripture positions find their commentary, and a round trip lands where it started", () => {
  for (const y of [210, 250, 300, 420, 650, 700, 740, 790]) {
    const back = scriptureToGuide(segments, guideToScripture(segments, y));
    assert.ok(Math.abs(back - y) < 1e-6, `${y} came back as ${back}`);
  }
  assert.equal(scriptureToGuide(segments, 130), 700, "verse 13's second half opens 13b–14");
  assert.equal(scriptureToGuide(segments, 129), 300 + (89 / 90) * 400, "its first half is the end of 11–13a");
  assert.equal(scriptureToGuide(segments, 500), 800, "past the last verse, the end of the last passage");
});

test("overlapping or uncovered verses map to exactly one place in the guide", () => {
  // The second passage's span overlaps the first; the overlap belongs to the first.
  const overlapping = buildSegments(
    [
      { top: 0, kind: "mapped", scripture: { start: 0, end: 200 } },
      { top: 100, kind: "mapped", scripture: { start: 150, end: 260 } },
      { top: 300, kind: "mapped", scripture: { start: 400, end: 500 } },
    ],
    400
  );
  let previous = -Infinity;
  for (let y = 0; y <= 520; y += 5) {
    const guide = scriptureToGuide(overlapping, y);
    assert.ok(guide >= previous, `scripture ${y}: guide ${guide} < ${previous}`);
    previous = guide;
  }
  assert.equal(scriptureToGuide(overlapping, 170), 85, "inside the overlap: the first passage");
  assert.equal(scriptureToGuide(overlapping, 300), 300, "verses no commentary covers wait at the next passage");
  assert.equal(segmentAt(overlapping, 150), 1);
});

test("a pane's own programmatic scroll is not mistaken for the reader", () => {
  const ownership = new ScrollOwnership(180);
  ownership.input("guide", 0);
  assert.equal(ownership.scrolled("guide", 400, 10), true);
  ownership.expect("scripture", 120);
  assert.equal(ownership.scrolled("scripture", 120.6, 12), false, "the echo of our own write");
  assert.equal(ownership.scrolled("scripture", 140, 14), false, "the follower moving while the guide is active");
  assert.equal(ownership.current, "guide");
});

test("touch momentum keeps ownership without input events; quiet hands it over", () => {
  const ownership = new ScrollOwnership(180);
  ownership.input("guide", 0);
  for (let t = 16; t <= 1500; t += 16) {
    assert.equal(ownership.scrolled("guide", t, t), true);
    assert.equal(ownership.scrolled("scripture", 999, t + 1), false);
  }
  // 200ms after the last guide movement, a scripture scroll is the reader's own.
  assert.equal(ownership.scrolled("scripture", 50, 1700), true);
  assert.equal(ownership.current, "scripture");
});

test("touching the other pane takes over at once, even mid-scroll", () => {
  const ownership = new ScrollOwnership(180);
  ownership.input("guide", 0);
  ownership.scrolled("guide", 10, 5);
  ownership.input("scripture", 20);
  assert.equal(ownership.scrolled("scripture", 30, 25), true);
  assert.equal(ownership.scrolled("guide", 40, 30), false, "the guide's leftover momentum no longer drives");
});

test("half-verse suffixes are read from printed ranges", () => {
  assert.deepEqual(passageHalves("57:11–13a"), { lastHalf: "a" });
  assert.deepEqual(passageHalves("57:13b–14"), { firstHalf: "b" });
  assert.deepEqual(passageHalves("57:13a"), { firstHalf: "a", lastHalf: "a" });
  assert.deepEqual(passageHalves("53:4"), {});
  assert.deepEqual(passageHalves("40:1–2"), {});
});
