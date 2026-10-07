// Phone layout of the study companion: two full-width sides in a native horizontal scroll-snap strip.

export type CompanionSide = "guide" | "scripture";

/** Left-to-right order of the sides on phones: the guide first, its chapter one swipe away. */
export const MOBILE_SIDE_ORDER: readonly CompanionSide[] = ["guide", "scripture"];

/**
 * The side a strip scrolled to `scrollLeft` is showing: whichever side covers more of the strip, so the
 * label flips at the halfway point of a swipe. RTL strips report negative offsets; a strip with no width
 * yet (before layout) is on the first side.
 */
export function sideAtScroll(scrollLeft: number, width: number): CompanionSide {
  if (!(width > 0)) return MOBILE_SIDE_ORDER[0];
  const index = Math.round(Math.abs(scrollLeft) / width);
  return MOBILE_SIDE_ORDER[Math.min(MOBILE_SIDE_ORDER.length - 1, Math.max(0, index))];
}

/**
 * Notices a strip leaving the scripture side (its last side) after resting there: once per departure,
 * however the gesture then wavers between the sides, and again only after the strip has come back to
 * rest on the scripture. `maxScroll` is the strip's scrollWidth minus its clientWidth.
 *
 * A strip whose width changed (a rotation, a phone-to-tablet resize) has not moved; it is measured again.
 * Whatever offset it reports at the new width is a re-snap, never a departure, even while the reader's
 * last touch or wheel turn is still recent, and only once it rests on the scripture at that width can a
 * swipe leave it.
 */
export class ScriptureDeparture {
  private resting = false;
  /** The maxScroll the strip was last seen at; NaN before the first sighting and after a reset. */
  private max = Number.NaN;
  private readonly tolerance: number;

  constructor(tolerance = 2) {
    this.tolerance = tolerance;
  }

  /** A horizontal scroll of the strip: true when it is the first movement away from the scripture. */
  scrolled(scrollLeft: number, maxScroll: number): boolean {
    if (!(maxScroll > 0)) {
      this.reset();
      return false;
    }
    if (!(Math.abs(maxScroll - this.max) <= this.tolerance)) {
      this.resized(scrollLeft, maxScroll);
      return false;
    }
    if (this.atRest(scrollLeft)) {
      this.resting = true;
      return false;
    }
    const departed = this.resting;
    this.resting = false;
    return departed;
  }

  /**
   * The strip's size changed: at a new width, whether it rests on the scripture is measured afresh. A change
   * of height alone (a phone's URL bar) leaves the width, and any departure under way, as they were.
   */
  resized(scrollLeft: number, maxScroll: number) {
    if (!(maxScroll > 0)) {
      this.reset();
      return;
    }
    if (Math.abs(maxScroll - this.max) <= this.tolerance) return;
    this.max = maxScroll;
    this.resting = this.atRest(scrollLeft);
  }

  reset() {
    this.resting = false;
    this.max = Number.NaN;
  }

  private atRest(scrollLeft: number) {
    return Math.abs(scrollLeft) >= this.max - this.tolerance;
  }
}

/** The reader's own input on the strip: fingers on it, and when they last touched, turned, or keyed it. */
export type StripInput = { touches: number; at: number };

/**
 * Whether a departure the strip just reported (`departed`) is the reader turning back to the guide: not a
 * programmatic move to a side (`programmatic`), and with the reader's fingers on the strip or their input
 * on it within `windowMs` of `now`. Nothing else counts, in particular not how the guide or the scripture
 * were last scrolled vertically: every such return opens the guide at the scripture's section.
 */
export function returnsToGuide(departed: boolean, programmatic: boolean, input: StripInput, now: number, windowMs: number): boolean {
  return departed && !programmatic && (input.touches > 0 || now - input.at < windowMs);
}

type Half = "a" | "b";

/** A chapter heading (`verse` null) or a verse of the scripture pane, at its content offset. */
export type ScriptureMark = { chapter: number; verse: number | null; top: number; height: number };

/** Where in the scripture a reader is: a chapter's heading (`verse` null), or a half of one of its verses. */
export type ScripturePosition = { chapter: number; verse: number | null; half: Half };

/**
 * The scripture at the pane's reading line (`line`, a content offset): the last heading or verse that
 * starts at or above it, and which half of that verse the line is in (a verse splits at its middle, as
 * the lettered halves of 57:11–13a and 57:13b–14 do in the sync). `marks` are in document order. A pane
 * still at its very top reads from its start, since nothing above the reading line can reach it there.
 */
export function scripturePositionAt(
  marks: readonly ScriptureMark[],
  pane: { scrollTop: number; line: number }
): ScripturePosition | null {
  if (marks.length === 0) return null;
  const line = pane.scrollTop < 1 ? Number.NEGATIVE_INFINITY : pane.line;
  let found = marks[0];
  for (const mark of marks) {
    if (mark.top > line) break;
    found = mark;
  }
  const half: Half = found.verse != null && line >= found.top + found.height / 2 ? "b" : "a";
  return { chapter: found.chapter, verse: found.verse, half };
}

/** A guide passage as the parser describes it (see GuidePassage), in guide order. */
export type SectionPassage = { id: string; chapter: number; first: number; last: number; firstHalf?: Half; lastHalf?: Half };

/** The guide section that opens on a scripture position: a passage's commentary, or a chapter's opening. */
export type GuideSection = { kind: "passage"; id: string } | { kind: "chapter"; chapter: number };

// Half-verse order within a chapter: 13a < 13b < 14a.
const halfIndex = (verse: number, half: Half) => verse * 2 + (half === "b" ? 1 : 0);
const passageStart = (passage: SectionPassage) => halfIndex(passage.first, passage.firstHalf === "b" ? "b" : "a");
const passageEnd = (passage: SectionPassage) => halfIndex(passage.last, passage.lastHalf === "a" ? "a" : "b");

/**
 * The commentary section for a scripture position, the way the sync assigns scripture to commentary:
 * - a chapter heading opens its chapter's section;
 * - a verse belongs to the passage that covers it, the first in guide order where passages overlap
 *   (47:5–7 and 47:7–10 share verse 7; it is read with 47:5–7), and by halves where the guide splits a
 *   verse (57:13a with 57:11–13a, 57:13b with 57:13b–14);
 * - verses no passage covers wait for the chapter's next passage; before its first passage they are the
 *   chapter's opening (heading and orientation), and after its last they stay with that last passage.
 */
export function guideSectionAt(position: ScripturePosition, passages: readonly SectionPassage[]): GuideSection {
  const chapter: GuideSection = { kind: "chapter", chapter: position.chapter };
  if (position.verse == null) return chapter;
  const here = halfIndex(position.verse, position.half);
  const own = passages.filter((passage) => passage.chapter === position.chapter);
  const covering = own.find((passage) => passageStart(passage) <= here && here <= passageEnd(passage));
  if (covering) return { kind: "passage", id: covering.id };
  let next: SectionPassage | undefined;
  let previous: SectionPassage | undefined;
  for (const passage of own) {
    const start = passageStart(passage);
    if (start > here) {
      if (!next || start < passageStart(next)) next = passage;
    } else if (!previous || start > passageStart(previous)) {
      previous = passage;
    }
  }
  if (!previous) return chapter;
  return { kind: "passage", id: (next ?? previous).id };
}
