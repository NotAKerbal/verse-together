import Link from "next/link";
import {StrictMode,useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import NotesSidebar from "../../src/features/notes/NotesSidebar";
import NotesSheet from "../../src/features/notes/NotesSheet";
import ChapterLogView from "../../src/features/notes/ChapterLogView";
import {NewNoteLaunchError,useNewNoteLauncher} from "../../src/features/notes/useNewNoteLauncher";
import type {ReadingLogAttempt} from "../../src/features/notes/ReadingLogButton";
import type {ChapterMarkAttempt} from "../../src/features/plans/ChapterReadToggle";
import JournalWorkspace from "../../src/features/notes/JournalWorkspace";
import ReadingLogButton from "../../src/features/notes/ReadingLogButton";
import JournalNoteEditor from "../../src/features/notes/JournalNoteEditor";
import {JournalOutbox} from "../../src/features/notes/journalOutbox";
import {nextJournalView,resolveJournalView,type JournalViewAction,type JournalViewState} from "../../src/features/notes/journalView";
import {useJournalHistory} from "../../src/features/notes/useJournalHistory";
import {QaContext,type NotebookPanelView,type ReaderChapter} from "./provider";
import type {JournalEntry,JournalNoteDocument} from "../../src/features/notes/journal";
import "../../src/app/globals.css";
// Synthetic fixtures only. ?active=none starts with no active note (as if not arriving from the reader's sidebar).
const source={kind:"scripture" as const,label:"1 Nephi 2:3–5",href:"/browse/bookofmormon/1-nephi/2#v-3",volume:"bookofmormon",book:"1-nephi",chapter:2,verseStart:3,verseEnd:5};
const guide={kind:"guide" as const,label:"Come, Follow Me: October 19–25",href:"/come-follow-me/2026-10-19"};
const longGuide={kind:"guide" as const,label:"Come, Follow Me: October 19–25 — 1 Nephi 1–5: “I Will Go and Do” (synthetic long source label)",href:"/come-follow-me/2026-10-19"};
const initial:JournalNoteDocument={id:"qa-note",title:"A willingness to listen",status:"draft",markdown_body:"# A willingness to listen\n\nI can begin before I feel ready.\n\n## What I want to remember\n\n- Notice the invitation to act.\n- Return to the promise in the passage.\n\nA thought about #faith.\n",markdown_revision:0,markdown_canonical:true,journal_date:"2026-10-21",source,created_at:"2026-10-21T10:15:00Z",updated_at:"2026-10-21T10:15:00Z"};
const fixtures:JournalNoteDocument[]=[initial,
 {...initial,id:"qa-note-2",title:"Questions for family study",markdown_body:"# Questions for family study\n\n- What did Lehi's family leave behind?\n- What would we leave?\n",journal_date:"2026-10-21",source:guide,created_at:"2026-10-21T19:40:00Z",updated_at:"2026-10-21T19:40:00Z"},
 {...initial,id:"qa-note-3",title:"Shared with the class",status:"published",markdown_body:"# Shared with the class\n\nA published note is read-only here.\n",journal_date:"2026-10-21",source:null,created_at:"2026-10-21T21:05:00Z",updated_at:"2026-10-21T21:05:00Z"},
 // Long title, excerpt and source, like a real rail card that was squeezed (excerpts run to 220 characters).
 {...initial,id:"qa-note-long",title:"[QA TEST 2026-10-21] Notes after a long synthetic study session that keep going well past one line",markdown_body:"# [QA TEST 2026-10-21] Notes after a long synthetic study session that keep going well past one line\n\nSynthetic QA text. Save and reload round one stays exactly as typed, including #faith. Edited after a reload: revision two is saved. This sentence only exists to run past two lines in the rail and the chooser.\n",journal_date:"2026-10-21",source:longGuide,created_at:"2026-10-21T22:10:00Z",updated_at:"2026-10-21T22:10:00Z"},
 {...initial,id:"qa-note-word",title:"Synthetic-unbroken-QA-title-word-Supercalifragilisticexpialidocious-Antidisestablishmentarianism",markdown_body:"# Synthetic-unbroken-QA-title-word-Supercalifragilisticexpialidocious-Antidisestablishmentarianism\n\nhttps://example.invalid/a-synthetic-unbroken-url-like-excerpt-token-that-should-break-instead-of-overflowing-the-card\n",journal_date:"2026-10-21",source:null,created_at:"2026-10-21T22:30:00Z",updated_at:"2026-10-21T22:30:00Z"},
 {...initial,id:"qa-note-4",title:"Sunday thoughts",markdown_body:"# Sunday thoughts\n\nA quiet morning.\n",journal_date:"2026-10-18",source:null,created_at:"2026-10-18T09:00:00Z",updated_at:"2026-10-18T09:00:00Z"},
];
const fixedEntries:JournalEntry[]=[
 {kind:"reading",id:"qa-reading",journal_date:"2026-10-21",source,reader_label:"QA user",read_at:"2026-10-21T10:00:00Z"},
 {kind:"verse_annotation",id:"qa-annotation",title:null,body:"An older verse note, shown read-only.",journal_date:"2026-10-20",source,highlight_color:null,read_only:true,author_label:"QA user",created_at:"2026-10-20T08:30:00Z",updated_at:"2026-10-20T08:30:00Z"},
];
// ?panel: two synthetic chapters for the reader's combined Log and Notes panel.
const panelChapters=[2,3].map((chapter,index)=>{const reference=`1 Nephi ${chapter}`;const href=`/browse/bookofmormon/1-nephi/${chapter}`;return {volume:"bookofmormon",book:"1-nephi",chapter,reference,logReady:true,logOptions:[{source:{kind:"scripture" as const,label:reference,href,volume:"bookofmormon",book:"1-nephi",chapter},verseCount:index===0?24:31}]} satisfies ReaderChapter;});
// Roughly the server's markdownExcerpt: up to 220 characters, then an ellipsis.
function excerptOf(markdown:string){const rest=markdown.split("\n").slice(1).join(" ").replace(/[#*-]/g,"").replace(/\s+/g," ").trim();return rest.length>220?`${rest.slice(0,220).trimEnd()}...`:rest||null;}
function QaApp(){
 const [readings,setReadings]=useState<JournalEntry[]>([]);const [docs,setDocs]=useState(()=>new URLSearchParams(location.search).get("empty")==="true"?[]:fixtures);
 const panelMode=new URLSearchParams(location.search).has("panel");
 const sidebarMode=panelMode||new URLSearchParams(location.search).has("sidebar");
 // ?panel stands in for the provider's Log and Notes state and a chapter page's Log button.
 const [panelView,setPanelView]=useState<NotebookPanelView>("log");
 const [sheetOpen,setSheetOpen]=useState(false);
 const [chapterIndex,setChapterIndex]=useState(0);
 const readerLogPendingRef=useRef<ReadingLogAttempt|null>(null);
 const readerMarkPendingRef=useRef<ChapterMarkAttempt|null>(null);
 const [panelOpen,setPanelOpen]=useState(true);
 // Stands in for the provider's active note: the only note whose document is "loaded".
 const [active,setActive]=useState<string|null>(()=>new URLSearchParams(location.search).get("active")==="none"?null:initial.id);
 const [viewState,setViewState]=useState<JournalViewState>(null);
 const [layout,setLayout]=useState<"phone"|"desktop">(innerWidth<1024?"phone":"desktop");
 const outbox=useMemo(()=>new JournalOutbox(async(id,text,revision)=>{await new Promise(r=>setTimeout(r,150));setDocs(all=>all.map(d=>d.id===id?{...d,markdown_body:text,markdown_revision:revision+1,title:text.split("\n")[0].replace(/^#+\s*/,"")||"Untitled note"}:d));return {markdownRevision:revision+1};}),[]);
 useEffect(()=>{const f=()=>setLayout(innerWidth<1024?"phone":"desktop");addEventListener("resize",f);return()=>removeEventListener("resize",f);},[]);
 const entries:JournalEntry[]=[...docs.map(d=>({...d,kind:"note" as const,author_label:"QA user",excerpt:excerptOf(d.markdown_body),read_only:false as const})),...fixedEntries,...readings];
 useEffect(()=>{const f=(event:Event)=>setReadings(rows=>[...rows,(event as CustomEvent<JournalEntry>).detail]);addEventListener("qa-reading",f);return()=>removeEventListener("qa-reading",f);},[]);
 const activeDoc=docs.find(d=>d.id===active)??null;
 const view=resolveJournalView(viewState,{today:"2026-10-21",activeNoteId:active});
 // The page's own history hook: Back and Forward reopen and close notes here exactly as on /notes.
 const go=useJournalHistory(view,{enabled:true,show:setViewState,select:id=>{if(id!==active&&docs.some(d=>d.id===id))setActive(id);}});
 const act=(action:JournalViewAction)=>go(current=>nextJournalView(current,action));
 const note=view.noteId!==null&&activeDoc?.id===view.noteId?activeDoc:null;
 function create(date:string,fromReader=false,from:JournalNoteDocument["source"]=source){const next={...initial,id:`qa-${Date.now()}`,title:"Untitled note",markdown_body:"",journal_date:date,source:fromReader?from:null,created_at:new Date().toISOString()};setDocs(d=>[...d,next]);setActive(next.id);go({stage:"note",date,noteId:next.id});return next.id;}
 // The phone Log button starts a note for the current chapter, as the reader's does. ?createDelay=ms slows it and
 // ?createError makes it fail (the second for the sidebar's New note too).
 const chapterSource=panelChapters[chapterIndex].logOptions[0].source;
 const newNote=useNewNoteLauncher({scope:panelChapters[chapterIndex].reference,open:()=>{setPanelView("notes");setSheetOpen(true);},create:async()=>{const params=new URLSearchParams(location.search);await new Promise(r=>setTimeout(r,Number(params.get("createDelay"))||0));if(params.has("createError"))throw new Error("Synthetic create failure.");return create("2026-10-21",true,chapterSource);}});
 const sidebarPane = (
   <>
     <section className="panel-card max-w-lg rounded-[20px] p-6">
       <h1 className="font-display text-2xl font-extrabold">{panelMode?panelChapters[chapterIndex].reference:"1 Nephi 2"}</h1>
       <p className="mt-4 font-serif text-lg leading-relaxed">
         And it came to pass that he was obedient unto the word of the Lord, wherefore he did as the Lord commanded him.
       </p>
       <p className="mt-4 text-sm text-[color:var(--foreground-muted)]">Synthetic reader context for the Notes sidebar.</p>
     </section>
     {panelMode ? (
       <div className="mt-4 flex flex-wrap items-center gap-2">
         <button type="button" data-notebook-launcher aria-expanded={layout==="phone"?sheetOpen:panelOpen&&panelView==="log"} aria-busy={newNote.pending||undefined} aria-label={newNote.pending?`Starting a new note for ${panelChapters[chapterIndex].reference}`:`Log and notes for ${panelChapters[chapterIndex].reference}`} className={`surface-button inline-flex h-9 items-center rounded-full border-2 px-4 text-sm font-bold${newNote.pending?" opacity-60":""}`} onClick={()=>{if(layout==="phone"){if(sheetOpen)setSheetOpen(false);else void newNote.launch();}else if(panelOpen&&panelView==="log")setPanelOpen(false);else{setPanelView("log");setPanelOpen(true);}}}>Log</button>
         <button type="button" className="surface-button inline-flex h-9 items-center rounded-full border-2 px-4 text-sm" onClick={()=>setChapterIndex(i=>(i+1)%panelChapters.length)}>Go to {panelChapters[(chapterIndex+1)%panelChapters.length].reference}</button>
         <button type="button" className="surface-button inline-flex h-9 items-center rounded-full border-2 px-4 text-sm" onClick={()=>{setPanelView("notes");if(layout==="phone")setSheetOpen(true);else setPanelOpen(true);}}>Reader note action</button>
         <span className="text-xs text-[color:var(--foreground-muted)]">Synthetic stand-in for the reader header (Log), chapter navigation, and a reader note action (openBuilder; below lg the sheet opens scrolled to Notes).</span>
         <section aria-label="Synthetic reading history" className="w-full text-sm">
           <h2 className="mt-2 font-bold">Synthetic reading history ({readings.length})</h2>
           <ul>{readings.map(r=>r.kind==="reading"?<li key={r.id} data-qa-reading>{r.source.label} · {r.journal_date}</li>:null)}</ul>
         </section>
       </div>
     ) : null}
     {panelMode && layout==="phone" && newNote.error && !sheetOpen ? <NewNoteLaunchError message={newNote.error} onRetry={()=>void newNote.launch()} onOpenLog={()=>{newNote.dismiss();setPanelView("log");setSheetOpen(true);}} onDismiss={newNote.dismiss}/> : null}
     {panelMode && layout==="phone" ? (sheetOpen ? <NotesSheet
       onClose={()=>setSheetOpen(false)}
       log={<ChapterLogView chapter={panelChapters[chapterIndex]} layout="flow"/>}
       revealNotes={panelView==="notes"}
       activeNoteId={active}
       activeNote={activeDoc}
       notes={docs.map(d => ({
         ...d, visibility: "private" as const, tags: [], last_active_at: d.updated_at, excerpt: excerptOf(d.markdown_body),
       }))}
       isLoading={false}
       onSelect={async id => { setActive(id); }}
       onCreate={async () => create("2026-10-21", true, chapterSource)}
     /> : null) : <NotesSidebar
       companion={panelMode?{view:panelView,onViewChange:setPanelView,log:<ChapterLogView chapter={panelChapters[chapterIndex]}/>}:undefined}
       isOpen={panelOpen}
       onToggle={() => setPanelOpen(open => !open)}
       onCollapse={() => setPanelOpen(false)}
       activeNoteId={active}
       activeNote={activeDoc}
       notes={docs.map(d => ({
         ...d, visibility: "private" as const, tags: [], last_active_at: d.updated_at, excerpt: excerptOf(d.markdown_body),
       }))}
       isLoading={false}
       onSelect={async id => { setActive(id); }}
       onCreate={async () => {
         if (new URLSearchParams(location.search).has("createError")) {
           throw new Error("Synthetic create failure. Your current note is safe.");
         }
         return create("2026-10-21", true, panelMode ? chapterSource : source);
       }}
     />}
   </>
 );
 return <QaContext.Provider value={{journalOutbox:outbox,readerLogPendingRef,readerMarkPendingRef}}><div className="app-shell min-h-screen"><header className="app-header hidden sm:block"><div className="shell-container flex items-center justify-between py-4"><span className="brand-wordmark brand-pill text-2xl">Verse<span>Together</span></span><nav className="segmented-control"><Link className="segmented-control-button" href="/browse">Browse</Link><Link className="segmented-control-button" data-active="true" href="/notes">Notes</Link><Link className="segmented-control-button" href="/come-follow-me">Come Follow Me</Link></nav><span className="pill-tag">QA user</span></div></header><main className="mx-auto max-w-[1440px] px-4 pt-3 pb-32 sm:px-8 sm:pt-[calc(var(--header-height)+2rem)] lg:pb-4"><p className="mb-2 text-xs opacity-60">Component QA · synthetic fixtures · no backend connection</p>{sidebarMode?sidebarPane:<JournalWorkspace layout={layout} status="ready" entries={entries} today="2026-10-21" stage={view.stage} selectedDate={view.date} onSelectDate={date=>act({type:"selectDate",date})} selectedKey={view.noteId!==null?`note:${view.noteId}`:null} onOpenNote={(noteId,date)=>{act({type:"openNote",noteId,date});setActive(noteId);}} onCloseNote={()=>act({type:"closeNote"})} onShowCalendar={()=>act({type:"showCalendar"})} onNewNote={create} dayActions={<ReadingLogButton key={view.date} options={[{source,verseCount:24}]} defaultDate={view.date} onLogged={date=>act({type:"selectDate",date})}/>} notePane={note?<JournalNoteEditor key={note.id} note={note} authorLabel="QA user" showDate={false} onClose={()=>act({type:"closeNote"})}/>:undefined}/>}</main><nav className="fixed bottom-3 inset-x-4 z-40 grid grid-cols-3 rounded-full border-2 p-2 shadow-lg sm:hidden" style={{background:"var(--mobile-nav-shell)",borderColor:"var(--surface-border)"}}><Link className="p-3 text-center" href="/browse">Browse</Link><Link className="p-3 text-center" href="/come-follow-me">CFM</Link><Link className="rounded-full p-3 text-center" style={{background:"var(--mobile-nav-active)",color:"var(--mobile-nav-active-text)"}} href="/notes">Notes</Link></nav></div></QaContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><QaApp/></StrictMode>);
