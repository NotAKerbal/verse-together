import { describe, expect, test } from "vitest";
import {
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  CLIENT_IP_TIMESTAMP_HEADER,
  MAX_SIGNATURE_SKEW_MS,
  isValidIp,
  readProxySecret,
  resolveTrustedClientIp,
  signClientIp,
  withVerifiedClientIp,
} from "../../convex/authProxy";

const SECRET = "s".repeat(32);
const NOW = 1_700_000_000_000;
const URL_SIGN_IN = "https://example.convex.site/api/auth/sign-in/email";

async function signedRequest(overrides: { ip?: string; method?: string; pathname?: string; now?: number; secret?: string } = {}) {
  const headers = await signClientIp({
    secret: overrides.secret ?? SECRET,
    ip: overrides.ip ?? "203.0.113.5",
    method: overrides.method ?? "POST",
    pathname: overrides.pathname ?? "/api/auth/sign-in/email",
    now: overrides.now ?? NOW,
  });
  return new Request(URL_SIGN_IN, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" });
}

describe("auth proxy client IP", () => {
  test("a correctly signed IP is passed to Better Auth with the signature headers removed", async () => {
    const request = await withVerifiedClientIp(await signedRequest(), SECRET, NOW + 1_000);
    expect(request.headers.get(CLIENT_IP_HEADER)).toBe("203.0.113.5");
    expect(request.headers.get(CLIENT_IP_TIMESTAMP_HEADER)).toBeNull();
    expect(request.headers.get(CLIENT_IP_SIGNATURE_HEADER)).toBeNull();
    expect(request.method).toBe("POST");
    expect(await request.text()).toBe("{}");
  });

  test("forged, stale, replayed-elsewhere, or unsigned IPs are dropped", async () => {
    const cases: Array<[string, Request, string | null]> = [
      ["wrong secret", await signedRequest({ secret: "x".repeat(32) }), SECRET],
      ["stale", await signedRequest({ now: NOW - MAX_SIGNATURE_SKEW_MS - 1 }), SECRET],
      ["future", await signedRequest({ now: NOW + MAX_SIGNATURE_SKEW_MS + 1 }), SECRET],
      ["other path", await signedRequest({ pathname: "/api/auth/get-session" }), SECRET],
      ["other method", await signedRequest({ method: "GET" }), SECRET],
      ["no secret configured on Convex", await signedRequest(), null],
    ];
    for (const [label, input, secret] of cases) {
      const request = await withVerifiedClientIp(input, secret, NOW);
      expect(request.headers.get(CLIENT_IP_HEADER), label).toBeNull();
    }

    const tampered = await signedRequest();
    const headers = new Headers(tampered.headers);
    headers.set(CLIENT_IP_HEADER, "198.51.100.1");
    const swapped = await withVerifiedClientIp(new Request(URL_SIGN_IN, { method: "POST", headers }), SECRET, NOW);
    expect(swapped.headers.get(CLIENT_IP_HEADER)).toBeNull();

    // A caller hitting the Convex site directly can set the header but not sign it.
    const direct = new Request(URL_SIGN_IN, { method: "POST", headers: { [CLIENT_IP_HEADER]: "203.0.113.5", "x-forwarded-for": "203.0.113.5" } });
    expect((await withVerifiedClientIp(direct, SECRET, NOW)).headers.get(CLIENT_IP_HEADER)).toBeNull();
  });

  test("the proxy only trusts a single address from a header the edge overwrites", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.1, 203.0.113.5", "cf-connecting-ip": "2001:db8::1" });
    expect(resolveTrustedClientIp(headers, {})).toBeNull();
    expect(resolveTrustedClientIp(headers, { VERCEL: "1" })).toBe("203.0.113.5");
    expect(resolveTrustedClientIp(headers, { AUTH_CLIENT_IP_HEADER: "CF-Connecting-IP" })).toBe("2001:db8::1");
    expect(resolveTrustedClientIp(headers, { AUTH_CLIENT_IP_HEADER: "x-forwarded-for" })).toBeNull();
    expect(resolveTrustedClientIp(new Headers({ "x-real-ip": "not-an-ip" }), { VERCEL: "1" })).toBeNull();
  });

  test("IP and secret validation", () => {
    for (const ip of ["127.0.0.1", "203.0.113.5", "::1", "2001:db8::1", "::ffff:192.0.2.1"]) expect(isValidIp(ip), ip).toBe(true);
    for (const ip of ["", "256.1.1.1", "1.2.3", "localhost", "1.2.3.4\n", "2001:db8::g", "[::1]", "1.2.3.4|/x"]) {
      expect(isValidIp(ip), ip).toBe(false);
    }
    expect(readProxySecret({})).toBeNull();
    expect(readProxySecret({ AUTH_PROXY_SECRET: "short" })).toBeNull();
    expect(readProxySecret({ AUTH_PROXY_SECRET: ` ${SECRET} ` })).toBe(SECRET);
  });
});
