import { getServerViewer, type ServerViewer } from "@/lib/auth-server";
import { convexQuery } from "@/lib/convexHttp";

/**
 * Who is asking, for a route the native app also calls. The browser's Better Auth cookie is resolved exactly as
 * before (getServerViewer). The app has no cookie for this site, so it sends the Convex JWT its own Better Auth
 * session was issued (`Authorization: Bearer …`, the same token the app's Convex client uses), and Convex verifies it
 * here as it verifies the cookie's: signature, issuer and expiry, then the live Better Auth session it names and the
 * linked app user (users:viewer, convex/utils.ts). Nothing is read from the token on this side.
 *
 * A request that sends an Authorization header is judged by that header alone: a malformed, expired or revoked token
 * is signed out, never a fallback to a cookie sent beside it.
 */

/** A Convex JWT is three base64url parts; anything longer than this is not one of ours. */
const MAX_BEARER_LENGTH = 8192;
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type RequestCredential = { kind: "none" } | { kind: "invalid" } | { kind: "bearer"; token: string };

export function readBearerCredential(headers: Headers): RequestCredential {
  const header = headers.get("authorization");
  if (header === null) return { kind: "none" };
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  const token = match?.[1] ?? "";
  if (!token || token.length > MAX_BEARER_LENGTH || !JWT_SHAPE.test(token)) return { kind: "invalid" };
  return { kind: "bearer", token };
}

export type RequestViewer = { viewer: ServerViewer | null; token: string | null; via: "cookie" | "bearer" | null };

const SIGNED_OUT: RequestViewer = { viewer: null, token: null, via: null };

/** The verified, linked app user behind a request (cookie or bearer), with the token Convex accepted, or signed out. */
export async function getRequestViewer(request: Request): Promise<RequestViewer> {
  const credential = readBearerCredential(request.headers);
  if (credential.kind === "invalid") return SIGNED_OUT;
  if (credential.kind === "none") {
    const { viewer, token } = await getServerViewer();
    return viewer && token ? { viewer, token, via: "cookie" } : SIGNED_OUT;
  }
  try {
    const viewer = await convexQuery<ServerViewer | null>("users:viewer", {}, credential.token);
    return viewer ? { viewer: { appUserId: viewer.appUserId, isAdmin: viewer.isAdmin === true }, token: credential.token, via: "bearer" } : SIGNED_OUT;
  } catch (error) {
    // Convex refuses a token it can't verify (bad signature, wrong issuer, expired) by failing the call.
    console.warn("Could not verify a bearer token", error instanceof Error ? error.message : error);
    return SIGNED_OUT;
  }
}
