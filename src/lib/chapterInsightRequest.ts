import {
  CHAPTER_INSIGHT_KINDS,
  CHAPTER_INSIGHT_SOURCE_DOMAINS,
} from "./chapterInsights.ts";

export const CHAPTER_INSIGHT_MODEL = "gpt-5.6-luna";

export type ChapterInsightRequestVerse = {
  verse: number;
  text: string;
};

export const chapterInsightPathSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    paths: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: CHAPTER_INSIGHT_KINDS },
          verse_numbers: { type: "array", minItems: 1, maxItems: 2, items: { type: "integer" } },
          title: { type: "string" },
          direction: { type: "string" },
          why: { type: "string" },
          look_for: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
          source_urls: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
          video_urls: { type: "array", maxItems: 2, items: { type: "string" } },
          scripture_links: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                reference: { type: "string" },
                volume: { type: "string" },
                book: { type: "string" },
                chapter: { type: "integer" },
                verse_start: { type: "integer" },
                verse_end: { type: "integer" },
              },
              required: ["reference", "volume", "book", "chapter", "verse_start", "verse_end"],
            },
          },
        },
        required: [
          "kind",
          "verse_numbers",
          "title",
          "direction",
          "why",
          "look_for",
          "source_urls",
          "video_urls",
          "scripture_links",
        ],
      },
    },
  },
  required: ["paths"],
} as const;

export const chapterInsightInstructions = `You help Latter-day Saints study scripture more deeply without replacing their own reading, prayer, judgment, or trusted teachers. Read the supplied canonical chapter, decide which research moves would reveal a genuinely non-obvious direction, and use web search to ground every suggestion.

Prioritize the Church of Jesus Christ of Latter-day Saints and primary historical sources. You may also use the allowed Latter-day Saint scholarship and adjacent Mormon studies sources. Never blur their authority: describe scholarly interpretations as interpretations, not official doctrine. Do not produce a chapter summary, devotional, sermon, answer key, or personal revelation. Omit obvious, speculative, repetitive, weakly sourced, or forced observations. Return as many strong, distinct paths as the chapter warrants, then stop. Longer chapters may warrant more paths, but never add filler to reach a count.

Each path must use only one or two anchor verses: the smallest set that best introduces the direction. Do not tag every verse that relates to it. Give a concise direction to explore, explain why it may repay attention, name concrete details to look for while rereading, and list only exact URLs that your web search actually consulted. When a relevant page from an allowed source is primarily a video or recorded presentation, include it in source_urls and video_urls. Do not call an article with an embedded decorative clip a video, and do not invent or transform video URLs. When the path mentions another scripture, write its exact display reference in the prose and add its Verse Together coordinates to scripture_links. Use empty arrays when there is no video or scripture reference. Invite investigation rather than closing the question.`;

export function chapterInsightInput(reference: string, verses: readonly ChapterInsightRequestVerse[]): string {
  const chapterText = verses.map((verse) => `${verse.verse}. ${verse.text}`).join("\n");
  return `${reference}\n\n${chapterText}`;
}

export function buildChapterInsightResponseBody(
  reference: string,
  verses: readonly ChapterInsightRequestVerse[]
) {
  return {
    model: CHAPTER_INSIGHT_MODEL,
    reasoning: { effort: "medium" },
    store: false,
    // Reasoning and web-search tokens count toward this budget. A low ceiling
    // can truncate otherwise valid structured JSON before the final brace.
    max_output_tokens: Math.min(20000, 10000 + verses.length * 100),
    tools: [
      {
        type: "web_search",
        search_context_size: "medium",
        filters: { allowed_domains: CHAPTER_INSIGHT_SOURCE_DOMAINS },
      },
    ],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    text: {
      format: {
        type: "json_schema",
        name: "chapter_study_paths",
        strict: true,
        schema: chapterInsightPathSchema,
      },
    },
    instructions: chapterInsightInstructions,
    input: chapterInsightInput(reference, verses),
  } as const;
}
