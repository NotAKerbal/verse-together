// Resources for selected verses (the web's /api/resources, src/lib/cfm/verseResources.ts): the published Come,
// Follow Me guides' commentary on passages that overlap the selection, with each passage's title, lesson and date,
// its commentary, and the sources it cites. Read from the guides bundled with the app (generated from the same
// published Markdown the site reads), so Resources works offline and nothing is fetched.
//
// A passage matches by its real book and chapter (the guide's range entries), so a lesson spanning two books
// (Jeremiah and Lamentations) offers resources for both, where the web route matches the first book only.

import { nativeGuides } from "../../cfm/guides";
import type { Block, NativeGuide } from "../../cfm/guideTypes";
import { normalizeScriptureVolume } from "../../shared/web";

export type LessonResource = {
  id: string;
  title: string;
  /** "Isaiah 41:2–4". */
  reference: string;
  lessonTitle: string;
  dateLabel: string;
  /** The lesson's week, and the passage's place in it. */
  weekStart: string;
  anchor: string;
  /** The commentary (without the verse heading, which the card replaces), its cited sources included. */
  blocks: Block[];
};

export type ResourceSelection = { volume: string; book: string; chapter: number; verses: readonly number[] };

/** Only published commentary that actually overlaps the selected verses, in lesson order. */
export function verseLessonResources(selection: ResourceSelection, guides: readonly NativeGuide[] = nativeGuides()): LessonResource[] {
  const volume = normalizeScriptureVolume(selection.volume);
  const resources: LessonResource[] = [];
  for (const guide of guides) {
    const entries = guide.range.entries.filter((entry) => normalizeScriptureVolume(entry.volume) === volume && entry.slug === selection.book && entry.chapter === selection.chapter);
    if (entries.length === 0) continue;
    const keys = new Map(entries.map((entry) => [entry.key, entry]));
    const headings = new Map(guide.toc.flatMap((item) => item.verses).map((verse) => [verse.id, verse.text]));
    for (const section of guide.sections) {
      for (const block of section.blocks) {
        const passage = block.passage;
        const entry = passage ? keys.get(passage.chapter) : undefined;
        if (!passage || !entry || !selection.verses.some((verse) => verse >= passage.first && verse <= passage.last)) continue;
        const reference = `${entry.book} ${passage.label}`;
        const all = [...block.preview, ...block.more];
        resources.push({
          id: `${guide.slug}:${block.id}`,
          title: headings.get(block.id) || reference,
          reference,
          lessonTitle: guide.title,
          dateLabel: guide.dateLabel,
          weekStart: guide.startDate,
          anchor: block.id,
          blocks: all[0]?.kind === "heading" ? all.slice(1) : all,
        });
      }
    }
  }
  return resources;
}

export function resourcesSearchUrl(reference: string): string {
  return `https://www.google.com/search?${new URLSearchParams({ q: `Come Follow Me ${reference}` })}`;
}
