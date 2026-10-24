import {createContext,useContext,useSyncExternalStore} from "react";
import type {JournalOutbox} from "../../src/features/notes/journalOutbox";
export const QaContext=createContext<{journalOutbox:JournalOutbox}|null>(null);
export function useInsightBuilder(){const value=useContext(QaContext);if(!value)throw new Error("QA provider missing");return value;}
export function useNoteOutboxEntry(outbox:JournalOutbox,noteId:string|null){const rows=useSyncExternalStore(outbox.subscribe,outbox.getSnapshot,outbox.getSnapshot);return noteId?rows.get(noteId):undefined;}
