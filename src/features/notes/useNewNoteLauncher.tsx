"use client";

import { useEffect, useRef, useState } from "react";

const CREATE_FAILED = "A new note couldn’t be started. Check your connection and try again.";

/**
 * Below lg, the reader's Log button starts a fresh note for the chapter and opens the Log sheet on it, as the desktop
 * panel's New note does. `launch` creates the note once per deliberate tap (repeat taps while it is pending are
 * ignored), then calls `open` only if the same chapter (`scope`) is still mounted, so a slow create never opens a
 * sheet over another page. A failed create leaves every existing note alone and keeps the error until retried or
 * dismissed.
 */
export function useNewNoteLauncher({
  scope,
  create,
  open,
}: {
  scope: string;
  create: () => Promise<string | null>;
  open: () => void;
}) {
  const [pending, setPending] = useState(false);
  // Kept with its chapter, so a failure is not shown over a different one.
  const [error, setError] = useState<{ message: string; scope: string } | null>(null);
  const pendingRef = useRef(false);
  const scopeRef = useRef(scope);
  const mountedRef = useRef(false);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function launch() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const startedFor = scope;
    setPending(true);
    setError(null);
    // A generic message: caught errors (Convex's included) can carry server internals.
    let failure: string | null = null;
    try {
      if (!(await create())) failure = CREATE_FAILED;
    } catch {
      failure = CREATE_FAILED;
    } finally {
      pendingRef.current = false;
    }
    // Left the chapter (or the header unmounted) meanwhile: the note stays in All notes, but nothing opens here.
    if (!mountedRef.current) return;
    setPending(false);
    if (scopeRef.current !== startedFor) return;
    if (failure) setError({ message: failure, scope: startedFor });
    else open();
  }

  return { pending, error: error?.scope === scope ? error.message : null, launch, dismiss: () => setError(null) };
}

/** The Log button's failed-create message, with a retry and a way into Log and existing notes without a new note. */
export function NewNoteLaunchError({
  message,
  onRetry,
  onOpenLog,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onOpenLog: () => void;
  onDismiss: () => void;
}) {
  const buttonClass =
    "inline-flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-bold transition-colors hover:bg-[color:var(--surface-button-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)]";
  return (
    <div
      role="alert"
      className="simple-hide panel-card fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 mx-auto max-w-[40rem] rounded-[1rem] p-3 font-sans lg:hidden"
    >
      <p className="px-1 text-sm font-semibold wrap-anywhere text-[color:var(--accent-rubric)]">
        {message} Your other notes are safe.
      </p>
      <div className="mt-1 flex flex-wrap justify-end gap-1">
        <button type="button" onClick={onDismiss} className={buttonClass}>
          Dismiss
        </button>
        <button type="button" onClick={onOpenLog} className={buttonClass}>
          Open Log
        </button>
        <button type="button" onClick={onRetry} className={buttonClass}>
          Try again
        </button>
      </div>
    </div>
  );
}
