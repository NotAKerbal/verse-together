"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook } from "@fortawesome/free-solid-svg-icons";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { useAuth } from "@/lib/auth";
import { withLiveHref } from "./entryDraft";
import type { NoteSource } from "./journal";
import { useBelowLg } from "./useBelowLg";
import { useConvexSignedIn } from "./useConvexSignedIn";

/**
 * The reader and Come, Follow Me header's Log: opens the Log panel (below lg the phone sheet, else the nonmodal
 * desktop panel) on a blank entry for `source`, logging reading of it unless the person removes it. Nothing is
 * stored until the entry is saved, so opening is immediate and never lands on another page. `source` is the chapter
 * the header stands for, available before the chapter's text has loaded. While Log shows (below lg, while the sheet
 * is open) it closes it. Signed out, it asks to sign in.
 */
export default function JournalLogButton({
  reference,
  source,
  className,
  labelClassName,
}: {
  reference: string;
  source: NoteSource | null;
  className: string;
  labelClassName: string;
}) {
  const { user, promptSignIn } = useAuth();
  const { loading } = useConvexSignedIn();
  const belowLg = useBelowLg();
  const { isPanelOpen, isSheetOpen, panelView, openLog, setSheetOpen, closeBuilder } = useInsightBuilder();
  const expanded = !!user && (belowLg ? isSheetOpen : isPanelOpen && panelView === "log");

  function toggle() {
    if (!user) {
      void promptSignIn();
      return;
    }
    if (belowLg && isSheetOpen) setSheetOpen(false);
    else if (!belowLg && expanded) closeBuilder();
    else openLog(source ? withLiveHref(source, window.location) : null, belowLg ? "sheet" : "panel");
  }

  return (
    <button
      type="button"
      data-notebook-launcher=""
      onClick={toggle}
      disabled={loading}
      aria-expanded={expanded}
      aria-label={`Log ${reference}`}
      title="Log a note or reading"
      className={className}
    >
      <FontAwesomeIcon icon={faBook} className="h-3 w-3" aria-hidden="true" />
      <span className={labelClassName}>Log</span>
    </button>
  );
}
