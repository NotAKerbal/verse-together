// Verse annotations (a private note, a highlight, an underline, or any mix on one verse), shared by every reader
// that shows them.

import { toScriptureVolumeUrlSlug } from "../../lib/scriptureVolumes.ts";
import {
  applyVerseMarks,
  DEFAULT_UNDERLINE_COLOR,
  MARK_COLORS,
  type MarkColor,
  type MarkKind,
  type MarkPreset,
  type VerseMarksPatch,
} from "../../../convex/annotationRules.ts";

export type { MarkColor, MarkKind, MarkPreset, VerseMarksPatch };
export {
  MARK_PRESET_NAME_MAX,
  markPresetKey,
  normalizeMarkPresetName,
  sameMarkPreset,
  sameNamedMarkPreset,
} from "../../../convex/annotationRules.ts";

/** The study guides' highlight palette (guide highlights are stored apart, in these colors only). */
export type HighlightColor = "yellow" | "blue" | "green" | "pink" | "purple";
export type AnnotationHighlightColor = "none" | HighlightColor;
/** A verse highlight's or underline's color, or none. */
export type AnnotationMarkColor = "none" | MarkColor;

/** One row of annotations.getChapterAnnotations. A highlight- or underline-only annotation has an empty body. */
export type VerseAnnotation = {
  id: string;
  verse: number;
  body: string;
  visibility: "private";
  highlight_color: MarkColor | null;
  /** Optional: rows from before underlines existed (or from an older server) have none, meaning not underlined. */
  underline?: boolean;
  /** The underline's color while underlined. Absent from an older server: an underline is then red. */
  underline_color?: MarkColor | null;
  user_id: string;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
};

export type ChapterAnnotations = { by_verse: Record<number, VerseAnnotation[]> };

/** A chapter as annotations are stored: the standard reader's route volume slug and book slug. */
export type AnnotationChapter = { volume: string; book: string; chapter: number };
export type AnnotationVerse = AnnotationChapter & { verse: number };

/**
 * The stored identity of a chapter, whichever reader shows it. The standard reader's route uses the URL
 * volume slug ("dnc"); the Come, Follow Me guides use the canonical id ("doctrineandcovenants"). Both must
 * read and write the same rows.
 */
export function annotationChapter(volume: string, book: string, chapter: number): AnnotationChapter {
  return { volume: toScriptureVolumeUrlSlug(volume), book, chapter };
}

/** The viewer's own annotation on each verse of a chapter's query result. */
export function myAnnotationsByVerse(data: ChapterAnnotations | null | undefined): Map<number, VerseAnnotation> {
  const out = new Map<number, VerseAnnotation>();
  for (const [key, rows] of Object.entries(data?.by_verse ?? {})) {
    const mine = (rows ?? []).find((row) => row.is_mine);
    const verse = Number(key);
    if (mine && Number.isFinite(verse)) out.set(verse, mine);
  }
  return out;
}

export function highlightOf(annotation: VerseAnnotation | null | undefined): AnnotationMarkColor {
  return annotation?.highlight_color ?? "none";
}

export function underlineOf(annotation: VerseAnnotation | null | undefined): boolean {
  return annotation?.underline === true;
}

/** The underline's color, or "none" when the verse isn't underlined (an underline saved without one is red). */
export function underlineColorOf(annotation: VerseAnnotation | null | undefined): AnnotationMarkColor {
  if (!underlineOf(annotation)) return "none";
  return annotation?.underline_color ?? DEFAULT_UNDERLINE_COLOR;
}

export type VerseMarkAttributes = {
  "data-verse-highlight"?: MarkColor;
  "data-verse-underline"?: MarkColor;
};

/**
 * The attributes that mark a verse's own text (the global .verse-mark rules color and underline it), or
 * null when the annotation marks nothing: a note alone, or no annotation.
 */
export function verseMarkAttributes(annotation: VerseAnnotation | null | undefined): VerseMarkAttributes | null {
  const color = highlightOf(annotation);
  const underline = underlineColorOf(annotation);
  if (color === "none" && underline === "none") return null;
  const out: VerseMarkAttributes = {};
  if (color !== "none") out["data-verse-highlight"] = color;
  if (underline !== "none") out["data-verse-underline"] = underline;
  return out;
}

/** A mark's style for labels: "Yellow highlight", "Red underline" (whatever the preset is named). */
export function markPresetLabel(preset: Pick<MarkPreset, "kind" | "color">): string {
  return `${MARK_COLOR_LABELS[preset.color]} ${preset.kind}`;
}

/**
 * A preset's full name, for accessible names and tooltips: its name with its style ("Blessings (yellow
 * highlight)"), or, unnamed, just its style ("Yellow highlight"). The style is never left out, so a named
 * preset still says what it does.
 */
export function markPresetFullLabel(preset: MarkPreset): string {
  const style = markPresetLabel(preset);
  return preset.name ? `${preset.name} (${style.toLowerCase()})` : style;
}

/** The same, mid-sentence ("Remove yellow highlight", "Remove Blessings (yellow highlight)"). */
export function markPresetPhrase(preset: MarkPreset): string {
  return preset.name ? markPresetFullLabel(preset) : markPresetLabel(preset).toLowerCase();
}

/** What a saved annotation holds, for labels: "Yellow highlight and red underline", "Blue underline only", "Note"... */
export function annotationSummary(annotation: VerseAnnotation | null | undefined): string {
  const highlight = highlightOf(annotation);
  const underline = underlineColorOf(annotation);
  const marks = [
    highlight !== "none" ? markPresetLabel({ kind: "highlight", color: highlight }) : null,
    underline !== "none" ? markPresetLabel({ kind: "underline", color: underline }) : null,
  ]
    .filter(Boolean)
    .join(" and ");
  if (annotation?.body) return marks ? `Note with ${marks.toLowerCase()}` : "Note";
  if (!marks) return "";
  return `${marks.charAt(0)}${marks.slice(1).toLowerCase()}${marks.includes(" and ") ? "" : " only"}`;
}

/**
 * The marks the selected verses share, for the selection menu's preset buttons: the highlight color every
 * verse has, "none" when none has one, or "mixed" when they differ (an unmarked verse among marked ones
 * included); the same for the underline's color; and the colors on at least one verse, of each kind.
 */
export type SelectionMarks = {
  highlight: AnnotationMarkColor | "mixed";
  underline: AnnotationMarkColor | "mixed";
  highlights: MarkColor[];
  underlines: MarkColor[];
};

function sharedColor(colors: readonly AnnotationMarkColor[]): AnnotationMarkColor | "mixed" {
  const unique = new Set(colors);
  return unique.size === 0 ? "none" : unique.size === 1 ? [...unique][0] : "mixed";
}

function presentColors(colors: readonly AnnotationMarkColor[]): MarkColor[] {
  return MARK_COLORS.filter((color) => colors.includes(color));
}

export function selectionMarks(annotations: ReadonlyArray<VerseAnnotation | null | undefined>): SelectionMarks {
  const highlights = annotations.map(highlightOf);
  const underlines = annotations.map(underlineColorOf);
  return {
    highlight: sharedColor(highlights),
    underline: sharedColor(underlines),
    highlights: presentColors(highlights),
    underlines: presentColors(underlines),
  };
}

/** Whether a preset is on every selected verse (true), only some ("mixed"), or none (false). */
export function presetState(preset: MarkPreset, marks: SelectionMarks): boolean | "mixed" {
  const shared = preset.kind === "highlight" ? marks.highlight : marks.underline;
  const present = preset.kind === "highlight" ? marks.highlights : marks.underlines;
  return shared === preset.color ? true : present.includes(preset.color) ? "mixed" : false;
}

/**
 * What a preset button does to the selected verses: puts its mark on them all, in its color (replacing the
 * highlight's, or the underline's, other color), or, when every one has it already, removes it. A highlight
 * preset never touches the underline, nor an underline preset the highlight.
 */
export function quickMarkPatch(preset: MarkPreset, current: SelectionMarks): VerseMarksPatch {
  const on = presetState(preset, current) === true;
  if (preset.kind === "highlight") return { highlightColor: on ? null : preset.color };
  return on ? { underline: false } : { underlineColor: preset.color };
}

/**
 * A chapter's annotations as they will be once a quick-mark change saves (for an optimistic update): the same
 * rule the server applies, on the viewer's own rows only. A new row's id is a placeholder until the query
 * refreshes.
 */
export function withVerseMarks(
  data: ChapterAnnotations,
  verses: readonly number[],
  patch: VerseMarksPatch,
  now = new Date().toISOString()
): ChapterAnnotations {
  const byVerse: Record<number, VerseAnnotation[]> = { ...data.by_verse };
  for (const verse of new Set(verses)) {
    const rows = byVerse[verse] ?? [];
    const mine = rows.find((row) => row.is_mine) ?? null;
    const others = rows.filter((row) => row !== mine);
    const next = applyVerseMarks(
      mine && {
        body: mine.body,
        highlightColor: mine.highlight_color,
        underline: mine.underline,
        underlineColor: mine.underline_color,
      },
      patch
    );
    if (!next.keep) {
      if (others.length) byVerse[verse] = others;
      else delete byVerse[verse];
      continue;
    }
    const row: VerseAnnotation = mine
      ? {
          ...mine,
          highlight_color: next.highlightColor ?? null,
          underline: next.underline,
          underline_color: next.underlineColor ?? null,
          updated_at: now,
        }
      : {
          id: `pending:${verse}`,
          verse,
          body: "",
          visibility: "private",
          highlight_color: next.highlightColor ?? null,
          underline: next.underline,
          underline_color: next.underlineColor ?? null,
          user_id: "",
          is_mine: true,
          created_at: now,
          updated_at: now,
        };
    byVerse[verse] = [row, ...others];
  }
  return { by_verse: byVerse };
}

export function annotationHighlightClass(color: AnnotationMarkColor) {
  if (color === "red") return "border-red-500/40 bg-red-500/7";
  if (color === "yellow") return "border-[color:var(--surface-border)] bg-[color:var(--accent-note)]";
  if (color === "blue") return "border-[color:var(--surface-border)] bg-[color:var(--accent-sky-soft)]";
  if (color === "green") return "border-emerald-500/40 bg-emerald-500/7";
  if (color === "pink") return "border-pink-500/40 bg-pink-500/7";
  if (color === "purple") return "border-violet-500/40 bg-violet-500/7";
  return "border-[color:var(--surface-border)] bg-black/[0.015] dark:bg-white/[0.025]";
}

/** The study guides' highlight choices (no red: guide highlights keep their own palette). */
export const ANNOTATION_HIGHLIGHT_OPTIONS: Array<{
  value: AnnotationHighlightColor;
  label: string;
  swatchClass: string;
}> = [
  { value: "none", label: "None", swatchClass: "bg-transparent border border-[color:var(--surface-border)]" },
  { value: "yellow", label: "Yellow", swatchClass: "bg-[color:var(--accent-primary)] border-2 border-[color:var(--surface-border)]" },
  { value: "blue", label: "Blue", swatchClass: "bg-[color:var(--accent-sky)] border-2 border-[color:var(--surface-border)]" },
  { value: "green", label: "Green", swatchClass: "bg-emerald-400/80 border border-emerald-500/80" },
  { value: "pink", label: "Pink", swatchClass: "bg-pink-400/80 border border-pink-500/80" },
  { value: "purple", label: "Purple", swatchClass: "bg-violet-400/80 border border-violet-500/80" },
];

export const MARK_COLOR_LABELS: Record<MarkColor, string> = {
  red: "Red",
  yellow: "Yellow",
  blue: "Blue",
  green: "Green",
  pink: "Pink",
  purple: "Purple",
};

/** The verse mark palette, for highlights and underlines alike (each color's swatch: --verse-swatch-*). */
export const MARK_COLOR_OPTIONS: ReadonlyArray<{ value: MarkColor; label: string }> = MARK_COLORS.map((value) => ({
  value,
  label: MARK_COLOR_LABELS[value],
}));
