"use client";

import { useLayoutEffect, useState, useSyncExternalStore } from "react";

// Matches the `sm` breakpoint, where the app header appears: below it (phones) the reader keeps its
// header in the scripture column.
const READER_HEADER_SLOT_QUERY = "(min-width: 640px)";

/*
  The mounted slot element, tracked through its callback ref rather than looked up once, so the
  reader follows the slot when the header mounts late (Suspense) or is replaced (a remount after
  a hydration error) instead of portaling into a detached node.
*/
let slotElement: HTMLElement | null = null;
const slotListeners = new Set<() => void>();

function notifySlotListeners() {
  slotListeners.forEach((listener) => listener());
}

function registerSlotElement(element: HTMLDivElement) {
  slotElement = element;
  notifySlotListeners();
  return () => {
    // A replacement slot may already have attached; only clear the one this ref registered.
    if (slotElement !== element) return;
    slotElement = null;
    notifySlotListeners();
  };
}

function subscribeToSlot(listener: () => void) {
  slotListeners.add(listener);
  return () => {
    slotListeners.delete(listener);
  };
}

const getSlot = () => slotElement;
const getServerSlot = () => null;

/**
 * The right side of the app header, where the chapter reader portals its toolbar and notes whenever
 * the header is shown.
 * It stays hidden while empty, and the header only takes the reader layout once it is filled
 * (see `.reader-header-slot` in globals.css), so other routes are unaffected.
 */
export default function ReaderHeaderSlot() {
  return <div ref={registerSlotElement} className="reader-header-slot" />;
}

/**
 * The header slot to portal into when the app header is shown, or null to render in place.
 * `resolved` is false until the client knows where the reader header goes (the viewport is phone
 * width, or the slot is mounted), so the in-place header can stay hidden where the app header is
 * shown until then instead of flashing before it moves.
 */
export function useReaderHeaderSlot(): { slot: HTMLElement | null; resolved: boolean } {
  const slot = useSyncExternalStore(subscribeToSlot, getSlot, getServerSlot);
  const [isWide, setIsWide] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const media = window.matchMedia(READER_HEADER_SLOT_QUERY);
    const sync = () => setIsWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const connectedSlot = slot?.isConnected ? slot : null;
  return {
    slot: isWide ? connectedSlot : null,
    resolved: isWide === false || (isWide === true && connectedSlot !== null),
  };
}
