import { convexMutation, convexQuery } from "@/lib/convexHttp";

export type InsightBlockType = "scripture" | "text" | "quote" | "dictionary";
export type InsightVisibility = "private" | "friends" | "link" | "public";

export type InsightScriptureRef = {
  volume: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  reference: string;
};

/** Where a note or reading came from; href is always a path in this app. */
export type NoteSource = {
  kind: "scripture" | "guide" | "page";
  label: string;
  href: string;
  volume?: string;
  book?: string;
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
};

/** Markdown fields on every note read path; optional so an older backend still satisfies the types. */
export type NoteMarkdownFields = {
  /** Stored Markdown, or a projection of the note's blocks when markdown_canonical is false. */
  markdown_body?: string;
  /** Pass back as expectedRevision when saving. */
  markdown_revision?: number;
  /** True once the note has been saved as Markdown; legacy block edits are then refused. */
  markdown_canonical?: boolean;
  /** YYYY-MM-DD. */
  journal_date?: string;
  source?: NoteSource | null;
  /** When the entry also logs reading of its source; owner read paths only. */
  reading_at?: string | null;
};

export type InsightDraftSummary = NoteMarkdownFields & {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  visibility: InsightVisibility;
  tags: string[];
  created_at: string;
  updated_at: string;
  last_active_at: string;
  /** Preview fields; optional so an older backend still satisfies the type. */
  block_count?: number;
  excerpt?: string | null;
  scripture_refs?: string[];
};

export type InsightDraftBlock = {
  id: string;
  order: number;
  type: InsightBlockType;
  text: string | null;
  highlight_text: string | null;
  highlight_word_indices: number[];
  link_url: string | null;
  scripture_ref: InsightScriptureRef | null;
  dictionary_meta: {
    edition: "1828" | "1844" | "1913" | "ETY";
    word: string;
    heading: string | null;
    pronounce: string | null;
  } | null;
  created_at: string;
  updated_at: string;
};

export type InsightDraft = InsightDraftSummary & {
  blocks: InsightDraftBlock[];
};

export type PublishedInsight = {
  id: string;
  user_id: string;
  author_name: string | null;
  title: string;
  summary: string | null;
  visibility: InsightVisibility;
  tags: string[];
  block_count: number;
  published_at: string;
  /** Present when a Markdown-backed note was published; blocks then hold one text block with this body. */
  markdown_body?: string | null;
  markdown_revision?: number | null;
  journal_date?: string | null;
  source?: NoteSource | null;
  blocks: Array<{
    id: string;
    order: number;
    type: InsightBlockType;
    text: string | null;
    highlight_text: string | null;
    highlight_word_indices: number[];
    link_url: string | null;
    scripture_ref: InsightScriptureRef | null;
    dictionary_meta: {
      edition: "1828" | "1844" | "1913" | "ETY";
      word: string;
      heading: string | null;
      pronounce: string | null;
    } | null;
  }>;
};

/** insights:getSharedDraft. A Markdown-backed note's blocks are one text block holding markdown_body. */
export type SharedInsightDraft = NoteMarkdownFields & {
  id: string;
  user_id: string;
  author_name: string | null;
  title: string;
  status: "draft" | "published" | "archived";
  visibility: InsightVisibility;
  tags: string[];
  updated_at: string;
  blocks: PublishedInsight["blocks"];
};

/** insights:saveJournalNote failure data when expectedRevision is stale (thrown as a ConvexError). */
export type NoteRevisionConflict = {
  code: "REVISION_CONFLICT";
  message: string;
  currentRevision: number;
};

/** insights:listMyJournal rows, newest journal day first. */
export type JournalEntry =
  | {
      kind: "note";
      id: string;
      title: string;
      status: "draft" | "published" | "archived";
      visibility: InsightVisibility;
      journal_date: string;
      source: NoteSource | null;
      excerpt: string | null;
      markdown_revision: number;
      reading_at?: string | null;
      markdown_canonical: boolean;
      read_only: false;
      author_label: string;
      created_at: string;
      updated_at: string;
    }
  | {
      /** A verse annotation with note text, shown read-only. */
      kind: "verse_annotation";
      id: string;
      title: null;
      body: string;
      journal_date: string;
      source: NoteSource;
      highlight_color: "yellow" | "blue" | "green" | "pink" | "purple" | null;
      read_only: true;
      author_label: string;
      created_at: string;
      updated_at: string;
    };

/** readingProgress:listMyReadingLog rows, newest first. */
export type ReadingLogEntry = {
  id: string;
  /** legacy_chapter_read: a chapter's latest completion from before history was logged. */
  kind: "log" | "legacy_chapter_read";
  origin: "chapter_mark" | "manual" | "legacy";
  source: NoteSource;
  journal_date: string;
  read_at: string;
  created_at: string;
  request_id: string | null;
  /** The journal entry this reading belongs to. */
  note_id?: string;
};

export type AccountData = {
  friends: Array<{
    id: string;
    requester_id: string;
    addressee_id: string;
    status: "pending" | "accepted" | "blocked";
  }>;
  names: Record<string, string>;
};

export type ReaderPreferences = {
  showFootnotes: boolean;
  fontScale: number;
  fontFamily: "serif" | "sans";
  comparisonView: "inline" | "sideBySide";
  textWidth?: "comfortable" | "wide" | "full";
};

export type WatchedFeedEpisode = {
  episode_id: string;
  feed_id: string | null;
  source: string | null;
  title: string | null;
  published_at: string | null;
  watched_at: string;
  updated_at: string;
};

export async function getProfileName(clerkId: string): Promise<string | null> {
  return await convexQuery("users:getProfileName", { clerkId });
}

export async function getNames(clerkIds: string[]): Promise<Record<string, string>> {
  if (clerkIds.length === 0) return {};
  return await convexQuery("users:getNames", { clerkIds });
}

export async function lookupUserByEmail(email: string): Promise<string | null> {
  return await convexQuery("users:lookupUserByEmail", { email });
}

export async function getPublishedInsightsFeed(): Promise<PublishedInsight[]> {
  return await convexQuery("insights:getPublishedInsightsFeed", {});
}

export async function listWatchedFeedEpisodes(token: string): Promise<WatchedFeedEpisode[]> {
  const rows = await convexQuery<
    Array<{
      episodeId: string;
      feedId: string | null;
      source: string | null;
      title: string | null;
      publishedAt: number | null;
      watchedAt: number;
      updatedAt: number;
    }>
  >("feedEpisodes:listWatchedEpisodes", {}, token);

  return rows.map((row) => ({
    episode_id: row.episodeId,
    feed_id: row.feedId,
    source: row.source,
    title: row.title,
    published_at: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    watched_at: new Date(row.watchedAt).toISOString(),
    updated_at: new Date(row.updatedAt).toISOString(),
  }));
}

export async function getWatchedFeedEpisodeIds(token: string, episodeIds?: string[]): Promise<string[]> {
  return await convexQuery("feedEpisodes:getWatchedEpisodeIds", {
    episodeIds: episodeIds && episodeIds.length > 0 ? episodeIds : undefined,
  }, token);
}

export async function markFeedEpisodeWatched(
  token: string,
  payload: {
    episodeId: string;
    feedId?: string | null;
    source?: string | null;
    title?: string | null;
    publishedAt?: string | number | Date | null;
  }
): Promise<{ ok: true }> {
  const publishedAt =
    payload.publishedAt == null
      ? undefined
      : typeof payload.publishedAt === "number"
        ? payload.publishedAt
        : new Date(payload.publishedAt).getTime();

  return await convexMutation("feedEpisodes:markEpisodeWatched", {
    episodeId: payload.episodeId,
    feedId: payload.feedId ?? undefined,
    source: payload.source ?? undefined,
    title: payload.title ?? undefined,
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
  }, token);
}

export async function markFeedEpisodeUnwatched(
  token: string,
  episodeId: string
): Promise<{ ok: true }> {
  return await convexMutation("feedEpisodes:markEpisodeUnwatched", { episodeId }, token);
}

export async function createShare(
  token: string,
  payload: {
    volume: string;
    book: string;
    chapter: number;
    verseStart: number;
    verseEnd: number;
    translation?: string | null;
    note?: string | null;
    content?: string | null;
  }
): Promise<{ id: string }> {
  return await convexMutation("social:createShare", {
    ...payload,
    translation: payload.translation ?? undefined,
    note: payload.note ?? undefined,
    content: payload.content ?? undefined,
  }, token);
}

export async function listMyInsightDrafts(token: string): Promise<InsightDraftSummary[]> {
  return await convexQuery("insights:listMyDrafts", {}, token);
}

/** Null when the session is no longer signed in. */
export async function getInsightDraft(token: string, draftId: string): Promise<InsightDraft | null> {
  return await convexQuery("insights:getDraft", { draftId }, token);
}

export async function createInsightDraft(token: string, title?: string | null): Promise<{ id: string }> {
  return await convexMutation("insights:createDraft", { title: title ?? undefined }, token);
}

export async function setActiveInsightDraft(token: string, draftId: string) {
  return await convexMutation("insights:setActiveDraft", { draftId }, token);
}

export async function renameInsightDraft(token: string, draftId: string, title: string) {
  return await convexMutation("insights:renameDraft", { draftId, title }, token);
}

export async function saveInsightDraftSettings(
  token: string,
  payload: {
    draftId: string;
    title?: string | null;
    visibility?: InsightVisibility;
    tags?: string[];
  }
) {
  return await convexMutation(
    "insights:saveDraftSettings",
    {
      draftId: payload.draftId,
      title: payload.title ?? undefined,
      visibility: payload.visibility,
      tags: payload.tags ?? undefined,
    },
    token
  );
}

export async function deleteInsightDraft(token: string, draftId: string) {
  return await convexMutation("insights:deleteDraft", { draftId }, token);
}

export async function addInsightBlock(
  token: string,
  payload: {
    draftId: string;
    type: InsightBlockType;
    text?: string | null;
    highlightText?: string | null;
    highlightWordIndices?: number[] | null;
    linkUrl?: string | null;
    scriptureRef?: InsightScriptureRef | null;
    dictionaryMeta?: {
      edition: "1828" | "1844" | "1913" | "ETY";
      word: string;
      heading?: string | null;
      pronounce?: string | null;
    } | null;
  }
): Promise<{ id: string }> {
  return await convexMutation(
    "insights:addBlock",
    {
      draftId: payload.draftId,
      type: payload.type,
      text: payload.text ?? undefined,
      highlightText: payload.highlightText ?? undefined,
      highlightWordIndices: payload.highlightWordIndices ?? undefined,
      linkUrl: payload.linkUrl ?? undefined,
      scriptureRef: payload.scriptureRef ?? undefined,
      dictionaryMeta: payload.dictionaryMeta ?? undefined,
    },
    token
  );
}

export async function appendScriptureInsightBlock(
  token: string,
  payload: {
    draftId: string;
    volume: string;
    book: string;
    chapter: number;
    verseStart: number;
    verseEnd: number;
    reference: string;
    text?: string | null;
    highlightText?: string | null;
    highlightWordIndices?: number[] | null;
  }
): Promise<{ id: string }> {
  return await convexMutation(
    "insights:appendScriptureBlock",
    {
      ...payload,
      text: payload.text ?? undefined,
      highlightText: payload.highlightText ?? undefined,
      highlightWordIndices: payload.highlightWordIndices ?? undefined,
    },
    token
  );
}

export async function updateInsightBlock(
  token: string,
  payload: {
    blockId: string;
    text?: string | null;
    highlightText?: string | null;
    highlightWordIndices?: number[] | null;
    linkUrl?: string | null;
    scriptureRef?: InsightScriptureRef | null;
    dictionaryMeta?: {
      edition: "1828" | "1844" | "1913" | "ETY";
      word: string;
      heading?: string | null;
      pronounce?: string | null;
    } | null;
  }
) {
  return await convexMutation(
    "insights:updateBlock",
    {
      blockId: payload.blockId,
      text: payload.text ?? undefined,
      highlightText: payload.highlightText ?? undefined,
      highlightWordIndices: payload.highlightWordIndices ?? undefined,
      linkUrl: payload.linkUrl ?? undefined,
      scriptureRef: payload.scriptureRef ?? undefined,
      dictionaryMeta: payload.dictionaryMeta ?? undefined,
    },
    token
  );
}

export async function removeInsightBlock(token: string, blockId: string) {
  return await convexMutation("insights:removeBlock", { blockId }, token);
}

export async function reorderInsightBlocks(token: string, draftId: string, blockIds: string[]) {
  return await convexMutation("insights:reorderBlocks", { draftId, blockIds }, token);
}

export async function publishInsightDraft(
  token: string,
  payload: {
    draftId: string;
    title?: string | null;
    summary?: string | null;
    visibility?: InsightVisibility;
    tags?: string[];
  }
): Promise<{ id: string }> {
  return await convexMutation(
    "insights:publishDraft",
    {
      draftId: payload.draftId,
      title: payload.title ?? undefined,
      summary: payload.summary ?? undefined,
      visibility: payload.visibility,
      tags: payload.tags ?? undefined,
    },
    token
  );
}

export async function getAccountData(token: string): Promise<AccountData> {
  return await convexQuery("social:getAccountData", {}, token);
}

export async function sendFriendRequest(token: string, targetClerkId: string) {
  return await convexMutation("social:sendFriendRequest", { targetClerkId }, token);
}

export async function updateFriendshipStatus(
  token: string,
  friendshipId: string,
  status: "pending" | "accepted" | "blocked"
) {
  return await convexMutation("social:updateFriendshipStatus", { friendshipId, status }, token);
}

export async function removeFriendship(token: string, friendshipId: string) {
  return await convexMutation("social:removeFriendship", { friendshipId }, token);
}

export async function getReaderPreferences(token?: string | null): Promise<ReaderPreferences | null> {
  return await convexQuery("preferences:getReaderPreferences", {}, token ?? undefined);
}

export async function saveReaderPreferences(token: string, prefs: ReaderPreferences) {
  return await convexMutation("preferences:saveReaderPreferences", prefs, token);
}

export async function submitFeedback(
  payload: { message: string; contact?: string | null; path?: string | null },
  token?: string | null
) {
  return await convexMutation(
    "feedback:submitFeedback",
    {
      message: payload.message,
      contact: payload.contact ?? undefined,
      path: payload.path ?? undefined,
    },
    token ?? undefined
  );
}
