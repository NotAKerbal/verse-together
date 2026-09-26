"use client";

import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  controls: ReactNode;
};

export default function TranslationSidebarPanel({ open, onClose, controls }: Props) {
  if (!open) return null;

  return (
    <div className="rounded-lg border border-[color:var(--surface-border)] bg-background/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Translations</h3>
        <button onClick={onClose} className="px-2.5 py-1 text-sm rounded-md border border-[color:var(--surface-border)]">
          Close
        </button>
      </div>
      {controls}
    </div>
  );
}
