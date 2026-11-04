// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { CHAPTER_INSIGHT_PROMPT_VERSION } from "@/lib/chapterInsights";

const convex = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
const cookie = vi.hoisted(() => ({ getServerViewer: vi.fn() }));
vi.mock("@/lib/convexHttp", () => ({ convexQuery: convex.query, convexMutation: convex.mutation }));
vi.mock("@/lib/auth-server", () => ({ getServerViewer: cookie.getServerViewer }));
vi.mock("@/lib/ldsLocalData.server", () => ({
  getLocalLdsChapter: async (volume: string, book: string, chapter: number) =>
    volume === "bookofmormon" && book === "alma" && chapter === 32
      ? { reference: "Alma 32", verses: [{ verse: 21, text: "Faith is not to have a perfect knowledge of things." }, { verse: 27, text: "Experiment upon my words." }] }
      : null,
}));

const { GET, POST } = await import("../src/app/api/insights/chapter/route");
const { readBearerCredential } = await import("../src/lib/requestViewer");

const NATIVE_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl";
const COOKIE_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJjb29raWUifQ.c2lnbmF0dXJl";
const VIEWER = { appUserId: "owner-A", isAdmin: false, displayName: "Ada", avatarUrl: null, legacyAccount: false };
const providerFetch = vi.fn();

function post(headers: Record<string, string> = {}, body: unknown = { volume: "bookofmormon", book: "alma", chapter: 32 }) {
  return new NextRequest("https://www.versetogether.org/api/insights/chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(query = "volume=bookofmormon&book=alma&chapter=32") {
  return new NextRequest(`https://www.versetogether.org/api/insights/chapter?${query}`);
}

async function cachedRow() {
  const { createHash } = await import("node:crypto");
  return {
    reference: "Alma 32",
    scriptureHash: createHash("sha256").update("21. Faith is not to have a perfect knowledge of things.\n27. Experiment upon my words.").digest("hex"),
    promptVersion: CHAPTER_INSIGHT_PROMPT_VERSION,
    paths: [{ kind: "cross_reference", verse_numbers: [21], title: "Faith", direction: "Compare", why: "Both", look_for: ["x"], sources: [] }],
    generatedAt: Date.UTC(2026, 9, 1),
    signature: "sig",
  };
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  convex.query.mockReset();
  convex.mutation.mockReset();
  cookie.getServerViewer.mockReset().mockResolvedValue({ viewer: VIEWER, token: COOKIE_TOKEN });
  providerFetch.mockReset();
  vi.stubGlobal("fetch", providerFetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a cached chapter's study paths are read without an account or a provider", async () => {
  convex.query.mockResolvedValue(await cachedRow());
  for (const response of [await GET(get()), await POST(post())]) {
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ reference: "Alma 32", cached: true });
    expect(body.paths).toHaveLength(1);
  }
  expect(cookie.getServerViewer).not.toHaveBeenCalled();
  expect(providerFetch).not.toHaveBeenCalled();
});

test("an uncached chapter never reaches a paid provider, even for a signed-in reader", async () => {
  convex.query.mockResolvedValue(null);
  for (const response of [await GET(get()), await POST(post()), await POST(post({ Authorization: `Bearer ${NATIVE_TOKEN}` }))]) {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reference: "Alma 32", paths: [], generated_at: null, cached: false });
  }
  expect(providerFetch).not.toHaveBeenCalled();
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("a study path row for other scripture text or an older prompt isn't served or regenerated", async () => {
  convex.query.mockResolvedValue({ ...(await cachedRow()), scriptureHash: "other" });
  expect(await (await GET(get())).json()).toMatchObject({ paths: [], cached: false });
  convex.query.mockResolvedValue({ ...(await cachedRow()), promptVersion: CHAPTER_INSIGHT_PROMPT_VERSION - 1 });
  expect(await (await POST(post())).json()).toMatchObject({ paths: [], cached: false });
  expect(providerFetch).not.toHaveBeenCalled();
});

test("a cache read failure reports unavailable instead of generating", async () => {
  convex.query.mockRejectedValue(new Error("down"));
  expect((await POST(post())).status).toBe(503);
  expect(providerFetch).not.toHaveBeenCalled();
});

test("invalid or unknown chapters are refused", async () => {
  expect((await POST(post({}, { volume: "bookofmormon", book: "alma", chapter: 0 }))).status).toBe(400);
  expect((await GET(get("volume=bookofmormon&book=alma&chapter=nope"))).status).toBe(400);
  expect((await POST(post({}, { volume: "bookofmormon", book: "alma", chapter: 33 }))).status).toBe(404);
});

test("the public study path cache write is gone", async () => {
  const insights = await import("../convex/chapterInsights");
  expect("upsertChapterInsight" in insights).toBe(false);
});

test("reads a bearer credential strictly", () => {
  const headers = (value?: string) => new Headers(value === undefined ? {} : { authorization: value });
  expect(readBearerCredential(headers())).toEqual({ kind: "none" });
  expect(readBearerCredential(headers(`Bearer ${NATIVE_TOKEN}`))).toEqual({ kind: "bearer", token: NATIVE_TOKEN });
  expect(readBearerCredential(headers(`bearer ${NATIVE_TOKEN}`))).toEqual({ kind: "bearer", token: NATIVE_TOKEN });
  expect(readBearerCredential(headers(""))).toEqual({ kind: "invalid" });
  expect(readBearerCredential(headers("Bearer a.b"))).toEqual({ kind: "invalid" });
  expect(readBearerCredential(headers("Bearer a.b.c=="))).toEqual({ kind: "invalid" });
});
