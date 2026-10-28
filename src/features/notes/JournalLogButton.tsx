"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook } from "@fortawesome/free-solid-svg-icons";
import { useInsightBuilder } from "@/features/insights/InsightBuilderProvider";
import { withLiveHref } from "./entryDraft";
import type { NoteSource } from "./journal";
import { useBelowLg } from "./useBelowLg";
import { useConvexSignedIn } from "./useConvexSignedIn";

/** One launcher for notes and reading on desktop and mobile; Log opens a reading entry, preserving any unfinished text. */
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
  const { loading } = useConvexSignedIn();
  const belowLg = useBelowLg();
  const { isPanelOpen, isSheetOpen, openLog, setSheetOpen, closeBuilder } = useInsightBuilder();
  const expanded = belowLg ? isSheetOpen : isPanelOpen;

  function toggle() {
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
      title="Log reading or add a note"
      className={className}
    >
      <FontAwesomeIcon icon={faBook} className="h-3 w-3" aria-hidden="true" />
      <span className={labelClassName}>Log</span>
    </button>
  );
}
