import guides from "../../../content/cfm/guides.json";
import type { LessonGuide } from "./lessons";

/** Every published study guide's card metadata, as listed in content/cfm/guides.json. Client-safe. */
export const PUBLISHED_GUIDES: ReadonlyArray<LessonGuide> = guides.map(
  ({ slug, title, scripture, startDate, endDate, dateLabel, summary }) => ({
    slug,
    title,
    scripture,
    startDate,
    endDate,
    dateLabel,
    summary,
  })
);

/** Week starts (Monday keys) that have a published study guide. */
const GUIDE_WEEK_STARTS: ReadonlySet<string> = new Set(guides.map((guide) => guide.startDate));

export function hasStudyGuide(weekStart: string): boolean {
  return GUIDE_WEEK_STARTS.has(weekStart);
}

export function getStudyGuideHref(weekStart: string): string {
  return `/come-follow-me/${weekStart}`;
}
