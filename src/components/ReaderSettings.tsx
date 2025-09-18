"use client";

import { useEffect, useState } from "react";
import type { ReaderPreferences } from "@/lib/preferences";

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: ReaderPreferences;
  onChange: (next: ReaderPreferences) => void;
};

export default function ReaderSettings({ open, onClose, prefs, onChange }: Props) {
  const [local, setLocal] = useState<ReaderPreferences>(prefs);
  const MIN_SCALE = 0.85;
  const MAX_SCALE = 1.3;
  const pct = Math.max(0, Math.min(1, (local.fontScale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE))) * 100;

  function stopTouchPropagation(e: React.TouchEvent | React.PointerEvent | React.MouseEvent) {
    e.stopPropagation();
  }

  useEffect(() => {
    setLocal(prefs);
  }, [prefs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 w-[min(92vw,22rem)] rounded-lg border border-black/10 dark:border-white/15 bg-background shadow-xl">
        <header className="px-3 py-2 border-b border-black/10 dark:border-white/15 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Reader settings</h3>
          <button onClick={onClose} className="text-sm text-foreground/70 hover:text-foreground">✕</button>
        </header>
        <div className="p-3 space-y-3 text-sm">
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
              {`Text size · ${Math.round(local.fontScale * 100)}%`}
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
              <div
                className="absolute left-0 top-0 h-full rounded-md bg-foreground"
                style={{ width: `${pct}%` }}
              />
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
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
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
                className={`flex-1 px-3 py-1.5 text-sm border-l border-black/10 dark:border-white/15 ${
                  local.fontFamily === "sans"
                    ? "bg-foreground text-background"
                    : "bg-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                Sans
              </button>
            </div>
          </fieldset>
        </div>
        <footer className="px-3 py-2 border-t border-black/10 dark:border-white/15 text-right">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-black/10 dark:border-white/15">Close</button>
        </footer>
      </div>
    </div>
  );
}


