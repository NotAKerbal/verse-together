import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { matchingTextMarks } from "../../../convex/annotationRules";
import { verseMarkAttributes, type VerseAnnotation } from "./verseAnnotations";

type InlineProps = { children?: ReactNode; "data-verse-ignore"?: boolean; "aria-hidden"?: boolean | "true" | "false" };
function ignored(child: { type: unknown; props: InlineProps }): boolean {
  return child.props["data-verse-ignore"] !== undefined || child.props["aria-hidden"] === true ||
    child.props["aria-hidden"] === "true" || child.type === "button" || child.type === "sup";
}

/** Text only, matching the selection helper's offsets through nested inline formatting. */
function textOf(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (!isValidElement<InlineProps>(child)) return "";
    return ignored(child) ? "" : textOf(child.props.children);
  }).join("");
}

/** Draw saved ranges on their exact words, keeping legacy whole-verse styles as the base. */
export default function VerseMarkedText({ annotation, children, formatText }: {
  annotation: VerseAnnotation | null | undefined;
  children: ReactNode;
  formatText?: (text: string) => string;
}) {
  const text = textOf(children);
  const marks = matchingTextMarks(annotation?.text_marks, text);
  const base = verseMarkAttributes(annotation);
  let offset = 0;
  function marked(nodes: ReactNode): ReactNode {
    return Children.map(nodes, child => {
      if (typeof child === "string" || typeof child === "number") {
        const value = String(child);
        const start = offset;
        const end = start + value.length;
        offset = end;
        const edges = [...new Set([start, end, ...marks.flatMap(m => [m.start, m.end])])]
          .filter(edge => edge >= start && edge <= end).sort((a, b) => a - b);
        return edges.slice(0, -1).map((from, i) => {
          const to = edges[i + 1];
          const active = marks.filter(m => m.start <= from && m.end >= to);
          const highlight = active.findLast(m => m.kind === "highlight")?.color ?? (marks.length ? base?.["data-verse-highlight"] : undefined);
          const underline = active.findLast(m => m.kind === "underline")?.color ?? (marks.length ? base?.["data-verse-underline"] : undefined);
          const raw = value.slice(from - start, to - start);
          const part = formatText ? formatText(raw) : raw;
          return highlight || underline
            ? <span key={from} className="verse-mark" data-verse-highlight={highlight} data-verse-underline={underline}>{part}</span>
            : part;
        });
      }
      if (!isValidElement<InlineProps>(child) || ignored(child)) return child;
      return cloneElement(child, {}, marked(child.props.children));
    });
  }
  return <span className="verse-mark" data-verse-text="true" data-verse-source={formatText ? text : undefined} {...(marks.length ? null : base)}>{marks.length || formatText ? marked(children) : children}</span>;
}
