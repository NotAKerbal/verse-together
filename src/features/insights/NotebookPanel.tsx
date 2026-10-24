"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useInsightBuilder } from "./InsightBuilderProvider";
import NotesSidebar from "@/features/notes/NotesSidebar";
import { useBelowLg } from "@/features/notes/useBelowLg";

export default function NotebookPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    canUseInsights, isMobileOpen, dismissMobile,
    isPanelOpen, togglePanel, closeBuilder, activeDraftId, activeNote, drafts, isLoading, switchDraft, createDraft,
  } = useInsightBuilder();
  const belowLg = useBelowLg();
  const onNotesPage = pathname === "/notes" || pathname.startsWith("/notes/");

  // Reader actions ask for the notebook with isMobileOpen. Below lg there is no sheet any more: the note opens
  // full-screen on /notes (the provider already made it active). Only the phone flag is cleared, so the
  // desktop panel's remembered state is untouched.
  useEffect(() => {
    if (!isMobileOpen || belowLg === null) return;
    dismissMobile();
    if (belowLg && canUseInsights && !onNotesPage) router.push("/notes");
  }, [isMobileOpen, belowLg, canUseInsights, onNotesPage, dismissMobile, router]);

  if (!canUseInsights || onNotesPage || belowLg !== false) return null;
  return (
    <NotesSidebar
      isOpen={isPanelOpen}
      onToggle={togglePanel}
      onCollapse={closeBuilder}
      activeNoteId={activeDraftId}
      activeNote={activeNote}
      notes={drafts}
      isLoading={isLoading}
      onSelect={switchDraft}
      onCreate={createDraft}
    />
  );
}
