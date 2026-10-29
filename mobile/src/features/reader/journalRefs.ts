// The verses the reader's own journal notes link to in a chapter (the web reader's note markers): every verse link
// in a note's Markdown, read by the same shared rule the account's listMyScriptureRefsForChapter query and the
// web's device notes use (convex/noteScriptureLinks.ts). Whoever's journal is shown supplies the notes: this
// device's, or the signed-in account's cached notes. Archived notes and reading-only entries never qualify.

import { scriptureLinksForChapter } from "../../../../convex/noteScriptureLinks";
import type { JournalEntry } from "../../shared/web";

export type VerseNoteRef = { noteId: string; title: string; verseStart: number; verseEnd: number };

/** One marker at the start of each linked passage, each note once per verse (groupVerseInsightRefsByVerse). */
export function journalRefsByVerse(
  entries: readonly JournalEntry[],
  bodies: ReadonlyMap<string, string>,
  chapter: { volume: string; book: string; chapter: number }
): Map<number, VerseNoteRef[]> {
  const grouped = new Map<number, VerseNoteRef[]>();
  for (const entry of entries) {
    if (entry.kind !== "note" || entry.status === "archived") continue;
    const body = bodies.get(entry.id) ?? "";
    // hasReaderNote: a note's own reflection flag when it has one, else whether its text has anything in it.
    if (entry.has_reflection === false || !body.trim()) continue;
    for (const ref of scriptureLinksForChapter(body, chapter)) {
      const start = Math.min(ref.verseStart, ref.verseEnd);
      const existing = grouped.get(start) ?? [];
      if (existing.some((item) => item.noteId === entry.id)) continue;
      grouped.set(start, [...existing, { noteId: entry.id, title: entry.title, verseStart: start, verseEnd: Math.max(ref.verseStart, ref.verseEnd) }]);
    }
  }
  return grouped;
}
