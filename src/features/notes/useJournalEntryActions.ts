"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/lib/auth";
import { deviceStudy } from "./deviceStudy";
import type { ReadingDetails } from "./ReadingChip";

/** Storage actions on saved journal entries' reading. Creating entries goes through the provider's entry draft. */
export function useJournalEntryActions() {
  const { user } = useAuth();
  const openReading = useMutation(api.insights.openReadingEntry);
  const setReading = useMutation(api.insights.setJournalReading);
  return {
    /** Opens an older reading as its (one) editable entry; resolves to that entry's id. */
    openReadingEntry: (readingId: string) =>
      openReading({ readingId: readingId as Id<"readingLogs"> | Id<"chapterReads"> }),
    setEntryReading: (draftId: string, reading: ReadingDetails | null) =>
      !user ? Promise.resolve(deviceStudy.setReading(draftId, reading)) : setReading({
        draftId: draftId as Id<"insightDrafts">,
        logged: !!reading,
        source: reading?.source,
        journalDate: reading?.journalDate,
      }),
  };
}
