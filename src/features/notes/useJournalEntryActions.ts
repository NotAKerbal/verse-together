"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ReadingDetails } from "./ReadingChip";
import type { NoteSource } from "./journal";

export type JournalEntryInput = {
  journalDate: string;
  source?: NoteSource;
  markdownBody: string;
  logReading: boolean;
  requestId: string;
};

export function useJournalEntryActions() {
  const create = useMutation(api.insights.createJournalEntry);
  const openReading = useMutation(api.insights.openReadingEntry);
  const setReading = useMutation(api.insights.setJournalReading);
  return {
    openReadingEntry: (id: string) => openReading({ readingId: id as Id<"readingLogs"> | Id<"chapterReads"> }),
    createEntry: (input: JournalEntryInput) => create(input),
    setEntryReading: (id: string, logged: boolean, reading?: ReadingDetails) => setReading({ draftId: id as Id<"insightDrafts">, logged, source: reading?.source, journalDate: reading?.journalDate }),
  };
}
