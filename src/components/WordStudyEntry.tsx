"use client";

import type { ReactNode } from "react";
import { exploreAction } from "@/components/WordStudyLinks";
import { useInsightBuilder, type DictionaryPayload } from "@/features/insights/InsightBuilderProvider";

/** Entry content inside an Explore result row, which supplies the word and source heading. */
export default function WordStudyEntry({ entry, title, children }: {
  entry: DictionaryPayload;
  title: string;
  children: ReactNode;
}) {
  const { addDictionaryBlock, openBuilder } = useInsightBuilder();

  async function addToNote() {
    await addDictionaryBlock(entry);
    openBuilder();
  }

  return (
    <article className="space-y-2">
      {children}
      <button type="button" onClick={() => void addToNote()} className={exploreAction} title={title}>
        Add to note
      </button>
    </article>
  );
}
