// The signed-in account's own Convex calls beyond its study (reading plans, read chapters, the last reading position),
// for the screens that use them. AccountProvider opens one for each verified owner and Convex client, beside StudySync,
// and closes it with them: a subscription stops delivering, and a reply that arrives afterwards is refused rather than
// shown, so nothing of one account ever reaches the screens as another's. Nothing here is queued on the device: a
// change is sent only while connected, given up on after a timeout, and reported as not saved.

import { makeFunctionReference } from "convex/server";
import { useSyncExternalStore } from "react";
import type { PlanSelection } from "@/features/plans/planScope";
import type { PlanStepInput, PlanTemplate } from "@/features/plans/planSchedule";
import type { SyncClient } from "./studySync";

export type PlanSummary = {
  id: string;
  title: string;
  template: PlanTemplate;
  stepCount: number;
  readCount: number;
  startDate: string | null;
  chaptersPerDay: number | null;
  readingDays: boolean[] | null;
  selections: PlanSelection[] | null;
  createdAt: number;
  updatedAt: number;
};

export type PlanStepWithState = PlanStepInput & { index: number; readAt: number | null };
export type PlanDetailData = PlanSummary & { steps: PlanStepWithState[] };

export type PlanWriteInput = {
  title: string;
  steps: PlanStepInput[];
  selections: PlanSelection[];
  startDate?: string;
  chaptersPerDay?: number;
  readingDays?: boolean[];
};

export type ChapterRef = { volume: string; book: string; chapter: number };
export type ServerReadingPosition = ChapterRef & { verse: number | null; updatedAt: number };

/** The existing public functions (convex/readingPlans.ts, convex/readingProgress.ts); each checks its own caller. */
export const planApi = {
  listMyPlans: makeFunctionReference<"query", Record<string, never>, PlanSummary[] | null>("readingPlans:listMyPlans"),
  getPlan: makeFunctionReference<"query", { planId: string }, PlanDetailData | null>("readingPlans:getPlan"),
  createPlan: makeFunctionReference<"mutation", PlanWriteInput & { template: PlanTemplate }, { id: string }>("readingPlans:createPlan"),
  updatePlan: makeFunctionReference<"mutation", PlanWriteInput & { planId: string }, { id: string }>("readingPlans:updatePlan"),
  deletePlan: makeFunctionReference<"mutation", { planId: string }, { ok: boolean }>("readingPlans:deletePlan"),
  markChapterRead: makeFunctionReference<"mutation", ChapterRef & { journalDate: string; requestId: string }, unknown>("readingProgress:markChapterRead"),
  unmarkChapterRead: makeFunctionReference<"mutation", ChapterRef, { ok: boolean }>("readingProgress:unmarkChapterRead"),
  getLastPosition: makeFunctionReference<"query", Record<string, never>, ServerReadingPosition | null>("readingProgress:getLastPosition"),
  setLastPosition: makeFunctionReference<"mutation", ChapterRef & { verse?: number }, { ok: boolean }>("readingProgress:setLastPosition"),
};

const CALL_TIMEOUT_MS = 20_000;
export const ACCOUNT_CHANGED_MESSAGE = "Your account changed, so this wasn't saved.";
export const ACCOUNT_OFFLINE_MESSAGE = "You're offline. Connect to the internet and try again.";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Verse Together didn't answer in time. Check your connection and try again.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** One verified owner's calls through its session's Convex client. */
export class AccountCalls {
  private disposed = false;
  private stops = new Set<() => void>();

  constructor(
    readonly owner: string,
    private client: SyncClient,
    private timeoutMs = CALL_TIMEOUT_MS,
  ) {}

  live() {
    return !this.disposed;
  }

  connected() {
    return !this.disposed && this.client.connected();
  }

  subscribeConnection(listener: () => void) {
    if (this.disposed) return () => {};
    const stop = this.client.onConnectionChange(() => {
      if (!this.disposed) listener();
    });
    this.stops.add(stop);
    return () => {
      stop();
      this.stops.delete(stop);
    };
  }

  /** Follows a query; nothing is delivered once this owner's calls are closed. */
  watch<T>(ref: unknown, args: Record<string, unknown>, onValue: (value: T) => void, onError?: () => void): () => void {
    if (this.disposed) return () => {};
    const stop = this.client.watch(
      ref,
      args,
      (value) => {
        if (!this.disposed) onValue(value as T);
      },
      () => {
        if (!this.disposed) onError?.();
      },
    );
    this.stops.add(stop);
    return () => {
      stop();
      this.stops.delete(stop);
    };
  }

  async query<T>(ref: unknown, args: Record<string, unknown>): Promise<T> {
    if (this.disposed) throw new Error(ACCOUNT_CHANGED_MESSAGE);
    if (!this.client.connected()) throw new Error(ACCOUNT_OFFLINE_MESSAGE);
    const value = await withTimeout(this.client.query(ref, args), this.timeoutMs);
    if (this.disposed) throw new Error(ACCOUNT_CHANGED_MESSAGE);
    return value as T;
  }

  /** Sent only while connected. A reply arriving after this owner's calls closed is reported as not saved here. */
  async mutation<T>(ref: unknown, args: Record<string, unknown>): Promise<T> {
    if (this.disposed) throw new Error(ACCOUNT_CHANGED_MESSAGE);
    if (!this.client.connected()) throw new Error(ACCOUNT_OFFLINE_MESSAGE);
    const value = await withTimeout(this.client.mutation(ref, args), this.timeoutMs);
    if (this.disposed) throw new Error(ACCOUNT_CHANGED_MESSAGE);
    return value as T;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stops.forEach((stop) => stop());
    this.stops.clear();
  }
}

// ---- The open calls, for the screens ----

let current: AccountCalls | null = null;
const listeners = new Set<() => void>();

/** Opens `calls` for the screens (AccountProvider); returns the function that closes them. */
export function publishAccountCalls(calls: AccountCalls): () => void {
  if (current && current !== calls) current.dispose();
  current = calls;
  listeners.forEach((listener) => listener());
  return () => {
    calls.dispose();
    if (current === calls) {
      current = null;
      listeners.forEach((listener) => listener());
    }
  };
}

export function getAccountCalls(): AccountCalls | null {
  return current && current.live() ? current : null;
}

export function subscribeAccountCalls(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The open calls for `owner` (the session's verified owner), or null: never another account's. */
export function useAccountCalls(owner: string | null): AccountCalls | null {
  const calls = useSyncExternalStore(subscribeAccountCalls, getAccountCalls, getAccountCalls);
  return owner && calls && calls.owner === owner ? calls : null;
}

/** Tests: close whatever is open. */
export function resetAccountCalls() {
  current?.dispose();
  current = null;
  listeners.forEach((listener) => listener());
}
