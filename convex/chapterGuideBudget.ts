export const MICROS_PER_DOLLAR = 1_000_000;
export const HARD_MONTHLY_CAP_MICROS = 100 * MICROS_PER_DOLLAR;
export const RESERVATION_MARGIN_MICROS = 2 * MICROS_PER_DOLLAR;

export const MAX_ACTIVE_JOBS = 2;
export const MAX_JOBS_PER_DAY = 20;
export const MAX_USER_JOBS_PER_DAY = 2;
export const MAX_USER_JOBS_PER_MONTH = 8;
export const FAILURE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const FAILURES_BEFORE_AUTO_PAUSE = 4;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTH_WINDOW_MS = 30 * DAY_MS;
export const RETRY_DELAY_MS = 30 * 1000;

export const MAX_CHAPTER_VERSES = 200;
export const MAX_CHAPTER_BYTES = 64 * 1024;
export const MAX_RESEARCH_PACKET_BYTES = 48 * 1024;
export const MAX_GUIDE_BYTES = 128 * 1024;
export const MAX_CORRECTIONS_BYTES = 36 * 1024;
export const MAX_FEEDBACK_BYTES = 12 * 1024;
export const MAX_EVIDENCE_BYTES = 24 * 1024;
export const PROMPT_AND_SCHEMA_BYTES = 12 * 1024;
export const PROVIDER_FRAMING_BYTES = 4 * 1024;

export const PRICES_VERIFIED_ON = "2026-11-04";
export const RESEARCH_MODEL = "gpt-5.6-luna";
export const REVIEW_MODEL = "gpt-5.6-terra";
export const WRITER_MODEL = "claude-opus-5-5";

export type ChapterGuideModel = typeof RESEARCH_MODEL | typeof REVIEW_MODEL | typeof WRITER_MODEL;

type ModelPrice = {
  inputCents: number;
  cachedInputCents: number;
  cacheWriteCents: number;
  outputCents: number;
  longContextAboveTokens?: number;
  longInputCents?: number;
  longCachedInputCents?: number;
  longCacheWriteCents?: number;
  longOutputCents?: number;
};

export const MODEL_PRICES: Record<ChapterGuideModel, ModelPrice> = {
  "gpt-5.6-luna": {
    inputCents: 20,
    cachedInputCents: 2,
    cacheWriteCents: 25,
    outputCents: 120,
    longContextAboveTokens: 272_000,
    longInputCents: 40,
    longCachedInputCents: 4,
    longCacheWriteCents: 50,
    longOutputCents: 180,
  },
  "gpt-5.6-terra": {
    inputCents: 200,
    cachedInputCents: 20,
    cacheWriteCents: 250,
    outputCents: 1200,
    longContextAboveTokens: 272_000,
    longInputCents: 400,
    longCachedInputCents: 40,
    longCacheWriteCents: 500,
    longOutputCents: 1800,
  },
  "claude-opus-5-5": { inputCents: 400, cachedInputCents: 20, cacheWriteCents: 500, outputCents: 2000 },
};

export const WEB_SEARCH_CALL_MICROS = 10_000;
export const RESEARCH_MAX_TOOL_CALLS = 6;
export const WEB_SEARCH_CONTEXT_TOKEN_LIMIT = 128_000;

export type ChapterGuideStage = "research" | "write" | "review" | "repair" | "recheck";
export const CHAPTER_GUIDE_STAGES: ChapterGuideStage[] = ["research", "write", "review", "repair", "recheck"];

export const STAGE_MAX_ATTEMPTS: Record<ChapterGuideStage, number> = { research: 2, write: 2, review: 2, repair: 1, recheck: 2 };
export const STAGE_TIMEOUT_MS: Record<ChapterGuideStage, number> = {
  research: 300_000,
  write: 540_000,
  review: 300_000,
  repair: 420_000,
  recheck: 300_000,
};
export const STAGE_LEASE_GRACE_MS = 120_000;

export const STAGE_MODELS: Record<ChapterGuideStage, ChapterGuideModel> = {
  research: RESEARCH_MODEL,
  write: WRITER_MODEL,
  review: REVIEW_MODEL,
  repair: WRITER_MODEL,
  recheck: REVIEW_MODEL,
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  webSearchCalls: number;
};

export function isValidTokenUsage(usage: TokenUsage): boolean {
  return [usage.inputTokens, usage.cachedInputTokens, usage.cacheWriteTokens, usage.outputTokens, usage.webSearchCalls].every(
    (count) => Number.isSafeInteger(count) && count >= 0
  );
}

function micros(tokens: number, centsPerMillion: number): number {
  return Math.ceil((tokens * centsPerMillion) / 100);
}

export function usageCostMicros(model: ChapterGuideModel, usage: TokenUsage): number {
  const price = MODEL_PRICES[model];
  const promptTokens = usage.inputTokens + usage.cachedInputTokens + usage.cacheWriteTokens;
  const isLong = price.longContextAboveTokens !== undefined && promptTokens > price.longContextAboveTokens;
  const inputCents = isLong ? price.longInputCents ?? price.inputCents : price.inputCents;
  const cachedCents = isLong ? price.longCachedInputCents ?? price.cachedInputCents : price.cachedInputCents;
  const cacheWriteCents = isLong ? price.longCacheWriteCents ?? price.cacheWriteCents : price.cacheWriteCents;
  const outputCents = isLong ? price.longOutputCents ?? price.outputCents : price.outputCents;
  return (
    micros(usage.inputTokens, inputCents) +
    micros(usage.cachedInputTokens, cachedCents) +
    micros(usage.cacheWriteTokens, cacheWriteCents) +
    micros(usage.outputTokens, outputCents) +
    usage.webSearchCalls * WEB_SEARCH_CALL_MICROS
  );
}

export function writerMaxOutputTokens(verseCount: number): number {
  return Math.min(32_000, 20_000 + verseCount * 150);
}

export const RESEARCH_MAX_OUTPUT_TOKENS = 12_000;
export const REVIEW_MAX_OUTPUT_TOKENS = 12_000;
export const REPAIR_MAX_OUTPUT_TOKENS = 16_000;

export function stageMaxOutputTokens(stage: ChapterGuideStage, verseCount: number): number {
  if (stage === "research") return RESEARCH_MAX_OUTPUT_TOKENS;
  if (stage === "write") return writerMaxOutputTokens(verseCount);
  if (stage === "review") return REVIEW_MAX_OUTPUT_TOKENS;
  return REPAIR_MAX_OUTPUT_TOKENS;
}

export function stageMaxInputBytes(stage: ChapterGuideStage, chapterBytes: number): number {
  const fixed = chapterBytes + PROMPT_AND_SCHEMA_BYTES + PROVIDER_FRAMING_BYTES;
  if (stage === "research") return fixed;
  if (stage === "write") return fixed + MAX_RESEARCH_PACKET_BYTES + MAX_EVIDENCE_BYTES + MAX_FEEDBACK_BYTES;
  if (stage === "review") return fixed + MAX_RESEARCH_PACKET_BYTES + MAX_EVIDENCE_BYTES + MAX_GUIDE_BYTES;
  return fixed + MAX_RESEARCH_PACKET_BYTES + MAX_EVIDENCE_BYTES + MAX_GUIDE_BYTES + MAX_CORRECTIONS_BYTES;
}

export function requestInputBytes(parts: { system: string; user: string; schema: unknown; tools?: unknown }): number {
  const structured = utf8Bytes(JSON.stringify(parts.schema)) + (parts.tools === undefined ? 0 : utf8Bytes(JSON.stringify(parts.tools)));
  return utf8Bytes(parts.system) + utf8Bytes(parts.user) + structured + PROVIDER_FRAMING_BYTES;
}

export function stageMaxCostMicros(stage: ChapterGuideStage, verseCount: number, chapterBytes: number): number {
  const model = STAGE_MODELS[stage];
  const maxOutput = stageMaxOutputTokens(stage, verseCount);
  const inputTokenBound = stageMaxInputBytes(stage, chapterBytes);
  if (stage === "research") {
    const iterations = RESEARCH_MAX_TOOL_CALLS + 1;
    const searchedInput = iterations * (inputTokenBound + WEB_SEARCH_CONTEXT_TOKEN_LIMIT);
    return (
      micros(searchedInput, MODEL_PRICES[model].longInputCents ?? MODEL_PRICES[model].inputCents) +
      micros(maxOutput, MODEL_PRICES[model].longOutputCents ?? MODEL_PRICES[model].outputCents) +
      RESEARCH_MAX_TOOL_CALLS * WEB_SEARCH_CALL_MICROS
    );
  }
  const price = MODEL_PRICES[model];
  const isLong = price.longContextAboveTokens !== undefined && inputTokenBound > price.longContextAboveTokens;
  const inputCents = isLong ? price.longInputCents ?? price.inputCents : price.inputCents;
  const outputCents = isLong ? price.longOutputCents ?? price.outputCents : price.outputCents;
  return micros(inputTokenBound, inputCents) + micros(maxOutput, outputCents);
}

export function jobReservationMicros(verseCount: number, chapterBytes: number): number {
  return CHAPTER_GUIDE_STAGES.reduce(
    (total, stage) => total + STAGE_MAX_ATTEMPTS[stage] * stageMaxCostMicros(stage, verseCount, chapterBytes),
    0
  );
}

export function budgetPeriodKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

export function nextPeriodExposure(startedAt: number, leaseExpiresAt: number): string | null {
  const exposedPeriod = budgetPeriodKey(leaseExpiresAt);
  return exposedPeriod === budgetPeriodKey(startedAt) ? null : exposedPeriod;
}

export function effectiveMonthlyCapMicros(ownerCapMicros: number | undefined): number {
  if (ownerCapMicros === undefined || !Number.isFinite(ownerCapMicros)) return HARD_MONTHLY_CAP_MICROS;
  return Math.max(0, Math.min(HARD_MONTHLY_CAP_MICROS, Math.floor(ownerCapMicros)));
}

export function reservationFits(args: {
  capMicros: number;
  spentMicros: number;
  reservedMicros: number;
  requestedMicros: number;
}): boolean {
  return args.spentMicros + args.reservedMicros + args.requestedMicros + RESERVATION_MARGIN_MICROS <= args.capMicros;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function secretsMatch(expected: string, provided: string): boolean {
  const left = new TextEncoder().encode(expected);
  const right = new TextEncoder().encode(provided);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0 && left.length > 0;
}
