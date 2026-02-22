"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import DictionaryEntryBody from "@/components/DictionaryEntryBody";
import { useAuth } from "@/lib/auth";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { api } from "../../convex/_generated/api";

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
}: {
  entry: DictionaryEntry;
  edition: "1828" | "1844" | "1913";
}) {
  const { user } = useAuth();
  const { addDictionaryBlock, openBuilder } = useInsightBuilder();
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("lessonId");
  const lessonsApi = (api as any).lessons;
  const addLessonCard = useMutation(lessonsApi.addCard);
  const dictionaryWord = useMemo(() => entry.word?.trim() || "Dictionary entry", [entry.word]);

  async function onAddCardToInsight() {
    if (!user) {
      alert("Please sign in to build notes.");
      return;
    }
    if (lessonId) {
      await addLessonCard({
        lessonId: lessonId as any,
        type: "notes",
        title: dictionaryWord,
        body: entry.entryText,
        noteComponentType: "dictionary",
        notesVisibility: "shared_readonly",
        linkUrl: "",
        dictionaryMeta: {
          edition,
          word: dictionaryWord,
          heading: entry.heading ?? undefined,
          pronounce: entry.pronounce ?? undefined,
        },
      });
      return;
    }
    await addDictionaryBlock({
      edition,
      word: dictionaryWord,
      heading: entry.heading,
      pronounce: entry.pronounce,
      entryText: entry.entryText,
    });
    openBuilder();
  }

  return (
    <article className="rounded-md border border-black/10 dark:border-white/15 bg-background/70 p-3 space-y-2">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-sm font-semibold">{entry.word}</h5>
          {entry.pronounce ? <div className="text-xs text-foreground/60">{entry.pronounce}</div> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            void onAddCardToInsight();
          }}
          className="shrink-0 rounded-md border border-black/10 dark:border-white/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
          title={lessonId ? "Add this dictionary card to the lesson" : "Add this dictionary card to a note"}
        >
          Add card
        </button>
      </header>
      {entry.heading ? <div className="text-xs uppercase tracking-wide text-foreground/60">{entry.heading}</div> : null}
      <DictionaryEntryBody entryText={entry.entryText} />
    </article>
  );
}
