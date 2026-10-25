import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faLightbulb } from "@fortawesome/free-solid-svg-icons";
import type { JournalNoteEntry } from "./journal";
import { NoteSourceLine } from "./NoteSourceLine";

/**
 * The same entry preview in the journal's day chooser and the reader's sidebar. An entry that logs reading says so
 * once, on its own card; a reading with no note is titled by what was read.
 */
export function JournalNoteCard({
  note,
  selected = false,
  onOpen,
  prominent = true,
}: {
  note: Pick<JournalNoteEntry, "id" | "title" | "status" | "excerpt" | "source" | "created_at" | "reading_at"> & { author_label?: string };
  selected?: boolean;
  onOpen: () => void;
  prominent?: boolean;
}) {
  const reading = !!note.reading_at;
  const titledByReading = reading && (!note.title || note.title === "Untitled note") && !note.excerpt;
  const title = titledByReading ? `Read ${note.source?.label ?? "a passage"}` : note.title || "Untitled note";
  // The title button covers the card; the source link stays independently clickable above it.
  return (
    <li
      className={`relative rounded-[1rem] border-2 border-[color:var(--surface-border)] transition-[background-color,border-color,box-shadow] has-[button:focus-visible]:border-[color:var(--accent-secondary)] ${prominent ? "px-4 py-3" : "px-3 py-2.5"} ${
        selected
          ? "bg-[color:var(--accent-note)] shadow-[var(--surface-shadow-soft)]"
          : "bg-[color:var(--surface-card)] has-[button:hover]:bg-[color:var(--surface-button-hover)] has-[button:hover]:shadow-[var(--surface-shadow-lift)]"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        className="flex w-full cursor-pointer items-start gap-2 text-left after:absolute after:inset-0 after:rounded-[0.875rem] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[color:var(--accent-secondary)]"
      >
        <FontAwesomeIcon icon={reading ? faBookOpen : faLightbulb} className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {/* line-clamp sets its own display, so no display utility sits beside it. */}
          <span
            className={`line-clamp-2 font-display leading-snug font-extrabold tracking-[-0.02em] wrap-anywhere ${prominent ? "text-[1.12rem]" : "text-[1rem]"}`}
          >
            {title}
          </span>
          {reading && !titledByReading ? (
            <span className="mt-0.5 block text-xs font-semibold text-[color:var(--accent-secondary)]">Reading logged</span>
          ) : null}
          {note.excerpt ? (
            <span className="mt-0.5 line-clamp-2 text-xs leading-5 wrap-anywhere text-[color:var(--foreground-muted)]">{note.excerpt}</span>
          ) : null}
        </span>
        {note.status !== "draft" ? (
          <span className="pill-tag shrink-0 px-2 py-0.5 text-[0.62rem]" style={{ background: "var(--accent-mint)" }}>
            {note.status === "published" ? "Published" : "Archived"}
          </span>
        ) : null}
      </button>
      <div className="mt-1.5 pl-5">
        <NoteSourceLine
          source={note.source}
          authorLabel={note.author_label}
          time={note.created_at}
          verb={reading ? "Logged" : undefined}
          raiseLink
        />
      </div>
    </li>
  );
}
