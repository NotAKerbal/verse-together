"use client";

import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { SourceStatus } from "@/lib/exploreSources";

// Explore's sections: softly tinted cards that are the only container layer. Each opens to plain result rows, and
// each row to its full content. The panel owns which section and row are open (see nextExploreOpen).

export type ExploreDisclosure = {
  open: boolean;
  openRow: string | null;
  onToggle: () => void;
  onToggleRow: (row: string) => void;
};

type Rows = { openRow: string | null; onToggleRow: (row: string) => void };
const RowsContext = createContext<Rows>({ openRow: null, onToggleRow: () => {} });

function Chevron({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-[color:var(--explore-accent)] transition-transform duration-200 motion-reduce:transition-none ${className}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function HeaderStatus({ status, count }: { status: SourceStatus; count: { value: number; unit: string } | null }) {
  if (count) {
    return (
      <span className="rounded-full bg-[color:var(--explore-pill)] px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-[color:var(--explore-accent)] tabular-nums">
        {count.value}
        <span className="@max-xs:sr-only"> {count.unit}</span>
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-[color:var(--foreground-muted)]">
        <span aria-hidden="true" className="size-3 rounded-full border-2 border-[color:var(--explore-edge)] border-t-[color:var(--explore-accent)] motion-safe:animate-spin" />
        Loading
      </span>
    );
  }
  if (status === "error") {
    return <span className="text-xs font-semibold whitespace-nowrap text-[color:var(--accent-rubric)]">Didn’t load</span>;
  }
  return <span />;
}

/** One of Explore's sections: a header that opens it, and its rows, rendered only while it is open. */
export function ExploreSection({ tone, icon, title, summary, status, count, disclosure, children }: {
  tone: "sage" | "blue" | "clay";
  icon: ReactNode;
  title: string;
  summary: string;
  status: SourceStatus;
  /** What it found, once it has; otherwise the header shows that it is loading or failed. */
  count: { value: number; unit: string } | null;
  disclosure: ExploreDisclosure;
  children: ReactNode;
}) {
  const { open, openRow, onToggle, onToggleRow } = disclosure;
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes the open result, then the section, leaving focus on the control that reopens it.
  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    const row = event.currentTarget.querySelector<HTMLButtonElement>('[data-explore-row][aria-expanded="true"]');
    if (openRow && row) {
      onToggleRow(openRow);
      row.focus();
    } else {
      onToggle();
      buttonRef.current?.focus();
    }
  }

  return (
    <li className="explore-card" data-tone={tone} data-open={open || undefined} onKeyDown={onKeyDown}>
      <h4>
        <button
          ref={buttonRef}
          id={`${id}-button`}
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className="grid min-h-16 w-full grid-cols-[2.25rem_minmax(0,1fr)_auto_1.125rem] items-center gap-3 rounded-[13px] px-3.5 py-3 text-left transition-colors hover:bg-[color:var(--explore-tint-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--foreground)] motion-reduce:transition-none @max-xs:grid-cols-[2rem_minmax(0,1fr)_auto_1.125rem] @max-xs:gap-2.5 @max-xs:px-3"
        >
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-[color:var(--explore-accent-soft)] text-[color:var(--explore-accent)] @max-xs:size-8">
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block font-serif text-lg leading-tight">{title}</span>
            <span className="mt-0.5 block break-words text-xs leading-snug text-[color:var(--foreground-muted)]">{summary}</span>
          </span>
          <HeaderStatus status={status} count={count} />
          <Chevron className={open ? "rotate-180" : ""} />
        </button>
      </h4>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-button`} hidden={!open} className="explore-reveal px-2 pb-2">
        {open ? <RowsContext.Provider value={{ openRow, onToggleRow }}>{children}</RowsContext.Provider> : null}
      </div>
    </li>
  );
}

/** A header count, as in "2 sources". */
export const plural = (count: number, one: string, many: string) => ({ value: count, unit: count === 1 ? one : many });

/** The two-letter mark of a section with no picture of its own. */
export function GlyphText({ children }: { children: string }) {
  return <span className="font-serif text-[0.9375rem] leading-none font-semibold tracking-tight">{children}</span>;
}

/** A section's loading or retry message, set in from the card's edge like its rows. */
export function ExploreNotice({ children }: { children: ReactNode }) {
  return <div className="px-2.5 py-2">{children}</div>;
}

export function ExploreRows({ children }: { children: ReactNode }) {
  return <ul className="m-0 list-none p-0">{children}</ul>;
}

/** A result's title row; opening it shows the result in full and closes any other open result in the section. */
export function ExploreRow({ id, label, title, children }: { id: string; label: ReactNode; title: ReactNode; children: ReactNode }) {
  const { openRow, onToggleRow } = useContext(RowsContext);
  const open = openRow === id;
  const baseId = useId();

  return (
    <li>
      <button
        id={`${baseId}-button`}
        type="button"
        data-explore-row=""
        aria-expanded={open}
        aria-controls={`${baseId}-detail`}
        onClick={() => onToggleRow(id)}
        className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_1rem] items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--explore-row-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--foreground)] motion-reduce:transition-none"
      >
        <span className="min-w-0">
          <span className="block text-xs leading-snug text-[color:var(--foreground-muted)]">{label}</span>
          <span className={`mt-px block break-words font-serif text-base leading-snug ${open ? "text-[color:var(--explore-accent)]" : ""}`}>{title}</span>
        </span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-[color:var(--explore-accent)] transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <div id={`${baseId}-detail`} role="region" aria-labelledby={`${baseId}-button`} hidden={!open} className="explore-reveal px-2.5 pt-0.5 pb-3 text-sm leading-6">
        {open ? children : null}
      </div>
    </li>
  );
}
