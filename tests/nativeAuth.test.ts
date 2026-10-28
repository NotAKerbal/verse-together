import { describe, expect, it } from "vitest";
import {
  grantIdentifier,
  isPkceChallenge,
  isPkceVerifier,
  nativeCallbackUrl,
  nativeDeclinedUrl,
  newGrantCode,
  parseNativeAuthorizeRequest,
  parseNativeGrant,
  pkceMatches,
  sha256Base64Url,
} from "../convex/nativeAuthRules";
import { chooseSignInRoute, signInReturnPath } from "../src/lib/signInFlow";

describe("desktop sign-in rules", () => {
  // RFC 7636 appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("computes S256 challenges exactly as RFC 7636", async () => {
    expect(await sha256Base64Url(verifier)).toBe(challenge);
    expect(await pkceMatches(verifier, challenge)).toBe(true);
    expect(await pkceMatches(`${verifier.slice(0, -1)}x`, challenge)).toBe(false);
    expect(await pkceMatches("short", challenge)).toBe(false);
    expect(isPkceChallenge(challenge)).toBe(true);
    expect(isPkceChallenge(`${challenge}=`)).toBe(false);
    expect(isPkceVerifier(verifier)).toBe(true);
    expect(isPkceVerifier("a".repeat(129))).toBe(false);
  });

  it("accepts only a well-formed request and calls back only to the loopback address", () => {
    const state = "abcdefghijklmnopQRSTUV";
    const ok = parseNativeAuthorizeRequest(new URLSearchParams({ challenge, state, port: "49152" }));
    expect(ok).toEqual({ challenge, state, port: 49152 });
    expect(nativeCallbackUrl(ok!, "code-1")).toBe(`http://127.0.0.1:49152/callback?code=code-1&state=${state}`);
    expect(nativeDeclinedUrl(ok!)).toBe(`http://127.0.0.1:49152/callback?error=access_denied&state=${state}`);
    for (const bad of [
      { challenge, state, port: "80" },
      { challenge, state, port: "70000" },
      { challenge, state, port: "4915a" },
      { challenge, state: "short", port: "49152" },
      { challenge: "x", state, port: "49152" },
      { challenge, state: "has/slash/abcdefghij", port: "49152" },
    ]) {
      expect(parseNativeAuthorizeRequest(new URLSearchParams(bad))).toBeNull();
    }
  });

  it("brings the reader back to the same approval request after signing in", () => {
    // The approval page's own URL as the app opens it (native/src/cloud.rs), through the website's sign-in flow.
    const page = `/native/authorize?challenge=${challenge}&state=abcdefghijklmnopQRSTUV&port=49152`;
    expect(signInReturnPath(page)).toBe(page);
    const google = chooseSignInRoute({ google: true, emailPassword: false }, signInReturnPath(page), "https://www.versetogether.org");
    expect(google).toMatchObject({ kind: "google", callbackURL: `https://www.versetogether.org${page}` });
    const back = new URL((google as { callbackURL: string }).callbackURL);
    expect(parseNativeAuthorizeRequest(back.searchParams)).toEqual({ challenge, state: "abcdefghijklmnopQRSTUV", port: 49152 });
    // With a choice of methods the sign-in page is used, and it returns to the same request.
    const choice = chooseSignInRoute({ google: true, emailPassword: true }, page, "https://www.versetogether.org");
    expect(choice.kind).toBe("page");
    const redirect = new URL((choice as { href: string }).href, "https://www.versetogether.org").searchParams.get("redirect");
    expect(redirect).toBe(page);
  });

  it("stores codes only as hashes and reads grants defensively", async () => {
    const code = newGrantCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newGrantCode()).not.toBe(code);
    const identifier = await grantIdentifier(code);
    expect(identifier.startsWith("native-grant:")).toBe(true);
    expect(identifier).not.toContain(code);
    expect(parseNativeGrant(JSON.stringify({ userId: "u1", challenge }))).toEqual({ userId: "u1", challenge });
    expect(parseNativeGrant(JSON.stringify({ userId: "", challenge }))).toBeNull();
    expect(parseNativeGrant("{not json")).toBeNull();
  });
});
