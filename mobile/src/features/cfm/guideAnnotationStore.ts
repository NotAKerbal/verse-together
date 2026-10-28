// Where a study guide's annotations (highlights, underlines and notes on spans of its prose) are read and written:
// the one boundary the lesson screen uses, so it never chooses between this device and the account itself.
//
// Signed out, they are this device's guide spans (the web's signed-out study, DeviceStudyStore, rows with no owner).
// Account rows come from the session-bound account cache. Guide writes require a verified online connection;
// an unknown owner or pending deletion never falls back to the device's study.

import { currentStudyMode, useStudyMode, useAccountGuideAnnotations, setAccountGuideAnnotation, deleteAccountGuideAnnotation } from "../../storage/accountGuideAnnotations";
import { readGuideHighlight, type GuideHighlight } from "@/features/comeFollowMe/guideAnchors";
import type { GuideAnchorFields, GuideAnnotationPatch } from "../../../../convex/annotationRules";
import { deviceStudy, useDeviceStudy } from "../../storage/study";

/** A change to a guide span: the saved one `highlightId`, else the one with this exact anchor, else a new one. */
export type GuideAnnotationTarget = GuideAnchorFields & { guide: string; highlightId?: string };

/** A guide's spans as the screen shows them: checked rows (readGuideHighlight) of this guide, this viewer's only. */
export type GuideAnnotationsState = { status: "loading" | "ready" | "unavailable"; rows: readonly GuideHighlight[] };

const NO_ROWS: readonly GuideHighlight[] = [];
const deviceRows = new WeakMap<readonly unknown[], Map<string, readonly GuideHighlight[]>>();

/** This device's spans of one guide (owner null only), parsed once per stored list. */
function deviceGuideRows(highlights: readonly unknown[], guide: string): readonly GuideHighlight[] {
  let byGuide = deviceRows.get(highlights);
  if (!byGuide) deviceRows.set(highlights, (byGuide = new Map()));
  let rows = byGuide.get(guide);
  if (!rows) {
    rows = highlights
      .filter((row) => (row as { owner?: unknown }).owner === null)
      .map(readGuideHighlight)
      .filter((row): row is GuideHighlight => row !== null && row.guide === guide);
    if (!rows.length) rows = NO_ROWS;
    byGuide.set(guide, rows);
  }
  return rows;
}

function useDeviceGuide(guide: string): GuideAnnotationsState {
  const device = useDeviceStudy();
  return { status: "ready", rows: deviceGuideRows(device.highlights, guide) };
}

export function useGuideAnnotations(guide: string): GuideAnnotationsState {
  const mode = useStudyMode();
  const account = useAccountGuideAnnotations(guide, mode !== "device");
  const device = useDeviceGuide(guide);
  return mode === "device" ? device : account;
}

/** Saves a change to a span (only the patch's fields change; a span left with nothing is removed). */
export async function setGuideAnnotation(target: GuideAnnotationTarget, patch: GuideAnnotationPatch): Promise<void> {
  if (target.highlightId?.startsWith("pending:")) throw new Error("That mark is still saving.");
  if (currentStudyMode() !== "device") return setAccountGuideAnnotation(target, patch);
  const { highlightId, ...input } = target;
  deviceStudy.setGuideAnnotation(input, patch, highlightId);
}

/** Removes a saved span: its marks and its note. */
export async function deleteGuideAnnotation(row: GuideHighlight): Promise<void> {
  if (row.id.startsWith("pending:")) throw new Error("That mark is still saving.");
  if (currentStudyMode() !== "device") return deleteAccountGuideAnnotation(row);
  deviceStudy.remove("highlights", row.id);
}
