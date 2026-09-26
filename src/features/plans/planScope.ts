import { getScriptureVolumeLabel, normalizeScriptureVolume } from "@/lib/scriptureVolumes";
import { buildBookSteps, buildRangeSteps, buildVolumeSteps, dedupeSteps, type PlanStepInput } from "./planSchedule";
import { PLAN_VOLUME_IDS, findCatalogBook, getBookLabel, getCatalogBooks } from "./scriptureCatalog";

/**
 * One piece of a plan's scope. The plan reads its selections in order, and
 * `steps` is always the expansion of `selections`.
 */
export type PlanSelection = {
  kind: "volume" | "book" | "range";
  volume: string;
  book?: string;
  from?: number;
  to?: number;
};

export type PlanVolumeId = (typeof PLAN_VOLUME_IDS)[number];

export const VOLUME_SHORT_LABELS: Record<PlanVolumeId, string> = {
  bookofmormon: "Book of Mormon",
  oldtestament: "Old Testament",
  newtestament: "New Testament",
  doctrineandcovenants: "Doctrine & Covenants",
  pearl: "Pearl of Great Price",
};

export function getVolumeChapterCount(volume: string): number {
  return getCatalogBooks(volume).reduce((sum, book) => sum + book.chapters, 0);
}

export function selectionKey(selection: PlanSelection): string {
  return `${selection.kind}:${normalizeScriptureVolume(selection.volume)}:${selection.book ?? ""}`;
}

export function isSameTarget(a: PlanSelection, b: PlanSelection): boolean {
  return normalizeScriptureVolume(a.volume) === normalizeScriptureVolume(b.volume) && (a.book ?? "") === (b.book ?? "");
}

export function buildSelectionSteps(selection: PlanSelection): PlanStepInput[] {
  if (selection.kind === "volume") return buildVolumeSteps(selection.volume);
  if (!selection.book) return [];
  if (selection.kind === "book") return buildBookSteps(selection.volume, selection.book);
  return buildRangeSteps({
    volume: selection.volume,
    book: selection.book,
    from: selection.from ?? 1,
    to: selection.to ?? selection.from ?? 1,
  });
}

export function buildScopeSteps(selections: readonly PlanSelection[]): PlanStepInput[] {
  return dedupeSteps(selections.flatMap(buildSelectionSteps));
}

export function countSelectionChapters(selection: PlanSelection): number {
  if (selection.kind === "volume") return getVolumeChapterCount(selection.volume);
  const entry = selection.book ? findCatalogBook(selection.volume, selection.book) : null;
  if (!entry) return 0;
  if (selection.kind === "book") return entry.chapters;
  const from = Math.max(1, selection.from ?? 1);
  const to = Math.min(entry.chapters, selection.to ?? from);
  return Math.max(0, to - from + 1);
}

/** "Book of Mormon", "Acts", "Isaiah 1–12", "D&C 76". */
export function describeSelection(selection: PlanSelection): string {
  if (selection.kind === "volume") {
    const id = normalizeScriptureVolume(selection.volume) as PlanVolumeId;
    return VOLUME_SHORT_LABELS[id] ?? getScriptureVolumeLabel(selection.volume);
  }
  const label = getBookLabel(selection.volume, selection.book ?? "");
  if (selection.kind === "book") return label;
  const from = selection.from ?? 1;
  const to = selection.to ?? from;
  return from === to ? `${label} ${from}` : `${label} ${from}–${to}`;
}

export const DEFAULT_PLAN_TITLE = "New plan";

/** "Acts + Isaiah 1–12", or "Genesis + Exodus + Leviticus + 2 more". */
export function autoTitleFromSelections(selections: readonly PlanSelection[]): string {
  if (selections.length === 0) return DEFAULT_PLAN_TITLE;
  const labels = selections.map(describeSelection);
  if (labels.length <= 3) return labels.join(" + ");
  return `${labels.slice(0, 3).join(" + ")} + ${labels.length - 3} more`;
}

/**
 * Rebuilds selections from saved steps, for plans created before selections
 * were stored. Consecutive chapters of a book collapse into a range, a full
 * book becomes a book selection, and a full volume in canonical order becomes
 * a volume selection.
 */
export function selectionsFromSteps(steps: readonly { volume: string; book: string; chapter: number }[]): PlanSelection[] {
  const ranges: PlanSelection[] = [];
  for (const step of steps) {
    const volume = normalizeScriptureVolume(step.volume);
    const last = ranges[ranges.length - 1];
    if (last && last.kind === "range" && last.volume === volume && last.book === step.book && last.to === step.chapter - 1) {
      last.to = step.chapter;
      continue;
    }
    ranges.push({ kind: "range", volume, book: step.book, from: step.chapter, to: step.chapter });
  }

  const books: PlanSelection[] = ranges.map((range) => {
    const entry = findCatalogBook(range.volume, range.book ?? "");
    if (entry && range.from === 1 && range.to === entry.chapters) {
      return { kind: "book", volume: range.volume, book: range.book };
    }
    return range;
  });

  const out: PlanSelection[] = [];
  let index = 0;
  while (index < books.length) {
    const current = books[index];
    const volumeBooks = current.kind === "book" ? getCatalogBooks(current.volume) : [];
    const matchesVolume =
      volumeBooks.length > 0 &&
      volumeBooks.every((entry, offset) => {
        const candidate = books[index + offset];
        return candidate && candidate.kind === "book" && candidate.volume === entry.volume && candidate.book === entry.book;
      });
    if (matchesVolume) {
      out.push({ kind: "volume", volume: current.volume });
      index += volumeBooks.length;
    } else {
      out.push(current);
      index += 1;
    }
  }
  return out;
}
