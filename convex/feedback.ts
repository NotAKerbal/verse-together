// @ts-nocheck
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getViewerClerkId } from "./utils";

export const submitFeedback = mutation({
  args: {
    message: v.string(),
    contact: v.optional(v.string()),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Anonymous feedback is allowed; attribute it only to a verified, linked app user.
    const clerkId = await getViewerClerkId(ctx);
    const message = args.message.trim();
    if (message.length < 5) throw new Error("Feedback message is too short");
    if (message.length > 2000) throw new Error("Feedback message is too long");

    await ctx.db.insert("feedback", {
      clerkId: clerkId ?? undefined,
      message,
      contact: args.contact?.trim() || undefined,
      path: args.path?.trim() || undefined,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});
