// Whose study the screens show and write, for the whole app. Set by AccountProvider; read by the study facades
// (journalData.ts, verseAnnotations.ts, accountGuideAnnotations.ts).
//
//  - "device": nobody is signed in (or this build has no sign-in): this device's own study, as before.
//  - "account": a signed-in account. Its cached study shows and changes queue in its outbox; `sync` is present only
//    while the session is verified and connected to Convex, so nothing is sent for an account the server hasn't
//    confirmed this run. A saved session checked earlier (its owner recorded on the device) shows that account's
//    cache while offline or still checking.
//  - "blocked": a saved session whose account isn't known yet, or can't be used (its deletion is unfinished). Nothing
//    shows, nothing is written, and the device's own study is never used in its place.

import { useSyncExternalStore } from "react";
import type { AccountStudyStore } from "./accountStudy";
import type { AnnotationChapter } from "../shared/web";

/** What the account sync engine (src/account/studySync.ts) offers the screens while connected. */
export type StudySyncPort = {
  /** Keeps a chapter's (or guide's) annotations subscribed while a screen shows it. */
  watchChapter(chapter: AnnotationChapter): () => void;
  watchGuide(guide: string): () => void;
  /** Sends what's waiting now (after a change, or Try again). */
  kick(): void;
  connected(): boolean;
  subscribeConnection(listener: () => void): () => void;
  /** Calls made only online, with no outbox: they reject offline or after a timeout. */
  call<T>(name: "openReadingEntry" | "saveJournalGoals" | "setGuideAnnotation" | "deleteGuideHighlight" | "getGuideHighlights", args: Record<string, unknown>): Promise<T>;
};

export type StudySession =
  | { mode: "device" }
  | { mode: "account"; owner: string; store: AccountStudyStore; sync: StudySyncPort | null }
  | { mode: "blocked"; reason: "checking" | "deletion-pending" | "error" };

export type StudyMode = StudySession["mode"];

const DEVICE: StudySession = { mode: "device" };
let session: StudySession = DEVICE;
let identity = 0;
const listeners = new Set<() => void>();

export function getStudySession(): StudySession {
  return session;
}

/** `silent`: set before anything has subscribed (the provider's first render), without notifying. */
export function setStudySession(next: StudySession, { silent = false }: { silent?: boolean } = {}) {
  if (
    next.mode === session.mode &&
    (next.mode !== "account" || (session.mode === "account" && session.store === next.store && session.sync === next.sync)) &&
    (next.mode !== "blocked" || (session.mode === "blocked" && session.reason === next.reason))
  ) {
    return;
  }
  if (next.mode !== session.mode || (next.mode === "account" && session.mode === "account" && next.store !== session.store)) identity += 1;
  session = next;
  if (!silent) listeners.forEach((listener) => listener());
}

/** Hears every change of whose study is shown. */
export function subscribeStudySession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStudySession(): StudySession {
  return useSyncExternalStore(subscribeStudySession, getStudySession, getStudySession);
}

export function useStudyMode(): StudyMode {
  return useStudySession().mode;
}

export function currentStudyMode(): StudyMode {
  return session.mode;
}

/** Tests: back to this device's study. */
export function resetStudySession() {
  setStudySession(DEVICE);
}

export const NOT_CONNECTED_MESSAGE = "Your account is still being checked. Try again in a moment.";
export const OFFLINE_WRITE_MESSAGE = "You're offline. Connect to the internet and try again.";

/** Changes only when study ownership changes, not on reconnect or cache updates. */
export function getStudyIdentity(): number { return identity; }
export function useStudyIdentity(): number {
  return useSyncExternalStore(subscribeStudySession, getStudyIdentity, getStudyIdentity);
}
/** Delayed UI callbacks must retain the owner they were opened for. */
export function assertStudyIdentity(opened: number): void {
  if (opened !== identity) throw new Error("Your account changed. Reopen this editor before saving.");
}
