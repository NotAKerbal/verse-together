// The Bibles this device reads (the web's Settings → Bible translations, BibleTranslationControls.tsx): the saved
// library (src/lib/translationFavorites.ts), the default Bible that opens as a chapter's main text
// (src/lib/defaultBible.ts: "lds" is the bundled King James Bible, anything else a HelloAO translation id), and
// whether Joseph Smith Translation excerpts show (src/lib/jstPreference.ts). Each is kept on this device under the
// web's own name and in the web's own format, as the web keeps them in the browser.
//
// The chapter reader reads these; Settings and the reader's settings change them through the functions here.

import { useMemo, useSyncExternalStore } from "react";
import { LDS_BIBLE_ID, normalizeDefaultBible } from "@/lib/defaultBible";
import { JST_PREFERENCE_STORAGE_KEY, parseJstPreference, serializeJstPreference } from "@/lib/jst";
import { persistedText } from "./preferences";

export { LDS_BIBLE_ID, defaultBibleNotice, normalizeDefaultBible } from "@/lib/defaultBible";
export { FEATURED_BIBLES, withComparison } from "@/lib/translationCatalog";
export { JST_PREFERENCE_STORAGE_KEY, JST_SOURCE_DOCS_URL } from "@/lib/jst";

/** A saved Bible: the web's FavoriteTranslation. */
export type SavedBible = { id: string; label: string; language?: string; abbreviation?: string };

/** The web's localStorage key for the saved library (translationFavorites.ts). */
export const SAVED_BIBLES_KEY = "favorite_bible_translations_v1";
/** The web keeps the default Bible in this cookie; the app keeps the same value under the same name. */
export const DEFAULT_BIBLE_KEY = "vt-default-bible-v1";

/** Provider ids are compared without case, as the web does. */
export function sameBibleId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function normalizeSaved(input: Partial<SavedBible> | null | undefined): SavedBible | null {
  const id = typeof input?.id === "string" ? input.id.trim() : "";
  if (!id) return null;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  return { id, label: text(input?.label) ?? id, language: text(input?.language), abbreviation: text(input?.abbreviation) };
}

/** The saved library from its stored text: valid entries, each id once (the first kept), as the web parses it. */
export function parseSavedBibles(raw: string | null): SavedBible[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: SavedBible[] = [];
    for (const item of parsed) {
      const normalized = normalizeSaved(item as Partial<SavedBible>);
      if (!normalized || seen.has(normalized.id.toLowerCase())) continue;
      seen.add(normalized.id.toLowerCase());
      out.push(normalized);
    }
    return out;
  } catch {
    return [];
  }
}

const savedBibles = persistedText<SavedBible[]>(SAVED_BIBLES_KEY, parseSavedBibles, (list) => JSON.stringify(list));
const defaultBible = persistedText<string>(DEFAULT_BIBLE_KEY, normalizeDefaultBible, normalizeDefaultBible);
const jstPreference = persistedText<boolean>(JST_PREFERENCE_STORAGE_KEY, parseJstPreference, serializeJstPreference);

export function readSavedBibles(): SavedBible[] {
  return savedBibles.get();
}

export function readDefaultBible(): string {
  return defaultBible.get();
}

export function readJstEnabled(): boolean {
  return jstPreference.get();
}

/** Adds a Bible to the end of the library (an id already saved is left as it is). False when the device refuses. */
export function saveBible(next: SavedBible): boolean {
  const normalized = normalizeSaved(next);
  if (!normalized) return false;
  const current = savedBibles.get();
  if (current.some((item) => sameBibleId(item.id, normalized.id))) return true;
  return savedBibles.set([...current, normalized]);
}

/**
 * Removes a Bible from the library. Removing the default Bible makes the King James Bible the default again first,
 * as the web does, so the default is never a Bible that isn't saved. False when the device refuses either change.
 */
export function removeBible(id: string): boolean {
  if (sameBibleId(defaultBible.get(), id) && !defaultBible.set(LDS_BIBLE_ID)) return false;
  return savedBibles.set(savedBibles.get().filter((item) => !sameBibleId(item.id, id)));
}

export function setDefaultBible(id: string): boolean {
  return defaultBible.set(normalizeDefaultBible(id));
}

export function setJstEnabled(enabled: boolean): boolean {
  return jstPreference.set(enabled);
}

/** The bundled Bible's name: the LDS edition's name only where Latter-day Saint content shows (the web's label). */
export function baseBibleLabel(showLdsContent: boolean): string {
  return showLdsContent ? "King James Bible (LDS edition)" : "King James Bible";
}

export function useSavedBibles(): SavedBible[] {
  return useSyncExternalStore(savedBibles.subscribe, savedBibles.get, savedBibles.get);
}

export function useDefaultBible(): [string, (id: string) => boolean] {
  const id = useSyncExternalStore(defaultBible.subscribe, defaultBible.get, defaultBible.get);
  return [id, setDefaultBible];
}

export function useJstPreference(): [boolean, (next: boolean) => boolean] {
  const enabled = useSyncExternalStore(jstPreference.subscribe, jstPreference.get, jstPreference.get);
  return [enabled, setJstEnabled];
}

export function useBibleLibrary(): { saved: SavedBible[]; defaultBible: string; jstEnabled: boolean } {
  const saved = useSavedBibles();
  const [id] = useDefaultBible();
  const [jstEnabled] = useJstPreference();
  return useMemo(() => ({ saved, defaultBible: id, jstEnabled }), [saved, id, jstEnabled]);
}

/** Tests: forget the cached values after replacing the storage port. */
export function resetBibleLibrary() {
  savedBibles.reset();
  defaultBible.reset();
  jstPreference.reset();
}
