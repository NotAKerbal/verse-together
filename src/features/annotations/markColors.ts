import type { CSSProperties } from "react";
import { MARK_COLORS, isMarkColor, type MarkColor } from "../../../convex/annotationRules.ts";

export function isCustomMarkColor(color: string): color is `#${string}` {
  return color.startsWith("#") && isMarkColor(color);
}

/**
 * Each palette color as a hex value (the light theme's --verse-swatch-* in globals.css), so the custom color
 * picker can open on the color already chosen and adjust from there.
 */
export const MARK_SWATCH_HEX: Record<(typeof MARK_COLORS)[number], `#${string}`> = {
  red: "#e2574c",
  yellow: "#ecc94b",
  blue: "#6ea5e6",
  green: "#4cc58f",
  pink: "#ef7fb8",
  purple: "#a38af2",
};

/** A color as six-digit hex: a custom color as it is, a palette color as its swatch. */
export function markColorHex(color: MarkColor): `#${string}` {
  return isCustomMarkColor(color) ? color : MARK_SWATCH_HEX[color as keyof typeof MARK_SWATCH_HEX] ?? MARK_SWATCH_HEX.red;
}

/**
 * The custom colors among some colors, each once, in the order first seen (so a picker can offer the reader's
 * own colors again: their quick marks', and the ones already on the selection).
 */
export function customMarkColors(colors: Iterable<MarkColor | "none" | null | undefined>): MarkColor[] {
  const out: MarkColor[] = [];
  for (const color of colors) {
    if (color && color !== "none" && isCustomMarkColor(color) && !out.includes(color)) out.push(color);
  }
  return out;
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
