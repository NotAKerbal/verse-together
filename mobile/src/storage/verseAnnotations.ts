// Verse notes and marks for the reader and the Come, Follow Me guides, whoever's study is shown (studySession.ts):
// this device's rows when signed out; the signed-in account's own annotations of each chapter on screen (subscribed
// while shown, cached per account for offline) with its unsynced marks, notes and deletions applied otherwise.

import { useEffect, useMemo, useRef } from "react";
import {
  annotationChapter,
  deviceChapterAnnotations,
  myAnnotationsByVerse,
  type AnnotationChapter,
  type AnnotationVerse,
  type MarkColor,
  type VerseAnnotation,
  type VerseMarksPatch,
} from "../shared/web";
import { chapterAnnotations, chapterKey, verseConflict, verseState, type VerseDeleteOp, type VerseNoteOp } from "./accountStudy";
import { useAccountSnapshot } from "./journalData";
import { NOT_CONNECTED_MESSAGE, getStudySession, useStudySession } from "./studySession";
import { deviceStudy, useDeviceStudy } from "./study";

const EMPTY: ReadonlyMap<number, VerseAnnotation> = new Map();

/**
 * The viewer's own annotation per verse for each chapter, in input order (pass annotationChapter's identity). Empty
 * while a saved session's account isn't known yet. The result keeps its identity while nothing it shows changes.
 */
export function useVerseAnnotations(chapters: readonly AnnotationChapter[]): readonly ReadonlyMap<number, VerseAnnotation>[] {
  const session = useStudySession();
  const study = useDeviceStudy();
  const snapshot = useAccountSnapshot(session);
  const keys = chapters.map(chapterKey).join("|");
  const targets = useMemo(
    () => (keys ? keys.split("|") : []).map((key) => {
      const [volume, book, chapter] = key.split("/");
      return annotationChapter(volume, book, Number(chapter));
    }),
    [keys],
  );
  const sync = session.mode === "account" ? session.sync : null;
  useEffect(() => {
    if (!sync) return;
    const stops = targets.map((target) => sync.watchChapter(target));
    return () => stops.forEach((stop) => stop());
  }, [sync, targets]);
  const deviceRows = session.mode === "device" ? study.annotations : null;
  const cache = snapshot?.cache;
  const outbox = snapshot?.outbox;
  // Per chapter, the last result and what it was made from: a chapter keeps its map while its own rows and pending
  // changes are the same, so another chapter's (or the journal's) update doesn't restyle the text on screen.
  const memo = useRef(new Map<string, { rows: unknown; ops: readonly unknown[]; result: ReadonlyMap<number, VerseAnnotation> }>());
  const last = useRef<readonly ReadonlyMap<number, VerseAnnotation>[]>([]);
  return useMemo(() => {
    let next: ReadonlyMap<number, VerseAnnotation>[];
    if (session.mode === "device") next = targets.map((target) => myAnnotationsByVerse(deviceChapterAnnotations(deviceRows ?? [], target)));
    else if (!cache || !outbox) next = targets.map(() => EMPTY);
    else {
      next = targets.map((target) => {
        const key = chapterKey(target);
        const rows = cache.chapters[key];
        const ops = outbox.ops.filter((op) => (op.kind === "marks" ? chapterKey(op.chapter) : op.kind === "verseNote" || op.kind === "verseDelete" ? chapterKey(op.target) : null) === key);
        const previous = memo.current.get(key);
        if (previous && previous.rows === rows && previous.ops.length === ops.length && previous.ops.every((op, index) => op === ops[index])) return previous.result;
        const result = chapterAnnotations({ cache, outbox: { ...outbox, ops } }, target);
        memo.current.set(key, { rows, ops, result });
        return result;
      });
    }
    if (next.length === last.current.length && next.every((map, index) => map === last.current[index])) return last.current;
    last.current = next;
    return next;
  }, [session.mode, targets, deviceRows, cache, outbox]);
}

/** One chapter's annotations (the reader). */
export function useChapterAnnotations(chapter: AnnotationChapter): ReadonlyMap<number, VerseAnnotation> {
  const chapters = useMemo(() => [annotationChapter(chapter.volume, chapter.book, chapter.chapter)], [chapter.volume, chapter.book, chapter.chapter]);
  return useVerseAnnotations(chapters)[0] ?? EMPTY;
}

function accountWriter() {
  const session = getStudySession();
  if (session.mode === "blocked") throw new Error(session.reason === "deletion-pending" ? "Finish deleting your account in Settings, or sign out." : NOT_CONNECTED_MESSAGE);
  return session.mode === "account" ? session : null;
}

/** Verse writes: synchronous, throwing when nothing was saved (as the device store's writes do). */
export const verseStudy = {
  /** Quick marks on the selected verses (or exact ranges of them): only the named marks change. */
  setVerseMarks(chapter: AnnotationChapter, verses: readonly number[], patch: VerseMarksPatch) {
    const account = accountWriter();
    const target = annotationChapter(chapter.volume, chapter.book, chapter.chapter);
    if (!account) return deviceStudy.setVerseMarks(target, verses, patch);
    account.store.enqueueMarks(target, verses, patch);
    account.sync?.kick();
  },
  /**
   * The full editor's save: the verse's note, highlight and underline as given. `opened` is the verse as the editor
   * opened it, so a change made in the account meanwhile is merged, or reported, never overwritten.
   */
  saveAnnotation(target: AnnotationVerse, body: string, marks: { highlightColor?: MarkColor; underlineColor?: MarkColor }, opened: VerseAnnotation | null) {
    const account = accountWriter();
    if (!account) return deviceStudy.saveAnnotation(target, body, marks);
    account.store.enqueueVerseNote(target, verseState(opened), {
      body,
      highlightColor: marks.highlightColor ?? null,
      underlineColor: marks.underlineColor ?? null,
    });
    account.sync?.kick();
  },
  remove(target: AnnotationVerse, opened: VerseAnnotation) {
    const account = accountWriter();
    if (!account) return deviceStudy.remove("annotations", opened.id);
    account.store.enqueueVerseDelete(target, verseState(opened)!);
    account.sync?.kick();
  },
  /** After a conflict on a verse: keep the app's version (over the account's), or take the account's. */
  resolve(opId: string, choice: "keepMine" | "useTheirs") {
    const account = accountWriter();
    if (!account) return;
    account.store.resolve(opId, choice);
    account.sync?.kick();
  },
};

/** A verse's unresolved conflict (signed in), for its note editor. */
export function useVerseConflict(target: AnnotationVerse | null): VerseNoteOp | VerseDeleteOp | null {
  const session = useStudySession();
  const snapshot = useAccountSnapshot(session);
  return useMemo(() => (snapshot && target ? verseConflict(snapshot, target) : null), [snapshot, target]);
}
