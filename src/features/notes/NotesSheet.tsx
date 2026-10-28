"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { focusNotesLauncher, type NotesPanelFrame } from "./NotesSidebar";
import styles from "./NotesSheet.module.css";

const FOCUSABLE_SELECTOR =
  'a[href], summary, button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const CLOSE_BUTTON_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-button-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]";

/** How far the handle is dragged down before letting go closes the sheet. */
const DRAG_CLOSE_DISTANCE = 90;
/** Keyboards are taller than this; smaller gaps between the viewports are browser toolbars. */
const KEYBOARD_MIN_HEIGHT = 80;

/**
 * Below lg, a chapter or lesson page's Log: a modal bottom sheet opened by the reader's Log button, a lesson's Add
 * note, or a reader note action, as tall as the screen allows and above an open keyboard. It holds the same panel
 * as the desktop sidebar (`children`, given the sheet's title id and close button for the panel's one header row).
 */
export default function NotesSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (frame: NotesPanelFrame) => ReactNode;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        onCloseRef.current();
        return;
      }
      // The sheet is modal: keep Tab focus inside it.
      const sheet = sheetRef.current;
      if (event.key !== "Tab" || !sheet) return;
      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        sheet.focus();
      } else if (!sheet.contains(active) || (event.shiftKey && (active === first || active === sheet))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreTo && restoreTo.isConnected && restoreTo !== document.body) restoreTo.focus();
      else focusNotesLauncher();
    };
  }, []);

  // A fixed sheet sits on the layout viewport, which an on-screen keyboard covers without resizing (iOS, and
  // Android by default). Follow the visual viewport instead, so the field being typed in stays above the keyboard.
  useEffect(() => {
    const sheet = sheetRef.current;
    const viewport = window.visualViewport;
    if (!sheet || !viewport) return;
    let frame = 0;
    function apply() {
      frame = 0;
      if (!sheet || !viewport) return;
      // Pinch zoom also shrinks the visual viewport; only follow it at normal scale. Detect the keyboard by how much
      // the visual viewport shrank: iOS may also pan it down (offsetTop), leaving less of the layout viewport covered.
      const keyboard = viewport.scale > 1.01 ? 0 : window.innerHeight - viewport.height;
      if (keyboard < KEYBOARD_MIN_HEIGHT) {
        sheet.style.removeProperty("--notes-sheet-keyboard");
        sheet.style.removeProperty("--notes-sheet-viewport");
        delete sheet.dataset.keyboard;
        return;
      }
      // Pin the sheet's bottom to the visual viewport's bottom, wherever that sits in the layout viewport.
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      sheet.style.setProperty("--notes-sheet-keyboard", `${Math.round(covered)}px`);
      sheet.style.setProperty("--notes-sheet-viewport", `${Math.round(viewport.height)}px`);
      sheet.dataset.keyboard = "open";
      const active = document.activeElement;
      if (active instanceof HTMLElement && sheet.contains(active) && active.matches("input, select, textarea")) {
        active.scrollIntoView({ block: "nearest" });
      }
    }
    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(apply);
    }
    apply();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  function onHandleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    dragStartYRef.current = event.touches[0]?.clientY ?? null;
    setDragging(dragStartYRef.current !== null);
  }
  function onHandleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    if (dragStartYRef.current === null) return;
    const delta = (event.touches[0]?.clientY ?? dragStartYRef.current) - dragStartYRef.current;
    setDragOffset(Math.max(0, delta));
  }
  function endDrag() {
    dragStartYRef.current = null;
    setDragging(false);
    setDragOffset(0);
  }
  function onHandleTouchEnd() {
    const shouldClose = dragOffset > DRAG_CLOSE_DISTANCE;
    endDrag();
    if (shouldClose) onClose();
  }

  return (
    <div className="simple-hide lg:hidden">
      <button type="button" tabIndex={-1} aria-label="Close Journal" onClick={onClose} className={`${styles.backdrop} fixed inset-0 z-50 bg-black/30`} />
      <section
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-dragging={dragging ? "true" : undefined}
        style={{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }}
        className={`${styles.sheet} panel-card fixed inset-x-0 z-50 mx-auto flex w-full flex-col overflow-hidden rounded-t-[1.25rem] border-b-0 font-sans outline-none sm:max-w-[40rem]`}
      >
        {/* Drag down to close; Escape, the close button and the dimmed page do the same. */}
        <div
          className="flex h-6 shrink-0 cursor-grab items-center justify-center touch-none"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onTouchCancel={endDrag}
          aria-hidden="true"
        >
          <span className="h-1.5 w-12 rounded-full bg-[color:var(--surface-border)] opacity-50" />
        </div>
        {children({
          titleId,
          closeButton: (
            <button type="button" onClick={onClose} aria-label="Close Journal" title="Close" className={CLOSE_BUTTON_CLASS}>
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden="true" />
            </button>
          ),
        })}
      </section>
    </div>
  );
}
