"use client";

import { useMemo } from "react";
import DictionaryEntryBody from "@/components/DictionaryEntryBody";
import { exploreAction } from "@/components/WordStudyLinks";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";

type DictionaryEntry = {
  id: string;
  word: string;
  heading: string | null;
  entryText: string;
  pronounce: string | null;
};

export default function DictionaryEntryCard({
  entry,
  edition,
  variant = "card",
}: {
  entry: DictionaryEntry;
  edition: "1828" | "1844" | "1913";
  /** "plain" sits inside an Explore result row, which already shows the word: no box or title of its own. */
  variant?: "card" | "plain";
}) {
  const { addDictionaryBlock, openBuilder } = useInsightBuilder();
  const dictionaryWord = useMemo(() => entry.word?.trim() || "Dictionary entry", [entry.word]);

  async function onAddCardToInsight() {
    await addDictionaryBlock({
      edition,
      word: dictionaryWord,
      heading: entry.heading,
      pronounce: entry.pronounce,
      entryText: entry.entryText,
    });
    openBuilder();
  }

  if (variant === "plain") {
    return (
      <article className="space-y-2">
        {entry.pronounce || entry.heading ? (
          <p className="text-xs text-[color:var(--foreground-muted)]">
            {[entry.pronounce, entry.heading].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <DictionaryEntryBody entryText={entry.entryText} />
        <button
          type="button"
          onClick={() => {
            void onAddCardToInsight();
          }}
          className={exploreAction}
          title="Add this dictionary card to a note"
        >
          Add to note
        </button>
      </article>
    );
  }

  return (
    <article className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-card-strong)] p-3 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-[1_1_9rem]">
          <h6 className="break-words font-serif text-xl leading-tight">{entry.word}</h6>
          {entry.pronounce ? <div className="text-xs text-foreground/60">{entry.pronounce}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            void onAddCardToInsight();
          }}
          className="min-h-10 shrink-0 rounded-full border border-[color:var(--surface-border)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]"
          title="Add this dictionary card to a note"
        >
          Add to note
        </button>
      </header>
      {entry.heading ? <div className="text-xs uppercase tracking-wide text-foreground/60">{entry.heading}</div> : null}
      <DictionaryEntryBody entryText={entry.entryText} />
    </article>
  );
}
