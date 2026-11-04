"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BibleTranslationControls from "./BibleTranslationControls";
import type { BibleTranslationId } from "@/lib/bibleCanon";
import { writeSavedComparisons } from "@/lib/bibleComparisons";
import { hrefAfterComparisonChange, withComparison } from "@/lib/translationCatalog";

type Props = { pathname: string; compare: BibleTranslationId[] };

export default function BibleTranslationToolbar({ pathname, compare }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [shown, setShownOptimistic] = useOptimistic(compare);
  const [, startTransition] = useTransition();

  function setShown(id: string, on: boolean) {
    const next = withComparison(shown, id, on);
    if (next.length === shown.length && next.every((item, index) => item === shown[index])) return;
    const saved = writeSavedComparisons(next);
    const href = hrefAfterComparisonChange(pathname, searchParams.toString(), next, saved);
    if (!href) return;
    startTransition(() => {
      setShownOptimistic(next);
      router.replace(href, { scroll: false });
    });
  }

  return <BibleTranslationControls shown={shown} onShownChange={setShown} />;
}
