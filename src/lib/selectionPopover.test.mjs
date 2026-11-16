import assert from "node:assert/strict";
import test from "node:test";
import { positionSelectionPopover, selectionAnchorRect } from "./selectionPopover.ts";

const card = { width: 440, height: 270 };
const desktop = { width: 1280, height: 800 };

test("prefers clear space above a selection and points at its center", () => {
  const position = positionSelectionPopover({ top: 450, bottom: 510, left: 400, width: 200 }, card, desktop);
  assert.equal(position.placement, "top");
  assert.equal(position.top + card.height, 438);
  assert.equal(position.left + position.pointerLeft, 500);
  assert.equal(position.overlapsSelection, false);
});

test("moves below selections near the reader navigation", () => {
  const position = positionSelectionPopover({ top: 95, bottom: 140, left: 0, width: 100 }, card, desktop);
  assert.equal(position.placement, "bottom");
  assert.equal(position.top, 152);
  assert.equal(position.left, 12);
  assert.equal(position.overlapsSelection, false);
});

test("clamps horizontally at both edges and keeps the pointer on the card", () => {
  for (const left of [-100, 0, 1200, 1500]) {
    const position = positionSelectionPopover({ top: 500, bottom: 530, left, width: 20 }, card, desktop);
    assert.ok(position.left >= 12);
    assert.ok(position.left + card.width <= desktop.width - 12);
    assert.ok(position.pointerLeft >= 24 && position.pointerLeft <= card.width - 24);
  }
});

test("reserves space for mobile navigation", () => {
  const viewport = { width: 390, height: 844 };
  const mobileCard = { width: 366, height: 270 };
  const position = positionSelectionPopover({ top: 650, bottom: 700, left: 20, width: 350 }, mobileCard, viewport);
  assert.equal(position.placement, "top");
  assert.ok(position.top >= 88);
  assert.ok(position.top + mobileCard.height <= viewport.height - 100);
  assert.equal(position.left, 12);
});

test("keeps a large selection's menu onscreen and suppresses a misleading pointer", () => {
  const position = positionSelectionPopover({ top: 90, bottom: 760, left: 20, width: 1200 }, card, desktop);
  assert.ok(position.top >= 80);
  assert.ok(position.top + card.height <= desktop.height - 20);
  assert.equal(position.overlapsSelection, true);
});

test("anchors to every line of a selection, not just its first", () => {
  const line = (top, left, right) => ({ top, bottom: top + 26, left, right, width: right - left, height: 26 });
  const anchor = selectionAnchorRect([line(280, 40, 360), { top: 300, bottom: 300, left: 0, right: 0, width: 0, height: 0 }, line(306, 18, 372), line(332, 18, 120)]);
  assert.deepEqual(anchor, { top: 280, left: 18, right: 372, bottom: 358, width: 354, height: 78 });
  const position = positionSelectionPopover(anchor, { width: 366, height: 240 }, { width: 390, height: 844 });
  assert.equal(position.placement, "bottom");
  assert.ok(position.top >= anchor.bottom);
  assert.equal(position.overlapsSelection, false);
});

test("has no anchor for a selection without visible lines", () => {
  assert.equal(selectionAnchorRect([]), null);
  assert.equal(selectionAnchorRect([{ top: 5, bottom: 5, left: 5, right: 5, width: 0, height: 0 }]), null);
});
