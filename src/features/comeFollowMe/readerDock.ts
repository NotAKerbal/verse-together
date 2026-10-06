// Docking the scripture reader into the page so the two feel like one scroll.
//
// The page (window) is the only scroller until the reader is docked: its toolbar at the top of the
// usable viewport (under the app header where one shows). Only then may the reader's own panes scroll.
// So a gesture that begins over a partly visible reader moves the page first, and the page itself stops
// exactly at the docked position. Scrolling back past the top of a pane chains natively to the page,
// which undocks the reader again. Nothing here cancels or synthesizes scrolling: it only decides which
// elements are allowed to be scrollers and how tall the reader is.

export type ReaderMode = "guide" | "columns" | "strip";

/**
 * Which panes may scroll by themselves right now.
 * - guide: the guide is ordinary page content; the scripture is not shown.
 * - columns (desktop): the guide stays page content; the sticky scripture column scrolls once it is stuck.
 * - strip (phones): both sides are their own scrollers, but only while the reader is docked.
 */
export function paneScrolling(mode: ReaderMode, docked: boolean): { guide: boolean; scripture: boolean } {
  if (mode === "columns") return { guide: false, scripture: docked };
  if (mode === "strip") return { guide: docked, scripture: docked };
  return { guide: false, scripture: false };
}

/**
 * Whether the reader is docked: its top has reached the dock line, or the page cannot scroll any further
 * (which is where the reader rests once it fills the remaining viewport). The page-end test absorbs
 * sub-pixel rounding and a mobile URL bar changing the viewport height between measurements.
 */
export function isDocked(
  geometry: { readerTop: number; dockTop: number; scrollTop: number; maxScroll: number },
  tolerance = 2
): boolean {
  return geometry.readerTop <= geometry.dockTop + tolerance || geometry.scrollTop >= geometry.maxScroll - tolerance;
}

/**
 * How far to pull up whatever follows the reader (layout padding for the bottom navigation, and the
 * like), so the page ends exactly at the reader's bottom edge. Then the page's own maximum scroll is the
 * docked position, and a fling cannot carry the reader past it. Returns a non-negative pull in pixels;
 * the reader gets `margin-bottom: -pull`. Applying the result and measuring again returns the same pull.
 */
export function trailingPull(geometry: { documentHeight: number; readerBottom: number; currentPull: number }): number {
  const trailing = geometry.documentHeight - geometry.readerBottom + geometry.currentPull;
  return Math.max(0, Math.round(trailing));
}

/**
 * Where to scroll the page after a viewport change, given a fresh measurement: back to the dock for a
 * reader that was docked before the change (the browser may have clamped the page while the reader still
 * had its old size), nowhere (null) for a reader that was not docked or is already in place.
 */
export function redockScroll(geometry: {
  wasDocked: boolean;
  readerTop: number;
  dockTop: number;
  scrollTop: number;
  maxScroll: number;
}): number | null {
  if (!geometry.wasDocked) return null;
  const offset = geometry.readerTop - geometry.dockTop;
  if (Math.abs(offset) <= 1) return null;
  return Math.min(Math.max(0, geometry.scrollTop + offset), Math.max(0, geometry.maxScroll));
}

/**
 * Whether a wheel turn over a pane will scroll that pane (rather than chain to the page). A pane that
 * may not scroll yet, or is already at its end in that direction, passes the movement to the page.
 */
export function paneTakesWheel(
  pane: { scrollTop: number; clientHeight: number; scrollHeight: number; scrollable: boolean },
  deltaY: number
): boolean {
  if (!pane.scrollable || deltaY === 0) return false;
  if (deltaY < 0) return pane.scrollTop > 0.5;
  return pane.scrollTop + pane.clientHeight < pane.scrollHeight - 0.5;
}
