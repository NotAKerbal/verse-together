"use client";

import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import type { ReaderPreferences } from "@/lib/preferences";
import { useSimpleMode } from "@/lib/simpleMode";
import ReaderAppearanceControls from "./ReaderAppearanceControls";

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: ReaderPreferences;
  onChange: (next: ReaderPreferences) => void;
  translationControls?: ReactNode;
  anchorRef?: RefObject<HTMLElement | null>;
};

export default function ReaderSettings({ open, onClose, prefs, onChange, translationControls, anchorRef }: Props) {
  const [simpleMode, setSimpleMode] = useSimpleMode();
  const panelRef = useRef<HTMLDivElement | null>(null);

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
        onClose();
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
  }, [anchorRef, onClose, open]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-40 mt-3 w-[min(92vw,24rem)] max-h-[min(70vh,32rem)] overflow-hidden rounded-lg border border-[color:var(--surface-border)] bg-background shadow-xl border-[color:var(--surface-border)]"
    >
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto p-3 text-sm space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--surface-border)] pb-3">
            <div className="min-w-0">
              <div id="simple-mode-label" className="text-xs font-medium tracking-wide text-foreground/80">Simple mode</div>
              <div className="text-[11px] text-foreground/60">Hide study tools and navigation. Just the text.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={simpleMode}
              aria-labelledby="simple-mode-label"
              className="marker-switch"
              onClick={() => setSimpleMode(!simpleMode)}
            >
              <span className="marker-switch-knob" aria-hidden="true" />
            </button>
          </div>

          <ReaderAppearanceControls prefs={prefs} onChange={onChange} />

          {translationControls ? (
            <section className="space-y-2 border-t border-[color:var(--surface-border)] pt-3 border-[color:var(--surface-border)]">
              <div className="text-foreground/80">Translations</div>
              <div className="space-y-3">{translationControls}</div>
            </section>
          ) : null}

          <div className="border-t border-[color:var(--surface-border)] pt-3">
            <Link
              href="/account#reading"
              onClick={onClose}
              className="inline-flex min-h-9 items-center text-xs font-medium text-foreground/70 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]"
            >
              All settings
            </Link>
          </div>
        </div>
    </div>
  );
}
