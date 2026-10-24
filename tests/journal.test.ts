/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
const modules = import.meta.glob("../convex/**/*.ts");
const source = { kind: "scripture" as const, label: "1 Nephi 2", href: "/browse/bookofmormon/1-nephi/2#v-3", volume: "bookofmormon", book: "1-nephi", chapter: 2 };
function setup() { const t = convexTest(schema, modules); return { t, alice: t.withIdentity({ subject: "alice" }), bob: t.withIdentity({ subject: "bob" }) }; }

describe("journal persistence and authorization", () => {
  test("requires authentication and keeps notes scoped to owner", async () => {
    const {t,alice,bob}=setup();
    await expect(t.mutation(api.insights.createJournalNote, {journalDate:"2026-10-21"})).rejects.toThrow();
    const {id}=await alice.mutation(api.insights.createJournalNote,{journalDate:"2026-10-21",source});
    await expect(bob.query(api.insights.getDraft,{draftId:id})).rejects.toThrow();
    await expect(bob.mutation(api.insights.saveJournalNote,{draftId:id,markdownBody:"stolen",expectedRevision:0})).rejects.toThrow();
    expect(await bob.query(api.insights.listMyJournal,{})).toHaveLength(0);
  });
  test("preserves exact Markdown, stable day/source and detects concurrent edits",async()=>{
    const {alice}=setup();
    const {id}=await alice.mutation(api.insights.createJournalNote,{journalDate:"2026-10-20",source});
    const before=await alice.query(api.insights.getDraft,{draftId:id});
    const body="## Listening\n\nA thought #faith  \n\n";
    await alice.mutation(api.insights.saveJournalNote,{draftId:id,markdownBody:body,expectedRevision:before.markdown_revision});
    const saved=await alice.query(api.insights.getDraft,{draftId:id});
    expect(saved.markdown_body).toBe(body);
    expect(saved.journal_date).toBe("2026-10-20");
    expect(saved.source).toEqual(source);
    await expect(alice.mutation(api.insights.saveJournalNote,{draftId:id,markdownBody:"stale",expectedRevision:before.markdown_revision})).rejects.toThrow();
    await alice.mutation(api.insights.saveJournalNote,{draftId:id,markdownBody:"",expectedRevision:saved.markdown_revision});
    expect((await alice.query(api.insights.getDraft,{draftId:id})).markdown_body).toBe("");
  });
  test("rejects invalid dates and unsafe source links",async()=>{
    const {alice}=setup();
    for(const journalDate of ["2026-02-30","2026-13-01","October 21"]) await expect(alice.mutation(api.insights.createJournalNote,{journalDate})).rejects.toThrow();
    for(const href of ["//evil.example","javascript:alert(1)","/\\evil.example","/notes\nheader"]) await expect(alice.mutation(api.insights.createJournalNote,{journalDate:"2026-10-21",source:{...source,href}})).rejects.toThrow();
  });
  test("new Markdown notes expose real verse markers and summaries omit full bodies",async()=>{
    const {alice}=setup();
    const {id}=await alice.mutation(api.insights.createJournalNote,{journalDate:"2026-10-21",source:{...source,verseStart:3,verseEnd:5}});
    const markers=await alice.query(api.insights.listMyScriptureRefsForChapter,{volume:"bookofmormon",book:"1-nephi",chapter:2});
    expect(markers).toEqual([expect.objectContaining({draftId:id,verseStart:3,verseEnd:5})]);
    expect((await alice.query(api.insights.listMyDrafts,{}))[0]).not.toHaveProperty("markdown_body");
  });
  test("projects legacy blocks and preserves them as recovery data after editing",async()=>{
    const {alice,t}=setup();
    const {id}=await alice.mutation(api.insights.createDraft,{title:"Old note"});
    await alice.mutation(api.insights.addBlock,{draftId:id,type:"text",text:"My existing note"});
    const oldBlocks=await t.run(ctx=>ctx.db.query("insightDraftBlocks").withIndex("by_draft",q=>q.eq("draftId",id)).collect());
    const before=await alice.query(api.insights.getDraft,{draftId:id});
    expect(before.markdown_body).toContain("My existing note");
    await alice.mutation(api.insights.saveJournalNote,{draftId:id,markdownBody:"## Revised\nPreserved original",expectedRevision:before.markdown_revision});
    expect(await t.run(ctx=>ctx.db.query("insightDraftBlocks").withIndex("by_draft",q=>q.eq("draftId",id)).collect())).toEqual(oldBlocks);
  });
  test("shares and publishes canonical text without stale block contents",async()=>{
    const {alice,bob,t}=setup();
    const {id}=await alice.mutation(api.insights.createDraft,{title:"Legacy",visibility:"public"});
    await alice.mutation(api.insights.addBlock,{draftId:id,type:"text",text:"old sensitive snapshot"});
    const old=await alice.query(api.insights.getDraft,{draftId:id});
    await alice.mutation(api.insights.saveJournalNote,{draftId:id,markdownBody:"# Current\nVisible body",expectedRevision:old.markdown_revision});
    const shared=await bob.query(api.insights.getSharedDraft,{draftId:id});
    expect(shared.blocks.map((b:{text?:string})=>b.text).join("\n")).toBe("# Current\nVisible body");
    await expect(alice.mutation(api.insights.updateBlock,{blockId:old.blocks[0].id,text:"edit stale block"})).rejects.toThrow();
    await alice.mutation(api.insights.publishDraft,{draftId:id});
    const published=await t.run(ctx=>ctx.db.query("publishedInsightBlocks").collect());
    expect(published.map(b=>b.text).join("\n")).toBe("# Current\nVisible body");
    await expect(alice.mutation(api.insights.saveJournalNote,{draftId:id,markdownBody:"no",expectedRevision:old.markdown_revision+1})).rejects.toThrow();
  });
  test("includes own legacy annotation notes with exact source while excluding other users and highlight-only records",async()=>{
    const {alice,t}=setup();
    await t.run(async ctx=>{
      for(const [clerkId,body,verse] of [["alice","Existing annotation",3],["bob","Other user's note",4],["alice","",5]] as const)
        await ctx.db.insert("verseAnnotations",{clerkId,body,volume:"bookofmormon",book:"1-nephi",chapter:2,verse,visibility:"private",createdAt:Date.UTC(2026,9,20),updatedAt:Date.UTC(2026,9,21)});
    });
    const rows=await alice.query(api.insights.listMyJournal,{});
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).toContain("Existing annotation");
    expect(JSON.stringify(rows)).toContain("#v-3");
    expect(JSON.stringify(rows)).not.toContain("Other user's note");
  });
});

describe("reading history",()=>{
  test("logs retries once and isolates owners",async()=>{
    const {alice,bob,t}=setup();
    const input={source,journalDate:"2026-10-21",requestId:"request-one"};
    await alice.mutation(api.readingProgress.logReading,input);
    await alice.mutation(api.readingProgress.logReading,input);
    expect(await alice.query(api.readingProgress.listMyReadingLog,{})).toHaveLength(1);
    expect(await bob.query(api.readingProgress.listMyReadingLog,{})).toHaveLength(0);
    expect(await t.run(ctx=>ctx.db.query("chapterReads").collect())).toHaveLength(0);
  });
  test("preserves the last legacy reading when rereading without duplicating later history",async()=>{
    const {alice,t}=setup();const old=Date.UTC(2026,9,5,12);
    await t.run(ctx=>ctx.db.insert("chapterReads",{clerkId:"alice",volume:"bookofmormon",book:"1-nephi",chapter:2,readAt:old}));
    expect((await alice.query(api.readingProgress.listMyReadingLog,{}))[0].origin).toBe("legacy");
    await alice.mutation(api.readingProgress.markChapterRead,{volume:"bookofmormon",book:"1-nephi",chapter:2,journalDate:"2026-10-21",requestId:"reread-legacy"});
    let rows=await alice.query(api.readingProgress.listMyReadingLog,{});expect(rows).toHaveLength(2);expect(rows.some(r=>r.read_at===new Date(old).toISOString())).toBe(true);
    await alice.mutation(api.readingProgress.unmarkChapterRead,{volume:"bookofmormon",book:"1-nephi",chapter:2});
    rows=await alice.query(api.readingProgress.listMyReadingLog,{});expect(rows).toHaveLength(2);
  });
  test("preserves legacy reading history when unmarking a pre-feature completion",async()=>{
    const {alice,t}=setup();const old=Date.UTC(2026,9,5,12);
    await t.run(ctx=>ctx.db.insert("chapterReads",{clerkId:"alice",volume:"bookofmormon",book:"1-nephi",chapter:3,readAt:old}));
    await alice.mutation(api.readingProgress.unmarkChapterRead,{volume:"bookofmormon",book:"1-nephi",chapter:3});
    const rows=await alice.query(api.readingProgress.listMyReadingLog,{});expect(rows).toHaveLength(1);expect(rows[0].read_at).toBe(new Date(old).toISOString());
    expect(await t.run(ctx=>ctx.db.query("chapterReads").collect())).toHaveLength(0);
  });
  test("keeps legacy completion visible and retains future history on unmark",async()=>{
    const {alice}=setup();
    await alice.mutation(api.readingProgress.markChapterRead,{volume:"bookofmormon",book:"1-nephi",chapter:2,journalDate:"2026-10-21",requestId:"complete-2"});
    expect(await alice.query(api.readingProgress.listMyReadingLog,{})).toHaveLength(1);
    await alice.mutation(api.readingProgress.unmarkChapterRead,{volume:"bookofmormon",book:"1-nephi",chapter:2});
    expect(await alice.query(api.readingProgress.listMyReadingLog,{})).toHaveLength(1);
  });
});
