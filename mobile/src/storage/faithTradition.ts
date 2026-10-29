// The faith tradition this device shows content for (the web's src/lib/faithTradition.ts and useFaithTradition.ts):
// "Church of Jesus Christ of Latter-day Saints" (the default) or "Other denominations", which keeps Bible reading and
// the journal and hides Latter-day Saint scriptures, Come, Follow Me, the Joseph Smith Translation and study helps.
// Kept on this device only, under the web's key, never in an account. Native storage reads synchronously, so the
// first frame already knows the choice and excluded content never flashes on screen.

import { useSyncExternalStore } from "react";
import { FAITH_TRADITION_STORAGE_KEY, normalizeFaithTradition, type FaithTradition } from "@/lib/faithTradition";
import { persistedText } from "./preferences";

export { FAITH_TRADITIONS, FAITH_TRADITION_STORAGE_KEY, isLdsContentPath, isLdsVolume, normalizeFaithTradition, type FaithTradition } from "@/lib/faithTradition";

export const faithTradition = persistedText<FaithTradition>(FAITH_TRADITION_STORAGE_KEY, normalizeFaithTradition, (value) => normalizeFaithTradition(value));

/** True when Latter-day Saint scriptures and resources show (outside React). */
export function showsLdsContent(): boolean {
  return faithTradition.get() === "latter-day-saint";
}

export function useFaithTradition(): { tradition: FaithTradition; showLdsContent: boolean; setTradition: (next: FaithTradition) => boolean } {
  const tradition = useSyncExternalStore(faithTradition.subscribe, faithTradition.get, faithTradition.get);
  return { tradition, showLdsContent: tradition === "latter-day-saint", setTradition: faithTradition.set };
}
