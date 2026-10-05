import assert from "node:assert/strict";
import test from "node:test";
import { isDocked, paneScrolling, paneTakesWheel, redockScroll, trailingPull } from "./readerDock.ts";

/**
 * A page whose reader starts at `readerTopDoc` (document offset), is `readerHeight` tall, and is followed
 * by `trailing` pixels of layout (padding for the bottom navigation and the like).
 */
function page({ readerTopDoc, readerHeight, trailing, viewport }) {
  const readerBottom = readerTopDoc + readerHeight;
  let pull = 0;
  const documentHeight = () => Math.max(viewport, readerBottom + trailing - pull);
  // Measure twice, as the component does on its first pass and on the ResizeObserver pass after it.
  for (let i = 0; i < 2; i += 1) pull = trailingPull({ documentHeight: documentHeight(), readerBottom, currentPull: pull });
  const maxScroll = documentHeight() - viewport;
  return { pull, maxScroll, readerTopAt: (scrollTop) => readerTopDoc - scrollTop };
}

test("the page's own scroll limit is the docked position, on phones and under a tablet header", () => {
  for (const { chromeTop, trailing } of [
    { chromeTop: 0, trailing: 208 }, // phone: no header; main and app-body pad for the bottom navigation
    { chromeTop: 76, trailing: 40 }, // tablet: sticky header, lighter padding
    { chromeTop: 0, trailing: 0 }, // nothing after the reader at all
  ]) {
    const viewport = 760;
    const p = page({ readerTopDoc: 900, readerHeight: viewport - chromeTop, trailing, viewport });
    assert.equal(p.pull, trailing, "everything after the reader is pulled up");
    assert.equal(p.readerTopAt(p.maxScroll), chromeTop, "at the page's end the reader sits exactly at the dock line");
    assert.ok(isDocked({ readerTop: p.readerTopAt(p.maxScroll), dockTop: chromeTop, scrollTop: p.maxScroll, maxScroll: p.maxScroll }));
  }
});

test("the pull settles at once: measuring again after applying it changes nothing", () => {
  const readerBottom = 1660;
  let pull = trailingPull({ documentHeight: readerBottom + 208, readerBottom, currentPull: 0 });
  assert.equal(pull, 208);
  for (let i = 0; i < 5; i += 1) {
    pull = trailingPull({ documentHeight: readerBottom + 208 - pull, readerBottom, currentPull: pull });
    assert.equal(pull, 208);
  }
  // Content after the reader grows (say the footer moves back below it): the pull follows, never negative.
  assert.equal(trailingPull({ documentHeight: readerBottom + 300 - 208, readerBottom, currentPull: 208 }), 300);
  assert.equal(trailingPull({ documentHeight: readerBottom - 50, readerBottom, currentPull: 0 }), 0);
});

test("scrolling the page down and back flips the panes exactly once each way, at the dock line", () => {
  const viewport = 760;
  const chromeTop = 0;
  const p = page({ readerTopDoc: 900, readerHeight: viewport - chromeTop, trailing: 208, viewport });
  const sweep = [];
  for (let y = 0; y <= p.maxScroll; y += 7) sweep.push(y);
  sweep.push(p.maxScroll);
  for (let y = p.maxScroll; y >= 0; y -= 11) sweep.push(y);
  let flips = 0;
  let previous = null;
  for (const scrollTop of sweep) {
    const docked = isDocked({ readerTop: p.readerTopAt(scrollTop), dockTop: chromeTop, scrollTop, maxScroll: p.maxScroll });
    const panes = paneScrolling("strip", docked);
    assert.equal(panes.guide, docked);
    assert.equal(panes.scripture, docked);
    if (previous !== null && previous !== docked) flips += 1;
    previous = docked;
    // Partly visible means not docked: nothing inside the reader may take the gesture.
    if (p.readerTopAt(scrollTop) > chromeTop + 2) assert.equal(docked, false, `at ${scrollTop}`);
  }
  assert.equal(flips, 2, "one dock on the way down, one undock on the way back");
});

test("docking tolerates rounding and a mobile URL bar resizing the viewport", () => {
  assert.equal(isDocked({ readerTop: 0.6, dockTop: 0, scrollTop: 500, maxScroll: 900 }), true, "sub-pixel rounding");
  assert.equal(isDocked({ readerTop: 3, dockTop: 0, scrollTop: 500, maxScroll: 900 }), false, "visibly short of the dock");
  // The URL bar collapsed after the last measurement: the reader rests 56px low, but the page is at its end.
  assert.equal(isDocked({ readerTop: 56, dockTop: 0, scrollTop: 900, maxScroll: 900 }), true);
  // Desktop: the sticky scripture column has stuck under the header and switch row.
  assert.equal(isDocked({ readerTop: 128, dockTop: 76 + 52, scrollTop: 2400, maxScroll: 40000 }), true);
  assert.equal(isDocked({ readerTop: 300, dockTop: 76 + 52, scrollTop: 100, maxScroll: 40000 }), false);
});

test("a docked reader is put back after the viewport grows; an undocked one is left alone", () => {
  // The reported case at 393px wide: the reader starts 427px down the page and is docked at 852px tall.
  const readerTopDoc = 427;
  const layout = (viewport, scrollTop) => {
    const p = page({ readerTopDoc, readerHeight: viewport, trailing: 208, viewport });
    return { ...p, scrollTop, readerTop: p.readerTopAt(scrollTop) };
  };
  let now = layout(852, 427);
  assert.equal(now.readerTop, 0);
  // Shrink to 330 (URL bar, keyboard): re-measured, still docked, nothing to move.
  now = layout(330, 427);
  assert.equal(redockScroll({ wasDocked: true, readerTop: now.readerTop, dockTop: 0, scrollTop: 427, maxScroll: now.maxScroll }), null);
  // Grow back to 852: the old 330px reader made the document shorter than the new viewport, so the browser
  // clamped the page to the top before the reader could grow, stranding the toolbar 427px down.
  const clampedTop = 0;
  now = layout(852, clampedTop);
  assert.equal(now.readerTop, 427);
  const target = redockScroll({ wasDocked: true, readerTop: now.readerTop, dockTop: 0, scrollTop: clampedTop, maxScroll: now.maxScroll });
  assert.equal(target, 427);
  assert.equal(now.readerTopAt(target), 0, "the toolbar is back at the top");
  assert.ok(isDocked({ readerTop: now.readerTopAt(target), dockTop: 0, scrollTop: target, maxScroll: now.maxScroll }));
  // A reader that was only partly scrolled into view when the viewport changed does not move the page.
  assert.equal(redockScroll({ wasDocked: false, readerTop: 427, dockTop: 0, scrollTop: 0, maxScroll: 427 }), null);
  // Never past what the page can scroll to.
  assert.equal(redockScroll({ wasDocked: true, readerTop: 900, dockTop: 0, scrollTop: 0, maxScroll: 427 }), 427);
});

test("which panes may scroll in each layout", () => {
  assert.deepEqual(paneScrolling("guide", true), { guide: false, scripture: false });
  assert.deepEqual(paneScrolling("columns", false), { guide: false, scripture: false });
  assert.deepEqual(paneScrolling("columns", true), { guide: false, scripture: true }, "the desktop guide is the page itself");
  assert.deepEqual(paneScrolling("strip", false), { guide: false, scripture: false });
  assert.deepEqual(paneScrolling("strip", true), { guide: true, scripture: true });
});

test("a wheel turn over a pane belongs to the pane only if the pane will move", () => {
  const pane = { scrollTop: 400, clientHeight: 600, scrollHeight: 5000, scrollable: true };
  assert.equal(paneTakesWheel(pane, 120), true);
  assert.equal(paneTakesWheel(pane, -120), true);
  assert.equal(paneTakesWheel({ ...pane, scrollable: false }, 120), false, "not docked yet: the page moves");
  assert.equal(paneTakesWheel({ ...pane, scrollTop: 0 }, -120), false, "at the top, scrolling up chains to the page");
  assert.equal(paneTakesWheel({ ...pane, scrollTop: 4400 }, 120), false, "at the bottom, scrolling down chains to the page");
  assert.equal(paneTakesWheel(pane, 0), false);
});
