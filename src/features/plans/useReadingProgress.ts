"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/lib/auth";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";
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
  const { user } = useAuth();
  return useQuery(
    api.readingProgress.getMyProgressForBook,
    user ? { volume: normalizeScriptureVolume(volume), book } : "skip"
  );
}

export function useVolumeProgress(volume: string) {
  const { user } = useAuth();
  return useQuery(api.readingProgress.getMyProgressForVolume, user ? { volume: normalizeScriptureVolume(volume) } : "skip");
}

export function useLastPosition() {
  const { user } = useAuth();
  return useQuery(api.readingProgress.getLastPosition, user ? {} : "skip");
}

export function useMyPlans() {
  const { user } = useAuth();
  return useQuery(api.readingPlans.listMyPlans, user ? {} : "skip");
}

export function usePlan(planId: string | null) {
  const { user } = useAuth();
  return useQuery(api.readingPlans.getPlan, user && planId ? { planId } : "skip");
}

export function useReadingProgressActions() {
  const markRead = useMutation(api.readingProgress.markChapterRead);
  const unmarkRead = useMutation(api.readingProgress.unmarkChapterRead);
  const savePosition = useMutation(api.readingProgress.setLastPosition);

  return useMemo(
    () => ({
      markChapterRead: (ref: ChapterRef) => markRead(canonicalRef(ref)),
      unmarkChapterRead: (ref: ChapterRef) => unmarkRead(canonicalRef(ref)),
      setLastPosition: (ref: ChapterRef & { verse?: number }) =>
        savePosition({ ...canonicalRef(ref), verse: ref.verse }),
    }),
    [markRead, unmarkRead, savePosition]
  );
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
