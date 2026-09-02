import assert from "node:assert/strict";
import test from "node:test";
import {
  extractChapterInsightResponse,
  groupChapterStudyPathsByVerse,
  isAllowedChapterInsightSource,
  parseChapterStudyPaths,
  stableJsonStringify,
} from "./chapterInsights.ts";
import {
  buildChapterInsightResponseBody,
  CHAPTER_INSIGHT_MODEL,
} from "./chapterInsightRequest.ts";

test("uses the same grounded request for interactive and batch insights", () => {
  const body = buildChapterInsightResponseBody("1 Nephi 2", [
    { verse: 1, text: "A sample verse." },
  ]);
  assert.equal(body.model, CHAPTER_INSIGHT_MODEL);
  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.tool_choice, "required");
  assert.equal(body.tools[0].type, "web_search");
  assert.equal("maxItems" in body.text.format.schema.properties.paths, false);
  assert.match(body.instructions, /as many strong, distinct paths as the chapter warrants/i);
});

test("serializes cache payloads independently of object key order", () => {
  assert.equal(
    stableJsonStringify({ paths: [{ title: "Study", verses: [2, 1] }], reference: "1 Nephi 1" }),
    stableJsonStringify({ reference: "1 Nephi 1", paths: [{ verses: [2, 1], title: "Study" }] })
  );
});

test("allows only configured LDS study domains", () => {
  assert.equal(isAllowedChapterInsightSource("https://www.churchofjesuschrist.org/study/scriptures"), true);
  assert.equal(isAllowedChapterInsightSource("https://archive.interpreterfoundation.org/article"), true);
  assert.equal(isAllowedChapterInsightSource("https://example.com/article"), false);
});

test("keeps only paths grounded in verses and consulted sources", () => {
  const response = extractChapterInsightResponse({
    output: [
      {
        type: "web_search_call",
        action: {
          sources: [{ url: "https://scripturecentral.org/knowhy/example", title: "A useful article" }],
        },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              paths: [
                {
                  kind: "textual_pattern",
                  verse_numbers: [1, 99],
                  title: "Notice the repeated promise",
                  direction: "Compare how the promise changes across the chapter.",
                  why: "The repeated wording may mark the chapter's argument.",
                  look_for: ["Repeated verbs"],
                  source_urls: ["https://scripturecentral.org/knowhy/example?utm_source=chatgpt.com"],
                  video_urls: ["https://scripturecentral.org/knowhy/example"],
                  scripture_links: [
                    {
                      reference: "1 Kings 22:19-23",
                      volume: "oldtestament",
                      book: "1kings",
                      chapter: 22,
                      verse_start: 19,
                      verse_end: 23,
                    },
                  ],
                },
                {
                  kind: "historical_context",
                  verse_numbers: [2],
                  title: "Unconsulted source",
                  direction: "This should be removed.",
                  why: "It has no retrieved source.",
                  look_for: ["Nothing"],
                  source_urls: ["https://rsc.byu.edu/made-up"],
                },
              ],
            }),
          },
        ],
      },
    ],
  });

  const paths = parseChapterStudyPaths(response.text, new Set([1, 2]), response.sources);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].verse_numbers, [1]);
  assert.equal(paths[0].sources[0].title, "A useful article");
  assert.equal(paths[0].sources[0].format, "video");
  assert.equal(paths[0].scripture_links[0].reference, "1 Kings 22:19-23");
});

test("groups a study path only under its first tagged verse", () => {
  const path = {
    kind: "cross_reference",
    verse_numbers: [3, 5],
    title: "A connection",
    direction: "Read the passages together.",
    why: "They use the same image.",
    look_for: ["Shared language"],
    sources: [{ title: "Source", url: "https://scripturecentral.org/example" }],
  };
  const grouped = groupChapterStudyPathsByVerse([path]);
  assert.equal(grouped.get(3)?.[0], path);
  assert.equal(grouped.has(5), false);
});

test("keeps verse anchors sparse without limiting insight count", () => {
  const consulted = new Map([
    ["https://scripturecentral.org/example", { title: "Source", url: "https://scripturecentral.org/example" }],
  ]);
  const paths = parseChapterStudyPaths(
    JSON.stringify({
      paths: Array.from({ length: 6 }, (_, index) => ({
        kind: "open_question",
        verse_numbers: [1, 2, 3],
        title: `Path ${index}`,
        direction: "Investigate this direction.",
        why: "It may change how the passage is read.",
        look_for: ["A repeated phrase"],
        source_urls: ["https://scripturecentral.org/example"],
        video_urls: [],
      })),
    }),
    new Set([1, 2, 3]),
    consulted
  );
  assert.equal(paths.length, 6);
  assert.deepEqual(paths[0].verse_numbers, [1, 2]);
});
