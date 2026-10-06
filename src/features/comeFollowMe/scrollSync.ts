// Semantic scroll sync between the study guide and the full scripture text.
//
// Positions are content offsets inside each pane's scroller (independent of where it is scrolled to).
// The guide is cut into segments at its anchors: chapter headings, passage headings/leads, and the
// non-passage subsections that follow a chapter's passages. Each segment maps to a span of the scripture
// text (or to nothing), and positions inside a segment interpolate linearly across its span. So the two
// texts line up at every chapter and verse anchor, however long the commentary on a verse is, and
// commentary with no scripture of its own (introductions, synthesis, bibliography) leaves the scripture
// where it is.

export type Span = { start: number; end: number };

export type GuideMarker<T = unknown> =
  /** Commentary on a span of scripture (a chapter's opening, or a passage). */
  | { top: number; kind: "mapped"; scripture: Span; meta?: T }
  /** Material after a chapter's passages (questions, cross-references): scripture rests where it ended. */
  | { top: number; kind: "hold"; meta?: T }
  /** Material with no scripture of its own. */
  | { top: number; kind: "unmapped"; meta?: T };

export type Segment<T = unknown> = { guideStart: number; guideEnd: number; scripture: Span | null; meta?: T };

/** Segments in guide order. `guideEnd` is where the last segment stops (the end of the guide). */
export function buildSegments<T>(markers: readonly GuideMarker<T>[], guideEnd: number): Segment<T>[] {
  const segments: Segment<T>[] = [];
  let restingPoint: number | null = null;
  markers.forEach((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].top : Math.max(guideEnd, marker.top);
    let scripture: Span | null = null;
    if (marker.kind === "mapped") {
      scripture = marker.scripture;
      restingPoint = marker.scripture.end;
    } else if (marker.kind === "hold" && restingPoint != null) {
      scripture = { start: restingPoint, end: restingPoint };
    }
    segments.push({ guideStart: marker.top, guideEnd: Math.max(end, marker.top), scripture, meta: marker.meta });
  });
  return segments;
}

/** Index of the segment containing guide offset `y`, or -1 before the first one. */
export function segmentAt<T>(segments: readonly Segment<T>[], y: number): number {
  let low = 0;
  let high = segments.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (segments[middle].guideStart <= y) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

const fraction = (value: number, start: number, end: number) => (end > start ? Math.min(1, Math.max(0, (value - start) / (end - start))) : 0);

/** Scripture offset matching guide offset `y`, or null where the guide has nothing to align (hold still). */
export function guideToScripture<T>(segments: readonly Segment<T>[], y: number): number | null {
  const index = segmentAt(segments, y);
  if (index < 0) return null;
  const segment = segments[index];
  if (!segment.scripture) return null;
  const { start, end } = segment.scripture;
  return start + fraction(y, segment.guideStart, segment.guideEnd) * (end - start);
}

/**
 * Scripture spans in reading order, each starting no earlier than the previous one ended, so a verse
 * shared by two segments (57:11–13a and 57:13b–14 both touch verse 13) belongs to exactly one of them.
 * Empty spans (held positions) have no scripture of their own to scroll through and are left out.
 */
function forwardSpans<T>(segments: readonly Segment<T>[]) {
  const spans: Array<{ segment: Segment<T>; start: number; end: number }> = [];
  let reached = Number.NEGATIVE_INFINITY;
  for (const segment of segments) {
    if (!segment.scripture) continue;
    const start = Math.max(segment.scripture.start, reached);
    const end = segment.scripture.end;
    if (end <= start) continue;
    spans.push({ segment, start, end });
    reached = end;
  }
  return spans;
}

/**
 * Guide offset matching scripture offset `y`. Before the first aligned verse the guide sits at the first
 * aligned commentary; between spans (verses no commentary covers) it waits at the start of the next one;
 * past the last it rests at the end of the last.
 */
export function scriptureToGuide<T>(segments: readonly Segment<T>[], y: number): number | null {
  const spans = forwardSpans(segments);
  if (spans.length === 0) return null;
  for (const span of spans) {
    if (y < span.start) return span.segment.guideStart;
    if (y < span.end) {
      return span.segment.guideStart + fraction(y, span.start, span.end) * (span.segment.guideEnd - span.segment.guideStart);
    }
  }
  return spans[spans.length - 1].segment.guideEnd;
}

/**
 * Where an explicit scripture target begins. A target that is exactly one of the guide's passages
 * starts where that passage does, so "57:13–14" (the guide's 57:13b–14) starts at the second half of
 * verse 13 rather than in the 57:11–13a commentary. Any other verse range starts at its first verse,
 * whole; a bare chapter starts at its heading (`verse` null).
 */
export function targetStart(
  target: { chapter: number; first?: number; last?: number },
  passages: readonly { chapter: number; first: number; last: number; firstHalf?: "a" | "b" }[]
): { chapter: number; verse: number | null; secondHalf: boolean } {
  if (target.first == null) return { chapter: target.chapter, verse: null, secondHalf: false };
  const last = target.last ?? target.first;
  const exact = passages.find((p) => p.chapter === target.chapter && p.first === target.first && p.last === last);
  return { chapter: target.chapter, verse: target.first, secondHalf: exact?.firstHalf === "b" };
}

/**
 * Scroll offset that puts content offset `start` on a pane's reading line (`fraction` of its visible
 * height), nudged so the line falls just inside what starts there rather than on the boundary with
 * whatever precedes it (scroll offsets round to whole pixels).
 */
export function alignAtReadingLine(start: number, visibleHeight: number, fraction: number, nudge = 1): number {
  return start + nudge - visibleHeight * fraction;
}

export type Pane = "guide" | "scripture";

/**
 * Who is scrolling. The pane a person is moving owns the sync; the other only follows. Programmatic
 * writes are remembered, so their echo scroll events are not mistaken for the reader moving that pane,
 * and while one pane is active the other's scroll events (echoes, clamping) are ignored, which is what
 * prevents feedback loops. Ownership lasts while the owner keeps scrolling (including touch momentum,
 * which sends no input events) and lapses after `idleMs` of quiet.
 */
export class ScrollOwnership {
  private owner: Pane | null = null;
  private lastActivity = Number.NEGATIVE_INFINITY;
  private readonly expected = new Map<Pane, number>();
  private readonly idleMs: number;
  private readonly tolerance: number;

  constructor(idleMs = 180, tolerance = 2) {
    this.idleMs = idleMs;
    this.tolerance = tolerance;
  }

  /** Direct input on a pane (wheel, touch, pointer, keys): it takes ownership at once. */
  input(pane: Pane, now: number) {
    this.owner = pane;
    this.lastActivity = now;
    this.expected.delete(pane);
  }

  /** A programmatic write is about to move `pane` to `top`. */
  expect(pane: Pane, top: number) {
    this.expected.set(pane, top);
  }

  /** A scroll event on `pane` at `top`: true when it is the reader's movement and should drive the other. */
  scrolled(pane: Pane, top: number, now: number): boolean {
    const expected = this.expected.get(pane);
    if (expected != null && Math.abs(top - expected) <= this.tolerance) {
      this.expected.delete(pane);
      return false;
    }
    if (this.owner != null && this.owner !== pane && now - this.lastActivity < this.idleMs) return false;
    this.owner = pane;
    this.lastActivity = now;
    this.expected.delete(pane);
    return true;
  }

  get current(): Pane | null {
    return this.owner;
  }
}
