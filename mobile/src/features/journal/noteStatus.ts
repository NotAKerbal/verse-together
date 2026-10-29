// What the editor needs of a note beyond its text (JournalNoteEditor.tsx): whether it may still be edited. Only a
// draft is; a published note (it may be shared) or an archived one is shown read-only, as on the website, where
// convex/insights.ts refuses to save either and refuses to delete a published one. Read from whoever's study is
// shown (journalData.ts), so it is the current owner's note or nothing.

import { useMemo } from "react";
import { accountNote } from "../../storage/accountStudy";
import { useAccountSnapshot } from "../../storage/journalData";
import { useStudySession } from "../../storage/studySession";
import { useDeviceStudy } from "../../storage/study";

export type NoteStatus = "draft" | "published" | "archived";

export type NoteEditing = {
  status: NoteStatus;
  /** False for an older note made of blocks, shown (and, once edited, saved) as Markdown text. */
  canonical: boolean;
};

const DRAFT: NoteEditing = { status: "draft", canonical: true };

function statusOf(value: unknown): NoteStatus {
  return value === "published" || value === "archived" ? value : "draft";
}

/** The note's status in the study shown; a note not found here (yet) is treated as the draft the editor has. */
export function useNoteEditing(id: string | null): NoteEditing {
  const session = useStudySession();
  const study = useDeviceStudy();
  const snapshot = useAccountSnapshot(session);
  return useMemo(() => {
    if (!id) return DRAFT;
    if (session.mode === "device") {
      const note = study.notes.find((row) => row.id === id && row.owner === null);
      return note ? { status: statusOf(note.status), canonical: note.markdown_canonical !== false } : DRAFT;
    }
    if (session.mode !== "account" || !snapshot) return DRAFT;
    const doc = accountNote(snapshot, id)?.doc;
    return doc ? { status: statusOf(doc.status), canonical: doc.markdown_canonical !== false } : DRAFT;
  }, [id, session, study, snapshot]);
}

export function isReadOnly(editing: NoteEditing) {
  return editing.status !== "draft";
}

/** Published notes stay: they may be shared, and the server refuses to delete them. */
export function canDelete(editing: NoteEditing) {
  return editing.status !== "published";
}
