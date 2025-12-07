"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  src: string;
  externalHref?: string;
};

export default function IframeDrawer({ open, onClose, title, src, externalHref }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="absolute left-3 right-3 sm:left-4 sm:right-4 bottom-0 rounded-t-2xl bg-background shadow-2xl border-t border-black/10 dark:border-white/15 p-3 sm:p-4 space-y-3 max-h-[80vh] overflow-hidden">
        <div className="h-1 w-10 bg-foreground/20 rounded-full mx-auto mb-1" />
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold truncate" title={title}>{title}</h3>
          <div className="flex items-center gap-2">
            {externalHref ? (
              <a
                href={externalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 text-xs rounded-md border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
                title="Open in new tab"
                aria-label="Open in new tab"
              >
                ↗
              </a>
            ) : null}
            <button onClick={onClose} className="px-3 py-1 text-sm rounded-md border border-black/10 dark:border-white/15">Close</button>
          </div>
        </div>
        <div className="rounded-md overflow-hidden border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5" style={{ height: "65vh" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <iframe
            title={title}
            src={src}
            className="w-full h-full bg-background"
            referrerPolicy="no-referrer"
            sandbox="allow-same-origin allow-scripts"
          />
        </div>
      </div>
    </div>
  );
}


