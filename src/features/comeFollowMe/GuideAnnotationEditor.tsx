"use client";

import { useEffect, useId, useRef, useState } from "react";
import { annotationProblem, type GuideAnnotationPatch } from "../../../convex/annotationRules";
import { MarkColorChoice } from "@/features/annotations/VerseAnnotationEditor";
import type { AnnotationMarkColor } from "@/features/annotations/verseAnnotations";
import type { GuideHighlight } from "./guideAnchors";

const QUOTE_SHOWN = 280;

type Props = {
  /** The selected passage's text. */
  quote: string;
  /** The saved annotation on exactly this passage, or null for a new one. */
  current: GuideHighlight | null;
  /** Saves the note, highlight, and underline as shown (null: none). */
  onSave: (patch: Required<GuideAnnotationPatch>) => Promise<unknown>;
  /** Removes the saved annotation; null when there is none. */
  onDelete: (() => Promise<unknown>) | null;
  onClose: () => void;
};

/**
 * Add, edit, or delete the viewer's private annotation on a passage of study-guide prose: a note, a highlight,
 * an underline, or any mix of them, in the same palette and with the same choices as a verse's annotation
 * editor. A modal <dialog>: Escape closes it, focus stays inside, and focus returns to whatever opened it.
 */
export default function GuideAnnotationEditor({ quote, current, onSave, onDelete, onClose }: Props) {
  const [text, setText] = useState(current?.body ?? "");
  const [color, setColor] = useState<AnnotationMarkColor>(current?.highlightColor ?? "none");
  const [underlineColor, setUnderlineColor] = useState<AnnotationMarkColor>(current?.underlineColor ?? "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Until the reader edits it, the form follows the saved annotation (another tab, or a quick mark still
  // saving, can change it), so a save never overwrites a note the reader hasn't seen.
  const savedVersion = current ? `${current.id}:${current.updatedAt}` : "none";
  const [seededFrom, setSeededFrom] = useState(savedVersion);
  const [dirty, setDirty] = useState(false);
  if (!dirty && seededFrom !== savedVersion) {
    setSeededFrom(savedVersion);
    setText(current?.body ?? "");
    setColor(current?.highlightColor ?? "none");
    setUnderlineColor(current?.underlineColor ?? "none");
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();
  const highlightColor = color === "none" ? null : color;
  const underline = underlineColor === "none" ? null : underlineColor;
  const canSave = !busy && annotationProblem(text, highlightColor, underline !== null) === null;

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

  const shown = quote.length > QUOTE_SHOWN ? `${quote.slice(0, QUOTE_SHOWN).trimEnd()}…` : quote;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-lg border surface-card-strong p-4 text-foreground backdrop:bg-black/40"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {current ? "Edit annotation" : "Annotate"} - Study guide
          </h2>
          <button type="button" onClick={close} className="rounded-md border surface-button px-2 py-1 text-sm">
            Close
          </button>
        </div>
        <blockquote className="max-h-32 overflow-auto border-l-2 border-[color:var(--surface-border)] pl-3 font-serif text-sm text-foreground/80">
          {shown}
        </blockquote>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setDirty(true);
          }}
          rows={4}
          placeholder="Write a note tied to this passage..."
          aria-label="Note"
          className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
        />
        <MarkColorChoice
          kind="highlight"
          value={color}
          disabled={busy}
          onChange={(next) => {
            setColor(next);
            setDirty(true);
          }}
        />
        <MarkColorChoice
          kind="underline"
          value={underlineColor}
          disabled={busy}
          onChange={(next) => {
            setUnderlineColor(next);
            setDirty(true);
          }}
        />
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={() => {
                void run(onDelete, "Couldn't delete this annotation. Try again.");
              }}
              disabled={busy}
              className="rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-700 dark:text-red-300 disabled:opacity-60"
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void run(
                () => onSave({ body: text, highlightColor, underlineColor: underline }),
                "Couldn't save this annotation. Try again."
              );
            }}
            disabled={!canSave}
            className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-60"
          >
            {busy ? "Saving..." : current ? "Save annotation" : "Add annotation"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
