import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { findAppUserByAuthUserId, getAuthenticatedAuthUserId } from "./utils";

export function normalizeEmail(value: string | null | undefined): string | undefined {
  const email = value?.trim().toLowerCase();
  return email ? email : undefined;
}

function cleanOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function viewerPayload(row: Doc<"users">, extra: { legacyAccountPending?: boolean } = {}) {
  return {
    appUserId: row.clerkId,
    isAdmin: row.isAdmin === true,
    displayName: row.displayName ?? null,
    avatarUrl: row.avatarUrl ?? null,
    legacyAccount: row.authLinkSource === "admin-migration",
    legacyAccountPending: extra.legacyAccountPending === true,
  };
}

/**
 * Resolves (and on first sign-in, provisions) the caller's app user.
 *
 * Every field comes from the verified Better Auth session, never from client arguments. A Better Auth
 * user that is not yet linked gets a brand-new app user keyed by its own Better Auth id; it is never
 * attached to an existing (legacy) row here, even when the email matches. Legacy accounts are linked
 * only by the internal admin migration in convex/authMigration.ts.
 */
async function ensureCurrentUserInternal(ctx: MutationCtx) {
  const authUserId = await getAuthenticatedAuthUserId(ctx);
  if (!authUserId) throw new Error("Unauthorized");
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) throw new Error("Unauthorized");

  // Only a verified address is stored on the app row: it powers friend lookup by email, which must not
  // reach an account that merely typed someone else's address.
  const verifiedEmail = authUser.emailVerified ? normalizeEmail(authUser.email) : undefined;
  const displayName = cleanOptional(authUser.name);
  const avatarUrl = cleanOptional(authUser.image);
  const now = Date.now();

  const existing = await findAppUserByAuthUserId(ctx, authUserId);
  if (existing) {
    const patch: Partial<Pick<Doc<"users">, "email" | "displayName" | "avatarUrl">> = {};
    if (verifiedEmail && verifiedEmail !== existing.email) patch.email = verifiedEmail;
    if (displayName && displayName !== existing.displayName) patch.displayName = displayName;
    if (avatarUrl && avatarUrl !== existing.avatarUrl) patch.avatarUrl = avatarUrl;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    }
    const row = { ...existing, ...patch };
    return viewerPayload(row, { legacyAccountPending: await hasPendingLegacyMatch(ctx, row, verifiedEmail) });
  }

  // A row already keyed by this id but linked elsewhere would mean corrupted links: fail closed.
  const keyCollision = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", authUserId))
    .unique();
  if (keyCollision) {
    throw new Error("Account link conflict; contact support.");
  }

  const id = await ctx.db.insert("users", {
    clerkId: authUserId,
    authUserId,
    authLinkedAt: now,
    authLinkSource: "better-auth-signup",
    email: verifiedEmail,
    displayName,
    avatarUrl,
    createdAt: now,
    updatedAt: now,
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("Could not create the account record.");
  return viewerPayload(row, { legacyAccountPending: await hasPendingLegacyMatch(ctx, row, verifiedEmail) });
}

/**
 * True when the caller's own verified email matches a legacy account that has not been migrated yet.
 * Shown only to that verified owner so they know their earlier data still needs an admin link.
 */
async function hasPendingLegacyMatch(
  ctx: MutationCtx,
  row: Doc<"users">,
  verifiedEmail: string | undefined
): Promise<boolean> {
  if (!verifiedEmail || row.authLinkSource === "admin-migration") return false;
  const sameEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", verifiedEmail))
    .collect();
  return sameEmail.some((candidate) => candidate._id !== row._id && !candidate.authUserId);
}

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => await ensureCurrentUserInternal(ctx),
});

/**
 * Kept for clients built before the Better Auth cutover. Client-supplied profile fields are ignored;
 * the verified Better Auth session is the only source.
 */
export const upsertCurrentUser = mutation({
  args: {
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx) => {
    await ensureCurrentUserInternal(ctx);
    return { ok: true };
  },
});

/** The signed-in, linked app user, or null. Does not provision. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthenticatedAuthUserId(ctx);
    if (!authUserId) return null;
    const row = await findAppUserByAuthUserId(ctx, authUserId);
    return row ? viewerPayload(row) : null;
  },
});

export const getProfileName = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId)).unique();
    return row?.displayName ?? null;
  },
});

export const getNames = query({
  args: { clerkIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out: Record<string, string> = {};
    for (const clerkId of args.clerkIds) {
      const row = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId)).unique();
      if (row?.displayName) out[clerkId] = row.displayName;
    }
    return out;
  },
});

export const lookupUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email) return null;
    const rows = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).collect();
    // During the migration window one person can have both an unlinked legacy row and a new row with
    // the same verified email. Prefer the single signed-in (linked) row; refuse to guess otherwise.
    const linked = rows.filter((row) => !!row.authUserId);
    if (linked.length === 1) return linked[0].clerkId;
    if (linked.length === 0 && rows.length === 1) return rows[0].clerkId;
    return null;
  },
});

/** Public admin flag lookup by app user id, kept for compatibility; prefer users:viewer. */
export const isAdmin = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId)).unique();
    return row?.isAdmin === true;
  },
});
