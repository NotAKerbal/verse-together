import type { NextRequest } from "next/server";
import { readProxySecret, resolveTrustedClientIp, signClientIp, withoutProxyHeaders } from "../../../../../convex/authProxy";
import { getAuthServer } from "@/lib/auth-server";

// Same-origin proxy to the Better Auth routes served by the Convex deployment, so auth cookies are
// first-party to this site. It also vouches for the caller's IP, which Better Auth rate limits by:
// see convex/authProxy.ts for the trust boundary.

let missingConfigLogged = false;

async function forward(request: NextRequest): Promise<Request> {
  // Never pass along proxy headers a caller supplied.
  const headers = withoutProxyHeaders(request.headers);
  const secret = readProxySecret();
  const ip = resolveTrustedClientIp(request.headers);
  if (secret && ip) {
    const signed = await signClientIp({ secret, ip, method: request.method, pathname: request.nextUrl.pathname });
    for (const [name, value] of Object.entries(signed)) headers.set(name, value);
  } else if (!missingConfigLogged) {
    missingConfigLogged = true;
    console.error(
      secret
        ? "No trusted client IP header (set AUTH_CLIENT_IP_HEADER, or deploy on Vercel): auth rate limits fall back to one shared bucket per path."
        : "AUTH_PROXY_SECRET is not set (or is shorter than 32 characters): auth rate limits fall back to one shared bucket per path."
    );
  }
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return new Request(request.url, { method: request.method, headers, body, redirect: "manual" });
}

export async function GET(request: NextRequest) {
  return getAuthServer().handler.GET(await forward(request));
}

export async function POST(request: NextRequest) {
  return getAuthServer().handler.POST(await forward(request));
}
