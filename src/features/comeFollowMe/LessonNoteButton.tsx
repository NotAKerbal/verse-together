"use client";

import { faPen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { withLiveHref } from "@/features/notes/entryDraft";
import type { NoteSource } from "@/features/notes/journal";
import { useBelowLg } from "@/features/notes/useBelowLg";
import { useConvexSignedIn } from "@/features/notes/useConvexSignedIn";
import styles from "./studyCompanion.module.css";

/**
 * A lesson's Add note: the notebook's unsaved entry, linked to the lesson and logging no reading (the header's Log
 * does that), in the phone sheet below lg or the desktop panel. An entry that already holds text or a choice is
 * shown as it is rather than replaced. Nothing is stored until the entry is saved, as a journal note (on this device
 * for guests, in the account when signed in).
 */
export default function LessonNoteButton({ source }: { source: NoteSource }) {
  const { loading } = useConvexSignedIn();
  const belowLg = useBelowLg();
  const { startEntry, openPanel, setSheetOpen } = useInsightBuilder();

  function addNote() {
    startEntry({ source: withLiveHref(source, window.location), logReading: false });
    if (belowLg) setSheetOpen(true);
    else openPanel("log");
  }

  return (
    <button type="button" onClick={addNote} disabled={loading} title={`Write a note about ${source.label}`} className={styles.noteAction}>
      <FontAwesomeIcon icon={faPen} aria-hidden="true" className={styles.noteActionIcon} />
      <span>Add note</span>
    </button>
  );
}
