import type { CSSProperties } from "react";
import { isMarkColor, type MarkColor } from "../../../convex/annotationRules.ts";

export function isCustomMarkColor(color: string): color is `#${string}` {
  return color.startsWith("#") && isMarkColor(color);
}

export function markHighlightColor(color: MarkColor): string {
  return isCustomMarkColor(color) ? `${color}55` : `var(--verse-mark-${color})`;
}

export function markUnderlineColor(color: MarkColor): string {
  return isCustomMarkColor(color) ? color : `var(--verse-underline-${color})`;
}

/** Named colors keep their theme palettes; custom colors supply only the variables they need. */
export function customMarkStyle(color: MarkColor): CSSProperties | undefined {
  if (!isCustomMarkColor(color)) return undefined;
  return {
    "--mark-highlight": markHighlightColor(color),
    "--mark-swatch": color,
    "--mark-underline": color,
    "--mark-picker-swatch": color,
  } as CSSProperties;
}

export function customVerseStyle(highlight?: MarkColor, underline?: MarkColor): CSSProperties | undefined {
  const background = highlight && isCustomMarkColor(highlight) ? markHighlightColor(highlight) : undefined;
  const rule = underline && isCustomMarkColor(underline) ? underline : undefined;
  return background || rule ? { "--verse-custom-highlight": background, "--verse-underline": rule } as CSSProperties : undefined;
}
