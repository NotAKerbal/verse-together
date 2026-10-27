import type { ReactNode } from "react";
import type { JstRow } from "@/lib/jst";

/** "JST, Mark 9:40–48" → "Mark 9:40–48". */
function shortLabel(label: string): string {
  return label.replace(/^JST,\s*/, "");
}

/**
 * The Joseph Smith Translation's reading of one KJV verse, in the reader's own type: wording it shares with the
 * KJV reads normally and its own wording is quietly underlined, so the passage reads as one text. KJV wording it
 * leaves out is shown, struck through, only when `showOmitted` is on. JST verse numbers that differ from the KJV's
 * are kept as small numerals.
 *
 * None of this is KJV text, so it is outside the selection's scripture text (no `data-verse-text`): a highlight,
 * note, or quote can't be saved against the KJV's offsets from it.
 */
export default function JstVerseText({ row, showOmitted = false }: { row: JstRow; showOmitted?: boolean }) {
  const parts: ReactNode[] = [];
  let wrote = false;
  let spaced = false;
  row.pieces.forEach((piece, index) => {
    if (piece.kind === "verse") {
      // Before any wording, the passage label (first row) or the KJV numeral (same number) already says it.
      if (!wrote && (row.first || piece.number === String(row.verse))) return;
      parts.push(
        <span key={index} className="jst-verse-number" data-verse-ignore title={`JST verse ${piece.number}`}>
          <span className="sr-only">JST verse </span>
          {piece.number}
        </span>
      );
      return;
    }
    if (piece.kind === "omitted") {
      if (!showOmitted) return;
      if (spaced) parts.push(" ");
      spaced = true;
      parts.push(
        <del key={index} className="jst-omitted" data-verse-ignore>
          <span className="sr-only">KJV wording not in the JST: </span>
          {piece.text}
        </del>
      );
      return;
    }
    if (spaced) parts.push(" ");
    wrote = true;
    spaced = true;
    parts.push(
      piece.kind === "added" ? (
        <ins key={index} className="jst-added">
          {piece.text}
        </ins>
      ) : (
        <span key={index}>{piece.text}</span>
      )
    );
  });

  return (
    <span className="jst-reading" data-jst-reading="true">
      {row.first ? (
        <span
          className="jst-passage-label"
          data-verse-ignore
          title={`Joseph Smith Translation, ${shortLabel(row.label)}${row.compareReference ? `. Compare ${row.compareReference} (KJV).` : ""}`}
        >
          <span aria-hidden="true">JST {shortLabel(row.label).replace(/^.*?(\d+:[\d–,\s]+)$/, "$1")}</span>
          <span className="sr-only">
            Joseph Smith Translation, {shortLabel(row.label)}
            {row.compareReference ? `, compare ${row.compareReference}` : ""}.
          </span>
        </span>
      ) : null}
      {parts}
      {wrote ? null : (
        <span className="jst-no-wording" data-verse-ignore>
          The JST passage has no wording for this KJV verse.
        </span>
      )}
    </span>
  );
}
