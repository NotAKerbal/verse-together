// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { jobReservationMicros, MAX_EVIDENCE_BYTES, stageMaxCostMicros, stageMaxInputBytes, utf8Bytes } from "../convex/chapterGuideBudget";
import {
  buildResearchPacket,
  type ChapterGuideContent,
  MAX_PASSAGE_VERSES,
  RECHECK_INSTRUCTIONS,
  recheckInput,
  repairUserPrompt,
  RESEARCH_INSTRUCTIONS,
  REVIEW_INSTRUCTIONS,
  reviewInput,
  validateGuideContent,
  WRITER_SYSTEM_PROMPT,
  writerUserPrompt,
} from "../convex/chapterGuideContent";
import {
  guideEvidenceRequests,
  lookupCrossReferenceEvidence,
  MAX_EVIDENCE_CHAPTERS,
  MAX_EVIDENCE_REFERENCES,
  MAX_EVIDENCE_VERSES_PER_REFERENCE,
  scriptureSiteOrigin,
} from "../convex/chapterGuideEvidence";

const SITE = "https://www.versetogether.org/";
const MOSIAH_1 = {
  reference: "Mosiah 1",
  verses: [
    { verse: 1, text: "And now there was no more contention." },
    { verse: 2, text: "And he caused that they should be taught in all the language of his fathers." },
    { verse: 3, text: "And he also taught them concerning the records." },
    { verse: 4, text: "For it were not possible that our father, Lehi, could have remembered all these things, for he having been taught in the language of the Egyptians." },
  ],
};

function chapterFetch(body: unknown = MOSIAH_1, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const request = (overrides: object = {}) => ({ reference: "Mosiah 1:2-4", volume: "bookofmormon", book: "mosiah", chapter: 1, verse_start: 2, verse_end: 4, ...overrides });

const baseGuide: ChapterGuideContent = {
  title: "A guide",
  overview: ["Compare Moroni 10:3 and 1 Nephi 1:20 here."],
  historical_context: { paragraphs: ["Context."], source_ids: [] },
  significant_insights: [],
  passages: [
    {
      verse_start: 1,
      verse_end: 2,
      heading: "A",
      original_meaning: ["Meaning, see Moroni 10:3."],
      latter_day_saint_application: [],
      cross_references: [{ ...request(), note: "Compare." }, { ...request(), note: "Again." }],
      questions: ["Why?"],
      source_ids: [],
    },
  ],
  source_use: [],
  limitations: [],
};

describe("which passages are looked up", () => {
  test("every cited coordinate once, structured first, skipping the guide's own chapter", () => {
    const requests = guideEvidenceRequests(baseGuide, "1 Nephi 1");
    expect(requests.map((item) => item.reference)).toEqual(["Mosiah 1:2-4", "Moroni 10:3"]);
    expect(requests[1]).toMatchObject({ volume: "bookofmormon", book: "moroni", chapter: 10, verse_start: 3, verse_end: 3 });
  });
});

describe("looking up cited scripture", () => {
  test("the text comes from the site's scripture route, chosen only from canonical coordinates", async () => {
    const fetcher = chapterFetch();
    const [entry] = await lookupCrossReferenceEvidence([request()], SITE, fetcher);
    expect(entry).toEqual({ reference: "Mosiah 1:2-4", status: "supplied", canonical_reference: "Mosiah 1:2–4", verses: MOSIAH_1.verses.slice(1) });
    expect(JSON.stringify(entry)).toContain("language of the Egyptians");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://www.versetogether.org/api/scriptures/lds-chapter?volume=bookofmormon&book=mosiah&chapter=1");
    expect(init).toMatchObject({ redirect: "error" });
  });

  test("a model's coordinates can't name another site, path, or query", async () => {
    const fetcher = chapterFetch();
    const hostile = [
      request({ book: "https://evil.example/x" }),
      request({ book: "../../admin" }),
      request({ volume: "bookofmormon&admin=1" }),
      request({ volume: "newtestament" }),
      request({ chapter: 9999 }),
      request({ verse_start: 4, verse_end: 2 }),
    ];
    const results = await lookupCrossReferenceEvidence(hostile, SITE, fetcher);
    expect(results.map((item) => item.status)).toEqual(Array(6).fill("invalid_reference"));
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("pearl and pearlofgreatprice name the same volume", async () => {
    const fetcher = chapterFetch({ reference: "Moses 1", verses: [{ verse: 9, text: "A" }, { verse: 10, text: "B" }] });
    const [entry] = await lookupCrossReferenceEvidence([request({ reference: "Moses 1:9-10", volume: "pearlofgreatprice", book: "moses", verse_start: 9, verse_end: 10 })], SITE, fetcher);
    expect(entry!.status).toBe("supplied");
    expect(fetcher.mock.calls[0]![0]).toContain("volume=pearl&book=moses");
  });

  test.each([
    ["no configured site", undefined, () => chapterFetch()],
    ["a site that fails", SITE, () => chapterFetch({}, 500)],
    ["a malformed answer", SITE, () => chapterFetch({ verses: [{ verse: "x" }] })],
    ["a network failure", SITE, () => vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch],
  ])("with %s, the text is reported as unavailable, never invented", async (_name, site, makeFetcher) => {
    const results = await lookupCrossReferenceEvidence([request()], site, makeFetcher());
    expect(results).toEqual([{ reference: "Mosiah 1:2-4", status: "unavailable" }]);
  });

  test("verses a chapter doesn't have are an invalid reference, not a partial text", async () => {
    const [entry] = await lookupCrossReferenceEvidence([request({ verse_end: 40 })], SITE, chapterFetch());
    expect(entry).toEqual({ reference: "Mosiah 1:2-4", status: "invalid_reference" });
  });

  test("a long passage isn't supplied", async () => {
    const verses = Array.from({ length: 80 }, (_, index) => ({ verse: index + 1, text: "x" }));
    const [entry] = await lookupCrossReferenceEvidence([request({ verse_start: 1, verse_end: MAX_EVIDENCE_VERSES_PER_REFERENCE + 1 })], SITE, chapterFetch({ verses }));
    expect(entry!.status).toBe("not_supplied");
  });

  test("references, chapter fetches, and total text stay inside their bounds", async () => {
    const verses = Array.from({ length: 30 }, (_, index) => ({ verse: index + 1, text: "word ".repeat(20) }));
    const fetcher = chapterFetch({ verses });
    const requests = Array.from({ length: MAX_EVIDENCE_REFERENCES + 10 }, (_, index) =>
      request({ reference: `Alma ${index + 1}:1-30`, book: "alma", chapter: index + 1, verse_start: 1, verse_end: 30 })
    );
    const results = await lookupCrossReferenceEvidence(requests, SITE, fetcher);
    expect(results.length).toBeLessThanOrEqual(MAX_EVIDENCE_REFERENCES);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(MAX_EVIDENCE_CHAPTERS);
    expect(utf8Bytes(JSON.stringify(results))).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
    expect(results.some((item) => item.status === "supplied")).toBe(true);
    expect(results.some((item) => item.status === "not_supplied")).toBe(true);
  });

  test("the site origin must be http(s), and only its origin is used", () => {
    expect(scriptureSiteOrigin("https://www.versetogether.org/some/path?x=1")).toBe("https://www.versetogether.org");
    expect(scriptureSiteOrigin("javascript:alert(1)")).toBeNull();
    expect(scriptureSiteOrigin("")).toBeNull();
    expect(scriptureSiteOrigin(undefined)).toBeNull();
  });
});

describe("budget for the added input", () => {
  test("every stage after research has the evidence bound in its input and cost", () => {
    const chapterBytes = 4000;
    expect(stageMaxInputBytes("research", chapterBytes)).toBeLessThan(stageMaxInputBytes("write", chapterBytes));
    for (const stage of ["write", "review", "repair", "recheck"] as const) {
      expect(stageMaxInputBytes(stage, chapterBytes)).toBeGreaterThanOrEqual(chapterBytes + MAX_EVIDENCE_BYTES);
      expect(stageMaxCostMicros(stage, 40, chapterBytes)).toBeGreaterThan(0);
    }
  });

  test("the job reservation stays well under the monthly cap", () => {
    expect(jobReservationMicros(176, 64 * 1024)).toBeLessThan(12_000_000);
  });
});

describe("what the models are told", () => {
  const research = { sources: [], notes: [], unresolved: [] };
  const evidence = [
    { reference: "Mosiah 1:2-4", status: "supplied" as const, canonical_reference: "Mosiah 1:2–4", verses: MOSIAH_1.verses.slice(1) },
    { reference: "Moroni 10:3", status: "unavailable" as const },
  ];

  test("each stage after research receives the cited text and its statuses", () => {
    const args = { reference: "1 Nephi 1", verses: MOSIAH_1.verses, research, guide: baseGuide, corrections: [], evidence };
    for (const input of [writerUserPrompt(args), reviewInput(args), recheckInput(args), repairUserPrompt(args)]) {
      expect(input).toContain("<cross_reference_texts>");
      expect(input).toContain("language of the Egyptians");
      expect(input).toContain('"status":"unavailable"');
    }
  });

  test("with nothing to supply, the block is empty rather than missing", () => {
    expect(reviewInput({ reference: "1 Nephi 1", verses: MOSIAH_1.verses, research, guide: baseGuide })).toContain("<cross_reference_texts>\n[]\n</cross_reference_texts>");
  });

  test("the reviewer abstains without text, and never denies scripture from memory", () => {
    for (const prompt of [REVIEW_INSTRUCTIONS, RECHECK_INSTRUCTIONS]) {
      expect(prompt).toContain("Never state from memory what a scripture says or leaves out");
      expect(prompt).toContain("abstain, put it in unverifiable");
      expect(prompt).toContain("name the verse you checked");
    }
  });

  test("silence isn't treated as a denial, and inference is labeled", () => {
    expect(REVIEW_INSTRUCTIONS).toContain("Absence is not negation");
    expect(REVIEW_INSTRUCTIONS).toContain("a note can contradict them");
    expect(WRITER_SYSTEM_PROMPT).toContain("Absence is not negation");
    expect(WRITER_SYSTEM_PROMPT).toContain("Mark anything you infer as inference");
  });

  test("the writer writes small groups, without labels the page already adds, using the app's volume ids", () => {
    expect(WRITER_SYSTEM_PROMPT).toContain(`never more than ${MAX_PASSAGE_VERSES}`);
    expect(WRITER_SYSTEM_PROMPT).toContain('do not begin a paragraph with "Application:"');
    expect(WRITER_SYSTEM_PROMPT).toContain("do not write disclaimers about AI");
    expect(WRITER_SYSTEM_PROMPT).not.toContain("pearlofgreatprice");
  });

  test("research picks its searches and supplies only coordinates, not URLs, for lookups", () => {
    expect(RESEARCH_INSTRUCTIONS).toContain("You choose your own searches");
    expect(RESEARCH_INSTRUCTIONS).toContain("as coordinates only");
    expect(RESEARCH_INSTRUCTIONS).toContain("give no URLs");
  });
});

describe("research candidates", () => {
  const verses = [{ verse: 1, text: "A" }, { verse: 2, text: "B" }];
  const url = "https://www.churchofjesuschrist.org/study/manual/x";
  const consulted = new Map([["churchofjesuschrist.org/study/manual/x", { title: "Manual", url }]]);
  const note = { kind: "historical_context", verse_start: 1, verse_end: 2, claim: "Kept.", attribution: "The Church", source_urls: [url] };

  test("coordinates are kept, with no notes or URLs in them, and malformed ones dropped", () => {
    const packet = buildResearchPacket(
      JSON.stringify({
        notes: [note],
        unresolved: [],
        cross_reference_candidates: [
          { ...request(), url: "https://evil.example", note: "drop" },
          { reference: "Bad", volume: "bookofmormon", book: "mosiah", chapter: "1", verse_start: 2, verse_end: 3 },
        ],
      }),
      consulted,
      verses
    );
    expect(packet?.cross_reference_candidates).toEqual([request()]);
  });
});

describe("passage size", () => {
  test("a passage over the limit is sent back to the writer", () => {
    const verses = Array.from({ length: MAX_PASSAGE_VERSES + 1 }, (_, index) => ({ verse: index + 1, text: "x" }));
    const guide = { ...baseGuide, passages: [{ ...baseGuide.passages[0]!, verse_start: 1, verse_end: MAX_PASSAGE_VERSES + 1 }] };
    expect(validateGuideContent(guide, verses, []).some((error) => error.includes("too long for one unit"))).toBe(true);
  });
});
