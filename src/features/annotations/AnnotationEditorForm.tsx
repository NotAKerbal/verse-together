"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { annotationProblem, type GuideAnnotationPatch, type VerseTextMark } from "../../../convex/annotationRules";
import MarkColorChoice from "./MarkColorChoice";

export type AnnotationDraft = Required<GuideAnnotationPatch>;

type Props = {
  title: string;
  placeholder: string;
  saveLabel: string;
  savedVersion: string | null;
  initialValue: AnnotationDraft;
  loaded?: boolean;
  /** Existing text-range marks also make an otherwise empty verse annotation valid. */
  textMarks?: readonly VerseTextMark[];
  onSave: (draft: AnnotationDraft) => Promise<unknown>;
  onDelete?: (() => Promise<unknown>) | null;
  onClose: () => void;
  children?: ReactNode;
};

/** Shared annotation dialog; each reader retains its own persistence and selection context. */
export default function AnnotationEditorForm({
  title, placeholder, saveLabel, savedVersion, initialValue, loaded = true, textMarks,
  onSave, onDelete, onClose, children,
}: Props) {
  const [draft, setDraft] = useState(initialValue);
  const [seededFrom, setSeededFrom] = useState(savedVersion);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Late query results and changes in another tab update an untouched form, never an edited draft.
  if (!dirty && seededFrom !== savedVersion) {
    setSeededFrom(savedVersion);
    setDraft(initialValue);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();
  const canSave = loaded && !busy && annotationProblem(draft.body, draft.highlightColor, draft.underlineColor !== null, textMarks) === null;

  function edit(patch: Partial<AnnotationDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setDirty(true);
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    if (busy) return;
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

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-lg border surface-card-strong p-4 text-foreground backdrop:bg-black/40"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={close} className="rounded-md border surface-button px-2 py-1 text-sm">Close</button>
        </div>
        {children}
        <textarea
          value={draft.body}
          onChange={(event) => edit({ body: event.target.value })}
          disabled={!loaded || busy}
          rows={4}
          placeholder={placeholder}
          aria-label="Note"
          className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
        />
        <MarkColorChoice
          kind="highlight"
          value={draft.highlightColor ?? "none"}
          disabled={!loaded || busy}
          onChange={(color) => edit({ highlightColor: color === "none" ? null : color })}
        />
        <MarkColorChoice
          kind="underline"
          value={draft.underlineColor ?? "none"}
          disabled={!loaded || busy}
          onChange={(color) => edit({ underlineColor: color === "none" ? null : color })}
        />
        {!loaded ? <p className="text-sm text-foreground/70">Loading your annotations…</p> : null}
        {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
        <div className="flex items-center justify-end gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={() => void run(onDelete, "Couldn't delete this annotation. Try again.")}
              disabled={busy}
              className="rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-700 dark:text-red-300 disabled:opacity-60"
            >Delete</button>
          ) : null}
          <button
            type="button"
            onClick={() => { if (canSave) void run(() => onSave(draft), "Couldn't save this annotation. Try again."); }}
            disabled={!canSave}
            className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-60"
          >{busy ? "Saving..." : saveLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
