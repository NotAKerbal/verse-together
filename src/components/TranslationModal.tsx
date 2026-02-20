"use client";

import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  controls: ReactNode;
};

export default function TranslationModal({ open, onClose, controls }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="absolute left-3 right-3 sm:left-4 sm:right-4 bottom-0 rounded-t-2xl bg-background shadow-2xl border-t border-black/10 dark:border-white/15 p-4 space-y-3 max-h-[80vh] overflow-auto">
        <div className="h-1 w-10 bg-foreground/20 rounded-full mx-auto mb-1" />
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Translations</h3>
          <button onClick={onClose} className="px-3 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">
            Close
          </button>
        </div>
        {controls}
      </div>
    </div>
  );
}
