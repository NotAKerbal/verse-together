import { describe, expect, test } from "vitest";
import {
  EXPLORE_COLLAPSED,
  lookupStatus,
  nextExploreOpen,
  sectionStatus,
  visibleSources,
  type ExploreOpenAction,
  type ExploreOpenState,
  type SourceStatus,
} from "../src/lib/exploreSources";

const hasMatches = (data: { matches: number[] }) => data.matches.length > 0;

describe("Explore source statuses", () => {
  test("a lookup is found or empty only once it has loaded", () => {
    expect(lookupStatus({ status: "idle" }, hasMatches)).toBe("loading");
    expect(lookupStatus({ status: "loading" }, hasMatches)).toBe("loading");
    expect(lookupStatus({ status: "error" }, hasMatches)).toBe("error");
    expect(lookupStatus({ status: "ready", data: { matches: [] } }, hasMatches)).toBe("empty");
    expect(lookupStatus({ status: "ready", data: { matches: [1] } }, hasMatches)).toBe("found");
  });

  test("a section shows anything found, waits on loading, keeps failures, and hides only when all are empty", () => {
    expect(sectionStatus(["empty", "found", "error"])).toBe("found");
    expect(sectionStatus(["empty", "loading", "error"])).toBe("loading");
    expect(sectionStatus(["empty", "error"])).toBe("error");
    expect(sectionStatus(["empty", "empty"])).toBe("empty");
    expect(sectionStatus([])).toBe("empty");
  });

  test("empty sources drop out, keeping the rest in order", () => {
    const sources: { key: string; status: SourceStatus }[] = [
      { key: "hebrew", status: "empty" },
      { key: "greek", status: "found" },
      { key: "aramaic", status: "loading" },
      { key: "latin", status: "error" },
    ];
    expect(visibleSources(sources).map((source) => source.key)).toEqual(["greek", "aramaic", "latin"]);
    expect(visibleSources([{ key: "hebrew", status: "empty" }])).toEqual([]);
  });
});

describe("Explore's open sections and results", () => {
  const run = (...actions: ExploreOpenAction[]): ExploreOpenState => actions.reduce(nextExploreOpen, EXPLORE_COLLAPSED);
  const section = (key: "helps" | "languages" | "english"): ExploreOpenAction => ({ type: "toggleSection", section: key });
  const row = (key: string): ExploreOpenAction => ({ type: "toggleRow", row: key });

  test("everything starts collapsed, and a result can't open without its section", () => {
    expect(EXPLORE_COLLAPSED).toEqual({ section: null, row: null });
    expect(run(row("tg"))).toEqual(EXPLORE_COLLAPSED);
  });

  test("opening a section closes the one that was open, and its results start closed", () => {
    expect(run(section("helps"))).toEqual({ section: "helps", row: null });
    expect(run(section("helps"), row("tg"), section("english"))).toEqual({ section: "english", row: null });
    expect(run(section("helps"), row("tg"), section("english"), section("helps"))).toEqual({ section: "helps", row: null });
    expect(run(section("languages"), section("languages"))).toEqual(EXPLORE_COLLAPSED);
  });

  test("one result is open at a time, and toggling it again closes it", () => {
    expect(run(section("languages"), row("hebrew:H3205"))).toEqual({ section: "languages", row: "hebrew:H3205" });
    expect(run(section("languages"), row("hebrew:H3205"), row("greek:G1080"))).toEqual({ section: "languages", row: "greek:G1080" });
    expect(run(section("languages"), row("hebrew:H3205"), row("hebrew:H3205"))).toEqual({ section: "languages", row: null });
    // Closing the section closes its result too.
    expect(run(section("english"), row("dictionary:1"), section("english"))).toEqual(EXPLORE_COLLAPSED);
  });
});
