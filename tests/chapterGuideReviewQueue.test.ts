// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import type { ChapterGuideContent, GuideReview } from "../convex/chapterGuideContent";

const convexReact = vi.hoisted(() => ({ useQuery: vi.fn(), useMutation: vi.fn(() => vi.fn()) }));
vi.mock("convex/react", () => convexReact);

const { default: ChapterGuideReviewQueue, ChapterGuideReviewDetail, ChapterGuideReviewList, continuationMessage } = await import("../src/features/chapterGuides/ChapterGuideReviewQueue");

const DRAFT: ChapterGuideContent = {
  title: "Alma 1: Held draft",
  overview: ["<img src=x onerror=alert(1)> Overview text."],
  historical_context: { paragraphs: ["Context text."], source_ids: ["S1"] },
  significant_insights: [{ title: "An insight", verse_start: 1, verse_end: 1, paragraphs: ["Insight text."], source_ids: [] }],
  passages: [{ verse_start: 1, verse_end: 3, heading: "Gathering", original_meaning: ["Meaning text."], latter_day_saint_application: ["Application text."], cross_references: [{ reference: "Hebrews 11:1", volume: "newtestament", book: "hebrews", chapter: 11, verse_start: 1, verse_end: 1, note: "Compare it." }], questions: ["What does it ask?"], source_ids: ["S1"] }],
  source_use: [],
  limitations: ["Dates are uncertain."],
};
const FINDINGS: GuideReview = {
  summary: "One problem remains.",
  required_corrections: [
    { target: "passage:1-3", category: "factual", issue: "The date is wrong.", evidence: "Verse 2 says otherwise." },
    { target: "the whole guide", category: "tone", issue: "Too certain.", evidence: "Throughout." },
  ],
  optional_improvements: ["Add a question."],
  unverifiable: ["The year."],
};
const ID = "job-1" as Id<"chapterGuideJobs">;
const ITEM = {
  id: ID,
  reference: "Alma 1",
  queuedAt: Date.UTC(2026, 10, 4),
  reasonCode: "repair_unresolved",
  resumeStage: "repair" as const,
  correctionRound: 3,
  continuations: 0,
  findingCount: 2,
  spentMicros: 4_250_000,
  continuationRounds: 3,
  continuationCalls: 9,
  continuationMicros: 8_430_000,
};
const DETAIL = {
  ...ITEM,
  blockedBy: null,
  draft: DRAFT,
  findings: FINDINGS,
  sources: [
    { id: "S1", title: "A manual", url: "https://www.churchofjesuschrist.org/study/manual" },
    { id: "S2", title: "A bad address", url: "javascript:alert(1)" },
  ],
  history: [],
};

function renderDetail(overrides: Partial<typeof DETAIL> | Record<string, unknown> = {}, continuing = false) {
  const detail = { ...DETAIL, ...overrides } as Parameters<typeof ChapterGuideReviewDetail>[0]["detail"];
  return renderToStaticMarkup(createElement(ChapterGuideReviewDetail, { detail, continuing, onContinue: () => {}, onBack: () => {} }));
}

beforeEach(() => {
  convexReact.useQuery.mockReset();
});

describe("the review queue", () => {
  test("anyone a query refuses sees nothing at all", () => {
    convexReact.useQuery.mockReturnValue(null);
    expect(renderToStaticMarkup(createElement(ChapterGuideReviewQueue))).toBe("");
  });

  test("an empty queue says so", () => {
    convexReact.useQuery.mockImplementation((_fn: unknown, args: unknown) => (args === "skip" ? undefined : []));
    const html = renderToStaticMarkup(createElement(ChapterGuideReviewQueue));
    expect(html).toContain("Needs review (0)");
    expect(html).toContain("Nothing is waiting for review.");
  });

  test("it doesn't ask for a draft until one is opened", () => {
    convexReact.useQuery.mockImplementation((_fn: unknown, args: unknown) => (args === "skip" ? undefined : [ITEM]));
    renderToStaticMarkup(createElement(ChapterGuideReviewQueue));
    expect(convexReact.useQuery.mock.calls.map((call) => call[1])).toEqual([{}, "skip"]);
  });

  test("each item shows what's waiting and how to open it", () => {
    const html = renderToStaticMarkup(createElement(ChapterGuideReviewList, { queue: [ITEM], onOpen: () => {} }));
    expect(html).toContain("Alma 1: 2 open findings, 3 correction rounds, $4.25 spent, queued Nov 4, 2026");
    expect(html).toContain("Review Alma 1");
  });
});

describe("the review detail", () => {
  test("it shows the draft and the outstanding findings as text, never as markup", () => {
    const html = renderDetail();
    expect(html).toContain("Alma 1: Held draft");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; Overview text.");
    expect(html).not.toContain("<img");
    expect(html).toContain("Meaning text.");
    expect(html).toContain("Insight 1: An insight");
    expect(html).toContain("Hebrews 11:1: Compare it.");
    expect(html).toContain("Outstanding findings (2)");
    expect(html).toContain("The date is wrong.");
    expect(html).toContain("Evidence: Verse 2 says otherwise.");
    expect(html).toContain("Verses 1–3");
    expect(html).toContain("the whole guide");
    expect(html).toContain("The year.");
    expect(html).toContain("Add a question.");
  });

  test("the button and the text say what continuing reserves, and how to leave it", () => {
    const html = renderDetail();
    expect(html).toContain("Continue generation (reserves up to $8.43)");
    expect(html).toContain("3 more correction rounds");
    expect(html).toContain("up to 9 provider calls");
    expect(html).toContain("the rest is released");
    expect(html).toContain("published only if the reviewer clears it");
    expect(html).toContain("To leave it queued, do nothing.");
    expect(html).toContain("sending this draft and these findings to the writer");
  });

  test("findings that can't go to the writer say a review comes first", () => {
    expect(renderDetail({ resumeStage: "recheck", reasonCode: "recheck_invalid_target" })).toContain("It starts with a fresh review of this draft");
  });

  test.each([
    ["repair_unresolved", "still had findings after the last allowed correction round"],
    ["repair_noop", "left a flagged section unchanged"],
    ["repair_out_of_scope", "changed a section nobody flagged"],
    ["repair_invalid", "didn’t pass validation"],
    ["repair_unparseable", "couldn’t be read"],
    ["recheck_unparseable", "These are the findings that repair addressed"],
    ["recheck_rejected", "more findings than a repair can take"],
    ["review_invalid_target", "aren’t in the guide"],
    ["paused", "An earlier continuation stopped before it finished (paused)"],
  ])("%s is explained", (reasonCode, expected) => {
    expect(renderDetail({ reasonCode })).toContain(expected);
  });

  test.each([
    ["paused", "Generation is paused."],
    ["not_configured", "is missing"],
    ["busy", "Other guides are running."],
    ["budget_exhausted", "can’t hold this reservation"],
  ])("when blocked by %s, it says why and the button is off", (blockedBy, expected) => {
    const html = renderDetail({ blockedBy });
    expect(html).toContain(expected);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue generation/);
  });

  test("a click already sent turns the button off", () => {
    expect(renderDetail({}, true)).toMatch(/<button[^>]*disabled=""[^>]*>Continuing…/);
  });

  test("only web addresses become links", () => {
    const html = renderDetail();
    expect(html).toContain('href="https://www.churchofjesuschrist.org/study/manual"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("A bad address");
  });

  test("earlier continuations are listed with what they reserved", () => {
    const html = renderDetail({ history: [{ continuation: 1, createdAt: Date.UTC(2026, 10, 2), queueCode: "repair_unresolved", fromCorrectionRound: 3, maxCorrectionRounds: 6, reservedMicros: 8_430_000 }] });
    expect(html).toContain("Earlier continuations");
    expect(html).toContain("Nov 2, 2026: continued after round 3, allowing rounds through 6, with up to $8.43 reserved.");
  });
});

describe("what the owner is told after choosing", () => {
  test.each([
    [{ status: "started", reservedMicros: 8_430_000 }, "Up to $8.43 is reserved"],
    [{ status: "running" }, "already running"],
    [{ status: "stale" }, "nothing was started"],
    [{ status: "already_published" }, "already saved"],
    [{ status: "unavailable", reason: "budget_exhausted" }, "can’t hold this reservation"],
    [{ status: "unavailable", reason: "paused" }, "Generation is paused."],
  ] as const)("%o says %s", (result, expected) => {
    expect(continuationMessage(result)).toContain(expected);
  });
});
