// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const convex = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/convexHttp", () => ({ convexQuery: convex.query }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
vi.mock("@convex-dev/better-auth/nextjs", () => ({ convexBetterAuthNextJs: () => ({ getToken: async () => "cookie.convex.jwt" }) }));

const { getServerViewer } = await import("../src/lib/auth-server");
const { getRequestViewer } = await import("../src/lib/requestViewer");

const bearerRequest = () => new Request("https://example.com/api", { headers: { authorization: "Bearer aaa.bbb.ccc" } });

beforeEach(() => {
  convex.query.mockReset();
});

describe.each([
  ["a cookie", async () => (await getServerViewer()).viewer],
  ["a bearer token", async () => (await getRequestViewer(bearerRequest())).viewer],
])("the verified viewer from %s", (_name, resolve) => {
  test("carries review access without implying admin", async () => {
    convex.query.mockResolvedValue({ appUserId: "reviewer", isAdmin: false, isChapterGuideReviewer: true });
    expect(await resolve()).toEqual({ appUserId: "reviewer", isAdmin: false, isChapterGuideReviewer: true });
  });

  test("treats anything but true as no access", async () => {
    convex.query.mockResolvedValue({ appUserId: "reader", isAdmin: "true", isChapterGuideReviewer: "true" });
    expect(await resolve()).toEqual({ appUserId: "reader", isAdmin: false, isChapterGuideReviewer: false });
    convex.query.mockResolvedValue({ appUserId: "older-payload" });
    expect(await resolve()).toEqual({ appUserId: "older-payload", isAdmin: false, isChapterGuideReviewer: false });
  });
});
