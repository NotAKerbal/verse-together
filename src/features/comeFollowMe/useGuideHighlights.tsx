"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { useMutation, useQueries } from "convex/react";
import VerseActionBar, { type VerseActionAnchorRect, type VerseQuickMarks } from "@/components/VerseActionBar";
import MarkSample from "@/features/annotations/MarkSample";
import { markHighlightColor, markUnderlineColor } from "@/features/annotations/markColors";
import { useMarkPresets } from "@/features/annotations/useVerseQuickMarks";
import { markPresetLabel, quickMarkPatch, type MarkColor } from "@/features/annotations/verseAnnotations";
import { useAuth } from "@/lib/auth";
import { getDefaultPreferences, readLocalPreferences } from "@/lib/preferences";
import { MARK_COLORS, isMarkColor, type GuideAnnotationPatch } from "../../../convex/annotationRules";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { deviceStudy } from "../notes/deviceStudy";
import { useDeviceStudy } from "../notes/useDeviceStudy";
import GuideAnnotationEditor from "./GuideAnnotationEditor";
import {
  describeSpan,
  guideSelectionMarks,
  guideSelectionTargets,
  isUsableBlockId,
  locate,
  readGuideHighlight,
  resolveAnchor,
  withGuideAnnotation,
  type Described,
  type GuideAnnotationTarget,
  type GuideHighlight,
  type GuidePart,
  type PlacedGuideHighlight,
  type TextIndex,
} from "./guideAnchors";
import styles from "./studyCompanion.module.css";
import { useHeldSelection } from "./useHeldSelection";

/*
  Study-guide annotations: select any of the guide's prose (the introduction, the reader's guide side, or the
  closing sections) and the same selection menu as the scripture pane's opens beside it: the reader's quick
  marks, the Annotate panel (any highlight or underline color, and a note), and Copy. A mark or note belongs to
  exactly the selected text. Marks are painted with the CSS Custom Highlight API (backgrounds for highlights,
  text decorations for underlines), which marks DOM ranges without touching the guide's markup: its text
  nodes, links, ids, and every measured position stay exactly as they are. Browsers without that API read the
  guide as before and are told guide marks can't show there.

  A part can be rendered in more than one element: the closing sections were once the end of the reader's
  guide, and are still the "reader" part, read as one text after it. So highlights saved before they moved
  out of it (and new ones in them) keep the same anchors.
*/

type Roots = Record<GuidePart, ReadonlyArray<RefObject<HTMLElement | null>>>;
type Status = "loading" | "ready" | "unavailable";

const PARTS: readonly GuidePart[] = ["introduction", "reader"];
const highlightName = (color: MarkColor) => `cfm-guide-${color.replace("#", "hex-")}`;
const underlineName = (color: MarkColor) => `cfm-guide-underline-${color.replace("#", "hex-")}`;
/** A note on a span with no underline of its own: a dotted underline, so the note can be found again. */
const NOTE_NAME = "cfm-guide-note";

// The verse marks' colors (globals.css), so a guide's marks and a verse's look alike on both themes. An
// underline is a text decoration: it paints under the words on every line the span runs across, and never
// moves them.
function highlightCss(colors: readonly MarkColor[]) {
  return `
${colors.map((color) => `::highlight(${highlightName(color)}) { background-color: ${markHighlightColor(color)}; }`).join("\n")}
${colors.map(
  (color) =>
    `::highlight(${underlineName(color)}) { text-decoration-line: underline; text-decoration-color: ${markUnderlineColor(color)}; text-decoration-thickness: max(1.5px, 0.08em); text-underline-offset: 0.22em; }`
).join("\n")}
::highlight(${NOTE_NAME}) { text-decoration-line: underline; text-decoration-style: dotted; text-decoration-color: var(--cfm-muted, currentColor); text-decoration-thickness: max(1.5px, 0.08em); text-underline-offset: 0.22em; }
@media (forced-colors: active) {
${colors.map((color) => `  ::highlight(${highlightName(color)}) { background-color: Mark; color: MarkText; }`).join("\n")}
${colors.map((color) => `  ::highlight(${underlineName(color)}) { text-decoration-color: CanvasText; }`).join("\n")}
}
`;
}

function highlightsSupported() {
  return (
    typeof window !== "undefined" &&
    typeof Highlight === "function" &&
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    "adoptedStyleSheets" in document
  );
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

/** A painted span: its row, where it is in its part's text now, and its DOM ranges (one per element it runs through). */
type Painted = PlacedGuideHighlight & { ranges: Range[] };

const NOTHING_PAINTED: Painted[] = [];

/** What the guide has painted, for the selection menu (which reads it as a store: painting happens in an effect). */
function createPaintedStore() {
  let painted = NOTHING_PAINTED;
  const listeners = new Set<() => void>();
  return {
    get: () => painted,
    set: (next: Painted[]) => {
      painted = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
type PaintedStore = ReturnType<typeof createPaintedStore>;

/** A text selection in the guide: its part, its span there (or why it can't be one), its text, and where it is. */
type GuideSelection = {
  /** The selection's identity: its part and trimmed span (or text, when it can't be anchored). */
  key: string;
  part: GuidePart;
  described: Described;
  text: string;
  reference: string;
  anchor: VerseActionAnchorRect;
};

const HEADINGS = "h1, h2, h3, h4, h5, h6";
const REFERENCE_MAX = 64;

/** "Study guide · <the heading the selection is under>", for the menu's footer. */
function guideReference(roots: HTMLElement[], node: Node): string {
  const root = roots.find((each) => each.contains(node));
  let heading: Element | null = null;
  for (const each of root?.querySelectorAll(HEADINGS) ?? []) {
    if (each.contains(node) || each.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) heading = each;
    else break;
  }
  const title = heading?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (!title) return "Study guide";
  return `Study guide · ${title.length > REFERENCE_MAX ? `${title.slice(0, REFERENCE_MAX - 1).trimEnd()}…` : title}`;
}

function sameGuideSelection(a: GuideSelection, b: GuideSelection) {
  if (a === b) return true;
  const anchorKeys = ["top", "left", "width", "height"] as const;
  return a.key === b.key && a.reference === b.reference && anchorKeys.every((key) => a.anchor[key] === b.anchor[key]);
}

/** The part a node is in, if any. */
function partOf(roots: Roots, node: Node): GuidePart | undefined {
  return PARTS.find((name) => roots[name].some((ref) => ref.current?.contains(node)));
}

/** The DOM selection set to a painted span's text (from its first range's start to its last's end). */
function selectPainted(item: Painted) {
  const first = item.ranges[0];
  const last = item.ranges[item.ranges.length - 1];
  const selection = document.getSelection();
  if (!first || !last || !selection) return;
  const range = document.createRange();
  range.setStart(first.startContainer, first.startOffset);
  range.setEnd(last.endContainer, last.endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

const QUOTE_SNIPPET = 48;

function snippet(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > QUOTE_SNIPPET ? `${flat.slice(0, QUOTE_SNIPPET - 1).trimEnd()}…` : flat;
}

/** What a saved span holds, for its label: "Yellow highlight, red underline, note". */
function spanSummary(row: GuideHighlight) {
  return [
    row.highlightColor ? markPresetLabel({ kind: "highlight", color: row.highlightColor }) : null,
    row.underlineColor ? markPresetLabel({ kind: "underline", color: row.underlineColor }) : null,
    row.body.trim() ? "note" : null,
  ]
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : part!.toLowerCase()))
    .join(", ");
}

/**
 * The saved spans touching the selection, in the Annotate panel: the selected one (if the selection is exactly
 * a saved span) marked as such, and every overlapping one, which can be selected in turn to change it. A
 * change to the selection never reaches them on its own.
 */
function SavedPassages({
  exact,
  overlapping,
  onSelect,
}: {
  exact: Painted | null;
  overlapping: readonly Painted[];
  onSelect: (item: Painted) => void;
}) {
  const items = (exact ? [exact, ...overlapping] : [...overlapping]).sort((a, b) => a.start - b.start || a.end - b.end);
  if (overlapping.length === 0) return null;
  return (
    <section className="selection-annotate-section" aria-label="Saved passages here">
      <h4 className="selection-annotate-label">Saved passages here</h4>
      <p className="selection-annotate-empty">Marks apply to exactly the selected text. Select a saved passage to change it.</p>
      <ul className={styles.savedPassages}>
        {items.map((item) => {
          const current = item === exact;
          return (
            <li key={item.row.id}>
              <button
                type="button"
                className={styles.savedPassage}
                aria-current={current || undefined}
                aria-disabled={current || undefined}
                title={current ? "This is the selected text" : "Select this saved passage"}
                onMouseDown={(event) => {
                  if (event.button === 0) event.preventDefault();
                }}
                onClick={() => {
                  if (!current) onSelect(item);
                }}
              >
                <span className={styles.savedPassageMarks} aria-hidden="true">
                  {item.row.highlightColor ? <MarkSample preset={{ kind: "highlight", color: item.row.highlightColor }} /> : null}
                  {item.row.underlineColor ? <MarkSample preset={{ kind: "underline", color: item.row.underlineColor }} /> : null}
                </span>
                <span className={styles.savedPassageText}>
                  <span className={styles.savedPassageQuote}>“{snippet(item.row.exact)}”</span>
                  <span className={styles.savedPassageSummary}>
                    {current ? `Selected · ${spanSummary(item.row)}` : spanSummary(item.row)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type GuideEditing = { part: GuidePart; described: Extract<Described, { ok: true }>; rowId: string | null };

/**
 * The selection menu (the shared VerseActionBar) beside a text selection in the guide's prose: the reader's
 * quick marks and the Annotate panel (any style and color, the saved passages the selection overlaps, and the
 * full note editor), and Copy. Insights, Resources, and the scripture actions aren't the guide's and aren't
 * offered. Its own component, so following a selection re-renders only the menu.
 */
function GuideSelectionMenu({
  guide,
  roots,
  rows,
  status,
  painted,
  onEdit,
}: {
  guide: string;
  roots: Roots;
  rows: readonly GuideHighlight[];
  status: Status;
  painted: PaintedStore;
  onEdit: (editing: GuideEditing) => void;
}) {
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  // Until the account's presets load, this device's copy of them (the menu shows only after a selection, in the browser).
  const [fallbackPresets] = useState(() => (readLocalPreferences() ?? getDefaultPreferences()).markPresets);
  const { presets, ready: presetsReady, convexReady } = useMarkPresets(fallbackPresets);
  /** The last selection's boundaries and its span: following a selection as the page scrolls doesn't re-read the guide. */
  const spanCache = useRef<{ range: Range; part: GuidePart; described: Described } | null>(null);

  const contains = useCallback((node: Node) => partOf(roots, node) !== undefined, [roots]);
  const read = useCallback(
    (range: Range): GuideSelection | null => {
      // Only a selection wholly inside one element of the guide: not across into the scripture or the page.
      const part = partOf(roots, range.commonAncestorContainer);
      if (!part) return null;
      const text = range.toString().replace(/\s+/g, " ").trim();
      const rect = Array.from(range.getClientRects()).find((each) => each.width > 0 || each.height > 0);
      if (!text || !rect) return null;
      const elements = partRoots(roots, part);
      const cached = spanCache.current;
      let described: Described | null =
        cached &&
        cached.part === part &&
        cached.range.startContainer === range.startContainer &&
        cached.range.startOffset === range.startOffset &&
        cached.range.endContainer === range.endContainer &&
        cached.range.endOffset === range.endOffset
          ? cached.described
          : null;
      if (!described) {
        const index = buildIndex(elements);
        const start = positionIn(index, range.startContainer, range.startOffset);
        const end = positionIn(index, range.endContainer, range.endOffset);
        if (start == null || end == null) return null;
        described = describeSpan(index, start, end);
        spanCache.current = { range: range.cloneRange(), part, described };
      }
      const { top, left, right, bottom, width, height } = rect;
      return {
        key: described.ok ? `${part}:${described.start}:${described.end}` : `${part}:${described.reason}:${text}`,
        part,
        described,
        text,
        reference: guideReference(elements, range.startContainer),
        anchor: { top, left, right, bottom, width, height },
      };
    },
    [roots]
  );
  const { selection, clear } = useHeldSelection({ menuRef, contains, read, same: sameGuideSelection }, guide);

  const placed = useSyncExternalStore(painted.subscribe, painted.get, () => NOTHING_PAINTED);
  const described = selection?.described.ok ? selection.described : null;
  const { exact, overlapping } = useMemo(
    () =>
      selection && described
        ? (guideSelectionTargets(placed, selection.part, described.start, described.end) as {
            exact: Painted | null;
            overlapping: Painted[];
          })
        : { exact: null, overlapping: [] as Painted[] },
    [placed, selection, described]
  );
  // The selected span's row as it is now (the painted copy can lag a save by a frame).
  const exactRow = exact ? rows.find((row) => row.id === exact.row.id) ?? exact.row : null;
  const marks = guideSelectionMarks(
    exactRow,
    overlapping.map((item) => item.row)
  );

  // Marking: signed in, to the account (shown at once by an optimistic update); a guest, on this device.
  const setGuideAnnotation = useMutation(api.annotations.setGuideAnnotation).withOptimisticUpdate((store, args) => {
    const query = { guide: args.guide };
    const current: unknown = store.getQuery(api.annotations.getGuideHighlights, query);
    if (!Array.isArray(current)) return;
    const parsed = current.map(readGuideHighlight).filter((row): row is GuideHighlight => row !== null);
    const { body, highlightColor, underlineColor, highlightId, ...anchor } = args;
    store.setQuery(
      api.annotations.getGuideHighlights,
      query,
      withGuideAnnotation(parsed, { ...anchor, highlightId }, { body, highlightColor, underlineColor }) as never
    );
  });
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  // Carrying the Annotate panel across a "select this saved passage" (the panel otherwise belongs to one selection).
  const [carry, setCarry] = useState<{ from: string; to: string } | null>(null);

  const supported = selection ? highlightsSupported() : false;
  const key = selection?.key ?? "";
  const panelKey = carry && carry.to === key ? carry.from : key;

  async function mark(patch: GuideAnnotationPatch) {
    if (!selection || !described) return;
    const target: GuideAnnotationTarget = {
      guide,
      part: selection.part,
      ...described.anchor,
      // A span still saving has no id yet: the server finds it by its anchor, which is this selection's.
      highlightId: exactRow && !exactRow.id.startsWith("pending:") ? exactRow.id : undefined,
    };
    setError(null);
    if (!user) {
      try {
        deviceStudy.setGuideAnnotation(target, patch, target.highlightId);
      } catch {
        setError({ key, message: "Couldn't save that mark on this device. Allow browser storage and try again." });
      }
      return;
    }
    if (!convexReady) return;
    setPending((count) => count + 1);
    try {
      const { highlightId, ...anchor } = target;
      await setGuideAnnotation({
        ...anchor,
        highlightId: highlightId as Id<"guideHighlights"> | undefined,
        ...patch,
      });
    } catch {
      setError({ key, message: "Couldn't save that mark. Try again." });
    } finally {
      setPending((count) => count - 1);
    }
  }

  const ready = status === "ready" && supported && !!described;
  const quickMarks: VerseQuickMarks | undefined = ready
    ? {
        presets,
        marks,
        status: presetsReady ? "ready" : "loading",
        pending: pending > 0,
        error: error?.key === key ? error.message : null,
        scope: "text",
        onMark: (preset) => {
          const next = quickMarkPatch(preset, marks);
          // A verse's "underline off" is the guide's "no underline color".
          void mark(
            next.highlightColor !== undefined
              ? { highlightColor: next.highlightColor }
              : { underlineColor: next.underline === false ? null : next.underlineColor ?? null }
          );
        },
        onSignIn: () => undefined,
      }
    : status === "loading" && supported && described
      ? { presets, marks, status: "loading", scope: "text", onMark: () => undefined, onSignIn: () => undefined }
      : undefined;

  // Why the menu can't mark this selection, in place of the marks (Copy still works).
  const blocked = !supported
    ? "This browser can't show marks in the guide"
    : status === "unavailable"
      ? "Guide marks aren't available right now"
      : selection && !selection.described.ok
        ? selection.described.reason === "too-long"
          ? "Select a shorter passage to annotate"
          : "Select some text to annotate"
        : null;

  return (
    <div ref={menuRef} className={styles.selectionMenu}>
      <VerseActionBar
        visible={!!selection}
        anchorRect={selection?.anchor ?? null}
        hasSelection={!!selection}
        selectionReference={selection?.reference ?? ""}
        selectionKey={panelKey}
        selectedText={selection?.text ?? ""}
        quickMarks={quickMarks}
        annotationTitle="Annotate"
        annotationDescription={blocked ?? "Highlight, underline, or note"}
        noteLabel={exactRow?.body.trim() ? "Edit your note" : "Write a note"}
        noteDescription={pending > 0 ? "Saving marks…" : "Note and marks together"}
        // A mark still saving may not have a server id yet: the full editor waits for the save.
        annotationDisabled={!ready || pending > 0}
        annotateExtra={
          <SavedPassages
            exact={exact}
            overlapping={overlapping}
            onSelect={(item) => {
              setCarry({ from: panelKey, to: `${item.row.part}:${item.start}:${item.end}` });
              selectPainted(item);
            }}
          />
        }
        showInsightAction={false}
        onClear={clear}
        onAnnotation={() => {
          if (!selection || !described || !ready || pending > 0) return;
          onEdit({ part: selection.part, described, rowId: exactRow?.id ?? null });
        }}
      />
    </div>
  );
}

/**
 * The viewer's private annotations in a guide's prose (`guide` is the guide's week start): highlights,
 * underlines, and notes on spans of its text. `reader` lists the elements the reader part is rendered in, in
 * reading order; `layoutKey` changes whenever any of them may be rendered anew elsewhere (the closing sections
 * move between layouts). Returns the layer to render once on the page: the selection menu, or the annotation
 * editor.
 */
export function useGuideHighlights(
  guide: string,
  introduction: RefObject<HTMLElement | null>,
  reader: ReadonlyArray<RefObject<HTMLElement | null>>,
  layoutKey: string
) {
  const { user } = useAuth();
  const device = useDeviceStudy();
  const roots = useMemo<Roots>(() => ({ introduction: [introduction], reader }), [introduction, reader]);
  // useQueries rather than useQuery: a backend that doesn't have this query yet answers with an Error
  // instead of throwing, and the guide reads on without marks.
  const queries = useMemo(() => {
    const requests: Parameters<typeof useQueries>[0] = {};
    if (user) requests.highlights = { query: api.annotations.getGuideHighlights, args: { guide } };
    return requests;
  }, [guide, user]);
  const remote: unknown = useQueries(queries).highlights;
  const result: unknown = user
    ? remote
    : device.loaded
      ? device.data.highlights.filter((row) => row.owner === null && row.guide === guide)
      : undefined;
  const status: Status = result === undefined ? "loading" : Array.isArray(result) ? "ready" : "unavailable";
  // The rows keep their identity until their content changes, so the page re-rendering (it does, often,
  // while the reader scrolls) never repaints the marks.
  const parsed = Array.isArray(result)
    ? result.map(readGuideHighlight).filter((row): row is GuideHighlight => row !== null && row.guide === guide)
    : [];
  const signature = `${guide}|${parsed
    .map((row) => `${row.id}:${row.updatedAt}:${row.highlightColor}:${row.underlineColor}:${row.body.length}`)
    .join(",")}`;
  const [stable, setStable] = useState({ signature, rows: parsed });
  if (stable.signature !== signature) setStable({ signature, rows: parsed });
  const rows = stable.signature === signature ? stable.rows : parsed;
  const deleteHighlight = useMutation(api.annotations.deleteGuideHighlight);
  const saveAnnotation = useMutation(api.annotations.setGuideAnnotation);
  const [painted] = useState(createPaintedStore);
  const [editing, setEditing] = useState<GuideEditing | null>(null);

  // Paint the rows over the guide as it is now, and again whenever its text is replaced (another week's
  // guide, a re-render that sets new HTML). Only this hook's own highlight names are touched.
  useEffect(() => {
    if (!highlightsSupported()) return;
    const colors = [...new Set<MarkColor>([...MARK_COLORS, ...rows.flatMap(row => [row.highlightColor, row.underlineColor]).filter(isMarkColor)])];
    const names = [...colors.map(highlightName), ...colors.map(underlineName), NOTE_NAME];
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(highlightCss(colors));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    let frame = 0;
    const paint = () => {
      frame = 0;
      const ranges = new Map<string, Range[]>(names.map((name) => [name, []]));
      const next: Painted[] = [];
      for (const part of PARTS) {
        const elements = partRoots(roots, part);
        const own = rows.filter((row) => row.part === part);
        if (elements.length === 0 || own.length === 0) continue;
        const index = buildIndex(elements);
        for (const row of own) {
          const at = resolveAnchor(index, row);
          const areas = at ? rangesFor(index, at.start, at.end) : [];
          if (!at || areas.length === 0) continue;
          if (row.highlightColor) ranges.get(highlightName(row.highlightColor))?.push(...areas);
          if (row.underlineColor) ranges.get(underlineName(row.underlineColor))?.push(...areas);
          else if (row.body.trim()) ranges.get(NOTE_NAME)?.push(...areas);
          next.push({ row, start: at.start, end: at.end, ranges: areas });
        }
      }
      for (const name of names) {
        const list = ranges.get(name) ?? [];
        if (!list.length) {
          CSS.highlights.delete(name);
          continue;
        }
        const highlight = new Highlight(...list);
        // Underlines (and note marks) over highlight backgrounds, wherever spans overlap.
        highlight.priority = name.startsWith("cfm-guide-underline-") ? 2 : name === NOTE_NAME ? 1 : 0;
        CSS.highlights.set(name, highlight);
      }
      painted.set(next);
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
      for (const name of names) CSS.highlights.delete(name);
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(existing => existing !== sheet);
      painted.set(NOTHING_PAINTED);
    };
  }, [rows, roots, layoutKey, painted]);

  /** After a save or removal the selection has done its job; clear it so the marks show. */
  const clearSelection = () => {
    const selection = document.getSelection();
    if (selection?.anchorNode && partOf(roots, selection.anchorNode)) selection.removeAllRanges();
  };

  let layer: ReactNode;
  if (!editing) {
    layer = <GuideSelectionMenu guide={guide} roots={roots} rows={rows} status={status} painted={painted} onEdit={setEditing} />;
  } else {
    const { part, described, rowId } = editing;
    const anchor = { guide, part, ...described.anchor };
    // The span as saved now: the one the menu found (by id), else (a span that was still saving) by its anchor.
    const current =
      (rowId ? rows.find((row) => row.id === rowId) : undefined) ??
      rows.find(
        (row) =>
          row.part === part &&
          row.startBlock === anchor.startBlock &&
          row.startOffset === anchor.startOffset &&
          row.endBlock === anchor.endBlock &&
          row.endOffset === anchor.endOffset &&
          row.exact === anchor.exact
      ) ??
      null;
    const currentId = current && !current.id.startsWith("pending:") ? current.id : undefined;
    layer = (
      <GuideAnnotationEditor
        key={`${part}:${described.start}:${described.end}`}
        quote={described.anchor.exact}
        current={current}
        onSave={async (patch) => {
          if (!user) deviceStudy.setGuideAnnotation(anchor, patch, currentId);
          else await saveAnnotation({ ...anchor, highlightId: currentId as Id<"guideHighlights"> | undefined, ...patch });
          clearSelection();
        }}
        onDelete={
          current
            ? async () => {
                if (!user) deviceStudy.remove("highlights", current.id);
                else if (currentId) await deleteHighlight({ highlightId: currentId as Id<"guideHighlights"> });
                else throw new Error("Still saving");
                clearSelection();
              }
            : null
        }
        onClose={() => setEditing(null)}
      />
    );
  }

  return { layer };
}
