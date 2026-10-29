// Guide prose as one selectable native text (modules/scripture-text, the same view the scripture uses): a long press
// selects a word and the platform's own handles extend it, and the selection is reported as offsets into the shown
// text. A plain tap on a link opens it (onTextPress). Marks are drawn over the text, so they go on and off without
// touching the text or the selection.
//
// The screen owns the selection: the shown range it holds for this text (or null) is restored or cleared here, and
// a change the reader makes is reported up, never echoed back.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { processColor, type AccessibilityActionEvent } from "react-native";
import {
  NativeScriptureText,
  type NativeContent,
  type NativeMark,
  type NativeScriptureTextHandle,
  type NativeSelectionEvent,
  type NativeTextPressEvent,
} from "../../../modules/scripture-text";
import type { Run } from "../../cfm/guideTypes";
import { useTheme } from "../../theme/theme";
import { highlightFill, underlineStroke } from "../reader/marks";
import { linkAt, type ProseDocument, type ProseMark } from "./guideProse";
import type { MarkColor } from "../../shared/web";

function nativeColor(color: string | undefined): number {
  const value = color ? processColor(color) : null;
  return typeof value === "number" ? value : 0;
}

export type ProseTextHandle = {
  /** The top of the line holding a shown offset, from the text's top (-1 before layout). */
  offsetTop(offset: number): Promise<number>;
};

type Props = {
  doc: ProseDocument;
  marks: readonly ProseMark[];
  /** This text's selection (shown offsets) as the screen holds it, or null. */
  selected: { start: number; end: number } | null;
  onSelectionChange: (start: number, end: number) => void;
  onLink: (run: Run) => void;
  testID?: string;
};

/** A link's accessible action name: its words. */
const linkActionName = (index: number) => `link-${index}`;

const ProseText = forwardRef<ProseTextHandle, Props>(function ProseText({ doc, marks, selected, onSelectionChange, onLink, testID }, ref) {
  const { colors } = useTheme();
  const native = useRef<NativeScriptureTextHandle>(null);
  const [height, setHeight] = useState<number | null>(null);
  // The selection last reported up (or restored here), so the screen's own copy of it is never sent back.
  const reported = useRef("");
  const shownText = useRef(doc.text);

  useImperativeHandle(ref, () => ({ offsetTop: async (offset) => (native.current ? native.current.offsetTop(offset) : -1) }), []);

  const content: NativeContent = useMemo(
    () => ({
      text: doc.text,
      runs: doc.runs.map(({ start, end, font, size, color, letterSpacing, style }) => ({ start, end, font, size, color: nativeColor(color), letterSpacing, style })),
      paragraphs: doc.paragraphs,
    }),
    [doc]
  );
  const nativeMarks: NativeMark[] = useMemo(
    () => [
      // Links are underlined first, so a reader's own marks draw over them.
      ...doc.links.map((link) => ({ start: link.start, end: link.end, kind: "underline" as const, color: nativeColor(colors.accentRubricLine) })),
      ...marks.map((mark) => ({
        start: mark.start,
        end: mark.end,
        kind: mark.kind,
        color: nativeColor(
          mark.note ? colors.foregroundSoft : mark.kind === "highlight" ? highlightFill(colors, mark.color as MarkColor) : underlineStroke(colors, mark.color as MarkColor)
        ),
      })),
    ],
    [doc, marks, colors]
  );

  const key = selected ? `${selected.start}:${selected.end}` : "";
  useEffect(() => {
    const textChanged = shownText.current !== doc.text;
    shownText.current = doc.text;
    if (!textChanged && key === reported.current) return;
    reported.current = key;
    if (!selected) void native.current?.clearSelection();
    else void native.current?.setSelection(selected.start, selected.end);
    // `selected` is read through its key.
  }, [key, doc]);

  const onNativeSelection = (event: NativeSelectionEvent) => {
    const { start, end } = event.nativeEvent;
    reported.current = end > start ? `${start}:${end}` : "";
    onSelectionChange(start, end);
  };
  const onTextPress = (event: NativeTextPressEvent) => {
    const run = linkAt(doc, event.nativeEvent.offset);
    if (run) onLink(run);
  };

  // A screen reader can't reach words inside the native text, so each link is one of its actions.
  const accessibilityActions = useMemo(
    () => doc.links.map((link, index) => ({ name: linkActionName(index), label: `Open link: ${doc.text.slice(link.start, link.end)}` })),
    [doc]
  );
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const link = doc.links.find((_, index) => linkActionName(index) === event.nativeEvent.actionName);
    if (link) onLink(link.run);
  };

  return (
    <NativeScriptureText
      ref={native}
      testID={testID}
      accessible
      accessibilityLabel={doc.text}
      accessibilityActions={accessibilityActions.length ? accessibilityActions : undefined}
      onAccessibilityAction={accessibilityActions.length ? onAccessibilityAction : undefined}
      content={content}
      marks={nativeMarks}
      decorations={[]}
      selectionColor={nativeColor(colors.footnoteHighlight)}
      onSelectionChange={onNativeSelection}
      onTextPress={onTextPress}
      onContentSizeChange={(event) => setHeight(Math.ceil(event.nativeEvent.height))}
      style={{ height: height ?? 1 }}
    />
  );
});

export default ProseText;
