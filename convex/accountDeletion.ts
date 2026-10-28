// Deleting an account's app data when its owner deletes their account (Better Auth's /delete-user, enabled in
// convex/auth.ts). Better Auth removes its own user, sessions and Google link; this removes everything the app
// stores for that person, keyed by the app owner key (the `clerkId` column; see convex/utils.ts).
//
// Order: `begin` records the deletion and removes the users row first, so from then on no session can resolve
// this owner (every owned read and write goes through that row) and nothing new can be written behind the sweep.
// `sweep` then deletes owned rows in bounded batches until none are left. A retry after a partial failure finds
// the same owner key through the accountDeletions record. The mutations are internal: their callers are the Better
// Auth hooks, which run after Better Auth has verified the caller's own fresh session. `pending` lets the signed-in
// owner (and only them) see that their own deletion stopped partway, so the app and site can offer to finish it: with
// the users row gone there is no app user to show, and provisioning one is refused (convex/users.ts).

import { v } from "convex/values";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { getAuthenticatedAuthUserId } from "./utils";

/** Shared reference rows a deleted account created are kept, credited to no one. */
export const DELETED_ACCOUNT_OWNER = "deleted-account";

/** Rows deleted (or detached) per sweep call: well inside Convex's per-mutation limits. */
export const SWEEP_BATCH = 200;

type Budget = { left: number };
type Step = (ctx: MutationCtx, owner: string, budget: Budget) => Promise<void>;

async function remove(ctx: MutationCtx, budget: Budget, ids: Array<Id<TableNames>>) {
  for (const id of ids) {
    if (budget.left <= 0) return;
    await ctx.db.delete(id);
    budget.left -= 1;
  }
}

/**
 * Every table that stores an app owner key, and how its rows go. Child rows (blocks, others' comments and
 * reactions on this person's shares) are deleted before their parent. tests/convex/nativeAuth.test.ts
 * fails when a table with an owner column is missing here.
 */
export const DELETION_STEPS: Record<string, Step> = {
  friendships: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("friendships").withIndex("by_requester", (q) => q.eq("requesterClerkId", owner)).take(budget.left)).map((row) => row._id));
    await remove(ctx, budget, (await ctx.db.query("friendships").withIndex("by_addressee", (q) => q.eq("addresseeClerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  scriptureReactions: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("scriptureReactions").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  scriptureComments: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("scriptureComments").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  scriptureShares: async (ctx, owner, budget) => {
    while (budget.left > 0) {
      const share = await ctx.db.query("scriptureShares").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).first();
      if (!share) return;
      await remove(ctx, budget, (await ctx.db.query("scriptureReactions").withIndex("by_share", (q) => q.eq("shareId", share._id)).take(budget.left)).map((row) => row._id));
      await remove(ctx, budget, (await ctx.db.query("scriptureComments").withIndex("by_share", (q) => q.eq("shareId", share._id)).take(budget.left)).map((row) => row._id));
      if (budget.left <= 0) return;
      await remove(ctx, budget, [share._id]);
    }
  },
  publishedInsights: async (ctx, owner, budget) => {
    while (budget.left > 0) {
      const insight = await ctx.db.query("publishedInsights").withIndex("by_clerk_published", (q) => q.eq("clerkId", owner)).first();
      if (!insight) return;
      await remove(ctx, budget, (await ctx.db.query("publishedInsightBlocks").withIndex("by_insight", (q) => q.eq("insightId", insight._id)).take(budget.left)).map((row) => row._id));
      if (budget.left <= 0) return;
      await remove(ctx, budget, [insight._id]);
    }
  },
  noteFolderAssignments: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("noteFolderAssignments").withIndex("by_clerk", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  noteFolders: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("noteFolders").withIndex("by_clerk", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  insightDrafts: async (ctx, owner, budget) => {
    while (budget.left > 0) {
      const draft = await ctx.db.query("insightDrafts").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).first();
      if (!draft) return;
      await remove(ctx, budget, (await ctx.db.query("insightDraftBlocks").withIndex("by_draft", (q) => q.eq("draftId", draft._id)).take(budget.left)).map((row) => row._id));
      if (budget.left <= 0) return;
      await remove(ctx, budget, [draft._id]);
    }
  },
  journalEntryDeletions: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("journalEntryDeletions").withIndex("by_clerk_key", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  verseAnnotations: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("verseAnnotations").withIndex("by_user_chapter", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  guideHighlights: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("guideHighlights").withIndex("by_user_guide", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  chapterReads: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("chapterReads").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  readingLogs: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("readingLogs").withIndex("by_clerk_day", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  lastReadingPositions: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("lastReadingPositions").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  readingPlans: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("readingPlans").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  readerPreferences: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("readerPreferences").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  feedEpisodeWatches: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("feedEpisodeWatches").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  deviceStudyImports: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("deviceStudyImports").withIndex("by_owner_device", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  // Feedback may carry a reply address and is personal; anonymous feedback has no owner and is untouched.
  feedback: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("feedback").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
  // Study resources are shared reference links (added by admins) that other people's study points to: keep the
  // link, drop who added it.
  scriptureResources: async (ctx, owner, budget) => {
    const rows = await ctx.db.query("scriptureResources").withIndex("by_created_by", (q) => q.eq("createdByClerkId", owner)).take(budget.left);
    for (const row of rows) {
      await ctx.db.patch(row._id, { createdByClerkId: DELETED_ACCOUNT_OWNER, updatedAt: Date.now() });
      budget.left -= 1;
    }
  },
  // Normally already removed by `begin`; also covers a row keyed by this owner but linked to no one.
  users: async (ctx, owner, budget) => {
    await remove(ctx, budget, (await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", owner)).take(budget.left)).map((row) => row._id));
  },
};

/**
 * Starts (or resumes) deleting the app data of a Better Auth user: returns the owner key to sweep, or null when
 * this user never had app data. Removes the users row, so no session can act as this owner from here on.
 */
export const begin = internalMutation({
  args: { authUserId: v.string() },
  handler: async (ctx, { authUserId }): Promise<string | null> => {
    const started = await ctx.db.query("accountDeletions").withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId)).first();
    const rows = await ctx.db.query("users").withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId)).collect();
    // One Better Auth user links to at most one app user; anything else is corrupted links: fail closed.
    if (rows.length > 1) throw new Error("Account link conflict; contact support.");
    if (started && rows.length === 1 && rows[0].clerkId !== started.clerkId) throw new Error("Account link conflict; contact support.");
    const clerkId = started?.clerkId ?? rows[0]?.clerkId ?? null;
    if (clerkId === null) return null;
    if (!started) await ctx.db.insert("accountDeletions", { authUserId, clerkId, startedAt: Date.now() });
    for (const row of rows) await ctx.db.delete(row._id);
    return clerkId;
  },
});

/** Deletes up to SWEEP_BATCH of the owner's rows; `done` once nothing owned by `clerkId` is left. */
export const sweep = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    if (!clerkId || clerkId === DELETED_ACCOUNT_OWNER) throw new Error("Invalid owner");
    const budget: Budget = { left: SWEEP_BATCH };
    for (const step of Object.values(DELETION_STEPS)) {
      await step(ctx, clerkId, budget);
      if (budget.left <= 0) return { done: false };
    }
    return { done: true };
  },
});

/** Removes the deletion record once Better Auth has deleted the user. */
export const finish = internalMutation({
  args: { authUserId: v.string() },
  handler: async (ctx, { authUserId }) => {
    const rows = await ctx.db.query("accountDeletions").withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

/**
 * The caller's own unfinished account deletion, or null (signed out, or nothing pending). Scoped to the verified
 * Better Auth session's user: no argument can name another account. Finishing it is the same POST /delete-user,
 * with its fresh-session check and rate limit; this only says there is something to finish.
 */
export const pending = query({
  args: {},
  handler: async (ctx): Promise<{ appUserId: string; startedAt: number } | null> => {
    const authUserId = await getAuthenticatedAuthUserId(ctx);
    if (!authUserId) return null;
    const started = await ctx.db.query("accountDeletions").withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId)).first();
    return started ? { appUserId: started.clerkId, startedAt: started.startedAt } : null;
  },
});

/** True while this Better Auth user's account is being deleted: it must not be provisioned again. */
export async function isAccountDeletionStarted(ctx: MutationCtx, authUserId: string): Promise<boolean> {
  return !!(await ctx.db.query("accountDeletions").withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId)).first());
}
