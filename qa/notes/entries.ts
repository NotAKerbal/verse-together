import type {ReadingDetails} from "../../src/features/notes/ReadingChip";
type QaEntryActions={openReadingEntry:(readingId:string)=>Promise<{id:string}>;setEntryReading:(draftId:string,reading:ReadingDetails|null)=>Promise<{ok:boolean}>};
const notReady=async():Promise<never>=>{throw new Error("QA fixtures not ready");};
// Synthetic stand-in for useJournalEntryActions; main.tsx installs the fixture implementations.
export const qaEntryActions:QaEntryActions={openReadingEntry:notReady,setEntryReading:notReady};
export function useJournalEntryActions(){return {openReadingEntry:(id:string)=>qaEntryActions.openReadingEntry(id),setEntryReading:(id:string,reading:ReadingDetails|null)=>qaEntryActions.setEntryReading(id,reading)};}
