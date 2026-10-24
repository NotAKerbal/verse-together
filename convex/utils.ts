import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { components } from "./_generated/api";

type AuthCtx = QueryCtx | MutationCtx;

/**
 * The Better Auth user id (JWT subject) of the caller, or null when signed out.
 *
 * Convex JWTs stay cryptographically valid for their whole lifetime (15 minutes) even after sign-out,
 * password reset, or session revocation, so the Better Auth session named in the token must also
 * still exist, be unexpired, and belong to the token's subject. A revoked session therefore loses access
 * on its next request.
 */
export async function getAuthenticatedAuthUserId(ctx: AuthCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) return null;
  // Better Auth's Convex tokens always carry the session id; anything else is not ours.
  if (typeof identity.sessionId !== "string" || !identity.sessionId) return null;
  const session = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "session",
    where: [
      { field: "_id", value: identity.sessionId },
      { field: "expiresAt", operator: "gt", value: Date.now() },
    ],
  })) as { userId?: string } | null;
  // The session must be live and belong to the token's subject.
  if (!session || String(session.userId) !== identity.subject) return null;
  return identity.subject;
}

/** The app user row linked to a Better Auth user. Throws if the link is ambiguous (fail closed). */
export async function findAppUserByAuthUserId(ctx: AuthCtx, authUserId: string): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId))
    .unique();
}

/**
 * The caller's stable app owner key (the `clerkId` column on owned rows), or null.
 *
 * Ownership comes only from an explicit link on the `users` row: created at first sign-in for new
 * accounts (users:ensureCurrentUser), or by the internal admin migration for legacy Clerk accounts.
 * A Better Auth subject with no linked row owns nothing; it is never matched by email or by any
 * client-supplied value.
 */
export async function getViewerClerkId(ctx: AuthCtx): Promise<string | null> {
  const authUserId = await getAuthenticatedAuthUserId(ctx);
  if (!authUserId) return null;
  const row = await findAppUserByAuthUserId(ctx, authUserId);
  return row?.clerkId ?? null;
}

/**
 * Like getViewerClerkId, but throws "Unauthorized" when there is no linked, signed-in app user.
 *
 * For mutations only. Public queries are live subscriptions that re-run the moment a sign-out deletes
 * the session, before the client has unsubscribed, so they use getViewerClerkId and return an empty
 * result (never another user's data) instead of throwing into the UI.
 */
export async function requireClerkId(ctx: AuthCtx): Promise<string> {
  const clerkId = await getViewerClerkId(ctx);
  if (!clerkId) {
    throw new Error("Unauthorized");
  }
  return clerkId;
}

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.85, Math.min(1.3, value));
}

export function nextConferenceRefresh(now: number): number {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  // Refresh on Apr 15 and Oct 15 by default.
  const checkpoints = [
    Date.UTC(y, 3, 15, 0, 0, 0, 0),
    Date.UTC(y, 9, 15, 0, 0, 0, 0),
    Date.UTC(y + 1, 3, 15, 0, 0, 0, 0),
  ];
  const next = checkpoints.find((ts) => ts > now);
  return next ?? Date.UTC(y + 1, 9, 15, 0, 0, 0, 0);
}
