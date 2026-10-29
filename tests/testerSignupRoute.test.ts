// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { ConvexError } from "convex/values";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/convexHttp", () => ({ convexMutation: save }));
const { POST } = await import("../src/app/api/tester-signups/route");
const payload = { name: "Tester", email: "test@example.com", android: false, ios: true, googlePlayEmail: "", device: "", consent: true };
function request(body: unknown, origin = "https://www.versetogether.org") {
  return new NextRequest("https://www.versetogether.org/api/tester-signups", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => { save.mockReset(); });
test("valid submissions save through the backend without authentication", async () => {
  save.mockResolvedValue({ ok: true });
  const result = await POST(request(payload));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ ok: true });
  expect(save).toHaveBeenCalledWith("testerSignups:submit", payload);
});
test("cross-origin, invalid, oversized, and bot submissions never reach storage", async () => {
  expect((await POST(request(payload, "https://other.example"))).status).toBe(403);
  expect((await POST(request({ ...payload, consent: false }))).status).toBe(400);
  expect((await POST(request({ ...payload, device: "a".repeat(5000) }))).status).toBe(413);
  expect((await POST(request({ ...payload, website: "spam" }))).status).toBe(200);
  expect(save).not.toHaveBeenCalled();
});
test("storage failures never claim signup success or expose backend details", async () => {
  save.mockImplementation(async () => { throw new Error("private backend configuration"); });
  const result = await POST(request(payload));
  expect(result.status).toBe(502);
  expect(await result.json()).toEqual({ error: "Your signup couldn’t be saved. Please try again." });
});
test("signup bursts return an actionable retry response", async () => {
  save.mockImplementation(async () => { throw new ConvexError({ code: "RATE_LIMITED" }); });
  const result = await POST(request(payload));
  expect(result.status).toBe(429);
  expect(result.headers.get("Retry-After")).toBe("60");
});
