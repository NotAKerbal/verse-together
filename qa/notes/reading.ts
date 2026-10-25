import {useSyncExternalStore} from "react";
import type {NoteSource} from "../../src/features/notes/journal";
// Synthetic stand-ins for the reading-progress hooks. Request ids are deduplicated like the server's. ?logFail and
// ?markFail make the first save land but report a network error (an unknown result), so a retry must reuse its id.
const params=new URLSearchParams(location.search);
const requests=new Map<string,string>();
const failOnce={log:params.has("logFail"),mark:params.has("markFail")};
let readChapters=new Map<string,number[]>();
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(l=>l());
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
const getReadChapters=()=>readChapters;
function record(requestId:string,detail:Record<string,unknown>){const existing=requests.get(requestId);if(existing)return{id:existing,duplicate:true};const id=`qa-reading-${Date.now()}`;requests.set(requestId,id);window.dispatchEvent(new CustomEvent("qa-reading",{detail:{id,kind:"reading",read_at:new Date().toISOString(),reader_label:"QA user",...detail}}));return{id,duplicate:false};}
function maybeFail(kind:"log"|"mark"){if(!failOnce[kind])return;failOnce[kind]=false;throw new Error("Synthetic network error after the save landed.");}
export function useBookProgress(volume:string,book:string){const rows=useSyncExternalStore(subscribe,getReadChapters,getReadChapters);return {readChapters:rows.get(`${volume}/${book}`)??[]};}
export function useReadingProgressActions(){return {
 logReading:async(input:{source:NoteSource;journalDate:string;requestId:string})=>{await new Promise(r=>setTimeout(r,150));const result=record(input.requestId,{source:input.source,journal_date:input.journalDate});maybeFail("log");return result;},
 markChapterRead:async(ref:{volume:string;book:string;chapter:number},log:{journalDate:string;requestId:string})=>{await new Promise(r=>setTimeout(r,150));const key=`${ref.volume}/${ref.book}`;const next=new Map(readChapters);next.set(key,[...new Set([...(next.get(key)??[]),ref.chapter])]);const result=record(log.requestId,{source:{kind:"scripture",label:`${ref.book} ${ref.chapter} (marked read)`,href:`/browse/${key}/${ref.chapter}`,...ref},journal_date:log.journalDate});maybeFail("mark");readChapters=next;notify();return result;},
 unmarkChapterRead:async(ref:{volume:string;book:string;chapter:number})=>{await new Promise(r=>setTimeout(r,150));const key=`${ref.volume}/${ref.book}`;const next=new Map(readChapters);next.set(key,(next.get(key)??[]).filter(c=>c!==ref.chapter));readChapters=next;notify();},
 setLastPosition:async()=>{},
};}
