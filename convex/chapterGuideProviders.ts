"use node";

import Anthropic from "@anthropic-ai/sdk";
import { canonicalGuideSourceUrl, RESEARCH_WEB_SEARCH_TOOL } from "./chapterGuideContent";
import { isValidTokenUsage, RESEARCH_MAX_TOOL_CALLS, type TokenUsage } from "./chapterGuideBudget";

export type ProviderFailureKind = "no_charge" | "unknown_charge";

export class ProviderCallError extends Error {
  readonly failure: ProviderFailureKind;
  readonly code: string;
  readonly retryable: boolean;
  constructor(failure: ProviderFailureKind, code: string, retryable: boolean) {
    super(code);
    this.failure = failure;
    this.code = code;
    this.retryable = retryable;
  }
}

export type ProviderResult = {
  text: string;
  usage: TokenUsage;
  complete: boolean;
  stopCode: string | null;
  consultedSources: Map<string, { title: string; url: string }>;
};

type OpenAiCitation = { type?: string; url?: string; title?: string };
type OpenAiResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  };
  tool_usage?: { web_search?: { num_requests?: number } };
  output?: Array<{
    type?: string;
    action?: { sources?: Array<{ url?: string; title?: string }> };
    content?: Array<{ type?: string; text?: string; annotations?: OpenAiCitation[] }>;
  }>;
};

function failureFromStatus(provider: string, status: number): ProviderCallError {
  const code = `${provider}_http_${status}`;
  if (status === 429 || status === 529) return new ProviderCallError("no_charge", code, true);
  if (status >= 400 && status < 500) return new ProviderCallError("no_charge", code, false);
  return new ProviderCallError("unknown_charge", code, true);
}

export function readOpenAiResponse(response: OpenAiResponse): ProviderResult {
  const consultedSources = new Map<string, { title: string; url: string }>();
  const addSource = (url: unknown, title: unknown) => {
    const canonical = canonicalGuideSourceUrl(url);
    if (!canonical) return;
    const existingTitle = consultedSources.get(canonical.key)?.title;
    const cleanTitle = typeof title === "string" ? title.trim().slice(0, 300) : "";
    consultedSources.set(canonical.key, {
      title: cleanTitle || existingTitle || new URL(canonical.url).hostname,
      url: canonical.url,
    });
  };
  const textParts: string[] = [];
  let webSearchCalls = 0;
  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") webSearchCalls += 1;
    for (const source of item.action?.sources ?? []) addSource(source.url, source.title);
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") textParts.push(content.text.trim());
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation") addSource(annotation.url, annotation.title);
      }
    }
  }
  const usage = response.usage;
  if (!usage || usage.input_tokens === undefined || usage.output_tokens === undefined) {
    throw new ProviderCallError("unknown_charge", "openai_usage_missing", false);
  }
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const cacheWrites = usage.input_tokens_details?.cache_write_tokens ?? 0;
  const billableSearches = response.tool_usage?.web_search?.num_requests ?? 0;
  const counted: TokenUsage = {
    inputTokens: usage.input_tokens - cached - cacheWrites,
    cachedInputTokens: cached,
    cacheWriteTokens: cacheWrites,
    outputTokens: usage.output_tokens,
    webSearchCalls: Math.max(webSearchCalls, billableSearches),
  };
  if (!isValidTokenUsage(counted) || !isValidTokenUsage({ ...counted, inputTokens: usage.input_tokens, webSearchCalls: billableSearches })) {
    throw new ProviderCallError("unknown_charge", "openai_usage_invalid", false);
  }
  return {
    text: textParts.filter(Boolean).join("\n"),
    usage: counted,
    complete: response.status === "completed",
    stopCode: response.status === "completed" ? null : `openai_${response.incomplete_details?.reason ?? response.status ?? "unknown"}`,
    consultedSources,
  };
}

export async function callOpenAi(args: {
  apiKey: string;
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: unknown;
  maxOutputTokens: number;
  timeoutMs: number;
  webSearch: boolean;
}): Promise<ProviderResult> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        reasoning: { effort: "medium" },
        store: false,
        max_output_tokens: args.maxOutputTokens,
        prompt_cache_options: { mode: "explicit" },
        ...(args.webSearch
          ? {
              tools: [RESEARCH_WEB_SEARCH_TOOL],
              tool_choice: "required",
              max_tool_calls: RESEARCH_MAX_TOOL_CALLS,
              parallel_tool_calls: false,
              include: ["web_search_call.action.sources"],
            }
          : {}),
        text: { format: { type: "json_schema", name: args.schemaName, strict: true, schema: args.schema } },
        instructions: args.instructions,
        input: args.input,
      }),
      signal: AbortSignal.timeout(args.timeoutMs),
    });
  } catch {
    throw new ProviderCallError("unknown_charge", "openai_transport", true);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw failureFromStatus("openai", response.status);
  }
  let body: OpenAiResponse;
  try {
    body = (await response.json()) as OpenAiResponse;
  } catch {
    throw new ProviderCallError("unknown_charge", "openai_malformed_response", true);
  }
  return readOpenAiResponse(body);
}

export async function callClaude(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  timeoutMs: number;
}): Promise<ProviderResult> {
  const client = new Anthropic({ apiKey: args.apiKey, maxRetries: 0, timeout: args.timeoutMs });
  let message: Anthropic.Message;
  try {
    const stream = client.messages.stream(
      {
        model: args.model,
        max_tokens: args.maxOutputTokens,
        system: args.system,
        output_config: { effort: "high", format: { type: "json_schema", schema: args.schema } },
        messages: [{ role: "user", content: args.user }],
      },
      { signal: AbortSignal.timeout(args.timeoutMs) }
    );
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.APIError && typeof error.status === "number") {
      throw failureFromStatus("anthropic", error.status);
    }
    throw new ProviderCallError("unknown_charge", "anthropic_transport", true);
  }
  const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  const usage: TokenUsage = {
    inputTokens: message.usage.input_tokens,
    cachedInputTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    outputTokens: message.usage.output_tokens,
    webSearchCalls: 0,
  };
  if (!isValidTokenUsage(usage)) throw new ProviderCallError("unknown_charge", "anthropic_usage_invalid", false);
  return {
    text,
    usage,
    complete: message.stop_reason === "end_turn",
    stopCode: message.stop_reason === "end_turn" ? null : `anthropic_${message.stop_reason ?? "unknown"}`,
    consultedSources: new Map(),
  };
}
