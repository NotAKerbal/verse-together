import { convexMutation, convexQuery } from "@/lib/convexHttp";

export type FeedShare = {
  id: string;
  user_id: string;
  volume: string;
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  translation: string | null;
  note: string | null;
  content: string | null;
  created_at: string;
  reaction_count: number;
  comment_count: number;
};

export type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  visibility: "public" | "friends";
};

export type ChapterActivity = {
  verseIndicators: Record<number, { comments: number; likes: number }>;
  verseComments: Record<number, Array<{ id: string; user_id: string; body: string; created_at: string }>>;
  names: Record<string, string>;
};

export type AccountData = {
  friends: Array<{
    id: string;
    requester_id: string;
    addressee_id: string;
    status: "pending" | "accepted" | "blocked";
  }>;
  myComments: Array<{
    id: string;
    body: string;
    created_at: string;
    share_id: string;
    visibility: "public" | "friends";
  }>;
  names: Record<string, string>;
  shares: Record<
    string,
    {
      id: string;
      book: string;
      chapter: number;
      verse_start: number;
      verse_end: number;
      translation: string | null;
      content: string | null;
    }
  >;
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

export async function getFeed(): Promise<FeedShare[]> {
  return await convexQuery("social:getFeed", {});
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

export async function getComments(shareId: string): Promise<CommentRow[]> {
  return await convexQuery("social:getComments", { shareId });
}

export async function createComment(
  token: string,
  payload: { shareId: string; body: string; visibility: "public" | "friends" }
) {
  return await convexMutation("social:createComment", payload, token);
}

export async function updateComment(token: string, commentId: string, body: string) {
  return await convexMutation("social:updateComment", { commentId, body }, token);
}

export async function deleteComment(token: string, commentId: string) {
  return await convexMutation("social:deleteComment", { commentId }, token);
}

export async function getReactionCount(shareId: string): Promise<number> {
  return await convexQuery("social:getReactionCount", { shareId });
}

export async function toggleReaction(token: string, shareId: string, reaction = "like") {
  return await convexMutation("social:toggleReaction", { shareId, reaction }, token);
}

export async function getChapterActivity(volume: string, book: string, chapter: number): Promise<ChapterActivity> {
  return await convexQuery("social:getChapterActivity", { volume, book, chapter });
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
