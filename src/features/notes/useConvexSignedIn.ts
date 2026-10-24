"use client";

import { useConvexAuth } from "convex/react";
import { useAuth } from "@/lib/auth";

/**
 * Whether per-user Convex calls can be made yet. The app session can report a user before Convex has the token, and a
 * query sent in that gap runs unauthenticated, so `ready` waits for Convex too. `loading` is true only while
 * either is still working; `user && !ready && !loading` means Convex finished without accepting the session.
 */
export function useConvexSignedIn() {
  const { user, loading: sessionLoading } = useAuth();
  const { isAuthenticated, isLoading: convexLoading } = useConvexAuth();
  const loading = sessionLoading || (!!user && convexLoading);
  return { user, ready: !!user && isAuthenticated && !convexLoading, loading };
}
