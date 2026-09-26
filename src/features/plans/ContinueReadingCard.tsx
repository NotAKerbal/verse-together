"use client";

import Link from "next/link";
import { formatChapterLabel, getChapterDelineation, getChapterHref } from "./scriptureCatalog";
import { useLastPosition } from "./useReadingProgress";

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function ContinueReadingCard() {
  const position = useLastPosition();
  if (!position) return null;

  const label = formatChapterLabel(position);
  const delineation = getChapterDelineation(position.volume).toLowerCase();

  return (
    <div className="h-full max-w-full -rotate-1 px-2 pt-1">
      <Link
        href={getChapterHref(position)}
        className="sticky-note interactive-card group flex h-full max-w-full items-center gap-4 px-5 py-4 text-[color:var(--foreground)]"
        aria-label={`Continue reading ${label}`}
        data-tap
      >
        <div className="min-w-0">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.1em] text-[color:var(--foreground-muted)]">
            Continue reading
          </p>
          <p className="font-display truncate text-[1.35rem] font-extrabold leading-tight tracking-[-0.03em]">{label}</p>
          <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">
            Pick up the {delineation} you had open.
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--surface-border)] bg-[color:var(--surface-card)] transition-transform duration-150 group-hover:translate-x-0.5">
          <ArrowIcon />
        </span>
      </Link>
    </div>
  );
}
