// How a verse's marks look natively: .verse-mark in globals.css tints the words' background for a highlight and
// draws an underline in its own color (ScriptureText draws both on the exact words). Custom (#rrggbb) colors are
// tinted as markColors.ts does (`${color}55`).

import type { MarkColor, MarkPreset } from "../../shared/web";
import { SWATCH, type PaletteColor, type ThemeColors } from "../../theme/tokens";

const PALETTE = ["red", "yellow", "blue", "green", "pink", "purple"];

function isPalette(color: string): color is PaletteColor {
  return PALETTE.includes(color);
}

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function highlightFill(colors: ThemeColors, color: MarkColor): string {
  return isPalette(color) ? colors.verseMark[color] : hexToRgba(color, 0x55 / 255);
}

export function underlineStroke(colors: ThemeColors, color: MarkColor): string {
  return isPalette(color) ? colors.verseUnderline[color] : color;
}

/** An opaque swatch for pickers (--verse-swatch-*), or the custom color itself. */
export function swatch(color: MarkColor): string {
  return isPalette(color) ? SWATCH[color] : color;
}

export function presetAccessibilityLabel(preset: MarkPreset, label: string, state: boolean | "mixed") {
  return state === true ? `Remove ${label.toLowerCase()}` : label;
}
