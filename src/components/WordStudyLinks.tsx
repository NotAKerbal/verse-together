import type { ReactNode } from "react";

// Shared pieces of the Explore sources: external links, and the loading and retry states each source shows.

export const linkFocus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-rubric)]";
export const eyebrow = "text-[0.7rem] font-medium uppercase tracking-wide text-[color:var(--foreground-muted)]";
export const secondaryLink = `inline-flex min-h-8 items-center gap-1 rounded text-xs text-[color:var(--foreground-muted)] underline-offset-2 hover:underline ${linkFocus}`;
export const textLink = `rounded text-[color:var(--accent-rubric)] underline decoration-[color:var(--surface-border)] underline-offset-2 hover:decoration-current ${linkFocus}`;
export const quietButton = `surface-button inline-flex min-h-9 items-center rounded-full border px-3 text-xs ${linkFocus}`;

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline shrink-0 opacity-70">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function ExternalLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${className} ${linkFocus}`}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function LoadingLines({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-2">
      <p className="flex items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
        <span aria-hidden="true" className="size-3 rounded-full border-2 border-[color:var(--surface-border)] border-t-[color:var(--accent-rubric)] motion-safe:animate-spin" />
        {label}
      </p>
      <div aria-hidden="true" className="space-y-1.5 motion-safe:animate-pulse">
        <div className="h-2.5 w-full rounded bg-[color:var(--surface-card-soft)]" />
        <div className="h-2.5 w-4/5 rounded bg-[color:var(--surface-card-soft)]" />
      </div>
    </div>
  );
}

export function LoadError({ message, onRetry, children }: { message: string; onRetry: () => void; children?: ReactNode }) {
  return (
    <div role="status" className="space-y-2">
      <p className="text-xs leading-5 text-[color:var(--foreground-muted)]">{message}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={onRetry} className={quietButton}>Try again</button>
        {children}
      </div>
    </div>
  );
}
