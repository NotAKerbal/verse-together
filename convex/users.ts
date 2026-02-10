// @ts-nocheck
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClerkId } from "./utils";

async function upsertUserInternal(
  ctx: any,
  args: { email?: string; displayName?: string; avatarUrl?: string; clerkId?: string }
) {
  const clerkId = args.clerkId ?? (await requireClerkId(ctx));
  const now = Date.now();
  const existing = await ctx.db.query("users").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      email: args.email ?? existing.email,
      displayName: args.displayName ?? existing.displayName,
      avatarUrl: args.avatarUrl ?? existing.avatarUrl,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("users", {
    clerkId,
    email: args.email,
    displayName: args.displayName,
    avatarUrl: args.avatarUrl,
    createdAt: now,
    updatedAt: now,
  });
}

export const upsertCurrentUser = mutation({
  args: {
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await upsertUserInternal(ctx as any, args);
    return { ok: true };
  },
});

export const getProfileName = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("users").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId)).unique();
    return row?.displayName ?? null;
  },
});

export const getNames = query({
  args: { clerkIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out: Record<string, string> = {};
    for (const clerkId of args.clerkIds) {
      const row = await ctx.db.query("users").withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId)).unique();
      if (row?.displayName) out[clerkId] = row.displayName;
    }
    return out;
  },
});

export const lookupUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email) return null;
    const row = await ctx.db.query("users").withIndex("by_email", (q: any) => q.eq("email", email)).unique();
    return row?.clerkId ?? null;
  },
});
