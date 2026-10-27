// Which Come, Follow Me lessons to show, and where, for a given local day. Pure and client-safe; the
// guide list is passed in so tests can supply their own (see lessonIndex.ts for the published one).

import { COME_FOLLOW_ME_WEEKS, type ChapterRange, type ComeFollowMeWeek } from "../../lib/comeFollowMe.ts";
import type { NoteSource } from "../notes/journal.ts";
import { getLessonCover, type LessonCover } from "./lessonCovers.ts";

/** The published guide metadata a lesson card needs (a subset of content/cfm/guides.json entries). */
export type LessonGuide = {
  slug: string;
  title: string;
  scripture: string;
  startDate: string;
  endDate: string;
  dateLabel: string;
  summary: string;
};

export type Lesson = {
  /** Monday, YYYY-MM-DD; also the cover key and the study page's route segment. */
  start: string;
  week: ComeFollowMeWeek | null;
  guide: LessonGuide | null;
  /** The study guide, or the scheduled week's reading page; null when neither exists. */
  href: string | null;
  /** The guide's title, else the scheduled block ("Jeremiah 31–33; …", "Christmas"). */
  title: string;
  scripture: string;
  dateLabel: string;
  cover: LessonCover;
};

export type ScheduleStatus = "before" | "during" | "after";

export type LessonOverview = {
  today: string;
  schedule: ScheduleStatus;
  /** This week's lesson: its published guide, else the scheduled reading; null outside both. */
  current: Lesson | null;
  /** Published guides whose week has ended, newest first. */
  previous: Lesson[];
  /** Published guides whose week has not begun, soonest first. */
  upcoming: Lesson[];
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "October 19–25, 2026", "September 28–October 4, 2026": the guides' own date style, locale-independent. */
export function formatLessonDates(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (sy !== ey) return `${MONTHS[sm - 1]} ${sd}, ${sy}–${MONTHS[em - 1]} ${ed}, ${ey}`;
  if (sm !== em) return `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}, ${ey}`;
  return `${MONTHS[sm - 1]} ${sd}–${ed}, ${ey}`;
}

export function lessonHref(weekStart: string): string {
  return `/come-follow-me/${weekStart}`;
}

/**
 * What a note or reading logged from a lesson page is linked to: the lesson's own page, whether or not the week has
 * a study guide yet. `label` names it in the journal: the guide's scripture and title, else the scheduled block.
 */
export function lessonNoteSource(weekStart: string, label: string): NoteSource & { kind: "guide" } {
  return { kind: "guide", label, href: lessonHref(weekStart) };
}

/** The week's assigned chapters, or the special week's suggested reading. */
export function weekReading(week: ComeFollowMeWeek): ChapterRange[] {
  return week.refs.length > 0 ? week.refs : week.suggestion ? [week.suggestion.ref] : [];
}

function guideLesson(guide: LessonGuide, weeks: ReadonlyArray<ComeFollowMeWeek>): Lesson {
  const week = weeks.find((candidate) => candidate.start === guide.startDate) ?? null;
  return {
    start: guide.startDate,
    week,
    guide,
    // Study pages exist for scheduled weeks only.
    href: week ? lessonHref(guide.startDate) : null,
    title: guide.title,
    scripture: guide.scripture,
    dateLabel: guide.dateLabel,
    cover: getLessonCover(guide.startDate),
  };
}

function weekLesson(week: ComeFollowMeWeek): Lesson {
  return {
    start: week.start,
    week,
    guide: null,
    href: lessonHref(week.start),
    title: week.block,
    scripture: week.block,
    dateLabel: formatLessonDates(week.start, week.end),
    cover: getLessonCover(week.start),
  };
}

/** The lesson for one scheduled week: its published guide when there is one. */
export function getLessonForWeek(
  weekStart: string,
  guides: ReadonlyArray<LessonGuide>,
  weeks: ReadonlyArray<ComeFollowMeWeek> = COME_FOLLOW_ME_WEEKS
): Lesson | null {
  const guide = guides.find((candidate) => candidate.startDate === weekStart);
  if (guide) return guideLesson(guide, weeks);
  const week = weeks.find((candidate) => candidate.start === weekStart);
  return week ? weekLesson(week) : null;
}

/**
 * Splits the lessons around `today` (a local YYYY-MM-DD key). Only a guide whose own dates include today, or
 * the scheduled week containing today, is "this week"; the newest guide is never promoted in their place.
 */
export function getLessonOverview(
  today: string,
  guides: ReadonlyArray<LessonGuide>,
  weeks: ReadonlyArray<ComeFollowMeWeek> = COME_FOLLOW_ME_WEEKS
): LessonOverview {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const schedule: ScheduleStatus =
    !first || today < first.start ? "before" : today > last.end ? "after" : "during";

  const currentGuide = guides.find((guide) => guide.startDate <= today && today <= guide.endDate) ?? null;
  const currentWeek = weeks.find((week) => week.start <= today && today <= week.end) ?? null;
  const current = currentGuide ? guideLesson(currentGuide, weeks) : currentWeek ? weekLesson(currentWeek) : null;

  const previous = guides
    .filter((guide) => guide.endDate < today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((guide) => guideLesson(guide, weeks));
  const upcoming = guides
    .filter((guide) => guide.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((guide) => guideLesson(guide, weeks));

  return { today, schedule, current, previous, upcoming };
}
