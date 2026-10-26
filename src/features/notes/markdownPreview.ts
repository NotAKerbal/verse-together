// Live preview for the notes editor, computed from the Lezer Markdown syntax tree and kept free of the editor view so
// it can be tested directly. It only describes styling: the Markdown text itself is never rewritten. Like heading
// prefixes, inline syntax (emphasis marks, link brackets and destinations, code backticks, quote markers) is hidden
// on lines the caret is not on, and shown again for editing on lines it is.

import type { syntaxTree } from "@codemirror/language";
import { safeNoteUrl } from "./journal";

type Tree = ReturnType<typeof syntaxTree>;
type SyntaxNode = Tree["topNode"];

type Line = { number: number; from: number };
/** The part of CodeMirror's Text this needs. */
export type PreviewDoc = { lineAt(pos: number): Line; line(number: number): Line; sliceString(from: number, to?: number): string };

export type PreviewRange =
  /** Syntax to hide; always within one line. */
  | { type: "hide"; from: number; to: number }
  /** Styled text. `href` is set on links that may be followed (see safeNoteUrl). */
  | { type: "mark"; from: number; to: number; className: string; href?: string }
  /** A whole line's style, at the line's start. */
  | { type: "line"; from: number; className: string };

const INLINE_STYLES: Record<string, string> = {
  Emphasis: "cm-md-em",
  StrongEmphasis: "cm-md-strong",
  InlineCode: "cm-md-code",
};
const INLINE_MARKS: Record<string, string> = {
  Emphasis: "EmphasisMark",
  StrongEmphasis: "EmphasisMark",
  InlineCode: "CodeMark",
};

/** A link destination's text as written, without the angle brackets of `[label](<url>)`. */
function destination(doc: PreviewDoc, url: SyntaxNode): string {
  const text = doc.sliceString(url.from, url.to);
  return text.startsWith("<") && text.endsWith(">") ? text.slice(1, -1) : text;
}

/**
 * Preview ranges for `tree` (the parse of `doc`). `active` holds the 1-based lines whose syntax stays visible:
 * the lines the selection touches while the editor has focus. Headings are left to markdownHeadings.ts.
 */
export function previewRanges(tree: Tree, doc: PreviewDoc, active: ReadonlySet<number>): PreviewRange[] {
  const ranges: PreviewRange[] = [];
  const lineStyles = new Map<number, string>();
  const lineOf = (pos: number) => doc.lineAt(pos);
  const isActive = (from: number, to: number) => {
    for (let line = lineOf(from).number, last = lineOf(to).number; line <= last; line++) {
      if (active.has(line)) return true;
    }
    return false;
  };
  // A replaced range that crossed a line break would hide the break itself, so those are left visible.
  const hide = (from: number, to: number) => {
    if (from < to && lineOf(from).number === lineOf(to).number) ranges.push({ type: "hide", from, to });
  };
  const styleLines = (from: number, to: number, className: string) => {
    for (let line = lineOf(from).number, last = lineOf(to).number; line <= last; line++) {
      const start = doc.line(line).from;
      if (!lineStyles.has(start)) lineStyles.set(start, className);
    }
  };

  tree.iterate({
    enter(ref) {
      const node = ref.node;
      switch (node.name) {
        case "Emphasis":
        case "StrongEmphasis":
        case "InlineCode": {
          ranges.push({ type: "mark", from: node.from, to: node.to, className: INLINE_STYLES[node.name] });
          if (!isActive(node.from, node.to)) {
            for (const mark of node.getChildren(INLINE_MARKS[node.name])) hide(mark.from, mark.to);
          }
          return;
        }
        case "Link": {
          // Only inline links: "[text]" alone is literal text unless a reference defines it, so it is left as typed.
          const url = node.getChild("URL");
          const marks = node.getChildren("LinkMark");
          if (!url || marks.length < 2) return;
          const [open, close] = marks;
          const href = safeNoteUrl(destination(doc, url)) ?? undefined;
          if (open.to < close.from) {
            ranges.push({ type: "mark", from: open.to, to: close.from, className: "cm-md-link", ...(href ? { href } : {}) });
          }
          if (!isActive(node.from, node.to)) {
            hide(open.from, open.to);
            hide(close.from, node.to);
          }
          return;
        }
        case "Autolink": {
          const url = node.getChild("URL");
          if (!url) return;
          const href = safeNoteUrl(destination(doc, url)) ?? undefined;
          ranges.push({ type: "mark", from: url.from, to: url.to, className: "cm-md-link", ...(href ? { href } : {}) });
          if (!isActive(node.from, node.to)) {
            hide(node.from, url.from);
            hide(url.to, node.to);
          }
          return false;
        }
        case "Blockquote":
          styleLines(node.from, node.to, "cm-md-quote");
          return;
        case "QuoteMark": {
          if (isActive(node.from, node.to)) return;
          // "> " is the marker; one following space belongs to it.
          hide(node.from, node.to + (doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0));
          return;
        }
        case "ListMark":
        case "HorizontalRule":
          ranges.push({
            type: "mark",
            from: node.from,
            to: node.to,
            className: node.name === "ListMark" ? "cm-md-list-mark" : "cm-md-marker",
          });
          return;
        case "FencedCode":
        case "CodeBlock": {
          styleLines(node.from, node.to, "cm-md-code-block");
          for (const child of [...node.getChildren("CodeMark"), ...node.getChildren("CodeInfo")]) {
            ranges.push({ type: "mark", from: child.from, to: child.to, className: "cm-md-marker" });
          }
          return false;
        }
      }
    },
  });

  for (const [from, className] of lineStyles) ranges.push({ type: "line", from, className });
  return ranges;
}
