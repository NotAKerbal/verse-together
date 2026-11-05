"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useId, useRef } from "react";
import type { ReaderPreferences } from "@/lib/preferences";
import ReaderAppearanceControls, { ComparisonViewControl } from "./ReaderAppearanceControls";

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: ReaderPreferences;
  onChange: (next: ReaderPreferences) => void;
  translationControls?: ReactNode;
  showComparisonView?: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
};

export default function ReaderSettings({
  open,
  onClose,
  prefs,
  onChange,
  translationControls,
  showComparisonView = false,
  anchorRef,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const closeAndRestoreFocus = useCallback(() => {
    onClose();
    anchorRef?.current?.querySelector("button")?.focus();
  }, [anchorRef, onClose]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAndRestoreFocus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, closeAndRestoreFocus, onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      className="absolute right-0 top-full z-40 mt-3 w-[min(92vw,24rem)] max-h-[min(70vh,32rem)] overflow-hidden rounded-lg border border-[color:var(--surface-border)] bg-background shadow-xl"
    >
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain px-4 pb-2 pt-2 text-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="min-w-0 text-base text-foreground">Reading appearance</h2>
            <button
              type="button"
              aria-label="Close reading appearance"
              title="Close"
              onClick={closeAndRestoreFocus}
              className="-mr-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground/70 hover:bg-black/5 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)] dark:hover:bg-white/10"
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <ReaderAppearanceControls prefs={prefs} onChange={onChange} showComparisonView={false} />

          {translationControls ? (
            <section className="space-y-3 border-t border-[color:var(--surface-border)] pt-3">
              {translationControls}
              {showComparisonView ? <ComparisonViewControl prefs={prefs} onChange={onChange} /> : null}
            </section>
          ) : null}

          <div className="border-t border-[color:var(--surface-border)] pt-1">
            <Link
              href="/account#reading"
              onClick={onClose}
              className="inline-flex min-h-11 items-center text-xs font-medium text-foreground/70 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]"
            >
              All settings
            </Link>
          </div>
        </div>
    </div>
  );
}
