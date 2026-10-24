import Link from "next/link";
import {StrictMode,useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import JournalWorkspace from "../../src/features/notes/JournalWorkspace";
import ReadingLogButton from "../../src/features/notes/ReadingLogButton";
import JournalNoteEditor from "../../src/features/notes/JournalNoteEditor";
import {JournalOutbox} from "../../src/features/notes/journalOutbox";
import {QaContext} from "./provider";
import type {JournalEntry,JournalNoteDocument} from "../../src/features/notes/journal";
import "../../src/app/globals.css";
const source={kind:"scripture" as const,label:"1 Nephi 2:3–5",href:"/browse/bookofmormon/1-nephi/2#v-3",volume:"bookofmormon",book:"1-nephi",chapter:2,verseStart:3,verseEnd:5};
const initial:JournalNoteDocument={id:"qa-note",title:"A willingness to listen",status:"draft",markdown_body:"# A willingness to listen\n\nI can begin before I feel ready.\n\n## What I want to remember\n\n- Notice the invitation to act.\n- Return to the promise in the passage.\n\nA thought about #faith.\n",markdown_revision:0,markdown_canonical:true,journal_date:"2026-10-21",source,created_at:"2026-10-21T10:15:00Z",updated_at:"2026-10-21T10:15:00Z"};
function QaApp(){
 const [readings,setReadings]=useState<JournalEntry[]>([]);const [docs,setDocs]=useState([initial]);const [active,setActive]=useState(initial.id);const [day,setDay]=useState(initial.journal_date);const [layout,setLayout]=useState<"phone"|"desktop">(innerWidth<1024?"phone":"desktop");
 const outbox=useMemo(()=>new JournalOutbox(async(id,text,revision)=>{await new Promise(r=>setTimeout(r,150));setDocs(all=>all.map(d=>d.id===id?{...d,markdown_body:text,markdown_revision:revision+1,title:text.split("\n")[0].replace(/^#+\s*/,"")||"Untitled note"}:d));return {markdownRevision:revision+1};}),[]);
 useEffect(()=>{const f=()=>setLayout(innerWidth<1024?"phone":"desktop");addEventListener("resize",f);return()=>removeEventListener("resize",f);},[]);
 const entries:JournalEntry[]=docs.map(d=>({...d,kind:"note",author_label:"QA user",excerpt:"A synthetic thought for component verification.",read_only:false}));
 entries.push({kind:"reading",id:"qa-reading",journal_date:initial.journal_date,source,reader_label:"QA user",read_at:"2026-10-21T10:00:00Z"});
 entries.push(...readings);
 useEffect(()=>{const f=(event:Event)=>setReadings(rows=>[...rows,(event as CustomEvent<JournalEntry>).detail]);addEventListener("qa-reading",f);return()=>removeEventListener("qa-reading",f);},[]);
 const note=docs.find(d=>d.id===active);
 function create(date:string){const next={...initial,id:`qa-${Date.now()}`,title:"Untitled note",markdown_body:"",journal_date:date,source:null};setDocs(d=>[...d,next]);setActive(next.id);}
 return <QaContext.Provider value={{journalOutbox:outbox}}><div className="app-shell min-h-screen"><header className="app-header hidden sm:block"><div className="shell-container flex items-center justify-between py-4"><span className="brand-wordmark brand-pill text-2xl">Verse<span>Together</span></span><nav className="segmented-control"><Link className="segmented-control-button" href="/browse">Browse</Link><Link className="segmented-control-button" data-active="true" href="/notes">Notes</Link><Link className="segmented-control-button" href="/come-follow-me">Come Follow Me</Link></nav><span className="pill-tag">QA user</span></div></header><main className="mx-auto max-w-[1440px] px-4 pt-4 pb-32 sm:px-8"><p className="mb-3 text-xs opacity-60">Component QA · synthetic fixtures · no backend connection</p><JournalWorkspace layout={layout} status="ready" entries={entries} today="2026-10-21" selectedDate={day} onSelectDate={setDay} selectedKey={note?`note:${note.id}`:null} onOpenNote={(id,date)=>{setActive(id);setDay(date);}} onNewNote={create} dayActions={<ReadingLogButton options={[{source,verseCount:24}]} defaultDate={day}/>} notePane={note&&note.journal_date===day?<JournalNoteEditor key={note.id} note={note} authorLabel="QA user"/>:undefined}/></main><nav className="fixed bottom-3 inset-x-4 z-40 grid grid-cols-3 rounded-full border-2 p-2 shadow-lg sm:hidden" style={{background:"var(--mobile-nav-shell)",borderColor:"var(--surface-border)"}}><Link className="p-3 text-center" href="/browse">Browse</Link><Link className="p-3 text-center" href="/come-follow-me">CFM</Link><Link className="rounded-full p-3 text-center" style={{background:"var(--mobile-nav-active)",color:"var(--mobile-nav-active-text)"}} href="/notes">Notes</Link></nav></div></QaContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><QaApp/></StrictMode>);
