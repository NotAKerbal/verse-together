import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  readerPreferences: defineTable({
    clerkId: v.string(),
    showFootnotes: v.boolean(),
    fontScale: v.number(),
    fontFamily: v.union(v.literal("serif"), v.literal("sans")),
    comparisonView: v.optional(v.union(v.literal("inline"), v.literal("sideBySide"))),
    updatedAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  scriptureShares: defineTable({
    clerkId: v.string(),
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verseStart: v.number(),
    verseEnd: v.number(),
    translation: v.optional(v.string()),
    note: v.optional(v.string()),
    content: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_chapter", ["volume", "book", "chapter"]),

  scriptureComments: defineTable({
    shareId: v.id("scriptureShares"),
    clerkId: v.string(),
    body: v.string(),
    visibility: v.union(v.literal("public"), v.literal("friends")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_share", ["shareId"])
    .index("by_clerk_id", ["clerkId"])
    .index("by_created_at", ["createdAt"]),

  scriptureReactions: defineTable({
    shareId: v.id("scriptureShares"),
    clerkId: v.string(),
    reaction: v.string(),
    createdAt: v.number(),
  })
    .index("by_share", ["shareId"])
    .index("by_share_user_reaction", ["shareId", "clerkId", "reaction"]),

  insightDrafts: defineTable({
    clerkId: v.string(),
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    visibility: v.optional(
      v.union(
        v.literal("private"),
        v.literal("friends"),
        v.literal("link"),
        v.literal("public")
      )
    ),
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_clerk_status", ["clerkId", "status"])
    .index("by_clerk_last_active", ["clerkId", "lastActiveAt"]),

  insightDraftBlocks: defineTable({
    draftId: v.id("insightDrafts"),
    order: v.number(),
    type: v.union(v.literal("scripture"), v.literal("text"), v.literal("quote"), v.literal("dictionary")),
    text: v.optional(v.string()),
    highlightText: v.optional(v.string()),
    highlightWordIndices: v.optional(v.array(v.number())),
    linkUrl: v.optional(v.string()),
    scriptureRef: v.optional(
      v.object({
        volume: v.string(),
        book: v.string(),
        chapter: v.number(),
        verseStart: v.number(),
        verseEnd: v.number(),
        reference: v.string(),
      })
    ),
    dictionaryMeta: v.optional(
      v.object({
        edition: v.union(v.literal("1828"), v.literal("1844"), v.literal("1913"), v.literal("ETY")),
        word: v.string(),
        heading: v.optional(v.string()),
        pronounce: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_draft_order", ["draftId", "order"])
    .index("by_draft", ["draftId"]),

  publishedInsights: defineTable({
    draftId: v.id("insightDrafts"),
    clerkId: v.string(),
    title: v.string(),
    summary: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal("private"),
        v.literal("friends"),
        v.literal("link"),
        v.literal("public")
      )
    ),
    tags: v.optional(v.array(v.string())),
    blockCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.number(),
  })
    .index("by_published_at", ["publishedAt"])
    .index("by_clerk_published", ["clerkId", "publishedAt"])
    .index("by_draft", ["draftId"]),

  publishedInsightBlocks: defineTable({
    insightId: v.id("publishedInsights"),
    order: v.number(),
    type: v.union(v.literal("scripture"), v.literal("text"), v.literal("quote"), v.literal("dictionary")),
    text: v.optional(v.string()),
    highlightText: v.optional(v.string()),
    highlightWordIndices: v.optional(v.array(v.number())),
    linkUrl: v.optional(v.string()),
    scriptureRef: v.optional(
      v.object({
        volume: v.string(),
        book: v.string(),
        chapter: v.number(),
        verseStart: v.number(),
        verseEnd: v.number(),
        reference: v.string(),
      })
    ),
    dictionaryMeta: v.optional(
      v.object({
        edition: v.union(v.literal("1828"), v.literal("1844"), v.literal("1913"), v.literal("ETY")),
        word: v.string(),
        heading: v.optional(v.string()),
        pronounce: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_insight_order", ["insightId", "order"])
    .index("by_insight", ["insightId"]),

  friendships: defineTable({
    requesterClerkId: v.string(),
    addresseeClerkId: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("blocked")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_requester", ["requesterClerkId"])
    .index("by_addressee", ["addresseeClerkId"]),

  feedback: defineTable({
    clerkId: v.optional(v.string()),
    message: v.string(),
    contact: v.optional(v.string()),
    path: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),

  chapters: defineTable({
    volume: v.string(),
    book: v.string(),
    chapterNumber: v.number(),
    reference: v.string(),
    verseCount: v.number(),
    fetchedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_book_chapter", ["volume", "book", "chapterNumber"]),

  verses: defineTable({
    chapterId: v.id("chapters"),
    verseNumber: v.number(),
    text: v.string(),
  }).index("by_chapter_verse", ["chapterId", "verseNumber"]),

  footnotes: defineTable({
    sourceVerseId: v.id("verses"),
    label: v.string(),
    noteText: v.optional(v.string()),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    relatedVerseRef: v.optional(v.string()),
  }).index("by_source", ["sourceVerseId"]),

  booksCache: defineTable({
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
    updatedAt: v.number(),
  }).index("by_volume_book", ["volume", "book"]),

  referenceParseCache: defineTable({
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
    updatedAt: v.number(),
  }).index("by_reference_key", ["referenceKey"]),

  talkCache: defineTable({
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
    updatedAt: v.number(),
  }).index("by_talk_id", ["talkId"]),

  citationChapterCache: defineTable({
    bookByuId: v.number(),
    chapterNumbers: v.array(v.number()),
    fetchedAt: v.number(),
    refreshAfter: v.number(),
    updatedAt: v.number(),
  }).index("by_book_id", ["bookByuId"]),

  verseCache: defineTable({
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
    updatedAt: v.number(),
  }).index("by_ref", ["volume", "book", "chapter"]),

  citationCache: defineTable({
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
    refreshAfter: v.number(),
    lastAccessedAt: v.number(),
  }).index("by_ref", ["bookByuId", "chapter", "verseSpec"]),
});
