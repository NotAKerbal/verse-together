import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: it checks that a Better Auth session cookie is present so signed-out visitors
// are sent to sign in. It does not validate the session; Convex enforces auth on every data access.
export default function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/account", "/account/:path*"],
};
