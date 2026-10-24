const FALLBACK = "/";
const DUMMY_ORIGIN = "https://verse-together.invalid";

/**
 * Returns `value` only if it is a same-origin, path-absolute app URL; otherwise `fallback`.
 *
 * Rejects absolute and protocol-relative URLs (`https://x`, `//x`, `/\x`), other schemes
 * (`javascript:`), control characters, and the auth pages themselves (to avoid redirect loops).
 */
export function safeReturnPath(value: string | null | undefined, fallback: string = FALLBACK): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;
  if (candidate.length > 2048) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(candidate, DUMMY_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== DUMMY_ORIGIN) return fallback;
  if (/^\/(sign-in|sign-up|forgot-password|reset-password|api\/auth)(\/|$)/.test(parsed.pathname)) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** `/sign-in?redirect=<current path>` for sending a visitor to sign in and back. */
export function signInHref(returnTo: string | null | undefined, page: "/sign-in" | "/sign-up" = "/sign-in"): string {
  const safe = safeReturnPath(returnTo, "");
  return safe && safe !== "/" ? `${page}?redirect=${encodeURIComponent(safe)}` : page;
}
