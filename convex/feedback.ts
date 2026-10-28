import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { cleanFeedback } from "./feedbackRules";
import { getViewerClerkId } from "./utils";

export const submitFeedback = mutation({
  args: {
    message: v.string(),
    contact: v.optional(v.string()),
    path: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate before the auth lookup so oversized input is rejected without touching the session tables.
    const feedback = cleanFeedback(args);
    // Anonymous feedback is allowed; attribute it only to a verified, linked app user.
    const clerkId = await getViewerClerkId(ctx);

    await ctx.db.insert("feedback", {
      clerkId: clerkId ?? undefined,
      ...feedback,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});
