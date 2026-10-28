// Searching the journal (this device's, or the signed-in account's with its notes' full text): every word of the query must appear in an entry's title, full text, source or
// date (case and accents ignored). Newest first.

import { entryTime, type DeviceStudy, type JournalEntry } from "../../shared/web";

export function foldText(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** `texts`: each note's full text by id (a DeviceStudy's notes, or a map); an entry without one uses its excerpt. */
export function searchJournal(entries: JournalEntry[], texts: DeviceStudy | ReadonlyMap<string, string>, query: string): JournalEntry[] {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const bodies: ReadonlyMap<string, string> = "notes" in texts ? new Map(texts.notes.map((note) => [note.id, note.markdown_body ?? ""])) : texts;
  return entries
    .filter((entry) => {
      if (entry.kind === "reading") return false;
      const haystack = foldText(
        [
          entry.kind === "note" ? entry.title : "",
          entry.kind === "note" ? bodies.get(entry.id) ?? entry.excerpt ?? "" : entry.body,
          entry.source?.label ?? "",
          entry.journal_date,
        ].join("\n")
      );
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => entryTime(b).localeCompare(entryTime(a)));
}
