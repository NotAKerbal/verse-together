// Turns Better Auth error codes (from API responses or OAuth `?error=` redirects) into plain messages.
// Unknown codes get a generic message so internal details never reach the page.

const MESSAGES: Record<string, string> = {
  REGISTRATION_CANCELLED: "Passkey setup cancelled. Try again when you're ready.",
  PREVIOUSLY_REGISTERED: "This passkey is already registered. Try a different device or security key.",
  AUTHENTICATION_FAILED: "We couldn't verify that passkey. Try again or use another sign-in method.",
  AUTH_CANCELLED: "Passkey request cancelled. Try again or use another sign-in method.",
  ERROR_CEREMONY_ABORTED: "Passkey request cancelled. Try again or use another sign-in method.",
  ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY: "Passkey request wasn't completed. Try again or use another sign-in method.",
  PASSKEY_NOT_FOUND: "No matching passkey was found. Use another sign-in method, then add a passkey in your account.",
  CHALLENGE_NOT_FOUND: "Your passkey request expired. Try again.",
  FAILED_TO_VERIFY_AUTHENTICATION: "We couldn't verify that passkey. Try again or use another sign-in method.",
  FAILED_TO_VERIFY_REGISTRATION: "We couldn't set up that passkey. Try again.",
  YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: "That passkey couldn't be added to this account.",
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match an account.",
  INVALID_PASSWORD: "That password isn't right.",
  INVALID_EMAIL: "Enter a valid email address.",
  EMAIL_NOT_VERIFIED: "Confirm your email first. We've sent a new confirmation link if email delivery is set up.",
  USER_ALREADY_EXISTS: "An account already uses that email. Sign in instead, or reset your password.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account already uses that email. Sign in instead, or reset your password.",
  PASSWORD_TOO_SHORT: "Use at least 10 characters for your password.",
  PASSWORD_TOO_LONG: "Use at most 128 characters for your password.",
  INVALID_TOKEN: "This link is invalid or has already been used. Request a new one.",
  TOKEN_EXPIRED: "This link has expired. Request a new one.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "This account doesn't have a password yet. Use \"Forgot password\" to set one.",
  SESSION_EXPIRED: "For your security, sign in again before making this change.",
  SESSION_NOT_FRESH: "For your security, sign in again before making this change.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "That Google account is already connected to another account.",
  LINKED_ACCOUNT_ALREADY_EXISTS: "That Google account is already connected.",
  EMAIL_ALREADY_VERIFIED: "Your email is already confirmed.",
  VERIFICATION_EMAIL_NOT_ENABLED: "Email confirmation isn't set up on this site yet.",
  RESET_PASSWORD_DISABLED: "Password reset email isn't set up on this site yet.",
  PROVIDER_NOT_FOUND: "Google sign-in isn't set up on this site yet.",
  INVALID_CALLBACK_URL: "That sign-in link isn't allowed.",
  INVALID_ORIGIN: "That request came from an unexpected site.",
  TOO_MANY_REQUESTS: "Too many attempts. Wait a minute and try again.",
  // OAuth redirect errors (lower-case codes in the `error` query parameter).
  // Google can only join an existing account whose email is confirmed (see account linking in
  // convex/auth.ts). Password sign-in is off during the Google-only rollout, so don't suggest it.
  account_not_linked:
    "An account with this email already exists but couldn't be connected to Google automatically, so you weren't signed in. Please contact us for help.",
  "email_doesn't_match": "That Google account uses a different email address.",
  account_already_linked_to_different_user: "That Google account is already connected to another account.",
  email_not_found: "Google didn't share an email address for that account.",
  unable_to_link_account: "We couldn't connect that Google account. Try again.",
  access_denied: "Google sign-in was cancelled.",
  state_mismatch: "Your sign-in session expired. Try again.",
  please_restart_the_process: "Your sign-in session expired. Try again.",
  signup_disabled: "New sign-ups are closed.",
};

export const GENERIC_AUTH_ERROR = "Something went wrong. Try again.";

export function authErrorMessage(error: { code?: string | null; status?: number | null } | string | null | undefined): string {
  if (!error) return GENERIC_AUTH_ERROR;
  const code = typeof error === "string" ? error : error.code ?? null;
  if (code && Object.prototype.hasOwnProperty.call(MESSAGES, code)) return MESSAGES[code];
  if (typeof error !== "string" && error.status === 429) return MESSAGES.TOO_MANY_REQUESTS;
  return GENERIC_AUTH_ERROR;
}
