import type { ReactNode } from "react";
import type { JstRow } from "@/lib/jst";

/** "JST, Mark 9:40–48" → "Mark 9:40–48". */
function shortLabel(label: string): string {
  return label.replace(/^JST,\s*/, "");
}

/**
 * The Joseph Smith Translation's reading of one KJV verse, in the reader's own type: wording it shares with the
 * KJV reads normally, its own wording is marked, and KJV wording it leaves out is only pointed out, so the
 * passage reads as one text. JST verse numbers that differ from the KJV's are kept as small markers.
 *
 * None of this is KJV text, so it is outside the selection's scripture text (no `data-verse-text`): a highlight,
 * note, or quote can't be saved against the KJV's offsets from it.
 */
export default function JstVerseText({ row }: { row: JstRow }) {
  const parts: ReactNode[] = [];
  let wrote = false;
  row.pieces.forEach((piece, index) => {
    if (piece.kind === "verse") {
      // Before any wording, the passage label (first row) or the KJV numeral (same number) already says it.
      if (!wrote && (row.first || piece.number === String(row.verse))) return;
      parts.push(
        <span key={index} className="jst-verse-number" data-verse-ignore>
          <span className="sr-only">JST verse </span>
          <span aria-hidden="true">JST&nbsp;</span>
          {piece.number}
        </span>
      );
      return;
    }
    if (piece.kind === "omitted") {
      parts.push(
        <span
          key={index}
          role="img"
          className="jst-omitted"
          data-verse-ignore
          aria-label={`KJV wording not in the JST: ${piece.text}`}
          title={`KJV wording not in the JST: “${piece.text}”`}
        >
          ‸
        </span>
      );
      return;
    }
    if (wrote) parts.push(" ");
    wrote = true;
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
