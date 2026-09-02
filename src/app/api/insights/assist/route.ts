import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  aiInsightSourceHasMaterial,
  aiInsightTask,
  extractAiInsightText,
  formatAiInsightSource,
  isAiInsightAction,
  type AiInsightApiResponse,
  type AiInsightSource,
} from "@/lib/aiInsights";

type AssistPayload = {
  action?: unknown;
  source?: unknown;
};

function isInsightSource(value: unknown): value is AiInsightSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<AiInsightSource>;
  if (typeof source.title !== "string" || !Array.isArray(source.blocks)) return false;
  if (source.title.length > 500 || source.blocks.length > 40) return false;
  return source.blocks.every((block) => {
    if (!block || typeof block !== "object") return false;
    const candidate = block as Record<string, unknown>;
    const scriptureRef = candidate.scripture_ref;
    const dictionaryMeta = candidate.dictionary_meta;
    const linkUrl = candidate.link_url;
    const stringsAreBounded = [candidate.text, candidate.highlight_text, linkUrl].every(
      (field) => field === null || field === undefined || (typeof field === "string" && field.length <= 10000)
    );
    const scriptureRefIsValid =
      scriptureRef === null ||
      scriptureRef === undefined ||
      (typeof scriptureRef === "object" &&
        typeof (scriptureRef as Record<string, unknown>).reference === "string" &&
        ((scriptureRef as Record<string, unknown>).reference as string).length <= 300);
    const dictionaryMetaIsValid =
      dictionaryMeta === null ||
      dictionaryMeta === undefined ||
      (typeof dictionaryMeta === "object" &&
        typeof (dictionaryMeta as Record<string, unknown>).word === "string" &&
        ((dictionaryMeta as Record<string, unknown>).word as string).length <= 200);
    return (
      ["scripture", "text", "quote", "dictionary"].includes(String(candidate.type)) &&
      stringsAreBounded &&
      scriptureRefIsValid &&
      dictionaryMetaIsValid
    );
  });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to use AI assist." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "AI insights are not configured yet." }, { status: 503 });
  }

  let payload: AssistPayload;
  try {
    payload = (await request.json()) as AssistPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!isAiInsightAction(payload.action) || !isInsightSource(payload.source)) {
    return NextResponse.json({ error: "Invalid AI insight request." }, { status: 400 });
  }

  if (!aiInsightSourceHasMaterial(payload.source)) {
    return NextResponse.json({ error: "Add some material to the note first." }, { status: 400 });
  }
  const sourceText = formatAiInsightSource(payload.source);

  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        reasoning: { effort: "low" },
        store: false,
        max_output_tokens: 900,
        instructions:
          "You are a careful scripture study assistant. Work only from the material the user supplies. Do not invent quotations, references, historical claims, or doctrine. Clearly frame interpretations as possibilities, not religious authority or revelation. Write in plain language without a preamble.",
        input: `${aiInsightTask(payload.action)}\n\nMaterials:\n${sourceText}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });

    const result = (await openAiResponse.json()) as AiInsightApiResponse;
    if (!openAiResponse.ok) {
      console.error("OpenAI insight request failed", openAiResponse.status, result.error?.message ?? "Unknown error");
      return NextResponse.json({ error: "AI assist could not finish that request." }, { status: 502 });
    }

    const text = extractAiInsightText(result);
    if (!text) {
      return NextResponse.json({ error: "AI assist returned an empty response." }, { status: 502 });
    }

    return NextResponse.json({ text, model: "gpt-5.6-luna" });
  } catch (error) {
    console.error("OpenAI insight request failed", error);
    return NextResponse.json({ error: "AI assist is temporarily unavailable." }, { status: 502 });
  }
}
