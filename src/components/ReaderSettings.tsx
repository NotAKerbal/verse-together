"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { ReaderPreferences } from "@/lib/preferences";

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: ReaderPreferences;
  onChange: (next: ReaderPreferences) => void;
  translationControls?: ReactNode;
  anchorRef?: RefObject<HTMLElement | null>;
};

export default function ReaderSettings({ open, onClose, prefs, onChange, translationControls, anchorRef }: Props) {
  const [local, setLocal] = useState<ReaderPreferences>(prefs);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const MIN_SCALE = 0.85;
  const MAX_SCALE = 1.3;
  const pct = Math.max(0, Math.min(1, (local.fontScale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE))) * 100;

  function stopTouchPropagation(e: React.TouchEvent | React.PointerEvent | React.MouseEvent) {
    e.stopPropagation();
  }

  useEffect(() => {
    setLocal(prefs);
  }, [prefs]);

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
      className="absolute right-0 top-full z-40 mt-3 w-[min(92vw,24rem)] max-h-[min(70vh,32rem)] overflow-hidden rounded-lg border border-black/10 bg-background shadow-xl dark:border-white/15"
    >
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto p-3 text-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground/80">Footnotes</span>
            <button
              type="button"
              role="switch"
              aria-checked={local.showFootnotes}
              onClick={() => {
                const next = { ...local, showFootnotes: !local.showFootnotes };
                setLocal(next);
                onChange(next);
              }}
              onTouchStart={stopTouchPropagation}
              onTouchMove={stopTouchPropagation}
              onTouchEnd={stopTouchPropagation}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                local.showFootnotes ? "bg-foreground" : "bg-black/20 dark:bg-white/20"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
                  local.showFootnotes ? "translate-x-5" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium tracking-wide text-foreground/80">
              {`Text size - ${Math.round(local.fontScale * 100)}%`}
            </div>
            <div
              className="relative h-10 select-none"
              onTouchStart={stopTouchPropagation}
              onTouchMove={stopTouchPropagation}
              onTouchEnd={stopTouchPropagation}
              onPointerDown={stopTouchPropagation}
              onMouseDown={stopTouchPropagation}
            >
              <div className="absolute inset-0 rounded-md bg-black/10 dark:bg-white/15" />
              <div className="absolute left-0 top-0 h-full rounded-md bg-foreground" style={{ width: `${pct}%` }} />
              <input
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={0.01}
                value={local.fontScale}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const next = { ...local, fontScale: val };
                  setLocal(next);
                  onChange(next);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-foreground/80">Typeface</legend>
            <div
              className="inline-flex w-full overflow-hidden rounded-md border border-black/10 dark:border-white/15"
              onTouchStart={stopTouchPropagation}
              onTouchMove={stopTouchPropagation}
              onTouchEnd={stopTouchPropagation}
            >
              <button
                type="button"
                onClick={() => {
                  const next = { ...local, fontFamily: "serif" as const };
                  setLocal(next);
                  onChange(next);
                }}
                className={`flex-1 px-3 py-1.5 text-sm ${
                  local.fontFamily === "serif"
                    ? "bg-foreground text-background"
                    : "bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                Serif
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = { ...local, fontFamily: "sans" as const };
                  setLocal(next);
                  onChange(next);
                }}
                className={`flex-1 border-l border-black/10 px-3 py-1.5 text-sm dark:border-white/15 ${
                  local.fontFamily === "sans"
                    ? "bg-foreground text-background"
                    : "bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                Sans
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-foreground/80">Comparison view</legend>
            <div
              className="inline-flex w-full overflow-hidden rounded-md border border-black/10 dark:border-white/15"
              onTouchStart={stopTouchPropagation}
              onTouchMove={stopTouchPropagation}
              onTouchEnd={stopTouchPropagation}
            >
              <button
                type="button"
                onClick={() => {
                  const next = { ...local, comparisonView: "inline" as const };
                  setLocal(next);
                  onChange(next);
                }}
                className={`flex-1 px-3 py-1.5 text-sm ${
                  local.comparisonView === "inline"
                    ? "bg-foreground text-background"
                    : "bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                Inline
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = { ...local, comparisonView: "sideBySide" as const };
                  setLocal(next);
                  onChange(next);
                }}
                className={`flex-1 border-l border-black/10 px-3 py-1.5 text-sm dark:border-white/15 ${
                  local.comparisonView === "sideBySide"
                    ? "bg-foreground text-background"
                    : "bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                Side by side
              </button>
            </div>
          </fieldset>

          {translationControls ? (
            <section className="space-y-2 border-t border-black/10 pt-3 dark:border-white/15">
              <div className="text-foreground/80">Translations</div>
              <div className="space-y-3">{translationControls}</div>
            </section>
          ) : null}
        </div>
    </div>
  );
}
