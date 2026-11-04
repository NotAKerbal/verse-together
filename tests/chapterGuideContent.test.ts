// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  budgetPeriodKey,
  effectiveMonthlyCapMicros,
  isValidTokenUsage,
  jobReservationMicros,
  MAX_CORRECTIONS_BYTES,
  MAX_EVIDENCE_BYTES,
  MAX_FEEDBACK_BYTES,
  MAX_GUIDE_BYTES,
  MAX_RESEARCH_PACKET_BYTES,
  nextPeriodExposure,
  PROVIDER_FRAMING_BYTES,
  requestInputBytes,
  reservationFits,
  secretsMatch,
  stageMaxInputBytes,
  usageCostMicros,
  utf8Bytes,
} from "../convex/chapterGuideBudget";
import {
  applyGuideRepair,
  buildResearchPacket,
  canonicalGuideSourceUrl,
  type ChapterGuideContent,
  correctionsFitBound,
  correctionTargetKey,
  GUIDE_JSON_SCHEMA,
  type GuideRepair,
  invalidCorrectionTargets,
  parseGuideContent,
  parseGuideRepair,
  parseGuideReview,
  publishedSources,
  RECHECK_INSTRUCTIONS,
  recheckInput,
  REPAIR_JSON_SCHEMA,
  REPAIR_SYSTEM_PROMPT,
  repairUserPrompt,
  RESEARCH_INSTRUCTIONS,
  RESEARCH_JSON_SCHEMA,
  RESEARCH_WEB_SEARCH_TOOL,
  researchInput,
  REVIEW_INSTRUCTIONS,
  REVIEW_JSON_SCHEMA,
  reviewInput,
  unverifiedLongQuotations,
  validateGuideContent,
  WRITER_SYSTEM_PROMPT,
  writerUserPrompt,
} from "../convex/chapterGuideContent";
import { readOpenAiResponse } from "../convex/chapterGuideProviders";

const VERSES = [
  { verse: 1, text: "And it came to pass that the people gathered together in the land." },
  { verse: 2, text: "And they did hearken unto the words of the prophet with gladness." },
  { verse: 3, text: "And there was peace among them all the days of their lives." },
];
const words = (count: number) => Array(count).fill("word").join(" ");
const SOURCES = [{ id: "S1", title: "Manual", url: "https://www.churchofjesuschrist.org/study/manual" }];

function guide(overrides: Partial<ChapterGuideContent> = {}): ChapterGuideContent {
  return {
    title: "A guide",
    overview: [words(400)],
    historical_context: { paragraphs: [words(200)], source_ids: ["S1"] },
    significant_insights: [
      { title: "One", verse_start: 1, verse_end: 1, paragraphs: [words(100)], source_ids: [] },
      { title: "Two", verse_start: 2, verse_end: 3, paragraphs: [words(100)], source_ids: [] },
    ],
    passages: [
      { verse_start: 1, verse_end: 2, heading: "A", original_meaning: [words(200)], latter_day_saint_application: [], cross_references: [], questions: ["Why?"], source_ids: ["S1"] },
      { verse_start: 3, verse_end: 3, heading: "B", original_meaning: [words(200)], latter_day_saint_application: [], cross_references: [], questions: ["How?"], source_ids: [] },
    ],
    source_use: [],
    limitations: [],
    ...overrides,
  };
}

const [firstPassage, secondPassage] = guide().passages as [ChapterGuideContent["passages"][number], ChapterGuideContent["passages"][number]];

describe("the guide must cover the chapter", () => {
  test("a complete guide passes", () => {
    expect(validateGuideContent(guide(), VERSES, SOURCES)).toEqual([]);
  });

  test("missing, repeated, and out-of-range verses are all caught", () => {
    expect(validateGuideContent(guide({ passages: [firstPassage] }), VERSES, SOURCES)).toContain("Verse 3 is not covered by a passage.");
    expect(validateGuideContent(guide({ passages: [firstPassage, { ...secondPassage, verse_start: 2 }] }), VERSES, SOURCES)).toContain("Verse 2 is covered by more than one passage.");
    expect(validateGuideContent(guide({ passages: [firstPassage, { ...secondPassage, verse_end: 4 }] }), VERSES, SOURCES)).toContain("Verses 3-4 include verse 4, which is not in this chapter.");
  });

  test("an enormous verse range from the model is rejected without walking it", () => {
    const errors = validateGuideContent(guide({ passages: [firstPassage, { ...secondPassage, verse_end: 1e12 }] }), VERSES, SOURCES);
    expect(errors).toContain("Verses 3-1000000000000 run past the end of the chapter.");
    expect(errors.length).toBeLessThan(300);
  });

  test("every passage needs its meaning and a question, and the guide needs real length and insights", () => {
    const errors = validateGuideContent(
      guide({ overview: [], significant_insights: [], passages: [{ ...firstPassage, original_meaning: [], questions: [] }, secondPassage] }),
      VERSES,
      SOURCES
    );
    expect(errors).toEqual(expect.arrayContaining([
      "The guide needs an overview.",
      "Select at least two significant insights.",
      "Verses 1-2 need commentary on the original meaning.",
      "Verses 1-2 need a study question.",
    ]));
    expect(errors.some((error) => error.includes("it needs at least"))).toBe(true);
  });
});

describe("sources and quotations", () => {
  test("a source id that isn't in the research packet is rejected", () => {
    const errors = validateGuideContent(guide({ passages: [{ ...firstPassage, source_ids: ["S9"] }, secondPassage] }), VERSES, SOURCES);
    expect(errors).toContain("Source S9 is not in the research packet.");
  });

  test("only sources the guide actually cites are published", () => {
    const sources = [...SOURCES, { id: "S2", title: "Unused", url: "https://scripturecentral.org/x" }];
    const content = guide({ source_use: [{ source_id: "S1", use: "Background." }] });
    expect(publishedSources(content, sources)).toEqual([{ ...SOURCES[0], use: "Background." }]);
  });

  test("long quotations must match the chapter; short phrases and ellipses are fine", () => {
    expect(unverifiedLongQuotations(["They “did hearken unto the words of the prophet with gladness” here."], VERSES)).toEqual([]);
    expect(unverifiedLongQuotations(["“people gathered together in the land … hearken unto the words of the prophet”"], VERSES)).toEqual([]);
    expect(unverifiedLongQuotations(["They called it “a good thing” there."], VERSES)).toEqual([]);
    expect(unverifiedLongQuotations(["“And there was war among them all the days of their lives”"], VERSES)).toHaveLength(1);
    const errors = validateGuideContent(guide({ overview: [`${words(400)} "a modern author wrote this exact long sentence here"`] }), VERSES, SOURCES);
    expect(errors.some((error) => error.includes("does not match this chapter's text"))).toBe(true);
  });

  test("research notes keep only URLs the search returned, on allowed sites", () => {
    const consulted = new Map([["churchofjesuschrist.org/study/manual", { title: "Manual", url: SOURCES[0]!.url }]]);
    const packet = buildResearchPacket(
      JSON.stringify({
        notes: [
          { kind: "historical_context", verse_start: 1, verse_end: 2, claim: "Kept.", attribution: "The Church", source_urls: ["https://www.churchofjesuschrist.org/study/manual/", "https://evil.example/x"] },
          { kind: "scholarly_interpretation", verse_start: 1, verse_end: 1, claim: "Never searched.", attribution: "Someone", source_urls: ["https://scripturecentral.org/not-returned"] },
          { kind: "historical_context", verse_start: 99, verse_end: 99, claim: "Out of range.", attribution: "The Church", source_urls: [SOURCES[0]!.url] },
          { kind: "made_up", verse_start: 1, verse_end: 1, claim: "Bad kind.", attribution: "The Church", source_urls: [SOURCES[0]!.url] },
        ],
        unresolved: ["The date is uncertain."],
      }),
      consulted,
      VERSES
    );
    expect(packet?.notes.map((note) => note.claim)).toEqual(["Kept."]);
    expect(packet?.sources).toEqual([{ id: "S1", title: "Manual", url: SOURCES[0]!.url }]);
    expect(packet?.unresolved).toEqual(["The date is uncertain."]);
    expect(buildResearchPacket("not json", consulted, VERSES)).toBeNull();
    expect(buildResearchPacket(JSON.stringify({ notes: [], unresolved: [] }), consulted, VERSES)).toBeNull();
  });

  test("source URLs must be web pages on allowed sites", () => {
    expect(canonicalGuideSourceUrl("https://evil.example/x")).toBeNull();
    expect(canonicalGuideSourceUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalGuideSourceUrl("https://user:pass@churchofjesuschrist.org/x")).toBeNull();
    expect(canonicalGuideSourceUrl("https://churchofjesuschrist.org.evil.example/x")).toBeNull();
    expect(canonicalGuideSourceUrl("http://www.churchofjesuschrist.org/study/x?lang=eng")).toEqual({
      key: "churchofjesuschrist.org/study/x",
      url: "https://www.churchofjesuschrist.org/study/x?lang=eng",
    });
    expect(canonicalGuideSourceUrl("https://johnhiltoniii.com/findingchrist")).not.toBeNull();
  });

  test("different pages behind one path stay different sources, while tracking and language don't split a page", () => {
    const key = (url: string) => canonicalGuideSourceUrl(url)?.key;
    expect(key("https://scripturecentral.org/archive?p=1")).toBe("scripturecentral.org/archive?p=1");
    expect(key("https://scripturecentral.org/archive?p=1")).not.toBe(key("https://scripturecentral.org/archive?p=2"));
    expect(key("https://scripturecentral.org/archive?p=1&q=2")).toBe(key("https://scripturecentral.org/archive?q=2&p=1"));
    expect(key("https://scripturecentral.org/archive?p=1&utm_source=x&fbclid=y")).toBe(key("https://scripturecentral.org/archive?p=1"));
    expect(key("https://www.churchofjesuschrist.org/study/x?lang=eng&id=p3#p3")).toBe(key("https://www.churchofjesuschrist.org/study/x"));
    expect(key("https://scripturecentral.org/archive?id=1")).not.toBe(key("https://scripturecentral.org/archive?id=2"));
  });

  test("a note can't cite a page by sharing a path with a different page the search returned", () => {
    const returned = canonicalGuideSourceUrl("https://scripturecentral.org/archive?p=1")!;
    const consulted = new Map([[returned.key, { title: "One", url: returned.url }]]);
    const note = (source: string) => JSON.stringify({ notes: [{ kind: "historical_context", verse_start: 1, verse_end: 1, claim: "Claim.", attribution: "Author", source_urls: [source] }], unresolved: [] });
    expect(buildResearchPacket(note("https://scripturecentral.org/archive?p=2"), consulted, VERSES)).toBeNull();
    expect(buildResearchPacket(note("https://scripturecentral.org/archive?p=1&utm_source=x"), consulted, VERSES)?.sources).toEqual([{ id: "S1", title: "One", url: returned.url }]);
  });

  test("the search's own results and citations are what count as consulted", () => {
    const url = "https://scripturecentral.org/knowhy/1";
    const result = readOpenAiResponse({
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 40 } },
      output: [
        { type: "web_search_call", action: { sources: [{ url, title: "KnoWhy" }, { url: "https://evil.example/x", title: "No" }] } },
        { type: "web_search_call", action: {} },
        { type: "message", content: [{ type: "output_text", text: "{}", annotations: [] }] },
      ],
    });
    expect(Array.from(result.consultedSources.keys())).toEqual(["scripturecentral.org/knowhy/1"]);
    expect(result.usage).toEqual({ inputTokens: 60, cachedInputTokens: 40, cacheWriteTokens: 0, outputTokens: 10, webSearchCalls: 2 });
  });

  test("a response with no usage can't be priced and is treated as unknown", () => {
    expect(() => readOpenAiResponse({ status: "completed", output: [] })).toThrow("openai_usage_missing");
  });

  test.each([
    ["a negative count", { input_tokens: -1, output_tokens: 1 }],
    ["a fractional count", { input_tokens: 1.5, output_tokens: 1 }],
    ["an infinite count", { input_tokens: Number.POSITIVE_INFINITY, output_tokens: 1 }],
    ["a text count", { input_tokens: "10", output_tokens: 1 }],
    ["a null count", { input_tokens: null, output_tokens: 1 }],
    ["more cached tokens than input", { input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: 11 } }],
    ["cached and written tokens above input", { input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: 6, cache_write_tokens: 5 } }],
    ["a text cached count", { input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: "1" } }],
  ])("usage with %s can't be priced and fails closed", (_name, usage) => {
    expect(() => readOpenAiResponse({ status: "completed", usage, output: [] } as never)).toThrow("openai_usage_invalid");
  });

  test("malformed tool usage also fails closed", () => {
    const usage = { input_tokens: 10, output_tokens: 1 };
    expect(() => readOpenAiResponse({ status: "completed", usage, tool_usage: { web_search: { num_requests: -1 } }, output: [] })).toThrow("openai_usage_invalid");
    expect(() => readOpenAiResponse({ status: "completed", usage, tool_usage: { web_search: { num_requests: "2" } }, output: [] } as never)).toThrow("openai_usage_invalid");
  });

  test("cache writes come out of the plain input count, and billable searches can raise the search count", () => {
    const result = readOpenAiResponse({
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 40, cache_write_tokens: 20 } },
      tool_usage: { web_search: { num_requests: 3 } },
      output: [{ type: "web_search_call", action: {} }],
    });
    expect(result.usage).toEqual({ inputTokens: 40, cachedInputTokens: 40, cacheWriteTokens: 20, outputTokens: 10, webSearchCalls: 3 });
    const fewerBillable = readOpenAiResponse({
      status: "completed",
      usage: { input_tokens: 1, output_tokens: 1 },
      tool_usage: { web_search: { num_requests: 0 } },
      output: [{ type: "web_search_call", action: {} }],
    });
    expect(fewerBillable.usage.webSearchCalls).toBe(1);
  });

  test("the usage check accepts only safe, non-negative whole numbers", () => {
    const valid = { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, webSearchCalls: 0 };
    expect(isValidTokenUsage(valid)).toBe(true);
    expect(isValidTokenUsage({ ...valid, outputTokens: Number.NaN })).toBe(false);
    expect(isValidTokenUsage({ ...valid, outputTokens: 2 ** 60 })).toBe(false);
  });
});

describe("repairs", () => {
  const correction = (target: string) => ({ target, category: "factual", issue: "Wrong.", evidence: "Verse." });
  const noRepair: GuideRepair = { overview: null, historical_context: null, significant_insights: [], passages: [], limitations: null };

  test("a flagged section is replaced and every other section stays", () => {
    const original = guide();
    const replaced = { ...secondPassage, heading: "Corrected" };
    const applied = applyGuideRepair(original, { ...noRepair, passages: [replaced] }, [correction("passage:3-3")]);
    expect(applied.failureCode).toBeNull();
    expect(applied.guide.passages[1]?.heading).toBe("Corrected");
    expect(applied.guide.passages[0]).toEqual(firstPassage);
    expect(applied.guide.overview).toEqual(original.overview);
  });

  test("replacements must match a real section", () => {
    const original = guide();
    const invalid = applyGuideRepair(original, { ...noRepair, significant_insights: [{ index: 9, insight: original.significant_insights[0]! }], passages: [{ ...secondPassage, verse_start: 2 }] }, [correction("passage:3-3")]);
    expect(invalid.failureCode).toBe("repair_invalid");
    expect(invalid.guide.passages).toEqual(original.passages);
  });

  test("a replacement of a section nobody flagged is refused and not applied", () => {
    const original = guide();
    const applied = applyGuideRepair(original, { ...noRepair, overview: ["Rewritten."], passages: [{ ...secondPassage, heading: "Corrected" }] }, [correction("passage:3-3")]);
    expect(applied.failureCode).toBe("repair_out_of_scope");
    expect(applied.guide.overview).toEqual(original.overview);
  });

  test("an empty repair, or one that leaves a flagged section unchanged, is a no-op", () => {
    const original = guide();
    expect(applyGuideRepair(original, noRepair, [correction("overview")]).failureCode).toBe("repair_noop");
    expect(applyGuideRepair(original, parseGuideRepair("{}")!, [correction("overview")]).failureCode).toBe("repair_noop");
    expect(applyGuideRepair(original, { ...noRepair, passages: [secondPassage] }, [correction("passage:3-3")]).failureCode).toBe("repair_noop");
    const reordered = Object.fromEntries(Object.entries(secondPassage).reverse()) as typeof secondPassage;
    expect(applyGuideRepair(original, { ...noRepair, passages: [reordered] }, [correction("passage:3-3")]).failureCode).toBe("repair_noop");
    expect(applyGuideRepair(original, { ...noRepair, overview: ["Fixed."] }, [correction("overview"), correction("historical_context")]).failureCode).toBe("repair_noop");
  });

  test("replacing one section twice is refused", () => {
    const replaced = { ...secondPassage, heading: "Corrected" };
    expect(applyGuideRepair(guide(), { ...noRepair, passages: [replaced, replaced] }, [correction("passage:3-3")]).failureCode).toBe("repair_invalid");
  });

  test("a correction must name a section of this guide", () => {
    const original = guide();
    expect(correctionTargetKey("overview", original)).toBe("overview");
    expect(correctionTargetKey("insight:1", original)).toBe("insight:1");
    expect(correctionTargetKey("passage:3-3", original)).toBe("passage:3-3");
    for (const target of ["", "title", "insight:2", "passage:3-4", "passage:3", "the whole guide"]) {
      expect(correctionTargetKey(target, original)).toBeNull();
    }
    expect(invalidCorrectionTargets(original, [correction("overview"), correction("title")])).toEqual(["title"]);
    expect(applyGuideRepair(original, { ...noRepair, overview: ["Fixed."] }, [correction("title"), correction("overview")]).failureCode).toBe("repair_invalid");
  });

  test("a review with a malformed required correction isn't read as having none", () => {
    const review = (required_corrections: unknown[]) => JSON.stringify({ summary: "Fine.", required_corrections, optional_improvements: [], unverifiable: [] });
    expect(parseGuideReview(review([]))?.required_corrections).toEqual([]);
    expect(parseGuideReview(review([correction("overview")]))?.required_corrections).toHaveLength(1);
    expect(parseGuideReview(review([{ target: "overview", issue: "  " }]))).toBeNull();
    expect(parseGuideReview(review(["overview is wrong"]))).toBeNull();
    expect(parseGuideReview("{}")).toBeNull();
  });

  test("oversized corrections don't fit the bound the repair and recheck were reserved for", () => {
    const big = { ...correction("overview"), issue: "x".repeat(1000), evidence: "x".repeat(1000) };
    expect(correctionsFitBound([big])).toBe(true);
    expect(correctionsFitBound(Array.from({ length: 15 }, () => big))).toBe(true);
    expect(correctionsFitBound(Array.from({ length: 15 }, () => ({ ...big, issue: "€".repeat(1000), evidence: "€".repeat(1000) })))).toBe(false);
  });

  test("feedback and research stay labeled as data in the writer's prompt", () => {
    const prompt = writerUserPrompt({
      reference: "Alma 1",
      verses: VERSES,
      research: { sources: SOURCES, notes: [], unresolved: [] },
      feedback: ["Verse 3 is not covered by a passage."],
    });
    expect(prompt).toContain("<research_packet>");
    expect(prompt).toContain("- Verse 3 is not covered by a passage.");
  });

  test("a guide that isn't valid JSON or shape isn't parsed", () => {
    expect(parseGuideContent("nope")).toBeNull();
    expect(parseGuideContent("[]")).toBeNull();
    expect(parseGuideContent("{}")).toBeNull();
  });
});

describe("budget arithmetic", () => {
  test("prices match the verified rates", () => {
    const usage = (fields: Partial<Parameters<typeof usageCostMicros>[1]>) => ({ inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, webSearchCalls: 0, ...fields });
    expect(usageCostMicros("claude-opus-5-5", usage({ inputTokens: 1_000_000 }))).toBe(4_000_000);
    expect(usageCostMicros("claude-opus-5-5", usage({ outputTokens: 1_000_000 }))).toBe(20_000_000);
    expect(usageCostMicros("claude-opus-5-5", usage({ cachedInputTokens: 1_000_000 }))).toBe(200_000);
    expect(usageCostMicros("claude-opus-5-5", usage({ cacheWriteTokens: 1_000_000 }))).toBe(5_000_000);
    expect(usageCostMicros("gpt-5.6-luna", usage({ inputTokens: 1_000_000 }))).toBe(400_000);
    expect(usageCostMicros("gpt-5.6-luna", usage({ inputTokens: 100_000, outputTokens: 100_000 }))).toBe(20_000 + 120_000);
    expect(usageCostMicros("gpt-5.6-terra", usage({ inputTokens: 100_000, outputTokens: 100_000 }))).toBe(200_000 + 1_200_000);
    expect(usageCostMicros("gpt-5.6-luna", usage({ webSearchCalls: 3 }))).toBe(30_000);
    expect(usageCostMicros("gpt-5.6-luna", usage({ cacheWriteTokens: 100_000 }))).toBe(25_000);
    expect(usageCostMicros("gpt-5.6-luna", usage({ cacheWriteTokens: 300_000 }))).toBe(150_000);
    expect(usageCostMicros("gpt-5.6-terra", usage({ cacheWriteTokens: 100_000 }))).toBe(250_000);
    expect(usageCostMicros("gpt-5.6-terra", usage({ cacheWriteTokens: 300_000 }))).toBe(1_500_000);
  });

  test("a 43-verse chapter's reservation matches the docs and stays well under the cap", () => {
    const reservation = jobReservationMicros(43, utf8Bytes(words(1000)));
    expect(reservation).toBeGreaterThan(6_000_000);
    expect(reservation).toBeLessThan(7_000_000);
    expect(jobReservationMicros(176, 32 * 1024)).toBeLessThan(10_000_000);
  });

  test("a request's size counts its prompt, its JSON schema, its tools, and an allowance for provider framing", () => {
    const schema = { type: "object" };
    expect(requestInputBytes({ system: "ab", user: "cd", schema })).toBe(4 + JSON.stringify(schema).length + PROVIDER_FRAMING_BYTES);
    expect(requestInputBytes({ system: "ab", user: "cd", schema, tools: { type: "web_search" } })).toBeGreaterThan(requestInputBytes({ system: "ab", user: "cd", schema }));
  });

  test("each stage's largest allowed request fits the input bound its cost was reserved for", () => {
    const fill = (bytes: number) => "x".repeat(bytes);
    const verses = [{ verse: 1, text: fill(1000) }];
    const chapterBytes = utf8Bytes(`1. ${verses[0]!.text}`);
    const research = { sources: [], notes: [], unresolved: [fill(MAX_RESEARCH_PACKET_BYTES - 60)] };
    const draft = guide({ title: fill(MAX_GUIDE_BYTES - utf8Bytes(JSON.stringify(guide())) - 10) });
    const corrections = [{ target: "overview", category: "", issue: fill(MAX_CORRECTIONS_BYTES - 80), evidence: "" }];
    const feedback = [fill(MAX_FEEDBACK_BYTES - 10)];
    const evidence = [{ reference: fill(MAX_EVIDENCE_BYTES - 40), status: "not_supplied" as const }];
    const sizes = {
      research: requestInputBytes({ system: RESEARCH_INSTRUCTIONS, user: researchInput("Alma 1", verses), schema: RESEARCH_JSON_SCHEMA, tools: RESEARCH_WEB_SEARCH_TOOL }),
      write: requestInputBytes({ system: WRITER_SYSTEM_PROMPT, user: writerUserPrompt({ reference: "Alma 1", verses, research, evidence, feedback }), schema: GUIDE_JSON_SCHEMA }),
      review: requestInputBytes({ system: REVIEW_INSTRUCTIONS, user: reviewInput({ reference: "Alma 1", verses, research, guide: draft, evidence }), schema: REVIEW_JSON_SCHEMA }),
      repair: requestInputBytes({ system: REPAIR_SYSTEM_PROMPT, user: repairUserPrompt({ reference: "Alma 1", verses, research, guide: draft, corrections, evidence }), schema: REPAIR_JSON_SCHEMA }),
      recheck: requestInputBytes({ system: RECHECK_INSTRUCTIONS, user: recheckInput({ reference: "Alma 1", verses, research, guide: draft, corrections, evidence }), schema: REVIEW_JSON_SCHEMA }),
    };
    for (const [stage, size] of Object.entries(sizes)) {
      expect(size, stage).toBeLessThanOrEqual(stageMaxInputBytes(stage as keyof typeof sizes, chapterBytes));
    }
  });

  test("the cap includes the margin and can't be raised", () => {
    const base = { capMicros: 100_000_000, spentMicros: 0, reservedMicros: 0 };
    expect(reservationFits({ ...base, requestedMicros: 98_000_000 })).toBe(true);
    expect(reservationFits({ ...base, requestedMicros: 98_000_001 })).toBe(false);
    expect(effectiveMonthlyCapMicros(undefined)).toBe(100_000_000);
    expect(effectiveMonthlyCapMicros(500_000_000)).toBe(100_000_000);
    expect(effectiveMonthlyCapMicros(Number.NaN)).toBe(100_000_000);
    expect(effectiveMonthlyCapMicros(-5)).toBe(0);
  });

  test("periods are UTC months", () => {
    expect(budgetPeriodKey(Date.UTC(2026, 10, 30, 23, 59))).toBe("2026-11");
    expect(budgetPeriodKey(Date.UTC(2026, 11, 1, 0, 0))).toBe("2026-12");
  });

  test("a call whose lease reaches into the next month has exposure there", () => {
    expect(nextPeriodExposure(Date.UTC(2026, 10, 30, 23, 59), Date.UTC(2026, 11, 1, 0, 5))).toBe("2026-12");
    expect(nextPeriodExposure(Date.UTC(2026, 10, 30, 23, 0), Date.UTC(2026, 10, 30, 23, 5))).toBeNull();
    expect(nextPeriodExposure(Date.UTC(2026, 11, 31, 23, 59), Date.UTC(2027, 0, 1, 0, 5))).toBe("2027-01");
  });

  test("secrets compare whole values and an empty secret never matches", () => {
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("abc", "abd")).toBe(false);
    expect(secretsMatch("abc", "abcd")).toBe(false);
    expect(secretsMatch("", "")).toBe(false);
  });
});
