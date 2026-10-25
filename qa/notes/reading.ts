import type {NoteSource} from "../../src/features/notes/journal";
// Synthetic stand-ins for the reading-progress hooks. Request ids are deduplicated like the server's. ?logFail makes
// the first save land but report a network error (an unknown result), so a retry must reuse its id.
const params=new URLSearchParams(location.search);
const requests=new Map<string,string>();
const failOnce={log:params.has("logFail")};
function record(requestId:string,detail:Record<string,unknown>){const existing=requests.get(requestId);if(existing)return{id:existing,duplicate:true};const id=`qa-reading-${Date.now()}`;requests.set(requestId,id);window.dispatchEvent(new CustomEvent("qa-reading",{detail:{id,kind:"reading",read_at:new Date().toISOString(),reader_label:"QA user",...detail}}));return{id,duplicate:false};}
function maybeFail(kind:"log"){if(!failOnce[kind])return;failOnce[kind]=false;throw new Error("Synthetic network error after the save landed.");}
export function useReadingProgressActions(){return {
 logReading:async(input:{source:NoteSource;journalDate:string;requestId:string})=>{await new Promise(r=>setTimeout(r,150));const result=record(input.requestId,{source:input.source,journal_date:input.journalDate});maybeFail("log");return result;},
 setLastPosition:async()=>{},
};}
