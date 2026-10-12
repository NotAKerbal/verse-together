"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMutation, useQueries } from "convex/react";
import { useAuth } from "@/lib/auth";
import type { HighlightColor } from "@/features/annotations/verseAnnotations";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import GuideHighlightDialog from "./GuideHighlightDialog";
import {
  describeSpan,
  isGuideHighlight,
  isUsableBlockId,
  locate,
  resolveAnchor,
  type GuideHighlight,
  type GuidePart,
  type TextIndex,
} from "./guideAnchors";
import styles from "./studyCompanion.module.css";

/*
  Study-guide highlights: select any of the guide's prose (the introduction, the reader's guide side, or the
  closing sections) and highlight exactly that text. They are painted with the CSS Custom Highlight API, which
  colors DOM ranges without touching the guide's markup: its text nodes, links, ids, and every measured
  position stay exactly as they are. Browsers without that API read the guide as before and are told
  highlights can't show.

  A part can be rendered in more than one element: the closing sections were once the end of the reader's
  guide, and are still the "reader" part, read as one text after it. So highlights saved before they moved
  out of it (and new ones in them) keep the same anchors.
*/

type Roots = Record<GuidePart, ReadonlyArray<RefObject<HTMLElement | null>>>;
type Status = "loading" | "ready" | "unavailable";

const PARTS: readonly GuidePart[] = ["introduction", "reader"];
const COLORS: readonly HighlightColor[] = ["yellow", "blue", "green", "pink", "purple"];
const highlightName = (color: HighlightColor) => `cfm-guide-${color}`;

// Readable on both themes, matching the verse highlight tints in the scripture pane.
const HIGHLIGHT_CSS = `
::highlight(cfm-guide-yellow) { background-color: rgb(234 196 64 / 0.38); }
::highlight(cfm-guide-blue) { background-color: rgb(96 150 220 / 0.3); }
::highlight(cfm-guide-green) { background-color: rgb(52 211 153 / 0.3); }
::highlight(cfm-guide-pink) { background-color: rgb(244 114 182 / 0.28); }
::highlight(cfm-guide-purple) { background-color: rgb(167 139 250 / 0.32); }
`;

function highlightsSupported() {
  return (
    typeof window !== "undefined" &&
    typeof Highlight === "function" &&
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    "adoptedStyleSheets" in document
  );
}

let stylesInstalled = false;

/** The highlight colors, as a constructed style sheet: no build step has to understand ::highlight(). */
function installHighlightStyles() {
  if (stylesInstalled) return;
  stylesInstalled = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(HIGHLIGHT_CSS);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

type DomIndex = TextIndex & {
  nodes: Text[];
  starts: number[];
  lengths: number[];
  /** Which of `roots` holds each text node. */
  rootOf: number[];
  roots: HTMLElement[];
  /** Text offset where each root begins. */
  rootStarts: number[];
};

/** The live elements a part is rendered in, in reading order. */
function partRoots(roots: Roots, part: GuidePart): HTMLElement[] {
  return roots[part].map((ref) => ref.current).filter((root): root is HTMLElement => root != null);
}

/**
 * The part's text and block anchors (see guideAnchors), with the text nodes that hold it: its elements' text
 * in reading order, one after the other.
 */
function buildIndex(roots: HTMLElement[]): DomIndex {
  const parts: string[] = [];
  const nodes: Text[] = [];
  const starts: number[] = [];
  const lengths: number[] = [];
  const rootOf: number[] = [];
  const rootStarts: number[] = [];
  const anchors: Array<{ id: string; start: number }> = [];
  let length = 0;
  roots.forEach((root, rootIndex) => {
    rootStarts.push(length);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text) {
        nodes.push(node);
        starts.push(length);
        lengths.push(node.data.length);
        rootOf.push(rootIndex);
        parts.push(node.data);
        length += node.data.length;
      } else if (node instanceof Element && isUsableBlockId(node.id)) {
        anchors.push({ id: node.id, start: length });
      }
    }
  });
  return { text: parts.join(""), anchors, nodes, starts, lengths, rootOf, roots, rootStarts };
}

/**
 * A boundary point's text offset in its part (Range.toString counts text nodes exactly as buildIndex does),
 * or null when the point is in none of the part's elements.
 */
function positionIn(index: DomIndex, node: Node, offset: number): number | null {
  const at = index.roots.findIndex((root) => root.contains(node));
  if (at < 0) return null;
  const range = document.createRange();
  range.setStart(index.roots[at], 0);
  range.setEnd(node, offset);
  return index.rootStarts[at] + range.toString().length;
}

/**
 * DOM ranges for a span of the part's text: one per element it runs through, so a span that crosses from one
 * element into the next never paints whatever the page has between them.
 */
function rangesFor(index: DomIndex, start: number, end: number): Range[] {
  const from = locate(index.starts, index.lengths, start, "start");
  const to = locate(index.starts, index.lengths, end, "end");
  if (!from || !to || to.node < from.node) return [];
  const ranges: Range[] = [];
  let first = from.node;
  let firstOffset = from.offset;
  for (let node = from.node; node <= to.node; node += 1) {
    if (node < to.node && index.rootOf[node + 1] === index.rootOf[node]) continue;
    const range = document.createRange();
    range.setStart(index.nodes[first], firstOffset);
    range.setEnd(index.nodes[node], node === to.node ? to.offset : index.lengths[node]);
    ranges.push(range);
    first = node + 1;
    firstOffset = 0;
  }
  return ranges;
}

function intersects(a: Range, b: Range) {
  try {
    return a.compareBoundaryPoints(Range.END_TO_START, b) < 0 && a.compareBoundaryPoints(Range.START_TO_END, b) > 0;
  } catch {
    return false;
  }
}

/** A painted highlight: its row and where it is in the guide now (one range per element it runs through). */
type Painted = { row: GuideHighlight; ranges: Range[] };

type Chip = { top: number; right: number; part: GuidePart; editId: string | null };

const CHIP_HEIGHT = 36;
const CHIP_MAX_WIDTH = 240;
const CHIP_GAP = 8;
/** Touch browsers clear a selection as a tap on the button begins; keep the button long enough to take the tap. */
const CHIP_LINGER_MS = 400;

/**
 * A Highlight button beside a text selection in the guide (Edit highlight where the selection touches an
 * existing one). Its own component, so following a selection while the page scrolls re-renders only it.
 */
function GuideSelectionButton({
  roots,
  painted,
  onOpen,
}: {
  roots: Roots;
  painted: RefObject<Painted[]>;
  onOpen: (request: { part: GuidePart; range: Range; editId: string | null }) => void;
}) {
  const [chip, setChip] = useState<Chip | null>(null);
  const rangeRef = useRef<Range | null>(null);

  useEffect(() => {
    let frame = 0;
    let hideTimer = 0;
    const hide = () => {
      if (hideTimer) return;
      hideTimer = window.setTimeout(() => {
        hideTimer = 0;
        rangeRef.current = null;
        setChip(null);
      }, CHIP_LINGER_MS);
    };
    const measure = () => {
      frame = 0;
      const selection = document.getSelection();
      const range = selection && selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
      // Only a selection wholly inside one element of the guide: not across into the scripture or the page.
      const part = range
        ? PARTS.find((name) => roots[name].some((ref) => ref.current?.contains(range.commonAncestorContainer)))
        : undefined;
      if (!range || !part || !range.toString().trim()) {
        hide();
        return;
      }
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
      const last = rects[rects.length - 1];
      if (!last) {
        hide();
        return;
      }
      window.clearTimeout(hideTimer);
      hideTimer = 0;
      rangeRef.current = range.cloneRange();
      const editId =
        painted.current.find((item) => item.row.part === part && item.ranges.some((area) => intersects(range, area)))?.row.id ??
        null;
      // Below the selection's end, else above its start; right-aligned to its end and kept on screen.
      const below = last.bottom + CHIP_GAP;
      const top =
        below + CHIP_HEIGHT <= window.innerHeight - CHIP_GAP ? below : Math.max(CHIP_GAP, rects[0].top - CHIP_GAP - CHIP_HEIGHT);
      const right = Math.min(
        Math.max(CHIP_GAP, window.innerWidth - last.right),
        Math.max(CHIP_GAP, window.innerWidth - CHIP_GAP - CHIP_MAX_WIDTH)
      );
      const next: Chip = { top: Math.round(top), right: Math.round(right), part, editId };
      setChip((previous) =>
        previous &&
        previous.top === next.top &&
        previous.right === next.right &&
        previous.part === next.part &&
        previous.editId === next.editId
          ? previous
          : next
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(hideTimer);
    };
  }, [roots, painted]);

  if (!chip) return null;
  return (
    <button
      type="button"
      className={styles.annotateChip}
      style={{ top: chip.top, right: chip.right, maxWidth: CHIP_MAX_WIDTH }}
      // Keep the selection while pressing the button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        const range = rangeRef.current;
        if (range) onOpen({ part: chip.part, range, editId: chip.editId });
      }}
    >
      {chip.editId ? "Edit highlight" : "Highlight"}
    </button>
  );
}

type Editing =
  | { kind: "create"; part: GuidePart; described: ReturnType<typeof describeSpan> }
  | { kind: "edit"; row: GuideHighlight };

/**
 * The viewer's private highlights in a guide's prose (`guide` is the guide's week start). `reader` lists the
 * elements the reader part is rendered in, in reading order; `layoutKey` changes whenever any of them may be
 * rendered anew elsewhere (the closing sections move between layouts). Returns the layer to render once on
 * the page: the selection's Highlight button, or the highlight dialog.
 */
export function useGuideHighlights(
  guide: string,
  introduction: RefObject<HTMLElement | null>,
  reader: ReadonlyArray<RefObject<HTMLElement | null>>,
  layoutKey: string
) {
  const { user, promptSignIn } = useAuth();
  const roots = useMemo<Roots>(() => ({ introduction: [introduction], reader }), [introduction, reader]);
  // useQueries rather than useQuery: a backend that doesn't have this query yet answers with an Error
  // instead of throwing, and the guide reads on without highlights.
  const queries = useMemo(() => ({ highlights: { query: api.annotations.getGuideHighlights, args: { guide } } }), [guide]);
  const result: unknown = useQueries(queries).highlights;
  const status: Status = result === undefined ? "loading" : Array.isArray(result) ? "ready" : "unavailable";
  // The rows keep their identity until their content changes, so the page re-rendering (it does, often,
  // while the reader scrolls) never repaints the highlights.
  const parsed = Array.isArray(result) ? result.filter(isGuideHighlight).filter((row) => row.guide === guide) : [];
  const signature = `${guide}|${parsed.map((row) => `${row.id}:${row.updatedAt}:${row.highlightColor}`).join(",")}`;
  const [stable, setStable] = useState({ signature, rows: parsed });
  if (stable.signature !== signature) setStable({ signature, rows: parsed });
  const rows = stable.signature === signature ? stable.rows : parsed;
  const saveHighlight = useMutation(api.annotations.saveGuideHighlight);
  const updateHighlight = useMutation(api.annotations.updateGuideHighlight);
  const deleteHighlight = useMutation(api.annotations.deleteGuideHighlight);
  const painted = useRef<Painted[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);

  // Paint the rows over the guide as it is now, and again whenever its text is replaced (another week's
  // guide, a re-render that sets new HTML). Only this hook's own highlight names are touched.
  useEffect(() => {
    if (!highlightsSupported()) return;
    installHighlightStyles();
    let frame = 0;
    const paint = () => {
      frame = 0;
      const ranges = new Map<HighlightColor, Range[]>(COLORS.map((color) => [color, []]));
      const next: Painted[] = [];
      for (const part of PARTS) {
        const elements = partRoots(roots, part);
        const own = rows.filter((row) => row.part === part);
        if (elements.length === 0 || own.length === 0) continue;
        const index = buildIndex(elements);
        for (const row of own) {
          const at = resolveAnchor(index, row);
          const areas = at ? rangesFor(index, at.start, at.end) : [];
          if (areas.length === 0) continue;
          ranges.get(row.highlightColor)?.push(...areas);
          next.push({ row, ranges: areas });
        }
      }
      for (const color of COLORS) {
        const list = ranges.get(color) ?? [];
        if (list.length) CSS.highlights.set(highlightName(color), new Highlight(...list));
        else CSS.highlights.delete(highlightName(color));
      }
      painted.current = next;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    paint();
    const observer = new MutationObserver(schedule);
    for (const part of PARTS) {
      for (const root of partRoots(roots, part)) observer.observe(root, { childList: true, subtree: true, characterData: true });
    }
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      for (const color of COLORS) CSS.highlights.delete(highlightName(color));
      painted.current = [];
    };
  }, [rows, roots, layoutKey]);

  const open = ({ part, range, editId }: { part: GuidePart; range: Range; editId: string | null }) => {
    const row = editId ? rows.find((item) => item.id === editId) : undefined;
    if (row) {
      setEditing({ kind: "edit", row });
      return;
    }
    const elements = partRoots(roots, part);
    // The selection is inside one of the part's elements (see GuideSelectionButton).
    if (!elements.some((root) => root.contains(range.startContainer) && root.contains(range.endContainer))) return;
    const index = buildIndex(elements);
    const start = positionIn(index, range.startContainer, range.startOffset);
    const end = positionIn(index, range.endContainer, range.endOffset);
    if (start == null || end == null) return;
    setEditing({ kind: "create", part, described: describeSpan(index, start, end) });
  };

  /** After a save or removal the selection has done its job; clear it so the highlight shows. */
  const clearSelection = () => {
    const selection = document.getSelection();
    if (selection && PARTS.some((part) => partRoots(roots, part).some((root) => root.contains(selection.anchorNode)))) {
      selection.removeAllRanges();
    }
  };

  let layer: ReactNode;
  if (!editing) {
    layer = <GuideSelectionButton roots={roots} painted={painted} onOpen={open} />;
  } else if (editing.kind === "edit") {
    const { row } = editing;
    const highlightId = row.id as Id<"guideHighlights">;
    layer = (
      <GuideHighlightDialog
        key={row.id}
        quote={row.exact}
        problem={null}
        current={row.highlightColor}
        status={status}
        supported={highlightsSupported()}
        signedIn={!!user}
        onSignIn={() => {
          void promptSignIn();
        }}
        onSave={async (highlightColor) => {
          await updateHighlight({ highlightId, highlightColor });
          clearSelection();
        }}
        onRemove={async () => {
          await deleteHighlight({ highlightId });
          clearSelection();
        }}
        onClose={() => setEditing(null)}
      />
    );
  } else {
    const { described, part } = editing;
    layer = (
      <GuideHighlightDialog
        quote={described.ok ? described.anchor.exact : null}
        problem={
          described.ok
            ? null
            : described.reason === "too-long"
              ? "Select a shorter passage to highlight."
              : "Select some text to highlight."
        }
        current={null}
        status={status}
        supported={highlightsSupported()}
        signedIn={!!user}
        onSignIn={() => {
          void promptSignIn();
        }}
        onSave={async (highlightColor) => {
          if (!described.ok) return;
          await saveHighlight({ guide, part, ...described.anchor, highlightColor });
          clearSelection();
        }}
        onRemove={null}
        onClose={() => setEditing(null)}
      />
    );
  }

  return { layer };
}
