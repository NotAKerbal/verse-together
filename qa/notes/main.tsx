import Link from "next/link";
import {StrictMode,useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ConvexError} from "convex/values";
import {createRoot} from "react-dom/client";
import NotesSidebar,{NotesPanelContent,type NotesPanelFrame} from "../../src/features/notes/NotesSidebar";
import NotesSheet from "../../src/features/notes/NotesSheet";
import JournalWorkspace from "../../src/features/notes/JournalWorkspace";
import JournalNoteEditor from "../../src/features/notes/JournalNoteEditor";
import JournalEntryComposer from "../../src/features/notes/JournalEntryComposer";
import {JournalOutbox} from "../../src/features/notes/journalOutbox";
import {restartEntryDraft} from "../../src/features/notes/entryDraft";
import {useEntryDraftStore,type CreateJournalEntry} from "../../src/features/notes/useEntryDraftStore";
import {nextJournalView,resolveJournalView,type JournalViewAction,type JournalViewState} from "../../src/features/notes/journalView";
import {useJournalHistory} from "../../src/features/notes/useJournalHistory";
import {QaContext,type NotebookPanelView,type ReaderChapter} from "./provider";
import {qaEntryActions} from "./entries";
import type {JournalEntry,JournalNoteDocument,JournalReadingEntry} from "../../src/features/notes/journal";
import "../../src/app/globals.css";
// Synthetic fixtures only. ?active=none starts with no active note (as if not arriving from the reader's sidebar).
// ?deleteError makes every deletion fail; ?deleteError=once fails only the first, so a retry succeeds.
// ?entryFail makes the first entry save land but report an error (a retry must find the same entry);
// ?entryConflict also edits that entry "in another window" before the error, so an unchanged retry succeeds and a
// changed one is refused like the server's ENTRY_CONFLICT; ?entryDelay=ms slows entry saves.
const params=new URLSearchParams(location.search);
const source={kind:"scripture" as const,label:"1 Nephi 2:3–5",href:"/browse/bookofmormon/1nephi/2#v-3",volume:"bookofmormon",book:"1nephi",chapter:2,verseStart:3,verseEnd:5};
const guide={kind:"guide" as const,label:"Come, Follow Me: October 19–25",href:"/come-follow-me/2026-10-19"};
const longGuide={kind:"guide" as const,label:"Come, Follow Me: October 19–25 — 1 Nephi 1–5: “I Will Go and Do” (synthetic long source label)",href:"/come-follow-me/2026-10-19"};
const initial:JournalNoteDocument={id:"qa-note",title:"A willingness to listen",status:"draft",markdown_body:"# A willingness to listen\n\nI can begin before I feel ready.\n\n## What I want to remember\n\n- Notice the invitation to act.\n- Return to the promise in the passage.\n\nA thought about #faith.\n",markdown_revision:0,markdown_canonical:true,journal_date:"2026-10-21",source,reading_at:null,created_at:"2026-10-21T10:15:00Z",updated_at:"2026-10-21T10:15:00Z"};
const fixtures:JournalNoteDocument[]=[initial,
 {...initial,id:"qa-note-2",title:"Questions for family study",markdown_body:"# Questions for family study\n\n- What did Lehi's family leave behind?\n- What would we leave?\n",journal_date:"2026-10-21",source:guide,created_at:"2026-10-21T19:40:00Z",updated_at:"2026-10-21T19:40:00Z"},
 {...initial,id:"qa-note-3",title:"Shared with the class",status:"published",markdown_body:"# Shared with the class\n\nA published note is read-only here.\n",journal_date:"2026-10-21",source:null,created_at:"2026-10-21T21:05:00Z",updated_at:"2026-10-21T21:05:00Z"},
 // Long title, excerpt and source, like a real rail card that was squeezed (excerpts run to 220 characters).
 {...initial,id:"qa-note-long",title:"[QA TEST 2026-10-21] Notes after a long synthetic study session that keep going well past one line",markdown_body:"# [QA TEST 2026-10-21] Notes after a long synthetic study session that keep going well past one line\n\nSynthetic QA text. Save and reload round one stays exactly as typed, including #faith. Edited after a reload: revision two is saved. This sentence only exists to run past two lines in the rail and the chooser.\n",journal_date:"2026-10-21",source:longGuide,created_at:"2026-10-21T22:10:00Z",updated_at:"2026-10-21T22:10:00Z"},
 {...initial,id:"qa-note-word",title:"Synthetic-unbroken-QA-title-word-Supercalifragilisticexpialidocious-Antidisestablishmentarianism",markdown_body:"# Synthetic-unbroken-QA-title-word-Supercalifragilisticexpialidocious-Antidisestablishmentarianism\n\nhttps://example.invalid/a-synthetic-unbroken-url-like-excerpt-token-that-should-break-instead-of-overflowing-the-card\n",journal_date:"2026-10-21",source:null,created_at:"2026-10-21T22:30:00Z",updated_at:"2026-10-21T22:30:00Z"},
 // One entry that is both a note and a reading, and one reading-only entry: each counts once.
 {...initial,id:"qa-entry-both",title:"Reading with a thought",markdown_body:"# Reading with a thought\n\nRead this morning with a question in mind.\n",journal_date:"2026-10-21",source,reading_at:"2026-10-21T07:30:00Z",created_at:"2026-10-21T07:30:00Z",updated_at:"2026-10-21T07:30:00Z"},
 {...initial,id:"qa-entry-reading",title:"Untitled note",markdown_body:"",journal_date:"2026-10-20",source:{kind:"scripture",label:"1 Nephi 1",href:"/browse/bookofmormon/1nephi/1",volume:"bookofmormon",book:"1nephi",chapter:1},reading_at:"2026-10-20T06:45:00Z",created_at:"2026-10-20T06:45:00Z",updated_at:"2026-10-20T06:45:00Z"},
 {...initial,id:"qa-note-4",title:"Sunday thoughts",markdown_body:"# Sunday thoughts\n\nA quiet morning.\n",journal_date:"2026-10-18",source:null,created_at:"2026-10-18T09:00:00Z",updated_at:"2026-10-18T09:00:00Z"},
];
// Older readings, stored apart from entries; opening one makes it an editable entry once.
const olderReadings:JournalReadingEntry[]=[
 {kind:"reading",id:"qa-reading",journal_date:"2026-10-21",source,reader_label:"QA user",read_at:"2026-10-21T10:00:00Z",origin:"manual"},
 {kind:"reading",id:"qa-legacy-read",journal_date:"2026-10-19",source:{kind:"scripture",label:"1 Nephi 3",href:"/browse/bookofmormon/1nephi/3",volume:"bookofmormon",book:"1nephi",chapter:3},reader_label:"QA user",read_at:"2026-10-19T20:00:00Z",origin:"legacy"},
];
const annotation:JournalEntry={kind:"verse_annotation",id:"qa-annotation",title:null,body:"An older verse note, shown read-only.",journal_date:"2026-10-20",source,highlight_color:null,read_only:true,author_label:"QA user",created_at:"2026-10-20T08:30:00Z",updated_at:"2026-10-20T08:30:00Z"};
// ?panel: two synthetic chapters for the reader's Log panel.
const panelChapters=[2,3].map((chapter,index)=>{const reference=`1 Nephi ${chapter}`;const href=`/browse/bookofmormon/1nephi/${chapter}`;return {volume:"bookofmormon",book:"1nephi",chapter,reference,logReady:true,logOptions:[{source:{kind:"scripture" as const,label:reference,href,volume:"bookofmormon",book:"1nephi",chapter},verseCount:index===0?24:31}]} satisfies ReaderChapter;});
// Roughly the server's markdownExcerpt: up to 220 characters, then an ellipsis.
function excerptOf(markdown:string){const rest=markdown.split("\n").slice(1).join(" ").replace(/[#*-]/g,"").replace(/\s+/g," ").trim();return rest.length>220?`${rest.slice(0,220).trimEnd()}...`:rest||null;}
const titleOf=(text:string)=>text.split("\n")[0].replace(/^#+\s*/,"").trim()||"Untitled note";
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function QaApp(){
 const [docs,setDocs]=useState(()=>params.get("empty")==="true"?[]:fixtures);
 const docsRef=useRef(docs);useEffect(()=>{docsRef.current=docs;},[docs]);
 // Stand-ins for the server's per-entry keys: create requests and older readings, kept after deletion too.
 const entryRequests=useRef(new Map<string,string>());
 const deletedKeys=useRef(new Set<string>());
 const historyKeys=useRef(new Map<string,string>());
 const entryFailures=useRef(params.has("entryFail")||params.has("entryConflict")?1:0);
 // Like the server's entryRequestFingerprint and entryRequestRevision: what each request last wrote, at which revision.
 const entrySent=useRef(new Map<string,string>());
 const entryRevisions=useRef(new Map<string,number>());
 const [hiddenReadings,setHiddenReadings]=useState<Set<string>>(()=>new Set());
 const [readings,setReadings]=useState<JournalEntry[]>([]);
 const panelMode=params.has("panel");
 const sidebarMode=panelMode||params.has("sidebar");
 const [panelView,setPanelView]=useState<NotebookPanelView>("notes");
 const [sheetOpen,setSheetOpen]=useState(false);
 const [chapterIndex,setChapterIndex]=useState(0);
 const [panelOpen,setPanelOpen]=useState(true);
 // Stands in for the provider's active note: the only note whose document is "loaded".
 const [active,setActive]=useState<string|null>(()=>params.get("active")==="none"?null:initial.id);
 const [composing,setComposing]=useState(false);
 const [viewState,setViewState]=useState<JournalViewState>(null);
 const [layout,setLayout]=useState<"phone"|"desktop">(innerWidth<1024?"phone":"desktop");
 const outbox=useMemo(()=>new JournalOutbox(async(id,text,revision)=>{await wait(150);setDocs(all=>all.map(d=>d.id===id?{...d,markdown_body:text,markdown_revision:revision+1,title:titleOf(text)}:d));return {markdownRevision:revision+1};}),[]);
 useEffect(()=>{const f=()=>setLayout(innerWidth<1024?"phone":"desktop");addEventListener("resize",f);return()=>removeEventListener("resize",f);},[]);
 useEffect(()=>{const f=(event:Event)=>setReadings(rows=>[...rows,(event as CustomEvent<JournalEntry>).detail]);addEventListener("qa-reading",f);return()=>removeEventListener("qa-reading",f);},[]);
 const entries:JournalEntry[]=[...docs.map(d=>({...d,kind:"note" as const,author_label:"QA user",excerpt:excerptOf(d.markdown_body),read_only:false as const})),annotation,...olderReadings.filter(r=>!hiddenReadings.has(r.id)),...readings];
 const activeDoc=docs.find(d=>d.id===active)??null;
 const view=resolveJournalView(viewState,{today:"2026-10-21",activeNoteId:active});
 // The page's own history hook: Back and Forward reopen and close notes here exactly as on /notes.
 const go=useJournalHistory(view,{enabled:true,show:setViewState,select:id=>{if(id!==active&&docs.some(d=>d.id===id))setActive(id);}});
 const act=(action:JournalViewAction)=>go(current=>nextJournalView(current,action));
 const note=view.noteId!==null&&activeDoc?.id===view.noteId?activeDoc:null;
 // Stands in for insights:createJournalEntry under the provider's own draft store (useEntryDraftStore): one entry per
 // request id; a retry replaces an untouched entry's content (new text is a new revision), and is refused once the
 // entry was edited unless it repeats what that request last wrote or matches the entry.
 const createEntry=useCallback<CreateJournalEntry>(async(input)=>{
   await wait(Number(params.get("entryDelay"))||150);
   if(deletedKeys.current.has(input.requestId))return {id:null};
   const sent=JSON.stringify([input.markdownBody,input.journalDate,input.logReading,input.source??null]);
   const now=new Date().toISOString();
   let id=entryRequests.current.get(input.requestId);
   const doc=id?docsRef.current.find(d=>d.id===id):undefined;
   const content={title:titleOf(input.markdownBody),markdown_body:input.markdownBody,journal_date:input.journalDate,source:input.source??null};
   if(id&&doc){
     const base=entryRevisions.current.get(input.requestId)??0;
     if(doc.markdown_revision===base&&doc.updated_at===doc.created_at){const revision=input.markdownBody===doc.markdown_body?base:base+1;setDocs(all=>all.map(d=>d.id===id?{...d,...content,markdown_revision:revision,reading_at:input.logReading?d.reading_at??d.created_at:null}:d));entrySent.current.set(input.requestId,sent);entryRevisions.current.set(input.requestId,revision);}
     else if(entrySent.current.get(input.requestId)!==sent&&JSON.stringify([doc.markdown_body,doc.journal_date,!!doc.reading_at,doc.source])!==sent)throw new ConvexError({code:"ENTRY_CONFLICT",id,journalDate:doc.journal_date});
   }else if(!id){
     id=`qa-entry-${Date.now()}`;entryRequests.current.set(input.requestId,id);entrySent.current.set(input.requestId,sent);
     const created:JournalNoteDocument={...initial,id,...content,markdown_revision:0,reading_at:input.logReading?now:null,created_at:now,updated_at:now};
     // ?entryConflict: another window edits the new entry before this one hears back.
     const edited=params.has("entryConflict")&&entryFailures.current>0?{markdown_body:`${created.markdown_body}\n\nEdited in another window.`,markdown_revision:1,updated_at:new Date(Date.now()+1).toISOString()}:{};
     docsRef.current=[...docsRef.current,{...created,...edited}];setDocs(all=>[...all,{...created,...edited}]);
   }
   if(entryFailures.current>0){entryFailures.current-=1;throw new Error("Synthetic network error after the save landed.");}
   return {id:id!};
 },[]);
 const {entryDraft,changeEntryDraft,entrySave,saveEntryDraft,openSavedEntry}=useEntryDraftStore({ownerId:"qa-user",create:createEntry,activate:setActive});
 // Installed after each render, so the fixture actions see the current fixtures.
 useEffect(()=>{
  qaEntryActions.setEntryReading=async(id,reading)=>{await wait(150);const doc=docsRef.current.find(d=>d.id===id);if(!doc)throw new Error("Draft not found");if(!reading&&!doc.markdown_body.trim())throw new Error("Add a note before removing the reading");setDocs(all=>all.map(d=>d.id===id?{...d,source:reading?.source??d.source,journal_date:reading?.journalDate??d.journal_date,reading_at:reading?d.reading_at??new Date().toISOString():null,updated_at:new Date().toISOString()}:d));return {ok:true};};
  qaEntryActions.openReadingEntry=async(readingId)=>{await wait(150);const existing=historyKeys.current.get(readingId);if(existing)return {id:existing};if(deletedKeys.current.has(readingId))throw new Error("Reading not found");const reading=olderReadings.find(r=>r.id===readingId);if(!reading)throw new Error("Reading not found");const id=`qa-opened-${readingId}`;historyKeys.current.set(readingId,id);setDocs(all=>[...all,{...initial,id,title:"Untitled note",markdown_body:"",journal_date:reading.journal_date,source:reading.source,reading_at:reading.read_at,created_at:reading.read_at,updated_at:new Date().toISOString()}]);setHiddenReadings(h=>new Set(h).add(readingId));setActive(id);return {id};};
 });
 // Stands in for the provider's deleteDraft: the same outbox coordination, a synthetic server that refuses
 // published notes like the real one, then the note leaves the fixtures (its keys stay deleted).
 const deleteFailures=useRef((()=>{const mode=params.get("deleteError");return mode===null?0:mode==="once"?1:Infinity;})());
 async function deleteDraft(id:string){
   await outbox.remove(id,async()=>{await wait(400);
     if(deleteFailures.current>0){deleteFailures.current-=1;throw new Error("Synthetic delete failure.");}
     if(docs.find(d=>d.id===id)?.status==="published")throw new Error("Published insights cannot be deleted");});
   for(const [key,entryId] of [...entryRequests.current,...historyKeys.current])if(entryId===id)deletedKeys.current.add(key);
   for(const [key,entryId] of historyKeys.current)if(entryId===id)historyKeys.current.delete(key);
   setDocs(all=>all.filter(d=>d.id!==id));setActive(current=>current===id?null:current);
 }
 const onNoteDeleted=(id:string)=>act({type:"noteDeleted",noteId:id});
 const chapter=panelChapters[chapterIndex];
 const chapterSource=chapter.logOptions[0].source;
 const summaries=docs.map(d=>({...d,visibility:"private" as const,tags:[],last_active_at:d.updated_at,excerpt:excerptOf(d.markdown_body)}));
 const restart=(defaults:Parameters<typeof restartEntryDraft>[1])=>changeEntryDraft(d=>restartEntryDraft(d,defaults));
 const logOpen=layout==="phone"?sheetOpen:panelOpen&&panelView==="log";
 // The header's Log: a blank entry for the chapter, logging reading of it, opened at once (nothing is stored).
 function onLog(){if(layout==="phone"&&sheetOpen){setSheetOpen(false);return;}if(layout==="desktop"&&logOpen){setPanelOpen(false);return;}restart({source:chapterSource,logReading:true});setPanelView("log");if(layout==="phone")setSheetOpen(true);else setPanelOpen(true);}
 const panelContent=(frame:NotesPanelFrame)=><NotesPanelContent frame={frame} autoFocus={layout==="desktop"} activeNoteId={active} activeNote={activeDoc} notes={summaries} isLoading={false} onSelect={async id=>{setActive(id);}} view={panelView} onViewChange={setPanelView} onNewEntry={()=>{restart({source:panelMode?chapterSource:source});setPanelView("log");}} readingOptions={panelMode?chapter.logOptions:[]}/>;
 const sidebarPane = (
   <>
     <section className="panel-card max-w-lg rounded-[20px] p-6">
       <h1 className="font-display text-2xl font-extrabold">{panelMode?chapter.reference:"1 Nephi 2"}</h1>
       <p className="mt-4 font-serif text-lg leading-relaxed">
         And it came to pass that he was obedient unto the word of the Lord, wherefore he did as the Lord commanded him.
       </p>
       <p className="mt-4 text-sm text-[color:var(--foreground-muted)]">Synthetic reader context for the Log panel.</p>
     </section>
     {panelMode ? (
       <div className="mt-4 flex flex-wrap items-center gap-2">
         <button type="button" data-notebook-launcher aria-expanded={logOpen} aria-label={`Log ${chapter.reference}`} className="surface-button inline-flex h-9 items-center rounded-full border-2 px-4 text-sm font-bold" onClick={onLog}>Log</button>
         <button type="button" className="surface-button inline-flex h-9 items-center rounded-full border-2 px-4 text-sm" onClick={()=>setChapterIndex(i=>(i+1)%panelChapters.length)}>Go to {panelChapters[(chapterIndex+1)%panelChapters.length].reference}</button>
         <button type="button" className="surface-button inline-flex h-9 items-center rounded-full border-2 px-4 text-sm" onClick={()=>{setPanelView("notes");if(layout==="phone")setSheetOpen(true);else setPanelOpen(true);}}>Reader note action</button>
         <span className="text-xs text-[color:var(--foreground-muted)]">Synthetic stand-ins for the reader header (Log), chapter navigation, and a reader note action (openBuilder: the active note).</span>
         <section aria-label="Synthetic reading history" className="w-full text-sm">
           <h2 className="mt-2 font-bold">Synthetic entries with reading ({docs.filter(d=>d.reading_at).length})</h2>
           <ul>{docs.filter(d=>d.reading_at).map(d=><li key={d.id} data-qa-entry-reading>{d.source?.label} · {d.journal_date}{d.markdown_body.trim()?" · with note":""}</li>)}</ul>
         </section>
       </div>
     ) : null}
     {panelMode && layout==="phone" ? (sheetOpen ? <NotesSheet onClose={()=>setSheetOpen(false)}>{panelContent}</NotesSheet> : null) : <NotesSidebar
       isOpen={panelOpen}
       onToggle={() => setPanelOpen(open => !open)}
       onCollapse={() => setPanelOpen(false)}
       readerLog={panelMode}
       activeTitle={activeDoc?.title ?? null}
       renderContent={panelContent}
     />}
   </>
 );
 const composer=composing?<section aria-label="New entry" className="panel-card rounded-[1.25rem] p-4"><JournalEntryComposer options={[{source,verseCount:24}]} autoFocus={layout==="desktop"} onSaved={(id,date)=>{setComposing(false);go({stage:"note",date,noteId:id});}} heading={<div className="flex items-center justify-between gap-2"><h3 className="font-display text-base font-extrabold">New entry</h3><button type="button" onClick={()=>setComposing(false)} className="surface-button inline-flex h-11 items-center rounded-full border-2 px-4 text-sm font-semibold lg:h-9">Close</button></div>}/></section>:null;
 const provider={journalOutbox:outbox,deleteDraft,entryDraft,updateEntryDraft:changeEntryDraft,saveEntryDraft,entrySave,openSavedEntry};
 return <QaContext.Provider value={provider}><div className="app-shell min-h-screen"><header className="app-header hidden sm:block"><div className="shell-container flex items-center justify-between py-4"><span className="brand-wordmark brand-pill text-2xl">Verse<span>Together</span></span><nav className="segmented-control"><Link className="segmented-control-button" href="/browse">Browse</Link><Link className="segmented-control-button" data-active="true" href="/notes">Journal</Link><Link className="segmented-control-button" href="/come-follow-me">Come Follow Me</Link></nav><span className="pill-tag">QA user</span></div></header><main className="app-main mx-auto max-w-[1440px] px-4 pt-3 pb-32 sm:px-8 sm:pt-[calc(var(--header-height)+2rem)] lg:pb-4"><p className="mb-2 text-xs opacity-60">Component QA · synthetic fixtures · no backend connection</p>{sidebarMode?sidebarPane:<JournalWorkspace layout={layout} status="ready" entries={entries} today="2026-10-21" stage={view.stage} selectedDate={view.date} onSelectDate={date=>act({type:"selectDate",date})} selectedKey={view.noteId!==null?`note:${view.noteId}`:null} onOpenNote={(noteId,date)=>{act({type:"openNote",noteId,date});setActive(noteId);}} onOpenReading={entry=>{void qaEntryActions.openReadingEntry(entry.id).then(({id})=>{act({type:"openNote",noteId:id,date:entry.journal_date});});}} onCloseNote={()=>act({type:"closeNote"})} onShowCalendar={()=>act({type:"showCalendar"})} onNewNote={date=>{restart({journalDate:date,source:null});setComposing(true);}} dayActions={composer} notePane={note?<JournalNoteEditor key={note.id} note={note} authorLabel="QA user" showDate={false} onClose={()=>act({type:"closeNote"})} onDeleted={onNoteDeleted} onDateChange={date=>act({type:"openNote",noteId:note.id,date})} readingOptions={[{source,verseCount:24}]}/>:undefined}/>}</main><nav className="fixed bottom-3 inset-x-4 z-40 grid grid-cols-3 rounded-full border-2 p-2 shadow-lg sm:hidden" style={{background:"var(--mobile-nav-shell)",borderColor:"var(--surface-border)"}}><Link className="p-3 text-center" href="/browse">Browse</Link><Link className="p-3 text-center" href="/come-follow-me">CFM</Link><Link className="rounded-full p-3 text-center" style={{background:"var(--mobile-nav-active)",color:"var(--mobile-nav-active-text)"}} href="/notes">Journal</Link></nav></div></QaContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><QaApp/></StrictMode>);
