import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { unstable_rethrow } from "next/navigation";
import { convexQuery } from "@/lib/convexHttp";

type AuthServer = ReturnType<typeof convexBetterAuthNextJs>;

let authServer: AuthServer | null = null;

/**
 * Server-only Better Auth helpers for route handlers and server components.
 *
 * Created lazily: convexBetterAuthNextJs throws without NEXT_PUBLIC_CONVEX_SITE_URL, and route modules
 * are imported at build time, so a missing variable should fail the request, not the build.
 */
export function getAuthServer(): AuthServer {
  if (!authServer) {
    authServer = convexBetterAuthNextJs({
      convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
      convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
    });
  }
  return authServer;
}

/** The caller's Convex JWT, or null when signed out or auth is not configured. */
export async function getServerConvexToken(): Promise<string | null> {
  try {
    return (await getAuthServer().getToken()) ?? null;
  } catch (error) {
    // Let Next's own control-flow errors (dynamic rendering bailout, redirects) through.
    unstable_rethrow(error);
    console.warn("Could not resolve a Convex auth token", error instanceof Error ? error.message : error);
    return null;
  }
}

export type ServerViewer = {
  appUserId: string;
  isAdmin: boolean;
};

/**
 * The signed-in, linked app user, verified by Convex (JWT signature, expiry, and live Better Auth
 * session), or null. Use this rather than trusting cookies for authorization decisions.
 */
export async function getServerViewer(): Promise<{ viewer: ServerViewer | null; token: string | null }> {
  const token = await getServerConvexToken();
  if (!token) return { viewer: null, token: null };
  try {
    const viewer = await convexQuery<ServerViewer | null>("users:viewer", {}, token);
    return { viewer: viewer ? { appUserId: viewer.appUserId, isAdmin: viewer.isAdmin === true } : null, token };
  } catch (error) {
    unstable_rethrow(error);
    console.warn("Could not resolve the signed-in user", error instanceof Error ? error.message : error);
    return { viewer: null, token: null };
  }
}
