// Phone layout of the study companion: two full-width sides in a native horizontal scroll-snap strip.

export type CompanionSide = "guide" | "scripture";

/** Left-to-right order of the sides on phones: the guide first, its chapter one swipe away. */
export const MOBILE_SIDE_ORDER: readonly CompanionSide[] = ["guide", "scripture"];

/**
 * The side a strip scrolled to `scrollLeft` is showing: whichever side covers more of the strip, so the
 * label flips at the halfway point of a swipe. RTL strips report negative offsets; a strip with no width
 * yet (before layout) is on the first side.
 */
export function sideAtScroll(scrollLeft: number, width: number): CompanionSide {
  if (!(width > 0)) return MOBILE_SIDE_ORDER[0];
  const index = Math.round(Math.abs(scrollLeft) / width);
  return MOBILE_SIDE_ORDER[Math.min(MOBILE_SIDE_ORDER.length - 1, Math.max(0, index))];
}
