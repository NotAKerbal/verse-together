// Pure rules for a verse annotation and a study-guide highlight, shared by the Convex mutations and the
// client code that calls them.

export const ANNOTATION_BODY_MAX = 1200;

export function normalizeAnnotationBody(body: string): string {
  return body.trim().replace(/\s+/g, " ");
}

/**
 * Why an annotation can't be saved, or null if it can. An annotation is a note, a highlight, or both:
 * a highlight needs no note text, and nothing is stored in place of one.
 */
export function annotationProblem(body: string, highlightColor: string | null | undefined): string | null {
  const normalized = normalizeAnnotationBody(body);
  if (normalized.length > ANNOTATION_BODY_MAX) return "Annotation text is too long";
  if (!normalized && !highlightColor) return "Add a note or choose a highlight";
  return null;
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
