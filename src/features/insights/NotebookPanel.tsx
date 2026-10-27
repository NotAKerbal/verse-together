"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useInsightBuilder } from "./InsightBuilderProvider";
import NotesSheet from "@/features/notes/NotesSheet";
import NotesSidebar, { NotesPanelContent, type NotesPanelFrame } from "@/features/notes/NotesSidebar";
import { useBelowLg } from "@/features/notes/useBelowLg";

export default function NotebookPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    canUseInsights, isMobileOpen, dismissMobile,
    isPanelOpen, togglePanel, closeBuilder, activeDraftId, activeNote, drafts, isLoading, switchDraft,
    panelView, setPanelView, isSheetOpen, setSheetOpen, readerChapter, startEntry,
    captureCurrentSource, currentSource,
  } = useInsightBuilder();
  const belowLg = useBelowLg();
  const onNotesPage = pathname === "/notes" || pathname.startsWith("/notes/");
  // The phone Log sheet belongs to a chapter page, or a page that names itself as a note's source (a Come, Follow
  // Me lesson, with or without a guide).
  const sheetPage = readerChapter !== null || currentSource !== null;

  // Reader actions ask for the notebook with isMobileOpen (the provider already made the note active). Below lg, a
  // chapter page opens its Log sheet on that note; elsewhere the note opens full-screen on /notes. Only the phone
  // flag is cleared, so the desktop panel's remembered state is untouched.
  useEffect(() => {
    if (!isMobileOpen || belowLg === null) return;
    dismissMobile();
    if (!belowLg || !canUseInsights || onNotesPage) return;
    if (readerChapter) setSheetOpen(true);
    else router.push("/notes");
  }, [isMobileOpen, belowLg, canUseInsights, onNotesPage, readerChapter, dismissMobile, setSheetOpen, router]);

  // Leaving the sheet's page, or widening past lg, closes it.
  useEffect(() => {
    if (isSheetOpen && (!sheetPage || belowLg === false)) setSheetOpen(false);
  }, [isSheetOpen, sheetPage, belowLg, setSheetOpen]);

  if (!canUseInsights || onNotesPage || belowLg === null) return null;

  const readingOptions = readerChapter?.logOptions ?? [];
  const content = (frame: NotesPanelFrame, autoFocus: boolean): ReactNode => (
    <NotesPanelContent
      activeNoteId={activeDraftId}
      activeNote={activeNote}
      notes={drafts}
      isLoading={isLoading}
      onSelect={switchDraft}
      view={panelView}
      onViewChange={setPanelView}
      // New note links to the page in view (with its live position), without logging reading of it.
      onNewEntry={() => startEntry({ source: captureCurrentSource() ?? readingOptions[0]?.source ?? null })}
      readingOptions={readingOptions}
      frame={frame}
      autoFocus={autoFocus}
    />
  );

  if (belowLg) {
    return sheetPage && isSheetOpen ? (
      <NotesSheet onClose={() => setSheetOpen(false)}>{(frame) => content(frame, false)}</NotesSheet>
    ) : null;
  }
  const activeTitle =
    drafts.find((row) => row.id === activeDraftId)?.title || (activeNote?.id === activeDraftId ? activeNote?.title : null) || null;
  return (
    <NotesSidebar
      isOpen={isPanelOpen}
      onToggle={togglePanel}
      onCollapse={closeBuilder}
      readerLog={!!readerChapter}
      activeTitle={activeTitle}
      renderContent={(frame) => content(frame, true)}
    />
  );
}
