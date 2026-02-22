"use client";

import { useAuth } from "@/lib/auth";
import { useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { api } from "../../convex/_generated/api";

type EtymologyItem = {
  id: string;
  source: string;
  word: string;
  text: string;
};

export default function EtymologyEntryCard({ item }: { item: EtymologyItem }) {
  const { user } = useAuth();
  const { addDictionaryBlock, openBuilder } = useInsightBuilder();
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("lessonId");
  const lessonsApi = (api as any).lessons;
  const addLessonCard = useMutation(lessonsApi.addCard);

  async function onAddCardToInsight() {
    if (!user) {
      alert("Please sign in to build notes.");
      return;
    }
    if (lessonId) {
      await addLessonCard({
        lessonId: lessonId as any,
        type: "notes",
        title: item.word?.trim() || "Etymology",
        body: item.text?.trim() || "",
        noteComponentType: "dictionary",
        notesVisibility: "shared_readonly",
        dictionaryMeta: {
          edition: "ETY",
          word: item.word?.trim() || "Etymology",
          heading: item.source?.trim() || "Etymology",
        },
      });
      return;
    }
    await addDictionaryBlock({
      edition: "ETY",
      word: item.word?.trim() || "Etymology",
      heading: item.source?.trim() || "Etymology",
      entryText: item.text?.trim() || "",
    });
    openBuilder();
  }

  return (
    <article className="rounded-md border border-black/10 dark:border-white/15 bg-background/70 p-3 space-y-2">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h5 className="text-sm font-semibold">{item.word}</h5>
          <span className="inline-flex rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-[11px] text-foreground/70">
            {item.source}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            void onAddCardToInsight();
          }}
          className="shrink-0 rounded-md border border-black/10 dark:border-white/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
          title={lessonId ? "Add this etymology card to the lesson" : "Add this etymology card to a note"}
        >
          Add card
        </button>
      </header>
      <p className="text-sm leading-6">{item.text}</p>
    </article>
  );
}
