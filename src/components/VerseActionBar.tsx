"use client";

import type { MouseEvent } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { positionSelectionPopover } from "@/lib/selectionPopover";

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
  hasSelection: boolean;
  hasActiveInsight: boolean;
  selectionReference: string;
  selectedText: string;
  selectedVerseCount: number;
  selectedWord?: string;
  showInsightAction?: boolean;
  showExplore?: boolean;
  showTranslations?: boolean;
  actionsEnabled?: boolean;
  onClear: () => void;
  onInsight: () => void;
  onNewInsight: () => void;
  onAnnotation: () => void;
  onResources: () => void;
  onExplore?: () => void;
  onTranslations?: () => void;
  shareHref?: string | null;
  targetLabel?: string;
};

const ICON_PATHS = {
  add: ["M12 5v14", "M5 12h14"],
  note: ["M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "m16 3 5 5-9 9-5 1 1-5Z"],
  book: ["M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z", "M12 6v14"],
  spark: ["m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"],
  translate: ["M3 5h12", "M9 3v2c0 6-3 9-6 11", "M5 9c1 3 4 6 7 7", "m13 17 4-10 4 10", "M15 13h4"],
  focus: ["M8 3H5a2 2 0 0 0-2 2v3", "M16 3h3a2 2 0 0 1 2 2v3", "M21 16v3a2 2 0 0 1-2 2h-3", "M8 21H5a2 2 0 0 1-2-2v-3", "M8 9h8", "M8 13h5"],
  copy: ["M9 9h11v12H9Z", "M5 16H3V3h12v2"],
  check: ["m5 12 4 4L19 6"],
  close: ["m6 6 12 12", "M18 6 6 18"],
} as const;

function ActionIcon({ kind }: { kind: keyof typeof ICON_PATHS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[kind].map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

function preserveSelection(event: MouseEvent<HTMLElement>) {
  // Leave auxiliary clicks and the browser's link menu available.
  if (event.button === 0) event.preventDefault();
}

function CopySelection({ text }: { text: string }) {
  const [notice, setNotice] = useState<"idle" | "copied" | "failed">("idle");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("copied");
    } catch {
      setNotice("failed");
    }
  }

  return (
    <button type="button" className="selection-copy" onMouseDown={preserveSelection} onClick={() => void copyText()} data-notice={notice}>
      <ActionIcon kind={notice === "copied" ? "check" : "copy"} />
      <span aria-live="polite">{notice === "copied" ? "Copied" : notice === "failed" ? "Couldn't copy · retry" : "Copy text"}</span>
    </button>
  );
}

function ActionLabel({ icon, title, description }: {
  icon: keyof typeof ICON_PATHS;
  title: string;
  description: string;
}) {
  return (
    <>
      <span className="selection-action-icon"><ActionIcon kind={icon} /></span>
      <span className="selection-action-label">
        <span className="selection-action-title">{title}</span>
        <span className="selection-action-description">{description}</span>
      </span>
    </>
  );
}

export default function VerseActionBar({
  visible, anchorRect, hasSelection, hasActiveInsight,
  selectionReference, selectedText, selectedVerseCount, selectedWord,
  showInsightAction = true, showExplore = false, showTranslations = false,
  actionsEnabled = true, onClear, onInsight, onNewInsight, onAnnotation,
  onResources, onExplore, onTranslations, shareHref, targetLabel = "Note",
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const wordCount = selectedText.trim().split(/\s+/).filter(Boolean).length;
  const selectionLabel = selectedWord ? "Word selected" : `${selectedVerseCount} ${selectedVerseCount === 1 ? "verse" : "verses"} selected`;

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!visible || !hasSelection || !anchorRect || !popover) return;

    function updatePosition() {
      if (!popover || !anchorRect) return;
      const position = positionSelectionPopover(anchorRect, popover.getBoundingClientRect(), {
        width: window.innerWidth, height: window.innerHeight,
      });
      popover.style.top = `${position.top}px`;
      popover.style.left = `${position.left}px`;
      popover.style.setProperty("--selection-pointer-x", `${position.pointerLeft}px`);
      popover.dataset.placement = position.placement;
      popover.dataset.overlap = String(position.overlapsSelection);
      popover.dataset.ready = "true";
    }

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(popover);
    return () => observer.disconnect();
  }, [visible, hasSelection, anchorRect]);

  if (!visible || !hasSelection || !anchorRect) return null;

  return (
    <div ref={popoverRef} data-selection-popover="true" className="selection-popover" role="dialog" aria-label="Selection actions" aria-describedby={headingId}>
      <div className="selection-card">
        <header className="selection-card-header">
          <div className="min-w-0">
            <p className="selection-eyebrow">{selectionLabel}</p>
            <h2 id={headingId} className="selection-reference">{selectionReference}</h2>
          </div>
          <button type="button" className="selection-dismiss" aria-label="Clear selection" title="Clear selection (Esc)" onMouseDown={preserveSelection} onClick={onClear}>
            <ActionIcon kind="close" />
          </button>
        </header>

        <div className="selection-actions">
          {showExplore && onExplore ? (
            <button type="button" className="selection-action" data-featured="true" onMouseDown={preserveSelection} onClick={onExplore}>
              <ActionLabel icon="spark" title={`Explore${selectedWord ? ` “${selectedWord}”` : ""}`} description="Meaning & context" />
            </button>
          ) : null}
          {showInsightAction ? (
            <button type="button" className="selection-action" onMouseDown={preserveSelection} onClick={hasActiveInsight ? onInsight : onNewInsight} disabled={!actionsEnabled}>
              <ActionLabel icon="add" title={hasActiveInsight ? `Add to ${targetLabel}` : `New ${targetLabel}`} description={actionsEnabled ? "Keep your thoughts" : "Sign in to save"} />
            </button>
          ) : null}
          <button type="button" className="selection-action" onMouseDown={preserveSelection} onClick={onAnnotation} disabled={!actionsEnabled}>
            <ActionLabel icon="note" title="Annotate" description={actionsEnabled ? "Mark what matters" : "Sign in to annotate"} />
          </button>
          <button type="button" className="selection-action" onMouseDown={preserveSelection} onClick={onResources}>
            <ActionLabel icon="book" title="Resources" description="Lessons & more" />
          </button>
          {showTranslations && onTranslations ? (
            <button type="button" className="selection-action" onMouseDown={preserveSelection} onClick={onTranslations}>
              <ActionLabel icon="translate" title="Translations" description="Compare the wording" />
            </button>
          ) : null}
          {shareHref ? (
            <a href={shareHref} className="selection-action" data-featured="true" aria-label="Focus scripture for the selected verses" onMouseDown={preserveSelection}>
              <ActionLabel icon="focus" title="Focus scripture" description="Read & share passage" />
            </a>
          ) : null}
        </div>

        <footer className="selection-card-footer">
          <CopySelection key={selectedText} text={selectedText} />
          <span className="selection-word-count">{wordCount} {wordCount === 1 ? "word" : "words"}<span className="selection-escape"> · <kbd>esc</kbd> to close</span></span>
        </footer>
      </div>
      <span className="selection-pointer" aria-hidden="true" />
    </div>
  );
}
