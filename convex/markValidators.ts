import { v, type VString } from "convex/values";
import type { MarkColor } from "./annotationRules";

// Validators for verse marks and mark presets, shared by the schema and the functions that take them
// (the rules themselves: convex/annotationRules.ts).

/** Convex has no regex validator; mutation rules check palette names or lowercase six-digit hex. */
export const markColorValidator = v.string() as VString<MarkColor>;

/**
 * One quick button in the selection menu: a highlight or an underline, in one color, optionally named (up to
 * MARK_PRESET_NAME_MAX characters once normalized; saveMarkPresets checks).
 */
export const markPresetValidator = v.object({
  kind: v.union(v.literal("highlight"), v.literal("underline")),
  color: markColorValidator,
  name: v.optional(v.string()),
});

/** The earlier quick-mark choice (highlight colors shown, and one uncolored underline), read only to carry it over. */
export const legacyQuickMarkValidator = v.union(
  v.literal("yellow"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("pink"),
  v.literal("purple"),
  v.literal("underline")
);

export const verseTextMarkValidator = v.object({
  start: v.number(), end: v.number(), text: v.string(),
  kind: v.union(v.literal("highlight"), v.literal("underline")), color: markColorValidator,
});
export const verseTextRangeValidator = v.object({
  verse: v.number(), start: v.number(), end: v.number(), text: v.string(),
});
