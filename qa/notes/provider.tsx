import {createContext,useContext,useSyncExternalStore,type MutableRefObject} from "react";
import type {JournalOutbox} from "../../src/features/notes/journalOutbox";
import type {EntryDraft,EntryDraftSaveResult} from "../../src/features/notes/entryDraft";
import type {ChapterMarkAttempt} from "../../src/features/plans/ChapterReadToggle";
export type {NotebookPanelView,ReaderChapter} from "../../src/features/insights/InsightBuilderProvider";
export type QaProviderValue={journalOutbox:JournalOutbox;deleteDraft:(draftId:string)=>Promise<void>;readerMarkPendingRef:MutableRefObject<ChapterMarkAttempt|null>;entryDraft:EntryDraft;updateEntryDraft:(change:(draft:EntryDraft)=>EntryDraft)=>void;saveEntryDraft:()=>Promise<EntryDraftSaveResult>};
export const QaContext=createContext<QaProviderValue|null>(null);
export function useInsightBuilder(){const value=useContext(QaContext);if(!value)throw new Error("QA provider missing");return value;}
export function useNoteOutboxEntry(outbox:JournalOutbox,noteId:string|null){const rows=useSyncExternalStore(outbox.subscribe,outbox.getSnapshot,outbox.getSnapshot);return noteId?rows.get(noteId):undefined;}
