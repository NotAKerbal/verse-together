// The web app's design tokens (src/app/globals.css :root and [data-theme="dark"]), as native values. Names
// follow the CSS custom properties so a token can be traced back to the stylesheet one-to-one.

import { Platform } from "react-native";

export type ThemeColors = {
  background: string;
  paperDot: string;
  foreground: string;
  foregroundMuted: string;
  foregroundSoft: string;
  rule: string;
  ruleStrong: string;
  accentRubric: string;
  accentRubricLine: string;
  surfaceCard: string;
  surfaceCardStrong: string;
  surfaceCardSoft: string;
  surfaceBorder: string;
  surfaceButton: string;
  surfaceButtonHover: string;
  surfaceButtonActive: string;
  surfaceButtonActiveText: string;
  accentPrimary: string;
  accentGoal: string;
  accentSecondary: string;
  accentSky: string;
  accentSkySoft: string;
  accentMint: string;
  readerRead: string;
  accentNote: string;
  accentCoral: string;
  inputSurface: string;
  mobileNavShell: string;
  mobileNavRing: string;
  mobileNavActive: string;
  mobileNavActiveText: string;
  mobileNavIcon: string;
  footnoteHighlight: string;
  footnoteHighlightActive: string;
  /** --verse-mark-* (highlight fills). */
  verseMark: Record<PaletteColor, string>;
  /** --verse-underline-* (underline strokes). */
  verseUnderline: Record<PaletteColor, string>;
  shadow: string;
};

export type PaletteColor = "red" | "yellow" | "blue" | "green" | "pink" | "purple";

export const lightColors: ThemeColors = {
  background: "#f6f3ec",
  paperDot: "#e0d9cb",
  foreground: "#1f1d1a",
  foregroundMuted: "rgba(31, 29, 26, 0.74)",
  foregroundSoft: "rgba(31, 29, 26, 0.58)",
  rule: "#e0d9cb",
  ruleStrong: "#c8bfad",
  accentRubric: "#9a3020",
  accentRubricLine: "rgba(154, 48, 32, 0.4)",
  surfaceCard: "#fbf9f4",
  surfaceCardStrong: "#fffdf9",
  surfaceCardSoft: "#f1ede3",
  surfaceBorder: "#d9d1c1",
  surfaceButton: "#fbf9f4",
  surfaceButtonHover: "#efe9dc",
  surfaceButtonActive: "#1f1d1a",
  surfaceButtonActiveText: "#f6f3ec",
  accentPrimary: "#ecdcae",
  accentGoal: "#947026",
  accentSecondary: "#9a3020",
  accentSky: "#dfe3dd",
  accentSkySoft: "#efe9dc",
  accentMint: "#e4e8d9",
  readerRead: "#6d8070",
  accentNote: "#f2ead6",
  accentCoral: "#e8c6bb",
  inputSurface: "#fffdf9",
  mobileNavShell: "#fbf9f4",
  mobileNavRing: "#d9d1c1",
  mobileNavActive: "#1f1d1a",
  mobileNavActiveText: "#f6f3ec",
  mobileNavIcon: "#46423b",
  footnoteHighlight: "rgba(214, 180, 96, 0.34)",
  footnoteHighlightActive: "rgba(154, 48, 32, 0.16)",
  verseMark: {
    red: "rgba(226, 84, 70, 0.26)",
    yellow: "rgba(240, 200, 64, 0.46)",
    blue: "rgba(110, 165, 230, 0.34)",
    green: "rgba(64, 196, 136, 0.3)",
    pink: "rgba(240, 120, 182, 0.3)",
    purple: "rgba(164, 134, 248, 0.32)",
  },
  verseUnderline: {
    red: "#9a3020",
    yellow: "#c99a06",
    blue: "#2f6fc0",
    green: "#1f8a5a",
    pink: "#c93d86",
    purple: "#7650d8",
  },
  shadow: "rgba(31, 29, 26, 0.35)",
};

export const darkColors: ThemeColors = {
  background: "#181715",
  paperDot: "#33302b",
  foreground: "#ebe6db",
  foregroundMuted: "rgba(235, 230, 219, 0.76)",
  foregroundSoft: "rgba(235, 230, 219, 0.58)",
  rule: "#33302b",
  ruleStrong: "#4a463e",
  accentRubric: "#e3907a",
  accentRubricLine: "rgba(227, 144, 122, 0.45)",
  surfaceCard: "#201f1c",
  surfaceCardStrong: "#25231f",
  surfaceCardSoft: "#2a2824",
  surfaceBorder: "#3d3a34",
  surfaceButton: "#201f1c",
  surfaceButtonHover: "#2e2b26",
  surfaceButtonActive: "#ebe6db",
  surfaceButtonActiveText: "#181715",
  accentPrimary: "#c9ad6a",
  accentGoal: "#c9ad6a",
  accentSecondary: "#e3907a",
  accentSky: "#2c3331",
  accentSkySoft: "#26241f",
  accentMint: "#2a2e25",
  readerRead: "#9bae9d",
  accentNote: "#2c281d",
  accentCoral: "#4a2c24",
  inputSurface: "#201f1c",
  mobileNavShell: "#201f1c",
  mobileNavRing: "#3d3a34",
  mobileNavActive: "#ebe6db",
  mobileNavActiveText: "#181715",
  mobileNavIcon: "#cdc6b8",
  footnoteHighlight: "rgba(201, 173, 106, 0.28)",
  footnoteHighlightActive: "rgba(227, 144, 122, 0.28)",
  verseMark: {
    red: "rgba(226, 96, 80, 0.32)",
    yellow: "rgba(214, 178, 56, 0.34)",
    blue: "rgba(96, 150, 220, 0.34)",
    green: "rgba(52, 186, 128, 0.3)",
    pink: "rgba(232, 104, 166, 0.32)",
    purple: "rgba(156, 126, 244, 0.36)",
  },
  verseUnderline: {
    red: "#e3907a",
    yellow: "#e6c14d",
    blue: "#7fb0ee",
    green: "#5fd09c",
    pink: "#f08cc0",
    purple: "#b29df6",
  },
  shadow: "rgba(0, 0, 0, 0.8)",
};

/** --verse-swatch-* : opaque palette colors for pickers. */
export const SWATCH: Record<PaletteColor, string> = {
  red: "#e2574c",
  yellow: "#ecc94b",
  blue: "#6ea5e6",
  green: "#4cc58f",
  pink: "#ef7fb8",
  purple: "#a38af2",
};

/**
 * Fonts. The web sets labels and controls in DM Sans and titles and scripture in a book serif stack
 * ("Iowan Old Style", Palatino, …, serif). iOS ships Iowan Old Style; Android has none of the stack's named
 * faces, so Chrome on Android falls through to the system serif, as this does.
 */
export const fonts = {
  sans: "DMSans_400Regular",
  sansMedium: "DMSans_500Medium",
  sansSemiBold: "DMSans_600SemiBold",
  sansBold: "DMSans_700Bold",
  serif: Platform.select({ ios: "Iowan Old Style", default: "serif" }) as string,
  serifItalic: Platform.select({ ios: "IowanOldStyle-Italic", default: "serif" }) as string,
  serifBold: Platform.select({ ios: "IowanOldStyle-Bold", default: "serif" }) as string,
  mono: Platform.select({ ios: "Menlo", default: "monospace" }) as string,
};

/** 1rem in the web stylesheet. */
export const REM = 16;

/** Corner radii the stylesheet uses (.rounded-lg 0.6rem, cards, pills). */
export const radii = { sm: 6.4, md: 8, lg: 9.6, xl: 11.2, card: 12, featured: 14, pill: 999 };
