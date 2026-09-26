"use client";

import { faNoteSticky, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type VerseInsightRef = {
  draftId: string;
  draftTitle: string;
  verseStart: number;
  verseEnd: number;
  status: "draft" | "published";
};

/**
 * Expand each scripture-block reference across every verse it covers, so a block for
 * verses 21-23 marks 21, 22 and 23. A draft that cites the same verse twice is listed once.
 */
export function groupVerseInsightRefsByVerse(refs: VerseInsightRef[]): Map<number, VerseInsightRef[]> {
  const grouped = new Map<number, VerseInsightRef[]>();
  for (const ref of refs) {
    const start = Math.min(ref.verseStart, ref.verseEnd);
    const end = Math.max(ref.verseStart, ref.verseEnd);
    for (let verse = start; verse <= end; verse += 1) {
      const existing = grouped.get(verse) ?? [];
      if (existing.some((item) => item.draftId === ref.draftId)) continue;
      grouped.set(verse, [...existing, ref]);
    }
  }
  return grouped;
}

const POPOVER_WIDTH = 288;
const VIEWPORT_MARGIN = 12;

function formatRange(ref: VerseInsightRef) {
  return ref.verseStart === ref.verseEnd ? `v. ${ref.verseStart}` : `vv. ${ref.verseStart}-${ref.verseEnd}`;
}

export default function VerseInsightMarker({
  verse,
  insights,
  onOpen,
}: {
  verse: number;
  insights: VerseInsightRef[];
  onOpen: (draftId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const titleId = useId();
  const count = insights.length;

  // Anchor the picker to the marker; keep it on screen and follow scroll/resize.
  useLayoutEffect(() => {
    if (!pickerOpen) return;
    const place = () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
      const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.right - width, window.innerWidth - width - VIEWPORT_MARGIN));
      const panelHeight = panelRef.current?.offsetHeight ?? 0;
      const fitsBelow = anchor.bottom + 8 + panelHeight <= window.innerHeight - VIEWPORT_MARGIN;
      const top = fitsBelow ? anchor.bottom + 8 : Math.max(VIEWPORT_MARGIN, anchor.top - 8 - panelHeight);
      setPanelStyle({ position: "fixed", top, left, width, visibility: "visible" });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [pickerOpen]);

  // Focus lands inside the dialog on open; outside pointer presses dismiss it.
  useEffect(() => {
    if (!pickerOpen) return;
    const first = panelRef.current?.querySelector<HTMLElement>("[data-insight-option]");
    first?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [pickerOpen]);

  function closePicker(restoreFocus: boolean) {
    setPickerOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function choose(draftId: string) {
    setPickerOpen(false);
    onOpen(draftId);
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePicker(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const options = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-insight-option]") ?? []);
    if (options.length === 0) return;
    event.preventDefault();
    const index = options.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = index === -1 ? 0 : (index + delta + options.length) % options.length;
    options[next]?.focus();
  }

  if (count === 0) return null;

  const label =
    count === 1
      ? `Open your insight "${insights[0].draftTitle}" for verse ${verse}`
      : `Choose one of ${count} of your insights for verse ${verse}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup={count > 1 ? "dialog" : undefined}
        aria-expanded={count > 1 ? pickerOpen : undefined}
        title={count === 1 ? "In one of your insights" : `In ${count} of your insights`}
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] ${
          pickerOpen
            ? "bg-[color:var(--surface-button-active)] text-[color:var(--surface-button-active-text)] shadow-[var(--surface-shadow-soft)]"
            : "bg-[color:var(--accent-sky-soft)] text-foreground hover:shadow-[var(--surface-shadow-soft)]"
        }`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (count === 1) {
            choose(insights[0].draftId);
            return;
          }
          setPickerOpen((prev) => !prev);
        }}
      >
        <FontAwesomeIcon icon={faNoteSticky} className="h-3.5 w-3.5" />
      </button>
      {pickerOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-labelledby={titleId}
              style={panelStyle}
              onKeyDown={onPanelKeyDown}
              onPointerDown={(event) => event.stopPropagation()}
              className="z-50 overflow-hidden rounded-[1rem] border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] font-sans shadow-[var(--surface-shadow)]"
            >
              <header className="flex items-center justify-between gap-2 border-b-2 border-[color:var(--surface-border)] bg-[color:var(--accent-sky-soft)] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] text-foreground">
                    <FontAwesomeIcon icon={faNoteSticky} className="h-3 w-3" />
                  </span>
                  <div className="min-w-0">
                    <div id={titleId} className="truncate font-display text-sm font-extrabold tracking-[-0.02em] text-foreground">
                      Your insights
                    </div>
                    <div className="text-[11px] font-semibold text-foreground/65">Verse {verse}</div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] text-foreground hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
                  onClick={() => closePicker(true)}
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                </button>
              </header>
              <ul className="max-h-72 overflow-y-auto p-2">
                {insights.map((insight) => (
                  <li key={insight.draftId}>
                    <button
                      type="button"
                      data-insight-option
                      className="flex w-full items-center gap-2 rounded-[0.75rem] border-2 border-transparent px-2 py-1.5 text-left hover:border-[color:var(--surface-border)] hover:bg-[color:var(--surface-button-hover)] focus-visible:border-[color:var(--surface-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]"
                      onClick={() => choose(insight.draftId)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {insight.draftTitle.trim() || "Untitled insight"}
                        </span>
                        <span className="block text-[11px] text-foreground/60">{formatRange(insight)}</span>
                      </span>
                      <span
                        className="shrink-0 rounded-full border-2 border-[color:var(--surface-border)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-foreground"
                        style={{ background: insight.status === "published" ? "var(--accent-mint)" : "var(--accent-note)" }}
                      >
                        {insight.status === "published" ? "Published" : "Draft"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
