"use client";

// CodeMirror 6 Markdown editor for notes. The document is plain Markdown and is never rewritten: headings, emphasis,
// links, quotes, lists and code are only styled, and their syntax is hidden on lines the caret is not on.

import { useEffect, useRef, type MouseEvent } from "react";
import { Annotation, Compartment, EditorSelection, EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, placeholder as placeholderText, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { safeNoteUrl } from "./journal";
import { headingRanges } from "./markdownHeadings";
import { previewRanges } from "./markdownPreview";
import styles from "./MarkdownEditor.module.css";

export { headingRanges, HEADING_PREFIX, type HeadingRange } from "./markdownHeadings";

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaLabel?: string;
  /** Shown while the document is empty. */
  placeholder?: string;
  /** Focus the editor once it has loaded. */
  autoFocus?: boolean;
};

/** Marks transactions that mirror an external `value`, so they are not echoed back through onChange. */
const externalSync = Annotation.define<boolean>();

const lineDecorations = [1, 2, 3, 4, 5, 6].map((level) => Decoration.line({ class: `cm-md-h cm-md-h${level}` }));
const hiddenPrefix = Decoration.replace({});
const visiblePrefix = Decoration.mark({ class: "cm-md-marker" });
const hiddenSyntax = Decoration.replace({});
const LINK_TITLE = "Ctrl-click or ⌘-click to open";

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
  const { state } = view;
  const decorations: Range<Decoration>[] = [];
  const active = activeLines(view);
  // Whole-document scan so fenced code state is always right; notes are short enough for this.
  for (const heading of headingRanges(state.doc.toString())) {
    decorations.push(lineDecorations[heading.level - 1].range(heading.from));
    decorations.push((active.has(heading.line) ? visiblePrefix : hiddenPrefix).range(heading.from, heading.prefixEnd));
  }
  // The rest follows the parse, finished for the whole note when that is quick (it always is for a note).
  const tree = ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state);
  for (const range of previewRanges(tree, state.doc, active)) {
    if (range.type === "hide") decorations.push(hiddenSyntax.range(range.from, range.to));
    else if (range.type === "line") decorations.push(Decoration.line({ class: range.className }).range(range.from));
    else {
      const attributes = range.href ? { "data-md-href": range.href, title: LINK_TITLE } : undefined;
      decorations.push(Decoration.mark({ class: range.className, attributes }).range(range.from, range.to));
    }
  }
  return Decoration.set(decorations, true);
}

const markdownPreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.focusChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

// Clicking a link edits it, as anywhere in the text; Ctrl- or Cmd-click follows it in a new tab, the browser's usual
// gesture, so leaving never drops unsaved typing here. Only links safeNoteUrl allows carry an href to follow.
const followLinks = EditorView.domEventHandlers({
  mousedown(event) {
    if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
    const link = event.target instanceof Element ? event.target.closest("[data-md-href]") : null;
    const href = link ? safeNoteUrl(link.getAttribute("data-md-href") ?? "") : null;
    if (!href) return false;
    event.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer");
    return true;
  },
});

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
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-link": {
    textDecoration: "underline",
    textDecorationColor: "var(--rule-strong)",
    textUnderlineOffset: "2px",
  },
  ".cm-md-link[data-md-href]:hover": { textDecorationColor: "var(--accent-rubric)" },
  ".cm-md-code, .cm-md-code-block": { fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: "0.88em" },
  ".cm-md-code": { backgroundColor: "var(--surface-button-hover)", borderRadius: "0.25rem", padding: "0.05em 0.2em" },
  ".cm-line.cm-md-code-block": { backgroundColor: "var(--surface-button-hover)" },
  ".cm-line.cm-md-quote": {
    borderLeft: "3px solid var(--accent-secondary)",
    paddingLeft: "0.85em",
  },
  ".cm-md-list-mark": { color: "var(--accent-rubric)", fontWeight: "700" },
});

const readOnlyExtensions = (readOnly: boolean) => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];

export default function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  ariaLabel = "Note",
  placeholder,
  autoFocus = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyCompartment = useRef(new Compartment());
  const labelCompartment = useRef(new Compartment());
  // Initial values for the one-time setup; later changes arrive through the effects below.
  const initial = useRef({ value, readOnly, ariaLabel, placeholder, autoFocus });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the editor once per mount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { value: doc, readOnly: startReadOnly, ariaLabel: startLabel, placeholder: hint, autoFocus: focus } = initial.current;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          // Includes the Markdown keymap (list continuation on Enter, markup-aware Backspace).
          markdown(),
          hint ? placeholderText(hint) : [],
          EditorView.lineWrapping,
          markdownPreview,
          followLinks,
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
    if (focus) view.focus();

    // An on-screen keyboard shrinks the visual viewport (and the phone notes sheet with it) without a selection change,
    // so CodeMirror would leave the caret under the keyboard. Once the layout has followed the resize, bring the
    // selection back into view through every scrolling ancestor. Only the focused editor reacts.
    const viewport = window.visualViewport;
    let frame = 0;
    function revealSelection() {
      frame = 0;
      if (!viewport || viewport.scale > 1.01 || !view.hasFocus) return;
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main) });
    }
    function onViewportResize() {
      if (!frame) frame = window.requestAnimationFrame(revealSelection);
    }
    viewport?.addEventListener("resize", onViewportResize);
    return () => {
      viewport?.removeEventListener("resize", onViewportResize);
      if (frame) window.cancelAnimationFrame(frame);
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

  // The editor fills the note's space below its text; a press there edits at the nearest point, as on the text.
  function onMouseDown(event: MouseEvent<HTMLDivElement>) {
    const view = viewRef.current;
    if (!view || event.button !== 0 || !view.state.facet(EditorView.editable)) return;
    // Only blank space: the text handles its own presses, and a scrollbar keeps working.
    const target = event.target;
    if (target !== event.currentTarget && target !== view.dom && target !== view.scrollDOM) return;
    const scroller = view.scrollDOM.getBoundingClientRect();
    if (event.clientX >= scroller.left + view.scrollDOM.clientWidth) return;
    event.preventDefault();
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    view.focus();
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  }

  return <div ref={hostRef} className={styles.root} onMouseDown={onMouseDown} />;
}
