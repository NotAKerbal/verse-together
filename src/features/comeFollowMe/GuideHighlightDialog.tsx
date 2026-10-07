"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ANNOTATION_HIGHLIGHT_OPTIONS, type HighlightColor } from "@/features/annotations/verseAnnotations";

/** The five highlight colors of the shared palette (a guide highlight is removed, not set to "None"). */
const COLORS = ANNOTATION_HIGHLIGHT_OPTIONS.filter(
  (option): option is (typeof ANNOTATION_HIGHLIGHT_OPTIONS)[number] & { value: HighlightColor } => option.value !== "none"
);

const QUOTE_SHOWN = 280;

type Props = {
  /** The selected text, or null when the selection can't be highlighted (`problem` says why). */
  quote: string | null;
  problem: string | null;
  /** The highlight being edited, or null for a new one. */
  current: HighlightColor | null;
  status: "loading" | "ready" | "unavailable";
  /** Whether this browser can show guide highlights at all. */
  supported: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onSave: (color: HighlightColor) => Promise<unknown>;
  onRemove: (() => Promise<unknown>) | null;
  onClose: () => void;
};

/**
 * Highlight selected study-guide text in one of the shared palette's colors, or recolor or remove an existing
 * highlight. A modal <dialog>, like the verse annotation editor: Escape closes it and focus returns to the
 * opener.
 */
export default function GuideHighlightDialog({
  quote,
  problem,
  current,
  status,
  supported,
  signedIn,
  onSignIn,
  onSave,
  onRemove,
  onClose,
}: Props) {
  const [color, setColor] = useState<HighlightColor>(current ?? "yellow");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();
  const ready = status === "ready" && supported && !problem && quote != null;

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const shown = quote && quote.length > QUOTE_SHOWN ? `${quote.slice(0, QUOTE_SHOWN).trimEnd()}…` : quote;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border surface-card-strong p-4 text-foreground backdrop:bg-black/40"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {current ? "Edit highlight" : "Highlight"}
          </h2>
          <button type="button" onClick={close} className="rounded-md border surface-button px-2 py-1 text-sm">
            Close
          </button>
        </div>
        {shown ? (
          <blockquote className="max-h-32 overflow-auto border-l-2 border-[color:var(--surface-border)] pl-3 font-serif text-sm text-foreground/80">
            {shown}
          </blockquote>
        ) : null}
        {!supported ? (
          <p className="text-sm text-foreground/70">This browser can&apos;t show highlights in the guide yet. Try an up-to-date browser.</p>
        ) : problem ? (
          <p className="text-sm text-foreground/70">{problem}</p>
        ) : !signedIn ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground/70">Sign in to highlight the guide.</p>
            <button type="button" onClick={onSignIn} className="rounded-md border surface-button px-3 py-2 text-sm">
              Sign in
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="text-sm text-foreground/70">Color</div>
              <div className="flex flex-wrap items-center gap-2">
                {COLORS.map((option) => {
                  const active = color === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setColor(option.value)}
                      disabled={!ready || busy}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs disabled:opacity-60 ${
                        active ? "border-foreground bg-foreground text-background" : "surface-button"
                      }`}
                      aria-pressed={active}
                    >
                      <span className={`h-3 w-3 rounded-full ${option.swatchClass}`} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {status === "loading" ? <p className="text-sm text-foreground/70">Loading your highlights…</p> : null}
            {status === "unavailable" ? (
              <p className="text-sm text-foreground/70">Highlights aren&apos;t available right now. Try again later.</p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => {
                    void run(onRemove, "Couldn't remove the highlight. Try again.");
                  }}
                  disabled={busy || status !== "ready"}
                  className="rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-700 dark:text-red-300 disabled:opacity-60"
                >
                  Remove
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void run(() => onSave(color), "Couldn't save the highlight. Try again.");
                }}
                disabled={!ready || busy || (current != null && color === current)}
                className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-60"
              >
                {busy ? "Saving..." : "Save highlight"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
