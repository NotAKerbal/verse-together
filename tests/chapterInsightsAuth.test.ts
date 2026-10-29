// @vitest-environment node
// Who may make /api/insights/chapter research a chapter: anyone reads the cache, but only a reader Convex verifies
// (the browser's cookie session, or the native app's bearer Convex token) starts the paid research call.
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

const { POST } = await import("../src/app/api/insights/chapter/route");
const { readBearerCredential } = await import("../src/lib/requestViewer");

// A JWT-shaped string; its contents mean nothing here. Convex alone decides whether it is valid.
const NATIVE_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl";
const COOKIE_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJjb29raWUifQ.c2lnbmF0dXJl";
const VIEWER = { appUserId: "owner-A", isAdmin: false, displayName: "Ada", avatarUrl: null, legacyAccount: false };

const PATH = {
  kind: "cross_reference",
  verse_numbers: [21],
  title: "Faith and knowledge",
  direction: "Compare Hebrews 11:1.",
  why: "Both define faith.",
  look_for: ["hope for things not seen"],
  source_urls: ["https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32"],
};
const OPENAI_REPLY = {
  output: [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: JSON.stringify({ paths: [PATH] }),
          annotations: [{ type: "url_citation", url: PATH.source_urls[0], title: "Alma 32" }],
        },
      ],
    },
  ],
};

const openAi = vi.fn();

function request(headers: Record<string, string> = {}, body: unknown = { volume: "bookofmormon", book: "alma", chapter: 32 }) {
  return new NextRequest("https://www.versetogether.org/api/insights/chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Convex as the deployment answers: users:viewer is the viewer for a token it accepts, and refuses any other. */
function convexAccepts(tokens: Record<string, typeof VIEWER | null>, cached: unknown = null) {
  convex.query.mockImplementation(async (name: string, _args: unknown, token?: string) => {
    if (name === "chapterInsights:getChapterInsight") return cached;
    if (name === "users:viewer") {
      if (!token || !(token in tokens)) throw new Error("Could not verify token");
      return tokens[token];
    }
    throw new Error(`unexpected ${name}`);
  });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  convex.query.mockReset();
  convex.mutation.mockReset().mockResolvedValue({ ok: true });
  cookie.getServerViewer.mockReset().mockResolvedValue({ viewer: null, token: null });
  openAi.mockReset().mockImplementation(async () => new Response(JSON.stringify(OPENAI_REPLY), { status: 200 }));
  vi.stubGlobal("fetch", openAi);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a cached chapter is read without any account", async () => {
  convexAccepts({}, {
    reference: "Alma 32",
    // The route recomputes the scripture hash, so the stored one must match the chapter's text.
    scriptureHash: (await import("node:crypto")).createHash("sha256").update("21. Faith is not to have a perfect knowledge of things.\n27. Experiment upon my words.").digest("hex"),
    promptVersion: CHAPTER_INSIGHT_PROMPT_VERSION,
    paths: [{ ...PATH, sources: [] }],
    generatedAt: Date.UTC(2026, 9, 1),
    signature: "sig",
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ reference: "Alma 32", cached: true });
  expect(cookie.getServerViewer).not.toHaveBeenCalled();
  expect(openAi).not.toHaveBeenCalled();
});

test("an uncached chapter is not researched for an anonymous reader", async () => {
  convexAccepts({});
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Sign in to generate chapter insights." });
  expect(openAi).not.toHaveBeenCalled();
});

test("the native app's verified Convex token researches the chapter and caches it as that reader", async () => {
  convexAccepts({ [NATIVE_TOKEN]: VIEWER });
  const response = await POST(request({ Authorization: `Bearer ${NATIVE_TOKEN}` }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ reference: "Alma 32", cached: false });
  expect(body.paths).toHaveLength(1);
  // Verified by Convex with the very token sent, never by reading it here, and no cookie lookup was made.
  expect(convex.query).toHaveBeenCalledWith("users:viewer", {}, NATIVE_TOKEN);
  expect(cookie.getServerViewer).not.toHaveBeenCalled();
  expect(openAi).toHaveBeenCalledTimes(1);
  expect(String(openAi.mock.calls[0][0])).toBe("https://api.openai.com/v1/responses");
  // The token only ever goes to Convex (as the cache write's caller), never to the research service.
  expect(JSON.stringify(openAi.mock.calls[0][1])).not.toContain(NATIVE_TOKEN);
  expect(convex.mutation).toHaveBeenCalledWith("chapterInsights:upsertChapterInsight", expect.objectContaining({ volume: "bookofmormon", book: "alma", chapter: 32 }), NATIVE_TOKEN);
});

test("a token Convex refuses (expired, revoked, forged or unlinked) cannot start research", async () => {
  // Expired or forged: Convex fails the call. Revoked session or no app user: users:viewer answers null.
  convexAccepts({ [NATIVE_TOKEN]: null });
  for (const token of ["eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.Zm9yZ2Vk", NATIVE_TOKEN]) {
    const response = await POST(request({ Authorization: `Bearer ${token}` }));
    expect(response.status).toBe(401);
  }
  expect(openAi).not.toHaveBeenCalled();
  expect(convex.mutation).not.toHaveBeenCalled();
});

test("a malformed Authorization header is signed out and never reaches Convex or the cookie", async () => {
  convexAccepts({});
  cookie.getServerViewer.mockResolvedValue({ viewer: VIEWER, token: COOKIE_TOKEN });
  for (const header of ["Bearer", "Bearer not-a-jwt", `Basic ${NATIVE_TOKEN}`, `Bearer ${NATIVE_TOKEN} extra`, `Bearer ${"a".repeat(5000)}.${"b".repeat(5000)}.c`]) {
    const response = await POST(request({ Authorization: header }));
    expect(response.status).toBe(401);
  }
  expect(convex.query.mock.calls.filter(([name]) => name === "users:viewer")).toEqual([]);
  // A bad header is never rescued by a cookie sent beside it.
  expect(cookie.getServerViewer).not.toHaveBeenCalled();
  expect(openAi).not.toHaveBeenCalled();
});

test("the browser's cookie session works as before", async () => {
  convexAccepts({});
  cookie.getServerViewer.mockResolvedValue({ viewer: { appUserId: "owner-B", isAdmin: false }, token: COOKIE_TOKEN });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(cookie.getServerViewer).toHaveBeenCalledTimes(1);
  expect(openAi).toHaveBeenCalledTimes(1);
  expect(convex.mutation).toHaveBeenCalledWith("chapterInsights:upsertChapterInsight", expect.anything(), COOKIE_TOKEN);
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
