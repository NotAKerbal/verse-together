"use client";

// CodeMirror 6 Markdown editor for notes. The document is plain Markdown and is never rewritten:
// headings are only styled, and their "## " prefix is hidden on lines the caret is not on.

import { useEffect, useRef } from "react";
import { Annotation, Compartment, EditorSelection, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { headingRanges } from "./markdownHeadings";
import styles from "./MarkdownEditor.module.css";

export { headingRanges, HEADING_PREFIX, type HeadingRange } from "./markdownHeadings";

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaLabel?: string;
};

/** Marks transactions that mirror an external `value`, so they are not echoed back through onChange. */
const externalSync = Annotation.define<boolean>();

const lineDecorations = [1, 2, 3, 4, 5, 6].map((level) => Decoration.line({ class: `cm-md-h cm-md-h${level}` }));
const hiddenPrefix = Decoration.replace({});
const visiblePrefix = Decoration.mark({ class: "cm-md-marker" });

/** Lines touched by any selection range, only while the editor has focus. */
function activeLines(view: EditorView) {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  const { doc } = view.state;
  for (const range of view.state.selection.ranges) {
    const last = doc.lineAt(range.to).number;
    for (let line = doc.lineAt(range.from).number; line <= last; line++) lines.add(line);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const active = activeLines(view);
  // Whole-document scan so fenced code state is always right; notes are short enough for this.
  for (const heading of headingRanges(view.state.doc.toString())) {
    builder.add(heading.from, heading.from, lineDecorations[heading.level - 1]);
    builder.add(heading.from, heading.prefixEnd, active.has(heading.line) ? visiblePrefix : hiddenPrefix);
  }
  return builder.finish();
}

const headingMarkers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

const editorTheme = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "transparent",
    fontFamily: "var(--font-serif-text)",
    fontSize: "1.0625rem",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.7" },
  ".cm-content": { padding: "0.25rem 0 2.5rem", caretColor: "var(--accent-rubric)", minHeight: "12rem" },
  ".cm-line": { padding: "0 2px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent-rubric)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--accent-primary)",
  },
  ".cm-md-h": { color: "var(--ink)", letterSpacing: "-0.005em" },
  ".cm-md-h1": { fontSize: "1.6em", lineHeight: "1.25", paddingTop: "0.35em" },
  ".cm-md-h2": { fontSize: "1.3em", lineHeight: "1.3", paddingTop: "0.5em" },
  ".cm-md-h3": { fontSize: "1.15em", paddingTop: "0.4em" },
  ".cm-md-h4, .cm-md-h5, .cm-md-h6": { fontSize: "1.04em", fontWeight: "600" },
  ".cm-md-marker": { color: "var(--foreground-soft)" },
});

const readOnlyExtensions = (readOnly: boolean) => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];

export default function MarkdownEditor({ value, onChange, readOnly = false, ariaLabel = "Note" }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyCompartment = useRef(new Compartment());
  const labelCompartment = useRef(new Compartment());
  // Initial values for the one-time setup; later changes arrive through the effects below.
  const initial = useRef({ value, readOnly, ariaLabel });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the editor once per mount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { value: doc, readOnly: startReadOnly, ariaLabel: startLabel } = initial.current;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          // Includes the Markdown keymap (list continuation on Enter, markup-aware Backspace).
          markdown(),
          EditorView.lineWrapping,
          headingMarkers,
          editorTheme,
          readOnlyCompartment.current.of(readOnlyExtensions(startReadOnly)),
          labelCompartment.current.of(
            EditorView.contentAttributes.of({ "aria-label": startLabel, "aria-multiline": "true" })
          ),
          EditorView.contentAttributes.of({ spellcheck: "true", autocapitalize: "sentences" }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.some((tr) => tr.annotation(externalSync))) return;
            onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Mirror external value changes. The same text (including our own echoes) is a no-op, so the caret stays put.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    const clamp = (pos: number) => Math.min(pos, value.length);
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: EditorSelection.create(
        view.state.selection.ranges.map((range) => EditorSelection.range(clamp(range.anchor), clamp(range.head))),
        view.state.selection.mainIndex
      ),
      annotations: externalSync.of(true),
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: readOnlyCompartment.current.reconfigure(readOnlyExtensions(readOnly)) });
  }, [readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: labelCompartment.current.reconfigure(
        EditorView.contentAttributes.of({ "aria-label": ariaLabel, "aria-multiline": "true" })
      ),
    });
  }, [ariaLabel]);

  return <div ref={hostRef} className={styles.root} />;
}
