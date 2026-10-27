"use client";

import { useMemo, useSyncExternalStore } from "react";

export type FavoriteTranslation = {
  id: string;
  label: string;
  language?: string;
  abbreviation?: string;
};

const STORAGE_KEY = "favorite_bible_translations_v1";

function normalizeFavorite(input: Partial<FavoriteTranslation> | null | undefined): FavoriteTranslation | null {
  const id = typeof input?.id === "string" ? input.id.trim() : "";
  if (!id) return null;
  const label = typeof input?.label === "string" && input.label.trim() ? input.label.trim() : id;
  const language = typeof input?.language === "string" && input.language.trim() ? input.language.trim() : undefined;
  const abbreviation = typeof input?.abbreviation === "string" && input.abbreviation.trim() ? input.abbreviation.trim() : undefined;
  return { id, label, language, abbreviation };
}

function parseFavorites(raw: string): FavoriteTranslation[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<FavoriteTranslation>[];
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const out: FavoriteTranslation[] = [];
    for (const item of parsed) {
      const normalized = normalizeFavorite(item);
      if (!normalized) continue;
      const key = normalized.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
    return out;
  } catch {
    return [];
  }
}

function readSnapshot(): string {
  try {
    return typeof window === "undefined" ? "" : window.localStorage.getItem(STORAGE_KEY) || "";
  } catch { return ""; }
}

export function readFavoriteTranslations(): FavoriteTranslation[] {
  return parseFavorites(readSnapshot());
}

const CHANGE_EVENT = "vt-bible-favorites-change";
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useFavoriteTranslations(): FavoriteTranslation[] {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => "");
  return useMemo(() => parseFavorites(raw), [raw]);
}

export function writeFavoriteTranslations(translations: FavoriteTranslation[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(translations));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Ignore localStorage write failures.
  }
}
