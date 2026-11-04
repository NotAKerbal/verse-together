"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  requestInputBytes,
  RESEARCH_MODEL,
  REVIEW_MODEL,
  type TokenUsage,
  WRITER_MODEL,
} from "./chapterGuideBudget";
import {
  applyGuideRepair,
  buildResearchPacket,
  CHAPTER_GUIDE_PROMPT_VERSION,
  type ChapterGuideContent,
  correctionsFitBound,
  GUIDE_JSON_SCHEMA,
  type GuideReview,
  invalidCorrectionTargets,
  MAX_REQUIRED_CORRECTIONS,
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
  researchInput,
  RESEARCH_WEB_SEARCH_TOOL,
  type ResearchPacket,
  REVIEW_INSTRUCTIONS,
  REVIEW_JSON_SCHEMA,
  reviewInput,
  validateGuideContent,
  WRITER_SYSTEM_PROMPT,
  writerUserPrompt,
} from "./chapterGuideContent";
import { type CrossReferenceEvidence, guideEvidenceRequests, lookupCrossReferenceEvidence } from "./chapterGuideEvidence";
import { callClaude, callOpenAi, ProviderCallError, type ProviderResult } from "./chapterGuideProviders";
import type { StagePlan } from "./chapterGuides";

type RunPlan = Extract<StagePlan, { kind: "run" }>;

type StageCharge =
  | { source: "reported"; usage: TokenUsage }
  | { source: "no_charge" }
  | { source: "held_at_maximum"; usage?: TokenUsage };

type Provenance = {
  researchModel: string;
  writerModel: string;
  reviewModel: string;
  promptVersion: number;
  requiredCorrections: number;
  repaired: boolean;
  reviewSummary: string;
  unverifiable: string[];
  crossReferencesChecked: number;
  crossReferencesUnchecked: number;
};

type StageOutcome =
  | { kind: "next"; stage: "write" | "review" | "repair" | "recheck"; research?: ResearchPacket; draft?: ChapterGuideContent; review?: GuideReview }
  | {
      kind: "publish";
      content: ChapterGuideContent;
      sources: ReturnType<typeof publishedSources>;
      provenance: Provenance;
    }
  | { kind: "retry"; code: string; feedback?: string[] }
  | { kind: "fail"; code: string };

type StageCompletion = { charge: StageCharge; outcome: StageOutcome };

const MAX_FEEDBACK_ITEMS = 25;

function provenance(
  review: GuideReview,
  requiredCorrections: number,
  repaired: boolean,
  evidence: readonly CrossReferenceEvidence[]
): Provenance {
  const checked = evidence.filter((item) => item.status === "supplied").length;
  return {
    researchModel: RESEARCH_MODEL,
    writerModel: WRITER_MODEL,
    reviewModel: REVIEW_MODEL,
    promptVersion: CHAPTER_GUIDE_PROMPT_VERSION,
    requiredCorrections,
    repaired,
    reviewSummary: review.summary,
    unverifiable: review.unverifiable,
    crossReferencesChecked: checked,
    crossReferencesUnchecked: evidence.length - checked,
  };
}

export function stageEvidenceRequests(plan: Pick<RunPlan, "stage" | "reference" | "research" | "draft">) {
  if (plan.stage === "research") return [];
  if (plan.stage === "write") return (plan.research as ResearchPacket | undefined)?.cross_reference_candidates ?? [];
  const draft = plan.draft as ChapterGuideContent | undefined;
  return draft ? guideEvidenceRequests(draft, plan.reference) : [];
}

async function runProvider(
  plan: RunPlan,
  openAiKey: string,
  anthropicKey: string,
  evidence: readonly CrossReferenceEvidence[]
): Promise<ProviderResult | StageCompletion> {
  const research = plan.research as ResearchPacket | undefined;
  const draft = plan.draft as ChapterGuideContent | undefined;
  const review = plan.review as GuideReview | undefined;
  const overBudget: StageCompletion = { charge: { source: "no_charge" }, outcome: { kind: "fail", code: "input_too_large" } };
  const missing: StageCompletion = { charge: { source: "no_charge" }, outcome: { kind: "fail", code: "missing_artifact" } };

  if (plan.stage === "research") {
    const input = researchInput(plan.reference, plan.verses);
    const size = requestInputBytes({ system: RESEARCH_INSTRUCTIONS, user: input, schema: RESEARCH_JSON_SCHEMA, tools: RESEARCH_WEB_SEARCH_TOOL });
    if (size > plan.maxInputBytes) return overBudget;
    return await callOpenAi({
      apiKey: openAiKey,
      model: plan.model,
      instructions: RESEARCH_INSTRUCTIONS,
      input,
      schemaName: "chapter_guide_research",
      schema: RESEARCH_JSON_SCHEMA,
      maxOutputTokens: plan.maxOutputTokens,
      timeoutMs: plan.timeoutMs,
      webSearch: true,
    });
  }
  if (!research) return missing;
  if (plan.stage === "write") {
    const user = writerUserPrompt({ reference: plan.reference, verses: plan.verses, research, evidence, feedback: plan.writerFeedback });
    if (requestInputBytes({ system: WRITER_SYSTEM_PROMPT, user, schema: GUIDE_JSON_SCHEMA }) > plan.maxInputBytes) return overBudget;
    return await callClaude({
      apiKey: anthropicKey,
      model: plan.model,
      system: WRITER_SYSTEM_PROMPT,
      user,
      schema: GUIDE_JSON_SCHEMA,
      maxOutputTokens: plan.maxOutputTokens,
      timeoutMs: plan.timeoutMs,
    });
  }
  if (!draft) return missing;
  if (plan.stage === "review") {
    const input = reviewInput({ reference: plan.reference, verses: plan.verses, research, guide: draft, evidence });
    if (requestInputBytes({ system: REVIEW_INSTRUCTIONS, user: input, schema: REVIEW_JSON_SCHEMA }) > plan.maxInputBytes) return overBudget;
    return await callOpenAi({
      apiKey: openAiKey,
      model: plan.model,
      instructions: REVIEW_INSTRUCTIONS,
      input,
      schemaName: "chapter_guide_review",
      schema: REVIEW_JSON_SCHEMA,
      maxOutputTokens: plan.maxOutputTokens,
      timeoutMs: plan.timeoutMs,
      webSearch: false,
    });
  }
  if (!review) return missing;
  if (plan.stage === "recheck") {
    const input = recheckInput({ reference: plan.reference, verses: plan.verses, research, guide: draft, corrections: review.required_corrections, evidence });
    if (requestInputBytes({ system: RECHECK_INSTRUCTIONS, user: input, schema: REVIEW_JSON_SCHEMA }) > plan.maxInputBytes) return overBudget;
    return await callOpenAi({
      apiKey: openAiKey,
      model: plan.model,
      instructions: RECHECK_INSTRUCTIONS,
      input,
      schemaName: "chapter_guide_recheck",
      schema: REVIEW_JSON_SCHEMA,
      maxOutputTokens: plan.maxOutputTokens,
      timeoutMs: plan.timeoutMs,
      webSearch: false,
    });
  }
  const user = repairUserPrompt({
    reference: plan.reference,
    verses: plan.verses,
    research,
    guide: draft,
    corrections: review.required_corrections,
    evidence,
  });
  if (requestInputBytes({ system: REPAIR_SYSTEM_PROMPT, user, schema: REPAIR_JSON_SCHEMA }) > plan.maxInputBytes) return overBudget;
  return await callClaude({
    apiKey: anthropicKey,
    model: plan.model,
    system: REPAIR_SYSTEM_PROMPT,
    user,
    schema: REPAIR_JSON_SCHEMA,
    maxOutputTokens: plan.maxOutputTokens,
    timeoutMs: plan.timeoutMs,
  });
}

export function outcomeFromResult(plan: RunPlan, result: ProviderResult, evidence: readonly CrossReferenceEvidence[] = []): StageOutcome {
  if (!result.complete) {
    const code = result.stopCode ?? "provider_incomplete";
    return code === "anthropic_refusal" ? { kind: "fail", code } : { kind: "retry", code };
  }
  const research = plan.research as ResearchPacket | undefined;
  if (plan.stage === "research") {
    const packet = buildResearchPacket(result.text, result.consultedSources, plan.verses);
    return packet ? { kind: "next", stage: "write", research: packet } : { kind: "retry", code: "research_empty" };
  }
  if (!research) return { kind: "fail", code: "missing_artifact" };
  if (plan.stage === "write") {
    const guide = parseGuideContent(result.text);
    if (!guide) return { kind: "retry", code: "guide_unparseable" };
    const errors = validateGuideContent(guide, plan.verses, research.sources);
    if (errors.length > 0) {
      return { kind: "retry", code: "guide_invalid", feedback: errors.slice(0, MAX_FEEDBACK_ITEMS) };
    }
    return { kind: "next", stage: "review", draft: guide };
  }
  const draft = plan.draft as ChapterGuideContent | undefined;
  if (!draft) return { kind: "fail", code: "missing_artifact" };
  if (plan.stage === "review") {
    const review = parseGuideReview(result.text);
    if (!review) return { kind: "retry", code: "review_unparseable" };
    if (review.required_corrections.length > MAX_REQUIRED_CORRECTIONS || !correctionsFitBound(review.required_corrections)) {
      return { kind: "fail", code: "review_rejected" };
    }
    if (invalidCorrectionTargets(draft, review.required_corrections).length > 0) return { kind: "retry", code: "review_invalid_target" };
    if (review.required_corrections.length > 0) return { kind: "next", stage: "repair", review };
    return {
      kind: "publish",
      content: draft,
      sources: publishedSources(draft, research.sources),
      provenance: provenance(review, 0, false, evidence),
    };
  }
  const review = plan.review as GuideReview | undefined;
  if (!review) return { kind: "fail", code: "missing_artifact" };
  if (plan.stage === "recheck") {
    const recheck = parseGuideReview(result.text);
    if (!recheck) return { kind: "retry", code: "recheck_unparseable" };
    if (recheck.required_corrections.length > 0) return { kind: "fail", code: "repair_unresolved" };
    return {
      kind: "publish",
      content: draft,
      sources: publishedSources(draft, research.sources),
      provenance: provenance(recheck, review.required_corrections.length, true, evidence),
    };
  }
  const repair = parseGuideRepair(result.text);
  if (!repair) return { kind: "fail", code: "repair_unparseable" };
  const { guide, failureCode } = applyGuideRepair(draft, repair, review.required_corrections);
  if (failureCode) return { kind: "fail", code: failureCode };
  if (validateGuideContent(guide, plan.verses, research.sources).length > 0) return { kind: "fail", code: "repair_invalid" };
  return { kind: "next", stage: "recheck", draft: guide };
}

export function missedStartWindow(plan: Pick<RunPlan, "timeoutMs" | "leaseExpiresAt">, now: number): boolean {
  return now + plan.timeoutMs > plan.leaseExpiresAt;
}

function chargeForResult(plan: RunPlan, result: ProviderResult): StageCharge {
  return plan.stage === "research" ? { source: "held_at_maximum", usage: result.usage } : { source: "reported", usage: result.usage };
}

async function executeStage(plan: RunPlan): Promise<StageCompletion> {
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!openAiKey || !anthropicKey) {
    return { charge: { source: "no_charge" }, outcome: { kind: "fail", code: "not_configured" } };
  }
  const evidence = await lookupCrossReferenceEvidence(stageEvidenceRequests(plan), process.env.SITE_URL).catch((): CrossReferenceEvidence[] => []);
  if (missedStartWindow(plan, Date.now())) {
    return { charge: { source: "no_charge" }, outcome: { kind: "retry", code: "worker_late" } };
  }
  try {
    const result = await runProvider(plan, openAiKey, anthropicKey, evidence);
    if ("outcome" in result) return result;
    return { charge: chargeForResult(plan, result), outcome: outcomeFromResult(plan, result, evidence) };
  } catch (error) {
    if (error instanceof ProviderCallError) {
      console.warn("Chapter guide provider call failed", { stage: plan.stage, attempt: plan.attempt, code: error.code });
      return {
        charge: error.failure === "no_charge" ? { source: "no_charge" } : { source: "held_at_maximum" },
        outcome: error.retryable ? { kind: "retry", code: error.code } : { kind: "fail", code: error.code },
      };
    }
    console.warn("Chapter guide stage failed unexpectedly", { stage: plan.stage, attempt: plan.attempt });
    return { charge: { source: "held_at_maximum" }, outcome: { kind: "fail", code: "stage_error" } };
  }
}

export const runStage = internalAction({
  args: { jobId: v.id("chapterGuideJobs") },
  handler: async (ctx, { jobId }): Promise<void> => {
    const plan: StagePlan = await ctx.runMutation(internal.chapterGuides.beginStage, { jobId });
    if (plan.kind !== "run") return;
    const { charge, outcome } = await executeStage(plan);
    await ctx.runMutation(internal.chapterGuides.completeStage, { attemptId: plan.attemptId, charge, outcome });
  },
});
