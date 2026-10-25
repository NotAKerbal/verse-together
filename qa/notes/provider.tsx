import {createContext,useContext,useSyncExternalStore} from "react";
import type {JournalOutbox} from "../../src/features/notes/journalOutbox";
import type {EntryDraft,EntryDraftSaveResult,EntrySaveState} from "../../src/features/notes/entryDraft";
export type {NotebookPanelView,ReaderChapter} from "../../src/features/insights/InsightBuilderProvider";
export type QaProviderValue={journalOutbox:JournalOutbox;deleteDraft:(draftId:string)=>Promise<void>;entryDraft:EntryDraft;updateEntryDraft:(change:(draft:EntryDraft)=>EntryDraft)=>void;saveEntryDraft:()=>Promise<EntryDraftSaveResult>;entrySave:EntrySaveState;openSavedEntry:()=>{id:string;journalDate:string}|null};
export const QaContext=createContext<QaProviderValue|null>(null);
export function useInsightBuilder(){const value=useContext(QaContext);if(!value)throw new Error("QA provider missing");return value;}
export function useNoteOutboxEntry(outbox:JournalOutbox,noteId:string|null){const rows=useSyncExternalStore(outbox.subscribe,outbox.getSnapshot,outbox.getSnapshot);return noteId?rows.get(noteId):undefined;}
