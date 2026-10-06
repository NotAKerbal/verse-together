import guides from "../../../content/cfm/guides.json";

/** Week starts (Monday keys) that have a published study guide. Client-safe: metadata only. */
const GUIDE_WEEK_STARTS: ReadonlySet<string> = new Set(guides.map((guide) => guide.startDate));

export function hasStudyGuide(weekStart: string): boolean {
  return GUIDE_WEEK_STARTS.has(weekStart);
}

export function getStudyGuideHref(weekStart: string): string {
  return `/come-follow-me/${weekStart}`;
}
