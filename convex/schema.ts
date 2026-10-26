import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { noteSourceValidator } from "./noteJournal";
import { legacyQuickMarkValidator, markColorValidator, markPresetValidator } from "./markValidators";

const scriptureResourceCoverage = v.object({
  book: v.string(),
  bookEnd: v.optional(v.string()),
  bookOrder: v.optional(v.number()),
  bookEndOrder: v.optional(v.number()),
  resourceType: v.union(v.literal("verse"), v.literal("verse_range"), v.literal("chapter"), v.literal("chapter_range")),
  chapterStart: v.number(),
  chapterEnd: v.number(),
  verseStart: v.optional(v.number()),
  verseEnd: v.optional(v.number()),
});

export default defineSchema({
  // Durable receipts make device imports safe to retry, including after the imported record is deleted.
  deviceStudyImports: defineTable({ clerkId: v.string(), deviceId: v.string(), recordId: v.string() })
    .index("by_owner_device", ["clerkId", "deviceId"]),
  users: defineTable({
    // Stable app owner key referenced by every owned table's `clerkId` column. Legacy accounts keep
    // their Clerk user id here; accounts created after the Better Auth cutover use their Better Auth
    // user id. The column keeps its legacy name so existing rows and indexes need no rewrite.
    clerkId: v.string(),
    // Better Auth user id (JWT subject) that is allowed to act as this app user. Set on sign-up for new
    // accounts, or by the internal admin migration (convex/authMigration.ts) for legacy Clerk accounts.
    authUserId: v.optional(v.string()),
    authLinkedAt: v.optional(v.number()),
    authLinkSource: v.optional(v.union(v.literal("better-auth-signup"), v.literal("admin-migration"))),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
    journalGoals: v.optional(v.object({ studyDays: v.number(), reflections: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_auth_user_id", ["authUserId"])
    .index("by_email", ["email"]),

  // Better Auth rate-limit buckets (convex/authRateLimit.ts). `key` is a SHA-256 of Better Auth's
  // `ip|path` key; rows past `expiresAt` are dead and pruned as new windows open.
  authRateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expires_at", ["expiresAt"]),

  readerPreferences: defineTable({
    clerkId: v.string(),
    showFootnotes: v.boolean(),
    fontScale: v.number(),
    fontFamily: v.union(v.literal("serif"), v.literal("sans")),
    comparisonView: v.optional(v.union(v.literal("inline"), v.literal("sideBySide"))),
    textWidth: v.optional(v.union(v.literal("comfortable"), v.literal("wide"), v.literal("full"))),
    // The selection menu's mark presets, in order (convex/annotationRules.ts); absent means the defaults, and
    // an empty list means none.
    markPresets: v.optional(v.array(markPresetValidator)),
    // The earlier quick-mark choice, kept only so readMarkPresets can carry it over until presets are saved.
    quickMarks: v.optional(v.array(legacyQuickMarkValidator)),
    updatedAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  feedEpisodeWatches: defineTable({
    clerkId: v.string(),
    episodeId: v.string(),
    feedId: v.optional(v.string()),
    source: v.optional(v.string()),
    title: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    watchedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_clerk_episode", ["clerkId", "episodeId"]),

  spotifyShowCache: defineTable({
    showId: v.string(),
    name: v.string(),
    publisher: v.string(),
    description: v.optional(v.string()),
    externalUrl: v.string(),
    imageUrl: v.optional(v.string()),
    totalEpisodes: v.number(),
    nextOffset: v.optional(v.number()),
    fetchedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_show_id", ["showId"]),

  spotifyEpisodeCache: defineTable({
    showId: v.string(),
    episodeId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    releaseDate: v.string(),
    releaseDatePrecision: v.union(v.literal("year"), v.literal("month"), v.literal("day")),
    releaseDateSortKey: v.string(),
    durationMs: v.number(),
    externalUrl: v.string(),
    imageUrl: v.optional(v.string()),
    isPlayable: v.boolean(),
    isExternallyHosted: v.boolean(),
    fetchedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_show_episode", ["showId", "episodeId"])
    .index("by_show_release", ["showId", "releaseDateSortKey", "episodeId"]),

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
    .index("by_chapter", ["volume", "book", "chapter"])
    .index("by_clerk_id", ["clerkId"]),

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
    .index("by_share_user_reaction", ["shareId", "clerkId", "reaction"])
    .index("by_clerk_id", ["clerkId"]),

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
    // Canonical Markdown body. Absent on older notes, whose ordered blocks are projected to Markdown until
    // the first explicit save; once present, the blocks are only a retained snapshot.
    markdownBody: v.optional(v.string()),
    // Bumped on every content change; saves must name the revision they edited.
    markdownRevision: v.optional(v.number()),
    // YYYY-MM-DD the note belongs to in the journal.
    journalDate: v.optional(v.string()),
    source: v.optional(noteSourceValidator),
    // When set, the entry also logs reading of `source` (with or without note text). Kept on its original value
    // while the reading is edited, so an older reading opened as an entry keeps its time.
    readingAt: v.optional(v.number()),
    // The client request that created the entry, so a retried create finds it instead of adding another.
    entryRequestId: v.optional(v.string()),
    // noteJournal's entryContentFingerprint of the content that request last wrote: a later retry carrying the same
    // content is the same save; one carrying other content is refused once the entry has been edited since.
    entryRequestFingerprint: v.optional(v.string()),
    // The note revision that request last left (absent: 0). A retry replacing the text bumps the revision so an
    // editor opened on the earlier text can't save over it; any revision past this one is an edit made since.
    entryRequestRevision: v.optional(v.number()),
    // An older reading opened as this entry (see noteJournal's history keys): the original is kept but no
    // longer listed on its own.
    readingHistoryKey: v.optional(v.string()),
    // Reserved for a future generated summary heading. Nothing writes it yet.
    summaryHeading: v.optional(v.object({ text: v.string(), updatedAt: v.number() })),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_clerk_status", ["clerkId", "status"])
    .index("by_clerk_last_active", ["clerkId", "lastActiveAt"])
    .index("by_clerk_entry_request", ["clerkId", "entryRequestId"]),

  // Keys of deleted journal entries (their create request id and any older reading they stood for), so a late
  // retry of the create or a reading kept for history doesn't bring a deleted entry back.
  journalEntryDeletions: defineTable({
    clerkId: v.string(),
    key: v.string(),
    deletedAt: v.number(),
  }).index("by_clerk_key", ["clerkId", "key"]),

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
    // Copied from a Markdown-backed draft at publish time; the block rows stay as the old snapshot.
    markdownBody: v.optional(v.string()),
    markdownRevision: v.optional(v.number()),
    journalDate: v.optional(v.string()),
    source: v.optional(noteSourceValidator),
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

  noteFolders: defineTable({
    clerkId: v.string(),
    name: v.string(),
    parentFolderId: v.optional(v.id("noteFolders")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_clerk_name", ["clerkId", "name"])
    .index("by_parent", ["parentFolderId"]),

  noteFolderAssignments: defineTable({
    clerkId: v.string(),
    draftId: v.id("insightDrafts"),
    folderId: v.id("noteFolders"),
    updatedAt: v.number(),
  })
    .index("by_clerk_draft", ["clerkId", "draftId"])
    .index("by_folder", ["folderId"])
    .index("by_clerk", ["clerkId"]),

  verseAnnotations: defineTable({
    clerkId: v.string(),
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verse: v.number(),
    body: v.string(),
    visibility: v.union(v.literal("private"), v.literal("public")),
    highlightColor: v.optional(markColorValidator),
    // Absent on rows saved before underlines existed, and whenever the verse isn't underlined.
    underline: v.optional(v.boolean()),
    // The underline's color, only while underlined; an underline saved without one (before underlines had
    // colors) is red.
    underlineColor: v.optional(markColorValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_chapter", ["clerkId", "volume", "book", "chapter"])
    .index("by_chapter_verse", ["volume", "book", "chapter", "verse"])
    .index("by_user_verse", ["clerkId", "volume", "book", "chapter", "verse"]),

  // A private annotation on a span of a Come, Follow Me guide's prose (see convex/annotationRules.ts for the
  // anchor): any mix of a highlight, an underline, and a note, like a verse annotation. Separate from
  // verseAnnotations: guide text is not a verse. Named for the highlight that was all it held at first.
  guideHighlights: defineTable({
    clerkId: v.string(),
    guide: v.string(),
    part: v.union(v.literal("introduction"), v.literal("reader")),
    startBlock: v.string(),
    startOffset: v.number(),
    endBlock: v.string(),
    endOffset: v.number(),
    exact: v.string(),
    prefix: v.string(),
    suffix: v.string(),
    // Every row from before guide underlines and notes has one of the first five colors; absent when the span
    // is underlined or has a note but isn't highlighted.
    highlightColor: v.optional(markColorValidator),
    // Absent whenever the span isn't underlined.
    underlineColor: v.optional(markColorValidator),
    // The private note (normalized as a verse note is); absent when there is none.
    body: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_guide", ["clerkId", "guide"]),

  chapterReads: defineTable({
    clerkId: v.string(),
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    readAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_user_volume", ["clerkId", "volume"])
    .index("by_user_book", ["clerkId", "volume", "book"])
    .index("by_user_chapter", ["clerkId", "volume", "book", "chapter"]),

  // Append-only reading history. chapterReads keeps only the latest completion per chapter.
  readingLogs: defineTable({
    clerkId: v.string(),
    source: noteSourceValidator,
    journalDate: v.string(),
    readAt: v.number(),
    createdAt: v.number(),
    // Client-generated, so a retried request finds its earlier entry instead of adding another.
    requestId: v.string(),
    // "chapter_mark": logged by markChapterRead; "manual": logReading (never marks a chapter complete).
    origin: v.union(v.literal("chapter_mark"), v.literal("manual")),
  })
    .index("by_clerk_day", ["clerkId", "journalDate"])
    .index("by_clerk_request", ["clerkId", "requestId"]),

  lastReadingPositions: defineTable({
    clerkId: v.string(),
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    verse: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  readingPlans: defineTable({
    clerkId: v.string(),
    title: v.string(),
    template: v.union(v.literal("bom-30"), v.literal("book-daily"), v.literal("custom")),
    steps: v.array(
      v.object({
        volume: v.string(),
        book: v.string(),
        chapter: v.number(),
        label: v.string(),
      })
    ),
    // Ordered scope the steps were expanded from, so the builder can round-trip an edit.
    selections: v.optional(
      v.array(
        v.object({
          kind: v.union(v.literal("volume"), v.literal("book"), v.literal("range")),
          volume: v.string(),
          book: v.optional(v.string()),
          from: v.optional(v.number()),
          to: v.optional(v.number()),
        })
      )
    ),
    startDate: v.optional(v.string()),
    chaptersPerDay: v.optional(v.number()),
    // Seven booleans, Monday first. Missing means every day.
    readingDays: v.optional(v.array(v.boolean())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_clerk_created", ["clerkId", "createdAt"]),

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

  chapterInsightCache: defineTable({
    volume: v.string(),
    book: v.string(),
    chapter: v.number(),
    reference: v.string(),
    scriptureHash: v.string(),
    promptVersion: v.number(),
    paths: v.array(
      v.object({
        kind: v.union(
          v.literal("cross_reference"),
          v.literal("doctrinal_context"),
          v.literal("historical_context"),
          v.literal("word_or_phrase"),
          v.literal("textual_pattern"),
          v.literal("open_question")
        ),
        verse_numbers: v.array(v.number()),
        title: v.string(),
        direction: v.string(),
        why: v.string(),
        look_for: v.array(v.string()),
        sources: v.array(
          v.object({
            title: v.string(),
            url: v.string(),
            format: v.optional(v.union(v.literal("article"), v.literal("video"))),
          })
        ),
        scripture_links: v.optional(v.array(
          v.object({
            reference: v.string(),
            volume: v.string(),
            book: v.string(),
            chapter: v.number(),
            verse_start: v.number(),
            verse_end: v.number(),
          })
        )),
      })
    ),
    generatedAt: v.number(),
    signature: v.string(),
    updatedAt: v.number(),
  }).index("by_ref", ["volume", "book", "chapter"]),


  scriptureResources: defineTable({
    volume: v.string(),
    book: v.string(),
    bookEnd: v.optional(v.string()),
    bookOrder: v.optional(v.number()),
    bookEndOrder: v.optional(v.number()),
    resourceType: v.union(v.literal("verse"), v.literal("verse_range"), v.literal("chapter"), v.literal("chapter_range")),
    coverages: v.optional(v.array(scriptureResourceCoverage)),
    title: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    chapterStart: v.number(),
    chapterEnd: v.number(),
    verseStart: v.optional(v.number()),
    verseEnd: v.optional(v.number()),
    createdByClerkId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_volume", ["volume"])
    .index("by_volume_book", ["volume", "book"])
    .index("by_scope", ["volume", "book", "chapterStart", "chapterEnd"])
    .index("by_created_by", ["createdByClerkId"]),
});
