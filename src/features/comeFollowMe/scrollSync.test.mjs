import assert from "node:assert/strict";
import test from "node:test";
import {
  alignAtReadingLine,
  buildSegments,
  followScripture,
  guideScrollTop,
  guideToScripture,
  keepSpanInView,
  scriptureToGuide,
  ScrollOwnership,
  segmentAt,
  startReverseFollow,
} from "./scrollSync.ts";
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

test("an explicit target placed on the reading line brings the guide to that target's own commentary", () => {
  const height = 600;
  const line = 0.3;
  const guideAt = (start, nudge) => {
    const scrollTop = alignAtReadingLine(start, height, line, nudge);
    // Scroll offsets are whole pixels.
    return scriptureToGuide(segments, Math.round(scrollTop) + height * line);
  };
  // 57:13b–14 starts mid-verse 13 (offset 130): the guide opens on 13b–14, not inside 11–13a.
  const at13b = guideAt(130);
  assert.equal(segmentAt(segments, at13b), 3);
  assert.ok(at13b - 700 < 5, `${at13b} should be at the start of 13b–14`);
  // A plain verse start (verse 11 at 40) opens 11–13a.
  assert.equal(segmentAt(segments, guideAt(40)), 2);
  // Landing the target at the pane top instead (the old 12px gap) reads 30% further down, past 13b–14.
  assert.equal(scriptureToGuide(segments, 130 - 12 + height * line), 800);
  // Without the nudge, a start that rounds a fraction of a pixel up the page reads the previous passage.
  assert.equal(segmentAt(segments, scriptureToGuide(segments, 129.6)), 2);
});

// The owner's desktop case: a 439.4px scripture pane under the reading edge, 12px clearance at each edge,
// both panes reading at 30%. Scripture: chapter heading 0–60, 50:6 60–160, 50:7–9 160–480 (320px: fits),
// 50:10 480–600, a long 800px passage 600–1400 (does not fit), then the chapter's questions and a bibliography.
const pane = { height: 439.4, top: 12, bottom: 12 };
const readingLine = pane.height * 0.3;
const blend = readingLine;
const owner = buildSegments(
  [
    { top: 0, kind: "mapped", scripture: { start: 0, end: 60 } },
    { top: 200, kind: "mapped", scripture: { start: 60, end: 160 } },
    { top: 600, kind: "mapped", scripture: { start: 160, end: 480 } },
    { top: 2000, kind: "mapped", scripture: { start: 480, end: 600 } },
    { top: 2400, kind: "mapped", scripture: { start: 600, end: 1400 } },
    { top: 3400, kind: "hold" },
    { top: 3600, kind: "unmapped" },
  ],
  4000
);
const placed = (y) => guideScrollTop(owner, y, readingLine, pane, blend);

test("a span is kept whole in the pane when it fits, and left alone when it does not", () => {
  const view = { height: 400, top: 12, bottom: 12 };
  const span = { start: 160, end: 480 };
  // Whole placements: from 480 + 12 - 400 = 92 up to 160 - 12 = 148.
  assert.equal(keepSpanInView(100, span, view), 100, "already whole: unchanged");
  assert.equal(keepSpanInView(233.9, span, view), 148, "first verse cut off: brought down below the top edge");
  assert.equal(keepSpanInView(20, span, view), 92, "last verse below the bottom: brought up");
  // Exactly fitting (span plus both clearances is the pane height) has one placement.
  const exact = { start: 100, end: 476 };
  assert.equal(keepSpanInView(0, exact, view), 88);
  assert.equal(keepSpanInView(500, exact, view), 88);
  // One pixel too tall: never forced.
  assert.equal(keepSpanInView(321, { start: 100, end: 477 }, view), 321);
});

test("guide-driven sync keeps a fitting passage's first and last verses visible", () => {
  // Reading the middle of the long 50:7–9 commentary (the owner's Verse 9 paragraph).
  const raw = guideToScripture(owner, 1500) - readingLine;
  assert.ok(raw > 160 - 12, `the plain reading line would hide verse 7 (scroll ${raw})`);
  assert.equal(placed(1500), 148, "verse 7 starts 12px below the pane top");
  // Everywhere before the hand-off to 50:10, verses 7 through 9 are whole inside the pane.
  for (let y = 600; y <= 2000 - blend; y += 5) {
    const top = placed(y);
    assert.ok(top <= 160 - pane.top + 1e-9, `at ${y}: verse 7 cut (scroll ${top})`);
    assert.ok(top + pane.height - pane.bottom >= 480 - 1e-9, `at ${y}: verse 9 cut (scroll ${top})`);
  }
  // The chapter opening fits too: its heading is never above the pane top.
  for (let y = 0; y < 200 - blend; y += 5) assert.ok(placed(y) <= 0 - pane.top + 1e-9, `chapter heading cut at ${y}`);
});

test("a passage too tall for the pane still scrolls through continuously", () => {
  for (let y = 2400; y < 3400; y += 7) {
    const raw = guideToScripture(owner, y) - readingLine;
    assert.ok(Math.abs(placed(y) - raw) < 1e-9, `at ${y}: ${placed(y)} instead of ${raw}`);
  }
  // Closing material still rests at the end of the last passage; unmapped material holds still.
  assert.ok(Math.abs(placed(3500) - (1400 - readingLine)) < 1e-9);
  assert.equal(placed(3700), null);
  assert.equal(placed(-5), null);
});

test("held passages hand over to the next one without a jump and never run backward", () => {
  let previous = null;
  let steepest = 0;
  for (let y = 0; y < 3600; y += 0.5) {
    const top = placed(y);
    if (previous != null) {
      assert.ok(top >= previous - 1e-9, `at ${y}: ${top} < ${previous}`);
      steepest = Math.max(steepest, top - previous);
    }
    previous = top;
  }
  // Half a guide pixel never moves the scripture more than a couple of pixels, boundaries included.
  assert.ok(steepest < 2, `largest step ${steepest}`);
  // At the boundary itself the pane is already where 50:10 begins.
  assert.ok(Math.abs(placed(1999.999) - placed(2000)) < 0.01);
});

test("the plain reverse map has no flat stretch, and agrees with guide driving where nothing is held", () => {
  const guideAt = (scrollTop) => scriptureToGuide(owner, scrollTop + readingLine);
  assert.ok(guideAt(148) < guideAt(149) && guideAt(149) < guideAt(150), "no flat stretch to leap across");
  // Where the guide-driven placement was not held (the passage was already whole at the plain reading line),
  // the plain map is a true inverse. Where it was held, it is not (next test).
  const scrollTop = 100;
  assert.ok(Math.abs(placed(guideAt(scrollTop)) - scrollTop) < 1e-6);
});

test("taking over the scripture from a held placement continues the guide from where it is", () => {
  // The owner's case: the guide reads deep into the 50:7–9 commentary and the scripture is held whole.
  const guide = 1500;
  const held = placed(guide);
  assert.equal(held, 148);
  const rawAt = (scrollTop) => scriptureToGuide(owner, scrollTop + readingLine);
  // The regression: the plain reverse map of the held scripture lies far behind the guide, so a 45px
  // downward turn of the scripture would have thrown the guide backward.
  assert.ok(rawAt(held + 45) < guide, "plain map after a downward turn is behind the guide");
  // With the carried offset, the takeover is continuous and the guide moves the same way as the scripture.
  let state = startReverseFollow(guide, rawAt(held));
  const first = followScripture(state, rawAt(held));
  assert.equal(first.guide, guide, "no movement until the scripture moves");
  let previous = guide;
  for (let scrollTop = held + 5; scrollTop <= held + 400; scrollTop += 5) {
    const step = followScripture(state, rawAt(scrollTop));
    const plainMove = rawAt(scrollTop) - rawAt(scrollTop - 5);
    assert.ok(step.guide >= previous, `scripture ${scrollTop}: guide went back to ${step.guide}`);
    // Never faster than the plain mapping toward it, never more than half as slow (catch-up 0.5).
    assert.ok(step.guide - previous <= plainMove + 1e-9 && step.guide - previous >= plainMove / 2 - 1e-9, `scripture ${scrollTop}`);
    previous = step.guide;
    state = step.state;
  }
  // The offset is worked off: well past the held passage, the guide is on the plain mapping again.
  assert.equal(state.bias, 0);
  assert.equal(previous, rawAt(held + 400));
});

test("a carried offset also unwinds when the scripture is driven the other way, without reversing", () => {
  const guide = 1500;
  const held = placed(guide);
  const rawAt = (scrollTop) => scriptureToGuide(owner, scrollTop + readingLine);
  let state = startReverseFollow(guide, rawAt(held));
  const carried = state.bias;
  let previous = guide;
  for (let scrollTop = held - 5; scrollTop >= 0; scrollTop -= 5) {
    const step = followScripture(state, rawAt(scrollTop));
    const plainMove = rawAt(scrollTop) - rawAt(scrollTop + 5);
    // Back toward the chapter opening the guide runs a little faster than the plain map, never the other way.
    assert.ok(step.guide < previous, `scripture ${scrollTop}: guide went forward to ${step.guide}`);
    assert.ok(step.guide - previous >= plainMove * 1.5 - 1e-9, `scripture ${scrollTop}`);
    assert.ok(Math.abs(step.state.bias) <= Math.abs(state.bias), "the offset never grows");
    previous = step.guide;
    state = step.state;
  }
  assert.ok(state.bias > 0 && state.bias < carried / 2, `offset worked down from ${carried} to ${state.bias}`);
  // A takeover with nothing carried (deep links, explicit targets) is the plain mapping from the start.
  const plain = startReverseFollow(rawAt(300), rawAt(300));
  assert.equal(followScripture(plain, rawAt(320)).guide, rawAt(320));
});

test("a layout change during scripture driving re-anchors on the new layout instead of jumping", () => {
  // Take over from the held placement, then turn the scripture down 45px and back up 20px.
  const rawBefore = (scrollTop) => scriptureToGuide(owner, scrollTop + readingLine);
  let state = startReverseFollow(1500, rawBefore(148));
  let guide = 1500;
  for (const scrollTop of [193, 173]) ({ guide, state } = followScripture(state, rawBefore(scrollTop)));
  // The pane grows (a taller window, or a phone's browser chrome), so its reading line moves down: the same
  // scroll offset now maps to a different place in the guide, and the carried offset is meaningless.
  const tallerLine = 500.4 * 0.3;
  const rawAfter = (scrollTop) => scriptureToGuide(owner, scrollTop + tallerLine);
  // The regression: falling back to the plain map, a 1px downward turn throws the guide backward.
  assert.ok(rawAfter(174) < guide - 20, `plain map ${rawAfter(174)} vs guide ${guide}`);
  // Re-anchored where the guide is, against the scripture's current offset on the new layout: the first
  // pixel moves the guide forward, by no more than the plain map's own movement.
  const rebased = startReverseFollow(guide, rawAfter(173));
  const next = followScripture(rebased, rawAfter(174));
  const plainMove = rawAfter(174) - rawAfter(173);
  assert.ok(next.guide > guide, `guide went from ${guide} to ${next.guide}`);
  assert.ok(next.guide - guide <= plainMove + 1e-9 && next.guide - guide >= plainMove / 2 - 1e-9);
  // An upward pixel moves it back instead.
  assert.ok(followScripture(rebased, rawAfter(172)).guide < guide);
});

test("half-verse suffixes are read from printed ranges", () => {
  assert.deepEqual(passageHalves("57:11–13a"), { lastHalf: "a" });
  assert.deepEqual(passageHalves("57:13b–14"), { firstHalf: "b" });
  assert.deepEqual(passageHalves("57:13a"), { firstHalf: "a", lastHalf: "a" });
  assert.deepEqual(passageHalves("53:4"), {});
  assert.deepEqual(passageHalves("40:1–2"), {});
});
