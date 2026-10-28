"use client";

import { useSyncExternalStore } from "react";
import { FAITH_TRADITION_STORAGE_KEY, normalizeFaithTradition, type FaithTradition } from "./faithTradition";
const CHANGE_EVENT = "vt-faith-tradition-change";
function snapshot(): FaithTradition {
  try { return normalizeFaithTradition(window.localStorage.getItem(FAITH_TRADITION_STORAGE_KEY)); }
  catch { return "latter-day-saint"; }
}
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === FAITH_TRADITION_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
function setTradition(value: FaithTradition): boolean {
  try { window.localStorage.setItem(FAITH_TRADITION_STORAGE_KEY, normalizeFaithTradition(value)); }
  catch { return false; }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}
export function useFaithTradition() {
  // Render the shared Bible experience until this device’s preference is known.
  // This prevents excluded material flashing on screen during hydration.
  const tradition = useSyncExternalStore(subscribe, snapshot, () => "other" as const);
  return { tradition, showLdsContent: tradition === "latter-day-saint", setTradition };
}
