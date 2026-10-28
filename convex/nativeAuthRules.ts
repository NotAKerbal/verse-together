// Pure rules for signing the desktop app in through the browser (convex/nativeAuth.ts, the /native/authorize page,
// and native/src/account.rs). RFC 8252 shape: the app opens the system browser with a PKCE (S256) challenge, the
// signed-in reader approves on the website, and a single-use code is handed to the app's loopback listener; only
// the app, which holds the verifier, can exchange that code for its own session.

/** How long an approved code may wait for the app to exchange it. */
export const NATIVE_GRANT_SECONDS = 120;
export const NATIVE_GRANT_PREFIX = "native-grant:";
export const NATIVE_SESSION_USER_AGENT = "Verse Together desktop";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** base64url(SHA-256(verifier)) without padding: always 43 characters. */
export function isPkceChallenge(value: unknown): value is string {
  return typeof value === "string" && value.length === 43 && BASE64URL.test(value);
}

/** RFC 7636 code verifier: 43–128 unreserved characters. */
export function isPkceVerifier(value: unknown): value is string {
  return typeof value === "string" && value.length >= 43 && value.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(value);
}

/** The app's anti-forgery value, echoed back to its listener. */
export function isNativeState(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 128 && BASE64URL.test(value);
}

/** The app listens on 127.0.0.1 at an unprivileged port it chose. */
export function isLoopbackPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1024 && value <= 65535;
}

export type NativeAuthorizeRequest = { challenge: string; state: string; port: number };

/** The approval page's query, or null when anything is missing or malformed (nothing is then offered). */
export function parseNativeAuthorizeRequest(params: URLSearchParams): NativeAuthorizeRequest | null {
  const challenge = params.get("challenge");
  const state = params.get("state");
  const portText = params.get("port") ?? "";
  const port = /^\d{4,5}$/.test(portText) ? Number(portText) : NaN;
  if (!isPkceChallenge(challenge) || !isNativeState(state) || !isLoopbackPort(port)) return null;
  return { challenge, state, port };
}

/** Where the approved code goes: only ever the loopback IP literal, never a host name another process could claim. */
export function nativeCallbackUrl(request: Pick<NativeAuthorizeRequest, "port" | "state">, code: string): string {
  const url = new URL(`http://127.0.0.1:${request.port}/callback`);
  url.searchParams.set("code", code);
  url.searchParams.set("state", request.state);
  return url.toString();
}

/** Where a declined approval goes: the same listener, told the reader chose not to approve. */
export function nativeDeclinedUrl(request: Pick<NativeAuthorizeRequest, "port" | "state">): string {
  const url = new URL(`http://127.0.0.1:${request.port}/callback`);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("state", request.state);
  return url.toString();
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64Url(new Uint8Array(digest));
}

/** A fresh single-use code: 32 random bytes. */
export function newGrantCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** Codes are stored only as their hash, so a database read never yields a usable code. */
export async function grantIdentifier(code: string): Promise<string> {
  return `${NATIVE_GRANT_PREFIX}${await sha256Base64Url(code)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  if (!isPkceVerifier(verifier) || !isPkceChallenge(challenge)) return false;
  return constantTimeEqual(await sha256Base64Url(verifier), challenge);
}

export type NativeGrant = { userId: string; challenge: string };

export function parseNativeGrant(value: string): NativeGrant | null {
  try {
    const parsed = JSON.parse(value) as Partial<NativeGrant>;
    return typeof parsed.userId === "string" && parsed.userId && isPkceChallenge(parsed.challenge)
      ? { userId: parsed.userId, challenge: parsed.challenge }
      : null;
  } catch {
    return null;
  }
}
