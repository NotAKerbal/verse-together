// The native app's Google sign-in handoff: the records behind convex/nativeSignInPlugin.ts. No bearer credential is
// stored here or ever sent through the app's custom-scheme URL; see that file for the flow and the security model.
//
// One row per sign-in attempt, registered once (when Better Auth creates the OAuth transaction) and never re-bound:
//   attempt    the app's public attempt id (it appears in the return URL)
//   state      the Better Auth OAuth state (the exact transaction) the attempt belongs to
//   challenge  base64url(SHA-256(verifier)): the verifier itself stays in the app's secure storage
//   codeHash   SHA-256 of the one-time code issued after Better Auth completed that exact transaction's callback
//   sessionId  the Better Auth session that callback created (its id, not its token)
// All functions are internal: only the Better Auth hooks and endpoint (running in the auth HTTP action) call them.

import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";

/** A registration (and the OAuth transaction it is bound to) is usable this long: Better Auth's own state lifetime. */
export const ATTEMPT_TTL_MS = 10 * 60 * 1000;
/** A one-time code must be exchanged this soon after Google returned. */
export const CODE_TTL_MS = 5 * 60 * 1000;
/**
 * Rows stay this long past their expiry before they are swept, so an attempt id can't be registered again while an
 * app could still be holding it, and a used code is still recognised as used.
 */
export const RETAIN_AFTER_EXPIRY_MS = 60 * 60 * 1000;
/** Rows handled per sweep (and per registration's opportunistic cleanup). */
export const SWEEP_BATCH = 100;
const REGISTER_PRUNE = 8;

/** 32 random bytes in base64url (43 characters): attempt ids, codes, challenges and hashes. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636 code_verifier: 43–128 unreserved characters. */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
/** Better Auth's OAuth state: 32 random alphanumerics. Bounded so a row can't be made large. */
const STATE = /^[A-Za-z0-9_-]{16,128}$/;

export const isToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);
export const isVerifier = (value: unknown): value is string => typeof value === "string" && VERIFIER.test(value);
export const isOAuthState = (value: unknown): value is string => typeof value === "string" && STATE.test(value);

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url(SHA-256(value)): the S256 challenge for a verifier (RFC 7636 §4.2), and how codes are stored. */
export async function sha256Base64Url(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

/** A new one-time code: 256 bits from the platform's secure random generator. */
export function newCode(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Equal strings, compared without an early exit. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Deletes up to `limit` rows well past their expiry. A code that was issued but never redeemed leaves a session nobody
 * holds (its token was never sent anywhere); that session is revoked with it.
 */
async function removeExpired(ctx: MutationCtx, now: number, limit: number) {
  const rows = await ctx.db.query("nativeSignIns").withIndex("by_expires_at", (q) => q.lt("expiresAt", now - RETAIN_AFTER_EXPIRY_MS)).take(limit);
  let revoked = 0;
  for (const row of rows) {
    if (row.sessionId && row.usedAt === undefined) {
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: row.sessionId }] } });
      revoked += 1;
    }
    await ctx.db.delete(row._id);
  }
  return { deleted: rows.length, revoked };
}

/**
 * Binds an attempt to the OAuth transaction Better Auth just created, once. Refused (false) when the attempt or the
 * transaction is already bound, so nobody who later sees an attempt id can attach their own sign-in to it.
 */
export const register = internalMutation({
  args: { attempt: v.string(), state: v.string(), challenge: v.string(), now: v.number() },
  handler: async (ctx, { attempt, state, challenge, now }): Promise<boolean> => {
    if (!isToken(attempt) || !isToken(challenge) || !isOAuthState(state)) return false;
    await removeExpired(ctx, now, REGISTER_PRUNE);
    if (await ctx.db.query("nativeSignIns").withIndex("by_attempt", (q) => q.eq("attempt", attempt)).first()) return false;
    if (await ctx.db.query("nativeSignIns").withIndex("by_state", (q) => q.eq("state", state)).first()) return false;
    await ctx.db.insert("nativeSignIns", { attempt, state, challenge, createdAt: now, expiresAt: now + ATTEMPT_TTL_MS });
    return true;
  },
});

/**
 * Records the one-time code for the session Better Auth created on the callback of `state`'s transaction. Only for
 * the attempt registered to exactly that transaction, before it expired, and only once.
 */
export const issueCode = internalMutation({
  args: { state: v.string(), attempt: v.string(), codeHash: v.string(), sessionId: v.string(), now: v.number() },
  handler: async (ctx, { state, attempt, codeHash, sessionId, now }): Promise<boolean> => {
    if (!isOAuthState(state) || !isToken(attempt) || !isToken(codeHash) || !sessionId) return false;
    const row = await ctx.db.query("nativeSignIns").withIndex("by_state", (q) => q.eq("state", state)).first();
    if (!row || !same(row.attempt, attempt) || row.expiresAt < now || row.codeHash !== undefined || row.usedAt !== undefined) return false;
    await ctx.db.patch(row._id, { codeHash, sessionId, codeExpiresAt: Math.min(now + CODE_TTL_MS, row.expiresAt + CODE_TTL_MS) });
    return true;
  },
});

/**
 * Redeems a code for its session id, at most once. The caller must name the code's attempt and prove the verifier
 * behind its challenge; a wrong attempt or proof is refused without using the code up, so whoever intercepted the
 * return URL can't burn the app's sign-in. Expired and used codes are refused.
 */
export const redeem = internalMutation({
  args: { attempt: v.string(), codeHash: v.string(), challenge: v.string(), now: v.number() },
  handler: async (ctx, { attempt, codeHash, challenge, now }): Promise<{ sessionId: string } | null> => {
    if (!isToken(attempt) || !isToken(codeHash) || !isToken(challenge)) return null;
    const row = await ctx.db.query("nativeSignIns").withIndex("by_code_hash", (q) => q.eq("codeHash", codeHash)).first();
    if (!row || !row.sessionId || row.usedAt !== undefined || (row.codeExpiresAt ?? 0) < now) return null;
    // Both checked before either answer is used.
    const proven = same(row.attempt, attempt) && same(row.challenge, challenge);
    if (!proven) return null;
    await ctx.db.patch(row._id, { usedAt: now });
    return { sessionId: row.sessionId };
  },
});

/** The periodic cleanup (convex/crons.ts). */
export const sweepExpired = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number; revoked: number }> => removeExpired(ctx, Date.now(), SWEEP_BATCH),
});
