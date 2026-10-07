// Text anchors for study-guide highlights: describing a selected span of a guide part's text, and finding
// it again. Pure (no DOM), so the identity and recovery rules are testable; useGuideHighlights builds the
// text index from the live guide and turns positions into DOM ranges. The stored shape and its server-side
// limits are in convex/annotationRules.ts.

import {
  GUIDE_BLOCK_PATTERN,
  GUIDE_CONTEXT_LENGTH,
  GUIDE_QUOTE_MAX,
  type GuideAnchorFields,
  type GuidePart,
} from "../../../convex/annotationRules.ts";
import type { HighlightColor } from "../annotations/verseAnnotations.ts";

/**
 * A guide part's text: the data of its text nodes in document order, joined, and the elements with usable
 * ids (block anchors), each at the text offset where it starts, in document order.
 */
export type TextIndex = { text: string; anchors: ReadonlyArray<{ id: string; start: number }> };

/** A stored highlight, as the client uses it. */
export type GuideHighlight = GuideAnchorFields & { id: string; guide: string; highlightColor: HighlightColor; updatedAt: string };

const COLORS: readonly string[] = ["yellow", "blue", "green", "pink", "purple"];

/** A query row, checked rather than trusted (an old backend, or a changed one, may answer differently). */
export function isGuideHighlight(value: unknown): value is GuideHighlight {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.guide === "string" &&
    (row.part === "introduction" || row.part === "reader") &&
    typeof row.startBlock === "string" &&
    typeof row.startOffset === "number" &&
    typeof row.endBlock === "string" &&
    typeof row.endOffset === "number" &&
    typeof row.exact === "string" &&
    typeof row.prefix === "string" &&
    typeof row.suffix === "string" &&
    typeof row.highlightColor === "string" &&
    COLORS.includes(row.highlightColor) &&
    typeof row.updatedAt === "string"
  );
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

export type Described = { ok: true; anchor: Omit<GuideAnchorFields, "part"> } | { ok: false; reason: "empty" | "too-long" };

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

export type { GuidePart };
