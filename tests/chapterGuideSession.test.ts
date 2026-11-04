// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CHAPTER_GUIDE_POLL_INTERVAL_MS, createChapterGuideSession } from "../src/features/chapterGuides/chapterGuideSession";
import type { ChapterGuideSelectionState } from "../src/lib/chapterGuideView";

type PendingFetch = {
  url: string;
  method: string;
  signal: AbortSignal;
  respond: (body: unknown, status?: number) => Promise<void>;
};

function stateFor(reference: string, generating = false): ChapterGuideSelectionState {
  return { reference, href: "/chapter-guides/bookofmormon/alma/32", hasGuide: false, resources: [], generating: generating ? { stage: "write", startedAt: 1 } : null, availability: generating ? null : "available" };
}

const pending: PendingFetch[] = [];

function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init?.signal as AbortSignal;
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    pending.push({
      url: String(input),
      method: init?.method ?? "GET",
      signal,
      respond: async (body, status = 200) => {
        resolve(new Response(JSON.stringify(body), { status }));
        await vi.advanceTimersByTimeAsync(0);
      },
    });
  });
}

function session(chapter = 32) {
  const onState = vi.fn();
  const onLoadFailed = vi.fn();
  return { onState, onLoadFailed, current: createChapterGuideSession({ volume: "bookofmormon", book: "alma", chapter }, "21,24", { onState, onLoadFailed }) };
}

beforeEach(() => {
  pending.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(trackedFetch));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("loading a chapter", () => {
  test("a current response is delivered, and its URL names the chapter", async () => {
    const { current, onState } = session();
    void current.load();
    expect(pending[0]!.url).toBe("/api/chapter-guides?volume=bookofmormon&book=alma&chapter=32&verses=21%2C24");
    await pending[0]!.respond(stateFor("Alma 32"));
    expect(onState).toHaveBeenCalledWith(stateFor("Alma 32"));
  });

  test("a response that arrives after the chapter changes is dropped and its request aborted", async () => {
    const old = session(32);
    void old.current.load();
    old.current.dispose();
    expect(pending[0]!.signal.aborted).toBe(true);
    await pending[0]!.respond(stateFor("Alma 32"));
    expect(old.onState).not.toHaveBeenCalled();
    expect(old.onLoadFailed).not.toHaveBeenCalled();

    const next = session(33);
    void next.current.load();
    await pending[1]!.respond(stateFor("Alma 33"));
    expect(next.onState).toHaveBeenCalledWith(stateFor("Alma 33"));
    expect(old.onState).not.toHaveBeenCalled();
  });

  test("an older response can't replace a newer one", async () => {
    const { current, onState } = session();
    void current.load();
    void current.load();
    await pending[1]!.respond(stateFor("newer"));
    await pending[0]!.respond(stateFor("older"));
    expect(onState.mock.calls.map(([state]) => state.reference)).toEqual(["newer"]);
  });

  test("a failed load is reported only while it's still current", async () => {
    const { current, onLoadFailed } = session();
    void current.load();
    void current.load();
    await pending[0]!.respond({}, 500);
    expect(onLoadFailed).not.toHaveBeenCalled();
    await pending[1]!.respond({}, 500);
    expect(onLoadFailed).toHaveBeenCalledTimes(1);
  });
});

describe("polling", () => {
  test("it runs only while a guide is being written, and stops once it's done", async () => {
    const { current, onState } = session();
    void current.load();
    await pending[0]!.respond(stateFor("Alma 32", true));
    await vi.advanceTimersByTimeAsync(CHAPTER_GUIDE_POLL_INTERVAL_MS);
    expect(pending).toHaveLength(2);
    await pending[1]!.respond(stateFor("Alma 32", true));
    await vi.advanceTimersByTimeAsync(CHAPTER_GUIDE_POLL_INTERVAL_MS);
    expect(pending).toHaveLength(3);
    await pending[2]!.respond(stateFor("Alma 32"));
    await vi.advanceTimersByTimeAsync(CHAPTER_GUIDE_POLL_INTERVAL_MS * 3);
    expect(pending).toHaveLength(3);
    expect(onState).toHaveBeenCalledTimes(3);
  });

  test("leaving the chapter clears the timer and aborts a poll in flight", async () => {
    const { current, onState } = session();
    void current.load();
    await pending[0]!.respond(stateFor("Alma 32", true));
    await vi.advanceTimersByTimeAsync(CHAPTER_GUIDE_POLL_INTERVAL_MS);
    expect(pending).toHaveLength(2);
    current.dispose();
    expect(pending[1]!.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await pending[1]!.respond(stateFor("Alma 32", true));
    await vi.advanceTimersByTimeAsync(CHAPTER_GUIDE_POLL_INTERVAL_MS * 3);
    expect(pending).toHaveLength(2);
    expect(onState).toHaveBeenCalledTimes(1);
  });

  test("polling doesn't restart when a slow response lands after the chapter changed", async () => {
    const { current } = session();
    void current.load();
    current.dispose();
    await pending[0]!.respond(stateFor("Alma 32", true));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("requesting a guide", () => {
  test("it sends this chapter, then reloads its state", async () => {
    const { current, onState } = session();
    const request = current.request();
    expect(pending[0]).toMatchObject({ method: "POST", url: "/api/chapter-guides" });
    await pending[0]!.respond({ status: "started" }, 202);
    await pending[1]!.respond(stateFor("Alma 32", true));
    expect(await request).toEqual({ error: null });
    expect(onState).toHaveBeenCalledWith(stateFor("Alma 32", true));
    current.dispose();
  });

  test("a refusal's message is returned along with the fresh state", async () => {
    const { current, onState } = session();
    const request = current.request();
    await pending[0]!.respond({ error: "You’ve reached your limit." }, 429);
    await pending[1]!.respond(stateFor("Alma 32"));
    expect(await request).toEqual({ error: "You’ve reached your limit." });
    expect(onState).toHaveBeenCalledTimes(1);
  });

  test("a request still running when the chapter changes shows nothing and starts no reload", async () => {
    const { current, onState, onLoadFailed } = session();
    const request = current.request();
    current.dispose();
    expect(pending[0]!.signal.aborted).toBe(true);
    await pending[0]!.respond({ status: "started" }, 202);
    expect(await request).toBeNull();
    expect(pending).toHaveLength(1);
    expect(onState).not.toHaveBeenCalled();
    expect(onLoadFailed).not.toHaveBeenCalled();
  });

  test("a request that finishes just before the chapter changes can't deliver its reload", async () => {
    const { current, onState } = session();
    const request = current.request();
    await pending[0]!.respond({ status: "started" }, 202);
    expect(pending).toHaveLength(2);
    current.dispose();
    await pending[1]!.respond(stateFor("Alma 32", true));
    expect(await request).toBeNull();
    expect(onState).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
