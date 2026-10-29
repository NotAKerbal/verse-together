import { convexMutation, convexQuery } from "@/lib/convexHttp";
import type { MarkPreset } from "../../convex/annotationRules";

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
      highlight_color: "red" | "yellow" | "blue" | "green" | "pink" | "purple" | null;
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
  /** Read-only here: saved by preferences.saveMarkPresets, never by saveReaderPreferences. */
  markPresets?: MarkPreset[];
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

export async function saveReaderPreferences(token: string, prefs: Omit<ReaderPreferences, "markPresets">) {
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
