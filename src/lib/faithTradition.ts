import { normalizeScriptureVolume } from "./scriptureVolumes";

// Add future traditions here; content policies can then be chosen by their stable ID.
export const FAITH_TRADITIONS = [
  { id: "latter-day-saint", label: "Church of Jesus Christ of Latter-day Saints" },
  { id: "other", label: "Other denominations" },
] as const;
export type FaithTradition = (typeof FAITH_TRADITIONS)[number]["id"];
export const FAITH_TRADITION_STORAGE_KEY = "vt_faith_tradition_v1";
export function normalizeFaithTradition(value: unknown): FaithTradition {
  return FAITH_TRADITIONS.find((option) => option.id === value)?.id ?? "latter-day-saint";
}
export function isLdsVolume(volume: string): boolean {
  return ["bookofmormon", "doctrineandcovenants", "pearl"].includes(normalizeScriptureVolume(volume));
}
export function isLdsContentPath(href: string): boolean {
  const [path] = href.split(/[?#]/);
  const parts = path.split("/").filter(Boolean);
  return ["come-follow-me", "feed", "talk", "resources"].includes(parts[0]) ||
    (["browse", "share"].includes(parts[0]) && isLdsVolume(parts[1] ?? ""));
}
