import { describe, expect, test } from "vitest";
import {
  EMAIL_PASSWORD_STATIC_PATHS,
  authCapabilities,
  isEmailPasswordEndpoint,
  readAuthEnvironment,
} from "../../convex/authEnvironment";

const GOOGLE = { GOOGLE_CLIENT_ID: " id ", GOOGLE_CLIENT_SECRET: "secret" };
const RESEND = { RESEND_API_KEY: "key", AUTH_EMAIL_FROM: "Verse Together <no-reply@versetogether.org>" };
const GOOGLE_ONLY = { emailPassword: false, google: true, emailDelivery: false, requireEmailVerification: false };

describe("auth environment", () => {
  test("Google is off unless both halves of the secret pair are present", () => {
    const env = readAuthEnvironment({ SITE_URL: "https://versetogether.org/", GOOGLE_CLIENT_ID: "id-only", RESEND_API_KEY: "key" });
    expect(env.siteUrl).toBe("https://versetogether.org");
    expect(authCapabilities(env)).toEqual({
      emailPassword: false,
      google: false,
      emailDelivery: false,
      requireEmailVerification: false,
    });
  });

  test("defaults to Google-only without Resend configured", () => {
    const env = readAuthEnvironment({ SITE_URL: "http://localhost:3000", ...GOOGLE });
    expect(env.google).toEqual({ clientId: "id", clientSecret: "secret" });
    expect(env.emailPasswordEnabled).toBe(false);
    expect(authCapabilities(env)).toEqual(GOOGLE_ONLY);
  });

  test("stays Google-only when Resend is configured but email/password was not explicitly enabled", () => {
    const env = readAuthEnvironment({ SITE_URL: "http://localhost:3000", ...GOOGLE, ...RESEND });
    expect(env.emailDelivery).not.toBeNull();
    expect(authCapabilities(env)).toEqual(GOOGLE_ONLY);
  });

  test("only the exact value \"true\" enables email/password", () => {
    for (const value of ["", "1", "yes", "TRUE", "True", "on", "false"]) {
      const env = readAuthEnvironment({ ...GOOGLE, ...RESEND, AUTH_EMAIL_PASSWORD_ENABLED: value });
      expect(authCapabilities(env)).toEqual(GOOGLE_ONLY);
    }
    expect(readAuthEnvironment({ AUTH_EMAIL_PASSWORD_ENABLED: " true " }).emailPasswordEnabled).toBe(true);
  });

  test("future email mode: delivery and verification follow Resend once explicitly enabled", () => {
    const withoutResend = readAuthEnvironment({ ...GOOGLE, AUTH_EMAIL_PASSWORD_ENABLED: "true" });
    expect(authCapabilities(withoutResend)).toEqual({
      emailPassword: true,
      google: true,
      emailDelivery: false,
      requireEmailVerification: false,
    });
    const withResend = readAuthEnvironment({ ...GOOGLE, ...RESEND, AUTH_EMAIL_PASSWORD_ENABLED: "true" });
    expect(authCapabilities(withResend)).toEqual({
      emailPassword: true,
      google: true,
      emailDelivery: true,
      requireEmailVerification: true,
    });
  });

  test("the blocked endpoint list covers every password and verification route", () => {
    for (const path of [
      "/sign-up/email",
      "/sign-in/email",
      "/request-password-reset",
      "/reset-password",
      "/reset-password/:token",
      "/change-password",
      "/verify-password",
      "/send-verification-email",
      "/verify-email",
      "/change-email",
    ]) {
      expect(isEmailPasswordEndpoint(path)).toBe(true);
    }
    for (const path of ["/sign-in/social", "/callback/:id", "/get-session", "/sign-out", "/update-user", "/link-social", undefined]) {
      expect(isEmailPasswordEndpoint(path)).toBe(false);
    }
    expect(EMAIL_PASSWORD_STATIC_PATHS).not.toContain("/reset-password/:token");
    expect(EMAIL_PASSWORD_STATIC_PATHS).toContain("/reset-password");
  });

  test("trusted origins are normalised and junk is dropped", () => {
    const env = readAuthEnvironment({
      SITE_URL: "https://versetogether.org/path",
      AUTH_TRUSTED_ORIGINS: "https://preview.versetogether.org/x, javascript:alert(1), not a url, https://versetogether.org",
    });
    expect(env.trustedOrigins).toEqual(["https://versetogether.org", "https://preview.versetogether.org"]);
  });

  test("missing SITE_URL is reported as null, never guessed", () => {
    expect(readAuthEnvironment({}).siteUrl).toBeNull();
    expect(readAuthEnvironment({ SITE_URL: "ftp://example.com" }).siteUrl).toBeNull();
  });
});
