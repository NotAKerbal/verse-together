import { normalizeScriptureVolume } from "./scriptureVolumes.ts";

/** Original symbolic scenery; prompts and provenance live in docs/scripture-book-art.md. */
export function getScriptureBookArt(volume: string, book: string): string {
  const canonical = normalizeScriptureVolume(volume);
  if (canonical === "doctrineandcovenants") return "/art/browse-doctrineandcovenants.webp";
  return `/art/books/${canonical}-${book}.webp`;
}
