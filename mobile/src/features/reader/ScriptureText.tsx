// A passage as one selectable native text (modules/scripture-text): the reader long-presses a word and drags the
// platform's own handles to a phrase, across verses. The selection reaches the screen as exact ranges of each
// verse's words (scriptureDocument.ts); marks are drawn on their exact words, with whole-verse marks beneath.
//
// The screen owns the selection. A selection the reader makes is reported up; when the screen clears it (Clear,
// Back, another passage selected) the native one is cleared too, and when the text itself changes under a
// selection (a note added beneath a verse) the same words are selected again.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { processColor, type StyleProp, type ViewStyle } from "react-native";
import {
  NativeScriptureText,
  type NativeContent,
  type NativeDecoration,
  type NativeMark,
  type NativeScriptureTextHandle,
  type NativeSelectionEvent,
} from "../../../modules/scripture-text";
import type { VerseTextRange } from "../../shared/web";
import { useTheme } from "../../theme/theme";
import { highlightFill, underlineStroke } from "./marks";
import {
  displaySelection,
  selectionKey,
  selectionRanges,
  verseRegion,
  type DocumentDecoration,
  type DocumentMark,
  type ScriptureDocument,
} from "./scriptureDocument";

function nativeColor(color: string | undefined): number {
  const value = color ? processColor(color) : null;
  return typeof value === "number" ? value : 0;
}

export type ScriptureTextHandle = {
  /** A verse's top, from the text's top (-1 before the text has laid out). */
  verseTop(verse: number): Promise<number>;
  /** The top of the line holding an offset of the document's text, from the text's top (-1 before layout). */
  offsetTop(offset: number): Promise<number>;
};

type Props = {
  document: ScriptureDocument;
  marks: readonly DocumentMark[];
  decorations?: readonly DocumentDecoration[];
  /** This text's selection as the screen holds it, or null. */
  selection: readonly VerseTextRange[] | null;
  onSelectionChange: (ranges: VerseTextRange[] | null) => void;
  /** Room left and right of the text (the reading rule and note cards draw into it). */
  textInset?: [number, number];
  onLaidOut?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ScriptureText = forwardRef<ScriptureTextHandle, Props>(function ScriptureText(
  { document, marks, decorations = [], selection, onSelectionChange, textInset, onLaidOut, style, testID },
  ref
) {
  const { colors } = useTheme();
  const native = useRef<NativeScriptureTextHandle>(null);
  const [height, setHeight] = useState<number | null>(null);
  // The selection last reported up (or restored here), so the screen's own copy of it is never echoed back.
  const reported = useRef("");
  const shownText = useRef(document.text);

  useImperativeHandle(
    ref,
    () => ({
      verseTop: async (verse) => {
        const region = verseRegion(document, verse);
        if (!region || !native.current) return -1;
        return native.current.offsetTop(region.blockStart);
      },
      offsetTop: async (offset) => (native.current ? native.current.offsetTop(offset) : -1),
    }),
    [document]
  );

  const content: NativeContent = useMemo(
    () => ({
      text: document.text,
      runs: document.runs.map((run) => ({ ...run, color: nativeColor(run.color) })),
      paragraphs: document.paragraphs,
    }),
    [document]
  );
  const nativeMarks: NativeMark[] = useMemo(
    () =>
      marks.map((mark) => ({
        start: mark.start,
        end: mark.end,
        kind: mark.kind,
        color: nativeColor(mark.kind === "highlight" ? highlightFill(colors, mark.color) : underlineStroke(colors, mark.color)),
      })),
    [marks, colors]
  );
  const nativeDecorations: NativeDecoration[] = useMemo(
    () => decorations.map((decoration) => ({ ...decoration, fill: nativeColor(decoration.fill), stroke: nativeColor(decoration.stroke) })),
    [decorations]
  );

  const key = selection ? selectionKey(selection) : "";
  useEffect(() => {
    const textChanged = shownText.current !== document.text;
    shownText.current = document.text;
    if (!textChanged && key === reported.current) return;
    reported.current = key;
    if (!selection?.length) {
      void native.current?.clearSelection();
      return;
    }
    const range = displaySelection(document, selection);
    if (range) void native.current?.setSelection(range.start, range.end);
    // `selection` is read through its key; a new array of the same words is the same selection.
  }, [key, document]);

  const onNativeSelection = (event: NativeSelectionEvent) => {
    const { start, end } = event.nativeEvent;
    const ranges = selectionRanges(document, start, end);
    reported.current = selectionKey(ranges);
    onSelectionChange(ranges.length ? ranges : null);
  };

  return (
    <NativeScriptureText
      ref={native}
      testID={testID}
      content={content}
      marks={nativeMarks}
      decorations={nativeDecorations}
      selectionColor={nativeColor(colors.footnoteHighlight)}
      textInset={textInset}
      onSelectionChange={onNativeSelection}
      onContentSizeChange={(event) => {
        setHeight(Math.ceil(event.nativeEvent.height));
        onLaidOut?.();
      }}
      style={[{ height: height ?? 1 }, style]}
    />
  );
});

export default ScriptureText;
