"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { annotationProblem } from "../../../convex/annotationRules";
import {
  ANNOTATION_HIGHLIGHT_OPTIONS,
  annotationChapter,
  highlightOf,
  type AnnotationHighlightColor,
  type AnnotationVerse,
  type VerseAnnotation,
} from "./verseAnnotations";

type Props = {
  /** The verse being annotated, in either reader's terms (annotationChapter canonicalizes it). */
  target: AnnotationVerse;
  /** Shown in the title, e.g. "Verse 4" or "Isaiah 53:4". */
  label: string;
  /** The viewer's annotations on this verse, as the chapter query returned them. */
  rows: VerseAnnotation[];
  /** False until the chapter's annotations have loaded: saving before then could overwrite a note unseen. */
  loaded: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onClose: () => void;
};

/**
 * Add, edit, or delete the viewer's private annotation on one verse: a note, a highlight, or both. A modal
 * <dialog>, so Escape closes it, focus stays inside, and focus returns to whatever opened it.
 */
export default function VerseAnnotationEditor({ target, label, rows, loaded, signedIn, onSignIn, onClose }: Props) {
  const saveAnnotation = useMutation(api.annotations.upsertVerseAnnotation);
  const removeAnnotation = useMutation(api.annotations.deleteVerseAnnotation);
  const mine = rows.find((row) => row.is_mine) ?? null;
  const [text, setText] = useState(mine?.body ?? "");
  const [color, setColor] = useState<AnnotationHighlightColor>(highlightOf(mine));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // The form shows the saved annotation as it is now: until the rows load it is disabled, and until the
  // reader edits it, it follows the saved values (they can arrive late, e.g. right after signing in), so a
  // save never overwrites a note the reader hasn't seen.
  const savedVersion = loaded ? (mine ? `${mine.id}:${mine.updated_at}` : "none") : null;
  const [seededFrom, setSeededFrom] = useState(savedVersion);
  const [dirty, setDirty] = useState(false);
  if (!dirty && seededFrom !== savedVersion) {
    setSeededFrom(savedVersion);
    setText(mine?.body ?? "");
    setColor(highlightOf(mine));
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();
  const highlightColor = color === "none" ? undefined : color;
  const canSave = loaded && !saving && annotationProblem(text, highlightColor) === null;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await saveAnnotation({
        ...annotationChapter(target.volume, target.book, target.chapter),
        verse: target.verse,
        body: text,
        highlightColor,
      });
      close();
    } catch {
      setError("Couldn't save this annotation. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!mine) return close();
    setSaving(true);
    setError(null);
    try {
      // The query returns row ids as plain strings; they are verseAnnotations ids.
      await removeAnnotation({ annotationId: mine.id as Id<"verseAnnotations"> });
      close();
    } catch {
      setError("Couldn't delete this annotation. Try again.");
    } finally {
      setSaving(false);
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
          <h2 id={titleId} className="text-lg font-semibold">
            Add annotation - {label}
          </h2>
          <button type="button" onClick={close} className="rounded-md border surface-button px-2 py-1 text-sm">
            Close
          </button>
        </div>
        {rows.length ? (
          <div className="max-h-40 overflow-auto rounded-md border surface-card-soft p-2 space-y-1.5 text-xs">
            {rows.map((row) => (
              <div key={row.id} className="rounded border surface-card px-2 py-1.5">
                <div className="text-[11px] text-foreground/60">{row.is_mine ? "You" : "Saved note"}</div>
                <div className="mt-0.5 whitespace-pre-wrap">
                  {row.body || <span className="text-foreground/60">Highlight only</span>}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!signedIn ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground/70">Sign in to add annotations.</p>
            <button type="button" onClick={onSignIn} className="rounded-md border surface-button px-3 py-2 text-sm">
              Sign in
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setDirty(true);
              }}
              disabled={!loaded}
              rows={4}
              placeholder="Write a note tied to this verse..."
              aria-label="Note"
              className="w-full rounded-md border surface-card-soft bg-transparent px-3 py-2 text-sm"
            />
            <div className="space-y-1">
              <div className="text-sm text-foreground/70">Highlight</div>
              <div className="flex flex-wrap items-center gap-2">
                {ANNOTATION_HIGHLIGHT_OPTIONS.map((option) => {
                  const active = color === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setColor(option.value);
                        setDirty(true);
                      }}
                      disabled={!loaded}
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
            {!loaded ? <p className="text-sm text-foreground/70">Loading your annotations…</p> : null}
            {error ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              {mine ? (
                <button
                  type="button"
                  onClick={() => {
                    void onDelete();
                  }}
                  disabled={saving}
                  className="rounded-md border border-red-500/40 px-3 py-2 text-sm text-red-700 dark:text-red-300 disabled:opacity-60"
                >
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void onSave();
                }}
                disabled={!canSave}
                className="rounded-md bg-foreground text-background px-3 py-2 text-sm disabled:opacity-60"
              >
                {saving ? "Saving..." : "Add annotation"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
