"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import TranslationCatalogPicker from "@/components/TranslationCatalogPicker";
import { BIBLE_TRANSLATION_OPTIONS, type BibleTranslationId } from "@/lib/bibleCanon";
import {
  readFavoriteTranslations,
  writeFavoriteTranslations,
  type FavoriteTranslation,
} from "@/lib/translationFavorites";

type Props = {
  volume: string;
  book: string;
  chapter: string;
  translation: BibleTranslationId;
  compare: BibleTranslationId[];
};

const TRANSLATION_DESCRIPTIONS: Record<string, string> = {
  kjv: "A classic English translation with traditional wording and literary cadence. Good if you want familiar phrasing that many readers recognize immediately.",
  web: "A modern public-domain update that keeps a fairly literal approach while improving readability. Helpful when you want clearer language without drifting far from traditional structure.",
  asv: "A formal, word-for-word style translation with careful attention to the original text. Useful when you want precise wording for close comparison.",
  bbe: "A simplified translation written with a smaller core vocabulary. Great for quick reading and easier comprehension of dense passages.",
  darby: "A literal translation known for consistent wording choices and close textual alignment. Helpful for detailed study and side-by-side analysis.",
  dra: "An English translation in the Catholic Douay-Rheims tradition with older devotional language. Useful for historical comparison and a different translation lineage.",
  webbe: "A British English edition of the WEB with Commonwealth spelling and wording. Good when you prefer UK-style orthography while keeping modern readability.",
  "oeb-us": "A contemporary translation focused on natural U.S. English expression. Useful when you want clear modern phrasing for comparison.",
  "oeb-cw": "A contemporary translation tuned for Commonwealth English style. Helpful for modern reading with UK/AU-friendly word choices.",
};

function buildQuery(translation: BibleTranslationId, compareIds: BibleTranslationId[]): string {
  const params = new URLSearchParams();
  params.set("translation", translation);
  compareIds.forEach((id) => {
    if (id !== translation) params.append("compare", id);
  });
  return params.toString();
}

function getSelectedIds(
  translation: BibleTranslationId,
  compare: BibleTranslationId[],
  availableIds: BibleTranslationId[]
): BibleTranslationId[] {
  const set = new Set<BibleTranslationId>([translation, ...compare.filter((id) => id !== translation)]);
  return availableIds.filter((id) => set.has(id));
}

function buildToggleQuery(
  targetId: BibleTranslationId,
  translation: BibleTranslationId,
  compare: BibleTranslationId[],
  availableIds: BibleTranslationId[]
): string {
  const selectedSet = new Set<BibleTranslationId>(getSelectedIds(translation, compare, availableIds));
  if (selectedSet.has(targetId)) {
    if (selectedSet.size > 1) selectedSet.delete(targetId);
  } else {
    selectedSet.add(targetId);
  }
  const orderedSelected = availableIds.filter((id) => selectedSet.has(id));
  const nextTranslation = orderedSelected.includes(translation)
    ? translation
    : orderedSelected[0] ?? translation;
  const nextCompare = orderedSelected.filter((id) => id !== nextTranslation);
  return buildQuery(nextTranslation, nextCompare);
}

export default function BibleTranslationToolbar({ volume, book, chapter, translation, compare }: Props) {
  const [favorites, setFavorites] = useState<FavoriteTranslation[]>([]);

  useEffect(() => {
    setFavorites(readFavoriteTranslations());
  }, []);

  const options = useMemo(() => {
    const builtIn = BIBLE_TRANSLATION_OPTIONS.map((item) => ({ id: item.id, label: item.label, source: "builtin" as const }));
    const seen = new Set(builtIn.map((item) => item.id.toLowerCase()));
    const custom = favorites
      .filter((item) => {
        const key = item.id.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({ id: item.id, label: item.label, source: "favorite" as const }));
    const querySelected = [translation, ...compare];
    const selectedFromQuery = querySelected
      .filter((id) => {
        const key = id.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((id) => ({ id, label: id, source: "favorite" as const }));
    return [...builtIn, ...custom, ...selectedFromQuery];
  }, [compare, favorites, translation]);

  const optionIds = useMemo(() => options.map((item) => item.id), [options]);
  const selectedIds = new Set(getSelectedIds(translation, compare, optionIds));
  const selectedCount = selectedIds.size;

  function addFavorite(next: FavoriteTranslation) {
    setFavorites((current) => {
      if (current.some((item) => item.id.toLowerCase() === next.id.toLowerCase())) return current;
      const updated = [...current, next];
      writeFavoriteTranslations(updated);
      return updated;
    });
  }

  return (
    <details className="rounded-lg border border-black/10 dark:border-white/15 p-3">
      <summary className="cursor-pointer select-none text-sm font-medium list-none">
        <span className="inline-flex items-center gap-2">
          <span>Translations</span>
          <span className="text-xs text-foreground/60">({selectedCount} selected)</span>
        </span>
      </summary>
      <div className="mt-2 space-y-3">
        <div className="text-xs text-foreground/70">Bible source: bible-api.com + bible.helloao.org</div>
        <div className="text-xs text-foreground/70">Select one or more translations to compare wording differences.</div>
        <TranslationCatalogPicker
          existingIds={optionIds}
          onAddFavorite={(item) => addFavorite(item)}
        />
        <div className="grid gap-2 grid-cols-1">
          {options.map((option) => {
            const isSelected = selectedIds.has(option.id);
            const description = TRANSLATION_DESCRIPTIONS[option.id] ?? `${option.label} is included for comparison. Select it to view wording differences.`;
            return (
              <Link
                key={option.id}
                href={`/browse/${volume}/${book}/${chapter}?${buildToggleQuery(option.id, translation, compare, optionIds)}`}
                className={`rounded-md border p-2 transition-colors ${
                  isSelected
                    ? "border-sky-600/40 bg-sky-500/10"
                    : "border-black/10 dark:border-white/15"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{option.id.toUpperCase()}</div>
                  <div className="flex items-center gap-2">
                    {option.source === "favorite" ? (
                      <span className="text-[10px] uppercase tracking-wide text-foreground/60">Favorite</span>
                    ) : null}
                    {isSelected ? (
                      <span className="text-[10px] uppercase tracking-wide text-sky-700 dark:text-sky-300">Selected</span>
                    ) : null}
                  </div>
                </div>
                <div className="text-[11px] text-foreground/70">{option.label}.</div>
                <div className="mt-1 text-[11px] leading-relaxed text-foreground/60">
                  {description}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </details>
  );
}
