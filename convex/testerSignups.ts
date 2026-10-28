import { v, ConvexError } from "convex/values";
import { mutation } from "./_generated/server";
import { cleanTesterSignup } from "./testerSignupRules";

// There is deliberately no public read/update function for this private contact list.
// The owner can view and export it using the Convex dashboard's Data tab.
export const submit = mutation({
  args: {
    name: v.string(), email: v.string(), android: v.boolean(), ios: v.boolean(),
    googlePlayEmail: v.string(), device: v.string(), consent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const signup = cleanTesterSignup(args);
    // Exact retries are idempotent; an anonymous caller never overwrites someone else's contact details.
    const key = JSON.stringify([signup.email, signup.android, signup.ios, signup.googlePlayEmail]);
    const existing = await ctx.db.query("testerSignups").withIndex("by_signup_key", q => q.eq("signupKey", key)).first();
    if (existing) return { ok: true };
    const now = Date.now();
    // A bounded global burst cap applies even to clients bypassing the website.
    const recent = await ctx.db.query("testerSignups").withIndex("by_created_at", q => q.gte("createdAt", now - 60_000)).take(20);
    if (recent.length >= 20) throw new ConvexError({ code: "RATE_LIMITED" });
    await ctx.db.insert("testerSignups", { ...signup, signupKey: key, consentVersion: "2026-10-28-v2", createdAt: now });
    return { ok: true };
  },
});
