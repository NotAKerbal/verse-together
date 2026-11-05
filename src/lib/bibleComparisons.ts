"use client";

import { useMemo, useSyncExternalStore } from "react";
import { readStorageValue, writeStorageValue } from "@/lib/clientStorage";
import { parseSavedComparisons } from "@/lib/translationCatalog";

export const BIBLE_COMPARISONS_STORAGE_KEY = "vt_bible_comparisons_v1";

const CHANGE_EVENT = "vt-bible-comparisons-change";

function subscribe(onChange: () => void): () => void {
  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === BIBLE_COMPARISONS_STORAGE_KEY) onChange();
  }
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readSnapshot(): string {
  return readStorageValue("local", BIBLE_COMPARISONS_STORAGE_KEY) ?? "";
}

export function readSavedComparisons(): string[] {
  return parseSavedComparisons(readSnapshot());
}

export function writeSavedComparisons(ids: string[]): boolean {
  const saved = writeStorageValue("local", BIBLE_COMPARISONS_STORAGE_KEY, JSON.stringify(ids));
  if (saved) window.dispatchEvent(new Event(CHANGE_EVENT));
  return saved;
}

export function removeSavedComparison(id: string): boolean {
  const current = readSavedComparisons();
  const rest = current.filter((item) => item.toLowerCase() !== id.toLowerCase());
  return rest.length === current.length || writeSavedComparisons(rest);
}

export function useSavedComparisons(): string[] {
  const raw = useSyncExternalStore(subscribe, readSnapshot, () => "");
  return useMemo(() => parseSavedComparisons(raw), [raw]);
}
