// A chapter's study paths through the reader's hook, over a fake site: read from the cache without an account, and,
// for a chapter none are cached for, researched as the signed-in account (siteAuth.ts) on its own site only. Signing
// out or into another account while that runs cancels it and its answer is never shown; a timeout, a refused token or
// a failed research can be retried. The site's research and the account's token are fakes: nothing paid runs here.

import { act, renderHook } from "@testing-library/react-native";
import type { ChapterStudyPath } from "@/lib/chapterInsights";
import { SiteAuth, SiteAuthError, publishSiteAuth, resetSiteAuth } from "../src/account/siteAuth";
import { GENERATE_TIMEOUT_MS, clearStudyCaches } from "../src/features/reader/studyData";
import { useChapterStudyPaths } from "../src/features/reader/useChapterStudy";

const SITE = "https://www.versetogether.org";

const PATH: ChapterStudyPath = {
  kind: "cross_reference",
  verse_numbers: [21],
  title: "Faith and knowledge",
  direction: "Compare Hebrews 11:1.",
  why: "Both define faith.",
  look_for: ["hope"],
  sources: [{ title: "Alma 32", url: "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32", format: "article" }],
  scripture_links: [],
};

type Call = { url: string; authorization: string | null; signal: AbortSignal | undefined; body: string };
type Reply = { status: number; body: unknown } | "hang";

let calls: Call[];
/** How the fake site answers: the cache (no Authorization) and research (with one), in order. */
let cacheReplies: Reply[];
let researchReplies: Reply[];
let pending: Array<{ resolve: (response: Response) => void; call: Call }>;

function respond(reply: { status: number; body: unknown }) {
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
}

function fakeFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const call: Call = { url: String(input), authorization: headers.authorization ?? null, signal: init?.signal ?? undefined, body: String(init?.body) };
  calls.push(call);
  const reply = (call.authorization ? researchReplies : cacheReplies).shift() ?? { status: 404, body: { error: "Not found" } };
  if (reply === "hang") {
    return new Promise<Response>((resolve, reject) => {
      pending.push({ resolve, call });
      call.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
    });
  }
  return Promise.resolve(respond(reply));
}

/** A session in secure storage, which the test can replace (another sign-in) or clear (signed out). */
let storedSession: string | null;
let tokens: string[];

function openAccount(owner: string, { token = async () => `jwt-for-${owner}` }: { token?: () => Promise<string | null> } = {}) {
  storedSession = `session-${owner}`;
  const auth = new SiteAuth(
    owner,
    SITE,
    async () => {
      const value = await token();
      if (value) tokens.push(value);
      return value;
    },
    () => storedSession,
    fakeFetch as typeof fetch
  );
  return { auth, close: publishSiteAuth(auth) };
}

async function flush() {
  await act(async () => {
    for (let index = 0; index < 5; index++) await Promise.resolve();
  });
}

beforeEach(() => {
  calls = [];
  cacheReplies = [];
  researchReplies = [];
  pending = [];
  tokens = [];
  storedSession = null;
  clearStudyCaches();
  resetSiteAuth();
  jest.spyOn(globalThis, "fetch").mockImplementation(fakeFetch as typeof fetch);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  resetSiteAuth();
});

describe("study paths without an account", () => {
  it("shows a cached chapter's paths and sends no credential", async () => {
    cacheReplies = [{ status: 200, body: { reference: "Alma 32", paths: [PATH], cached: true } }];
    const { result } = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    await flush();
    expect(result.current).toMatchObject({ status: "ready", paths: [PATH] });
    expect(calls).toEqual([expect.objectContaining({ url: `${SITE}/api/insights/chapter`, authorization: null, body: JSON.stringify({ volume: "bookofmormon", book: "alma", chapter: 32 }) })]);
  });

  it("an uncached chapter is none to show, saying it needs a signed-in reader, and is not researched", async () => {
    cacheReplies = [{ status: 401, body: { error: "Sign in to generate chapter insights." } }];
    const { result } = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    await flush();
    expect(result.current).toMatchObject({ status: "none", reason: "sign-in" });
    expect(calls).toHaveLength(1);
  });
});

describe("study paths researched for the signed-in reader", () => {
  it("asks the cache first, then researches as the account on its own site, showing that it is researching", async () => {
    openAccount("owner-A");
    cacheReplies = [{ status: 401, body: { error: "Sign in to generate chapter insights." } }];
    researchReplies = ["hang"];
    const { result, unmount } = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    await flush();
    expect(result.current.status).toBe("generating");
    expect(calls.map((call) => [call.url, call.authorization])).toEqual([
      [`${SITE}/api/insights/chapter`, null],
      [`${SITE}/api/insights/chapter`, "Bearer jwt-for-owner-A"],
    ]);
    await act(async () => pending[0].resolve(respond({ status: 200, body: { reference: "Alma 32", paths: [PATH], cached: false } })));
    await flush();
    expect(result.current).toMatchObject({ status: "ready", paths: [PATH] });
    await unmount();

    // Kept for this run of the app: coming back to the chapter shows it at once.
    const again = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    expect(again.result.current).toMatchObject({ status: "ready", paths: [PATH] });
    expect(calls).toHaveLength(2);
  });

  it("signing out while researching cancels it and never shows its late answer", async () => {
    const { close } = openAccount("owner-A");
    cacheReplies = [{ status: 401, body: {} }, { status: 401, body: {} }];
    researchReplies = ["hang"];
    const { result } = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    await flush();
    expect(result.current.status).toBe("generating");
    const research = pending[0];

    storedSession = null;
    await act(async () => close());
    await flush();
    expect(research.call.signal?.aborted).toBe(true);
    // Asked again as nobody: none cached, and only a signed-in reader can have it researched.
    expect(result.current).toMatchObject({ status: "none", reason: "sign-in" });
    // The research finishing anyway changes nothing on screen.
    await act(async () => research.resolve(respond({ status: 200, body: { paths: [PATH] } })));
    await flush();
    expect(result.current).toMatchObject({ status: "none", reason: "sign-in" });
  });

  it("switching accounts while researching drops the first account's answer and researches as the new one", async () => {
    openAccount("owner-A");
    cacheReplies = [{ status: 401, body: {} }, { status: 401, body: {} }];
    researchReplies = ["hang", "hang"];
    const { result } = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    await flush();
    const first = pending[0];
    await act(async () => {
      openAccount("owner-B");
    });
    await flush();
    expect(first.call.signal?.aborted).toBe(true);
    expect(pending).toHaveLength(2);
    expect(pending[1].call.authorization).toBe("Bearer jwt-for-owner-B");
    await act(async () => first.resolve(respond({ status: 200, body: { paths: [{ ...PATH, title: "A's answer" }] } })));
    await flush();
    expect(result.current.status).toBe("generating");
    await act(async () => pending[1].resolve(respond({ status: 200, body: { paths: [PATH] } })));
    await flush();
    expect(result.current).toMatchObject({ status: "ready", paths: [PATH] });
  });

  it("an answer that arrives after another session was stored is refused, even before the account is closed", async () => {
    const { auth } = openAccount("owner-A");
    researchReplies = ["hang"];
    const sent = auth.fetch("/api/insights/chapter", { method: "POST", body: "{}" });
    await Promise.resolve();
    await Promise.resolve();
    // A new sign-in stored another session; AccountProvider hasn't closed this one yet.
    storedSession = "session-someone-else";
    pending[0].resolve(respond({ status: 200, body: { paths: [PATH] } }));
    await expect(sent).rejects.toEqual(new SiteAuthError("changed"));
  });

  it("research that takes too long fails with Try again, which asks again", async () => {
    jest.useFakeTimers();
    openAccount("owner-A");
    cacheReplies = [{ status: 401, body: {} }, { status: 401, body: {} }];
    researchReplies = ["hang", { status: 200, body: { paths: [PATH] } }];
    const { result } = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    await flush();
    expect(result.current.status).toBe("generating");
    // Well past the cache's 15 seconds, still researching.
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(result.current.status).toBe("generating");
    await act(async () => {
      jest.advanceTimersByTime(GENERATE_TIMEOUT_MS - 30000);
    });
    await flush();
    expect(result.current).toMatchObject({ status: "failed", message: "Researching this chapter took too long. Try again in a moment." });
    expect(pending[0].call.signal?.aborted).toBe(true);

    await act(async () => result.current.retry());
    await flush();
    expect(result.current).toMatchObject({ status: "ready", paths: [PATH] });
  });

  it("a token the site refuses, or research that fails, can be retried; no token sends nothing", async () => {
    openAccount("owner-A");
    cacheReplies = [{ status: 401, body: {} }, { status: 401, body: {} }];
    researchReplies = [{ status: 401, body: { error: "Sign in to generate chapter insights." } }, { status: 502, body: { error: "Chapter insights could not finish researching." } }];
    const { result } = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    await flush();
    expect(result.current).toMatchObject({ status: "failed", message: expect.stringContaining("couldn't confirm your sign-in") });
    await act(async () => result.current.retry());
    await flush();
    expect(result.current).toMatchObject({ status: "failed", message: "Chapter insights could not finish researching. Try again." });

    await act(async () => {
      resetSiteAuth();
      openAccount("owner-B", { token: async () => null });
    });
    cacheReplies = [{ status: 401, body: {} }];
    const before = calls.length;
    await act(async () => result.current.retry());
    await flush();
    expect(result.current).toMatchObject({ status: "failed", message: "Verse Together couldn't confirm your sign-in. Try again." });
    // The cache was asked; nothing was sent as the account without a token.
    expect(calls.slice(before).map((call) => call.authorization)).toEqual([null]);
  });

  it("leaving the chapter cancels its research", async () => {
    openAccount("owner-A");
    cacheReplies = [{ status: 401, body: {} }];
    researchReplies = ["hang"];
    const { unmount } = await renderHook(() => useChapterStudyPaths("bookofmormon", "alma", 32, true));
    await flush();
    await unmount();
    expect(pending[0].call.signal?.aborted).toBe(true);
  });
});

describe("SiteAuth", () => {
  it("sends the account's token only to its own site's API", async () => {
    const { auth } = openAccount("owner-A");
    for (const path of ["https://evil.example/api/insights/chapter", "//evil.example/api/x", "/api/../auth/x", "/api", "/other", "/api/insights/chapter?x=1"]) {
      await expect(auth.fetch(path, { method: "POST", body: "{}" })).rejects.toThrow("Only the site's own API");
    }
    expect(tokens).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("fetches a fresh token for each request and none once closed", async () => {
    const { auth, close } = openAccount("owner-A");
    researchReplies = [{ status: 200, body: {} }, { status: 200, body: {} }];
    await auth.fetch("/api/insights/chapter", { method: "POST", body: "{}" });
    await auth.fetch("/api/insights/chapter", { method: "POST", body: "{}" });
    expect(tokens).toHaveLength(2);
    close();
    await expect(auth.fetch("/api/insights/chapter", { method: "POST", body: "{}" })).rejects.toEqual(new SiteAuthError("changed"));
    expect(tokens).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });
});
