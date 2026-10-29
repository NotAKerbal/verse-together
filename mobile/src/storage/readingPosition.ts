// Where to continue reading, for whoever's study is shown (studySession.ts), as the web's Continue reading card
// (readingProgress:getLastPosition, written by setLastPosition from the reader, useReadingProgress.ts):
//  - signed out ("device"): this device's own last chapter (preferences.ts `lastPosition`), as before;
//  - signed in ("account"): the account's last position. It's read from the account while connected, and the
//    chapters read here meanwhile show at once and are sent best effort, again after a reconnect if a send fails.
//    The device's own position is never shown, written or sent for an account, and an account's never becomes the
//    device's;
//  - an account not known yet ("blocked"): nothing.
//
// Each account's position is kept on the device under a key naming it (`vt_account_reading_position_v1:<owner>`):
// the account's last answer, and the chapter read here that the account hasn't confirmed yet. So an account shown
// offline after a restart continues where it was, and a chapter read offline is still sent after the restart. The
// record leaves the device with the account's session (forgetAccountReadingPosition).
//
// The account's answer and a chapter waiting to be sent are reconciled by which is newer: an answer replaces what
// the account said before, but a waiting chapter gives way only to a position set elsewhere after it was read (an
// answer that is news since then, not this device's own send, and later than the read), never to an older answer.
// A chapter waiting here is sent only once the account has answered on its current calls. A failed read never
// replaces what an owner last answered; an answer is taken only while its owner is shown, and a reply for an owner
// forgotten meanwhile changes nothing.

import { useEffect, useSyncExternalStore } from "react";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";
import { getAccountCalls, planApi, subscribeAccountCalls, type AccountCalls } from "../account/accountCalls";
import { storage } from "./kv";
import { lastPosition, useLastPosition, type ReadingPosition } from "./preferences";
import { getStudySession, subscribeStudySession, useStudySession } from "./studySession";

export type { ReadingPosition } from "./preferences";

export type ChapterPosition = { volume: string; book: string; chapter: number };

/** One account's position on this device: `vt_account_reading_position_v1:<appUserId>`. */
export const ACCOUNT_POSITION_PREFIX = "vt_account_reading_position_v1:";

export const POSITION_NOT_SAVED_MESSAGE = "Your reading position couldn't be saved on this device.";

/** The account's answer: its position (with the account's own time, epoch ms), or null when it has none. */
type Answer = ChapterPosition & { updatedAt: number };

/** Read here, not confirmed by the account yet; `after` is the account's answer known when it was read. */
type Pending = ReadingPosition & { after: number | null };

type OwnerRecord = {
  /** The account's last answer; undefined before it ever answered on this device. */
  server?: Answer | null;
  pending: Pending | null;
};

type OwnerState = {
  record: OwnerRecord;
  /** What the device holds for this owner (null: nothing; undefined: unknown, as when reading it failed). */
  saved: string | null | undefined;
  /** The chapter last sent from here this run, so its echo is never taken for a change made elsewhere. */
  sent: string | null;
  /** The waiting chapter being sent now, so a reconnect doesn't send it twice. */
  sending: Pending | null;
};

const owners = new Map<string, OwnerState>();
let version = 0;
const listeners = new Set<() => void>();

function changed() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;

function recordKey(owner: string) {
  return `${ACCOUNT_POSITION_PREFIX}${encodeURIComponent(owner)}`;
}

// ---- Reading what the device (or the account) holds, never trusting its shape ----

const TEXT_MAX = 80;
const CHAPTER_MAX = 1000;

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= TEXT_MAX;
}

function chapterOf(value: unknown): ChapterPosition | null {
  const row = value as Partial<ChapterPosition> | null;
  if (!row || typeof row !== "object" || !text(row.volume) || !text(row.book)) return null;
  const chapter = row.chapter;
  if (typeof chapter !== "number" || !Number.isInteger(chapter) || chapter < 1 || chapter > CHAPTER_MAX) return null;
  return { volume: row.volume, book: row.book, chapter };
}

function time(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 8_640_000_000_000_000 ? value : null;
}

/** An account answer (or null for none); undefined when it isn't one. */
function answerOf(value: unknown): Answer | null | undefined {
  if (value === null) return null;
  const chapter = chapterOf(value);
  if (!chapter) return undefined;
  return { ...chapter, updatedAt: time((value as { updatedAt?: unknown }).updatedAt) ?? 0 };
}

function pendingOf(value: unknown): Pending | null {
  const chapter = chapterOf(value);
  const row = value as Partial<Pending>;
  if (!chapter || typeof row.at !== "string" || !Number.isFinite(Date.parse(row.at))) return null;
  return { ...chapter, at: row.at, after: time(row.after) };
}

function recordOf(raw: string | null): OwnerRecord {
  if (!raw) return { pending: null };
  try {
    const value = JSON.parse(raw) as { v?: unknown; server?: unknown; pending?: unknown } | null;
    if (!value || typeof value !== "object" || value.v !== 1) return { pending: null };
    const server = "server" in value ? answerOf(value.server) : undefined;
    return { ...(server !== undefined ? { server } : {}), pending: value.pending ? pendingOf(value.pending) : null };
  } catch {
    return { pending: null };
  }
}

function serialize(record: OwnerRecord): string | null {
  if (record.server === undefined && !record.pending) return null;
  return JSON.stringify({ v: 1, ...(record.server !== undefined ? { server: record.server } : {}), pending: record.pending });
}

function load(owner: string): OwnerState {
  let state = owners.get(owner);
  if (!state) {
    let raw: string | null | undefined;
    try {
      raw = storage().getItem(recordKey(owner));
    } catch {
      raw = undefined;
    }
    const record = recordOf(raw ?? null);
    state = { record, saved: raw === undefined ? undefined : raw === null ? null : serialize(record) === raw ? raw : undefined, sent: null, sending: null };
    owners.set(owner, state);
  }
  return state;
}

/** Keeps `state.record` on the device; false (changing nothing there) when the device refuses. */
function persist(owner: string, state: OwnerState): boolean {
  const next = serialize(state.record);
  if (next === state.saved) return true;
  try {
    if (next === null) storage().removeItem(recordKey(owner));
    else storage().setItem(recordKey(owner), next);
  } catch {
    return false;
  }
  state.saved = next;
  return true;
}

// ---- Reconciling ----

function sameChapter(a: ChapterPosition, b: ChapterPosition) {
  return normalizeScriptureVolume(a.volume) === normalizeScriptureVolume(b.volume) && a.book === b.book && a.chapter === b.chapter;
}

function chapterId(position: ChapterPosition) {
  return `${normalizeScriptureVolume(position.volume)}/${position.book}/${position.chapter}`;
}

/** Whether the account's `answer` is a position set elsewhere after `pending` was read here. */
function supersedes(answer: Answer, pending: Pending, sent: string | null) {
  if (chapterId(answer) === sent) return false;
  if (pending.after !== null && answer.updatedAt <= pending.after) return false;
  return answer.updatedAt > Date.parse(pending.at);
}

function receive(owner: string, value: unknown) {
  const answer = answerOf(value);
  // Not an answer the account could give: what it said before still stands.
  if (answer === undefined) return;
  const state = load(owner);
  const { server, pending } = state.record;
  // The account holding the waiting chapter already confirms it; one set elsewhere since replaces it.
  const keepPending = pending && answer && (sameChapter(answer, pending) || supersedes(answer, pending, state.sent)) ? null : pending;
  if (keepPending === pending && server !== undefined && JSON.stringify(server) === JSON.stringify(answer)) return;
  state.record = { server: answer, pending: keepPending };
  persist(owner, state);
  changed();
}

/** The position shown for `owner`: what was read here and not yet confirmed, else the account's last answer. */
export function accountReadingPosition(owner: string): ReadingPosition | null {
  const { pending, server } = load(owner).record;
  if (pending) return { volume: pending.volume, book: pending.book, chapter: pending.chapter, at: pending.at };
  return server ? { volume: server.volume, book: server.book, chapter: server.chapter, at: new Date(server.updatedAt).toISOString() } : null;
}

/** Sends `owner`'s waiting position through `calls` (that owner's own calls); kept waiting if it fails. */
function send(calls: AccountCalls, state: OwnerState, position: Pending) {
  const owner = calls.owner;
  state.sending = position;
  state.sent = chapterId(position);
  void calls
    .mutation(planApi.setLastPosition, { volume: normalizeScriptureVolume(position.volume), book: position.book, chapter: position.chapter })
    .then(
      () => {
        if (state.sending === position) state.sending = null;
        // Forgotten meanwhile, or a later chapter read since (still waiting): nothing here changes.
        if (owners.get(owner) !== state || state.record.pending !== position) return;
        const server = state.record.server;
        const updatedAt = Math.max(Date.parse(position.at), server ? server.updatedAt : 0);
        state.record = { server: { volume: normalizeScriptureVolume(position.volume), book: position.book, chapter: position.chapter, updatedAt }, pending: null };
        // If the device refuses, the chapter stays waiting there until the account's answer confirms it: harmless.
        persist(owner, state);
        changed();
      },
      () => {
        // Best effort, as on the web: it stays waiting and is sent again once connected.
        if (state.sending === position) state.sending = null;
      },
    );
}

function showing(owner: string) {
  const session = getStudySession();
  return session.mode === "account" && session.owner === owner;
}

// The account's answers are followed while its calls are open (for the screens or not), and taken only while that
// account is shown. A waiting chapter is sent only once these calls have heard the account (or failed to), so a
// chapter read long ago, offline or before a restart, never overwrites one set elsewhere since.
let watchedCalls: AccountCalls | null = null;
let stopWatching: (() => void) | null = null;
let heard = false;
let latest: { value: unknown } | null = null;

function flush(calls: AccountCalls | null) {
  if (!calls || calls !== watchedCalls || !heard || !calls.connected() || !showing(calls.owner)) return;
  const state = load(calls.owner);
  const pending = state.record.pending;
  if (pending && state.sending !== pending) send(calls, state, pending);
}

function take(calls: AccountCalls) {
  if (calls !== watchedCalls || !showing(calls.owner)) return;
  if (latest) receive(calls.owner, latest.value);
  flush(calls);
}

subscribeAccountCalls(() => {
  const calls = getAccountCalls();
  if (calls === watchedCalls) return;
  stopWatching?.();
  watchedCalls = calls;
  heard = false;
  latest = null;
  stopWatching = null;
  if (!calls) return;
  const stopConnection = calls.subscribeConnection(() => flush(calls));
  const stopAnswers = calls.watch(
    planApi.getLastPosition,
    {},
    (value) => {
      if (calls !== watchedCalls) return;
      heard = true;
      latest = { value };
      take(calls);
    },
    () => {
      // The account couldn't be read: its waiting chapter goes anyway, best effort, as before.
      if (calls !== watchedCalls) return;
      heard = true;
      flush(calls);
    },
  );
  stopWatching = () => {
    stopConnection();
    stopAnswers();
  };
});
// Shown again (or for the first time since its calls opened): its latest answer applies, and its waiting chapter goes.
subscribeStudySession(() => {
  if (watchedCalls) take(watchedCalls);
});

/**
 * Records the chapter just opened as the reader's position, for whoever's study is shown. Signed out it's this
 * device's (throws if the device refused to save it, as `lastPosition.set` does). Signed in it's the account's: shown
 * at once and sent best effort; throws (after showing and sending it) if the device refused to keep it, so it isn't
 * reported as saved here. While the account isn't known yet, nothing is recorded.
 */
export function recordReadingPosition(position: ChapterPosition, now = new Date()) {
  const session = getStudySession();
  const next: ReadingPosition = { volume: position.volume, book: position.book, chapter: position.chapter, at: now.toISOString() };
  if (session.mode === "device") {
    lastPosition.set(next);
    return;
  }
  if (session.mode !== "account") return;
  const state = load(session.owner);
  const server = state.record.server;
  state.record = { ...state.record, pending: { ...next, after: server ? server.updatedAt : null } };
  const saved = persist(session.owner, state);
  changed();
  flush(getAccountCalls());
  if (!saved) throw new Error(POSITION_NOT_SAVED_MESSAGE);
}

/** Records the chapter as the reader's position whenever it changes (see recordReadingPosition). Never throws. */
export function useTrackReadingPosition(volume: string, book: string, chapter: number | null) {
  const session = useStudySession();
  const owner = session.mode === "account" ? session.owner : session.mode;
  useEffect(() => {
    if (!chapter) return;
    try {
      recordReadingPosition({ volume, book, chapter });
    } catch {}
  }, [owner, volume, book, chapter]);
}

/** Where Continue reading opens now, for whoever's study is shown; null when there is nowhere (or nobody known). */
export function useContinueReadingPosition(): ReadingPosition | null {
  const session = useStudySession();
  const guest = useLastPosition();
  const owner = session.mode === "account" ? session.owner : null;
  useSyncExternalStore(subscribe, getVersion, getVersion);
  if (session.mode === "device") return guest;
  if (!owner) return null;
  return accountReadingPosition(owner);
}

/**
 * The account's position leaves the device with its session (sign-out or deletion): from memory at once, and from
 * the device's storage. With `keepPending`, a chapter read here that the account hasn't received yet stays on the
 * device for that account only (sent if it signs in here again); the account's cached answer never does. Replies
 * still on their way for this owner change nothing afterwards. Returns false when the device refused to forget it.
 */
export function forgetAccountReadingPosition(owner: string, { keepPending = false }: { keepPending?: boolean } = {}): boolean {
  let pending: Pending | null = null;
  if (keepPending) {
    const known = owners.get(owner);
    if (known) pending = known.record.pending;
    else {
      try {
        pending = recordOf(storage().getItem(recordKey(owner))).pending;
      } catch {
        pending = null;
      }
    }
  }
  const had = owners.delete(owner);
  let forgotten = true;
  const kept = pending ? serialize({ pending }) : null;
  try {
    if (kept) storage().setItem(recordKey(owner), kept);
    else storage().removeItem(recordKey(owner));
  } catch {
    forgotten = false;
  }
  // Keeping the waiting chapter failed: the account's answer must still go, even with that chapter.
  if (!forgotten && kept) {
    try {
      storage().removeItem(recordKey(owner));
      forgotten = true;
    } catch {}
  }
  if (had) changed();
  return forgotten;
}

/** Tests: forget every account's position in memory, as a new run of the app would (the device's records stay). */
export function resetReadingPositions() {
  owners.clear();
  changed();
}
