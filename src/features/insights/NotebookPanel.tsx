"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useInsightBuilder } from "./InsightBuilderProvider";
import ChapterLogView from "@/features/notes/ChapterLogView";
import NotesSheet from "@/features/notes/NotesSheet";
import NotesSidebar, { type NotesCompanion } from "@/features/notes/NotesSidebar";
import { useBelowLg } from "@/features/notes/useBelowLg";

export default function NotebookPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    canUseInsights, isMobileOpen, dismissMobile,
    isPanelOpen, togglePanel, closeBuilder, activeDraftId, activeNote, drafts, isLoading, switchDraft, createDraft,
    panelView, setPanelView, isSheetOpen, setSheetOpen, readerChapter,
  } = useInsightBuilder();
  const belowLg = useBelowLg();
  const onNotesPage = pathname === "/notes" || pathname.startsWith("/notes/");

  // Reader actions ask for the notebook with isMobileOpen (the provider already made the note active). Below lg, a
  // chapter page opens its Log sheet scrolled to Notes, keeping reading, logging and the note together; elsewhere the
  // note opens full-screen on /notes. Only the phone flag is cleared, so the desktop panel's remembered state is
  // untouched.
  useEffect(() => {
    if (!isMobileOpen || belowLg === null) return;
    dismissMobile();
    if (!belowLg || !canUseInsights || onNotesPage) return;
    if (readerChapter) setSheetOpen(true);
    else router.push("/notes");
  }, [isMobileOpen, belowLg, canUseInsights, onNotesPage, readerChapter, dismissMobile, setSheetOpen, router]);

  // The phone Log sheet belongs to a chapter page; leaving it, or widening past lg, closes it.
  useEffect(() => {
    if (isSheetOpen && (!readerChapter || belowLg === false)) setSheetOpen(false);
  }, [isSheetOpen, readerChapter, belowLg, setSheetOpen]);

  // On a chapter page the panel holds Log beside Notes, and the reader's Log button opens it.
  const companion = useMemo<NotesCompanion | undefined>(
    () =>
      readerChapter
        ? { view: panelView, onViewChange: setPanelView, log: <ChapterLogView chapter={readerChapter} /> }
        : undefined,
    [readerChapter, panelView, setPanelView]
  );

  if (!canUseInsights || onNotesPage || belowLg === null) return null;
  const notesProps = {
    activeNoteId: activeDraftId,
    activeNote,
    notes: drafts,
    isLoading,
    onSelect: switchDraft,
    onCreate: createDraft,
  };
  if (belowLg) {
    // Reader note actions leave panelView on "notes"; the Log button sets "log".
    return readerChapter && isSheetOpen ? (
      <NotesSheet
        {...notesProps}
        log={<ChapterLogView chapter={readerChapter} layout="flow" />}
        revealNotes={panelView === "notes"}
        onClose={() => setSheetOpen(false)}
      />
    ) : null;
  }
  return (
    <NotesSidebar
      {...notesProps}
      isOpen={isPanelOpen}
      onToggle={togglePanel}
      onCollapse={closeBuilder}
      companion={companion}
    />
  );
}
