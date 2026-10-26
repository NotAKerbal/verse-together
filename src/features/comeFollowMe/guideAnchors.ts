// Text anchors for study-guide highlights: describing a selected span of a guide part's text, and finding
// it again. Pure (no DOM), so the identity and recovery rules are testable; useGuideHighlights builds the
// text index from the live guide and turns positions into DOM ranges. The stored shape and its server-side
// limits are in convex/annotationRules.ts.

import {
  GUIDE_BLOCK_PATTERN,
  GUIDE_CONTEXT_LENGTH,
  GUIDE_QUOTE_MAX,
  MARK_COLORS,
  applyGuidePatch,
  isMarkColor,
  sameGuideAnchor,
  type GuideAnchorFields,
  type GuideAnnotationPatch,
  type GuidePart,
  type MarkColor,
} from "../../../convex/annotationRules.ts";
import type { SelectionMarks } from "../annotations/verseAnnotations.ts";

/**
 * A guide part's text: the data of its text nodes in document order, joined, and the elements with usable
 * ids (block anchors), each at the text offset where it starts, in document order.
 */
export type TextIndex = { text: string; anchors: ReadonlyArray<{ id: string; start: number }> };

/**
 * A saved guide span, as the client uses it: its anchor and any mix of a highlight, an underline, and a note
 * (a missing mark is null, a missing note "").
 */
export type GuideHighlight = GuideAnchorFields & {
  id: string;
  guide: string;
  highlightColor: MarkColor | null;
  underlineColor: MarkColor | null;
  body: string;
  updatedAt: string;
};

/**
 * A span as stored on this device or answered by a backend: rows from before guide underlines and notes have
 * a highlight (in one of the first five colors) and nothing else. readGuideHighlight fills in the rest.
 */
export type GuideHighlightRecord = Omit<GuideHighlight, "highlightColor" | "underlineColor" | "body"> & {
  highlightColor?: MarkColor | null;
  underlineColor?: MarkColor | null;
  body?: string | null;
};

/**
 * A query or device row, checked rather than trusted (an old backend, or a changed one, may answer
 * differently) and filled in; null when it isn't a span this client can show. A span with no mark and no
 * note is nothing to show.
 */
export function readGuideHighlight(value: unknown): GuideHighlight | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const color = (field: unknown) => (field == null ? null : isMarkColor(field) ? field : undefined);
  const highlightColor = color(row.highlightColor);
  const underlineColor = color(row.underlineColor);
  const body = row.body == null ? "" : typeof row.body === "string" ? row.body : undefined;
  if (
    typeof row.id !== "string" ||
    typeof row.guide !== "string" ||
    (row.part !== "introduction" && row.part !== "reader") ||
    typeof row.startBlock !== "string" ||
    typeof row.startOffset !== "number" ||
    typeof row.endBlock !== "string" ||
    typeof row.endOffset !== "number" ||
    typeof row.exact !== "string" ||
    typeof row.prefix !== "string" ||
    typeof row.suffix !== "string" ||
    typeof row.updatedAt !== "string" ||
    highlightColor === undefined ||
    underlineColor === undefined ||
    body === undefined ||
    (!highlightColor && !underlineColor && !body.trim())
  ) {
    return null;
  }
  return {
    id: row.id,
    guide: row.guide,
    part: row.part,
    startBlock: row.startBlock,
    startOffset: row.startOffset,
    endBlock: row.endBlock,
    endOffset: row.endOffset,
    exact: row.exact,
    prefix: row.prefix,
    suffix: row.suffix,
    highlightColor,
    underlineColor,
    body,
    updatedAt: row.updatedAt,
  };
}

export function isUsableBlockId(id: string): boolean {
  return id.length > 0 && GUIDE_BLOCK_PATTERN.test(id);
}

/** The block anchor a point is measured from: the last anchor starting at (or, for an end point, before) it. */
function blockFor(index: TextIndex, position: number, edge: "start" | "end"): { block: string; offset: number } {
  let found: { id: string; start: number } | null = null;
  for (const anchor of index.anchors) {
    if (edge === "start" ? anchor.start > position : anchor.start >= position) break;
    found = anchor;
  }
  return found ? { block: found.id, offset: position - found.start } : { block: "", offset: position };
}

function blockStart(index: TextIndex, block: string): number | null {
  if (!block) return 0;
  return index.anchors.find((anchor) => anchor.id === block)?.start ?? null;
}

/** A span's anchor and where it is in the part's text (trimmed), or why it can't be anchored. */
export type Described =
  | { ok: true; anchor: Omit<GuideAnchorFields, "part">; start: number; end: number }
  | { ok: false; reason: "empty" | "too-long" };

/**
 * The anchor for the text between two positions of a part, trimmed of surrounding whitespace. The end point
 * is measured from the block that holds the span's last character, so a span ending at a block's end does
 * not depend on the next block.
 */
export function describeSpan(index: TextIndex, from: number, to: number): Described {
  const { text } = index;
  let start = Math.max(0, Math.min(from, to));
  let end = Math.min(text.length, Math.max(from, to));
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  if (start >= end) return { ok: false, reason: "empty" };
  if (end - start > GUIDE_QUOTE_MAX) return { ok: false, reason: "too-long" };
  const startPoint = blockFor(index, start, "start");
  const endPoint = blockFor(index, end, "end");
  return {
    ok: true,
    anchor: {
      startBlock: startPoint.block,
      startOffset: startPoint.offset,
      endBlock: endPoint.block,
      endOffset: endPoint.offset,
      exact: text.slice(start, end),
      prefix: text.slice(Math.max(0, start - GUIDE_CONTEXT_LENGTH), start),
      suffix: text.slice(end, end + GUIDE_CONTEXT_LENGTH),
    },
    start,
    end,
  };
}

/**
 * Where an anchor's text is now, or null where it can't be placed with confidence.
 *
 * 1. At its recorded place: both block anchors still exist, the text between them is still the quote, and
 *    at least one side of its recorded context still matches there. The same words at the same offset
 *    with different text on both sides are other prose (the original copy may be gone), not this span.
 * 2. Otherwise by its quote: the one occurrence whose surrounding text still matches the recorded prefix
 *    and suffix (text added or removed earlier in the guide moves it, which this follows).
 * 3. Otherwise, only if the quote occurs exactly once and at least one side of its context still matches.
 *
 * Context is compared with the part's edges in mind: a prefix (or suffix) shorter than the context length
 * was cut short by the start (or end) of the part, so it matches only where it again reaches that edge;
 * an empty one means "at the very start (end)".
 *
 * Anything else (the quote gone or changed, or more than one equally good place) stays unplaced rather than
 * marking the wrong prose; the stored highlight itself is kept.
 */
export function resolveAnchor(index: TextIndex, anchor: Omit<GuideAnchorFields, "part">): { start: number; end: number } | null {
  const { text } = index;
  const { exact, prefix, suffix } = anchor;
  if (!exact) return null;
  const prefixMatches = (at: number) =>
    at >= prefix.length &&
    text.slice(at - prefix.length, at) === prefix &&
    (prefix.length >= GUIDE_CONTEXT_LENGTH || at === prefix.length);
  const suffixMatches = (at: number) => {
    const end = at + exact.length;
    return (
      text.slice(end, end + suffix.length) === suffix &&
      (suffix.length >= GUIDE_CONTEXT_LENGTH || end + suffix.length === text.length)
    );
  };
  const startBase = blockStart(index, anchor.startBlock);
  const endBase = blockStart(index, anchor.endBlock);
  if (startBase != null && endBase != null) {
    const start = startBase + anchor.startOffset;
    const end = endBase + anchor.endOffset;
    if (
      end - start === exact.length &&
      text.slice(start, end) === exact &&
      (prefixMatches(start) || suffixMatches(start))
    ) {
      return { start, end };
    }
  }
  const hits: number[] = [];
  for (let at = text.indexOf(exact); at !== -1; at = text.indexOf(exact, at + 1)) hits.push(at);
  if (hits.length === 0) return null;
  const inContext = hits.filter((at) => prefixMatches(at) && suffixMatches(at));
  if (inContext.length === 1) return { start: inContext[0], end: inContext[0] + exact.length };
  if (inContext.length > 1) return null;
  if (hits.length === 1 && (prefixMatches(hits[0]) || suffixMatches(hits[0]))) {
    return { start: hits[0], end: hits[0] + exact.length };
  }
  return null;
}

/**
 * The text node (by index into `starts`, the text offset of each node) and offset for a position. A start
 * point lies in the node holding the character at it; an end point in the node holding the character
 * before it, so a span never begins or ends in an empty neighbour.
 */
export function locate(starts: readonly number[], lengths: readonly number[], position: number, edge: "start" | "end") {
  let low = 0;
  let high = starts.length - 1;
  let best = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (edge === "start" ? starts[mid] <= position : starts[mid] < position) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  // Skip back over empty nodes so the point lands in one that holds text.
  while (best > 0 && lengths[best] === 0) best -= 1;
  if (best < 0) return null;
  const offset = Math.min(lengths[best], Math.max(0, position - starts[best]));
  return { node: best, offset };
}

/** A saved span where it is in its part's text now (resolveAnchor), as the guide paints it. */
export type PlacedGuideHighlight = { row: GuideHighlight; start: number; end: number };

/**
 * What a selection in a part (its trimmed [start, end)) means for the saved spans there:
 *  - exact: the saved span that is exactly the selected text, which the menu edits (the most recently changed
 *    one, if older saves left two on the same text);
 *  - overlapping: every other saved span sharing any of the selected text, in reading order. They are shown
 *    and can be selected in turn, but a change to the selection never reaches them: marking part of a long
 *    highlighted passage marks just that part, and never edits the whole passage unasked.
 */
export function guideSelectionTargets(
  placed: readonly PlacedGuideHighlight[],
  part: GuidePart,
  start: number,
  end: number
): { exact: PlacedGuideHighlight | null; overlapping: PlacedGuideHighlight[] } {
  let exact: PlacedGuideHighlight | null = null;
  const touching: PlacedGuideHighlight[] = [];
  for (const item of placed) {
    if (item.row.part !== part || item.end <= start || item.start >= end) continue;
    if (item.start === start && item.end === end && (!exact || item.row.updatedAt > exact.row.updatedAt)) {
      if (exact) touching.push(exact);
      exact = item;
    } else {
      touching.push(item);
    }
  }
  touching.sort((a, b) => a.start - b.start || a.end - b.end);
  return { exact, overlapping: touching };
}

/**
 * The marks a guide selection has, for the selection menu's mark buttons (presetState): a mark is on (true)
 * when the selected span itself has it, partly on ("mixed") when only a saved span overlapping the selection
 * has it, else off. Pressing a mark that is on removes it from the selected span; any other press puts it on
 * the selected span (so the overlapping span keeps its own marks).
 */
export function guideSelectionMarks(
  exact: GuideHighlight | null | undefined,
  overlapping: readonly GuideHighlight[]
): SelectionMarks {
  const rows = exact ? [exact, ...overlapping] : overlapping;
  const present = (pick: (row: GuideHighlight) => MarkColor | null) =>
    MARK_COLORS.filter((color) => rows.some((row) => pick(row) === color));
  return {
    highlight: exact?.highlightColor ?? "none",
    underline: exact?.underlineColor ?? "none",
    highlights: present((row) => row.highlightColor),
    underlines: present((row) => row.underlineColor),
  };
}

/** A change to a guide span: the saved one `highlightId`, else the one with this exact anchor, else a new one. */
export type GuideAnnotationTarget = GuideAnchorFields & { guide: string; highlightId?: string };

/**
 * A guide's spans as they will be once a change saves (for an optimistic update, and the same rule the server
 * and this device apply): only the named fields change, a span left with nothing is removed, and a new span's id
 * is a placeholder ("pending:…") until the query refreshes.
 */
export function withGuideAnnotation(
  rows: readonly GuideHighlight[],
  target: GuideAnnotationTarget,
  patch: GuideAnnotationPatch,
  now = new Date().toISOString()
): GuideHighlight[] {
  const existing = target.highlightId
    ? rows.find((row) => row.id === target.highlightId)
    : rows.find((row) => row.guide === target.guide && sameGuideAnchor(row, target));
  const next = applyGuidePatch(existing, patch);
  if (!next.keep) return rows.filter((row) => row !== existing);
  const fields = {
    highlightColor: next.highlightColor ?? null,
    underlineColor: next.underlineColor ?? null,
    body: next.body,
    updatedAt: now,
  };
  if (existing) return rows.map((row) => (row === existing ? { ...row, ...fields } : row));
  const { guide, part, startBlock, startOffset, endBlock, endOffset, exact, prefix, suffix } = target;
  return [
    ...rows,
    {
      id: `pending:${part}:${startBlock}:${startOffset}:${endBlock}:${endOffset}`,
      guide,
      part,
      startBlock,
      startOffset,
      endBlock,
      endOffset,
      exact,
      prefix,
      suffix,
      ...fields,
    },
  ];
}

export type { GuidePart };
