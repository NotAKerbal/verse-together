"use client";

export type FavoriteTranslation = {
  id: string;
  label: string;
  language?: string;
};

const STORAGE_KEY = "favorite_bible_translations_v1";

function normalizeFavorite(input: Partial<FavoriteTranslation> | null | undefined): FavoriteTranslation | null {
  const id = typeof input?.id === "string" ? input.id.trim() : "";
  if (!id) return null;
  const label = typeof input?.label === "string" && input.label.trim() ? input.label.trim() : id;
  const language = typeof input?.language === "string" && input.language.trim() ? input.language.trim() : undefined;
  return { id, label, language };
}

export function readFavoriteTranslations(): FavoriteTranslation[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

export function writeFavoriteTranslations(translations: FavoriteTranslation[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(translations));
  } catch {
    // Ignore localStorage write failures.
  }
}
