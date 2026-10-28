import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import * as z from "zod";
import type { GenericCtx } from "@convex-dev/better-auth";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import {
  NATIVE_GRANT_SECONDS,
  NATIVE_SESSION_USER_AGENT,
  grantIdentifier,
  isPkceChallenge,
  isPkceVerifier,
  newGrantCode,
  parseNativeGrant,
  pkceMatches,
} from "./nativeAuthRules";

/**
 * Desktop sign-in (see convex/nativeAuthRules.ts). Two Better Auth endpoints:
 *  - POST /native/grant: the signed-in website session approves the app; stores a hashed single-use code bound
 *    to the app's PKCE challenge in Better Auth's own verification table, for two minutes.
 *  - POST /native/token: the app exchanges the code with its verifier; the code is consumed atomically, and the
 *    app receives a new session of its own (revocable on its own; the website session is untouched).
 * The app then authenticates with that session token as a bearer token (the bearer request hook the Convex plugin
 * runs; see convex/auth.ts), to read its session, fetch Convex JWTs from /convex/token, and sign out.
 */
export const deletionPending = internalQuery({
  args: { authUserId: v.string() },
  handler: async (ctx, { authUserId }) =>
    (await ctx.db.query("accountDeletions").withIndex("by_auth_user_id", q => q.eq("authUserId", authUserId)).first()) !== null,
});

async function assertAccountAvailable(ctx: GenericCtx<DataModel>, authUserId: string) {
  if (!("runQuery" in ctx) || await ctx.runQuery(internal.nativeAuth.deletionPending, { authUserId })) {
    throw new APIError("FORBIDDEN", { message: "Finish deleting this account before approving a desktop app." });
  }
}

export const nativeAppAuth = (convexCtx: GenericCtx<DataModel>) =>
  ({
    id: "native-app-auth",
    endpoints: {
      createNativeGrant: createAuthEndpoint(
        "/native/grant",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({ challenge: z.string(), expectedUserId: z.string().max(256).optional() }),
        },
        async (ctx) => {
          const { challenge, expectedUserId } = ctx.body;
          // Only the website's own approval page may ask, whatever the deployment's general origin settings are: a
          // grant is a credential, so a page elsewhere must never obtain one with the reader's cookie.
          const origin = ctx.request?.headers.get("origin") ?? "";
          if (!origin || origin === "null" || !ctx.context.isTrustedOrigin(origin)) {
            throw new APIError("FORBIDDEN", { message: "Approve the desktop app from Verse Together itself." });
          }
          if (!isPkceChallenge(challenge)) throw new APIError("BAD_REQUEST", { message: "Invalid desktop sign-in request." });
          await assertAccountAvailable(convexCtx, ctx.context.session.user.id);
          // The page names the account it showed the reader; if the browser's session changed since (signed out, or
          // into another account in another tab), nothing is approved for an account the reader didn't see.
          if (expectedUserId !== undefined && expectedUserId !== ctx.context.session.user.id) {
            throw new APIError("CONFLICT", { message: "The signed-in account changed. Reload this page and try again." });
          }
          const code = newGrantCode();
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: await grantIdentifier(code),
            value: JSON.stringify({ userId: ctx.context.session.user.id, challenge }),
            expiresAt: new Date(Date.now() + NATIVE_GRANT_SECONDS * 1000),
          });
          return ctx.json({ code, expiresIn: NATIVE_GRANT_SECONDS });
        }
      ),
      exchangeNativeGrant: createAuthEndpoint(
        "/native/token",
        { method: "POST", body: z.object({ code: z.string().max(128), verifier: z.string().max(128) }) },
        async (ctx) => {
          const { code, verifier } = ctx.body;
          const refused = () => new APIError("UNAUTHORIZED", { message: "This sign-in has expired. Start again from the app." });
          if (!code || !isPkceVerifier(verifier)) throw refused();
          // Consumed before anything else is checked, so a code can never be tried twice.
          const row = await ctx.context.internalAdapter.consumeVerificationValue(await grantIdentifier(code));
          const grant = row ? parseNativeGrant(row.value) : null;
          if (!grant || !(await pkceMatches(verifier, grant.challenge))) throw refused();
          const user = await ctx.context.internalAdapter.findUserById(grant.userId);
          if (!user) throw refused();
          await assertAccountAvailable(convexCtx, user.id);
          const session = await ctx.context.internalAdapter.createSession(user.id, false, {
            userAgent: NATIVE_SESSION_USER_AGENT,
          });
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not start a session." });
          try {
            await assertAccountAvailable(convexCtx, user.id);
            if (!(await ctx.context.internalAdapter.findUserById(user.id))) throw refused();
          } catch (error) {
            await ctx.context.internalAdapter.deleteSession(session.token);
            throw error;
          }
          return ctx.json({
            token: session.token,
            expiresAt: new Date(session.expiresAt).toISOString(),
            user: { id: user.id, name: user.name, email: user.email },
          });
        }
      ),
    },
    rateLimit: [
      { pathMatcher: (path: string) => path === "/native/token", window: 60, max: 10 },
      { pathMatcher: (path: string) => path === "/native/grant", window: 60, max: 10 },
    ],
  }) satisfies BetterAuthPlugin;
