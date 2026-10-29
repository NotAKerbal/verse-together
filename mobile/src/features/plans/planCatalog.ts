import { QUICK_NAV_BOOKS, type QuickNavBook } from "@/lib/scriptureQuickNav";
import { normalizeScriptureVolume } from "@/lib/scriptureVolumes";

export const PLAN_VOLUME_IDS = [
  "bookofmormon",
  "oldtestament",
  "newtestament",
  "doctrineandcovenants",
  "pearl",
] as const;

export function getCatalogBooks(volume: string): QuickNavBook[] {
  const canonical = normalizeScriptureVolume(volume);
  return QUICK_NAV_BOOKS.filter((entry) => entry.volume === canonical);
}
