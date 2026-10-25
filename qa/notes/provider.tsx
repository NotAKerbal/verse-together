import {createContext,useContext,useSyncExternalStore,type MutableRefObject} from "react";
import type {JournalOutbox} from "../../src/features/notes/journalOutbox";
import type {ReadingLogAttempt} from "../../src/features/notes/ReadingLogButton";
import type {ChapterMarkAttempt} from "../../src/features/plans/ChapterReadToggle";
export type {NotebookPanelView,ReaderChapter} from "../../src/features/insights/InsightBuilderProvider";
export const QaContext=createContext<{journalOutbox:JournalOutbox;deleteDraft:(draftId:string)=>Promise<void>;readerLogPendingRef:MutableRefObject<ReadingLogAttempt|null>;readerMarkPendingRef:MutableRefObject<ChapterMarkAttempt|null>}|null>(null);
export function useInsightBuilder(){const value=useContext(QaContext);if(!value)throw new Error("QA provider missing");return value;}
export function useNoteOutboxEntry(outbox:JournalOutbox,noteId:string|null){const rows=useSyncExternalStore(outbox.subscribe,outbox.getSnapshot,outbox.getSnapshot);return noteId?rows.get(noteId):undefined;}
