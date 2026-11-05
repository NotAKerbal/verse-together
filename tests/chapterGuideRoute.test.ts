// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const convex = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
const cookie = vi.hoisted(() => ({ getServerViewer: vi.fn() }));
vi.mock("@/lib/convexHttp", () => ({ convexQuery: convex.query, convexMutation: convex.mutation }));
vi.mock("@/lib/auth-server", () => ({ getServerViewer: cookie.getServerViewer }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/lib/ldsLocalData.server", () => ({
  getLocalLdsChapter: async (volume: string, book: string, chapter: number) => {
    if (volume === "bookofmormon" && book === "alma" && chapter === 32) {
      return { reference: "Alma 32", verses: [{ verse: 21, text: "Faith is not to have a perfect knowledge." }, { verse: 22, text: "Words." }] };
    }
    if (volume === "newtestament" && book === "hebrews" && chapter === 11) {
      return { reference: "Hebrews 11", verses: Array.from({ length: 40 }, (_, index) => ({ verse: index + 1, text: "x" })) };
    }
    return null;
  },
}));

const { GET, POST } = await import("../src/app/api/chapter-guides/route");
const { default: ChapterGuideSection } = await import("../src/features/chapterGuides/ChapterGuideSection");
const { crossReferenceView } = await import("../src/lib/chapterGuideView");

const ORIGIN = "https://www.versetogether.org";
const SECRET = "service-secret-value";
const TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJjb29raWUifQ.c2lnbmF0dXJl";
const BODY = { volume: "bookofmormon", book: "alma", chapter: 32 };
const providerFetch = vi.fn();

function post(headers: Record<string, string> = { origin: ORIGIN, host: "www.versetogether.org" }, body: unknown = BODY) {
  return new NextRequest(`${ORIGIN}/api/chapter-guides`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(query = "volume=bookofmormon&book=alma&chapter=32") {
  return new NextRequest(`${ORIGIN}/api/chapter-guides?${query}`);
}

const CONTENT = {
  title: "Faith as an experiment",
  overview: ["<img src=x onerror=alert(1)> Overview text."],
  historical_context: { paragraphs: ["Context."], source_ids: ["S1"] },
  significant_insights: [{ title: "Insight", verse_start: 21, verse_end: 21, paragraphs: ["Insight text."], source_ids: [] }],
  passages: [
    {
      verse_start: 21,
      verse_end: 21,
      heading: "Faith defined",
      original_meaning: ["Meaning."],
      latter_day_saint_application: ["Application."],
      cross_references: [
        { reference: "Hebrews 11:1", volume: "newtestament", book: "hebrews", chapter: 11, verse_start: 1, verse_end: 3, note: "Compare." },
        { reference: "Hebrews 99:1", volume: "newtestament", book: "hebrews", chapter: 99, verse_start: 1, verse_end: 1, note: "No such chapter." },
      ],
      questions: ["What is faith?"],
      source_ids: ["S1"],
    },
    { verse_start: 22, verse_end: 22, heading: "Words", original_meaning: ["Meaning."], latter_day_saint_application: [], cross_references: [], questions: ["Why?"], source_ids: [] },
  ],
  source_use: [{ source_id: "S1", use: "Background." }],
  limitations: ["Dates are uncertain."],
};
const STORED_GUIDE = {
  reference: "Alma 32",
  content: CONTENT,
  sources: [{ id: "S1", title: "Manual", url: "https://www.churchofjesuschrist.org/study/manual", use: "Background." }],
  provenance: { researchModel: "gpt-5.6-luna", writerModel: "claude-opus-5-5", reviewModel: "gpt-5.6-terra", promptVersion: 1, requiredCorrections: 1, repaired: true, reviewSummary: "internal", unverifiable: [] },
  generatedAt: 1,
};

beforeEach(() => {
  vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", SECRET);
  convex.query.mockReset();
  convex.mutation.mockReset().mockResolvedValue({ status: "started" });
  cookie.getServerViewer.mockReset().mockResolvedValue({ viewer: { appUserId: "owner-a", isAdmin: false }, token: TOKEN });
  providerFetch.mockReset();
  vi.stubGlobal("fetch", providerFetch);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reading", () => {
  test("anyone reads a saved guide without an account, a mutation, or a provider", async () => {
    convex.query.mockResolvedValue({ guide: STORED_GUIDE, generating: null, availability: null });
    const response = await GET(get());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.guide.title).toBe("Faith as an experiment");
    expect(body.guide.provenance).not.toHaveProperty("reviewSummary");
    expect(cookie.getServerViewer).not.toHaveBeenCalled();
    expect(convex.mutation).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  test("reading a chapter with no guide starts nothing", async () => {
    convex.query.mockResolvedValue({ guide: null, generating: null, availability: "available" });
    const body = await (await GET(get())).json();
    expect(body).toMatchObject({ reference: "Alma 32", guide: null, availability: "available" });
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  test("a site without the service secret doesn't offer generation that its own POST would refuse", async () => {
    vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", "");
    convex.query.mockResolvedValue({ guide: null, generating: null, availability: "available" });
    expect(await (await GET(get())).json()).toMatchObject({ guide: null, availability: "not_configured" });
    convex.query.mockResolvedValue({ guide: null, generating: { stage: "write", startedAt: 1 }, availability: null });
    expect(await (await GET(get())).json()).toMatchObject({ generating: { stage: "write" }, availability: null });
    convex.query.mockResolvedValue({ guide: STORED_GUIDE, generating: null, availability: null });
    expect((await (await GET(get())).json()).guide.title).toBe("Faith as an experiment");
  });

  test("a guide held for human review reads as that everywhere, with no draft, even with no secret on the site", async () => {
    const query = "volume=bookofmormon&book=alma&chapter=32&verses=21";
    convex.query.mockResolvedValue({ guide: null, generating: null, availability: "needs_review", cooldown: null });
    expect(await (await GET(get())).json()).toEqual({ reference: "Alma 32", guide: null, generating: null, availability: "needs_review", cooldown: null });
    expect(await (await GET(get(query))).json()).toMatchObject({ hasGuide: false, resources: [], availability: "needs_review" });
    vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", "");
    expect(await (await GET(get(query))).json()).toMatchObject({ hasGuide: false, availability: "needs_review" });
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  test("cooldown details reach a selection, and only during a cooldown", async () => {
    const cooldown = { retryAt: 1000, failedStage: "review" };
    const query = "volume=bookofmormon&book=alma&chapter=32&verses=21";
    convex.query.mockResolvedValue({ guide: null, generating: null, availability: "cooldown", cooldown });
    expect(await (await GET(get(query))).json()).toMatchObject({ availability: "cooldown", cooldown });
    vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", "");
    expect(await (await GET(get(query))).json()).toMatchObject({ availability: "not_configured", cooldown: null });
  });

  test("a backend that doesn't report cooldown details still reads as a cooldown", async () => {
    convex.query.mockResolvedValue({ guide: null, generating: null, availability: "cooldown" });
    expect(await (await GET(get())).json()).toMatchObject({ availability: "cooldown", cooldown: null });
  });

  test("only cross-references that exist in the local scriptures become links", async () => {
    convex.query.mockResolvedValue({ guide: STORED_GUIDE, generating: null, availability: null });
    const body = await (await GET(get())).json();
    const [resolved, missing] = body.guide.passages[0].cross_references;
    expect(resolved).toMatchObject({ href: "/browse/newtestament/hebrews/11#v-1", rangeEnd: "3" });
    expect(missing).toMatchObject({ href: null, rangeEnd: null });
    expect(crossReferenceView({ ...CONTENT.passages[0]!.cross_references[0]!, verse_end: 41 }, 40).href).toBeNull();
  });

  test("invalid and unknown chapters are refused, and a backend failure is not a 200", async () => {
    expect((await GET(get("volume=../x&book=alma&chapter=32"))).status).toBe(400);
    expect((await GET(get("volume=bookofmormon&book=alma&chapter=33"))).status).toBe(404);
    convex.query.mockRejectedValue(new Error("down"));
    expect((await GET(get())).status).toBe(503);
  });
});

describe("requesting", () => {
  test("a signed-out request is refused before reaching Convex", async () => {
    cookie.getServerViewer.mockResolvedValue({ viewer: null, token: null });
    expect((await POST(post())).status).toBe(401);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  test("a cross-site browser request can't spend a signed-in reader's allowance", async () => {
    const crossOrigin = await POST(post({ origin: "https://evil.example", host: "www.versetogether.org" }));
    expect(crossOrigin.status).toBe(403);
    const fetchSite = await POST(post({ "sec-fetch-site": "cross-site" }));
    expect(fetchSite.status).toBe(403);
    const malformed = await POST(post({ origin: "not a url", host: "www.versetogether.org" }));
    expect(malformed.status).toBe(403);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  test("the server sends its own scripture text and the secret, as the signed-in reader", async () => {
    const response = await POST(post());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "started" });
    const [name, args, token] = convex.mutation.mock.calls[0]!;
    expect(name).toBe("chapterGuides:requestGeneration");
    expect(token).toBe(TOKEN);
    expect(args).toMatchObject({ ...BODY, serviceSecret: SECRET, reference: "Alma 32" });
    expect(args.verses).toEqual([{ verse: 21, text: "Faith is not to have a perfect knowledge." }, { verse: 22, text: "Words." }]);
    expect(args.scriptureHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a request body can't supply its own scripture text or reference", async () => {
    await POST(post(undefined, { ...BODY, verses: [{ verse: 1, text: "forged" }], reference: "forged", scriptureHash: "forged", serviceSecret: "forged" }));
    const [, args] = convex.mutation.mock.calls[0]!;
    expect(JSON.stringify(args)).not.toContain("forged");
  });

  test("the secret never appears in a response or a log", async () => {
    convex.mutation.mockRejectedValue(new Error("Server Error"));
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(SECRET);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(SECRET);
  });

  test("with no secret on the server, nothing is attempted", async () => {
    vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", "");
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: "not_configured" });
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  test.each([
    ["budget_exhausted", 503],
    ["paused", 503],
    ["user_limit", 429],
    ["daily_limit", 429],
    ["cooldown", 409],
    ["busy", 409],
    ["needs_review", 409],
  ])("a refusal for %s becomes status %i with a readable message", async (reason, status) => {
    convex.mutation.mockResolvedValue({ status: "unavailable", reason });
    const response = await POST(post());
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.reason).toBe(reason);
    expect(body.error).toEqual(expect.any(String));
  });

  test("invalid input is refused", async () => {
    expect((await POST(post(undefined, { volume: "bookofmormon", book: "alma", chapter: "32" }))).status).toBe(400);
    expect((await POST(post(undefined, { volume: "BOOK OF MORMON", book: "alma", chapter: 32 }))).status).toBe(400);
    expect((await POST(post(undefined, { ...BODY, chapter: 33 }))).status).toBe(404);
    expect(convex.mutation).not.toHaveBeenCalled();
  });
});

describe("choosing verses", () => {
  async function selected(verses: string) {
    convex.query.mockResolvedValue({ guide: STORED_GUIDE, generating: null, availability: null });
    const response = await GET(get(`volume=bookofmormon&book=alma&chapter=32&verses=${verses}`));
    expect(response.status).toBe(200);
    return await response.json();
  }

  test("a selection returns only the groups it overlaps, and nothing starts a job", async () => {
    const body = await selected("22");
    expect(body.resources.map((item: { reference: string }) => item.reference)).toEqual(["Alma 32:22"]);
    expect(body).not.toHaveProperty("guide");
    expect(body.hasGuide).toBe(true);
    expect(convex.mutation).not.toHaveBeenCalled();
    expect(cookie.getServerViewer).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  test("a selection that overlaps nothing still points to the guide", async () => {
    const body = await selected("150");
    expect(body.resources).toEqual([]);
    expect(body.hasGuide).toBe(true);
    expect(body.href).toBe("/chapter-guides/bookofmormon/alma/32");
  });

  test("the same guide is read for each selection", async () => {
    await selected("21");
    await selected("22");
    await selected("21,22");
    const calls = convex.query.mock.calls;
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map(([name, args]) => JSON.stringify([name, args]))).size).toBe(1);
  });

  test.each(["", "0", "200", "1,x", "1;2"])("a malformed selection %j is refused", async (verses) => {
    const response = await GET(get(`volume=bookofmormon&book=alma&chapter=32&verses=${verses}`));
    expect(response.status).toBe(400);
    expect(convex.query).not.toHaveBeenCalled();
  });

  test("hostname-only titles become labels read from the URL", async () => {
    convex.query.mockResolvedValue({
      guide: { ...STORED_GUIDE, sources: [{ id: "S1", title: "www.churchofjesuschrist.org", url: "https://www.churchofjesuschrist.org/study/scriptures/gs/zedekiah?lang=eng", use: "x" }] },
      generating: null,
      availability: null,
    });
    const body = await (await GET(get())).json();
    expect(body.guide.sources[0].title).toBe("Guide to the Scriptures: Zedekiah");
  });
});

describe("the panel's chapter guide section", () => {
  const selection = (state: object | null, overrides: object = {}) => ({
    state: state as never,
    stateLoadedAt: null,
    loadFailed: false,
    requesting: false,
    requestError: null,
    request: async () => {},
    ...overrides,
  });

  test("a saved guide shows only its matching groups, with a link into the guide", async () => {
    convex.query.mockResolvedValue({ guide: STORED_GUIDE, generating: null, availability: null });
    const state = await (await GET(get("volume=bookofmormon&book=alma&chapter=32&verses=22"))).json();
    const html = renderToStaticMarkup(createElement(ChapterGuideSection, { guide: selection(state), previewsPassages: true }));
    expect(html).toContain("Words");
    expect(html).not.toContain("Faith defined");
    expect(html).not.toContain("Historical context");
    expect(html).not.toContain("Insight text.");
    expect(html).toContain('href="/chapter-guides/bookofmormon/alma/32#passage-22-22"');
    expect(html).toContain("Open chapter guide");
    expect(html).toContain("Chapter guide");
    expect(html).not.toContain("AI-generated");
    expect(html).not.toContain("claude-opus-5-5");
    expect(html).not.toContain("gpt-5.6");
  });

  test("no match still offers the guide", () => {
    const state = { reference: "Alma 32", href: "/chapter-guides/bookofmormon/alma/32", hasGuide: true, resources: [], generating: null, availability: null };
    const html = renderToStaticMarkup(createElement(ChapterGuideSection, { guide: selection(state), previewsPassages: true }));
    expect(html).toContain("has no section for these verses");
    expect(html).toContain('href="/chapter-guides/bookofmormon/alma/32"');
    expect(html).not.toContain("AI-generated");
  });

  test("while a guide is being written, the panel shows only the message", () => {
    const state = { reference: "Alma 32", href: "/chapter-guides/bookofmormon/alma/32", hasGuide: false, resources: [], generating: { stage: "writing", startedAt: 1 }, availability: null };
    const html = renderToStaticMarkup(createElement(ChapterGuideSection, { guide: selection(state), previewsPassages: true }));
    expect(html).toContain("A guide for Alma 32 is being written");
    expect(html).not.toContain("AI-generated");
    expect(html).not.toContain(">Chapter guide<");
  });

  test("while a guide is being written, the panel shows its real stage in a progress bar", () => {
    const state = { reference: "Alma 32", href: "/chapter-guides/bookofmormon/alma/32", hasGuide: false, resources: [], generating: { stage: "review", startedAt: 0 }, availability: null };
    const html = renderToStaticMarkup(createElement(ChapterGuideSection, { guide: selection(state, { stateLoadedAt: 5 * 60_000 }), previewsPassages: true }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Step 3 of 3: Reviewing the draft");
    expect(html).toContain("Started 5 minutes ago.");
  });

  test("during a cooldown, the panel says when it can be requested and offers no button", () => {
    const state = { reference: "Alma 32", href: "/chapter-guides/bookofmormon/alma/32", hasGuide: false, resources: [], generating: null, availability: "cooldown", cooldown: { retryAt: 9 * 60 * 60_000, failedStage: "write" } };
    const html = renderToStaticMarkup(createElement(ChapterGuideSection, { guide: selection(state, { stateLoadedAt: 0, requestError: "A recent attempt at this guide didn’t finish. It can be requested again later." }), previewsPassages: true }));
    expect(html).toContain("stopped during writing");
    expect(html).toContain("in about 9 hours");
    expect(html).not.toContain("role=\"alert\"");
    expect(html).not.toContain("<button");
  });

  test("a guide held for human review gets the warm message, no button, and no timing", () => {
    const state = { reference: "Alma 32", href: "/chapter-guides/bookofmormon/alma/32", hasGuide: false, resources: [], generating: null, availability: "needs_review", cooldown: null };
    const html = renderToStaticMarkup(createElement(ChapterGuideSection, { guide: selection(state, { stateLoadedAt: 0, requestError: "This one needs a little additional human review. You can keep reading the chapter and its other resources." }), previewsPassages: true }));
    expect(html).toContain("This one needs a little additional human review.");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/in about|soon|tomorrow|hours?\b|minutes?\b/i);
  });

  test("an older backend's cooldown with no details keeps the plain message", () => {
    const state = { reference: "Alma 32", href: "/chapter-guides/bookofmormon/alma/32", hasGuide: false, resources: [], generating: null, availability: "cooldown" };
    const html = renderToStaticMarkup(createElement(ChapterGuideSection, { guide: selection(state, { stateLoadedAt: 0 }), previewsPassages: true }));
    expect(html).toContain("A recent attempt at this guide didn’t finish");
  });

  test("with no guide, a signed-out reader is sent to sign in, and nothing offers to generate", () => {
    const state = { reference: "Alma 32", href: "/chapter-guides/bookofmormon/alma/32", hasGuide: false, resources: [], generating: null, availability: "available" };
    const html = renderToStaticMarkup(createElement(ChapterGuideSection, { guide: selection(state), previewsPassages: true }));
    expect(html).toContain("no chapter guide for Alma 32 yet");
    expect(html).toContain("Sign in");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("AI-generated");
  });
});
