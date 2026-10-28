"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BibleTranslationControls from "./BibleTranslationControls";
import type { BibleTranslationId } from "@/lib/bibleCanon";
import { comparisonQuery, withComparison } from "@/lib/translationCatalog";

type Props = { volume: string; book: string; chapter: string; compare: BibleTranslationId[] };

/** Keep chapter visibility in the URL; the shared controls also manage the device's saved Bibles. */
export default function BibleTranslationToolbar({ volume, book, chapter, compare }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Quick taps build on the requested state while the chapter navigation catches up.
  const [shown, setShownOptimistic] = useOptimistic(compare);
  const [, startTransition] = useTransition();

  function setShown(id: string, on: boolean) {
    const next = withComparison(shown, id, on);
    if (next.length === shown.length && next.every((item, index) => item === shown[index])) return;
    const query = comparisonQuery(searchParams.toString(), next);
    startTransition(() => {
      setShownOptimistic(next);
      router.replace(`/browse/${volume}/${book}/${chapter}${query ? `?${query}` : ""}`, { scroll: false });
    });
  }

  return <BibleTranslationControls shown={shown} onShownChange={setShown} />;
}
