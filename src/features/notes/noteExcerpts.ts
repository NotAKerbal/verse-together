// What a selection's Add to note puts in the note: the selected text quoted under a link back to where it was
// read, in the form the scripture reader's Add to note gives a passage (convex/noteJournal blockToMarkdown).

import { appendMarkdownChunk, blockToMarkdown, markdownLink, quoteLines } from "../../../convex/noteJournal";
import { formatPassageReference } from "../../lib/passageShare";
import type { JournalOutbox } from "./journalOutbox";

export type ExcerptSource = { label: string; href: string };

/** One selected piece of a verse, as the scripture pane reads a selection (selectedVerseRanges). */
export type VerseExcerpt = { chapter: number; verse: number; text: string };

/** Selected text quoted under a bold link to its source; empty when nothing but whitespace is selected. */
export function quotedExcerpt(text: string, source: ExcerptSource): string {
  const quote = text.trim();
  if (!quote) return "";
  return `**${markdownLink(source.label, source.href)}**\n${quoteLines(quote)}`;
}

/**
 * A scripture selection's excerpt: the selected words of each chapter quoted under that chapter's own reference
 * and link (to its first selected verse), so a selection across a chapter break credits every verse to its chapter.
 */
export function scriptureExcerpt(book: { volume: string; slug: string; label: string }, pieces: readonly VerseExcerpt[]): string {
  const chapters: Array<{ chapter: number; verses: number[]; text: string[] }> = [];
  for (const piece of pieces) {
    const text = piece.text.trim();
    if (!text) continue;
    let group = chapters.find((entry) => entry.chapter === piece.chapter);
    if (!group) chapters.push((group = { chapter: piece.chapter, verses: [], text: [] }));
    if (!group.verses.includes(piece.verse)) group.verses.push(piece.verse);
    group.text.push(text);
  }
  return chapters
    .map(({ chapter, verses, text }) =>
      blockToMarkdown({
        type: "scripture",
        text: text.join("\n\n"),
        scriptureRef: {
          volume: book.volume,
          book: book.slug,
          chapter,
          verseStart: Math.min(...verses),
          verseEnd: Math.max(...verses),
          reference: formatPassageReference(book.label, chapter, verses),
        },
      })
    )
    .join("\n\n");
}

/**
 * Puts an excerpt at the end of a note through the outbox, which saves it: after text typed there and not yet
 * saved, if any (so the two save together on the revision that text was typed on, and neither replaces the
 * other), else after `stored`, the note as stored with its revision. Returns false, queuing nothing, when the
 * note has no unsaved text and `stored` is null: the caller appends to the stored note itself. A note whose save
 * conflicted takes nothing until that is settled in the note (this throws).
 */
export function queueExcerpt(
  outbox: JournalOutbox,
  noteId: string,
  excerpt: string,
  stored: { body: string; revision: number } | null
): boolean {
  const entry = outbox.get(noteId);
  if (entry?.status === "conflict") throw new Error("This note changed somewhere else. Settle that in the note, then add again.");
  if (entry && entry.status !== "saved") {
    outbox.edit(noteId, appendMarkdownChunk(entry.text, excerpt), entry.baseRevision);
  } else if (stored) {
    // The stored copy is current; a saved outbox copy may be older (saved from another tab since).
    if (entry) outbox.discard(noteId);
    outbox.edit(noteId, appendMarkdownChunk(stored.body, excerpt), stored.revision);
  } else {
    return false;
  }
  outbox.flush(noteId);
  return true;
}
