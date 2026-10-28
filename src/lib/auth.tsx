"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { useRouter } from "next/navigation";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { AuthCapabilities } from "../../convex/authEnvironment";
import { authClient } from "@/lib/auth-client";
import { signInHref } from "@/lib/safeRedirect";
import { chooseSignInRoute, signInErrorHref, signInReturnPath, socialErrorCode } from "@/lib/signInFlow";

type AppUser = {
  /** Stable app owner id (legacy Clerk id for migrated accounts, Better Auth id for new ones). */
  id: string;
  email?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
};

type Viewer = {
  appUserId: string;
  isAdmin: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  legacyAccount: boolean;
  legacyAccountPending: boolean;
};

type ViewerState = { sessionId: string; viewer: Viewer | null; error: string | null };

/** The signed-in owner's own account deletion that stopped partway (convex/accountDeletion.ts). */
export type PendingDeletion = { appUserId: string; startedAt: number };

type AuthContextValue = {
  /** False when this build has no Convex/Better Auth configuration (NEXT_PUBLIC_CONVEX_URL). */
  configured: boolean;
  session: { user: AppUser } | null;
  user: AppUser | null;
  loading: boolean;
  /** Set when a Better Auth session exists but the app account could not be verified or loaded. */
  error: string | null;
  isAdmin: boolean;
  legacyAccount: boolean;
  legacyAccountPending: boolean;
  /**
   * Set while this session's account deletion stopped partway. `user` stays null (the app user is already gone and
   * is never provisioned again); only finishing the deletion (/delete-account) or signing out is offered.
   */
  pendingDeletion: PendingDeletion | null;
  /** Better Auth user fields straight from the session (for the account page). */
  authUser: { id: string; email: string; name: string; image: string | null; emailVerified: boolean } | null;
  /** A Convex JWT for ConvexHttpClient calls. The Clerk-era `template` option is accepted and ignored. */
  getToken: (options?: { template?: string }) => Promise<string | null>;
  /**
   * Starts signing in and comes back to `returnTo` (default: the current page). Google-only deployments
   * go straight to Google in this tab; otherwise, or if Google can't be started, the sign-in page.
   */
  promptSignIn: (returnTo?: string) => void;
  /** True from a promptSignIn call until the browser leaves for Google or falls back to the sign-in page. */
  signingIn: boolean;
  /** Rejects with an Error whose message is SIGN_OUT_FAILED when the server did not sign out. */
  signOut: () => Promise<void>;
  /** Re-sync the app user from the Better Auth session (after a profile change). */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// ---- Convex JWT cache for the HTTP client -----------------------------------------------------

type CachedToken = { sessionId: string; token: string; expiresAt: number };
let cachedToken: CachedToken | null = null;
let pendingToken: { sessionId: string; promise: Promise<string | null> } | null = null;

function jwtExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function clearTokenCache() {
  cachedToken = null;
  pendingToken = null;
}

async function fetchConvexToken(sessionId: string): Promise<string | null> {
  // Reuse a token with at least a minute left; Convex rejects expired tokens.
  if (cachedToken && cachedToken.sessionId === sessionId && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.token;
  }
  if (pendingToken && pendingToken.sessionId === sessionId) return pendingToken.promise;
  const promise = authClient.convex
    .token({ fetchOptions: { throw: false } })
    .then(({ data }) => {
      const token = data?.token ?? null;
      cachedToken = token ? { sessionId, token, expiresAt: jwtExpiry(token) } : null;
      return token;
    })
    .catch(() => null)
    .finally(() => {
      if (pendingToken?.promise === promise) pendingToken = null;
    });
  pendingToken = { sessionId, promise };
  return promise;
}

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** An explicit return target, or the current page (an auth page's own `redirect` target). */
function returnPathFor(returnTo: unknown): string {
  return signInReturnPath(typeof returnTo === "string" ? returnTo : currentPath());
}

// ---- Providers ------------------------------------------------------------------------------

/** Shown when the server did not confirm a sign-out; the visitor is still signed in. */
export const SIGN_OUT_FAILED = "We couldn't sign you out. Check your connection and try again.";

/**
 * How long a session may sit unverified before it is reported as rejected. Coming from signed out,
 * useConvexAuth reports "not loading, not authenticated" both while the first token is still being
 * checked and after Convex has rejected it, so a new session gets time for the first check. A session
 * Convex already accepted gets a brief window for Convex re-running setAuth. `user` is withheld
 * throughout either way; only the error message waits.
 */
const NEW_SESSION_VERIFY_GRACE_MS = 8_000;
const ACCEPTED_SESSION_VERIFY_GRACE_MS = 1_500;

/**
 * Resolves the Better Auth session into the app user. `user` (and admin/legacy flags) are exposed only
 * while Convex currently accepts the session's JWT and the app user has been provisioned/linked
 * server-side for that session, so callers that gate Convex queries or mutations on `user` never run
 * against a half-established, rejected, or signed-out identity. After provisioning, a live `users.accountStatus`
 * subscription keeps admin status and the account link current and withdraws `user` as soon as the
 * server stops recognising the session (signed out or revoked elsewhere), without waiting for the JWT
 * to expire.
 */
export function AppAuthProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const convex = useConvex();
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const { isLoading: convexAuthLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const ensureCurrentUser = useMutation(api.users.ensureCurrentUser);

  const sessionId = sessionData?.session?.id ?? null;
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const ensureRunRef = useRef(0);

  // Signing out (or the session expiring) drops whatever was provisioned for the old session.
  if (!sessionId && viewerState !== null) setViewerState(null);

  useEffect(() => {
    if (sessionId) return;
    ensureRunRef.current += 1;
    clearTokenCache();
  }, [sessionId]);

  /** Provisions/loads the app user for a session; resolves to null if a newer run superseded it. */
  const runEnsure = useCallback(
    async (forSessionId: string): Promise<ViewerState | null> => {
      const run = ++ensureRunRef.current;
      let next: ViewerState;
      try {
        const viewer = (await ensureCurrentUser({})) as Viewer;
        next = { sessionId: forSessionId, viewer, error: null };
      } catch {
        next = { sessionId: forSessionId, viewer: null, error: "We couldn't load your account. Try again." };
      }
      return ensureRunRef.current === run ? next : null;
    },
    [ensureCurrentUser]
  );

  // Asked before provisioning: an account whose deletion stopped partway is never recreated.
  const pendingDeletion = useQuery(api.accountDeletion.pending, sessionId && convexAuthenticated ? {} : "skip") as
    | PendingDeletion
    | null
    | undefined;

  useEffect(() => {
    if (!sessionId || !convexAuthenticated || pendingDeletion !== null) return;
    if (viewerState?.sessionId === sessionId) return;
    void runEnsure(sessionId).then((next) => {
      if (next) setViewerState(next);
    });
  }, [sessionId, convexAuthenticated, pendingDeletion, viewerState?.sessionId, runEnsure]);

  const currentViewerState = sessionId && viewerState?.sessionId === sessionId ? viewerState : null;
  // Convex accepted this session at least once: provisioning ran under its token.
  const sessionWasAccepted = !!currentViewerState?.viewer;
  const provisioned = convexAuthenticated ? (currentViewerState?.viewer ?? null) : null;

  // Live view of the linked app user and any deletion of it, read together: starting a deletion removes the app user
  // and records the deletion in one step, so the viewer is never seen gone before the deletion that removed it (two
  // separate subscriptions could deliver those in either order). Null once the session is gone server-side.
  const liveStatus = useQuery(api.users.accountStatus, provisioned ? {} : "skip") as
    | { viewer: Omit<Viewer, "legacyAccountPending"> | null; deletion: PendingDeletion | null }
    | null
    | undefined;
  const liveViewer = liveStatus === undefined ? undefined : (liveStatus?.viewer ?? null);
  const deletion = pendingDeletion ?? liveStatus?.deletion ?? null;
  const deleting = !!sessionId && convexAuthenticated && deletion ? deletion : null;
  const viewerRevoked = !!provisioned && liveViewer === null;
  // Only a viewer provisioned for this session, while Convex and the server accept it right now.
  const viewer = useMemo<Viewer | null>(() => {
    if (!provisioned || liveViewer === null) return null;
    if (liveViewer === undefined) return provisioned;
    // legacyAccountPending is computed only at provisioning; it no longer applies once linked elsewhere.
    const sameAccount = liveViewer.appUserId === provisioned.appUserId;
    return {
      ...liveViewer,
      legacyAccountPending: sameAccount && !liveViewer.legacyAccount && provisioned.legacyAccountPending,
    };
  }, [provisioned, liveViewer]);

  // Convex verification state for the current session.
  const convexUnverified = !!sessionId && !convexAuthLoading && (!convexAuthenticated || (viewerRevoked && !deleting));
  const [rejectedSessionId, setRejectedSessionId] = useState<string | null>(null);
  if (!convexUnverified && rejectedSessionId !== null) setRejectedSessionId(null);

  useEffect(() => {
    if (!convexUnverified || !sessionId) return;
    // A session Convex accepted before and now refuses was expired, revoked, or signed out elsewhere.
    const grace = sessionWasAccepted ? ACCEPTED_SESSION_VERIFY_GRACE_MS : NEW_SESSION_VERIFY_GRACE_MS;
    const timer = window.setTimeout(() => setRejectedSessionId(sessionId), grace);
    return () => window.clearTimeout(timer);
  }, [convexUnverified, sessionId, sessionWasAccepted]);

  const sessionUser = sessionData?.user ?? null;

  // A session Convex refused (bad/expired token, misconfigured issuer) is an error, not "signed in".
  const convexRejected = convexUnverified && rejectedSessionId === sessionId;
  const error = sessionId
    ? convexRejected
      ? "Your session couldn't be verified. Sign in again."
      : convexAuthenticated && !deleting
        ? (currentViewerState?.error ?? null)
        : null
    : null;
  const loading = sessionPending || (!!sessionId && !error && !viewer && !deleting);

  const user: AppUser | null = useMemo(
    () =>
      viewer && sessionUser
        ? {
            id: viewer.appUserId,
            email: sessionUser.email ?? null,
            fullName: viewer.displayName ?? sessionUser.name ?? null,
            imageUrl: viewer.avatarUrl ?? sessionUser.image ?? null,
          }
        : null,
    [viewer, sessionUser]
  );

  const getToken = useCallback(async () => {
    if (!sessionId || !user) return null;
    return await fetchConvexToken(sessionId);
  }, [sessionId, user]);

  const capabilities = useQuery(api.auth.capabilities, {}) as AuthCapabilities | undefined;
  const capabilitiesRef = useRef(capabilities);
  useEffect(() => {
    capabilitiesRef.current = capabilities;
  }, [capabilities]);
  const [signingIn, setSigningIn] = useState(false);
  const signingInRef = useRef(false);

  // Coming back from Google with the Back button can restore this page from the back/forward cache
  // with the attempt still marked in progress; let the visitor try again.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      signingInRef.current = false;
      setSigningIn(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const promptSignIn = useCallback(
    (returnTo?: string) => {
      if (signingInRef.current) return;
      signingInRef.current = true;
      setSigningIn(true);
      const target = returnPathFor(returnTo);
      const toSignInPage = (href: string) => {
        signingInRef.current = false;
        setSigningIn(false);
        router.push(href);
      };
      void (async () => {
        let caps = capabilitiesRef.current;
        if (caps === undefined) {
          caps = await (convex.query(api.auth.capabilities, {}) as Promise<AuthCapabilities>).catch(() => undefined);
        }
        const route = chooseSignInRoute(caps, target, window.location.origin);
        if (route.kind === "page") return toSignInPage(route.href);
        try {
          const { data, error: socialError } = await authClient.signIn.social({
            provider: "google",
            callbackURL: route.callbackURL,
            errorCallbackURL: route.errorCallbackURL,
          });
          // Show why on the sign-in page, which offers a manual retry and never restarts OAuth itself.
          if (socialError || !data?.url) toSignInPage(signInErrorHref(target, socialErrorCode(socialError)));
          // Otherwise the browser is navigating to Google; stay in progress until it leaves.
        } catch {
          toSignInPage(signInErrorHref(target, socialErrorCode(null)));
        }
      })();
    },
    [convex, router]
  );

  // Local state is cleared only once the server has confirmed the sign-out; otherwise this rejects
  // with SIGN_OUT_FAILED and the visitor stays signed in.
  const signOut = useCallback(async () => {
    let failed = false;
    try {
      const { error: signOutError } = await authClient.signOut();
      failed = !!signOutError;
    } catch {
      failed = true;
    }
    if (failed) throw new Error(SIGN_OUT_FAILED);
    clearTokenCache();
    ensureRunRef.current += 1;
    // Keep this session marked as resolved until Better Auth publishes its signed-out state.
    // Clearing it outright would provision again briefly with the just-revoked token.
    setViewerState(sessionId ? { sessionId, viewer: null, error: null } : null);
    router.refresh();
  }, [router, sessionId]);

  const refresh = useCallback(async () => {
    if (!sessionId || !convexAuthenticated || pendingDeletion !== null) return;
    const next = await runEnsure(sessionId);
    if (next) setViewerState(next);
  }, [sessionId, convexAuthenticated, pendingDeletion, runEnsure]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: true,
      session: user ? { user } : null,
      user,
      loading,
      error,
      isAdmin: viewer?.isAdmin === true,
      legacyAccount: viewer?.legacyAccount === true,
      legacyAccountPending: viewer?.legacyAccountPending === true,
      pendingDeletion: deleting,
      authUser: sessionUser
        ? {
            id: sessionUser.id,
            email: sessionUser.email,
            name: sessionUser.name,
            image: sessionUser.image ?? null,
            emailVerified: sessionUser.emailVerified === true,
          }
        : null,
      getToken,
      promptSignIn,
      signingIn,
      signOut,
      refresh,
    }),
    [user, loading, error, viewer, deleting, sessionUser, getToken, promptSignIn, signingIn, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Used when the build has no Convex URL: browsing works, signing in does not. */
export function UnconfiguredAuthProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const value = useMemo<AuthContextValue>(
    () => ({
      configured: false,
      session: null,
      user: null,
      loading: false,
      error: null,
      isAdmin: false,
      legacyAccount: false,
      legacyAccountPending: false,
      pendingDeletion: null,
      authUser: null,
      getToken: async () => null,
      promptSignIn: (returnTo?: string) => router.push(signInHref(returnPathFor(returnTo))),
      signingIn: false,
      signOut: async () => {},
      refresh: async () => {},
    }),
    [router]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AppProviders");
  }
  return context;
}

export function useAdminStatus() {
  const { isAdmin, loading } = useAuth();
  return { isAdmin, isAdminLoading: loading };
}
