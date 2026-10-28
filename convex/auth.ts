import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { bearer } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { sendAuthEmail } from "./authEmail";
import {
  EMAIL_PASSWORD_STATIC_PATHS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  authCapabilities,
  isEmailPasswordEndpoint,
  readAuthEnvironment,
} from "./authEnvironment";
import { CLIENT_IP_HEADER } from "./authProxy";
import { convexRateLimitStorage } from "./authRateLimit";
import { nativeAppAuth } from "./nativeAuth";

// The component client has the Convex adapter plus helpers such as safeGetAuthUser.
export const authComponent = createClient<DataModel>(components.betterAuth);

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
    trustedOrigins: environment.trustedOrigins,
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
    disabledPaths: emailPassword ? [] : EMAIL_PASSWORD_STATIC_PATHS,
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!emailPassword && isEmailPasswordEndpoint(ctx.path)) {
          throw new APIError("NOT_FOUND", { message: "Email and password sign-in is not available." });
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
      // The desktop app holds its own session token and sends it as `Authorization: Bearer` (it has no cookie
      // jar). Browsers never send this header on their own, so cookie-based CSRF protections are unaffected.
      bearer(),
      // Browser-approved, PKCE-bound desktop sign-in (convex/nativeAuth.ts).
      nativeAppAuth(),
    ],
  });
};

/** Which sign-in features this deployment has configured. Booleans only. */
export const capabilities = query({
  args: {},
  handler: async () => authCapabilities(readAuthEnvironment()),
});
