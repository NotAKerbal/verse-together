"use client";

import type { MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";

export type VerseActionAnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Props = {
  visible: boolean;
  anchorRect: VerseActionAnchorRect | null;
  referenceLabel: string | null;
  hasSelection: boolean;
  hasActiveInsight: boolean;
  showTranslations?: boolean;
  actionsEnabled?: boolean;
  onClear: () => void;
  onInsight: () => void;
  onNewInsight: () => void;
  onLoadInsights: () => void;
  onAnnotation: () => void;
  onCitations: () => void;
  onExplore: () => void;
  onTranslations?: () => void;
  targetLabel?: string;
};

type FloatingStyle = {
  top: number;
  left: number;
  placement: "top" | "bottom";
};

const VIEWPORT_MARGIN = 12;
const SAFE_TOP = 64;
const SAFE_BOTTOM = 20;
const POPOVER_GAP = 10;

function preserveSelection(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function ActionIcon({ kind }: { kind: "insight" | "folder" | "note" | "book" | "spark" | "translate" | "close" }) {
  const iconClassName = "h-3.5 w-3.5 shrink-0";

  if (kind === "insight") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18" />
        <path d="M3 12h18" />
      </svg>
    );
  }

  if (kind === "folder") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 7.5a2 2 0 0 1 2-2H10l2 2h6.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      </svg>
    );
  }

  if (kind === "note") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4.5h8l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V6A1.5 1.5 0 0 1 7.5 4.5Z" />
        <path d="M14 4.5v3h3" />
        <path d="M9 12h6" />
        <path d="M9 15.5h4.5" />
      </svg>
    );
  }

  if (kind === "book") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16.5H7.5A2.5 2.5 0 0 0 5 22Z" />
        <path d="M5 5.5V22" />
        <path d="M8.5 7.5h7" />
      </svg>
    );
  }

  if (kind === "spark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3 1.7 4.6L18 9.3l-4.3 1.7L12 15.7l-1.7-4.7L6 9.3l4.3-1.7Z" />
        <path d="m18.5 14 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" />
      </svg>
    );
  }

  if (kind === "translate") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h9" />
        <path d="M8.5 4v2c0 4.4-2.1 7.6-5.5 9.5" />
        <path d="M6.2 11.5c1.4 2.1 3.3 3.8 5.6 4.9" />
        <path d="M14 8h6" />
        <path d="m17 5-4 14" />
        <path d="m13.5 15.5 2.2-5.5 2.2 5.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClassName} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export default function VerseActionBar({
  visible,
  anchorRect,
  referenceLabel,
  hasSelection,
  hasActiveInsight,
  showTranslations = false,
  actionsEnabled = true,
  onClear,
  onInsight,
  onNewInsight,
  onLoadInsights,
  onAnnotation,
  onCitations,
  onExplore,
  onTranslations,
  targetLabel = "Note",
}: Props) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [floatingStyle, setFloatingStyle] = useState<FloatingStyle | null>(null);

  useLayoutEffect(() => {
    if (!visible || !hasSelection || !anchorRect || typeof window === "undefined") {
      setFloatingStyle(null);
      return;
    }

    const popover = popoverRef.current;
    if (!popover) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverRect = popover.getBoundingClientRect();
    const centeredLeft = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
    const maxLeft = viewportWidth - popoverRect.width - VIEWPORT_MARGIN;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, centeredLeft), Math.max(VIEWPORT_MARGIN, maxLeft));

    const aboveTop = anchorRect.top - popoverRect.height - POPOVER_GAP;
    const belowTop = anchorRect.bottom + POPOVER_GAP;
    const canFitAbove = aboveTop >= SAFE_TOP;
    const maxTop = viewportHeight - popoverRect.height - SAFE_BOTTOM;
    const top = canFitAbove
      ? aboveTop
      : Math.min(Math.max(SAFE_TOP, belowTop), Math.max(SAFE_TOP, maxTop));

    setFloatingStyle({
      top,
      left,
      placement: canFitAbove ? "top" : "bottom",
    });
  }, [visible, hasSelection, anchorRect, referenceLabel, hasActiveInsight, showTranslations]);

  if (!visible || !hasSelection || !anchorRect) return null;

  const baseActionClass =
    "inline-flex h-9 items-center gap-2 rounded-full border border-black/10 dark:border-white/15 bg-background/92 px-3 text-sm text-foreground shadow-sm transition hover:bg-black/[0.04] dark:hover:bg-white/[0.08] disabled:opacity-45 disabled:hover:bg-background/92";
  const primaryActionClass =
    "inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-3.5 text-sm font-medium text-background shadow-sm transition hover:opacity-90 disabled:opacity-45";

  return (
    <div
      ref={popoverRef}
      data-selection-popover="true"
      className={`fixed z-40 w-[min(calc(100vw-1.5rem),38rem)] transition duration-150 ease-out ${
        floatingStyle ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
      }`}
      style={{
        top: floatingStyle?.top ?? -9999,
        left: floatingStyle?.left ?? VIEWPORT_MARGIN,
      }}
      role="dialog"
      aria-label="Selection actions"
    >
      <div className="relative overflow-hidden rounded-[1.4rem] border border-black/10 bg-background/92 p-2 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/15">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 px-2 py-1">
            <div className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">
              Selection
            </div>
            <div className="truncate text-sm font-medium text-foreground/80">
              {referenceLabel ?? "Selected verses"}
            </div>
          </div>
          {hasActiveInsight ? (
            <button type="button" onMouseDown={preserveSelection} onClick={onInsight} disabled={!actionsEnabled} className={primaryActionClass}>
              <ActionIcon kind="insight" />
              <span>Add to {targetLabel}</span>
            </button>
          ) : (
            <button type="button" onMouseDown={preserveSelection} onClick={onNewInsight} disabled={!actionsEnabled} className={primaryActionClass}>
              <ActionIcon kind="insight" />
              <span>New {targetLabel}</span>
            </button>
          )}
          <button type="button" onMouseDown={preserveSelection} onClick={onLoadInsights} disabled={!actionsEnabled} className={baseActionClass}>
            <ActionIcon kind="folder" />
            <span>{targetLabel === "Lesson" ? "Open Lesson" : "Open Notes"}</span>
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onMouseDown={preserveSelection} onClick={onAnnotation} disabled={!actionsEnabled} className={baseActionClass}>
            <ActionIcon kind="note" />
            <span>Annotate</span>
          </button>
          <button type="button" onMouseDown={preserveSelection} onClick={onCitations} className={baseActionClass}>
            <ActionIcon kind="book" />
            <span>Citations</span>
          </button>
          <button type="button" onMouseDown={preserveSelection} onClick={onExplore} className={baseActionClass}>
            <ActionIcon kind="spark" />
            <span>Explore</span>
          </button>
          {showTranslations && onTranslations ? (
            <button type="button" onMouseDown={preserveSelection} onClick={onTranslations} className={baseActionClass}>
              <ActionIcon kind="translate" />
              <span>Translations</span>
            </button>
          ) : null}
          <button type="button" onMouseDown={preserveSelection} onClick={onClear} className={baseActionClass}>
            <ActionIcon kind="close" />
            <span>Dismiss</span>
          </button>
        </div>
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-black/10 bg-background/92 dark:border-white/15 ${
            floatingStyle?.placement === "top"
              ? "bottom-[-0.35rem] border-b border-r"
              : "top-[-0.35rem] border-l border-t"
          }`}
          style={{
            marginLeft: `${Math.max(-140, Math.min(140, anchorRect.left + anchorRect.width / 2 - ((floatingStyle?.left ?? 0) + 24)))}px`,
          }}
        />
      </div>
    </div>
  );
}
