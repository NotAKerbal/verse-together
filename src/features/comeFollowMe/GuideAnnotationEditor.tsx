"use client";

import type { GuideAnnotationPatch } from "../../../convex/annotationRules";
import AnnotationEditorForm from "@/features/annotations/AnnotationEditorForm";
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

/** Guide-specific persistence and selected quote for the shared annotation form. */
export default function GuideAnnotationEditor({ quote, current, onSave, onDelete, onClose }: Props) {
  const shown = quote.length > QUOTE_SHOWN ? `${quote.slice(0, QUOTE_SHOWN).trimEnd()}…` : quote;
  return (
    <AnnotationEditorForm
      title={`${current ? "Edit annotation" : "Annotate"} - Study guide`}
      placeholder="Write a note tied to this passage..."
      saveLabel={current ? "Save annotation" : "Add annotation"}
      savedVersion={current ? `${current.id}:${current.updatedAt}` : "none"}
      initialValue={{
        body: current?.body ?? "",
        highlightColor: current?.highlightColor ?? null,
        underlineColor: current?.underlineColor ?? null,
      }}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
    >
      <blockquote className="max-h-32 overflow-auto border-l-2 border-[color:var(--surface-border)] pl-3 font-serif text-sm text-foreground/80">
        {shown}
      </blockquote>
    </AnnotationEditorForm>
  );
}
