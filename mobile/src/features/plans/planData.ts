// Study plans live in the signed-in account only
// (convex/readingPlans.ts), with "read" being the account's read chapters (readingProgress:markChapterRead /
// unmarkChapterRead), so a chapter checked off here is read on the website too, and the other way round. Signed out
// there are no plans. Everything goes through the verified owner's own calls (accountCalls.ts): an
// answer for anyone else is never shown, and a change is sent only while connected and reported if it didn't save.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";
import { localDateKey, newRequestId } from "../../shared/web";
import { useAccount, type AccountStatus } from "../../account/AccountProvider";
import {
  ACCOUNT_CHANGED_MESSAGE,
  ACCOUNT_OFFLINE_MESSAGE,
  planApi,
  useAccountCalls,
  type AccountCalls,
  type ChapterRef,
  type PlanDetailData,
  type PlanSummary,
  type PlanWriteInput,
} from "../../account/accountCalls";

export type { PlanDetailData, PlanStepWithState, PlanSummary, PlanWriteInput } from "../../account/accountCalls";

/** Who the plans screens are for right now. */
export type PlansAccess =
  | { kind: "signed-out"; available: boolean }
  | { kind: "checking" }
  | { kind: "unreachable"; status: Extract<AccountStatus, "offline" | "error" | "deletion-pending"> }
  | { kind: "account"; owner: string; calls: AccountCalls | null };

export function usePlansAccess(): PlansAccess {
  const { status, user } = useAccount();
  const owner = status === "signed-in" ? (user?.appUserId ?? null) : null;
  const calls = useAccountCalls(owner);
  if (status === "unavailable") return { kind: "signed-out", available: false };
  if (status === "signed-out") return { kind: "signed-out", available: true };
  if (status === "checking") return { kind: "checking" };
  if (status === "offline" || status === "error" || status === "deletion-pending") return { kind: "unreachable", status };
  return owner ? { kind: "account", owner, calls } : { kind: "checking" };
}

/** A followed query: undefined until its first answer (the server's null included), with whether reading failed. */
export type Followed<T> = { value: T | undefined; failed: boolean; online: boolean };

function useOnline(calls: AccountCalls | null): boolean {
  const subscribe = useMemo(() => (listener: () => void) => (calls ? calls.subscribeConnection(listener) : () => {}), [calls]);
  const read = () => (calls ? calls.connected() : false);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Follows one query for the calls' owner. The answer is kept with the owner and arguments it was asked for, so a
 * different account or plan never sees it; a failed read keeps the last answer.
 */
function useFollowed<T>(calls: AccountCalls | null, ref: unknown, args: Record<string, unknown> | null): Followed<T> {
  const key = args ? JSON.stringify(args) : null;
  const [state, setState] = useState<{ owner: string; key: string; value?: T; failed: boolean } | null>(null);
  useEffect(() => {
    if (!calls || key === null) return;
    const owner = calls.owner;
    return calls.watch<T>(
      ref,
      JSON.parse(key) as Record<string, unknown>,
      (value) => setState({ owner, key, value, failed: false }),
      () => setState((previous) => (previous && previous.owner === owner && previous.key === key ? { ...previous, failed: true } : { owner, key, failed: true })),
    );
  }, [calls, ref, key]);
  const online = useOnline(calls);
  const mine = calls && state && state.owner === calls.owner && state.key === key ? state : null;
  return { value: mine ? mine.value : undefined, failed: mine?.failed ?? false, online };
}

export function useMyPlans(calls: AccountCalls | null): Followed<PlanSummary[] | null> {
  return useFollowed<PlanSummary[] | null>(calls, planApi.listMyPlans, calls ? {} : null);
}

export function usePlan(calls: AccountCalls | null, planId: string | null): Followed<PlanDetailData | null> {
  return useFollowed<PlanDetailData | null>(calls, planApi.getPlan, calls && planId ? { planId } : null);
}

function canonical(ref: ChapterRef): ChapterRef {
  return { volume: normalizeScriptureVolume(ref.volume), book: ref.book, chapter: ref.chapter };
}

/** The account's plan and read-chapter changes, through its own calls (each rejects offline or for another owner). */
export function planActions(calls: AccountCalls) {
  return {
    createPlan: (input: PlanWriteInput) => calls.mutation<{ id: string }>(planApi.createPlan, { ...input, template: "custom" }),
    updatePlan: (planId: string, input: PlanWriteInput) => calls.mutation<{ id: string }>(planApi.updatePlan, { planId, ...input }),
    deletePlan: (planId: string) => calls.mutation<{ ok: boolean }>(planApi.deletePlan, { planId }),
    /** Marks the whole chapter read and logs it in the reading history on today's local day, as the web does. */
    markChapterRead: (ref: ChapterRef) => calls.mutation(planApi.markChapterRead, { ...canonical(ref), journalDate: localDateKey(), requestId: newRequestId() }),
    unmarkChapterRead: (ref: ChapterRef) => calls.mutation(planApi.unmarkChapterRead, { ...canonical(ref) }),
  };
}

/** A plain message for a change that didn't save: offline and account changes say so; anything else is generic. */
export function planErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message === ACCOUNT_OFFLINE_MESSAGE || message === ACCOUNT_CHANGED_MESSAGE) return message;
  if (/didn't answer in time/.test(message)) return message;
  return fallback;
}

/** The server's own validation message (convex/readingPlans.ts), as the web shows it, or a generic one. */
export function planSaveMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === ACCOUNT_OFFLINE_MESSAGE || message === ACCOUNT_CHANGED_MESSAGE || /didn't answer in time/.test(message)) return message;
  const cleaned = message
    .replace(/^\[CONVEX [^\]]*\]\s*/, "")
    .replace(/^\[Request ID: [^\]]*\]\s*/, "")
    .replace(/^Server Error\s*/, "")
    .replace(/^Uncaught Error:\s*/, "")
    .split("\n")[0]
    .replace(/\s+at .*$/, "")
    .trim();
  return cleaned && !/^Server Error$/i.test(cleaned) ? cleaned : "Couldn't save the plan.";
}
