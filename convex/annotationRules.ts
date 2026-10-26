// Pure rules for a verse annotation and a study-guide highlight, shared by the Convex mutations and the
// client code that calls them.

export const ANNOTATION_BODY_MAX = 1200;

export function normalizeAnnotationBody(body: string): string {
  return body.trim().replace(/\s+/g, " ");
}

/**
 * Why an annotation can't be saved, or null if it can. An annotation is any mix of a note, a highlight,
 * and an underline: a mark needs no note text, and nothing is stored in place of one.
 */
export function annotationProblem(
  body: string,
  highlightColor: string | null | undefined,
  underline: boolean | null | undefined = false
): string | null {
  const normalized = normalizeAnnotationBody(body);
  if (normalized.length > ANNOTATION_BODY_MAX) return "Annotation text is too long";
  if (!normalized && !highlightColor && underline !== true) return "Add a note, a highlight, or an underline";
  return null;
}

/**
 * The colors a verse or a span of study-guide prose can be marked in, highlight or underline alike, in palette
 * order. Red is the rubric underline every underline had before underlines had colors.
 */
export const MARK_COLORS = ["red", "yellow", "blue", "green", "pink", "purple"] as const;
export type MarkColor = (typeof MARK_COLORS)[number];
/** @deprecated The verse mark palette is MarkColor; kept for callers that name the old type. */
export type VerseHighlightColor = MarkColor;

/** An underline saved without a color (before underlines had colors) is the rubric red. */
export const DEFAULT_UNDERLINE_COLOR: MarkColor = "red";

export function isMarkColor(value: unknown): value is MarkColor {
  return typeof value === "string" && (MARK_COLORS as readonly string[]).includes(value);
}

/** The longest chapter (Psalm 119) has 176 verses; one quick-mark change never needs more. */
export const VERSE_MARKS_MAX_VERSES = 200;

/**
 * A quick change to the marks on some verses, leaving everything else as it is. An omitted field is left
 * alone, and a note's text is never part of it, so a quick mark can't overwrite a note written elsewhere.
 *  - highlightColor: a color, or null to remove the highlight.
 *  - underlineColor: underline in this color (adding the underline, or changing its color).
 *  - underline: false removes the underline. true (from callers before underlines had colors) adds one,
 *    keeping a saved underline's color, or red.
 */
export type VerseMarksPatch = {
  highlightColor?: MarkColor | null;
  underline?: boolean;
  underlineColor?: MarkColor;
};

/** Why a change to a verse's underline contradicts itself, or null if it doesn't. */
export function underlineProblem(patch: Pick<VerseMarksPatch, "underline" | "underlineColor">): string | null {
  if (patch.underline === false && patch.underlineColor !== undefined) return "An underline that is off has no color";
  return null;
}

/** Why a quick-mark change can't be applied, or null if it can. */
export function verseMarksProblem(verses: readonly number[], patch: VerseMarksPatch): string | null {
  if (patch.highlightColor === undefined && patch.underline === undefined && patch.underlineColor === undefined) {
    return "Choose a highlight or an underline";
  }
  const underline = underlineProblem(patch);
  if (underline) return underline;
  if (verses.length === 0) return "Select a verse to mark";
  if (verses.length > VERSE_MARKS_MAX_VERSES) return "Select fewer verses to mark";
  if (!verses.every((verse) => Number.isInteger(verse) && verse >= 1 && verse <= 1000)) return "Unknown verse";
  return null;
}

/** A saved verse's underline color, or null when it isn't underlined (an uncolored underline is red). */
export function savedUnderlineColor(existing: { underline?: boolean | null; underlineColor?: MarkColor | null } | null | undefined): MarkColor | null {
  if (existing?.underline !== true) return null;
  return existing.underlineColor ?? DEFAULT_UNDERLINE_COLOR;
}

/**
 * The underline a verse has after a change: off, on in a new color, or as it was (an omitted field keeps the
 * saved underline and its color). Returns the underline's color, or null for none.
 */
export function nextUnderlineColor(
  existing: { underline?: boolean | null; underlineColor?: MarkColor | null } | null | undefined,
  patch: Pick<VerseMarksPatch, "underline" | "underlineColor">
): MarkColor | null {
  if (patch.underline === false) return null;
  if (patch.underlineColor !== undefined) return patch.underlineColor;
  const saved = savedUnderlineColor(existing);
  if (patch.underline === true) return saved ?? DEFAULT_UNDERLINE_COLOR;
  return saved;
}

/**
 * One verse's annotation after a quick-mark change: its highlight and underline (and the underline's color,
 * set only while it is underlined), and whether anything is left to keep (its note, or a mark). The note
 * itself is passed through untouched.
 */
export function applyVerseMarks(
  existing: {
    body: string;
    highlightColor?: MarkColor | null;
    underline?: boolean | null;
    underlineColor?: MarkColor | null;
  } | null,
  patch: VerseMarksPatch
): { highlightColor: MarkColor | undefined; underline: boolean; underlineColor: MarkColor | undefined; keep: boolean } {
  const highlightColor =
    patch.highlightColor === undefined ? existing?.highlightColor ?? undefined : patch.highlightColor ?? undefined;
  const underlineColor = nextUnderlineColor(existing, patch) ?? undefined;
  const underline = underlineColor !== undefined;
  const keep = !!normalizeAnnotationBody(existing?.body ?? "") || !!highlightColor || underline;
  return { highlightColor, underline, underlineColor, keep };
}

/*
  Mark presets: the quick buttons across the top of the reader's selection menu, chosen in account settings.
  Each pairs a kind (a highlight or an underline) with a color, so a reader can keep, say, a red underline,
  a yellow highlight, and a blue highlight one tap away. The list is ordered (the menu shows it in order),
  holds each pair at most once, and may be empty (the menu's Annotate action still has every option).
  A preset may also have a name ("Blessings", "Commandments") describing what the reader marks with it; the
  pair is still its identity, so a name never makes a second preset of the same pair.
*/

export const MARK_KINDS = ["highlight", "underline"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
/** name: absent when unnamed (the defaults, and every preset from before names), never empty. */
export type MarkPreset = { kind: MarkKind; color: MarkColor; name?: string };

/** Every kind-and-color pair once. */
export const MARK_PRESETS_MAX = MARK_KINDS.length * MARK_COLORS.length;

/** A preset name is a short label, shown on its button beside the mark. */
export const MARK_PRESET_NAME_MAX = 40;

/** What a reader who never chose sees: the highlight colors there have always been, and the rubric underline. */
export const DEFAULT_MARK_PRESETS: readonly MarkPreset[] = [
  { kind: "highlight", color: "yellow" },
  { kind: "highlight", color: "blue" },
  { kind: "highlight", color: "green" },
  { kind: "highlight", color: "pink" },
  { kind: "highlight", color: "purple" },
  { kind: "underline", color: "red" },
];

export function markPresetKey(preset: Pick<MarkPreset, "kind" | "color">): string {
  return `${preset.kind}:${preset.color}`;
}

/** The same mark (kind and color), whatever either is named: a list holds each mark once. */
export function sameMarkPreset(a: Pick<MarkPreset, "kind" | "color">, b: Pick<MarkPreset, "kind" | "color">): boolean {
  return a.kind === b.kind && a.color === b.color;
}

/** The same mark and the same name: a rename is a change to save. */
export function sameNamedMarkPreset(a: MarkPreset, b: MarkPreset): boolean {
  return sameMarkPreset(a, b) && (a.name || undefined) === (b.name || undefined);
}

/**
 * A preset name as it is stored: trimmed, each run of whitespace (or control characters) one space. Empty,
 * or not a string, is no name (undefined). The length is not checked here (markPresetsProblem does).
 */
export function normalizeMarkPresetName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  return name || undefined;
}

/** Why a sent list of presets can't be saved, or null if it can (repeated pairs are fine: they are dropped). */
export function markPresetsProblem(presets: readonly MarkPreset[]): string | null {
  if (presets.length > MARK_PRESETS_MAX) return `Choose up to ${MARK_PRESETS_MAX} quick marks`;
  if (presets.some((preset) => (normalizeMarkPresetName(preset.name)?.length ?? 0) > MARK_PRESET_NAME_MAX)) {
    return `Keep each quick mark name to ${MARK_PRESET_NAME_MAX} characters`;
  }
  return null;
}

function isMarkPreset(value: unknown): value is MarkPreset {
  if (!value || typeof value !== "object") return false;
  const { kind, color } = value as { kind?: unknown; color?: unknown };
  return (kind === "highlight" || kind === "underline") && isMarkColor(color);
}

/** One preset, cleaned: its kind, its color, and its name if it has one (an overlong one cut to fit). */
export function normalizeMarkPreset(preset: MarkPreset): MarkPreset {
  const name = normalizeMarkPresetName(preset.name)?.slice(0, MARK_PRESET_NAME_MAX).trim();
  return name ? { kind: preset.kind, color: preset.color, name } : { kind: preset.kind, color: preset.color };
}

/**
 * A sent or stored list of presets, cleaned: in its own order, unknown entries dropped, each pair once (its
 * first place, with that entry's name), at most MARK_PRESETS_MAX. Null when there is no list at all (the
 * reader never chose).
 */
export function normalizeMarkPresets(value: unknown): MarkPreset[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const out: MarkPreset[] = [];
  for (const item of value) {
    if (!isMarkPreset(item)) continue;
    const preset = normalizeMarkPreset(item);
    const key = markPresetKey(preset);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(preset);
    if (out.length === MARK_PRESETS_MAX) break;
  }
  return out;
}

/**
 * The buttons of the earlier quick-mark choice (each highlight color shown or hidden, and one uncolored
 * underline), as presets: the same buttons, the underline as the rubric red it always was.
 */
export const LEGACY_QUICK_MARK_BUTTONS = ["yellow", "blue", "green", "pink", "purple", "underline"] as const;

export function presetsFromLegacyQuickMarks(value: unknown): MarkPreset[] | null {
  if (!Array.isArray(value)) return null;
  return LEGACY_QUICK_MARK_BUTTONS.filter((button) => value.includes(button)).map((button) =>
    button === "underline" ? { kind: "underline", color: DEFAULT_UNDERLINE_COLOR } : { kind: "highlight", color: button }
  );
}

/**
 * A reader's presets from what is saved: their list (an empty one stays empty), else their earlier quick-mark
 * choice carried over, else the defaults.
 */
export function readMarkPresets(saved: { markPresets?: unknown; quickMarks?: unknown } | null | undefined): MarkPreset[] {
  return (
    normalizeMarkPresets(saved?.markPresets) ??
    presetsFromLegacyQuickMarks(saved?.quickMarks) ??
    DEFAULT_MARK_PRESETS.map((preset) => ({ ...preset }))
  );
}

/*
  Study-guide highlights: a span of a Come, Follow Me guide's prose, which verse annotations can't describe.
  A guide is its week's start date. Its prose is two parts (the introduction and the paired reader's guide
  side), each one text: the data of its text nodes in document order. A point in a part is a block anchor
  (the id of the nearest element with an id that starts at or before it; "" for the part's start) plus a
  text offset from that block's start. The highlighted text itself (exact) and a little text either side
  (prefix, suffix) let the client find the span again when the text around it shifts, and refuse it when
  it is ambiguous or gone.
*/

export const GUIDE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Element ids usable as block anchors (the guide parser's heading and lead ids all are). */
export const GUIDE_BLOCK_PATTERN = /^[A-Za-z0-9_-]{0,120}$/;
export const GUIDE_QUOTE_MAX = 4000;
/** Context kept on each side of a quote; the server accepts up to twice what the client stores. */
export const GUIDE_CONTEXT_LENGTH = 32;
export const GUIDE_OFFSET_MAX = 2_000_000;
export const GUIDE_HIGHLIGHTS_PER_GUIDE = 1000;

export type GuidePart = "introduction" | "reader";

export type GuideAnchorFields = {
  part: GuidePart;
  startBlock: string;
  startOffset: number;
  endBlock: string;
  endOffset: number;
  exact: string;
  prefix: string;
  suffix: string;
};

function validOffset(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= GUIDE_OFFSET_MAX;
}

/** Why a guide highlight's identity and anchor can't be stored, or null if they can. */
export function guideHighlightProblem(input: GuideAnchorFields & { guide: string }): string | null {
  if (!GUIDE_KEY_PATTERN.test(input.guide)) return "Unknown guide";
  if (input.part !== "introduction" && input.part !== "reader") return "Unknown guide part";
  if (!GUIDE_BLOCK_PATTERN.test(input.startBlock) || !GUIDE_BLOCK_PATTERN.test(input.endBlock)) return "Invalid anchor";
  if (!validOffset(input.startOffset) || !validOffset(input.endOffset)) return "Invalid anchor";
  if (!input.exact.trim()) return "Select some text to highlight";
  if (input.exact.length > GUIDE_QUOTE_MAX) return "Select a shorter passage to highlight";
  // Within one block both offsets count from the same start, so they must span exactly the quote.
  if (input.startBlock === input.endBlock && input.endOffset - input.startOffset !== input.exact.length) {
    return "Invalid anchor";
  }
  if (input.prefix.length > GUIDE_CONTEXT_LENGTH * 2 || input.suffix.length > GUIDE_CONTEXT_LENGTH * 2) {
    return "Invalid anchor";
  }
  return null;
}

/*
  A saved guide span (a guideHighlights row, named for what it first held) is annotated like a verse: any mix of
  a highlight, an underline (each in any MarkColor), and a private note. Rows from before underlines and notes
  in the guide hold a highlight alone, in one of the first five colors; every field below is optional on them.
*/

/**
 * A change to one guide span's annotation, leaving everything not named as it is (as VerseMarksPatch does for
 * verses): a quick mark names one mark, and the full editor names all three.
 *  - body: the note ("" removes it).
 *  - highlightColor / underlineColor: a color, or null to remove that mark.
 */
export type GuideAnnotationPatch = {
  body?: string;
  highlightColor?: MarkColor | null;
  underlineColor?: MarkColor | null;
};

export type GuideAnnotationFields = {
  body?: string | null;
  highlightColor?: MarkColor | null;
  underlineColor?: MarkColor | null;
};

/** Why a change to a guide span's annotation can't be applied, or null if it can. */
export function guidePatchProblem(patch: GuideAnnotationPatch): string | null {
  if (patch.body === undefined && patch.highlightColor === undefined && patch.underlineColor === undefined) {
    return "Choose a highlight, an underline, or a note";
  }
  if (patch.body !== undefined && normalizeAnnotationBody(patch.body).length > ANNOTATION_BODY_MAX) {
    return "Annotation text is too long";
  }
  return null;
}

/**
 * A guide span's annotation after a change: its note, highlight, and underline, and whether anything is left to
 * keep (a span with no note and no mark is removed, as an empty verse annotation is).
 */
export function applyGuidePatch(
  existing: GuideAnnotationFields | null | undefined,
  patch: GuideAnnotationPatch
): { body: string; highlightColor: MarkColor | undefined; underlineColor: MarkColor | undefined; keep: boolean } {
  // An omitted note is left exactly as saved (an imported one keeps its paragraph break).
  const body = patch.body === undefined ? existing?.body ?? "" : normalizeAnnotationBody(patch.body);
  const highlightColor =
    patch.highlightColor === undefined ? existing?.highlightColor ?? undefined : patch.highlightColor ?? undefined;
  const underlineColor =
    patch.underlineColor === undefined ? existing?.underlineColor ?? undefined : patch.underlineColor ?? undefined;
  return { body, highlightColor, underlineColor, keep: !!body.trim() || !!highlightColor || !!underlineColor };
}

/**
 * A device's guide annotation imported into the account's row on the same span: the account keeps any mark it
 * already has (the device only adds missing ones), and a different device note is appended to the account's
 * once (the import receipt makes a retry a no-op), as verse imports do.
 */
export function mergeGuideImport(
  existing: GuideAnnotationFields,
  incoming: GuideAnnotationFields
): { body: string; highlightColor: MarkColor | undefined; underlineColor: MarkColor | undefined } {
  const saved = normalizeAnnotationBody(existing.body ?? "");
  const added = normalizeAnnotationBody(incoming.body ?? "");
  return {
    body: saved && added && saved !== added ? `${saved}\n\n${added}` : saved || added,
    highlightColor: existing.highlightColor ?? incoming.highlightColor ?? undefined,
    underlineColor: existing.underlineColor ?? incoming.underlineColor ?? undefined,
  };
}

/** Whether two guide highlights anchor the same selected text (a save then updates rather than duplicates). */
export function sameGuideAnchor(a: GuideAnchorFields, b: GuideAnchorFields): boolean {
  return (
    a.part === b.part &&
    a.startBlock === b.startBlock &&
    a.startOffset === b.startOffset &&
    a.endBlock === b.endBlock &&
    a.endOffset === b.endOffset &&
    a.exact === b.exact
  );
}
