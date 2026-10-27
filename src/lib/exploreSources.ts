// Explore shows a source only while it may have something to show: loading, failed (so it can be retried), or
// found. A source that came back with nothing is hidden, and named in the "no matches" list with a link to search
// it at its home, so leaving it out never hides that it was checked.

export type SourceStatus = "loading" | "error" | "empty" | "found";

/** A lookup's status, given whether its loaded value has anything to show. */
export function lookupStatus<T>(
  state: { status: "idle" | "loading" | "error" } | { status: "ready"; data: T },
  hasResults: (data: T) => boolean
): SourceStatus {
  if (state.status === "ready") return hasResults(state.data) ? "found" : "empty";
  return state.status === "error" ? "error" : "loading";
}

/**
 * A section's status from its sources': it shows as soon as any source finds something, waits while any is
 * loading, offers a retry if one failed, and hides only once every source is conclusively empty.
 */
export function sectionStatus(statuses: readonly SourceStatus[]): SourceStatus {
  if (statuses.includes("found")) return "found";
  if (statuses.includes("loading")) return "loading";
  if (statuses.includes("error")) return "error";
  return "empty";
}

/** The options worth offering, in order: everything not conclusively empty. */
export function visibleSources<T extends { status: SourceStatus }>(sources: readonly T[]): T[] {
  return sources.filter((source) => source.status !== "empty");
}

// Explore's sections start collapsed. One section opens at a time, and within it at most one result; opening a
// section starts with its results closed.
export type ExploreSectionKey = "helps" | "languages" | "english";
export type ExploreOpenState = { section: ExploreSectionKey | null; row: string | null };
export type ExploreOpenAction = { type: "toggleSection"; section: ExploreSectionKey } | { type: "toggleRow"; row: string };

export const EXPLORE_COLLAPSED: ExploreOpenState = { section: null, row: null };

export function nextExploreOpen(state: ExploreOpenState, action: ExploreOpenAction): ExploreOpenState {
  if (action.type === "toggleSection") {
    return state.section === action.section ? EXPLORE_COLLAPSED : { section: action.section, row: null };
  }
  if (state.section == null) return state;
  return { section: state.section, row: state.row === action.row ? null : action.row };
}
