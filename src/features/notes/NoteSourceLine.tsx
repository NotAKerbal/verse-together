import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faFeather, faUser } from "@fortawesome/free-solid-svg-icons";
import { formatTime, isSafeSourceHref, sourceKindLabel, type NoteSource } from "./journal";

/** Who wrote it, where it came from (a real link back) and when. A note without a source says so. */
export function NoteSourceLine({
  source,
  authorLabel,
  time,
  verb = "Wrote",
  raiseLink = false,
}: {
  source: NoteSource | null;
  authorLabel?: string;
  /** ISO timestamp the entry was recorded. */
  time: string;
  verb?: string;
  /** Lifts the source link above a card's stretched button, so it stays clickable on its own. */
  raiseLink?: boolean;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[color:var(--foreground-muted)]">
      {authorLabel ? (
        <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--ink)]">
          <FontAwesomeIcon icon={faUser} className="h-2.5 w-2.5" aria-hidden="true" />
          {authorLabel}
        </span>
      ) : null}
      <span>{verb.toLowerCase()}</span>
      {source && isSafeSourceHref(source.href) ? (
        <>
          <span>from</span>
          <Link
            href={source.href}
            className={`${raiseLink ? "relative z-[1] " : ""}inline-flex items-center gap-1 font-semibold text-[color:var(--ink)] underline decoration-[color:var(--rule-strong)] underline-offset-2 hover:decoration-[color:var(--accent-rubric)]`}
            title={`${sourceKindLabel(source)}: ${source.label}`}
          >
            <FontAwesomeIcon
              icon={source.kind === "guide" ? faFeather : faBookOpen}
              className="h-2.5 w-2.5"
              aria-hidden="true"
            />
            {source.label}
          </Link>
        </>
      ) : (
        <span className="italic">a personal note (no reading source)</span>
      )}
      <span aria-hidden="true">·</span>
      <time dateTime={time}>{formatTime(time)}</time>
    </p>
  );
}
