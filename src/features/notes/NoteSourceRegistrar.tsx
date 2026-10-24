"use client";

import { useEffect } from "react";
import { useInsightBuilder, type RegisteredNoteSource } from "@/features/insights/InsightBuilderProvider";

/**
 * Tells the notebook what this page is, so a note started here links back to it. Renders nothing.
 * The fields are listed individually so a parent re-rendering with an equal source doesn't re-register.
 */
export default function NoteSourceRegistrar({ kind, label, href, volume, book, chapter }: RegisteredNoteSource) {
  const { registerNoteSource } = useInsightBuilder();
  useEffect(() => {
    const source: RegisteredNoteSource = { kind, label };
    if (href) source.href = href;
    if (volume) source.volume = volume;
    if (book) source.book = book;
    if (chapter !== undefined) source.chapter = chapter;
    return registerNoteSource(source);
  }, [registerNoteSource, kind, label, href, volume, book, chapter]);
  return null;
}
