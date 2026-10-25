// Reads the Convex deployment environment that decides which Better Auth features are switched on.
// Pure (no Convex imports) so it can be unit tested and shared by convex/auth.ts, the public
// `auth:capabilities` query the sign-in UI uses to decide what to offer, and the UI itself.
//
// Rollout: sign-in is Google-only by default. Email/password (sign-up, sign-in, reset, change,
// verification) stays switched off, for every user including ones that already have a password,
// until AUTH_EMAIL_PASSWORD_ENABLED is exactly "true". Having Resend configured does not enable it.

export type AuthEnvironment = {
  siteUrl: string | null;
  trustedOrigins: string[];
  google: { clientId: string; clientSecret: string } | null;
  /** AUTH_EMAIL_PASSWORD_ENABLED is "true". Off by default. */
  emailPasswordEnabled: boolean;
  /** Resend configuration as set; only used when email/password is enabled. */
  emailDelivery: { resendApiKey: string; from: string } | null;
};

/** What the UI may offer. Only booleans: never echo configuration values to clients. */
export type AuthCapabilities = {
  /** Email/password sign-up, sign-in and password management are switched on. */
  emailPassword: boolean;
  google: boolean;
  /** Password reset and verification emails can actually be sent (implies emailPassword). */
  emailDelivery: boolean;
  /** New email/password accounts must verify their address before signing in. */
  requireEmailVerification: boolean;
};

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Better Auth endpoints (route templates, as hooks see them in `ctx.path`) that belong to the
 * email/password feature. All are refused while it is switched off, including for users that already
 * have a credential account. Google sign-in, sessions, profile updates and sign-out are unaffected.
 */
export const EMAIL_PASSWORD_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/change-password",
  "/verify-password",
  "/send-verification-email",
  "/verify-email",
  "/change-email",
] as const;

/**
 * The same endpoints as concrete request paths for Better Auth's `disabledPaths`, which compares the
 * literal request path and so cannot match the dynamic `/reset-password/:token`; the before hook in
 * convex/auth.ts covers that one (and direct `auth.api` calls).
 */
export const EMAIL_PASSWORD_STATIC_PATHS: string[] = EMAIL_PASSWORD_ENDPOINTS.filter((path) => !path.includes(":"));

export function isEmailPasswordEndpoint(path: string | null | undefined): boolean {
  return !!path && (EMAIL_PASSWORD_ENDPOINTS as readonly string[]).includes(path);
}

type Env = Record<string, string | undefined>;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readAuthEnvironment(env: Env = process.env): AuthEnvironment {
  const siteUrlRaw = clean(env.SITE_URL);
  const siteUrl = siteUrlRaw ? normalizeOrigin(siteUrlRaw) : null;

  const extraOrigins = (env.AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((entry) => normalizeOrigin(entry.trim()))
    .filter((entry): entry is string => !!entry);
  const trustedOrigins = Array.from(new Set([...(siteUrl ? [siteUrl] : []), ...extraOrigins]));

  const googleClientId = clean(env.GOOGLE_CLIENT_ID);
  const googleClientSecret = clean(env.GOOGLE_CLIENT_SECRET);
  const google = googleClientId && googleClientSecret ? { clientId: googleClientId, clientSecret: googleClientSecret } : null;

  const resendApiKey = clean(env.RESEND_API_KEY);
  const from = clean(env.AUTH_EMAIL_FROM);
  const emailDelivery = resendApiKey && from ? { resendApiKey, from } : null;

  // Explicit opt-in only: "1", "yes", "TRUE" and friends do not count.
  const emailPasswordEnabled = clean(env.AUTH_EMAIL_PASSWORD_ENABLED) === "true";

  return { siteUrl, trustedOrigins, google, emailPasswordEnabled, emailDelivery };
}

export function authCapabilities(environment: AuthEnvironment): AuthCapabilities {
  const emailPassword = environment.emailPasswordEnabled;
  const emailDelivery = emailPassword && environment.emailDelivery !== null;
  return {
    emailPassword,
    google: environment.google !== null,
    emailDelivery,
    // Verification can only be required when the verification email can be delivered; otherwise new
    // users could never sign in.
    requireEmailVerification: emailDelivery,
  };
}
