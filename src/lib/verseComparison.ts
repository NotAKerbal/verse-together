export function normalizeCompareText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type TranslationReading = { kind: "text"; text: string } | { kind: "same" } | { kind: "missing" };

export function readTranslationVerse(primaryText: string, compareText: string | undefined): TranslationReading {
  if (compareText === undefined || !compareText.trim()) return { kind: "missing" };
  return normalizeCompareText(compareText) === normalizeCompareText(primaryText)
    ? { kind: "same" }
    : { kind: "text", text: compareText };
}
