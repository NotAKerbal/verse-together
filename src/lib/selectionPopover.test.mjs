import assert from "node:assert/strict";
import test from "node:test";
import { positionSelectionPopover } from "./selectionPopover.ts";

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
