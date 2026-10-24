"use client";

import { useSyncExternalStore } from "react";
import { toLocalDateKey } from "@/lib/comeFollowMe";

/** Notifies at the next local midnight (and on returning to the tab), so "this week" rolls over in place. */
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(() => {
      onChange();
      arm();
    }, midnight.getTime() - now.getTime() + 1000);
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  arm();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const todayKey = () => toLocalDateKey(new Date());

/**
 * Today as a local YYYY-MM-DD key. Server rendering and hydration use `serverKey` (null when the server
 * cannot know the reader's day), so the markup matches; the reader's own day takes over right after.
 */
export function useTodayKey(serverKey: string | null = null): string | null {
  return useSyncExternalStore(subscribe, todayKey, () => serverKey);
}
