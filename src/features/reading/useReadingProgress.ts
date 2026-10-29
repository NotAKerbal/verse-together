"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";
import { localDateKey, newRequestId, type NoteSource } from "@/features/notes/journal";
import { useConvexSignedIn } from "@/features/notes/useConvexSignedIn";
import { useDeviceStudy } from "@/features/notes/useDeviceStudy";
import type { ReadingLogRow } from "@/features/notes/journal";
import type { ChapterRef } from "./scriptureCatalog";

function canonicalRef(ref: ChapterRef): ChapterRef {
  return { volume: normalizeScriptureVolume(ref.volume), book: ref.book, chapter: ref.chapter };
}

export function useBookProgress(volume: string, book: string) {
  const { ready } = useConvexSignedIn();
  return useQuery(
    api.readingProgress.getMyProgressForBook,
    ready ? { volume: normalizeScriptureVolume(volume), book } : "skip"
  );
}

export function useLastPosition() {
  const { ready } = useConvexSignedIn();
  return useQuery(api.readingProgress.getLastPosition, ready ? {} : "skip");
}

export function useMyReadingLog() {
  const { user, ready } = useConvexSignedIn();
  const device = useDeviceStudy();
  const remote = useQuery(api.readingProgress.listMyReadingLog, ready ? {} : "skip");
  if (user) return remote;
  if (!device.loaded) return undefined;
  return device.data.notes.filter(note => note.owner === null && note.reading_at && note.source).map((note): ReadingLogRow => ({
    id: note.id, kind: "log", origin: "manual", source: note.source!, journal_date: note.journal_date!, read_at: note.reading_at!,
    created_at: note.created_at, request_id: note.id, note_id: note.id,
  }));
}

export function useReadingProgressActions() {
  const markRead = useMutation(api.readingProgress.markChapterRead);
  const unmarkRead = useMutation(api.readingProgress.unmarkChapterRead);
  const savePosition = useMutation(api.readingProgress.setLastPosition);
  const logRead = useMutation(api.readingProgress.logReading);

  return useMemo(
    () => ({
      markChapterRead: (ref: ChapterRef, log?: { journalDate: string; requestId: string }) => {
        const entry = log ?? { journalDate: localDateKey(), requestId: newRequestId() };
        return markRead({ ...canonicalRef(ref), journalDate: entry.journalDate, requestId: entry.requestId });
      },
      logReading: (input: { source: NoteSource; journalDate: string; requestId: string }) => logRead(input),
      unmarkChapterRead: (ref: ChapterRef) => unmarkRead(canonicalRef(ref)),
      setLastPosition: (ref: ChapterRef & { verse?: number }) =>
        savePosition({ ...canonicalRef(ref), verse: ref.verse }),
    }),
    [markRead, unmarkRead, savePosition, logRead]
  );
}

export function useTrackLastPosition(volume: string, book: string, chapter: number) {
  const { user, ready } = useConvexSignedIn();
  const { setLastPosition } = useReadingProgressActions();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || !ready) return;
    setLastPosition({ volume, book, chapter }).catch(() => {});
  }, [userId, ready, volume, book, chapter, setLastPosition]);
}
