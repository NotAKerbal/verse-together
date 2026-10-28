/** Explore acts on one selected word, allowing punctuation around it. */
export function extractSingleSelectedWord(value: string): string {
  const matches = value.match(/[A-Za-z][A-Za-z'\-]*/g) ?? [];
  return matches.length === 1 ? matches[0].toLowerCase() : "";
}
