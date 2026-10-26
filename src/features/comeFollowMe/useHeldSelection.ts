"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Touch browsers clear a selection as a tap on the menu begins; keep the menu long enough to take the tap. */
const MENU_LINGER_MS = 400;

type Options<T> = {
  /** The menu's own element: pressing or focusing in it keeps the selection the menu is on. */
  menuRef: RefObject<HTMLElement | null>;
  /** Whether a node is in the text this menu is for (a selection must lie wholly inside it). */
  contains: (node: Node) => boolean;
  /** What a selection in that text means, or null when it is nothing the menu acts on. */
  read: (range: Range) => T | null;
  /** Whether two readings are the same selection in the same place (the menu then doesn't re-render). */
  same: (a: T, b: T) => boolean;
};

/**
 * The text selection a selection menu is on, in some text of the page (the Come, Follow Me scripture pane, or
 * the guide's prose): followed as the reader scrolls (any scroller) and resizes, and held while the reader works
 * in the menu, since a touch on the menu (or focus moving into it) can clear the page's selection. The menu waits
 * for a drag in the text to finish rather than covering the words being selected, lingers briefly as a
 * selection clears (so a tap on it lands), and Escape clears the selection and the menu. `resetKey` re-reads the
 * selection when what it means changes (another book). `clear` dismisses the menu, clearing the page's selection
 * when it is the one the menu is on.
 */
export function useHeldSelection<T>({ menuRef, contains, read, same }: Options<T>, resetKey?: unknown) {
  const [selection, setSelection] = useState<T | null>(null);
  /** The selection's range while the menu shows: the reader may work in the menu after a touch clears the selection. */
  const heldRef = useRef<Range | null>(null);
  /** The reader last pressed or focused inside the menu. */
  const inMenuRef = useRef(false);
  const hideTimerRef = useRef(0);
  // The latest callbacks, read by the listeners (which stay subscribed across renders).
  const latest = useRef({ contains, read, same });
  useLayoutEffect(() => {
    latest.current = { contains, read, same };
  });

  /** Clears the page's selection when it is the one the menu is on (in this text), leaving any other alone. */
  const release = useCallback(() => {
    const native = document.getSelection();
    if (heldRef.current && native?.anchorNode && latest.current.contains(native.anchorNode)) native.removeAllRanges();
  }, []);

  const clear = useCallback(() => {
    release();
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = 0;
    heldRef.current = null;
    inMenuRef.current = false;
    setSelection(null);
  }, [release]);

  useEffect(() => {
    let frame = 0;
    let dragging = false;
    const hideNow = () => {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = 0;
      heldRef.current = null;
      setSelection(null);
    };
    const hide = () => {
      if (!hideTimerRef.current) hideTimerRef.current = window.setTimeout(hideNow, MENU_LINGER_MS);
    };
    const measure = () => {
      frame = 0;
      const { contains, read, same } = latest.current;
      const native = document.getSelection();
      const live = native && native.rangeCount > 0 && !native.isCollapsed ? native.getRangeAt(0) : null;
      // The live selection in the text, else (while the reader works in the menu) the one the menu is on.
      const range = live && contains(live.commonAncestorContainer) ? live : inMenuRef.current ? heldRef.current : null;
      // The menu waits for a drag in the text to finish rather than covering the words being selected.
      if (dragging) {
        hideNow();
        return;
      }
      const next = range ? read(range) : null;
      if (!range || !next) {
        hide();
        return;
      }
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = 0;
      if (range !== heldRef.current) heldRef.current = range.cloneRange();
      setSelection((previous) => (previous !== null && same(previous, next) ? previous : next));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      inMenuRef.current = !!target && !!menuRef.current?.contains(target);
      dragging = !inMenuRef.current && !!target && latest.current.contains(target);
      schedule();
    };
    const onPointerUp = () => {
      dragging = false;
      schedule();
    };
    const onFocusIn = (event: FocusEvent) => {
      inMenuRef.current = !!menuRef.current?.contains(event.target as Node | null);
      schedule();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // The Annotate panel takes its own Escape (back to the actions); a second one clears the selection.
      if (event.key !== "Escape" || !heldRef.current) return;
      release();
      inMenuRef.current = false;
      hideNow();
    };
    schedule();
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    // Any scroller moving (the page, a pane, the strip) carries the selection with it.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = 0;
    };
  }, [menuRef, release, resetKey]);

  /** Update the held range when saving a mark replaces the selected text nodes. */
  const restore = useCallback((range: Range) => {
    heldRef.current = range.cloneRange();
    const native = document.getSelection();
    native?.removeAllRanges();
    native?.addRange(range);
  }, []);

  return { selection, clear, restore };
}
