// Where a build signs in: the website (whose /api/auth proxies Better Auth on Convex and whose Google callback the
// app reuses) and the Convex deployment for account data. Both are public URLs, inlined at build time from
// EXPO_PUBLIC_SITE_URL and EXPO_PUBLIC_CONVEX_URL (see mobile/.env.example). A build without them works fully
// signed out and says sign-in isn't available; nothing defaults to production.

export type AccountConfig = {
  /** The site's origin: Better Auth's SITE_URL on the Convex deployment, e.g. https://www.versetogether.org. */
  siteOrigin: string;
  /** The site's Better Auth routes, which the native client calls. */
  authBaseURL: string;
  /** The Convex deployment URL (…convex.cloud). */
  convexUrl: string;
};

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "10.0.2.2";
}

/** A secure origin, or (in development builds only) a local one. */
function secureUrl(value: string | undefined, allowLocal: boolean): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password || url.hash || url.search) return null;
    if (url.protocol === "https:") return url;
    if (allowLocal && url.protocol === "http:" && isLocalHost(url.hostname)) return url;
    return null;
  } catch {
    return null;
  }
}

export function readAccountConfig(
  env: { siteUrl?: string; convexUrl?: string } = {
    // Written out in full: Expo inlines only literal process.env.EXPO_PUBLIC_* reads.
    siteUrl: process.env.EXPO_PUBLIC_SITE_URL,
    convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,
  },
  allowLocal: boolean = typeof __DEV__ !== "undefined" && __DEV__,
): AccountConfig | null {
  const site = secureUrl(env.siteUrl, allowLocal);
  const convex = secureUrl(env.convexUrl, allowLocal);
  if (!site || !convex) return null;
  if (site.pathname !== "/" && site.pathname !== "") return null;
  if (convex.protocol === "https:" && !convex.hostname.endsWith(".convex.cloud")) return null;
  return { siteOrigin: site.origin, authBaseURL: `${site.origin}/api/auth`, convexUrl: convex.origin };
}
