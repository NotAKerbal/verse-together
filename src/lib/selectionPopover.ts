type Rect = { top: number; bottom: number; left: number; width: number };

/** Keep the selection card inside the reader's usable viewport, clear of navigation. */
export function positionSelectionPopover(
  anchor: Rect,
  popover: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const margin = 12;
  const gap = 12;
  const safeTop = viewport.width < 640 ? 88 : 80;
  const safeBottom = viewport.width < 640 ? 100 : 20;
  const maxTop = Math.max(safeTop, viewport.height - safeBottom - popover.height);
  const center = anchor.left + anchor.width / 2;
  const left = Math.max(margin, Math.min(center - popover.width / 2, viewport.width - popover.width - margin));
  const above = anchor.top - popover.height - gap;
  const below = anchor.bottom + gap;
  const spaceAbove = anchor.top - safeTop;
  const spaceBelow = viewport.height - safeBottom - anchor.bottom;
  const placement = above >= safeTop ? "top" : below <= maxTop ? "bottom" : spaceAbove > spaceBelow ? "top" : "bottom";
  const top = Math.max(safeTop, Math.min(placement === "top" ? above : below, maxTop));

  return {
    top,
    left,
    placement,
    pointerLeft: Math.max(24, Math.min(center - left, popover.width - 24)),
    overlapsSelection: top < anchor.bottom && top + popover.height > anchor.top,
  };
}
