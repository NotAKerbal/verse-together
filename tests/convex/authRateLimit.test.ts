import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { PRUNE_BATCH, convexRateLimitStorage } from "../../convex/authRateLimit";

const modules = import.meta.glob("../../convex/**/*.ts");
const KEY = "a".repeat(64);
const RULE = { key: KEY, windowMs: 10_000, max: 3 };

afterEach(() => {
  vi.useRealTimers();
});

describe("durable auth rate limit", () => {
  test("allows max requests per fixed window, then refuses with the seconds left", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const t = convexTest(schema, modules);
    for (let i = 0; i < 3; i++) {
      expect(await t.mutation(internal.authRateLimit.consume, RULE)).toEqual({ allowed: true, retryAfter: null });
    }
    vi.setSystemTime(1_000_000 + 2_500);
    expect(await t.mutation(internal.authRateLimit.consume, RULE)).toEqual({ allowed: false, retryAfter: 8 });
    // Refused requests do not extend the window.
    vi.setSystemTime(1_000_000 + 9_999);
    expect(await t.mutation(internal.authRateLimit.consume, RULE)).toEqual({ allowed: false, retryAfter: 1 });
    vi.setSystemTime(1_000_000 + 10_000);
    expect(await t.mutation(internal.authRateLimit.consume, RULE)).toEqual({ allowed: true, retryAfter: null });
    const rows = await t.run((ctx) => ctx.db.query("authRateLimits").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: KEY, count: 1, windowStart: 1_010_000, expiresAt: 1_020_000 });
  });

  test("counts persist across separate calls and keys are independent", async () => {
    const t = convexTest(schema, modules);
    const other = { ...RULE, key: "b".repeat(64) };
    for (let i = 0; i < 3; i++) await t.mutation(internal.authRateLimit.consume, RULE);
    expect((await t.mutation(internal.authRateLimit.consume, RULE)).allowed).toBe(false);
    expect((await t.mutation(internal.authRateLimit.consume, other)).allowed).toBe(true);
  });

  test("concurrent requests cannot overshoot the limit", async () => {
    const t = convexTest(schema, modules);
    const results = await Promise.all(Array.from({ length: 10 }, () => t.mutation(internal.authRateLimit.consume, RULE)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    const rows = await t.run((ctx) => ctx.db.query("authRateLimits").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
  });

  test("opening a window prunes a bounded batch of expired buckets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < PRUNE_BATCH + 4; i++) {
        await ctx.db.insert("authRateLimits", { key: `expired-${i}`, count: 1, windowStart: 0, expiresAt: 1_000 + i });
      }
      await ctx.db.insert("authRateLimits", { key: "live", count: 1, windowStart: 1_999_000, expiresAt: 2_009_000 });
    });
    await t.mutation(internal.authRateLimit.consume, RULE);
    const remaining = await t.run((ctx) => ctx.db.query("authRateLimits").collect());
    const keys = remaining.map((row) => row.key).sort();
    // Oldest PRUNE_BATCH expired rows are gone; the 4 newest expired, the live bucket, and the new one stay.
    expect(keys).toEqual([KEY, "expired-16", "expired-17", "expired-18", "expired-19", "live"].sort());
    // Counting inside an open window does no pruning.
    await t.mutation(internal.authRateLimit.consume, RULE);
    expect(await t.run((ctx) => ctx.db.query("authRateLimits").collect())).toHaveLength(6);
  });

  test("rejects malformed keys and rules", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.authRateLimit.consume, { ...RULE, key: "" })).rejects.toThrow(/key/);
    await expect(t.mutation(internal.authRateLimit.consume, { ...RULE, key: "k".repeat(129) })).rejects.toThrow(/key/);
    await expect(t.mutation(internal.authRateLimit.consume, { ...RULE, windowMs: 0 })).rejects.toThrow(/rule/);
    expect(await t.mutation(internal.authRateLimit.consume, { ...RULE, max: 0 })).toEqual({ allowed: false, retryAfter: 10 });
  });

  test("the Better Auth storage hashes keys and enforces the rule through the mutation", async () => {
    const t = convexTest(schema, modules);
    await t.action(async (ctx) => {
      const storage = convexRateLimitStorage(ctx);
      const rule = { window: 60, max: 2 };
      expect(await storage.consume!("203.0.113.5|/request-password-reset", rule)).toEqual({ allowed: true, retryAfter: null });
      expect(await storage.consume!("203.0.113.5|/request-password-reset", rule)).toEqual({ allowed: true, retryAfter: null });
      const refused = await storage.consume!("203.0.113.5|/request-password-reset", rule);
      expect(refused.allowed).toBe(false);
      expect(refused.retryAfter).toBeGreaterThan(55);
      expect((await storage.consume!("198.51.100.7|/request-password-reset", rule)).allowed).toBe(true);
      await expect(storage.get("anything")).rejects.toThrow(/consume/);
    });
    const rows = await t.run((ctx) => ctx.db.query("authRateLimits").collect());
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.key).toMatch(/^[0-9a-f]{64}$/);
      expect(row.key).not.toContain("203.0.113.5");
    }
  });
});
