"use client";

import { useCallback, useEffect, useState } from "react";

/*
  Simple mode hides study tools and chrome so only the scripture text remains.
  It is a `data-simple="true"` attribute on <html>; globals.css does the hiding
  through `.simple-hide` / `.simple-only`. The inline script in layout.tsx
  applies the stored value before first paint so there is no flash.
*/

export const SIMPLE_MODE_STORAGE_KEY = "vt_simple_mode_v1";
export const SIMPLE_MODE_CHANGE_EVENT = "vt-simple-mode-change";

export function readStoredSimpleMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIMPLE_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function readSimpleModeFromDom(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-simple") === "true";
}

export function applySimpleMode(enabled: boolean): void {
  if (typeof document === "undefined") return;
  if (enabled) {
    document.documentElement.setAttribute("data-simple", "true");
  } else {
    document.documentElement.removeAttribute("data-simple");
  }
}

export function saveSimpleMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIMPLE_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

/** Client hook: `[enabled, setEnabled]`, kept in sync across every instance and tab. */
export function useSimpleMode(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    function syncFromDom() {
      setEnabledState(readSimpleModeFromDom());
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== SIMPLE_MODE_STORAGE_KEY) return;
      const next = readStoredSimpleMode();
      applySimpleMode(next);
      setEnabledState(next);
    }
    syncFromDom();
    window.addEventListener(SIMPLE_MODE_CHANGE_EVENT, syncFromDom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SIMPLE_MODE_CHANGE_EVENT, syncFromDom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    applySimpleMode(next);
    saveSimpleMode(next);
    window.dispatchEvent(new Event(SIMPLE_MODE_CHANGE_EVENT));
  }, []);

  return [enabled, setEnabled];
}
