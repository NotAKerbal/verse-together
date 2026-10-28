import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { cleanTesterSignup, type TesterSignup } from "../convex/testerSignupRules";
import { newBackend } from "./convexAuthHarness";

const submit = api.testerSignups.submit;
const signup: TesterSignup = {
  name: " Tester ", email: " Person@Example.com ", android: true, ios: false,
  googlePlayEmail: " Play@Example.com ", device: "Pixel 9", consent: true,
};

describe("tester signups", () => {
  test("normalizes emails and trims names, requiring a Play email only for Android", () => {
    expect(cleanTesterSignup(signup)).toMatchObject({ name: "Tester", email: "person@example.com", googlePlayEmail: "play@example.com" });
    expect(cleanTesterSignup({ ...signup, android: false, ios: true, googlePlayEmail: "unused" }).googlePlayEmail).toBe("");
    expect(() => cleanTesterSignup({ ...signup, googlePlayEmail: "" })).toThrow("Google Play email");
  });

  test.each([
    { android: false, ios: false }, { android: true, ios: true }, { android: "true" }, { consent: false },
    { name: " " }, { name: "a".repeat(81) }, { email: "invalid" },
    { email: "a".repeat(255) + "@example.com" }, { device: "a".repeat(301) },
  ])("rejects invalid input %j", change => {
    expect(() => cleanTesterSignup({ ...signup, ...change })).toThrow("Tester signup:");
  });

  test("saves anonymous signups with consent; retries never overwrite existing details", async () => {
    const t = newBackend();
    await t.mutation(submit, signup);
    await t.mutation(submit, { ...signup, name: "Someone else", device: "Different" });
    const rows = await t.run(ctx => ctx.db.query("testerSignups").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Tester", email: "person@example.com", device: "Pixel 9", consent: true, consentVersion: "2026-10-28-v2" });
    expect(rows[0].createdAt).toBeGreaterThan(0);
    // An existing Android volunteer can separately register iOS interest.
    await t.mutation(submit, { ...signup, android: false, ios: true, googlePlayEmail: "" });
    expect(await t.run(ctx => ctx.db.query("testerSignups").collect())).toHaveLength(2);
  });

  test("direct backend calls cannot bypass consent and email validation", async () => {
    const t = newBackend();
    await expect(t.mutation(submit, { ...signup, consent: false })).rejects.toThrow();
    await expect(t.mutation(submit, { ...signup, email: "bad" })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("testerSignups").collect())).toEqual([]);
  });

  test("limits bursts, permits harmless retries, and accepts new signups after the window", async () => {
    const t = newBackend();
    for (let i = 0; i < 20; i++) await t.mutation(submit, { ...signup, email: `tester${i}@example.com` });
    await expect(t.mutation(submit, { ...signup, email: "overflow@example.com" })).rejects.toThrow();
    await expect(t.mutation(submit, { ...signup, email: "tester0@example.com" })).resolves.toEqual({ ok: true });
    await t.run(async ctx => {
      for (const row of await ctx.db.query("testerSignups").collect()) await ctx.db.patch(row._id, { createdAt: Date.now() - 61_000 });
    });
    await expect(t.mutation(submit, { ...signup, email: "new@example.com" })).resolves.toEqual({ ok: true });
  });
});
