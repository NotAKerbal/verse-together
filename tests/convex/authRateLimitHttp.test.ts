import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "../../convex/schema";
import { CLIENT_IP_HEADER, signClientIp } from "../../convex/authProxy";

const modules = import.meta.glob("../../convex/**/*.ts");
const PROXY_SECRET = "p".repeat(40);
const SIGN_IN = "/api/auth/sign-in/email";

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t, "betterAuth");
  return t;
}

async function signIn(t: ReturnType<typeof setup>, headers: Record<string, string> = {}) {
  return t.fetch(SIGN_IN, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3199", ...headers },
    body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password-123" }),
  });
}

async function signed(ip: string) {
  return signClientIp({ secret: PROXY_SECRET, ip, method: "POST", pathname: SIGN_IN });
}

beforeEach(() => {
  vi.stubEnv("SITE_URL", "http://127.0.0.1:3199");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-better-auth-secret-0123456789abcdef");
  vi.stubEnv("AUTH_PROXY_SECRET", PROXY_SECRET);
  // The email sign-in route is the rate-limit fixture, so these run in the future email/password mode;
  // the Google-only default is covered in authRollout.test.ts.
  vi.stubEnv("AUTH_EMAIL_PASSWORD_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Better Auth HTTP rate limiting", () => {
  test("sign-in allows 3 attempts per 10s per signed client IP, then answers 429", async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) expect((await signIn(t, await signed("203.0.113.5"))).status).toBe(401);
    const limited = await signIn(t, await signed("203.0.113.5"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect(Number(limited.headers.get("x-retry-after"))).toBeLessThanOrEqual(10);
    // Another visitor's allowance is untouched.
    expect((await signIn(t, await signed("198.51.100.7"))).status).toBe(401);
  });

  test("unsigned callers share one bucket and cannot spend a signed visitor's allowance", async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) {
      expect((await signIn(t, { [CLIENT_IP_HEADER]: `192.0.2.${i}`, "x-forwarded-for": `192.0.2.${i}` })).status).toBe(401);
    }
    // Rotating spoofed IP headers does not create fresh buckets.
    expect((await signIn(t, { [CLIENT_IP_HEADER]: "192.0.2.99", "x-forwarded-for": "192.0.2.99" })).status).toBe(429);
    expect((await signIn(t, await signed("203.0.113.5"))).status).toBe(401);
  });

  test("session reads are not rate limited or counted", async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) {
      const response = await t.fetch("/api/auth/get-session", { method: "GET" });
      expect(response.status).toBe(200);
    }
    const rows = await t.run((ctx) => ctx.db.query("authRateLimits").collect());
    expect(rows).toHaveLength(0);
  });
});
