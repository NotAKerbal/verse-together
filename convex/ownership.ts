import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Every table that stores an app owner key, checked through an owner index. Used by the migration
 * tooling to tell whether an app user owns any content before a link or retirement decision.
 * Feedback is intentionally excluded: it may be anonymous and is not user-facing content.
 */
const OWNED_TABLE_CHECKS: Array<{ table: string; check: (ctx: Ctx, ownerId: string) => Promise<unknown> }> = [
  { table: "readerPreferences", check: (ctx, id) => ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "feedEpisodeWatches", check: (ctx, id) => ctx.db.query("feedEpisodeWatches").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "scriptureShares", check: (ctx, id) => ctx.db.query("scriptureShares").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "scriptureComments", check: (ctx, id) => ctx.db.query("scriptureComments").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "scriptureReactions", check: (ctx, id) => ctx.db.query("scriptureReactions").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "insightDrafts", check: (ctx, id) => ctx.db.query("insightDrafts").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "publishedInsights", check: (ctx, id) => ctx.db.query("publishedInsights").withIndex("by_clerk_published", (q) => q.eq("clerkId", id)).first() },
  { table: "noteFolders", check: (ctx, id) => ctx.db.query("noteFolders").withIndex("by_clerk", (q) => q.eq("clerkId", id)).first() },
  { table: "noteFolderAssignments", check: (ctx, id) => ctx.db.query("noteFolderAssignments").withIndex("by_clerk", (q) => q.eq("clerkId", id)).first() },
  { table: "verseAnnotations", check: (ctx, id) => ctx.db.query("verseAnnotations").withIndex("by_user_chapter", (q) => q.eq("clerkId", id)).first() },
  { table: "guideHighlights", check: (ctx, id) => ctx.db.query("guideHighlights").withIndex("by_user_guide", (q) => q.eq("clerkId", id)).first() },
  { table: "chapterReads", check: (ctx, id) => ctx.db.query("chapterReads").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "readingLogs", check: (ctx, id) => ctx.db.query("readingLogs").withIndex("by_clerk_day", (q) => q.eq("clerkId", id)).first() },
  { table: "lastReadingPositions", check: (ctx, id) => ctx.db.query("lastReadingPositions").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "readingPlans", check: (ctx, id) => ctx.db.query("readingPlans").withIndex("by_clerk_id", (q) => q.eq("clerkId", id)).first() },
  { table: "friendships (requester)", check: (ctx, id) => ctx.db.query("friendships").withIndex("by_requester", (q) => q.eq("requesterClerkId", id)).first() },
  { table: "friendships (addressee)", check: (ctx, id) => ctx.db.query("friendships").withIndex("by_addressee", (q) => q.eq("addresseeClerkId", id)).first() },
  { table: "scriptureResources", check: (ctx, id) => ctx.db.query("scriptureResources").withIndex("by_created_by", (q) => q.eq("createdByClerkId", id)).first() },
];

/** Names of the tables in which `ownerId` owns at least one row. */
export async function listOwnedTables(ctx: Ctx, ownerId: string): Promise<string[]> {
  const owned: string[] = [];
  for (const { table, check } of OWNED_TABLE_CHECKS) {
    if (await check(ctx, ownerId)) owned.push(table);
  }
  return owned;
}
