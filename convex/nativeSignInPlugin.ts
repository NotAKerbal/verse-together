// The native app's Google sign-in, without a session in its custom-scheme return URL.
//
// The app signs in through the website's own Google callback in a browser tab (no separate Google credentials). A
// custom scheme (versetogether://) is not private: another Android app can register it and be handed the return URL,
// and anything that sees one can forge another (RFC 8252 §8.1). So the return URL carries only a short-lived one-time
// code, which is worthless without a secret that never leaves the app (RFC 7636's S256 proof):
//
//   1. The app makes a 256-bit verifier and a public attempt id, keeps both in secure storage, and calls
//      POST /sign-in/social with return URL versetogether://auth-callback?attempt=<id> and
//      additionalData.nativeSignIn = { challenge: base64url(SHA-256(verifier)), method: "S256" }.
//      Better Auth creates the OAuth transaction (its state, PKCE verifier for Google, and stored return URL); the after
//      hook below then binds the attempt and challenge to exactly that transaction's state, once (convex/nativeSignIn.ts).
//      An attempt or transaction that is already bound is refused, and the refused transaction is deleted.
//   2. The browser tab goes through the Expo plugin's /expo-authorization-proxy to Google and back to the site's
//      existing /callback/google, where Better Auth validates the state (its database record and the browser's signed
//      state cookie), exchanges Google's code, links or creates the account, and creates the session.
//   3. Only then, for a return to the app scheme, the callback hook issues a one-time code for that session, bound to the
//      attempt registered to that same state, and redirects to versetogether://auth-callback?attempt=<id>&code=<code>.
//      No session cookie (or Convex JWT) is left on that response, so neither the URL nor the browser tab holds one.
//   4. The app POSTs { attempt, code, verifier } over HTTPS to /native-sign-in/exchange. The code is redeemed once,
//      only with the attempt it was issued for and the verifier behind that attempt's challenge; a wrong proof doesn't
//      use it up. The session must still exist (not signed out, revoked or deleted) and is returned in the response
//      body, never as a Set-Cookie header, with no-store caching. The app then stores it in secure storage.
//
// What this stops: an app or page that intercepts the return URL has a code it can't redeem (no verifier). One that
// forges a return with its own code, made in its own Google sign-in, can't attach it to this device's attempt: the
// attempt was bound to this device's transaction before the tab opened, and a code only redeems with its own
// attempt and challenge. So a forged return can't sign the app in to another account, and the legitimate one still
// works. What it doesn't stop: a forged or intercepted return can still end the app's pending attempt (the app then
// says sign-in didn't finish), and anything that can read this app's secure storage could read the verifier.
//
// The Expo plugin's own after hook (which copies the Set-Cookie header into the return URL as `cookie=`) is removed;
// its origin override for the app's `expo-origin` header and its authorization proxy are kept.

import { expo } from "@better-auth/expo";
import type { GenericCtx } from "@convex-dev/better-auth";
import { HIDE_METADATA, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie, splitSetCookieHeader } from "better-auth/cookies";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { NATIVE_APP_ORIGIN } from "./authEnvironment";
import { isToken, isVerifier, newCode, sha256Base64Url } from "./nativeSignIn";

/** Where the app's sign-in returns (mobile/app.json scheme + the app/auth-callback.tsx route). */
export const NATIVE_CALLBACK_URL = `${NATIVE_APP_ORIGIN}auth-callback`;
export const NATIVE_EXCHANGE_PATH = "/native-sign-in/exchange";
/** Fewer than the app could ever need, far fewer than guessing a 256-bit proof would. */
export const NATIVE_EXCHANGE_RATE_LIMIT = { window: 60, max: 10 };

const NATIVE_PROTOCOL = new URL(NATIVE_APP_ORIGIN).protocol;
const RETURN_URL = new RegExp(`^${NATIVE_CALLBACK_URL.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\?attempt=([A-Za-z0-9_-]{43})$`);
const INVALID_REQUEST = "Invalid native sign-in request";
const INVALID_CODE = "This sign-in can't be completed. Start again.";
const NO_STORE = { "cache-control": "no-store", pragma: "no-cache", "referrer-policy": "no-referrer" } as const;

export function nativeReturnURL(attempt: string): string {
  return `${NATIVE_CALLBACK_URL}?attempt=${attempt}`;
}

/** True for any URL in the app's scheme (whatever its case or path). */
export function isNativeURL(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === NATIVE_PROTOCOL;
  } catch {
    return value.trim().toLowerCase().startsWith(NATIVE_PROTOCOL);
  }
}

type NativeSignInRequest = { attempt: string; challenge: string };

/** The one shape of /sign-in/social body the app may send, or null. */
export function parseNativeSignInBody(body: unknown): NativeSignInRequest | null {
  if (!body || typeof body !== "object") return null;
  const { provider, callbackURL, errorCallbackURL, newUserCallbackURL, idToken, additionalData } = body as Record<string, unknown>;
  if (provider !== "google" || idToken !== undefined || newUserCallbackURL !== undefined) return null;
  const attempt = typeof callbackURL === "string" ? RETURN_URL.exec(callbackURL)?.[1] : undefined;
  if (!attempt || errorCallbackURL !== callbackURL) return null;
  if (!additionalData || typeof additionalData !== "object" || Object.keys(additionalData).join() !== "nativeSignIn") return null;
  const handoff = (additionalData as { nativeSignIn?: unknown }).nativeSignIn;
  if (!handoff || typeof handoff !== "object") return null;
  const { challenge, method } = handoff as Record<string, unknown>;
  if (Object.keys(handoff).sort().join() !== "challenge,method" || method !== "S256" || !isToken(challenge)) return null;
  return { attempt, challenge };
}

/** Every return URL a request names (body or query), so none can point at the app outside the native flow. */
function returnURLs(ctx: { body?: unknown; query?: unknown }): unknown[] {
  const body = (ctx.body && typeof ctx.body === "object" ? ctx.body : {}) as Record<string, unknown>;
  const query = (ctx.query && typeof ctx.query === "object" ? ctx.query : {}) as Record<string, unknown>;
  return [body.callbackURL, body.errorCallbackURL, body.newUserCallbackURL, body.redirectTo, query.callbackURL, query.errorCallbackURL, query.redirectTo];
}

/** Drops every Set-Cookie that sets a value; only expirations (Max-Age=0) stay. */
function keepOnlyExpiringCookies(headers: Headers) {
  const entries = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : splitSetCookieHeader(headers.get("set-cookie") ?? "");
  headers.delete("set-cookie");
  for (const entry of entries) if (/;\s*max-age=0\s*(;|$)/i.test(entry)) headers.append("set-cookie", entry);
}

function errorCode(value: string | null): string {
  return value && /^[a-z_]{1,64}$/.test(value) ? value : "sign_in_failed";
}

function runMutationOf(ctx: GenericCtx<DataModel>) {
  if (!("runMutation" in ctx)) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Native sign-in needs a mutation context." });
  return ctx.runMutation;
}

/** The Expo plugin without its cookie-in-the-return-URL hook. */
function expoWithoutCookieRedirect(): BetterAuthPlugin {
  const plugin = expo();
  return { ...plugin, hooks: undefined };
}

export function nativeSignIn(convexCtx: GenericCtx<DataModel>): BetterAuthPlugin[] {
  const handoff: BetterAuthPlugin = {
    id: "verse-native-sign-in",
    hooks: {
      before: [
        {
          // A return to the app is only ever the validated native Google sign-in below; anything else naming the app's
          // scheme (other sign-in routes, linking, password and email flows) is refused.
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx) => {
            const native = returnURLs(ctx).some(isNativeURL);
            const body = (ctx.body ?? {}) as { additionalData?: { nativeSignIn?: unknown } };
            const asked = body.additionalData && typeof body.additionalData === "object" && "nativeSignIn" in body.additionalData;
            if (!native && !asked) return;
            if (ctx.path !== "/sign-in/social" || !parseNativeSignInBody(ctx.body)) throw new APIError("BAD_REQUEST", { message: INVALID_REQUEST });
          }),
        },
      ],
      after: [
        {
          // Binds the attempt to the OAuth transaction Better Auth just created, once.
          matcher: (ctx) => ctx.path === "/sign-in/social",
          handler: createAuthMiddleware(async (ctx) => {
            const request = parseNativeSignInBody(ctx.body);
            if (!request) return;
            const returned = ctx.context.returned as { url?: unknown } | undefined;
            if (!returned || returned instanceof Error || typeof returned.url !== "string") return;
            const state = new URL(returned.url).searchParams.get("state");
            const registered = state
              ? await runMutationOf(convexCtx)(internal.nativeSignIn.register, { ...request, state, now: Date.now() })
              : false;
            if (!registered) {
              if (state) await ctx.context.internalAdapter.deleteVerificationByIdentifier(state).catch(() => {});
              throw new APIError("BAD_REQUEST", { message: "This sign-in attempt can't be used. Start again.", code: "NATIVE_SIGN_IN_REJECTED" });
            }
          }),
        },
        {
          // A finished Google callback returning to the app: swap the session for a one-time code.
          matcher: (ctx) => !!(ctx.path?.startsWith("/callback") || ctx.path?.startsWith("/oauth2/callback")),
          handler: createAuthMiddleware(async (ctx) => {
            const headers = ctx.context.responseHeaders;
            const location = headers?.get("location");
            if (!headers || !location || !isNativeURL(location)) return;
            // Nothing in this response (URL, cookies, caches) may carry a credential.
            keepOnlyExpiringCookies(headers);
            for (const [name, value] of Object.entries(NO_STORE)) headers.set(name, value);

            let returned: URL | null = null;
            try {
              returned = new URL(location);
            } catch {}
            const attempt = returned?.searchParams.get("attempt") ?? null;
            const reported = returned?.searchParams.get("error") ?? null;
            const target = (params: Record<string, string>) => `${NATIVE_CALLBACK_URL}?${new URLSearchParams(params)}`;
            const fail = (code: string) => headers.set("location", target(isToken(attempt) ? { attempt, error: code } : { error: code }));

            const created = ctx.context.newSession;
            const revoke = async () => {
              if (created) await ctx.context.internalAdapter.deleteSession(created.session.token).catch(() => {});
            };
            if (!created || reported || !isToken(attempt) || !returned || returned.href !== nativeReturnURL(attempt)) {
              await revoke();
              return fail(errorCode(reported));
            }
            const state = typeof ctx.query?.state === "string" ? ctx.query.state : "";
            const code = newCode();
            const issued = await runMutationOf(convexCtx)(internal.nativeSignIn.issueCode, {
              state,
              attempt,
              codeHash: await sha256Base64Url(code),
              sessionId: String(created.session.id),
              now: Date.now(),
            }).catch(() => false);
            if (!issued) {
              await revoke();
              return fail("sign_in_failed");
            }
            headers.set("location", target({ attempt, code }));
          }),
        },
        {
          // The exchange answers with the session in its body only, and is never cached.
          matcher: (ctx) => ctx.path === NATIVE_EXCHANGE_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.context.responseHeaders) keepOnlyExpiringCookies(ctx.context.responseHeaders);
            for (const [name, value] of Object.entries(NO_STORE)) ctx.setHeader(name, value);
          }),
        },
      ],
    },
    endpoints: {
      nativeSignInExchange: createAuthEndpoint(NATIVE_EXCHANGE_PATH, { method: "POST", metadata: HIDE_METADATA }, async (ctx) => {
        const { attempt, code, verifier } = (ctx.body ?? {}) as Record<string, unknown>;
        if (!isToken(attempt) || !isToken(code) || !isVerifier(verifier)) {
          throw new APIError("BAD_REQUEST", { message: INVALID_CODE, code: "INVALID_SIGN_IN_CODE" });
        }
        const redeemed = await runMutationOf(convexCtx)(internal.nativeSignIn.redeem, {
          attempt,
          codeHash: await sha256Base64Url(code),
          challenge: await sha256Base64Url(verifier),
          now: Date.now(),
        });
        const refused = () => new APIError("UNAUTHORIZED", { message: INVALID_CODE, code: "INVALID_SIGN_IN_CODE" });
        if (!redeemed) throw refused();
        // The session must still be live: not signed out, revoked, expired, or its account deleted since.
        const session = await ctx.context.adapter.findOne<{ id: string; token: string; userId: string; expiresAt: Date }>({
          model: "session",
          where: [{ field: "id", value: redeemed.sessionId }],
        });
        if (!session || new Date(session.expiresAt).getTime() <= Date.now()) throw refused();
        const user = await ctx.context.internalAdapter.findUserById(session.userId);
        if (!user) throw refused();
        // Better Auth's own session cookie (signed token, lifetime and attributes), moved from the headers to the body.
        await setSessionCookie(ctx, { session: session as never, user });
        const cookie = ctx.responseHeaders?.get("set-cookie") ?? null;
        ctx.responseHeaders?.delete("set-cookie");
        if (!cookie) throw refused();
        return ctx.json({ cookie });
      }),
    },
  };
  return [expoWithoutCookieRedirect(), handoff];
}
