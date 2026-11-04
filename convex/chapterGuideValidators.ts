import { v } from "convex/values";

const historicalContext = v.object({ paragraphs: v.array(v.string()), source_ids: v.array(v.string()) });

const crossReference = v.object({
  reference: v.string(),
  volume: v.string(),
  book: v.string(),
  chapter: v.number(),
  verse_start: v.number(),
  verse_end: v.number(),
  note: v.string(),
});

const insight = v.object({
  title: v.string(),
  verse_start: v.number(),
  verse_end: v.number(),
  paragraphs: v.array(v.string()),
  source_ids: v.array(v.string()),
});

const passage = v.object({
  verse_start: v.number(),
  verse_end: v.number(),
  heading: v.string(),
  original_meaning: v.array(v.string()),
  latter_day_saint_application: v.array(v.string()),
  cross_references: v.array(crossReference),
  questions: v.array(v.string()),
  source_ids: v.array(v.string()),
});

export const chapterGuideContentValidator = v.object({
  title: v.string(),
  overview: v.array(v.string()),
  historical_context: historicalContext,
  significant_insights: v.array(insight),
  passages: v.array(passage),
  source_use: v.array(v.object({ source_id: v.string(), use: v.string() })),
  limitations: v.array(v.string()),
});

export const chapterGuideSourceValidator = v.object({
  id: v.string(),
  title: v.string(),
  url: v.string(),
  use: v.string(),
});

export const chapterGuideProvenanceValidator = v.object({
  researchModel: v.string(),
  writerModel: v.string(),
  reviewModel: v.string(),
  promptVersion: v.number(),
  requiredCorrections: v.number(),
  repaired: v.boolean(),
  reviewSummary: v.string(),
  unverifiable: v.array(v.string()),
  crossReferencesChecked: v.optional(v.number()),
  crossReferencesUnchecked: v.optional(v.number()),
});

export const chapterVerseValidator = v.object({ verse: v.number(), text: v.string() });

export const chapterGuideStageValidator = v.union(
  v.literal("research"),
  v.literal("write"),
  v.literal("review"),
  v.literal("repair"),
  v.literal("recheck")
);

export const chapterGuideJobStatusValidator = v.union(
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed")
);

export const chapterGuidePauseReasonValidator = v.union(
  v.literal("not_activated"),
  v.literal("owner"),
  v.literal("repeated_failures"),
  v.literal("reservation_exceeded")
);

export const chapterGuideUsageValidator = v.object({
  inputTokens: v.number(),
  cachedInputTokens: v.number(),
  cacheWriteTokens: v.number(),
  outputTokens: v.number(),
  webSearchCalls: v.number(),
});

export const chapterGuideCostSourceValidator = v.union(
  v.literal("reported"),
  v.literal("no_charge"),
  v.literal("held_at_maximum")
);
