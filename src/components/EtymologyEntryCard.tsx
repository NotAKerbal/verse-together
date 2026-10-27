"use client";

import { exploreAction } from "@/components/WordStudyLinks";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";

type EtymologyItem = {
  id: string;
  source: string;
  word: string;
  text: string;
};

export default function EtymologyEntryCard({ item, variant = "card" }: {
  item: EtymologyItem;
  /** "plain" sits inside an Explore result row, which already shows the word and source: no box or header. */
  variant?: "card" | "plain";
}) {
  const { addDictionaryBlock, openBuilder } = useInsightBuilder();

  async function onAddCardToInsight() {
    await addDictionaryBlock({
      edition: "ETY",
      word: item.word?.trim() || "Etymology",
      heading: item.source?.trim() || "Etymology",
      entryText: item.text?.trim() || "",
    });
    openBuilder();
  }

  if (variant === "plain") {
    return (
      <article className="space-y-2">
        <p className="whitespace-pre-line break-words">{item.text}</p>
        <button
          type="button"
          onClick={() => {
            void onAddCardToInsight();
          }}
          className={exploreAction}
          title="Add this etymology card to a note"
        >
          Add to note
        </button>
      </article>
    );
  }

  return (
    <article className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-card-strong)] p-3 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_9rem] space-y-1">
          <h6 className="break-words font-serif text-xl leading-tight">{item.word}</h6>
          <span className="inline-flex rounded-full border border-[color:var(--surface-border)] px-2 py-0.5 text-[11px] text-foreground/70">
            {item.source}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            void onAddCardToInsight();
          }}
          className="min-h-10 shrink-0 rounded-full border border-[color:var(--surface-border)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]"
          title="Add this etymology card to a note"
        >
          Add to note
        </button>
      </header>
      <p className="whitespace-pre-line break-words text-sm leading-6">{item.text}</p>
    </article>
  );
}
