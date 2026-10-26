import { guideRange, readGuide, readGuides } from "./cfmGuide.ts";
import { normalizeScriptureVolume } from "../scriptureVolumes.ts";

export type ResourceSelection = {
  volume: string;
  book: string;
  chapter: number;
  verses: number[];
};

export type VerseLessonResource = {
  id: string;
  title: string;
  reference: string;
  lessonTitle: string;
  dateLabel: string;
  href: string;
  bodyHtml: string;
  sources: Array<{ title: string; url: string }>;
};

/** The reader sends its exact verse list, so gaps in a selection never match intervening verses. */
export function parseResourceSelection(params: URLSearchParams): ResourceSelection | null {
  const volume = normalizeScriptureVolume(params.get("volume") ?? "");
  const book = params.get("book") ?? "";
  const chapter = Number(params.get("chapter"));
  const spec = params.get("verses") ?? "";
  if (
    !["oldtestament", "newtestament", "bookofmormon", "doctrineandcovenants", "pearl"].includes(volume) ||
    !/^[a-z0-9-]+$/.test(book) ||
    !Number.isSafeInteger(chapter) || chapter < 1 || chapter > 150 ||
    spec.length > 1000 || !/^\d+(,\d+)*$/.test(spec)
  ) return null;
  const verses = [...new Set(spec.split(",").map(Number))].sort((a, b) => a - b);
  if (verses.some((verse) => !Number.isSafeInteger(verse) || verse < 1 || verse > 199)) return null;
  return { volume, book, chapter, verses };
}

/** Only published commentary that actually overlaps selected verses, with its own cited sources. */
export function getVerseLessonResources(selection: ResourceSelection, root = process.cwd()): VerseLessonResource[] {
  const resources: VerseLessonResource[] = [];
  for (const guide of readGuides(root)) {
    const range = guideRange(guide.scripture);
    if (
      !range || range.volume !== normalizeScriptureVolume(selection.volume) || range.slug !== selection.book ||
      !range.chapters.includes(selection.chapter)
    ) continue;
    const parsed = readGuide(guide, root);
    const headings = new Map(parsed.toc.flatMap((item) => item.verses).map((verse) => [verse.id, verse.text]));
    const details = new Map(parsed.passageResources.map((resource) => [resource.passageId, resource]));
    for (const passage of parsed.passages) {
      if (passage.chapter !== selection.chapter || !selection.verses.some((verse) => verse >= passage.first && verse <= passage.last)) continue;
      const detail = details.get(passage.id);
      resources.push({
        id: `${guide.slug}:${passage.id}`,
        title: headings.get(passage.id) || `${range.book} ${passage.label}`,
        reference: `${range.book} ${passage.label}`,
        lessonTitle: guide.title,
        dateLabel: guide.dateLabel,
        href: `/come-follow-me/${guide.startDate}#${passage.id}`,
        // In-page scripture links belong to the lesson, rather than the resource dialog.
        bodyHtml: (detail?.bodyHtml ?? "").replace(/href="#([\w-]+)"/g, `href="/come-follow-me/${guide.startDate}#$1"`),
        sources: detail?.sources ?? [],
      });
    }
  }
  return resources;
}
