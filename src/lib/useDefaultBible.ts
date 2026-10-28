"use client";

import { useSyncExternalStore } from "react";
import { saveDefaultBible } from "@/app/actions/defaultBible";
import { DEFAULT_BIBLE_COOKIE, LDS_BIBLE_ID, normalizeDefaultBible } from "./defaultBible";

const CHANGE_EVENT = "vt-default-bible-change";
function readDefaultBible(): string {
  const value = document.cookie.split("; ").find((item) => item.startsWith(`${DEFAULT_BIBLE_COOKIE}=`))?.split("=")[1];
  return normalizeDefaultBible(value);
}
function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("focus", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("focus", listener);
  };
}

export function useDefaultBible(): [string, (id: string) => Promise<void>] {
  const id = useSyncExternalStore(subscribe, readDefaultBible, () => LDS_BIBLE_ID);
  return [id, async (next) => {
    // Server Actions invalidate the router cache, so the next chapter uses the new preference too.
    await saveDefaultBible(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }];
}
