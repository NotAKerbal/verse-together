// Side-by-side comparisons in two columns, as the web's grid shows them from its md breakpoint (768px) up
// (ChapterReader.tsx's `md:grid-cols-2`): the chapter's main text on the left, still one selectable native text, and
// each differing verse's translations in cells on the right, level with the verse's own cell, inside one bordered
// card around the row.
//
// The left column is the native text (readerDocument.ts `columns`); its `rows` say where each side-by-side verse's
// cell begins and where its content ends. This measures both in the laid-out text (ScriptureText's offsetTop) and the
// translations' cells as React Native lays them out, and returns `padding`: the space to add after a verse whose
// translations run taller than it (padRows), so the next verse starts below them and nothing overlaps.
//
// Measurements belong to one layout (`measureKey`: the text, its fonts, the columns' widths and the system font
// scale) and are dropped when it changes: another chapter, a rotation, a font or note change. A verse's own height is
// the distance from its cell's line to its end line, which padding never changes (it only follows the end line), so
// measuring a layout that still has earlier padding gives the same heights and the padding settles in one pass.

import { useEffect, useMemo, useState, type RefObject } from "react";
import { Text, View } from "react-native";
import { CARD_OUTSET_X, CARD_PAD, CELL_GAP, CELL_OUTSET_X, CELL_PAD, LABEL_GAP, cellLabelLineHeight, type ComparisonRow, type ReaderExtrasStyle } from "./readerDocument";
import type { ScriptureTextHandle } from "./ScriptureText";

/** The web's md breakpoint: from this window width, side-by-side comparisons sit in two columns. */
export const TWO_COLUMN_MIN_WIDTH = 768;
/** The native text's left inset (the chapter route's), which the cells' and card's boxes reach into. */
const TEXT_INSET = 12;
/** Measurements stop changing a layout's padding after this many passes, so nothing can loop. */
const MAX_PASSES = 6;

export type ColumnGeometry = {
  /** The whole width the text and cells share (the native text's own width in one column). */
  width: number;
  /** The native text's width: its cell, then its right inset (the marker gutter, when there are markers). */
  leftWidth: number;
  /** Where the translations' cells begin, and their width (the same as the main text's cell). */
  cellLeft: number;
  cellWidth: number;
};

/**
 * Two equal cells across `width`, as the web's grid has them: the main text's inside the native text (its box
 * reaching CELL_OUTSET_X past the text), the translations' beside it, CELL_GAP apart, or the marker gutter apart.
 */
export function columnGeometry(width: number, rightInset: number): ColumnGeometry {
  const edge = TEXT_INSET - CELL_OUTSET_X;
  const gap = Math.max(CELL_GAP, rightInset - CELL_OUTSET_X);
  const cellWidth = Math.max(0, Math.floor((width - 2 * edge - gap) / 2));
  // The main text's cell box ends CELL_OUTSET_X past the text, which ends at the native text's right inset.
  return { width, leftWidth: edge + cellWidth - CELL_OUTSET_X + rightInset, cellLeft: edge + cellWidth + gap, cellWidth };
}

/** The translations' cells' height beside each verse, once every one of them has been measured. */
export function rightHeights(rows: readonly ComparisonRow[], cells: ReadonlyMap<string, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of rows) {
    const heights = row.cells.map((cell) => cells.get(cellId(row.verse, cell.comparison.id)));
    if (heights.some((height) => height === undefined)) continue;
    out.set(row.verse, heights.reduce<number>((sum, height) => sum + height!, 0) + CELL_GAP * (heights.length - 1));
  }
  return out;
}

/** The space to add after each verse whose translations' cells are taller than its own content (whole dp). */
export function rowPadding(rows: readonly ComparisonRow[], left: ReadonlyMap<number, number>, right: ReadonlyMap<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of rows) {
    const own = left.get(row.verse);
    const beside = right.get(row.verse);
    if (own === undefined || beside === undefined) continue;
    // A fraction of a dp is never padded: a rounding difference between layouts mustn't change the text again.
    const extra = Math.ceil(beside - own - 0.25);
    if (extra > 0) out.set(row.verse, extra);
  }
  return out;
}

export function cellId(verse: number, comparison: string) {
  return `${verse}:${comparison}`;
}

type LeftMeasure = { key: string; tops: Map<number, number>; heights: Map<number, number>; passes: number };

function close(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other === undefined || Math.abs(other - value) > 0.5) return false;
  }
  return true;
}

export type ComparisonColumnsState = {
  measureKey: string;
  /** Each row's top in the native text (its cell's box), once measured in this layout. */
  tops: ReadonlyMap<number, number>;
  /** Each verse's own content (its cell, and its note), and its translations' cells. */
  leftHeights: ReadonlyMap<number, number>;
  rightHeights: ReadonlyMap<number, number>;
  padding: ReadonlyMap<number, number>;
  onCellLayout: (key: string, id: string, height: number) => void;
  /** How tall the text and cells need to be together (the last row's card can reach past the text). */
  minHeight: number;
};

const NO_HEIGHTS = new Map<number, number>();
const NO_CELLS = new Map<string, number>();

export function useComparisonColumns({
  rows,
  textRef,
  measureKey,
  layoutTick,
}: {
  rows: readonly ComparisonRow[];
  textRef: RefObject<ScriptureTextHandle | null>;
  /** Changes whenever the rows' heights could: the text, its fonts, either column's width, the system font scale. */
  measureKey: string;
  /** Changes whenever the native text has laid out again. */
  layoutTick: number;
}): ComparisonColumnsState {
  const [left, setLeft] = useState<LeftMeasure | null>(null);
  const [cells, setCells] = useState<{ key: string; heights: Map<string, number> } | null>(null);

  // Only this layout's measurements count: an earlier chapter's or width's are ignored until replaced.
  const leftNow = left?.key === measureKey ? left : null;
  const cellsNow = cells?.key === measureKey ? cells.heights : NO_CELLS;
  const leftHeights = leftNow?.heights ?? NO_HEIGHTS;
  const right = useMemo(() => rightHeights(rows, cellsNow), [rows, cellsNow]);
  const computed = rowPadding(rows, leftHeights, right);
  const paddingKey = rows.map((row) => computed.get(row.verse) ?? 0).join(",");
  // The same padding is the same map, so the text isn't set again for nothing.
  const padding = useMemo(() => {
    const values = paddingKey ? paddingKey.split(",").map(Number) : [];
    return new Map(rows.flatMap((row, index) => (values[index] > 0 ? [[row.verse, values[index]] as const] : [])));
  }, [rows, paddingKey]);

  // The rows' places in the native text, after each layout and each padding change (the native text may lay out a
  // moment after its props change, so once more a little later too).
  useEffect(() => {
    if (!rows.length) return;
    let live = true;
    const measure = async () => {
      const handle = textRef.current;
      if (!handle) return;
      const values = await Promise.all(rows.map((row) => Promise.all([handle.offsetTop(row.cellStart), handle.offsetTop(row.endStart)])));
      if (!live) return;
      // Before layout (-1), or a layout of other text: wait for the next.
      if (values.some(([top, end]) => top < 0 || end < top)) return;
      const tops = new Map(rows.map((row, index) => [row.verse, values[index][0] - CELL_PAD]));
      const heights = new Map(rows.map((row, index) => [row.verse, values[index][1] - values[index][0] + CELL_PAD + row.endOutset]));
      setLeft((previous) => {
        if (!previous || previous.key !== measureKey) return { key: measureKey, tops, heights, passes: 1 };
        const sameTops = close(previous.tops, tops);
        const sameHeights = close(previous.heights, heights) || previous.passes >= MAX_PASSES;
        if (sameTops && sameHeights) return previous;
        return { key: measureKey, tops, heights: sameHeights ? previous.heights : heights, passes: previous.passes + (sameHeights ? 0 : 1) };
      });
    };
    const timers = [setTimeout(measure, 32), setTimeout(measure, 300)];
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
  }, [rows, measureKey, layoutTick, paddingKey, textRef]);

  const onCellLayout = (key: string, id: string, height: number) =>
    setCells((previous) => {
      if (previous?.key === key && Math.abs((previous.heights.get(id) ?? -1) - height) <= 0.5) return previous;
      const heights = new Map(previous?.key === key ? previous.heights : []);
      heights.set(id, height);
      return { key, heights };
    });

  const tops = leftNow?.tops ?? NO_HEIGHTS;
  let minHeight = 0;
  for (const row of rows) {
    const top = tops.get(row.verse);
    if (top === undefined) continue;
    minHeight = Math.max(minHeight, top + Math.max(leftHeights.get(row.verse) ?? 0, right.get(row.verse) ?? 0) + CARD_PAD + 1);
  }
  return { measureKey, tops, leftHeights, rightHeights: right, padding, onCellLayout, minHeight };
}

type LayerProps = { rows: readonly ComparisonRow[]; columns: ComparisonColumnsState; geometry: ColumnGeometry; style: ReaderExtrasStyle };

/** Each row's card, behind the native text: one border around the verse's cell and its translations'. */
export function ComparisonCards({ rows, columns, geometry, style }: LayerProps) {
  return (
    <>
      {rows.map((row) => {
        const top = columns.tops.get(row.verse);
        const own = columns.leftHeights.get(row.verse);
        const beside = columns.rightHeights.get(row.verse);
        if (top === undefined || own === undefined || beside === undefined) return null;
        return (
          <View
            key={row.verse}
            testID={`comparison-card-${row.verse}`}
            pointerEvents="none"
            style={{
              position: "absolute",
              top: top - CARD_PAD,
              left: TEXT_INSET - CARD_OUTSET_X,
              width: geometry.width - 2 * (TEXT_INSET - CARD_OUTSET_X),
              height: Math.max(own, beside) + 2 * CARD_PAD,
              borderWidth: 1,
              borderColor: style.card.border,
              borderRadius: 6,
            }}
          />
        );
      })}
    </>
  );
}

/**
 * The translations' cells, beside each verse's own cell: label in the translation's color, then its wording, in the
 * reader's face and size. They are measured where they are first laid out, and shown once their verse's place in
 * the text is known. Their words are never part of the main text's selection.
 */
export function ComparisonCells({ rows, columns, geometry, style }: LayerProps) {
  const { lineHeight, font, size, color } = style.line;
  const label = style.lineLabel;
  const key = columns.measureKey;
  return (
    // A new layout lays every cell out again, so each is measured again.
    <View key={key} pointerEvents="box-none" style={{ position: "absolute", top: 0, left: geometry.cellLeft, width: geometry.cellWidth }}>
      {rows.map((row) => {
        const top = columns.tops.get(row.verse);
        const placed = top !== undefined;
        return (
          <View
            key={row.verse}
            testID={`comparison-row-${row.verse}`}
            accessibilityElementsHidden={!placed}
            importantForAccessibility={placed ? "auto" : "no-hide-descendants"}
            style={{ position: "absolute", top: top ?? 0, left: 0, width: geometry.cellWidth, gap: CELL_GAP, opacity: placed ? 1 : 0 }}
          >
            {row.cells.map(({ comparison, text }) => (
              <View
                key={comparison.id}
                testID={`comparison-cell-${row.verse}-${comparison.id}`}
                accessible
                accessibilityLabel={`${comparison.label}, verse ${row.verse}: ${text}`}
                onLayout={(event) => columns.onCellLayout(key, cellId(row.verse, comparison.id), event.nativeEvent.layout.height)}
                style={{ borderRadius: 4, backgroundColor: style.card.cellFill, paddingVertical: CELL_PAD, paddingHorizontal: CELL_OUTSET_X }}
              >
                <Text
                  style={{
                    fontFamily: label.font,
                    fontSize: label.size,
                    lineHeight: cellLabelLineHeight(style),
                    letterSpacing: (label.letterSpacing ?? 0) * label.size,
                    color: comparison.color,
                    marginBottom: LABEL_GAP,
                  }}
                >
                  {comparison.label.toUpperCase()}
                </Text>
                <Text style={{ fontFamily: font, fontSize: size, lineHeight, color }}>{text}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
