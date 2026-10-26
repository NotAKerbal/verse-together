"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";
import { localDateKey, newRequestId, type NoteSource } from "@/features/notes/journal";
import { useConvexSignedIn } from "@/features/notes/useConvexSignedIn";
import { useDeviceStudy } from "@/features/notes/useDeviceStudy";
import type { ReadingLogRow } from "@/features/notes/journal";
import type { ChapterRef } from "./scriptureCatalog";
import type { PlanStepInput, PlanTemplate } from "./planSchedule";
import type { PlanSelection } from "./planScope";

export type BookProgress = NonNullable<FunctionReturnType<typeof api.readingProgress.getMyProgressForBook>>;
export type VolumeProgress = NonNullable<FunctionReturnType<typeof api.readingProgress.getMyProgressForVolume>>;
export type LastPosition = NonNullable<FunctionReturnType<typeof api.readingProgress.getLastPosition>>;
export type PlanSummary = NonNullable<FunctionReturnType<typeof api.readingPlans.listMyPlans>>[number];
export type PlanDetailData = NonNullable<FunctionReturnType<typeof api.readingPlans.getPlan>>;
export type PlanStepWithState = PlanDetailData["steps"][number];

function canonicalRef(ref: ChapterRef): ChapterRef {
  return { volume: normalizeScriptureVolume(ref.volume), book: ref.book, chapter: ref.chapter };
}

/** `undefined` while loading or signed out, `null` when the server has nothing. */
export function useBookProgress(volume: string, book: string) {
  const { ready } = useConvexSignedIn();
  return useQuery(
    api.readingProgress.getMyProgressForBook,
    ready ? { volume: normalizeScriptureVolume(volume), book } : "skip"
  );
}

export function useVolumeProgress(volume: string) {
  const { ready } = useConvexSignedIn();
  return useQuery(api.readingProgress.getMyProgressForVolume, ready ? { volume: normalizeScriptureVolume(volume) } : "skip");
}

export function useLastPosition() {
  const { ready } = useConvexSignedIn();
  return useQuery(api.readingProgress.getLastPosition, ready ? {} : "skip");
}

export function useMyPlans() {
  const { ready } = useConvexSignedIn();
  return useQuery(api.readingPlans.listMyPlans, ready ? {} : "skip");
}

export function usePlan(planId: string | null) {
  const { ready } = useConvexSignedIn();
  return useQuery(api.readingPlans.getPlan, ready && planId ? { planId } : "skip");
}

/** The signed-in user's reading history, newest first; `undefined` while loading or signed out. */
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
      /**
       * Marks the whole chapter complete and adds it to the reading history. Without `log` it is logged on
       * today's local day under a fresh requestId; pass the same `log` when retrying so a retry can't log twice.
       */
      markChapterRead: (ref: ChapterRef, log?: { journalDate: string; requestId: string }) => {
        const entry = log ?? { journalDate: localDateKey(), requestId: newRequestId() };
        return markRead({ ...canonicalRef(ref), journalDate: entry.journalDate, requestId: entry.requestId });
      },
      /** Records a reading in the history only; it never marks a chapter complete. */
      logReading: (input: { source: NoteSource; journalDate: string; requestId: string }) => logRead(input),
      unmarkChapterRead: (ref: ChapterRef) => unmarkRead(canonicalRef(ref)),
      setLastPosition: (ref: ChapterRef & { verse?: number }) =>
        savePosition({ ...canonicalRef(ref), verse: ref.verse }),
    }),
    [markRead, unmarkRead, savePosition, logRead]
  );
}

/** Records the chapter as the signed-in reader's last position; best-effort, never surfaced to the reader. */
export function useTrackLastPosition(volume: string, book: string, chapter: number) {
  const { user, ready } = useConvexSignedIn();
  const { setLastPosition } = useReadingProgressActions();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || !ready) return;
    setLastPosition({ volume, book, chapter }).catch(() => {
      // Position tracking is best-effort; the reader should never surface this.
    });
  }, [userId, ready, volume, book, chapter, setLastPosition]);
}

export type PlanWriteInput = {
  title: string;
  steps: PlanStepInput[];
  selections: PlanSelection[];
  startDate?: string;
  chaptersPerDay?: number;
  readingDays?: boolean[];
};

export type CreatePlanInput = PlanWriteInput & { template: PlanTemplate };

export function usePlanActions() {
  const create = useMutation(api.readingPlans.createPlan);
  const update = useMutation(api.readingPlans.updatePlan);
  const remove = useMutation(api.readingPlans.deletePlan);

  return useMemo(
    () => ({
      createPlan: (input: CreatePlanInput) => create(input),
      updatePlan: (planId: Id<"readingPlans">, input: PlanWriteInput) => update({ planId, ...input }),
      deletePlan: (planId: Id<"readingPlans">) => remove({ planId }),
    }),
    [create, update, remove]
  );
}
