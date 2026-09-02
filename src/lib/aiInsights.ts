import type { InsightDraftBlock } from "@/lib/appData";

export const AI_INSIGHT_ACTIONS = ["themes", "questions", "draft"] as const;

export type AiInsightAction = (typeof AI_INSIGHT_ACTIONS)[number];

export type AiInsightSource = {
  title: string;
  blocks: Array<
    Pick<InsightDraftBlock, "type" | "text" | "highlight_text" | "link_url" | "scripture_ref" | "dictionary_meta">
  >;
};

export function isAiInsightAction(value: unknown): value is AiInsightAction {
  return typeof value === "string" && AI_INSIGHT_ACTIONS.some((action) => action === value);
}

export function aiInsightSourceHasMaterial(source: AiInsightSource): boolean {
  return source.blocks.some((block) => (block.highlight_text || block.text || "").trim().length >= 20);
}

export type AiInsightApiResponse = {
  error?: { message?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

export function extractAiInsightText(response: AiInsightApiResponse): string {
  return (response.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

export function formatAiInsightSource(source: AiInsightSource): string {
  const title = source.title.trim().slice(0, 200) || "Untitled note";
  const blocks = source.blocks.slice(0, 40).map((block, index) => {
    const reference = block.scripture_ref?.reference?.trim();
    const dictionaryWord = block.dictionary_meta?.word?.trim();
    const label = reference || dictionaryWord || block.type;
    const selectedText = block.highlight_text?.trim();
    const text = (selectedText || block.text || "").trim().slice(0, 4000);
    const link = block.link_url?.trim().slice(0, 500);
    return [`${index + 1}. ${label}`, text, link ? `Source link: ${link}` : ""].filter(Boolean).join("\n");
  });

  return [`Note title: ${title}`, "", ...blocks].join("\n").slice(0, 50000);
}

export function aiInsightTask(action: AiInsightAction): string {
  if (action === "themes") {
    return "Identify 3 to 5 meaningful themes or connections in these materials. Explain each one in a short paragraph and cite only the scripture references supplied in the note.";
  }
  if (action === "questions") {
    return "Write 4 thoughtful study questions that invite reflection on these materials. Avoid questions with obvious yes-or-no answers. Add one short sentence after each question explaining what to look for in the supplied text.";
  }
  return "Shape these materials into a clear study note of 2 to 4 short paragraphs. Preserve the writer's ideas and tone. Use only quotations and scripture references present in the supplied material.";
}
