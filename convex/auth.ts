import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { sendAuthEmail } from "./authEmail";
import {
  EMAIL_PASSWORD_STATIC_PATHS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  NATIVE_APP_ORIGIN,
  authCapabilities,
  isAllowedNativeAuthorizationURL,
  isEmailPasswordEndpoint,
  readAuthEnvironment,
} from "./authEnvironment";
import { CLIENT_IP_HEADER } from "./authProxy";
import { convexRateLimitStorage } from "./authRateLimit";
import { NATIVE_EXCHANGE_PATH, NATIVE_EXCHANGE_RATE_LIMIT, nativeSignIn } from "./nativeSignInPlugin";

// The component client has the Convex adapter plus helpers such as safeGetAuthUser.
export const authComponent = createClient<DataModel>(components.betterAuth);

/** Bounds the account-deletion sweep: SWEEP_BATCH rows per round (convex/accountDeletion.ts). */
const MAX_DELETION_ROUNDS = 200;

/**
 * Deletes everything the app stores for a Better Auth user (see convex/accountDeletion.ts). Throws, leaving the
 * Better Auth user in place so the owner can retry, unless every owned row is gone.
 */
async function deleteAppData(ctx: GenericCtx<DataModel>, authUserId: string) {
  if (!("runMutation" in ctx)) throw new Error("Account deletion needs a mutation or action context.");
  const clerkId = await ctx.runMutation(internal.accountDeletion.begin, { authUserId });
  if (clerkId === null) return;
  for (let round = 0; round < MAX_DELETION_ROUNDS; round++) {
    const { done } = await ctx.runMutation(internal.accountDeletion.sweep, { clerkId });
    if (done) return;
  }
  throw new Error("Deleting this account's study is taking longer than expected. Try again.");
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const environment = readAuthEnvironment();
  const capabilities = authCapabilities(environment);
  const emailPassword = capabilities.emailPassword;
  // Resend settings alone never switch email features on; see AUTH_EMAIL_PASSWORD_ENABLED.
  const emailDelivery = emailPassword ? environment.emailDelivery : null;

  // registerRoutes calls createAuth({}) once at module load just to read static options, so only a
  // real request context may fail. Without SITE_URL, Better Auth would derive callback and reset links
  // from request headers; refuse instead.
  if (!environment.siteUrl && Object.keys(ctx).length > 0) {
    throw new Error("SITE_URL must be set on the Convex deployment before Better Auth can serve requests.");
  }

  return betterAuth({
    baseURL: environment.siteUrl ?? undefined,
    // The site (and AUTH_TRUSTED_ORIGINS), plus the native app's deep-link scheme for its sign-in return.
    trustedOrigins: [...environment.trustedOrigins, NATIVE_APP_ORIGIN],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      // Google-only unless AUTH_EMAIL_PASSWORD_ENABLED=true. `enabled: false` alone only stops email
      // sign-up and sign-in; the reset, change, and verification routes are refused below.
      enabled: emailPassword,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      requireEmailVerification: capabilities.requireEmailVerification,
      revokeSessionsOnPasswordReset: true,
      ...(emailDelivery
        ? {
            sendResetPassword: async ({ user, url }) => {
              await sendAuthEmail(emailDelivery, {
                to: user.email,
                subject: "Reset your Verse Together password",
                intro: "Someone asked to reset the password for your Verse Together account.",
                actionLabel: "Choose a new password",
                url,
              });
            },
          }
        : {}),
    },
    ...(emailDelivery
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => {
              await sendAuthEmail(emailDelivery, {
                to: user.email,
                subject: "Confirm your Verse Together email",
                intro: "Confirm this email address to finish setting up your Verse Together account.",
                actionLabel: "Confirm email",
                url,
              });
            },
          },
        }
      : {}),
    // Better Auth answers these with a plain 404 before rate limiting. It matches literal request paths,
    // so the hook below also refuses them by route template (covering /reset-password/:token) and for
    // direct auth.api calls.
    // Account deletion is confirmed by a fresh session only: no emailed deletion links are ever issued.
    disabledPaths: [...(emailPassword ? [] : EMAIL_PASSWORD_STATIC_PATHS), "/delete-user/callback"],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!emailPassword && isEmailPasswordEndpoint(ctx.path)) {
          throw new APIError("NOT_FOUND", { message: "Email and password sign-in is not available." });
        }
        // The Expo plugin's browser hop (it plants the OAuth state cookie on this site, then redirects): only
        // ever to Google's authorization endpoint, so the route can't be used as an open redirect.
        if (ctx.path === "/expo-authorization-proxy" && !isAllowedNativeAuthorizationURL(ctx.query?.authorizationURL)) {
          throw new APIError("BAD_REQUEST", { message: "Invalid authorizationURL" });
        }
        if (ctx.path === "/delete-user") {
          const body = (ctx.body ?? {}) as { password?: unknown; token?: unknown };
          // A password is a second way to confirm, and must not work while password features are off; deletion
          // tokens are never issued.
          if ((body.password !== undefined && !emailPassword) || body.token !== undefined) {
            throw new APIError("BAD_REQUEST", { message: "Sign in again to confirm deleting your account." });
          }
        }
      }),
    },
    socialProviders: environment.google
      ? {
          google: {
            clientId: environment.google.clientId,
            clientSecret: environment.google.clientSecret,
            prompt: "select_account",
          },
        }
      : {},
    user: {
      deleteUser: {
        // POST /delete-user from the signed-in owner. Better Auth requires the session to be fresh (created in the
        // last day, its default freshAge) and otherwise answers SESSION_EXPIRED, so the app asks them to sign in
        // again first. App data goes before the Better Auth user, so a failure leaves an account to retry with.
        enabled: true,
        beforeDelete: async (user) => {
          await deleteAppData(ctx, user.id);
        },
        afterDelete: async (user) => {
          if (!("runMutation" in ctx)) return;
          try {
            await ctx.runMutation(internal.accountDeletion.finish, { authUserId: user.id });
          } catch (error) {
            // The user is gone and their data with them; a leftover record only names the deleted ids.
            console.error("Account deleted, but its deletion record could not be removed", error instanceof Error ? error.message : error);
          }
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        // Google may attach to an existing account only when Google reports the address verified AND
        // the existing Better Auth user's address is verified (Better Auth's default, stated here so
        // it is not loosened by accident). Google is deliberately not a "trusted provider".
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
      },
    },
    rateLimit: {
      // Better Auth enables rate limiting by default only when NODE_ENV is "production" (not something to
      // rely on in the Convex runtime), and its in-memory store does not survive between HTTP actions.
      enabled: true,
      // Better Auth's defaults, stated explicitly. Built-in stricter rules still apply on top: 3 per 10s
      // for /sign-in/*, /sign-up/*, /change-password, /change-email; 3 per 60s for
      // /request-password-reset and /send-verification-email.
      window: 10,
      max: 100,
      customStorage: convexRateLimitStorage(ctx),
      customRules: {
        // Session reads guarded by high-entropy tokens. The token and JWKS routes are also called
        // server-to-server (Next.js server rendering, Convex fetching its signing keys) without a
        // signed client IP, so a shared bucket would let anyone who calls them directly lock everyone out.
        "/get-session": false,
        "/convex/token": false,
        "/convex/jwks": false,
        "/convex/.well-known/openid-configuration": false,
        "/delete-user": { window: 60, max: 3 },
        [NATIVE_EXCHANGE_PATH]: NATIVE_EXCHANGE_RATE_LIMIT,
      },
    },
    advanced: {
      ipAddress: {
        // Only the IP the Next.js proxy signed (see convex/authProxy.ts and http.ts). x-forwarded-for
        // and similar headers can be set by anyone calling the Convex site URL, so they are ignored.
        ipAddressHeaders: [CLIENT_IP_HEADER],
      },
    },
    plugins: [
      // The Convex plugin issues the RS256 JWTs Convex verifies (15 minute lifetime by default).
      convex({ authConfig }),
      // The native app (mobile/): its client sends the cookie jar it keeps in SecureStore and an `expo-origin`
      // header naming NATIVE_APP_ORIGIN, and signs in through the site's own Google callback in a browser tab. The
      // return to the app carries a one-time code redeemable only with the app's private verifier, never the session
      // (see convex/nativeSignInPlugin.ts). Web sign-in is unaffected.
      ...nativeSignIn(ctx),
    ],
  });
};

/** Which sign-in features this deployment has configured. Booleans only. */
export const capabilities = query({
  args: {},
  handler: async () => authCapabilities(readAuthEnvironment()),
});
