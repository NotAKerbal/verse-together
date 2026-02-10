// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { nextConferenceRefresh } from "./utils";

export const getVerseChapter = query({
  args: { volume: v.string(), book: v.string(), chapter: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("verseCache")
      .withIndex("by_ref", (q: any) => q.eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter))
      .unique();
    if (!row) return null;
    return {
      reference: row.reference,
      verses: row.verses,
      fetchedAt: row.fetchedAt,
    };
  },
});

export const upsertVerseChapter = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    reference: v.string(),
    verses: v.array(
      v.object({
        verse: v.number(),
        text: v.string(),
        footnotes: v.optional(
          v.array(
            v.object({
              footnote: v.string(),
              start: v.optional(v.number()),
              end: v.optional(v.number()),
            })
          )
        ),
      })
    ),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("verseCache")
      .withIndex("by_ref", (q: any) => q.eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter))
      .unique();
    const payload = {
      volume: args.volume,
      book: args.book,
      chapter: args.chapter,
      reference: args.reference,
      verses: args.verses,
      fetchedAt: args.fetchedAt,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ok: true };
    }
    await ctx.db.insert("verseCache", payload);
    return { ok: true };
  },
});

export const getChapterBundle = query({
  args: { volume: v.string(), book: v.string(), chapter: v.number() },
  handler: async (ctx, args) => {
    const chapter = await ctx.db
      .query("chapters")
      .withIndex("by_book_chapter", (q: any) =>
        q.eq("volume", args.volume).eq("book", args.book).eq("chapterNumber", args.chapter)
      )
      .unique();
    if (!chapter) return null;

    const verseRows = await ctx.db
      .query("verses")
      .withIndex("by_chapter_verse", (q: any) => q.eq("chapterId", chapter._id))
      .collect();
    verseRows.sort((a, b) => a.verseNumber - b.verseNumber);

    const verses = [];
    for (const verseRow of verseRows) {
      const noteRows = await ctx.db.query("footnotes").withIndex("by_source", (q: any) => q.eq("sourceVerseId", verseRow._id)).collect();
      noteRows.sort((a, b) => a.label.localeCompare(b.label));
      const footnotes = noteRows.map((n) => ({
        footnote: n.noteText ?? "",
        start: n.start,
        end: n.end,
      }));
      verses.push({
        verse: verseRow.verseNumber,
        text: verseRow.text,
        ...(footnotes.length > 0 ? { footnotes } : {}),
      });
    }

    return {
      reference: chapter.reference,
      verseCount: chapter.verseCount,
      fetchedAt: chapter.fetchedAt,
      verses,
    };
  },
});

export const upsertChapterBundle = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    reference: v.string(),
    verses: v.array(
      v.object({
        verse: v.number(),
        text: v.string(),
        footnotes: v.optional(
          v.array(
            v.object({
              footnote: v.string(),
              start: v.optional(v.number()),
              end: v.optional(v.number()),
            })
          )
        ),
      })
    ),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let chapter = await ctx.db
      .query("chapters")
      .withIndex("by_book_chapter", (q: any) =>
        q.eq("volume", args.volume).eq("book", args.book).eq("chapterNumber", args.chapter)
      )
      .unique();

    if (!chapter) {
      const chapterId = await ctx.db.insert("chapters", {
        volume: args.volume,
        book: args.book,
        chapterNumber: args.chapter,
        reference: args.reference,
        verseCount: args.verses.length,
        fetchedAt: args.fetchedAt,
        updatedAt: now,
      });
      chapter = await ctx.db.get(chapterId);
    } else {
      await ctx.db.patch(chapter._id, {
        reference: args.reference,
        verseCount: args.verses.length,
        fetchedAt: args.fetchedAt,
        updatedAt: now,
      });
    }

    const existingVerses = await ctx.db
      .query("verses")
      .withIndex("by_chapter_verse", (q: any) => q.eq("chapterId", chapter._id))
      .collect();
    const verseByNum = new Map(existingVerses.map((vRow) => [vRow.verseNumber, vRow]));

    for (const verse of args.verses) {
      const existingVerse = verseByNum.get(verse.verse);
      let verseId = existingVerse?._id;
      if (existingVerse) {
        await ctx.db.patch(existingVerse._id, { text: verse.text });
      } else {
        verseId = await ctx.db.insert("verses", {
          chapterId: chapter._id,
          verseNumber: verse.verse,
          text: verse.text,
        });
      }

      const existingNotes = await ctx.db.query("footnotes").withIndex("by_source", (q: any) => q.eq("sourceVerseId", verseId)).collect();
      for (const n of existingNotes) await ctx.db.delete(n._id);
      for (let idx = 0; idx < (verse.footnotes ?? []).length; idx += 1) {
        const note = (verse.footnotes ?? [])[idx];
        await ctx.db.insert("footnotes", {
          sourceVerseId: verseId,
          label: `${verse.verse}-${idx + 1}`,
          noteText: note.footnote,
          start: note.start,
          end: note.end,
          relatedVerseRef: undefined,
        });
      }
    }

    // Keep legacy table in sync during migration.
    const legacy = await ctx.db
      .query("verseCache")
      .withIndex("by_ref", (q: any) => q.eq("volume", args.volume).eq("book", args.book).eq("chapter", args.chapter))
      .unique();
    const legacyPayload = {
      volume: args.volume,
      book: args.book,
      chapter: args.chapter,
      reference: args.reference,
      verses: args.verses,
      fetchedAt: args.fetchedAt,
      updatedAt: now,
    };
    if (legacy) await ctx.db.patch(legacy._id, legacyPayload);
    else await ctx.db.insert("verseCache", legacyPayload);

    return { ok: true };
  },
});

export const getCachedBook = query({
  args: { volume: v.string(), book: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("booksCache")
      .withIndex("by_volume_book", (q: any) => q.eq("volume", args.volume).eq("book", args.book))
      .unique();
    if (!row) return null;
    return { payload: row.payload, fetchedAt: row.fetchedAt };
  },
});

export const upsertCachedBook = mutation({
  args: {
    volume: v.string(),
    book: v.string(),
    payload: v.object({
      _id: v.string(),
      title: v.string(),
      titleShort: v.optional(v.string()),
      titleOfficial: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      summary: v.optional(v.string()),
      chapterDelineation: v.optional(v.string()),
      chapters: v.array(
        v.object({
          _id: v.string(),
          summary: v.optional(v.string()),
        })
      ),
    }),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("booksCache")
      .withIndex("by_volume_book", (q: any) => q.eq("volume", args.volume).eq("book", args.book))
      .unique();
    const payload = {
      volume: args.volume,
      book: args.book,
      payload: args.payload,
      fetchedAt: args.fetchedAt,
      updatedAt: now,
    };
    if (row) await ctx.db.patch(row._id, payload);
    else await ctx.db.insert("booksCache", payload);
    return { ok: true };
  },
});

export const getCachedReferenceParse = query({
  args: { referenceKey: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("referenceParseCache")
      .withIndex("by_reference_key", (q: any) => q.eq("referenceKey", args.referenceKey))
      .unique();
    if (!row) return null;
    return { payload: row.payload, fetchedAt: row.fetchedAt };
  },
});

export const upsertCachedReferenceParse = mutation({
  args: {
    referenceKey: v.string(),
    payload: v.object({
      valid: v.boolean(),
      prettyString: v.optional(v.string()),
      references: v.optional(
        v.array(
          v.object({
            book: v.string(),
            chapters: v.array(
              v.object({
                start: v.number(),
                end: v.number(),
                verses: v.array(
                  v.object({
                    start: v.number(),
                    end: v.number(),
                  })
                ),
              })
            ),
          })
        )
      ),
      error: v.optional(v.string()),
    }),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("referenceParseCache")
      .withIndex("by_reference_key", (q: any) => q.eq("referenceKey", args.referenceKey))
      .unique();
    const payload = {
      referenceKey: args.referenceKey,
      payload: args.payload,
      fetchedAt: args.fetchedAt,
      updatedAt: now,
    };
    if (row) await ctx.db.patch(row._id, payload);
    else await ctx.db.insert("referenceParseCache", payload);
    return { ok: true };
  },
});

export const getTalkCache = query({
  args: { talkId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("talkCache").withIndex("by_talk_id", (q: any) => q.eq("talkId", args.talkId)).unique();
    if (!row) return null;
    return {
      rawHtml: row.rawHtml,
      parsed: row.parsed,
      fetchedAt: row.fetchedAt,
    };
  },
});

export const upsertTalkCache = mutation({
  args: {
    talkId: v.string(),
    rawHtml: v.string(),
    parsed: v.object({
      id: v.string(),
      title: v.string(),
      speaker: v.optional(v.string()),
      calling: v.optional(v.string()),
      session: v.optional(v.string()),
      aboutHtml: v.optional(v.string()),
      bodyHtml: v.string(),
    }),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("talkCache").withIndex("by_talk_id", (q: any) => q.eq("talkId", args.talkId)).unique();
    const payload = {
      talkId: args.talkId,
      rawHtml: args.rawHtml,
      parsed: args.parsed,
      fetchedAt: args.fetchedAt,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, payload);
    else await ctx.db.insert("talkCache", payload);
    return { ok: true };
  },
});

export const getCitationChapterListing = query({
  args: { bookByuId: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("citationChapterCache").withIndex("by_book_id", (q: any) => q.eq("bookByuId", args.bookByuId)).unique();
    if (!row) return null;
    return {
      chapterNumbers: row.chapterNumbers,
      stale: Date.now() > row.refreshAfter,
      fetchedAt: row.fetchedAt,
    };
  },
});

export const upsertCitationChapterListing = mutation({
  args: {
    bookByuId: v.number(),
    chapterNumbers: v.array(v.number()),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("citationChapterCache").withIndex("by_book_id", (q: any) => q.eq("bookByuId", args.bookByuId)).unique();
    const payload = {
      bookByuId: args.bookByuId,
      chapterNumbers: args.chapterNumbers,
      fetchedAt: args.fetchedAt,
      refreshAfter: nextConferenceRefresh(args.fetchedAt),
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, payload);
    else await ctx.db.insert("citationChapterCache", payload);
    return { ok: true };
  },
});

export const getCitation = query({
  args: { bookByuId: v.number(), chapter: v.number(), verseSpec: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("citationCache")
      .withIndex("by_ref", (q: any) =>
        q.eq("bookByuId", args.bookByuId).eq("chapter", args.chapter).eq("verseSpec", args.verseSpec)
      )
      .unique();
    if (!row) return null;
    return {
      talks: row.talks,
      fetchedAt: row.fetchedAt,
      refreshAfter: row.refreshAfter,
      stale: Date.now() > row.refreshAfter,
    };
  },
});

export const upsertCitation = mutation({
  args: {
    bookByuId: v.number(),
    chapter: v.number(),
    verseSpec: v.string(),
    talks: v.array(
      v.object({
        id: v.optional(v.string()),
        title: v.string(),
        speaker: v.optional(v.string()),
        conference: v.optional(v.string()),
        year: v.optional(v.string()),
        session: v.optional(v.string()),
        href: v.optional(v.string()),
        talkUrl: v.optional(v.string()),
        watchUrl: v.optional(v.string()),
        listenUrl: v.optional(v.string()),
        talkId: v.optional(v.string()),
      })
    ),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("citationCache")
      .withIndex("by_ref", (q: any) =>
        q.eq("bookByuId", args.bookByuId).eq("chapter", args.chapter).eq("verseSpec", args.verseSpec)
      )
      .unique();
    const payload = {
      bookByuId: args.bookByuId,
      chapter: args.chapter,
      verseSpec: args.verseSpec,
      talks: args.talks,
      fetchedAt: args.fetchedAt,
      refreshAfter: nextConferenceRefresh(args.fetchedAt),
      lastAccessedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { ok: true };
    }
    await ctx.db.insert("citationCache", payload);
    return { ok: true };
  },
});

export const sweepStaleCitations = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("citationCache").collect();
    const now = Date.now();
    // Keep cache bounded by removing very old citation entries.
    for (const row of rows) {
      const ageMs = now - row.fetchedAt;
      if (ageMs > 1000 * 60 * 60 * 24 * 365 * 2) {
        await ctx.db.delete(row._id);
      }
    }
    return { ok: true };
  },
});
