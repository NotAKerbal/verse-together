// The signed-in account's Come, Follow Me guide annotations, for the guide's own adapter
// (src/features/cfm/guideAnnotationStore.ts, which keeps the guest rows and routes on useStudyMode/currentStudyMode).
//
// Rows are the account's getGuideHighlights for the guide, read through the web's readGuideHighlight and kept per
// account on the device for offline reading. Writes go straight to annotations:setGuideAnnotation and
// annotations:deleteGuideHighlight while connected: there is no outbox for guide spans, so every row's id is the
// account's own and may be passed back as `highlightId`. A write offline, during a session check, rejects without sending; a 20 s wait rejects but the submitted request may still finish; a write is never made for an account other than the one signed in
// when it was asked, and a reply arriving after the account changed changes nothing on screen.

import { useEffect, useMemo } from "react";
import type { GuideAnchorFields, GuideAnnotationPatch, GuideHighlight } from "../shared/web";
import { readGuideHighlight } from "../shared/web";
import { useAccountOnline, useAccountSnapshot } from "./journalData";
import { NOT_CONNECTED_MESSAGE, OFFLINE_WRITE_MESSAGE, getStudySession, useStudySession, type StudySession } from "./studySession";

export { currentStudyMode, useStudyMode, type StudyMode } from "./studySession";

/** The span to annotate: the selection's anchor in a guide, and the saved span's id when there is one. */
export type GuideAnnotationTarget = GuideAnchorFields & { guide: string; highlightId?: string };
export type GuideAnnotationsState = { status: "loading" | "ready" | "unavailable"; rows: readonly GuideHighlight[] };

const UNAVAILABLE: GuideAnnotationsState = { status: "unavailable", rows: [] };
const NO_ROWS: readonly GuideHighlight[] = [];

/** The account's spans in `guide` (when `enabled` and an account is shown); "unavailable" otherwise. */
export function useAccountGuideAnnotations(guide: string, enabled: boolean): GuideAnnotationsState {
  const session = useStudySession();
  const snapshot = useAccountSnapshot(session);
  const online = useAccountOnline(session);
  const sync = enabled && session.mode === "account" ? session.sync : null;
  useEffect(() => {
    if (!sync || !guide) return;
    return sync.watchGuide(guide);
  }, [sync, guide]);
  const rows = enabled && snapshot ? snapshot.cache.guides[guide] : undefined;
  return useMemo<GuideAnnotationsState>(() => {
    if (!enabled || session.mode !== "account") return UNAVAILABLE;
    if (rows) return { status: "ready", rows };
    return sync && online && !snapshot?.syncError ? { status: "loading", rows: NO_ROWS } : UNAVAILABLE;
  }, [enabled, session.mode, rows, sync, online, snapshot?.syncError]);
}

function connected(): Extract<StudySession, { mode: "account" }> & { sync: NonNullable<Extract<StudySession, { mode: "account" }>["sync"]> } {
  const session = getStudySession();
  if (session.mode === "device") throw new Error("Sign in to save this to your account.");
  if (session.mode === "blocked") throw new Error(session.reason === "deletion-pending" ? "Finish deleting your account in Settings, or sign out." : NOT_CONNECTED_MESSAGE);
  if (!session.sync || !session.sync.connected()) throw new Error(OFFLINE_WRITE_MESSAGE);
  return session as never;
}

/** Still the same account's study on screen (its connection may have been replaced meanwhile). */
function stillCurrent(session: ReturnType<typeof connected>) {
  const now = getStudySession();
  return now.mode === "account" && now.store === session.store && !session.store.disposed;
}

function friendly(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  if (/offline|timed out|signed out/i.test(message)) return error as Error;
  return new Error("This couldn't be saved to your account. Try again.");
}

/** Reads the guide's rows again into the account's cache (after a write, or to check a delete). */
async function refresh(session: ReturnType<typeof connected>, guide: string): Promise<readonly GuideHighlight[] | null> {
  try {
    const value = await session.sync.call<unknown[]>("getGuideHighlights", { guide });
    if (!stillCurrent(session) || !Array.isArray(value)) return null;
    const rows = value.map(readGuideHighlight).filter((row): row is GuideHighlight => !!row && row.guide === guide);
    session.store.setGuide(guide, rows);
    return rows;
  } catch {
    return null;
  }
}

export async function setAccountGuideAnnotation(target: GuideAnnotationTarget, patch: GuideAnnotationPatch): Promise<void> {
  const session = connected();
  if (target.highlightId?.startsWith("pending:")) throw new Error("This annotation has not finished saving yet.");
  const args = {
    guide: target.guide,
    part: target.part,
    startBlock: target.startBlock,
    startOffset: target.startOffset,
    endBlock: target.endBlock,
    endOffset: target.endOffset,
    exact: target.exact,
    prefix: target.prefix,
    suffix: target.suffix,
    ...(target.highlightId ? { highlightId: target.highlightId } : {}),
    ...(patch.body !== undefined ? { body: patch.body } : {}),
    ...(patch.highlightColor !== undefined ? { highlightColor: patch.highlightColor } : {}),
    ...(patch.underlineColor !== undefined ? { underlineColor: patch.underlineColor } : {}),
  };
  try {
    await session.sync.call("setGuideAnnotation", args);
  } catch (error) {
    throw friendly(error);
  }
  if (!stillCurrent(session)) throw new Error("You signed out, so this change wasn't saved here.");
  await refresh(session, target.guide);
}

export async function deleteAccountGuideAnnotation(row: GuideHighlight): Promise<void> {
  const session = connected();
  if (row.id.startsWith("pending:")) throw new Error("This annotation has not finished saving yet.");
  try {
    await session.sync.call("deleteGuideHighlight", { highlightId: row.id });
  } catch (error) {
    // Already gone (deleted elsewhere, or an earlier try whose reply was lost) is what was asked for.
    const rows = await refresh(session, row.guide);
    if (rows && !rows.some((item) => item.id === row.id)) return;
    throw friendly(error);
  }
  await refresh(session, row.guide);
}
