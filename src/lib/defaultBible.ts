/** Device preference shared by Settings and server-rendered Bible chapters. */
export const DEFAULT_BIBLE_COOKIE = "vt-default-bible-v1";
export const LDS_BIBLE_ID = "lds";

/** Accept provider IDs, preserving their case; invalid or empty values use the bundled Bible. */
export function normalizeDefaultBible(value: unknown): string {
  if (typeof value !== "string") return LDS_BIBLE_ID;
  const id = value.trim();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return LDS_BIBLE_ID;
  return ["lds", "kjv"].includes(id.toLowerCase()) ? id.toLowerCase() : id;
}

export function defaultBibleNotice(requested: string, actual: string | undefined): string | undefined {
  if (requested.toLowerCase() === (actual ?? LDS_BIBLE_ID).toLowerCase()) return undefined;
  return "Your default Bible couldn’t load this chapter. Showing " +
    (actual === "lds" || !actual ? "King James Bible (LDS edition)" : actual.toUpperCase()) + " instead.";
}
