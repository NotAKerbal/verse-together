"use client";

import { useMemo, type ComponentProps } from "react";
import BibleTranslationToolbar from "@/components/BibleTranslationToolbar";
import ChapterReader from "@/components/ChapterReader";
import { useSavedComparisons } from "@/lib/bibleComparisons";
import { resolveChapterComparisons } from "@/lib/translationCatalog";

type Props = Pick<ComponentProps<typeof ChapterReader>, "chrome" | "content"> & {
  defaultBible: string;
  urlComparisons: string[] | null;
};

export default function BibleChapterReader({ chrome, content, defaultBible, urlComparisons }: Props) {
  const saved = useSavedComparisons();
  const comparisons = useMemo(
    () => resolveChapterComparisons(urlComparisons, saved, defaultBible),
    [urlComparisons, saved, defaultBible]
  );
  return (
    <ChapterReader
      chrome={chrome}
      content={content}
      translationControls={<BibleTranslationToolbar pathname={chrome.pathname} compare={comparisons} />}
      overlayTranslations={comparisons}
    />
  );
}
