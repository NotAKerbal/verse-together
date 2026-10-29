// The account functions the app calls, by name. The web imports convex/_generated/api, whose types pull in every
// server module (and their packages); the app names the few it uses with their argument and result shapes instead.
// Each is an existing public function: its own checks (convex/utils.ts) decide what the caller may do.

import { makeFunctionReference } from "convex/server";
import type {
  AnnotationChapter,
  GuideAnchorFields,
  JournalAnnotationEntry,
  JournalGoals,
  JournalNoteDocument,
  JournalNoteEntry,
  MarkColor,
  ReadingLogRow,
  VerseMarksPatch,
  VerseTextMark,
  annotationImport,
  guideHighlightImport,
  NoteSource,
} from "../shared/web";

export type Viewer = {
  appUserId: string;
  isAdmin: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  legacyAccount: boolean;
  legacyAccountPending?: boolean;
};

export type PendingDeletion = { appUserId: string; startedAt: number };

export const accountApi = {
  ensureCurrentUser: makeFunctionReference<"mutation", Record<string, never>, Viewer>("users:ensureCurrentUser"),
  viewer: makeFunctionReference<"query", Record<string, never>, Omit<Viewer, "legacyAccountPending"> | null>("users:viewer"),
  /**
   * The signed-in account's app user and any unfinished deletion of it, read together (convex/users.ts): starting a
   * deletion removes the one and records the other in one step, so they are never seen out of step. Null signed out.
   */
  accountStatus: makeFunctionReference<
    "query",
    Record<string, never>,
    { viewer: Omit<Viewer, "legacyAccountPending"> | null; deletion: PendingDeletion | null } | null
  >("users:accountStatus"),
  /** The signed-in owner's own account deletion that stopped partway, or null (convex/accountDeletion.ts). */
  pendingDeletion: makeFunctionReference<"query", Record<string, never>, PendingDeletion | null>("accountDeletion:pending"),
  importDeviceNote: makeFunctionReference<
    "mutation",
    {
      deviceId: string;
      expectedOwner: string;
      markdownBody: string;
      journalDate: string;
      source?: NoteSource;
      createdAt: number;
      updatedAt: number;
      readingAt?: number;
    },
    { id: string }
  >("insights:importDeviceNote"),
  importVerseAnnotation: makeFunctionReference<"mutation", ReturnType<typeof annotationImport>, { id: string }>("annotations:upsertVerseAnnotation"),
  importGuideHighlight: makeFunctionReference<"mutation", ReturnType<typeof guideHighlightImport>, { id: string } | null>("annotations:saveGuideHighlight"),
};

// The account's study, as the website reads and writes it (convex/insights.ts, convex/annotations.ts,
// convex/readingProgress.ts, convex/users.ts). Results are typed loosely where an older deployment answers
// differently: createJournalEntry returned only `{ id, duplicate, deleted }` (or a bare id) before it reported the
// revision its content is at, so its result is read through readCreatedEntry rather than trusted.

export type CreateJournalEntryArgs = {
  journalDate: string;
  source?: NoteSource;
  markdownBody: string;
  logReading: boolean;
  requestId: string;
};

export type VerseAnnotationRow = {
  id: string;
  verse: number;
  body: string;
  visibility: "private";
  highlight_color: MarkColor | null;
  text_marks?: VerseTextMark[];
  underline?: boolean;
  underline_color?: MarkColor | null;
  user_id: string;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
};

export type GuideAnnotationArgs = GuideAnchorFields & {
  guide: string;
  highlightId?: string;
  body?: string;
  highlightColor?: MarkColor | null;
  underlineColor?: MarkColor | null;
};

export const studyApi = {
  listMyJournal: makeFunctionReference<"query", Record<string, never>, Array<JournalNoteEntry | JournalAnnotationEntry>>("insights:listMyJournal"),
  getDraft: makeFunctionReference<"query", { draftId: string }, JournalNoteDocument | null>("insights:getDraft"),
  listMyReadingLog: makeFunctionReference<"query", Record<string, never>, ReadingLogRow[]>("readingProgress:listMyReadingLog"),
  getJournalGoals: makeFunctionReference<"query", Record<string, never>, JournalGoals | null>("users:getJournalGoals"),
  saveJournalGoals: makeFunctionReference<"mutation", JournalGoals, unknown>("users:saveJournalGoals"),
  createJournalEntry: makeFunctionReference<"mutation", CreateJournalEntryArgs, unknown>("insights:createJournalEntry"),
  saveJournalNote: makeFunctionReference<
    "mutation",
    { draftId: string; markdownBody: string; expectedRevision: number },
    { ok?: boolean; markdownRevision?: number; title?: string }
  >("insights:saveJournalNote"),
  setJournalReading: makeFunctionReference<
    "mutation",
    { draftId: string; logged: boolean; source?: NoteSource; journalDate?: string },
    unknown
  >("insights:setJournalReading"),
  deleteDraft: makeFunctionReference<"mutation", { draftId: string }, unknown>("insights:deleteDraft"),
  openReadingEntry: makeFunctionReference<"mutation", { readingId: string }, { id: string }>("insights:openReadingEntry"),
  getChapterAnnotations: makeFunctionReference<
    "query",
    { volume: string; book: string; chapter: number },
    { by_verse: Record<string, VerseAnnotationRow[]> }
  >("annotations:getChapterAnnotations"),
  upsertVerseAnnotation: makeFunctionReference<
    "mutation",
    {
      volume: string;
      book: string;
      chapter: number;
      verse: number;
      body: string;
      highlightColor?: MarkColor;
      underline?: boolean;
      underlineColor?: MarkColor;
    },
    { id: string }
  >("annotations:upsertVerseAnnotation"),
  setVerseMarks: makeFunctionReference<
    "mutation",
    AnnotationChapter & { verses: number[] } & VerseMarksPatch,
    { changed: number }
  >("annotations:setVerseMarks"),
  deleteVerseAnnotation: makeFunctionReference<"mutation", { annotationId: string }, unknown>("annotations:deleteVerseAnnotation"),
  getGuideHighlights: makeFunctionReference<"query", { guide: string }, unknown[]>("annotations:getGuideHighlights"),
  getMyProgressForBook: makeFunctionReference<
    "query",
    { volume: string; book: string },
    { readChapters: number[]; latestReadChapter: number | null; currentChapter: number | null } | null
  >("readingProgress:getMyProgressForBook"),
  setGuideAnnotation: makeFunctionReference<"mutation", GuideAnnotationArgs, { id: string | null }>("annotations:setGuideAnnotation"),
  deleteGuideHighlight: makeFunctionReference<"mutation", { highlightId: string }, unknown>("annotations:deleteGuideHighlight"),
};

/**
 * createJournalEntry's result from any deployment: `{ id, markdownRevision }` (current), `{ id, duplicate, deleted }`
 * (before it reported the revision), or a bare id. `id` is null when the entry was deleted meanwhile; `revision` is
 * null when the backend didn't say (the caller re-reads the entry to learn it).
 */
export function readCreatedEntry(value: unknown): { id: string | null; revision: number | null; deleted: boolean } {
  if (typeof value === "string") return { id: value, revision: null, deleted: false };
  if (!value || typeof value !== "object") throw new Error("Unexpected reply from the journal service.");
  const row = value as { id?: unknown; markdownRevision?: unknown; deleted?: unknown };
  const deleted = row.deleted === true;
  const id = typeof row.id === "string" && row.id ? row.id : null;
  if (!id && !deleted) throw new Error("Unexpected reply from the journal service.");
  const revision = typeof row.markdownRevision === "number" && Number.isInteger(row.markdownRevision) && row.markdownRevision >= 0 ? row.markdownRevision : null;
  return { id: deleted ? null : id, revision, deleted };
}
