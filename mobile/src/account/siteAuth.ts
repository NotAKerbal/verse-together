// The signed-in account's credential for the Verse Together site's own API routes that act for a reader (today only
// researching a chapter's study paths, /api/insights/chapter). The site's routes know a browser by its session
// cookie; this app's session lives in secure storage for Better Auth alone, so a request here carries the Convex JWT
// that session is issued (Better Auth's /convex/token, the token the app's Convex client already uses) as
// `Authorization: Bearer …`, and the site has Convex verify it (src/lib/requestViewer.ts).
//
// AccountProvider opens one SiteAuth for each verified owner, beside its other account calls, and closes it with them
// (signing out, a new sign-in, deleting the account). The token is fetched fresh for each request, is sent only to the
// account's own site (the origin it signs in through), and never leaves this module. A SiteAuth stops working once
// closed or once secure storage holds another session, and a reply that arrives after that is refused, not shown.

import { useSyncExternalStore } from "react";
import type { NativeAuthClient } from "./client";

export type SiteAuthFailure =
  /** Signed out, into another account, or the session changed while waiting. */
  | "changed"
  /** The session couldn't be exchanged for a token (it ended, or Verse Together couldn't be reached). */
  | "no-token";

export class SiteAuthError extends Error {
  constructor(readonly reason: SiteAuthFailure) {
    super(reason === "changed" ? "Your account changed, so this was stopped." : "Verse Together couldn't confirm your sign-in. Try again.");
  }
}

/** Only the site's own API paths, so the credential can never be pointed anywhere else. */
const SITE_API_PATH = /^\/api(?:\/[A-Za-z0-9_-]+)+$/;

export type TokenSource = (signal?: AbortSignal) => Promise<string | null>;

export class SiteAuth {
  private disposed = false;
  private readonly session: string | null;

  /**
   * @param siteOrigin The account's site (AccountConfig.siteOrigin), the only origin its token is sent to.
   * @param sessionKey The stored session's fingerprint now (sessionBinding.ts); a different one means another session.
   */
  constructor(
    readonly owner: string,
    readonly siteOrigin: string,
    private readonly token: TokenSource,
    private readonly sessionKey: () => string | null,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.session = sessionKey();
  }

  /** Closed by AccountProvider (the session's checks run only when a request is sent). */
  get closed(): boolean {
    return this.disposed;
  }

  /** Still this owner's open session. */
  live(): boolean {
    return !this.disposed && this.session !== null && this.sessionKey() === this.session;
  }

  /**
   * Sends one request to the site's `path` as this account. Rejects with SiteAuthError when the account changed or no
   * token could be had; a reply is returned only while this SiteAuth is still live.
   */
  async fetch(path: string, init: { method: "POST"; body: string; signal?: AbortSignal; headers?: Record<string, string> }): Promise<Response> {
    if (!SITE_API_PATH.test(path)) throw new Error("Only the site's own API can be called as the account.");
    const url = new URL(path, this.siteOrigin);
    if (url.origin !== this.siteOrigin) throw new Error("Only the site's own API can be called as the account.");
    if (!this.live()) throw new SiteAuthError("changed");
    let token: string | null;
    try {
      token = await this.token(init.signal);
    } catch {
      token = null;
    }
    if (!this.live()) throw new SiteAuthError("changed");
    if (!token) throw new SiteAuthError("no-token");
    const response = await this.fetchImpl(url.toString(), {
      method: init.method,
      body: init.body,
      signal: init.signal,
      headers: { ...init.headers, authorization: `Bearer ${token}` },
    });
    if (!this.live()) throw new SiteAuthError("changed");
    return response;
  }

  dispose() {
    this.disposed = true;
  }
}

/** The Convex JWT for the session the native client holds, through the Convex plugin's /convex/token. */
export function convexTokenSource(authClient: NativeAuthClient): TokenSource {
  return async (signal) => {
    const result = await authClient.convex.token({ fetchOptions: { throw: false, signal } });
    const token = (result as { data?: { token?: unknown } | null } | null)?.data?.token;
    return typeof token === "string" && token ? token : null;
  };
}

// ---- The open SiteAuth, for the screens ----

let current: SiteAuth | null = null;
const listeners = new Set<() => void>();

/** Opens `auth` for the screens (AccountProvider); returns the function that closes it. */
export function publishSiteAuth(auth: SiteAuth): () => void {
  if (current && current !== auth) current.dispose();
  current = auth;
  listeners.forEach((listener) => listener());
  return () => {
    auth.dispose();
    if (current === auth) {
      current = null;
      listeners.forEach((listener) => listener());
    }
  };
}

export function getSiteAuth(): SiteAuth | null {
  return current && !current.closed ? current : null;
}

export function subscribeSiteAuth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The signed-in account's SiteAuth, or null when nobody is (or the session isn't verified yet). */
export function useSiteAuth(): SiteAuth | null {
  return useSyncExternalStore(subscribeSiteAuth, getSiteAuth, getSiteAuth);
}

/** Tests: close whatever is open. */
export function resetSiteAuth() {
  current?.dispose();
  current = null;
  listeners.forEach((listener) => listener());
}
