// Internal (CLI/dashboard-only) tooling that links legacy Clerk accounts to Better Auth users.
//
// Nothing here is callable from a browser: these are internal functions, run by an operator with
// deployment access, e.g. through scripts/auth-migration.mjs. A legacy account is linked only when an
// operator supplies an explicit Clerk-id -> email mapping taken from a trusted Clerk export. Each batch
// is planned first; `dryRun: false` applies the batch only if every entry plans cleanly, in one
// transaction. Re-running a batch is safe: already-linked entries are reported and left untouched.
// No owned content is rewritten: links live on the `users` row, and owned rows keep their Clerk ids.
// See docs/auth-migration.md for the full cutover and rollback runbook.
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { listOwnedTables } from "./ownership";

export const MAX_ENTRIES_PER_BATCH = 100;
const CLERK_USER_ID = /^user_[A-Za-z0-9]{8,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const entryValidator = v.object({
  legacyClerkId: v.string(),
  email: v.string(),
  /** Whether Clerk had verified this email address. Unverified addresses are never linked. */
  emailVerified: v.boolean(),
  name: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
});

type Entry = {
  legacyClerkId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  imageUrl?: string;
};

type AuthUser = { _id: string; email: string; emailVerified: boolean; name: string };

export type EntryPlan = {
  legacyClerkId: string;
  email: string;
  status: "link" | "already_linked" | "error";
  actions: Array<"create_legacy_user_row" | "create_auth_user" | "link_existing_auth_user" | "retire_empty_provisional_row">;
  authUserId: string | null;
  error?: string;
  detail?: string[];
};

async function findAuthUserByEmail(ctx: QueryCtx | MutationCtx, email: string): Promise<AuthUser | null> {
  const doc = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  });
  return (doc as AuthUser | null) ?? null;
}

async function findUserByClerkId(ctx: QueryCtx | MutationCtx, clerkId: string): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
}

async function findUsersByAuthUserId(ctx: QueryCtx | MutationCtx, authUserId: string): Promise<Doc<"users">[]> {
  return await ctx.db
    .query("users")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId))
    .collect();
}

function fail(entry: Entry, email: string, error: string, detail?: string[]): EntryPlan {
  return { legacyClerkId: entry.legacyClerkId, email, status: "error", actions: [], authUserId: null, error, detail };
}

async function planEntry(ctx: QueryCtx | MutationCtx, entry: Entry, createMissingAuthUsers: boolean): Promise<EntryPlan> {
  const email = entry.email.trim().toLowerCase();
  if (!CLERK_USER_ID.test(entry.legacyClerkId)) return fail(entry, email, "invalid_legacy_clerk_id");
  if (!EMAIL.test(email)) return fail(entry, email, "invalid_email");
  if (!entry.emailVerified) return fail(entry, email, "legacy_email_unverified");

  const actions: EntryPlan["actions"] = [];
  const legacyRow = await findUserByClerkId(ctx, entry.legacyClerkId);
  if (!legacyRow) {
    // Content can exist without a users row (rows are created on sign-in). Only accept the id if it
    // actually owns something; otherwise it is most likely a typo in the mapping.
    const owned = await listOwnedTables(ctx, entry.legacyClerkId);
    if (owned.length === 0) return fail(entry, email, "unknown_legacy_user");
    actions.push("create_legacy_user_row");
  } else if (legacyRow.authLinkSource === "better-auth-signup" || legacyRow.clerkId === legacyRow.authUserId) {
    return fail(entry, email, "not_a_legacy_user_row");
  }

  const authUser = await findAuthUserByEmail(ctx, email);

  if (legacyRow?.authUserId) {
    if (authUser && String(authUser._id) === legacyRow.authUserId) {
      return { legacyClerkId: entry.legacyClerkId, email, status: "already_linked", actions: [], authUserId: legacyRow.authUserId };
    }
    return fail(entry, email, "legacy_row_linked_to_different_auth_user");
  }

  if (!authUser) {
    if (!createMissingAuthUsers) return fail(entry, email, "auth_user_missing");
    actions.push("create_auth_user");
    return { legacyClerkId: entry.legacyClerkId, email, status: "link", actions, authUserId: null };
  }

  // A Better Auth user whose address was never verified may have been registered by someone who does
  // not own the inbox. Never hand legacy data to it.
  if (!authUser.emailVerified) return fail(entry, email, "existing_auth_user_unverified");
  const authUserId = String(authUser._id);
  actions.push("link_existing_auth_user");

  const linkedRows = await findUsersByAuthUserId(ctx, authUserId);
  if (linkedRows.length > 1) return fail(entry, email, "auth_user_linked_to_multiple_rows");
  const linkedRow = linkedRows[0];
  if (linkedRow) {
    const provisional = linkedRow.clerkId === authUserId;
    if (!provisional) return fail(entry, email, "auth_user_linked_to_different_legacy_user");
    // The person signed up fresh before being migrated. Their new, separate app user may be retired
    // only if it owns nothing; otherwise an operator must decide what to do with that content.
    const owned = await listOwnedTables(ctx, authUserId);
    if (owned.length > 0) return fail(entry, email, "provisional_account_has_data", owned);
    actions.push("retire_empty_provisional_row");
  }

  return { legacyClerkId: entry.legacyClerkId, email, status: "link", actions, authUserId };
}

async function planBatch(ctx: QueryCtx | MutationCtx, entries: Entry[], createMissingAuthUsers: boolean) {
  if (entries.length === 0) throw new Error("No entries supplied");
  if (entries.length > MAX_ENTRIES_PER_BATCH) {
    throw new Error(`At most ${MAX_ENTRIES_PER_BATCH} entries per batch`);
  }
  const seenIds = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  for (const entry of entries) {
    seenIds.set(entry.legacyClerkId, (seenIds.get(entry.legacyClerkId) ?? 0) + 1);
    const email = entry.email.trim().toLowerCase();
    seenEmails.set(email, (seenEmails.get(email) ?? 0) + 1);
  }
  const plans: EntryPlan[] = [];
  for (const entry of entries) {
    const email = entry.email.trim().toLowerCase();
    if ((seenIds.get(entry.legacyClerkId) ?? 0) > 1) {
      plans.push(fail(entry, email, "duplicate_legacy_clerk_id_in_batch"));
    } else if ((seenEmails.get(email) ?? 0) > 1) {
      plans.push(fail(entry, email, "duplicate_email_in_batch"));
    } else {
      plans.push(await planEntry(ctx, entry, createMissingAuthUsers));
    }
  }
  return plans;
}

function summarize(plans: EntryPlan[]) {
  return {
    total: plans.length,
    toLink: plans.filter((plan) => plan.status === "link").length,
    alreadyLinked: plans.filter((plan) => plan.status === "already_linked").length,
    errors: plans.filter((plan) => plan.status === "error").length,
  };
}

/**
 * Plan (dryRun: true) or apply (dryRun: false) links from legacy Clerk ids to Better Auth users.
 *
 * createMissingAuthUsers: create a password-less Better Auth user (email marked verified, as Clerk had
 * verified it) when none exists yet. That person then signs in with Google (same verified address) or
 * sets a password through "Forgot password" (needs email delivery configured).
 */
export const linkLegacyAccounts = internalMutation({
  args: {
    dryRun: v.boolean(),
    createMissingAuthUsers: v.optional(v.boolean()),
    entries: v.array(entryValidator),
  },
  handler: async (ctx, args) => {
    const createMissingAuthUsers = args.createMissingAuthUsers === true;
    const plans = await planBatch(ctx, args.entries, createMissingAuthUsers);
    const summary = summarize(plans);
    if (args.dryRun || summary.errors > 0) {
      return { dryRun: args.dryRun, applied: false, summary, plans };
    }

    const now = Date.now();
    for (const [index, plan] of plans.entries()) {
      if (plan.status !== "link") continue;
      const entry = args.entries[index];

      let authUserId = plan.authUserId;
      if (plan.actions.includes("create_auth_user")) {
        const created = (await ctx.runMutation(components.betterAuth.adapter.create, {
          input: {
            model: "user",
            data: {
              name: entry.name?.trim() || plan.email,
              email: plan.email,
              emailVerified: true,
              image: entry.imageUrl?.trim() || null,
              createdAt: now,
              updatedAt: now,
            },
          },
        })) as { _id: string };
        authUserId = String(created._id);
        plan.authUserId = authUserId;
      }
      if (!authUserId) throw new Error(`No Better Auth user for ${plan.legacyClerkId}`);

      if (plan.actions.includes("retire_empty_provisional_row")) {
        const provisional = await findUsersByAuthUserId(ctx, authUserId);
        for (const row of provisional) {
          // Re-checked inside the same transaction as the plan, so this cannot drop new content.
          if (row.clerkId !== authUserId || (await listOwnedTables(ctx, authUserId)).length > 0) {
            throw new Error(`Provisional account for ${plan.legacyClerkId} changed during migration`);
          }
          await ctx.db.delete(row._id);
        }
      }

      const link = { authUserId, authLinkedAt: now, authLinkSource: "admin-migration" as const, updatedAt: now };
      const legacyRow = await findUserByClerkId(ctx, plan.legacyClerkId);
      if (legacyRow) {
        await ctx.db.patch(legacyRow._id, link);
      } else {
        await ctx.db.insert("users", {
          clerkId: plan.legacyClerkId,
          email: plan.email,
          displayName: entry.name?.trim() || undefined,
          avatarUrl: entry.imageUrl?.trim() || undefined,
          createdAt: now,
          ...link,
        });
      }
    }
    return { dryRun: false, applied: true, summary, plans };
  },
});

/**
 * Removes the Better Auth link from a legacy account (rollback of one mapping). The Better Auth user
 * and all content are kept; that Better Auth user simply stops resolving to the legacy owner key.
 */
export const unlinkLegacyAccount = internalMutation({
  args: { legacyClerkId: v.string(), dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const row = await findUserByClerkId(ctx, args.legacyClerkId);
    if (!row) return { ok: false, error: "unknown_legacy_user" };
    if (row.authLinkSource !== "admin-migration" || !row.authUserId) {
      return { ok: false, error: "not_linked_by_migration" };
    }
    if (!args.dryRun) {
      await ctx.db.patch(row._id, {
        authUserId: undefined,
        authLinkedAt: undefined,
        authLinkSource: undefined,
        updatedAt: Date.now(),
      });
    }
    return { ok: true, dryRun: args.dryRun, legacyClerkId: row.clerkId, previousAuthUserId: row.authUserId };
  },
});

/** Read-only migration status for operators. */
export const auditAuthLinks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("users").collect();
    const byAuthUser = new Map<string, number>();
    for (const row of rows) {
      if (row.authUserId) byAuthUser.set(row.authUserId, (byAuthUser.get(row.authUserId) ?? 0) + 1);
    }
    const legacy = rows.filter((row) => row.authLinkSource !== "better-auth-signup" && row.clerkId !== row.authUserId);
    return {
      totalUsers: rows.length,
      legacyUsers: legacy.length,
      legacyLinked: legacy.filter((row) => !!row.authUserId).length,
      legacyUnlinked: legacy.filter((row) => !row.authUserId).map((row) => row.clerkId),
      betterAuthSignups: rows.filter((row) => row.authLinkSource === "better-auth-signup").length,
      admins: rows
        .filter((row) => row.isAdmin === true)
        .map((row) => ({ clerkId: row.clerkId, linked: !!row.authUserId })),
      duplicateAuthLinks: Array.from(byAuthUser.entries())
        .filter(([, count]) => count > 1)
        .map(([authUserId]) => authUserId),
    };
  },
});
