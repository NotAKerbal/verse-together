// Verse annotations (a private note, a highlight, or both on one verse), shared by every reader that shows them.

import { toScriptureVolumeUrlSlug } from "../../lib/scriptureVolumes.ts";

export type HighlightColor = "yellow" | "blue" | "green" | "pink" | "purple";
export type AnnotationHighlightColor = "none" | HighlightColor;

/** One row of annotations.getChapterAnnotations. A highlight-only annotation has an empty body. */
export type VerseAnnotation = {
  id: string;
  verse: number;
  body: string;
  visibility: "private";
  highlight_color: HighlightColor | null;
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

export function highlightOf(annotation: VerseAnnotation | null | undefined): AnnotationHighlightColor {
  return annotation?.highlight_color ?? "none";
}

export function annotationHighlightClass(color: AnnotationHighlightColor) {
  if (color === "yellow") return "border-[color:var(--surface-border)] bg-[color:var(--accent-note)]";
  if (color === "blue") return "border-[color:var(--surface-border)] bg-[color:var(--accent-sky-soft)]";
  if (color === "green") return "border-emerald-500/40 bg-emerald-500/7";
  if (color === "pink") return "border-pink-500/40 bg-pink-500/7";
  if (color === "purple") return "border-violet-500/40 bg-violet-500/7";
  return "border-[color:var(--surface-border)] bg-black/[0.015] dark:bg-white/[0.025]";
}

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
