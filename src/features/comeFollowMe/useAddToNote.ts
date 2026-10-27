"use client";

import { useEffect, useRef, useState } from "react";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { newRequestId } from "@/features/notes/journal";

/**
 * A lesson selection menu's Add to note, as in the scripture reader: the selection's excerpt (see noteExcerpts,
 * made when pressed) goes to the end of the active note, or with no note active starts a new one holding it, and
 * the notebook opens on it. One add at a time. The selection clears (`onAdded`) only once the excerpt is in the
 * note, and only if it is still the selection the menu is on; a failure stays in the menu, for that selection,
 * until the next try. Returns the VerseActionBar props for the action.
 */
export function useAddToNote(selectionKey: string, excerpt: () => string, onAdded: () => void) {
  const { activeDraftId, addExcerptToNote } = useInsightBuilder();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const busyRef = useRef(false);
  // One request per excerpt until it is added: retrying a new note whose save may have landed is the same note.
  const requestRef = useRef<{ excerpt: string; id: string } | null>(null);
  const keyRef = useRef(selectionKey);
  useEffect(() => {
    keyRef.current = selectionKey;
  }, [selectionKey]);

  async function add() {
    if (busyRef.current) return;
    const key = selectionKey;
    const markdown = excerpt();
    if (!markdown) return;
    if (requestRef.current?.excerpt !== markdown) requestRef.current = { excerpt: markdown, id: newRequestId() };
    busyRef.current = true;
    setPending(true);
    setError(null);
    try {
      await addExcerptToNote(markdown, requestRef.current.id);
      requestRef.current = null;
      if (keyRef.current === key) onAdded();
    } catch (failure) {
      setError({ key, message: failure instanceof Error && failure.message ? failure.message : "Couldn't add that to your note. Try again." });
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  }

  return {
    showInsightAction: true,
    hasActiveInsight: activeDraftId !== null,
    insightPending: pending,
    insightError: error?.key === selectionKey ? error.message : null,
    onInsight: () => void add(),
    onNewInsight: () => void add(),
  };
}
