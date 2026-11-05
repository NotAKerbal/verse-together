// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CHAPTER_GUIDE_STAGES } from "../convex/chapterGuideBudget";
import ChapterGuidePendingStatus from "../src/features/chapterGuides/ChapterGuidePendingStatus";
import ChapterGuideProgress from "../src/features/chapterGuides/ChapterGuideProgress";
import type { ChapterGuideSelection } from "../src/features/chapterGuides/useChapterGuideSelection";
import { chapterGuideConnectionMessage, chapterGuideCooldownMessage, chapterGuideProgress, chapterGuideUnavailableMessage } from "../src/lib/chapterGuideView";

const selection = vi.hoisted(() => ({ hook: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("../src/features/chapterGuides/useChapterGuideSelection", () => ({ useChapterGuideSelection: selection.hook }));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function render(stage: string, now: number | null = null, startedAt = 0, rounds: { correctionRound?: number; maxCorrectionRounds?: number } = {}) {
  return renderToStaticMarkup(createElement(ChapterGuideProgress, { reference: "Revelation 2", generating: { stage, startedAt, ...rounds }, now }));
}

function statuses(stage: string) {
  return chapterGuideProgress(stage)?.steps.map((step) => `${step.stage}:${step.status}`);
}

describe("the stage model", () => {
  test("every stage the worker can report has a step", () => {
    for (const stage of CHAPTER_GUIDE_STAGES) expect(chapterGuideProgress(stage), stage).not.toBeNull();
  });

  test("the first three stages are three steps, with corrections left out until they happen", () => {
    expect(statuses("research")).toEqual(["research:current", "write:upcoming", "review:upcoming"]);
    expect(statuses("write")).toEqual(["research:done", "write:current", "review:upcoming"]);
    expect(statuses("review")).toEqual(["research:done", "write:done", "review:current"]);
    expect(chapterGuideProgress("review")).toMatchObject({ completedSteps: 2, stepNumber: 3, correctionsMayFollow: true });
  });

  test("repair and the second review add the two optional steps", () => {
    expect(statuses("repair")).toEqual(["research:done", "write:done", "review:done", "repair:current", "recheck:upcoming"]);
    expect(statuses("recheck")).toEqual(["research:done", "write:done", "review:done", "repair:done", "recheck:current"]);
    expect(chapterGuideProgress("recheck")).toMatchObject({ completedSteps: 4, stepNumber: 5, correctionsMayFollow: false });
  });

  test("a stage it doesn't know isn't given a position", () => {
    expect(chapterGuideProgress("writing")).toBeNull();
    expect(chapterGuideProgress("constructor")).toBeNull();
  });

  test("further correction rounds add steps, so finished steps are never taken back", () => {
    const journey = [
      chapterGuideProgress("research"),
      chapterGuideProgress("write"),
      chapterGuideProgress("review"),
      ...[1, 2, 3].flatMap((correctionRound) =>
        ["repair", "recheck"].map((stage) => chapterGuideProgress(stage, { correctionRound, maxCorrectionRounds: 3 }))
      ),
    ];
    expect(journey.map((progress) => progress?.completedSteps)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(journey.map((progress) => progress?.steps.length)).toEqual([3, 3, 3, 5, 5, 7, 7, 9, 9]);
    for (const progress of journey) {
      const keys = progress!.steps.map((step) => step.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(progress!.steps.filter((step) => step.status === "current")).toHaveLength(1);
    }
  });

  test("each round's steps have their own names, and the last round says nothing more may follow", () => {
    const rounds = { correctionRound: 3, maxCorrectionRounds: 3 };
    const last = chapterGuideProgress("recheck", rounds)!;
    expect(last.steps.map((step) => step.label)).toEqual([
      "Research", "Writing", "Review", "Corrections", "Second review", "Corrections, round 2", "Third review", "Corrections, round 3", "Fourth review",
    ]);
    expect(last).toMatchObject({ stepNumber: 9, completedSteps: 8, activity: "Reviewing the corrections (round 3 of 3)", correctionsMayFollow: false });
    expect(chapterGuideProgress("recheck", { correctionRound: 2, maxCorrectionRounds: 3 })).toMatchObject({ stepNumber: 7, correctionsMayFollow: true });
    expect(chapterGuideProgress("repair", { correctionRound: 2, maxCorrectionRounds: 3 })?.activity).toBe("Making the corrections from the review (round 2 of 3)");
  });

  test("a job limited to one round isn't told more may follow, and a job with no round details is treated the same", () => {
    const legacy = { correctionRound: 1, maxCorrectionRounds: 1 };
    expect(chapterGuideProgress("recheck", legacy)).toEqual(chapterGuideProgress("recheck"));
    expect(chapterGuideProgress("recheck", legacy)).toMatchObject({ activity: "Reviewing the corrections", correctionsMayFollow: false });
  });
});

describe("the progress bar", () => {
  test("it exposes completed steps to assistive technology and marks the current one", () => {
    const html = render("write");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="3"');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('aria-valuetext="Step 2 of 3: Writing the guide"');
    expect(html).toContain('role="status">Step 2 of 3: Writing the guide<');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("A guide for Revelation 2 is being written.");
  });

  test("time passing moves only the elapsed text, never the bar", () => {
    const early = render("research", 30_000);
    const late = render("research", 45 * MINUTE);
    expect(early).toContain("Started less than a minute ago.");
    expect(late).toContain("Started 45 minutes ago.");
    expect(late.replace("Started 45 minutes ago.", "")).toBe(early.replace("Started less than a minute ago.", ""));
    expect(late).not.toMatch(/\d+%/);
  });

  test("it warns that corrections may add steps, until no more rounds are left", () => {
    expect(render("review")).toContain("more steps follow");
    const repair = render("repair");
    expect(repair).not.toContain("more steps follow");
    expect(repair).toContain("Step 4 of 5: Making the corrections from the review");
    expect(repair).toContain('aria-valuenow="3"');
    expect(repair).toContain("Second review");
    expect(render("repair", null, 0, { correctionRound: 1, maxCorrectionRounds: 3 })).toContain("more steps follow");
    expect(render("recheck", null, 0, { correctionRound: 3, maxCorrectionRounds: 3 })).not.toContain("more steps follow");
  });

  test("a later round shows its place in the longer bar", () => {
    const html = render("repair", null, 0, { correctionRound: 2, maxCorrectionRounds: 3 });
    expect(html).toContain("Step 6 of 7: Making the corrections from the review (round 2 of 3)");
    expect(html).toContain('aria-valuemax="7"');
    expect(html).toContain('aria-valuenow="5"');
    expect(html).toContain("Corrections, round 2");
    expect(html).toContain("Third review");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  test("an unknown stage falls back to a plain message without inventing progress", () => {
    const html = render("writing");
    expect(html).toContain("A guide for Revelation 2 is being written.");
    expect(html).not.toContain("progressbar");
    expect(html).not.toContain("Step ");
  });

  test("without a known time, it doesn't claim one", () => {
    expect(render("write", null)).not.toContain("Started");
    expect(render("write", 1000, 2000)).toContain("Started less than a minute ago.");
    expect(render("write", MINUTE)).toContain("Started 1 minute ago.");
  });
});

describe("rounds an owner adds", () => {
  test("a continued job keeps its finished steps and adds its later rounds", () => {
    const progress = chapterGuideProgress("repair", { correctionRound: 4, maxCorrectionRounds: 6 })!;
    expect(progress).toMatchObject({ completedSteps: 9, stepNumber: 10, activity: "Making the corrections from the review (round 4 of 6)", correctionsMayFollow: true });
    expect(progress.steps.slice(-2).map((step) => step.label)).toEqual(["Corrections, round 4", "Fifth review"]);
    expect(chapterGuideProgress("recheck", { correctionRound: 6, maxCorrectionRounds: 6 })).toMatchObject({ stepNumber: 15, correctionsMayFollow: false });
  });
});

describe("the full page's pending status", () => {
  const chapter = { volume: "newtestament", book: "revelation", chapter: 2 };
  const unknownYet: ChapterGuideSelection = { state: null, stateLoadedAt: null, loadFailed: false, requesting: false, requestError: null, request: async () => {} };
  const stillWriting = { reference: "Revelation 2", href: "/chapter-guides/newtestament/revelation/2", hasGuide: false, resources: [], generating: { stage: "review", startedAt: 0 }, availability: null };

  function renderPending(result: Partial<ChapterGuideSelection>) {
    selection.hook.mockReturnValue({ ...unknownYet, ...result });
    return renderToStaticMarkup(createElement(ChapterGuidePendingStatus, { chapter, reference: "Revelation 2", generating: { stage: "write", startedAt: 0 }, renderedAt: MINUTE }));
  }

  beforeEach(() => selection.hook.mockReset());

  test("it tells the session a guide is expected, and shows the rendered stage until it hears otherwise", () => {
    const html = renderPending({});
    expect(selection.hook).toHaveBeenCalledWith(chapter, "1", { expectGenerating: true });
    expect(html).toContain("Step 2 of 3: Writing the guide");
    expect(html).toContain("Started 1 minute ago.");
  });

  test("a job that comes back held for review stops showing progress and gets the warm message", () => {
    const held = { reference: "Revelation 2", href: "/chapter-guides/newtestament/revelation/2", hasGuide: false, resources: [], generating: null, availability: "needs_review" as const, cooldown: null };
    const html = renderPending({ state: held, stateLoadedAt: MINUTE });
    expect(html).toContain("This one needs a little additional human review.");
    expect(html).not.toContain("progressbar");
  });

  test("a failed first check doesn't claim the guide is being written", () => {
    const html = renderPending({ loadFailed: true });
    expect(html).toContain("We couldn’t check on the guide for Revelation 2");
    expect(html).toContain("Last known step: Writing the guide.");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("is being written");
    expect(html).not.toContain("progressbar");
  });

  test("a failed later check names the latest stage it heard about", () => {
    const html = renderPending({ state: stillWriting, stateLoadedAt: MINUTE, loadFailed: true });
    expect(html).toContain("Last known step: Reviewing the draft.");
    expect(html).not.toContain("progressbar");
  });

  test("a successful check brings the progress bar back", () => {
    const html = renderPending({ state: stillWriting, stateLoadedAt: MINUTE, loadFailed: false });
    expect(html).toContain("Step 3 of 3: Reviewing the draft");
    expect(html).not.toContain("couldn’t check");
  });

  test("the connection message names the correction round it last heard about", () => {
    const message = chapterGuideConnectionMessage("Revelation 2", { stage: "recheck", startedAt: 0, correctionRound: 2, maxCorrectionRounds: 3 });
    expect(message).toContain("Last known step: Reviewing the corrections (round 2 of 3).");
  });

  test("an unknown stage is left out of the connection message", () => {
    const message = chapterGuideConnectionMessage("Revelation 2", { stage: "writing", startedAt: 0 });
    expect(message).not.toContain("Last known step");
    expect(message).toContain("We’ll keep checking");
  });
});

describe("the cooldown message", () => {
  test.each([
    ["research", "stopped during research"],
    ["write", "stopped during writing"],
    ["review", "stopped during review"],
    ["repair", "stopped during corrections"],
    ["recheck", "stopped during the review of its corrections"],
    ["unknown", "didn’t finish"],
  ])("a failure at %s says %s", (failedStage, expected) => {
    const message = chapterGuideCooldownMessage({ retryAt: 2 * HOUR, failedStage }, 0);
    expect(message).toContain(expected);
    expect(message).toContain("nothing was saved");
  });

  test.each([
    [12 * HOUR, "in about 12 hours"],
    [11 * HOUR + 1, "in about 12 hours"],
    [HOUR, "in about 1 hour."],
    [HOUR - 1, "in about 60 minutes"],
    [30 * MINUTE, "in about 30 minutes"],
    [MINUTE, "in about 1 minute."],
    [1, "in about 1 minute."],
    [0, "requested again soon."],
    [-HOUR, "requested again soon."],
  ])("with %i ms left, it says %s", (remaining, expected) => {
    expect(chapterGuideCooldownMessage({ retryAt: 1000 + remaining, failedStage: "write" }, 1000)).toContain(expected);
  });

  test("details are used only when the state is a cooldown", () => {
    const cooldown = { retryAt: HOUR, failedStage: "write" };
    expect(chapterGuideUnavailableMessage({ availability: "cooldown", cooldown }, 0)).toContain("stopped during writing");
    expect(chapterGuideUnavailableMessage({ availability: "cooldown", cooldown }, null)).toContain("A recent attempt");
    expect(chapterGuideUnavailableMessage({ availability: "paused", cooldown }, 0)).toContain("paused");
    expect(chapterGuideUnavailableMessage({ availability: "available" }, 0)).toBeNull();
    expect(chapterGuideUnavailableMessage({ availability: null }, 0)).toBeNull();
  });
});
