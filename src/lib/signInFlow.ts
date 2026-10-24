import { safeReturnPath, signInHref } from "./safeRedirect.ts";

// Decides where an app "Sign in" control sends the visitor. Pure so it can be unit tested.

type Capabilities = { google: boolean; emailPassword: boolean };

export type SignInRoute =
  | { kind: "google"; callbackURL: string; errorCallbackURL: string }
  | { kind: "page"; href: string };

const AUTH_PAGE = /^\/(sign-in|sign-up|forgot-password|reset-password)(\/|$)/;

/**
 * Where to come back to after signing in from `location` (pathname + search + hash). On an auth page
 * that is the page's own `redirect` target, so signing in from /sign-in?redirect=/notes returns to /notes.
 */
export function signInReturnPath(location: string | null | undefined): string {
  const safe = safeReturnPath(location, "");
  if (safe) return safe;
  try {
    const parsed = new URL(location ?? "", "https://verse-together.invalid");
    if (AUTH_PAGE.test(parsed.pathname)) return safeReturnPath(parsed.searchParams.get("redirect"));
  } catch {
    // Fall through to the home page.
  }
  return "/";
}

/**
 * Google-only deployments go straight to Google. Anything else (capabilities unknown, email/password
 * switched on so there is a choice to make, or Google not configured) uses the sign-in page.
 * A failed Google attempt lands on the sign-in page with `?error=`, which never starts OAuth itself,
 * so an error can't loop back to Google.
 */
export function chooseSignInRoute(capabilities: Capabilities | null | undefined, returnTo: string | null | undefined): SignInRoute {
  const target = safeReturnPath(returnTo);
  if (capabilities?.google && !capabilities.emailPassword) {
    return { kind: "google", callbackURL: target, errorCallbackURL: signInHref(target) };
  }
  return { kind: "page", href: signInHref(target) };
}

/** The sign-in page for `returnTo`, showing the message for `code` (unknown codes show a generic one). */
export function signInErrorHref(returnTo: string | null | undefined, code: string): string {
  const href = signInHref(returnTo);
  return `${href}${href.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`;
}

/** The error code to report for a failed `signIn.social` call. */
export function socialErrorCode(error: { code?: string | null; status?: number | null } | null | undefined): string {
  if (error?.code) return error.code;
  if (error?.status === 429) return "TOO_MANY_REQUESTS";
  return "sign_in_failed";
}
