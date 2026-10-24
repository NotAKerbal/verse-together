// Durable rate-limit storage for Better Auth.
//
// Better Auth's default storage is an in-memory Map, which does nothing useful here: every Convex HTTP
// action may run in a fresh isolate. Its "database" storage needs adapter.incrementOne, which the
// Convex adapter does not implement. Instead, each request is counted by one internal mutation; Convex
// mutations are serializable transactions, so concurrent requests for the same bucket cannot both pass
// a stale count.
//
// Buckets are fixed windows: the first request opens a window of `rule.window` seconds, at most
// `rule.max` requests are allowed inside it, and later ones are refused (HTTP 429 with X-Retry-After
// set to the seconds left) until it closes. Bucket keys are hashed, so client IPs are not stored.
import type { BetterAuthRateLimitOptions } from "better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

type RateLimitStorage = NonNullable<BetterAuthRateLimitOptions["customStorage"]>;

/** Expired buckets deleted per newly opened window, so cleanup keeps pace with growth. */
export const PRUNE_BATCH = 16;

const consumeResult = v.object({ allowed: v.boolean(), retryAfter: v.union(v.number(), v.null()) });

async function pruneExpired(ctx: MutationCtx, now: number) {
  const expired = await ctx.db
    .query("authRateLimits")
    .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
    .take(PRUNE_BATCH);
  for (const row of expired) await ctx.db.delete(row._id);
}

/** Counts one request against `key` and reports whether it is allowed. */
export const consume = internalMutation({
  args: { key: v.string(), windowMs: v.number(), max: v.number() },
  returns: consumeResult,
  handler: async (ctx, { key, windowMs, max }) => {
    if (key.length === 0 || key.length > 128) throw new Error("Invalid rate limit key");
    if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isFinite(max)) throw new Error("Invalid rate limit rule");
    const now = Date.now();
    const retryAfter = (expiresAt: number) => Math.max(1, Math.ceil((expiresAt - now) / 1000));
    const bucket = await ctx.db
      .query("authRateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!bucket || bucket.expiresAt <= now) {
      if (max < 1) return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
      const window = { count: 1, windowStart: now, expiresAt: now + windowMs };
      if (bucket) await ctx.db.patch(bucket._id, window);
      else await ctx.db.insert("authRateLimits", { key, ...window });
      await pruneExpired(ctx, now);
      return { allowed: true, retryAfter: null };
    }
    if (bucket.count >= max) return { allowed: false, retryAfter: retryAfter(bucket.expiresAt) };
    await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
    return { allowed: true, retryAfter: null };
  },
});

async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Better Auth `rateLimit.customStorage` backed by the `authRateLimits` table. */
export function convexRateLimitStorage(ctx: GenericCtx<DataModel>): RateLimitStorage {
  // Better Auth only falls back to get/set when a storage lacks `consume`, which would reintroduce the
  // non-atomic read-then-write; refuse loudly rather than silently do that.
  const unsupported = async (): Promise<never> => {
    throw new Error("Rate limiting uses consume(); get/set are not supported");
  };
  return {
    get: unsupported,
    set: unsupported,
    consume: async (key, rule) => {
      // Rate limiting runs in Better Auth's HTTP router, which only executes inside an HTTP action.
      if (!("runMutation" in ctx)) throw new Error("Rate limiting needs a Convex action or mutation context");
      return await ctx.runMutation(internal.authRateLimit.consume, {
        key: await hashKey(key),
        windowMs: rule.window * 1000,
        max: rule.max,
      });
    },
  };
}
