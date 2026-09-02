"use client";

import { useMemo, useState } from "react";
import type { InsightDraft } from "@/lib/appData";
import { aiInsightSourceHasMaterial, type AiInsightAction, type AiInsightSource } from "@/lib/aiInsights";

const ACTIONS: Array<{ action: AiInsightAction; label: string; description: string }> = [
  { action: "themes", label: "Find themes", description: "Look for patterns and connections in this note." },
  { action: "questions", label: "Study questions", description: "Create questions for deeper reading." },
  { action: "draft", label: "Shape draft", description: "Turn the current blocks into a short note." },
];

function toSource(draft: InsightDraft): AiInsightSource {
  return {
    title: draft.title,
    blocks: draft.blocks.map((block) => ({
      type: block.type,
      text: block.text,
      highlight_text: block.highlight_text,
      link_url: block.link_url,
      scripture_ref: block.scripture_ref,
      dictionary_meta: block.dictionary_meta,
    })),
  };
}

export default function AiInsightAssistant({
  draft,
  onAddTextBlock,
}: {
  draft: InsightDraft;
  onAddTextBlock: (text: string) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<AiInsightAction>("themes");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const source = useMemo(() => toSource(draft), [draft]);
  const hasMaterial = useMemo(() => aiInsightSourceHasMaterial(source), [source]);

  async function generate() {
    setIsGenerating(true);
    setError("");
    setResult("");
    try {
      const response = await fetch("/api/insights/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: selectedAction, source }),
      });
      const body = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !body.text) {
        throw new Error(body.error || "AI assist could not finish that request.");
      }
      setResult(body.text);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI assist could not finish that request.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function addToNote() {
    if (!result.trim()) return;
    setIsAdding(true);
    try {
      await onAddTextBlock(result);
      setResult("");
      setIsOpen(false);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="rounded-full border surface-button px-3 py-1.5 text-xs"
      >
        AI assist
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-3 border-t border-foreground/10 pt-3">
          <div>
            <h4 className="text-sm font-medium">Work with this note</h4>
            <p className="text-xs text-foreground/60">
              Generate sends the current note blocks to OpenAI. Nothing changes until you add the result.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="AI assist action">
            {ACTIONS.map((option) => {
              const selected = selectedAction === option.action;
              return (
                <button
                  key={option.action}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedAction(option.action)}
                  className={`rounded-[0.9rem] border px-3 py-2 text-left ${
                    selected ? "surface-button" : "border-foreground/10 bg-transparent"
                  }`}
                >
                  <span className="block text-xs font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-foreground/60">{option.description}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={!hasMaterial || isGenerating}
            className="rounded-full px-4 py-2 text-xs font-medium text-[color:var(--mobile-nav-active-text)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--mobile-nav-active)" }}
          >
            {isGenerating ? "Thinking..." : "Generate"}
          </button>

          {!hasMaterial ? <p className="text-xs text-foreground/60">Add a scripture, quote, or text block first.</p> : null}
          {error ? <p className="text-xs text-red-700 dark:text-red-300">{error}</p> : null}

          {result ? (
            <div className="space-y-3 border-l-2 border-foreground/15 pl-3">
              <div className="whitespace-pre-wrap text-sm leading-6">{result}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void addToNote()}
                  disabled={isAdding}
                  className="rounded-full border surface-button px-3 py-1.5 text-xs"
                >
                  {isAdding ? "Adding..." : "Add to note"}
                </button>
                <button
                  type="button"
                  onClick={() => setResult("")}
                  className="rounded-full px-3 py-1.5 text-xs text-foreground/65"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
