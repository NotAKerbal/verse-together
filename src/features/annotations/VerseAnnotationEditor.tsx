"use client";

import { useAuth } from "@/lib/auth";
import { deviceStudy } from "../notes/deviceStudy";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import AnnotationEditorForm, { type AnnotationDraft } from "./AnnotationEditorForm";
import {
  annotationChapter, annotationSummary, highlightOf, underlineColorOf,
  type AnnotationVerse, type VerseAnnotation,
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
  onClose: () => void;
};

/** Verse-specific persistence and saved notes for the shared annotation form. */
export default function VerseAnnotationEditor({ target, label, rows, loaded, onClose }: Props) {
  const { user } = useAuth();
  const saveAnnotation = useMutation(api.annotations.upsertVerseAnnotation);
  const removeAnnotation = useMutation(api.annotations.deleteVerseAnnotation);
  const mine = rows.find((row) => row.is_mine) ?? null;
  const highlightColor = highlightOf(mine);
  const underlineColor = underlineColorOf(mine);

  async function onSave(draft: AnnotationDraft) {
    const marks = {
      highlightColor: draft.highlightColor ?? undefined,
      underlineColor: draft.underlineColor ?? undefined,
    };
    if (!user) deviceStudy.saveAnnotation(target, draft.body, marks);
    else await saveAnnotation({
      ...annotationChapter(target.volume, target.book, target.chapter),
      verse: target.verse,
      body: draft.body,
      underline: draft.underlineColor !== null,
      ...marks,
    });
  }

  async function onDelete() {
    if (!mine) return;
    // The query returns row ids as plain strings; they are verseAnnotations ids.
    if (!user) deviceStudy.remove("annotations", mine.id);
    else await removeAnnotation({ annotationId: mine.id as Id<"verseAnnotations"> });
  }

  return (
    <AnnotationEditorForm
      title={`Add annotation - ${label}`}
      placeholder="Write a note tied to this verse..."
      saveLabel="Add annotation"
      savedVersion={loaded ? (mine ? `${mine.id}:${mine.updated_at}` : "none") : null}
      initialValue={{
        body: mine?.body ?? "",
        highlightColor: highlightColor === "none" ? null : highlightColor,
        underlineColor: underlineColor === "none" ? null : underlineColor,
      }}
      loaded={loaded}
      textMarks={mine?.text_marks}
      onSave={onSave}
      onDelete={mine ? onDelete : null}
      onClose={onClose}
    >
      {rows.length ? (
        <div className="max-h-40 overflow-auto rounded-md border surface-card-soft p-2 space-y-1.5 text-xs">
          {rows.map((row) => (
            <div key={row.id} className="rounded border surface-card px-2 py-1.5">
              <div className="text-[11px] text-foreground/60">{row.is_mine ? "You" : "Saved note"}</div>
              <div className="mt-0.5 whitespace-pre-wrap">
                {row.body || <span className="text-foreground/60">{annotationSummary(row)}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </AnnotationEditorForm>
  );
}
