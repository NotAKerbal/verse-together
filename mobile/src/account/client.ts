// The native Better Auth client: the same Better Auth (on Convex, behind the website's /api/auth proxy) and the same
// Google accounts as the web app. Better Auth's Expo plugin keeps the session cookie in the platform's secure
// storage (Keychain / Android Keystore via expo-secure-store) and sends it, with an `expo-origin` header naming this
// app's scheme, on every auth request. The Convex plugin exchanges that session for the Convex JWT.

import { expoClient, getSetCookie, storageAdapter } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { AccountConfig } from "./config";

/** mobile/app.json `scheme`; the server trusts exactly this as the app's origin (convex/authEnvironment.ts). */
export const APP_SCHEME = "versetogether";
/** Secure-storage key prefix: `versetogether_cookie` (the cookie jar) and `versetogether_session_data`. */
export const STORAGE_PREFIX = "versetogether";
export const COOKIE_KEY = `${STORAGE_PREFIX}_cookie`;
export const SESSION_CACHE_KEY = `${STORAGE_PREFIX}_session_data`;

/** Synchronous secure storage, as expo-secure-store's getItem/setItem/deleteItemAsync. */
export type SecureStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  deleteItemAsync(key: string): Promise<void>;
};

export function createNativeAuthClient(config: AccountConfig, storage: SecureStorage) {
  return createAuthClient({
    baseURL: config.authBaseURL,
    plugins: [expoClient({ scheme: APP_SCHEME, storagePrefix: STORAGE_PREFIX, storage }), convexClient()],
  });
}

export type NativeAuthClient = ReturnType<typeof createNativeAuthClient>;

/** The session cookie's value in a stored jar (any `…session_token` cookie), or null. */
function sessionTokenOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const jar = JSON.parse(raw) as Record<string, { value?: string } | undefined>;
    const entry = Object.entries(jar).find(([name, cookie]) => name.endsWith("session_token") && !!cookie?.value);
    return entry?.[1]?.value ?? null;
  } catch {
    return null;
  }
}

/** The session cookie a Set-Cookie header would store, parsed as the jar parses it; null when it sets none. */
export function sessionTokenInSetCookie(setCookieHeader: string): string | null {
  return sessionTokenOf(getSetCookie(setCookieHeader, undefined));
}

/**
 * The secure-storage cookie jar, through the Expo plugin's own adapter (which splits values too large to store). The
 * adapter logs and swallows storage failures, so a write is read back here and a failure throws.
 */
export function cookieJar(storage: SecureStorage) {
  const adapter = storageAdapter(storage);
  return {
    read: () => adapter.getItem(COOKIE_KEY),
    sessionToken: () => sessionTokenOf(adapter.getItem(COOKIE_KEY)),
    /** Merges a Set-Cookie header into the jar, as the plugin does for every auth response. */
    merge: async (setCookieHeader: string) => adapter.setItem(COOKIE_KEY, getSetCookie(setCookieHeader, adapter.getItem(COOKIE_KEY) ?? undefined)),
    /** Forgets the session on this device: the cookie jar and the cached session. Throws if it is still stored. */
    clear: async () => {
      await adapter.setItem(COOKIE_KEY, "{}");
      await adapter.setItem(SESSION_CACHE_KEY, "{}");
      if (sessionTokenOf(adapter.getItem(COOKIE_KEY))) throw new Error("The saved sign-in couldn't be removed from secure storage.");
    },
  };
}

/** True when the jar holds a session cookie that hasn't expired (the server still decides whether it's valid). */
export function hasStoredSession(storage: SecureStorage, now = Date.now()): boolean {
  const raw = cookieJar(storage).read();
  if (!raw) return false;
  try {
    const jar = JSON.parse(raw) as Record<string, { value?: string; expires?: string | null }>;
    return Object.entries(jar).some(
      ([name, cookie]) => name.endsWith("session_token") && !!cookie?.value && (!cookie.expires || new Date(cookie.expires).getTime() > now),
    );
  } catch {
    return false;
  }
}

/** The OAuth state cookie value a cookie-state Better Auth server sets (this one keeps state in its database). */
export function oauthStateFromJar(storage: SecureStorage): string | null {
  const raw = cookieJar(storage).read();
  if (!raw) return null;
  try {
    const jar = JSON.parse(raw) as Record<string, { value?: string }>;
    const entry = Object.entries(jar).find(([name]) => name.endsWith("better-auth.oauth_state"));
    return entry?.[1]?.value ?? null;
  } catch {
    return null;
  }
}
