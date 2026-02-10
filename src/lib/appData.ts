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

export type InsightDraftSummary = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  visibility: InsightVisibility;
  tags: string[];
  created_at: string;
  updated_at: string;
  last_active_at: string;
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
    edition: "1828" | "1844" | "1913";
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
      edition: "1828" | "1844" | "1913";
      word: string;
      heading: string | null;
      pronounce: string | null;
    } | null;
  }>;
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
};

export async function upsertCurrentUser(
  token: string | null,
  payload: { email?: string | null; displayName?: string | null; avatarUrl?: string | null }
) {
  if (!token) return;
  await convexMutation("users:upsertCurrentUser", {
    email: payload.email ?? undefined,
    displayName: payload.displayName ?? undefined,
    avatarUrl: payload.avatarUrl ?? undefined,
  }, token);
}

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

export async function getInsightDraft(token: string, draftId: string): Promise<InsightDraft> {
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
      edition: "1828" | "1844" | "1913";
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
      edition: "1828" | "1844" | "1913";
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
