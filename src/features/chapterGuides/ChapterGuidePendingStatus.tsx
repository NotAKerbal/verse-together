"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { chapterGuideConnectionMessage, type ChapterGuideGenerating, chapterGuideNoGuideMessage } from "@/lib/chapterGuideView";
import ChapterGuideProgress from "./ChapterGuideProgress";
import { useChapterGuideSelection } from "./useChapterGuideSelection";

const FIRST_VERSE_ONLY = "1";

export default function ChapterGuidePendingStatus({ chapter, reference, generating, renderedAt }: {
  chapter: { volume: string; book: string; chapter: number };
  reference: string;
  generating: ChapterGuideGenerating;
  renderedAt: number;
}) {
  const router = useRouter();
  const { state, stateLoadedAt, loadFailed } = useChapterGuideSelection(chapter, FIRST_VERSE_ONLY, { expectGenerating: true });
  const hasGuide = state?.hasGuide === true;

  useEffect(() => {
    if (hasGuide) router.refresh();
  }, [hasGuide, router]);

  if (hasGuide) return <p role="status">The guide for {reference} is ready. Opening it…</p>;
  if (state && !state.generating) return <p role="status">{chapterGuideNoGuideMessage(state, reference, stateLoadedAt)}</p>;
  const lastKnown = state?.generating ?? generating;
  if (loadFailed) return <p role="status">{chapterGuideConnectionMessage(reference, lastKnown)}</p>;
  return <ChapterGuideProgress reference={reference} generating={lastKnown} now={stateLoadedAt ?? renderedAt} />;
}
