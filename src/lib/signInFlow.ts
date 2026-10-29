import { appURL, safeReturnPath, signInHref } from "./safeRedirect.ts";

// Decides where an app "Sign in" control sends the visitor. Pure so it can be unit tested.

type Capabilities = { google: boolean; emailPassword: boolean; passkey?: boolean };

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
 * Where Google sends the visitor back to: `returnTo` (made safe) on success, or `page` showing the
 * error. Both are absolute on `origin` (the browser's `location.origin`), so a return path with a
 * `#` or other characters Better Auth refuses in relative callback URLs still round-trips.
 */
export function socialCallbackURLs(
  returnTo: string | null | undefined,
  origin: string | null | undefined,
  page: "/sign-in" | "/sign-up" = "/sign-in"
): { callbackURL: string; errorCallbackURL: string } {
  const target = safeReturnPath(returnTo);
  return { callbackURL: appURL(target, origin), errorCallbackURL: appURL(signInHref(target, page), origin) };
}

export function chooseSignInRoute(
  capabilities: Capabilities | null | undefined,
  returnTo: string | null | undefined,
  origin?: string | null
): SignInRoute {
  const target = safeReturnPath(returnTo);
  if (capabilities?.google && !capabilities.emailPassword && !capabilities.passkey) {
    return { kind: "google", ...socialCallbackURLs(target, origin) };
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
