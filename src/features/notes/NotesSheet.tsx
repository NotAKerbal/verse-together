"use client";

import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  NotesCompanionLayout,
  NotesPanelContent,
  focusNotesLauncher,
  type NotesCompanion,
  type NotesPanelNotes,
} from "./NotesSidebar";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const CLOSE_BUTTON_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-button-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]";

/**
 * Below lg, a chapter page's Log and Notes panel: a modal bottom sheet opened by the reader's Log button. Notes shows
 * the same list and editor as the desktop sidebar; reader actions elsewhere still open the full-screen /notes page.
 */
export default function NotesSheet({
  onClose,
  companion,
  ...notesProps
}: NotesPanelNotes & { onClose: () => void; companion: NotesCompanion }) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
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

  function onHandleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    dragStartYRef.current = event.touches[0]?.clientY ?? null;
  }
  function onHandleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    if (dragStartYRef.current === null) return;
    const delta = (event.touches[0]?.clientY ?? dragStartYRef.current) - dragStartYRef.current;
    setDragOffset(Math.max(0, delta));
  }
  function onHandleTouchEnd() {
    const shouldClose = dragOffset > 90;
    dragStartYRef.current = null;
    setDragOffset(0);
    if (shouldClose) onClose();
  }

  return (
    <div className="simple-hide lg:hidden">
      <button type="button" tabIndex={-1} aria-label="Close Log and Notes" onClick={onClose} className="fixed inset-0 z-50 bg-black/30" />
      <section
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Log and Notes"
        style={{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }}
        className="panel-card fixed inset-x-0 bottom-0 z-50 flex h-[80dvh] flex-col overflow-hidden rounded-t-[1.25rem] border-b-0 font-sans outline-none"
      >
        <div
          className="flex shrink-0 cursor-grab justify-center pb-1 pt-2 touch-none"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          aria-hidden="true"
        >
          <span className="h-1.5 w-12 rounded-full bg-[color:var(--surface-border)] opacity-50" />
        </div>
        <NotesCompanionLayout
          companion={companion}
          closeButton={
            <button type="button" onClick={onClose} aria-label="Close Log and Notes" title="Close" className={CLOSE_BUTTON_CLASS}>
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        >
          <NotesPanelContent {...notesProps} />
        </NotesCompanionLayout>
      </section>
    </div>
  );
}
