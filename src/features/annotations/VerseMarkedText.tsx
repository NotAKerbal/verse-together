import type { ReactNode } from "react";
import { verseMarkAttributes, type VerseAnnotation } from "./verseAnnotations";

/**
 * A verse's text as the reader marked it: highlighted, underlined, or both, inline on the words themselves
 * (every wrapped line included; see .verse-mark in globals.css). The wrapper is a plain inline span whether or
 * not the verse is marked, so marking it from the selection menu changes only attributes: the text nodes (and
 * the live selection over them) stay, and text selection and word lookup still find the same text.
 */
export default function VerseMarkedText({
  annotation,
  children,
}: {
  annotation: VerseAnnotation | null | undefined;
  children: ReactNode;
}) {
  return (
    <span className="verse-mark" {...verseMarkAttributes(annotation)}>
      {children}
    </span>
  );
}
