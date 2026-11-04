// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  budgetPeriodKey,
  jobReservationMicros,
  MAX_RESEARCH_PACKET_BYTES,
  MAX_USER_JOBS_PER_DAY,
  RESERVATION_MARGIN_MICROS,
  STAGE_MAX_ATTEMPTS,
  stageMaxCostMicros,
  utf8Bytes,
} from "../convex/chapterGuideBudget";
import * as chapterGuides from "../convex/chapterGuides";
import * as chapterGuideWorker from "../convex/chapterGuideWorker";
import { type Backend, newBackend, signInAs } from "./convexAuthHarness";

const SECRET = "service-secret-value";
const OPENAI_KEY = "openai-test-key";
const ANTHROPIC_KEY = "anthropic-test-key";
const SOURCE_URL = "https://www.churchofjesuschrist.org/study/manual/example";
const VERSES = [
  { verse: 1, text: "And it came to pass that the people gathered together in the land." },
  { verse: 2, text: "And they did hearken unto the words of the prophet with gladness." },
  { verse: 3, text: "And there was peace among them all the days of their lives." },
];
const CHAPTER_BYTES = utf8Bytes(VERSES.map((verse) => `${verse.verse}. ${verse.text}`).join("\n"));

const words = (count: number) => Array(count).fill("word").join(" ");
const GUIDE = {
  title: "A guide",
  overview: [words(200)],
  historical_context: { paragraphs: [words(200)], source_ids: ["S1"] },
  significant_insights: [
    { title: "One", verse_start: 1, verse_end: 1, paragraphs: [words(150)], source_ids: [] },
    { title: "Two", verse_start: 2, verse_end: 3, paragraphs: [words(150)], source_ids: ["S1"] },
  ],
  passages: [
    {
      verse_start: 1,
      verse_end: 2,
      heading: "Gathering",
      original_meaning: [words(250)],
      latter_day_saint_application: [words(100)],
      cross_references: [],
      questions: ["What does gathering ask of them?"],
      source_ids: ["S1"],
    },
    {
      verse_start: 3,
      verse_end: 3,
      heading: "Peace",
      original_meaning: [words(250)],
      latter_day_saint_application: [],
      cross_references: [],
      questions: ["What made peace last?"],
      source_ids: [],
    },
  ],
  source_use: [{ source_id: "S1", use: "Background on gathering." }],
  limitations: ["No person reviewed this guide."],
};
const RESEARCH_NOTES = {
  notes: [{ kind: "historical_context", verse_start: 1, verse_end: 2, claim: "Background.", attribution: "The Church", source_urls: [SOURCE_URL] }],
  unresolved: [],
};
const CLEAN_REVIEW = { summary: "No blocking issues.", required_corrections: [], optional_improvements: [], unverifiable: ["Dates."] };

function openAiResponse(body: unknown, { searchCalls = 0, input = 1000, output = 500 } = {}) {
  return new Response(
    JSON.stringify({
      status: "completed",
      usage: { input_tokens: input, output_tokens: output, input_tokens_details: { cached_tokens: 0 } },
      output: [
        ...Array.from({ length: searchCalls }, () => ({ type: "web_search_call", action: { sources: [{ url: SOURCE_URL, title: "Example manual" }] } })),
        { type: "message", content: [{ type: "output_text", text: JSON.stringify(body), annotations: [] }] },
      ],
    }),
    { status: 200 }
  );
}

function claudeResponse(body: unknown, { input = 2000, output = 1000, stopReason = "end_turn" } = {}) {
  const events = [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: input, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify(body) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: output } },
    { type: "message_stop" },
  ];
  const text = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

type ProviderCall = { provider: "openai" | "anthropic"; body: Record<string, unknown>; headers: Headers };

function stubProviders(handlers: { openai: (call: ProviderCall, index: number) => Response; anthropic: (call: ProviderCall, index: number) => Response }) {
  const calls: ProviderCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : "{}");
    const call: ProviderCall = {
      provider: url.includes("api.openai.com") ? "openai" : "anthropic",
      body: JSON.parse(String(raw)) as Record<string, unknown>,
      headers: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
    };
    calls.push(call);
    const index = calls.filter((item) => item.provider === call.provider).length - 1;
    return call.provider === "openai" ? handlers.openai(call, index) : handlers.anthropic(call, index);
  }));
  return calls;
}

function happyProviders() {
  return stubProviders({
    openai: (call) => (call.body.tools ? openAiResponse(RESEARCH_NOTES, { searchCalls: 2 }) : openAiResponse(CLEAN_REVIEW)),
    anthropic: () => claudeResponse(GUIDE),
  });
}

function chapterArgs(chapter = 1) {
  return { volume: "bookofmormon", book: "alma", chapter, reference: `Alma ${chapter}`, scriptureHash: `hash-${chapter}`, verses: VERSES };
}

function stateArgs(chapter = 1) {
  return { volume: "bookofmormon", book: "alma", chapter, scriptureHash: `hash-${chapter}`, verseCount: VERSES.length, chapterBytes: CHAPTER_BYTES };
}

async function setSettings(t: Backend, patch: { paused?: boolean; monthlyCapMicros?: number } = {}) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db.query("chapterGuideSettings").first();
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("chapterGuideSettings", { key: "global", paused: false, consecutiveFailures: 0, updatedAt: now, ...patch });
  });
}

async function readPeriod(t: Backend) {
  return await t.run(async (ctx) => await ctx.db.query("chapterGuideBudgetPeriods").first());
}

async function allJobs(t: Backend) {
  return await t.run(async (ctx) => await ctx.db.query("chapterGuideJobs").collect());
}

async function allAttempts(t: Backend) {
  return await t.run(async (ctx) => await ctx.db.query("chapterGuideAttempts").collect());
}

async function setSpentMicros(t: Backend, spentMicros: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("chapterGuideBudgetPeriods", { periodKey: budgetPeriodKey(Date.now()), spentMicros, reservedMicros: 0, updatedAt: Date.now() });
  });
}

const RESERVATION = jobReservationMicros(VERSES.length, CHAPTER_BYTES);
const RESEARCH_MAX = stageMaxCostMicros("research", VERSES.length, CHAPTER_BYTES);
const CAP = 100_000_000;
const REPORTED_USAGE = { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 500, webSearchCalls: 0 };
const NO_REPAIR = { overview: null, historical_context: null, significant_insights: [], passages: [], limitations: null };
const PASSAGE_CORRECTION = { target: "passage:3-3", category: "factual", issue: "Wrong.", evidence: "Verse 3." };
const REPAIRED_PASSAGE = { ...GUIDE.passages[1], heading: "Peace, corrected" };

function correctionsReview(corrections: unknown[] = [PASSAGE_CORRECTION]) {
  return { summary: "Needs work.", required_corrections: corrections, optional_improvements: [], unverifiable: [] };
}

function reviewedProviders(args: {
  review?: (index: number) => Response;
  recheck?: (index: number) => Response;
  repair?: () => Response;
}) {
  let reviewCalls = 0;
  let recheckCalls = 0;
  return stubProviders({
    openai: (call) => {
      if (call.body.tools) return openAiResponse(RESEARCH_NOTES, { searchCalls: 1 });
      if (String(call.body.instructions).includes("previous_required_corrections")) {
        recheckCalls += 1;
        return args.recheck ? args.recheck(recheckCalls - 1) : openAiResponse({ ...CLEAN_REVIEW, summary: "All fixed." });
      }
      reviewCalls += 1;
      return args.review ? args.review(reviewCalls - 1) : openAiResponse(correctionsReview());
    },
    anthropic: (_call, index) => {
      if (index === 0) return claudeResponse(GUIDE);
      return args.repair ? args.repair() : claudeResponse({ ...NO_REPAIR, passages: [REPAIRED_PASSAGE] });
    },
  });
}

async function periodFor(backend: Backend, periodKey: string) {
  return await backend.run(async (ctx) =>
    await ctx.db.query("chapterGuideBudgetPeriods").withIndex("by_period", (q) => q.eq("periodKey", periodKey)).unique()
  );
}

async function expectReservationsBalanced(backend: Backend) {
  const { periods, jobs, attempts } = await backend.run(async (ctx) => ({
    periods: await ctx.db.query("chapterGuideBudgetPeriods").collect(),
    jobs: await ctx.db.query("chapterGuideJobs").collect(),
    attempts: await ctx.db.query("chapterGuideAttempts").collect(),
  }));
  for (const period of periods) {
    const jobHolds = jobs.filter((job) => job.periodKey === period.periodKey).reduce((total, job) => total + job.reservedRemainingMicros, 0);
    const carryoverHolds = attempts
      .filter((attempt) => attempt.status === "started" && attempt.carryoverPeriodKey === period.periodKey)
      .reduce((total, attempt) => total + (attempt.carryoverMicros ?? 0), 0);
    expect(period.reservedMicros, period.periodKey).toBe(jobHolds + carryoverHolds);
    expect(period.reservedMicros, period.periodKey).toBeGreaterThanOrEqual(0);
  }
}

async function drain(t: Backend) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

let t: Backend;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.stubEnv("OPENAI_API_KEY", OPENAI_KEY);
  vi.stubEnv("ANTHROPIC_API_KEY", ANTHROPIC_KEY);
  vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", SECRET);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  t = newBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("who can start or complete a guide", () => {
  test("a signed-in client without the service secret cannot start a job or supply scripture", async () => {
    await setSettings(t);
    const { as } = await signInAs(t, "owner-a");
    await expect(as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: "guess", ...chapterArgs() })).rejects.toThrow("Forbidden");
    await expect(as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: "", ...chapterArgs() })).rejects.toThrow("Forbidden");
    expect(await allJobs(t)).toEqual([]);
  });

  test("the service secret alone is not enough without a live session", async () => {
    await setSettings(t);
    await expect(t.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).rejects.toThrow("Unauthorized");
    const { as, revoke } = await signInAs(t, "owner-a");
    await revoke();
    await expect(as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).rejects.toThrow("Unauthorized");
    expect(await allJobs(t)).toEqual([]);
  });

  test("functions that record spending or publish are internal, so a client cannot forge them", () => {
    const isInternal = (fn: unknown) => (fn as { isInternal?: boolean }).isInternal === true;
    expect(isInternal(chapterGuides.beginStage)).toBe(true);
    expect(isInternal(chapterGuides.completeStage)).toBe(true);
    expect(isInternal(chapterGuides.sweepStaleJobs)).toBe(true);
    expect(isInternal(chapterGuides.retireGuide)).toBe(true);
    expect(isInternal(chapterGuideWorker.runStage)).toBe(true);
    expect(isInternal(chapterGuides.requestGeneration)).toBe(false);
  });

  test("only an admin can read spending or change the controls", async () => {
    const { as } = await signInAs(t, "owner-a");
    expect(await as.query(api.chapterGuides.getOwnerOverview, {})).toBeNull();
    expect(await t.query(api.chapterGuides.getOwnerOverview, {})).toBeNull();
    await expect(as.mutation(api.chapterGuides.setPaused, { paused: false })).rejects.toThrow("Forbidden");
    await expect(as.mutation(api.chapterGuides.setMonthlyCap, { capDollars: 1 })).rejects.toThrow("Forbidden");
    await expect(t.mutation(api.chapterGuides.setPaused, { paused: false })).rejects.toThrow("Unauthorized");
  });
});

describe("failing closed before any spending", () => {
  test("a new deployment starts paused until an owner resumes", async () => {
    const calls = happyProviders();
    const { as } = await signInAs(t, "owner-a");
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "unavailable", reason: "paused" });
    expect(await t.query(api.chapterGuides.getChapterState, stateArgs())).toMatchObject({ availability: "paused" });
    await drain(t);
    expect(calls).toEqual([]);
    expect(await readPeriod(t)).toBeNull();
  });

  test.each(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"])("a missing %s reserves nothing", async (key) => {
    await setSettings(t);
    vi.stubEnv(key, "  ");
    const { as } = await signInAs(t, "owner-a");
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(await readPeriod(t)).toBeNull();
  });

  test("a deployment with no service secret set refuses everyone and doesn't offer generation", async () => {
    await setSettings(t);
    vi.stubEnv("CHAPTER_GUIDE_SERVICE_SECRET", "");
    const { as } = await signInAs(t, "owner-a");
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: "", ...chapterArgs() })).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(await allJobs(t)).toEqual([]);
    expect(await t.query(api.chapterGuides.getChapterState, stateArgs())).toMatchObject({ availability: "not_configured" });
  });

  test("the owner cannot raise the cap above $100", async () => {
    const { as } = await signInAs(t, "owner-a");
    await t.run(async (ctx) => {
      const user = await ctx.db.query("users").first();
      await ctx.db.patch(user!._id, { isAdmin: true });
    });
    await expect(as.mutation(api.chapterGuides.setMonthlyCap, { capDollars: 100.01 })).rejects.toThrow();
    await expect(as.mutation(api.chapterGuides.setMonthlyCap, { capDollars: -1 })).rejects.toThrow();
    await as.mutation(api.chapterGuides.setMonthlyCap, { capDollars: 50 });
    expect(await as.query(api.chapterGuides.getOwnerOverview, {})).toMatchObject({ capMicros: 50_000_000, hardCapMicros: 100_000_000, paused: true });
    await as.mutation(api.chapterGuides.setPaused, { paused: false });
    expect(await as.query(api.chapterGuides.getOwnerOverview, {})).toMatchObject({ paused: false, pauseReason: null });
  });
});

describe("reserving spending", () => {
  test("the reservation covers every attempt of every stage, including search charges", () => {
    const research = stageMaxCostMicros("research", VERSES.length, CHAPTER_BYTES);
    expect(research).toBeGreaterThan(6 * 10_000);
    expect(RESERVATION).toBe(
      2 * research +
        2 * stageMaxCostMicros("write", VERSES.length, CHAPTER_BYTES) +
        2 * stageMaxCostMicros("review", VERSES.length, CHAPTER_BYTES) +
        stageMaxCostMicros("repair", VERSES.length, CHAPTER_BYTES) +
        2 * stageMaxCostMicros("recheck", VERSES.length, CHAPTER_BYTES)
    );
  });

  test("the reservation is durable and written before any provider is called", async () => {
    await setSettings(t);
    const calls = happyProviders();
    const { as } = await signInAs(t, "owner-a");
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "started" });
    expect(calls).toEqual([]);
    expect(await readPeriod(t)).toMatchObject({ reservedMicros: RESERVATION, spentMicros: 0 });
    const [job] = await allJobs(t);
    expect(job).toMatchObject({ status: "running", reservedRemainingMicros: RESERVATION });
  });

  test("simultaneous requests cannot reserve past the cap", async () => {
    await setSettings(t);
    await setSpentMicros(t, 100_000_000 - RESERVATION_MARGIN_MICROS - RESERVATION);
    const signedIn = await Promise.all(["a", "b", "c"].map((name) => signInAs(t, `owner-${name}`)));
    const results = await Promise.all(
      signedIn.map(({ as }, index) => as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(index + 1) }))
    );
    expect(results.filter((result) => result.status === "started")).toHaveLength(1);
    expect(results.filter((result) => result.status === "unavailable" && result.reason === "budget_exhausted")).toHaveLength(2);
    const period = await readPeriod(t);
    expect(period!.spentMicros + period!.reservedMicros + RESERVATION_MARGIN_MICROS).toBeLessThanOrEqual(100_000_000);
  });

  test("a lowered cap blocks new reservations", async () => {
    await setSettings(t, { monthlyCapMicros: RESERVATION + RESERVATION_MARGIN_MICROS - 1 });
    const { as } = await signInAs(t, "owner-a");
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "unavailable", reason: "budget_exhausted" });
    expect(await t.query(api.chapterGuides.getChapterState, stateArgs())).toMatchObject({ availability: "budget_exhausted" });
  });

  test("a new month starts a new budget", async () => {
    await setSettings(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("chapterGuideBudgetPeriods", { periodKey: "2000-01", spentMicros: 100_000_000, reservedMicros: 0, updatedAt: 0 });
    });
    const { as } = await signInAs(t, "owner-a");
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "started" });
  });
});

describe("deduplication and abuse limits", () => {
  test("a second request joins the running job and is not charged to that reader", async () => {
    await setSettings(t);
    const first = await signInAs(t, "owner-a");
    const second = await signInAs(t, "owner-b");
    await first.as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    expect(await second.as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "generating" });
    expect(await allJobs(t)).toHaveLength(1);
    expect((await readPeriod(t))!.reservedMicros).toBe(RESERVATION);
    const requests = await t.run(async (ctx) => await ctx.db.query("chapterGuideRequests").collect());
    expect(requests).toHaveLength(1);
  });

  test("a finished guide is shared and never generated again", async () => {
    await setSettings(t);
    const calls = happyProviders();
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    const callCount = calls.length;
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "ready" });
    const other = await signInAs(t, "owner-b");
    expect(await other.as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "ready" });
    await drain(t);
    expect(calls).toHaveLength(callCount);
    const anonymous = await t.query(api.chapterGuides.getChapterState, stateArgs());
    expect(anonymous.guide?.content.title).toBe("A guide");
  });

  test("a reader is limited per day, and the total running jobs are limited", async () => {
    await setSettings(t);
    const { as } = await signInAs(t, "owner-a");
    for (let index = 1; index <= MAX_USER_JOBS_PER_DAY; index += 1) {
      expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(index) })).toEqual({ status: "started" });
    }
    const other = await signInAs(t, "owner-b");
    expect(await other.as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(9) })).toEqual({ status: "unavailable", reason: "busy" });
    await t.run(async (ctx) => {
      for (const job of await ctx.db.query("chapterGuideJobs").collect()) {
        await ctx.db.patch(job._id, { status: "succeeded", reservedRemainingMicros: 0 });
      }
    });
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(3) })).toEqual({ status: "unavailable", reason: "user_limit" });
  });

  test("a failed chapter waits before it can be retried", async () => {
    await setSettings(t);
    stubProviders({ openai: () => new Response("{}", { status: 400 }), anthropic: () => claudeResponse(GUIDE) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() })).toEqual({ status: "unavailable", reason: "cooldown" });
    expect(await t.query(api.chapterGuides.getChapterState, stateArgs())).toMatchObject({ availability: "cooldown" });
  });
});

describe("running the stages", () => {
  test("a clean run publishes, charges reported usage for unsearched calls, holds research at its maximum, and releases the rest", async () => {
    await setSettings(t);
    const calls = happyProviders();
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);

    expect(calls.map((call) => call.provider)).toEqual(["openai", "anthropic", "openai"]);
    const [research, writer, review] = calls;
    expect(research!.body).toMatchObject({ model: "gpt-5.6-luna", max_tool_calls: 6, store: false, tool_choice: "required", prompt_cache_options: { mode: "explicit" } });
    expect(writer!.body).toMatchObject({ model: "claude-opus-5-5", stream: true });
    expect(review!.body).toMatchObject({ model: "gpt-5.6-terra", store: false, prompt_cache_options: { mode: "explicit" } });
    expect(review!.body.tools).toBeUndefined();
    expect(research!.headers.get("authorization")).toBe(`Bearer ${OPENAI_KEY}`);
    expect(writer!.headers.get("authorization")).toBe(`Bearer ${ANTHROPIC_KEY}`);
    expect(JSON.stringify(writer!.body)).not.toContain(SECRET);
    expect(JSON.stringify(research!.body)).not.toContain(ANTHROPIC_KEY);

    const expectedSpend = RESEARCH_MAX + (8000 + 20_000) + (2000 + 6000);
    const [job] = await allJobs(t);
    expect(job).toMatchObject({ status: "succeeded", spentMicros: expectedSpend, reservedRemainingMicros: 0, verses: [] });
    expect(await readPeriod(t)).toMatchObject({ spentMicros: expectedSpend, reservedMicros: 0 });
    const attempts = await allAttempts(t);
    expect(attempts.map((attempt) => [attempt.stage, attempt.costSource])).toEqual([
      ["research", "held_at_maximum"],
      ["write", "reported"],
      ["review", "reported"],
    ]);
    expect(attempts[0]).toMatchObject({ actualMicros: RESEARCH_MAX, usage: { inputTokens: 1000, webSearchCalls: 2 } });

    const state = await t.query(api.chapterGuides.getChapterState, stateArgs());
    expect(state.guide?.sources).toEqual([{ id: "S1", title: "Example manual", url: SOURCE_URL, use: "Background on gathering." }]);
    expect(state.guide?.provenance).toMatchObject({ researchModel: "gpt-5.6-luna", writerModel: "claude-opus-5-5", reviewModel: "gpt-5.6-terra", repaired: false });
    expect(JSON.stringify(state)).not.toContain("spent");
  });

  test("required review findings go back to the writer, only flagged sections change, and a second review clears it", async () => {
    await setSettings(t);
    const calls = reviewedProviders({});
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls.map((call) => call.provider)).toEqual(["openai", "anthropic", "openai", "anthropic", "openai"]);
    const recheck = calls[4]!;
    expect(recheck.body).toMatchObject({ model: "gpt-5.6-terra", store: false });
    expect(recheck.body.tools).toBeUndefined();
    expect(String(recheck.body.input)).toContain("Peace, corrected");
    expect(String(recheck.body.input)).toContain("<previous_required_corrections>");
    const state = await t.query(api.chapterGuides.getChapterState, stateArgs());
    expect(state.guide?.content.passages[1]?.heading).toBe("Peace, corrected");
    expect(state.guide?.content.passages[0]?.heading).toBe("Gathering");
    expect(state.guide?.provenance).toMatchObject({ repaired: true, requiredCorrections: 1, reviewSummary: "All fixed." });
    expect((await allJobs(t))[0]).toMatchObject({ status: "succeeded", reservedRemainingMicros: 0 });
    expect((await readPeriod(t))!.reservedMicros).toBe(0);
    await expectReservationsBalanced(t);
  });

  test("the post-repair review is paid for by the job's reservation before the job starts", () => {
    const recheck = stageMaxCostMicros("recheck", VERSES.length, CHAPTER_BYTES);
    expect(recheck).toBeGreaterThan(0);
    expect(STAGE_MAX_ATTEMPTS.recheck).toBe(2);
    expect(RESERVATION).toBeGreaterThanOrEqual(2 * recheck + stageMaxCostMicros("repair", VERSES.length, CHAPTER_BYTES));
  });

  test.each([
    ["an empty object", {}, "repair_noop"],
    ["an empty replacement set", NO_REPAIR, "repair_noop"],
    ["the unchanged section", { ...NO_REPAIR, passages: [GUIDE.passages[1]] }, "repair_noop"],
    ["a section nobody flagged", { ...NO_REPAIR, overview: ["Rewritten."], passages: [REPAIRED_PASSAGE] }, "repair_out_of_scope"],
    ["a passage that doesn't exist", { ...NO_REPAIR, passages: [{ ...REPAIRED_PASSAGE, verse_start: 2 }] }, "repair_invalid"],
    ["a section that no longer validates", { ...NO_REPAIR, passages: [{ ...REPAIRED_PASSAGE, questions: [] }] }, "repair_invalid"],
  ])("a repair returning %s fails without a second review or a guide", async (_name, repair, failureCode) => {
    await setSettings(t);
    const calls = reviewedProviders({ repair: () => claudeResponse(repair) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls.map((call) => call.provider)).toEqual(["openai", "anthropic", "openai", "anthropic"]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode, reservedRemainingMicros: 0 });
    expect((await t.query(api.chapterGuides.getChapterState, stateArgs())).guide).toBeNull();
    await expectReservationsBalanced(t);
  });

  test("a repair that a provider fails to return isn't retried or published", async () => {
    await setSettings(t);
    const calls = reviewedProviders({ repair: () => new Response("{}", { status: 500 }) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls.filter((call) => call.provider === "anthropic")).toHaveLength(2);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "anthropic_http_500" });
    expect((await t.query(api.chapterGuides.getChapterState, stateArgs())).guide).toBeNull();
  });

  test("corrections still open after the repair stop the job, with no second repair", async () => {
    await setSettings(t);
    const calls = reviewedProviders({ recheck: () => openAiResponse(correctionsReview()) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls.map((call) => call.provider)).toEqual(["openai", "anthropic", "openai", "anthropic", "openai"]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "repair_unresolved", reservedRemainingMicros: 0 });
    expect((await t.query(api.chapterGuides.getChapterState, stateArgs())).guide).toBeNull();
    await expectReservationsBalanced(t);
  });

  test("an unreadable second review is retried within its limit and can still clear the guide", async () => {
    await setSettings(t);
    const calls = reviewedProviders({ recheck: (index) => (index === 0 ? openAiResponse({ nonsense: true }) : openAiResponse({ ...CLEAN_REVIEW, summary: "All fixed." })) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls).toHaveLength(6);
    expect((await t.query(api.chapterGuides.getChapterState, stateArgs())).guide?.provenance).toMatchObject({ repaired: true, requiredCorrections: 1 });
  });

  test.each([
    ["unreadable", () => openAiResponse({ nonsense: true }), "recheck_unparseable"],
    ["a provider failure", () => new Response("{}", { status: 500 }), "openai_http_500"],
  ])("a second review that stays %s ends at its attempt limit with no guide", async (_name, recheck, failureCode) => {
    await setSettings(t);
    const calls = reviewedProviders({ recheck });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls).toHaveLength(4 + STAGE_MAX_ATTEMPTS.recheck);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode, reservedRemainingMicros: 0 });
    expect((await t.query(api.chapterGuides.getChapterState, stateArgs())).guide).toBeNull();
    await expectReservationsBalanced(t);
  });

  test("a review naming a section that doesn't exist is retried, then fails, and can't reach repair or publication", async () => {
    await setSettings(t);
    const calls = reviewedProviders({ review: () => openAiResponse(correctionsReview([{ ...PASSAGE_CORRECTION, target: "the whole guide" }])) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls.map((call) => call.provider)).toEqual(["openai", "anthropic", "openai", "openai"]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "review_invalid_target" });
    expect((await t.query(api.chapterGuides.getChapterState, stateArgs())).guide).toBeNull();
  });

  test("a review naming a real section and a missing one doesn't publish the partly checked guide", async () => {
    await setSettings(t);
    reviewedProviders({ review: () => openAiResponse(correctionsReview([PASSAGE_CORRECTION, { ...PASSAGE_CORRECTION, target: "passage:9-9" }])) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "review_invalid_target" });
    expect((await t.query(api.chapterGuides.getChapterState, stateArgs())).guide).toBeNull();
  });

  test("a draft that fails validation is retried once with feedback, then the job fails unpublished", async () => {
    await setSettings(t);
    const uncovered = { ...GUIDE, passages: [GUIDE.passages[0]] };
    const calls = stubProviders({
      openai: () => openAiResponse(RESEARCH_NOTES, { searchCalls: 1 }),
      anthropic: () => claudeResponse(uncovered),
    });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    const writes = calls.filter((call) => call.provider === "anthropic");
    expect(writes).toHaveLength(2);
    expect(JSON.stringify(writes[1]!.body)).toContain("Verse 3 is not covered");
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "guide_invalid", reservedRemainingMicros: 0 });
    expect((await t.query(api.chapterGuides.getChapterState, stateArgs())).guide).toBeNull();
    expect((await readPeriod(t))!.reservedMicros).toBe(0);
  });

  test("research that cites a page the search never returned cannot reach the writer as a source", async () => {
    await setSettings(t);
    const calls = stubProviders({
      openai: () => openAiResponse({ notes: [{ ...RESEARCH_NOTES.notes[0], source_urls: ["https://www.churchofjesuschrist.org/study/never-consulted"] }], unresolved: [] }, { searchCalls: 1 }),
      anthropic: () => claudeResponse(GUIDE),
    });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls.filter((call) => call.provider === "anthropic")).toEqual([]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "research_empty" });
  });

  test("a refusal fails without a retry and still charges reported usage", async () => {
    await setSettings(t);
    const calls = stubProviders({
      openai: () => openAiResponse(RESEARCH_NOTES, { searchCalls: 1 }),
      anthropic: () => claudeResponse({}, { stopReason: "refusal" }),
    });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls.filter((call) => call.provider === "anthropic")).toHaveLength(1);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "anthropic_refusal" });
    expect((await readPeriod(t))!.spentMicros).toBeGreaterThan(0);
  });
});

describe("giving the models the scripture a guide cites", () => {
  const SITE = "https://www.versetogether.org";
  const MOSIAH = { reference: "Mosiah 1", verses: [{ verse: 2, text: "Taught in all the language of his fathers." }, { verse: 3, text: "Concerning the records." }, { verse: 4, text: "Taught in the language of the Egyptians." }] };
  const COORDINATES = { reference: "Mosiah 1:2-4", volume: "bookofmormon", book: "mosiah", chapter: 1, verse_start: 2, verse_end: 4 };
  const CITING_GUIDE = { ...GUIDE, passages: [{ ...GUIDE.passages[0], cross_references: [{ ...COORDINATES, note: "Compare." }] }, GUIDE.passages[1]] };

  function stubEvidenceFetch(scripture: () => Response) {
    const urls: string[] = [];
    const bodies: Array<{ url: string; text: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      if (url.startsWith(SITE)) return scripture();
      const text = String(init?.body ?? (input instanceof Request ? await input.clone().text() : ""));
      bodies.push({ url, text });
      if (!url.includes("api.openai.com")) return claudeResponse(CITING_GUIDE);
      const body = JSON.parse(text) as { tools?: unknown };
      return body.tools ? openAiResponse({ ...RESEARCH_NOTES, cross_reference_candidates: [COORDINATES] }, { searchCalls: 1 }) : openAiResponse(CLEAN_REVIEW);
    }));
    return { urls, bodies };
  }

  test("writing and review receive the canonical text, from the site's scripture route alone", async () => {
    vi.stubEnv("SITE_URL", SITE);
    await setSettings(t);
    const { urls, bodies } = stubEvidenceFetch(() => new Response(JSON.stringify(MOSIAH), { status: 200 }));
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);

    const [research, writer, review] = bodies;
    expect(research!.text).not.toContain("cross_reference_texts>");
    for (const stage of [writer!, review!]) {
      expect(stage.text).toContain("cross_reference_texts>");
      expect(stage.text).toContain("Taught in the language of the Egyptians.");
    }
    for (const url of urls.filter((item) => item.startsWith(SITE))) {
      expect(url).toBe(`${SITE}/api/scriptures/lds-chapter?volume=bookofmormon&book=mosiah&chapter=1`);
    }
    const allowed = urls.filter((url) => !url.startsWith(SITE) && !url.includes("api.openai.com") && !url.includes("api.anthropic.com"));
    expect(allowed).toEqual([]);
    const state = await t.query(api.chapterGuides.getChapterState, stateArgs());
    expect(state.guide?.provenance).toMatchObject({ crossReferencesChecked: 1, crossReferencesUnchecked: 0 });
  });

  test("when the text can't be fetched, the stage says so and the guide records it, at no added charge", async () => {
    vi.stubEnv("SITE_URL", SITE);
    await setSettings(t);
    const { bodies } = stubEvidenceFetch(() => new Response("nope", { status: 500 }));
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);

    const review = bodies[2]!;
    expect(review.text).toContain('\\"status\\":\\"unavailable\\"');
    expect(review.text).not.toContain("Taught in the language of the Egyptians.");
    const state = await t.query(api.chapterGuides.getChapterState, stateArgs());
    expect(state.guide?.provenance).toMatchObject({ crossReferencesChecked: 0, crossReferencesUnchecked: 1 });
    const attempts = await allAttempts(t);
    expect(attempts.map((attempt) => attempt.stage)).toEqual(["research", "write", "review"]);
    await expectReservationsBalanced(t);
  });

  test("with no site configured, no scripture is fetched and the guide still records that it wasn't checked", async () => {
    vi.stubEnv("SITE_URL", "");
    await setSettings(t);
    const { urls } = stubEvidenceFetch(() => new Response(JSON.stringify(MOSIAH), { status: 200 }));
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(urls.filter((url) => url.includes("lds-chapter"))).toEqual([]);
    const state = await t.query(api.chapterGuides.getChapterState, stateArgs());
    expect(state.guide?.provenance).toMatchObject({ crossReferencesChecked: 0, crossReferencesUnchecked: 1 });
  });
});

describe("spending when calls go wrong", () => {
  test("a research attempt stays at its maximum even when reported usage is small, because search content isn't confirmed to be in it", async () => {
    await setSettings(t);
    stubProviders({ openai: () => openAiResponse(RESEARCH_NOTES, { searchCalls: 1, input: 10, output: 10 }), anthropic: () => new Response("{}", { status: 400 }) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    const [attempt] = await allAttempts(t);
    expect(attempt).toMatchObject({ stage: "research", costSource: "held_at_maximum", actualMicros: RESEARCH_MAX, usage: { inputTokens: 10, webSearchCalls: 1 } });
    expect((await readPeriod(t))!.spentMicros).toBe(RESEARCH_MAX);
  });

  test("a research attempt reporting more than its maximum is recorded in full and pauses generation", async () => {
    await setSettings(t);
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    const [job] = await allJobs(t);
    const plan = await t.mutation(internal.chapterGuides.beginStage, { jobId: job!._id });
    if (plan.kind !== "run") throw new Error("expected a run");
    await t.mutation(internal.chapterGuides.completeStage, {
      attemptId: plan.attemptId,
      charge: { source: "held_at_maximum", usage: { ...REPORTED_USAGE, webSearchCalls: 200 } },
      outcome: { kind: "fail", code: "test" },
    });
    expect((await readPeriod(t))!.spentMicros).toBeGreaterThan(RESEARCH_MAX);
    expect(await t.run(async (ctx) => await ctx.db.query("chapterGuideSettings").first())).toMatchObject({ paused: true, pauseReason: "reservation_exceeded" });
  });

  test("usage the worker can't vouch for is held at the attempt's maximum", async () => {
    await setSettings(t);
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    const [job] = await allJobs(t);
    const plan = await t.mutation(internal.chapterGuides.beginStage, { jobId: job!._id });
    if (plan.kind !== "run") throw new Error("expected a run");
    await t.mutation(internal.chapterGuides.completeStage, {
      attemptId: plan.attemptId,
      charge: { source: "reported", usage: { ...REPORTED_USAGE, inputTokens: -5 } },
      outcome: { kind: "fail", code: "test" },
    });
    expect((await allAttempts(t))[0]).toMatchObject({ costSource: "held_at_maximum", actualMicros: RESEARCH_MAX });
    expect(await readPeriod(t)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
  });

  test.each([
    ["OpenAI", () => stubProviders({ openai: () => openAiResponse(RESEARCH_NOTES, { input: -1 }), anthropic: () => claudeResponse(GUIDE) }), "research", "openai_usage_invalid"],
    ["Anthropic", () => stubProviders({ openai: () => openAiResponse(RESEARCH_NOTES, { searchCalls: 1 }), anthropic: () => claudeResponse(GUIDE, { input: -1 }) }), "write", "anthropic_usage_invalid"],
  ])("malformed %s usage ends the job at the attempt's maximum", async (_name, stub, stage, failureCode) => {
    await setSettings(t);
    stub();
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode });
    const attempt = (await allAttempts(t)).find((item) => item.stage === stage);
    expect(attempt).toMatchObject({ costSource: "held_at_maximum", actualMicros: attempt!.maxCostMicros });
  });

  test("a request larger than its reserved input bound never reaches the provider", async () => {
    await setSettings(t);
    const calls = stubProviders({ openai: () => openAiResponse(RESEARCH_NOTES, { searchCalls: 1 }), anthropic: () => claudeResponse(GUIDE) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    const [job] = await allJobs(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(job!._id, {
        stage: "write",
        research: { sources: [], notes: [], unresolved: ["x".repeat(MAX_RESEARCH_PACKET_BYTES + 64 * 1024)] },
      });
    });
    await drain(t);
    expect(calls).toEqual([]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "input_too_large" });
    expect((await allAttempts(t))[0]).toMatchObject({ costSource: "no_charge", actualMicros: 0 });
  });

  test("a worker that starts too late to finish inside its lease makes no call", () => {
    const plan = { timeoutMs: 300_000, leaseExpiresAt: 1_000_000 };
    expect(chapterGuideWorker.missedStartWindow(plan, 700_000)).toBe(false);
    expect(chapterGuideWorker.missedStartWindow(plan, 700_001)).toBe(true);
  });

  test("a provider 5xx has an unknown cost, so its maximum stays spent", async () => {
    await setSettings(t);
    stubProviders({ openai: () => new Response("{}", { status: 500 }), anthropic: () => claudeResponse(GUIDE) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    const researchMax = stageMaxCostMicros("research", VERSES.length, CHAPTER_BYTES);
    const attempts = await allAttempts(t);
    expect(attempts.map((attempt) => attempt.costSource)).toEqual(["held_at_maximum", "held_at_maximum"]);
    expect(await readPeriod(t)).toMatchObject({ spentMicros: 2 * researchMax, reservedMicros: 0 });
  });

  test("a network failure is also held at its maximum", async () => {
    await setSettings(t);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect((await readPeriod(t))!.spentMicros).toBe(2 * stageMaxCostMicros("research", VERSES.length, CHAPTER_BYTES));
  });

  test("a 429 isn't billed, is retried once, and spends nothing", async () => {
    await setSettings(t);
    const calls = stubProviders({ openai: () => new Response("{}", { status: 429 }), anthropic: () => claudeResponse(GUIDE) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls).toHaveLength(2);
    expect(await readPeriod(t)).toMatchObject({ spentMicros: 0, reservedMicros: 0 });
  });

  test("the Anthropic SDK makes exactly one request per attempt", async () => {
    await setSettings(t);
    const calls = stubProviders({ openai: () => openAiResponse(RESEARCH_NOTES, { searchCalls: 1 }), anthropic: () => new Response("{}", { status: 500 }) });
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect(calls.filter((call) => call.provider === "anthropic")).toHaveLength(2);
    expect((await allAttempts(t)).filter((attempt) => attempt.stage === "write")).toHaveLength(2);
  });

  test("a worker lost mid-call keeps that call's maximum and releases only what was never started", async () => {
    await setSettings(t);
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    const [job] = await allJobs(t);
    const plan = await t.mutation(internal.chapterGuides.beginStage, { jobId: job!._id });
    expect(plan.kind).toBe("run");
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    expect(await t.mutation(internal.chapterGuides.sweepStaleJobs, {})).toEqual({ swept: 1 });
    const researchMax = stageMaxCostMicros("research", VERSES.length, CHAPTER_BYTES);
    expect(await readPeriod(t)).toMatchObject({ spentMicros: researchMax, reservedMicros: 0 });
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "worker_lost" });

    if (plan.kind !== "run") return;
    await t.mutation(internal.chapterGuides.completeStage, {
      attemptId: plan.attemptId,
      charge: { source: "reported", usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, webSearchCalls: 0 } },
      outcome: { kind: "fail", code: "late" },
    });
    expect(await readPeriod(t)).toMatchObject({ spentMicros: researchMax, reservedMicros: 0 });
    expect((await allAttempts(t))[0]).toMatchObject({ costSource: "held_at_maximum", errorCode: "worker_lost" });
  });

  test("a duplicate stage run is refused while a call is open, so no second provider call starts", async () => {
    await setSettings(t);
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    const [job] = await allJobs(t);
    expect((await t.mutation(internal.chapterGuides.beginStage, { jobId: job!._id })).kind).toBe("run");
    expect(await t.mutation(internal.chapterGuides.beginStage, { jobId: job!._id })).toEqual({ kind: "stop" });
    expect(await allAttempts(t)).toHaveLength(1);
  });

  test("a call that costs more than its maximum is recorded in full and pauses generation", async () => {
    await setSettings(t);
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    const [job] = await allJobs(t);
    const plan = await t.mutation(internal.chapterGuides.beginStage, { jobId: job!._id });
    if (plan.kind !== "run") throw new Error("expected a run");
    const inputTokens = 5_000_000;
    await t.mutation(internal.chapterGuides.completeStage, {
      attemptId: plan.attemptId,
      charge: { source: "reported", usage: { inputTokens, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, webSearchCalls: 0 } },
      outcome: { kind: "fail", code: "test" },
    });
    expect((await readPeriod(t))!.spentMicros).toBe(2_000_000);
    const settings = await t.run(async (ctx) => await ctx.db.query("chapterGuideSettings").first());
    expect(settings).toMatchObject({ paused: true, pauseReason: "reservation_exceeded" });
  });

  test("repeated failed guides pause generation automatically", async () => {
    await setSettings(t);
    stubProviders({ openai: () => new Response("{}", { status: 400 }), anthropic: () => claudeResponse(GUIDE) });
    for (let index = 0; index < 4; index += 1) {
      const { as } = await signInAs(t, `owner-${index}`);
      await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(index + 1) });
      await drain(t);
    }
    const settings = await t.run(async (ctx) => await ctx.db.query("chapterGuideSettings").first());
    expect(settings).toMatchObject({ paused: true, pauseReason: "repeated_failures", consecutiveFailures: 4 });
  });
});

describe("crossing into a new calendar month", () => {
  const NOVEMBER = "2026-11";
  const DECEMBER = "2026-12";
  const LATE_NOVEMBER = Date.UTC(2026, 10, 30, 22, 0);
  const LAST_MINUTE = Date.UTC(2026, 10, 30, 23, 59, 30);
  const EARLY_DECEMBER = Date.UTC(2026, 11, 1, 0, 10);

  async function startJob(chapter = 1, owner = "owner-a") {
    const { as } = await signInAs(t, owner);
    expect(await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(chapter) })).toEqual({ status: "started" });
    const jobs = await allJobs(t);
    return jobs.at(-1)!._id;
  }

  async function begin(jobId: Id<"chapterGuideJobs">) {
    const plan = await t.mutation(internal.chapterGuides.beginStage, { jobId });
    if (plan.kind !== "run") throw new Error("expected a run");
    return plan;
  }

  function nextStage(stage: "write" | "review") {
    return { kind: "next" as const, stage };
  }

  async function seedPeriod(periodKey: string, spentMicros: number) {
    await t.run(async (ctx) => {
      await ctx.db.insert("chapterGuideBudgetPeriods", { periodKey, spentMicros, reservedMicros: 0, updatedAt: 0 });
    });
  }

  test("a stage begun next month moves the job's remaining reservation into that month before its call", async () => {
    await setSettings(t);
    vi.setSystemTime(LATE_NOVEMBER);
    const jobId = await startJob();
    const research = await begin(jobId);
    expect(await periodFor(t, DECEMBER)).toBeNull();
    await t.mutation(internal.chapterGuides.completeStage, { attemptId: research.attemptId, charge: { source: "held_at_maximum" }, outcome: nextStage("write") });

    vi.setSystemTime(EARLY_DECEMBER);
    const write = await begin(jobId);
    const remaining = RESERVATION - RESEARCH_MAX;
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ spentMicros: 0, reservedMicros: remaining });
    expect((await allJobs(t))[0]).toMatchObject({ periodKey: DECEMBER, reservedRemainingMicros: remaining });
    await expectReservationsBalanced(t);

    await t.mutation(internal.chapterGuides.completeStage, { attemptId: write.attemptId, charge: { source: "reported", usage: REPORTED_USAGE }, outcome: { kind: "fail", code: "test" } });
    const writeCost = 4000 + 10_000;
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ spentMicros: writeCost, reservedMicros: 0 });
  });

  test("a job that no longer fits the new month stops before its call and releases last month's reservation", async () => {
    await setSettings(t);
    const calls = happyProviders();
    vi.setSystemTime(LATE_NOVEMBER);
    const jobId = await startJob();
    await seedPeriod(DECEMBER, CAP - RESERVATION_MARGIN_MICROS - RESERVATION + 1);

    vi.setSystemTime(EARLY_DECEMBER);
    expect(await t.mutation(internal.chapterGuides.beginStage, { jobId })).toEqual({ kind: "stop" });
    expect(calls).toEqual([]);
    expect(await allAttempts(t)).toEqual([]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "budget_stopped", reservedRemainingMicros: 0 });
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ reservedMicros: 0 });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ reservedMicros: 0 });
    await expectReservationsBalanced(t);
  });

  test("a job moved into a full new month doesn't push that month past its cap", async () => {
    await setSettings(t);
    vi.setSystemTime(LATE_NOVEMBER);
    const jobId = await startJob();
    await seedPeriod(DECEMBER, CAP - RESERVATION_MARGIN_MICROS - RESERVATION);

    vi.setSystemTime(EARLY_DECEMBER);
    await begin(jobId);
    const december = await periodFor(t, DECEMBER);
    expect(december!.spentMicros + december!.reservedMicros + RESERVATION_MARGIN_MICROS).toBe(CAP);
    const other = await signInAs(t, "owner-b");
    expect(await other.as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(2) })).toEqual({ status: "unavailable", reason: "budget_exhausted" });
  });

  test("an attempt whose lease crosses midnight holds its maximum in the new month before the call", async () => {
    await setSettings(t);
    vi.setSystemTime(LAST_MINUTE);
    const jobId = await startJob();
    await begin(jobId);
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: 0, reservedMicros: RESERVATION });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ spentMicros: 0, reservedMicros: RESEARCH_MAX });
    expect((await allAttempts(t))[0]).toMatchObject({ periodKey: NOVEMBER, carryoverPeriodKey: DECEMBER, carryoverMicros: RESEARCH_MAX });
    await expectReservationsBalanced(t);
  });

  test("an attempt can't start across midnight when the new month has no room for it", async () => {
    await setSettings(t);
    const calls = happyProviders();
    vi.setSystemTime(LAST_MINUTE);
    const jobId = await startJob();
    await seedPeriod(DECEMBER, CAP - RESERVATION_MARGIN_MICROS - RESEARCH_MAX + 1);
    expect(await t.mutation(internal.chapterGuides.beginStage, { jobId })).toEqual({ kind: "stop" });
    expect(calls).toEqual([]);
    expect(await allAttempts(t)).toEqual([]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "budget_stopped" });
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ reservedMicros: 0 });
    await expectReservationsBalanced(t);
  });

  test("an attempt that finishes before midnight releases its hold and spends nothing in the new month", async () => {
    await setSettings(t);
    vi.setSystemTime(LAST_MINUTE);
    const jobId = await startJob();
    const research = await begin(jobId);
    vi.setSystemTime(LAST_MINUTE + 10_000);
    await t.mutation(internal.chapterGuides.completeStage, { attemptId: research.attemptId, charge: { source: "held_at_maximum" }, outcome: nextStage("write") });
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: RESERVATION - RESEARCH_MAX });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ spentMicros: 0, reservedMicros: 0 });
    await expectReservationsBalanced(t);
  });

  test("an attempt that finishes after midnight counts in both months, so neither month has a blind spot", async () => {
    await setSettings(t);
    vi.setSystemTime(LAST_MINUTE);
    const jobId = await startJob();
    const research = await begin(jobId);
    vi.setSystemTime(EARLY_DECEMBER);
    await t.mutation(internal.chapterGuides.completeStage, { attemptId: research.attemptId, charge: { source: "held_at_maximum" }, outcome: nextStage("write") });
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: RESERVATION - RESEARCH_MAX });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
    expect((await allJobs(t))[0]).toMatchObject({ periodKey: NOVEMBER, spentMicros: RESEARCH_MAX });
    await expectReservationsBalanced(t);

    await begin(jobId);
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: RESERVATION - RESEARCH_MAX });
    await expectReservationsBalanced(t);
  });

  test("a stale worker across midnight is swept at its maximum in both months, leaves no hold, and can't settle later", async () => {
    await setSettings(t);
    vi.setSystemTime(LAST_MINUTE);
    const jobId = await startJob();
    const research = await begin(jobId);
    vi.setSystemTime(Date.UTC(2026, 11, 1, 2, 0));
    expect(await t.mutation(internal.chapterGuides.sweepStaleJobs, {})).toEqual({ swept: 1 });
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "worker_lost", reservedRemainingMicros: 0 });
    await expectReservationsBalanced(t);

    await t.mutation(internal.chapterGuides.completeStage, { attemptId: research.attemptId, charge: { source: "reported", usage: REPORTED_USAGE }, outcome: { kind: "fail", code: "late" } });
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
    expect(await periodFor(t, DECEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
  });

  test("a stale job waiting between stages is released from the month that still holds it", async () => {
    await setSettings(t);
    vi.setSystemTime(LATE_NOVEMBER);
    await startJob();
    vi.setSystemTime(EARLY_DECEMBER);
    expect(await t.mutation(internal.chapterGuides.sweepStaleJobs, {})).toEqual({ swept: 1 });
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: 0, reservedMicros: 0 });
    expect(await periodFor(t, DECEMBER)).toBeNull();
    await expectReservationsBalanced(t);
  });

  test("a call finishing late inside one month is charged only to that month", async () => {
    await setSettings(t);
    vi.setSystemTime(LATE_NOVEMBER);
    const jobId = await startJob();
    await begin(jobId);
    vi.setSystemTime(EARLY_DECEMBER);
    await t.mutation(internal.chapterGuides.sweepStaleJobs, {});
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ spentMicros: RESEARCH_MAX, reservedMicros: 0 });
    expect(await periodFor(t, DECEMBER)).toBeNull();
  });

  test("a new-month request that takes the last room stops a carried job before its call", async () => {
    await setSettings(t);
    const calls = happyProviders();
    vi.setSystemTime(LATE_NOVEMBER);
    const carried = await startJob(1, "owner-carried");
    await seedPeriod(DECEMBER, CAP - RESERVATION_MARGIN_MICROS - RESERVATION);

    vi.setSystemTime(EARLY_DECEMBER);
    const reader = await signInAs(t, "owner-a");
    expect(await reader.as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(2) })).toEqual({ status: "started" });
    expect(await t.mutation(internal.chapterGuides.beginStage, { jobId: carried })).toEqual({ kind: "stop" });
    expect(calls).toEqual([]);
    expect((await allJobs(t)).find((job) => job._id === carried)).toMatchObject({ status: "failed", failureCode: "budget_stopped" });
    const december = await periodFor(t, DECEMBER);
    expect(december!.spentMicros + december!.reservedMicros + RESERVATION_MARGIN_MICROS).toBe(CAP);
    expect(await periodFor(t, NOVEMBER)).toMatchObject({ reservedMicros: 0 });
    await expectReservationsBalanced(t);
  });

  test("simultaneous requests at the start of a month can't reserve past that month's cap, whatever last month spent", async () => {
    await setSettings(t);
    await seedPeriod(NOVEMBER, CAP);
    await seedPeriod(DECEMBER, CAP - RESERVATION_MARGIN_MICROS - RESERVATION);
    vi.setSystemTime(EARLY_DECEMBER);
    const readers = await Promise.all(["a", "b"].map((name) => signInAs(t, `owner-${name}`)));
    const results = await Promise.all(
      readers.map(({ as }, index) => as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs(index + 1) }))
    );
    expect(results.filter((result) => result.status === "started")).toHaveLength(1);
    expect(results.filter((result) => result.status === "unavailable" && result.reason === "budget_exhausted")).toHaveLength(1);
    const december = await periodFor(t, DECEMBER);
    expect(december!.spentMicros + december!.reservedMicros + RESERVATION_MARGIN_MICROS).toBe(CAP);
    await expectReservationsBalanced(t);
  });

  test("a full run spanning midnight ends with nothing reserved in either month", async () => {
    await setSettings(t);
    happyProviders();
    vi.setSystemTime(LAST_MINUTE);
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    await drain(t);
    expect((await allJobs(t))[0]).toMatchObject({ status: "succeeded", reservedRemainingMicros: 0 });
    expect((await periodFor(t, NOVEMBER))!.reservedMicros).toBe(0);
    expect((await periodFor(t, DECEMBER))?.reservedMicros ?? 0).toBe(0);
    await expectReservationsBalanced(t);
  });
});

describe("stopping a running job", () => {
  async function jobAfterResearch() {
    const { as } = await signInAs(t, "owner-a");
    await as.mutation(api.chapterGuides.requestGeneration, { serviceSecret: SECRET, ...chapterArgs() });
    const [job] = await allJobs(t);
    return job!._id as Id<"chapterGuideJobs">;
  }

  test("pausing stops the job before its next provider call and releases its reservation", async () => {
    await setSettings(t);
    const calls = happyProviders();
    const jobId = await jobAfterResearch();
    await setSettings(t, { paused: true });
    expect(await t.mutation(internal.chapterGuides.beginStage, { jobId })).toEqual({ kind: "stop" });
    await drain(t);
    expect(calls).toEqual([]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "paused" });
    expect(await readPeriod(t)).toMatchObject({ reservedMicros: 0, spentMicros: 0 });
  });

  test("lowering the cap below what's committed stops the job at its next stage", async () => {
    await setSettings(t);
    const jobId = await jobAfterResearch();
    await setSettings(t, { monthlyCapMicros: 1 });
    expect(await t.mutation(internal.chapterGuides.beginStage, { jobId })).toEqual({ kind: "stop" });
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "budget_stopped" });
  });

  test("a job stopped by pausing doesn't count as a failure or block the chapter", async () => {
    await setSettings(t);
    const jobId = await jobAfterResearch();
    await setSettings(t, { paused: true });
    await t.mutation(internal.chapterGuides.beginStage, { jobId });
    await setSettings(t, { paused: false });
    expect(await t.query(api.chapterGuides.getChapterState, stateArgs())).toMatchObject({ availability: "available" });
  });

  test("keys removed mid-job stop it without a provider call or a charge", async () => {
    await setSettings(t);
    const calls = happyProviders();
    await jobAfterResearch();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await drain(t);
    expect(calls).toEqual([]);
    expect((await allJobs(t))[0]).toMatchObject({ status: "failed", failureCode: "not_configured" });
    expect(await readPeriod(t)).toMatchObject({ reservedMicros: 0, spentMicros: 0 });
  });
});
