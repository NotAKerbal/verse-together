"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readStorageValue, writeStorageValue } from "@/lib/clientStorage";
import { JST_PREFERENCE_STORAGE_KEY, parseJstPreference, serializeJstPreference } from "@/lib/jst";

/*
  Whether the Bible reader shows Joseph Smith Translation excerpts. Off by default and kept on this device, so it
  follows the reader from chapter to chapter and across reloads, and every open reader and tab stays in step.
*/

const JST_PREFERENCE_CHANGE_EVENT = "vt-bible-jst-change";

function subscribe(onChange: () => void): () => void {
  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === JST_PREFERENCE_STORAGE_KEY) onChange();
  }
  window.addEventListener(JST_PREFERENCE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(JST_PREFERENCE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readEnabled(): boolean {
  return parseJstPreference(readStorageValue("local", JST_PREFERENCE_STORAGE_KEY));
}

/** `[enabled, setEnabled]`; false on the server and until this device's choice is read. */
export function useJstPreference(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);
  const setEnabled = useCallback((next: boolean) => {
    writeStorageValue("local", JST_PREFERENCE_STORAGE_KEY, serializeJstPreference(next));
    window.dispatchEvent(new Event(JST_PREFERENCE_CHANGE_EVENT));
  }, []);
  return [enabled, setEnabled];
}
