"use client";

import { useId, useLayoutEffect, useSyncExternalStore } from "react";

// Wide enough for the chapter header to sit beside the floating navigation; narrower screens keep it in the page.
const READER_HEADER_DOCK_QUERY = "(min-width: 900px)"; // Matches `.reader-header-inline[data-dock-pending]` in globals.css.

/*
  The mounted slot, tracked through its callback ref so the reader follows the slot when the header mounts late or
  is replaced, and the chapter headers that want it. Only the most recent claim is drawn there: while a chapter
  opens, its page (ChapterReaderShell) and the reader it replaces are both mounted, and the header shows only one.
*/
let slotElement: HTMLElement | null = null;
let claims: string[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function registerSlotElement(element: HTMLDivElement) {
  slotElement = element;
  notify();
  // Rows under the docked toolbar (comparison key, notices) make the header taller; --header-height follows so the
  // page and the panels below the header keep clear of them.
  const root = document.documentElement;
  const observer = new ResizeObserver(() => {
    const toolbar = element.firstElementChild as HTMLElement | null;
    const extra = toolbar ? element.offsetHeight - toolbar.offsetHeight : 0;
    if (extra > 1) root.style.setProperty("--header-height", `calc(4rem + ${Math.ceil(extra)}px)`);
    else root.style.removeProperty("--header-height");
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    root.style.removeProperty("--header-height");
    // A replacement slot may already have attached; only clear the one this ref registered.
    if (slotElement !== element) return;
    slotElement = null;
    notify();
  };
}

function subscribeToMedia(listener: () => void) {
  const media = window.matchMedia(READER_HEADER_DOCK_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/**
 * The right side of the floating app header, where the chapter reader's header is drawn on wide screens. It stays
 * hidden while empty, and the header only takes the reader layout once it is filled (see `.reader-header-slot` in
 * globals.css), so other routes are unaffected.
 */
export default function ReaderHeaderSlot() {
  return <div ref={registerSlotElement} className="reader-header-slot" />;
}

/**
 * Where a chapter header goes. `slot` is the app header's slot to portal into, or null to draw in the page.
 * `pending` is true while it may still move to the header (before hydration, or while another chapter header holds
 * the slot), so the in-page header can stay hidden on wide screens instead of flashing there first.
 */
export function useReaderHeaderDock(enabled: boolean): { slot: HTMLElement | null; pending: boolean } {
  const id = useId();
  const wide = useSyncExternalStore(
    subscribeToMedia,
    () => window.matchMedia(READER_HEADER_DOCK_QUERY).matches,
    () => null
  );
  const slot = useSyncExternalStore(subscribe, () => slotElement, () => null);
  const owner = useSyncExternalStore(subscribe, () => claims.at(-1) ?? null, () => null);
  const claiming = enabled && wide === true;

  useLayoutEffect(() => {
    if (!claiming) return;
    claims = [...claims, id];
    notify();
    return () => {
      claims = claims.filter((claim) => claim !== id);
      notify();
    };
  }, [claiming, id]);

  const connected = slot?.isConnected ? slot : null;
  return {
    slot: claiming && owner === id ? connected : null,
    pending: enabled && (wide === null || (wide && connected !== null && owner !== id)),
  };
}
