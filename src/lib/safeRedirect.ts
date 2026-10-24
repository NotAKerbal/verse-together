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

/**
 * An app path built by this module (`safeReturnPath` or `signInHref` output) as an absolute URL on
 * `origin`, the browser's own `location.origin`. Better Auth accepts relative callback URLs only
 * when they avoid characters such as `#`, `:` or `!`, so callbacks carrying a real return path are
 * sent absolute and checked against its trusted origins instead. A path that isn't path-absolute
 * becomes the home page; an `origin` that isn't a plain http(s) origin leaves the path relative.
 */
export function appURL(path: string, origin: string | null | undefined): string {
  const safePath =
    path.startsWith("/") && !path.startsWith("//") && !/[\u0000-\u001f\u007f\\]/.test(path) ? path : FALLBACK;
  let base: URL;
  try {
    base = new URL(origin ?? "");
  } catch {
    return safePath;
  }
  if ((base.protocol !== "https:" && base.protocol !== "http:") || base.origin !== origin) return safePath;
  const url = new URL(safePath, base);
  return url.origin === base.origin ? url.href : `${base.origin}${FALLBACK}`;
}
