import type { CSSProperties, ReactNode } from "react";
import type { JstRow } from "@/lib/jst";
import type { TranslationReading } from "@/lib/verseComparison";
import JstVerseText from "./JstVerseText";

export type VerseColumn = { key: string; label: string; title: string; colorClass: string };

export type VerseComparisonCell =
  | { column: VerseColumn; kind: "jst"; row: JstRow | undefined; showOmitted: boolean }
  | { column: VerseColumn; kind: "translation"; reading: TranslationReading };

export function verseColumnsScopeStyle(fontScale: number, columnCount: number) {
  return { "--verse-font-size": `${fontScale}rem`, "--verse-column-count": columnCount } as CSSProperties;
}

export function VerseColumnsHeader({ columns }: { columns: VerseColumn[] }) {
  return (
    <div className="verse-columns-header" aria-hidden="true">
      {columns.map((column) => (
        <span key={column.key} className={column.colorClass} title={column.title}>
          {column.label}
        </span>
      ))}
    </div>
  );
}

function ComparisonCellBody({ cell }: { cell: VerseComparisonCell }) {
  if (cell.kind === "jst") {
    if (cell.row) return <JstVerseText row={cell.row} showOmitted={cell.showOmitted} />;
    return (
      <span className="verse-columns-note">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No JST passage for this verse.</span>
      </span>
    );
  }
  if (cell.reading.kind === "text") return <>{cell.reading.text}</>;
  return (
    <span className="verse-columns-note">{cell.reading.kind === "same" ? "Same wording" : "No text for this verse"}</span>
  );
}

export function VerseColumnsRow({ primary, aside, cells }: {
  primary: ReactNode;
  aside?: ReactNode;
  cells: VerseComparisonCell[];
}) {
  return (
    <div className="verse-columns-row">
      <div className="verse-columns-cell">
        {primary}
        {aside ? <div className="verse-columns-aside simple-hide">{aside}</div> : null}
      </div>
      {cells.map((cell) => (
        <div
          key={cell.column.key}
          className="verse-columns-cell verse-columns-compare"
          data-verse-ignore
          data-verse-column={cell.column.key}
          data-empty={cell.kind === "jst" && !cell.row ? "true" : undefined}
        >
          {cell.kind === "jst" && cell.row?.first ? null : (
            <span className={`verse-columns-label ${cell.column.colorClass}`} title={cell.column.title}>
              {cell.column.label}
            </span>
          )}
          <ComparisonCellBody cell={cell} />
        </div>
      ))}
    </div>
  );
}
