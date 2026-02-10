import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function requireClerkId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
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
