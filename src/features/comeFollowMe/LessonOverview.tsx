"use client";

import Link from "next/link";
import { useId, useMemo } from "react";
import { PUBLISHED_GUIDES } from "./guideIndex";
import LessonChapters from "./LessonChapters";
import LessonCoverImage, { CoverCredit } from "./LessonCoverImage";
import { shortCoverCredit } from "./lessonCovers";
import { getLessonOverview, weekReading, type Lesson, type ScheduleStatus } from "./lessons";
import { useTodayKey } from "./useTodayKey";
import styles from "./lessons.module.css";

function FeaturedLesson({ lesson }: { lesson: Lesson }) {
  const titleId = useId();
  const { guide, week, cover } = lesson;
  const ranges = week ? weekReading(week) : [];
  // Only a published guide gets a link here; a week without one is just its reading.
  const guideHref = guide ? lesson.href : null;
  // With a guide, the title link stretches over the whole card (see .featuredLink); the chapter chips and
  // credit link sit above it, so the card never nests links.
  return (
    <article
      className={guideHref ? `${styles.featured} ${styles.featuredLinked}` : styles.featured}
      aria-labelledby={titleId}
    >
      <figure className={styles.featuredMedia}>
        <LessonCoverImage cover={cover} className={styles.featuredImage} priority />
        {cover.kind === "painting" ? (
          <figcaption className={styles.mediaCredit}>
            <CoverCredit cover={cover} />
          </figcaption>
        ) : null}
      </figure>
      <div className={styles.featuredBody}>
        <p className={styles.kicker}>
          <span>This week</span>
          <span>{lesson.dateLabel}</span>
        </p>
        <h3 id={titleId} className={styles.featuredTitle}>
          {guideHref ? (
            <Link href={guideHref} className={styles.featuredLink}>
              {lesson.title}
            </Link>
          ) : (
            lesson.title
          )}
        </h3>
        {guide ? (
          <>
            <p className={styles.scripture}>{lesson.scripture}</p>
            <p className={styles.summary}>{guide.summary}</p>
          </>
        ) : (
          <p className={styles.summary}>
            {week?.suggestion ? `${week.suggestion.note}. ` : ""}
            There is no study guide for this week yet. You can still read the assigned scripture.
          </p>
        )}
        {week && ranges.length > 0 ? (
          <div className={styles.reading}>
            <p className={styles.readingLabel} aria-hidden="true">
              Read the chapters
            </p>
            <LessonChapters ranges={ranges} weekStart={week.start} />
          </div>
        ) : null}
        {guideHref ? (
          <div className={styles.actions}>
            <Link href={guideHref} className={styles.primaryAction}>
              Open the study guide <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function NoLessonThisWeek({ schedule }: { schedule: ScheduleStatus }) {
  return (
    <p className={styles.notice}>
      {schedule === "after"
        ? "This year’s Come, Follow Me schedule has ended. Earlier lessons stay open below."
        : schedule === "before"
          ? "This year’s Come, Follow Me schedule has not begun yet."
          : "No lesson is scheduled for this week."}
    </p>
  );
}

function LessonCard({ lesson }: { lesson: Lesson }) {
  const titleId = useId();
  const credit = shortCoverCredit(lesson.cover);
  const body = (
    <>
      <div className={styles.cardMedia}>
        <LessonCoverImage cover={lesson.cover} className={styles.cardImage} />
        {credit ? (
          <p className={styles.mediaCredit}>
            <span className="sr-only">Cover painting: </span>
            {credit}
          </p>
        ) : null}
      </div>
      <div className={styles.cardBody}>
        <p className={styles.cardDate}>{lesson.dateLabel}</p>
        <p className={styles.scripture}>{lesson.scripture}</p>
        <h3 id={titleId} className={styles.cardTitle}>
          {lesson.title}
        </h3>
        {lesson.guide ? <p className={styles.cardSummary}>{lesson.guide.summary}</p> : null}
      </div>
    </>
  );
  // One link per card, named by its title; the cover, dates, and summary are its description.
  return lesson.href ? (
    <Link href={lesson.href} className={styles.card} aria-labelledby={titleId} data-tap>
      {body}
    </Link>
  ) : (
    <article className={styles.card} aria-labelledby={titleId}>
      {body}
    </article>
  );
}

function LessonGrid({ lessons }: { lessons: Lesson[] }) {
  return (
    <ul className={styles.grid}>
      {lessons.map((lesson) => (
        <li key={lesson.start}>
          <LessonCard lesson={lesson} />
        </li>
      ))}
    </ul>
  );
}

type Props = {
  /** The server's day, used for the first render; the reader's own day replaces it after hydration. */
  serverToday: string;
};

export default function LessonOverview({ serverToday }: Props) {
  const today = useTodayKey(serverToday) ?? serverToday;
  const overview = useMemo(() => getLessonOverview(today, PUBLISHED_GUIDES), [today]);
  const hasPaintings = [overview.current, ...overview.previous, ...overview.upcoming].some(
    (lesson) => lesson?.cover.kind === "painting"
  );

  return (
    <>
      <section className={styles.section} aria-labelledby="cfm-this-week">
        <h2 id="cfm-this-week" className={styles.sectionHeading}>
          This week
        </h2>
        {overview.current ? (
          <FeaturedLesson key={overview.current.start} lesson={overview.current} />
        ) : (
          <NoLessonThisWeek schedule={overview.schedule} />
        )}
      </section>

      {overview.upcoming.length > 0 ? (
        <section className={styles.section} aria-labelledby="cfm-upcoming">
          <h2 id="cfm-upcoming" className={styles.sectionHeading}>
            Coming up
          </h2>
          <LessonGrid lessons={overview.upcoming} />
        </section>
      ) : null}

      {overview.previous.length > 0 ? (
        <section className={styles.section} aria-labelledby="cfm-previous">
          <h2 id="cfm-previous" className={styles.sectionHeading}>
            Previous lessons
          </h2>
          <LessonGrid lessons={overview.previous} />
        </section>
      ) : null}

      <p className={styles.footnote}>
        Landscape and still-life covers are illustrations generated with AI and show no people.
        {hasPaintings
          ? " Paintings of the Savior are historical public-domain works, credited on each cover and in full on each lesson."
          : ""}
      </p>
    </>
  );
}
