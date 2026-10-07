import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StudyCompanion, { type CompanionChapter } from "@/features/comeFollowMe/StudyCompanion";
import styles from "@/features/comeFollowMe/studyCompanion.module.css";
import { getBookLabel, getChapterHref } from "@/features/plans/scriptureCatalog";
import { readGuide, readGuides, readingTime, type Guide } from "@/lib/cfm/cfmGuide";
import {
  COME_FOLLOW_ME_WEEKS,
  formatWeekRange,
  getAdjacentWeek,
  getComeFollowMeWeekByStart,
  type ComeFollowMeWeek,
} from "@/lib/comeFollowMe";
import { getLocalLdsChapter } from "@/lib/ldsLocalData.server";

type Params = { params: Promise<{ weekStart: string }> };

const ATTRIBUTION = "Written in collaboration with agents";
const SOURCE_SITE = "https://www.isaacstuff.com/cfm";

export const dynamicParams = false;

export function generateStaticParams() {
  return COME_FOLLOW_ME_WEEKS.map((week) => ({ weekStart: week.start }));
}

function findGuide(week: ComeFollowMeWeek): Guide | null {
  return readGuides().find((guide) => guide.startDate === week.start) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const week = getComeFollowMeWeekByStart((await params).weekStart);
  if (!week) return { title: "Come, Follow Me · Verse Together" };
  const guide = findGuide(week);
  if (!guide) return { title: `${week.block} · Come, Follow Me · Verse Together` };
  // The guides' original publication asks search engines not to index them; keep that here.
  return {
    title: `${guide.scripture}: ${guide.title} · Come, Follow Me · Verse Together`,
    description: guide.summary,
    robots: { index: false, follow: false },
  };
}

function WeekNav({ week }: { week: ComeFollowMeWeek }) {
  const previous = getAdjacentWeek(week, -1);
  const next = getAdjacentWeek(week, 1);
  return (
    <nav className={styles.weekNav} aria-label="Other weeks">
      {previous ? (
        <Link href={`/come-follow-me/${previous.start}`} rel="prev">
          <span aria-hidden="true">←</span> {previous.block}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={`/come-follow-me/${next.start}`} rel="next">
          {next.block} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </nav>
  );
}

function NoGuide({ week }: { week: ComeFollowMeWeek }) {
  const ranges = week.refs.length > 0 ? week.refs : week.suggestion ? [week.suggestion.ref] : [];
  return (
    <section className={`page-shell ${styles.page}`}>
      <header className={styles.header}>
        <Link href="/browse" className={styles.backLink}>
          <span aria-hidden="true">←</span> Library
        </Link>
        <p className={styles.eyebrow}>
          <span>Come, Follow Me</span>
          <span>{formatWeekRange(week)}</span>
        </p>
        <h1 className={styles.title}>{week.block}</h1>
      </header>
      <div className={styles.noGuide}>
        <p>There is no study guide for this week yet. You can still read the assigned scripture.</p>
        <ul>
          {ranges.map((range) => (
            <li key={`${range.book}-${range.from}`}>
              <Link href={getChapterHref({ volume: range.volume, book: range.book, chapter: range.from })}>
                {getBookLabel(range.volume, range.book)} {range.from}
                {range.to > range.from ? `–${range.to}` : ""}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <WeekNav week={week} />
    </section>
  );
}

export default async function ComeFollowMeWeekPage({ params }: Params) {
  const week = getComeFollowMeWeekByStart((await params).weekStart);
  if (!week) notFound();
  const guide = findGuide(week);
  if (!guide) return <NoGuide week={week} />;

  const parsed = readGuide(guide);
  if (!parsed.range) throw new Error(`Come, Follow Me: guide ${guide.slug} has no readable scripture range`);
  const { range } = parsed;

  const chapters: CompanionChapter[] = [];
  for (let chapter = range.first; chapter <= range.last; chapter += 1) {
    const data = await getLocalLdsChapter(range.volume, range.slug, chapter);
    if (!data) throw new Error(`Come, Follow Me: missing ${range.book} ${chapter}`);
    chapters.push({ chapter, verses: data.verses });
  }

  return (
    <section className={`page-shell-wide ${styles.page}`}>
      <header className={styles.header}>
        <Link href="/browse" className={styles.backLink}>
          <span aria-hidden="true">←</span> Library
        </Link>
        <p className={styles.eyebrow}>
          <span>{guide.scripture}</span>
          <span>Come, Follow Me</span>
          <span>{guide.dateLabel}</span>
        </p>
        <h1 className={styles.title}>{parsed.title}</h1>
        <p className={styles.summary}>{guide.summary}</p>
        <p className={styles.byline}>
          <span>Guide by {guide.author}</span>
          <span aria-hidden="true">·</span>
          <span className={styles.attribution}>{ATTRIBUTION}</span>
          <span aria-hidden="true">·</span>
          <span>{readingTime(parsed.words)}</span>
        </p>
      </header>

      <StudyCompanion
        introductionHtml={parsed.introductionHtml}
        readerHtml={parsed.readerHtml}
        toc={parsed.toc}
        passages={parsed.passages}
        book={{ label: range.book, slug: range.slug, volume: range.volume }}
        chapters={chapters}
        weekStart={week.start}
        footer={
          <footer className={styles.footer}>
            <p>
              <span className={styles.attribution}>{ATTRIBUTION}</span>. Guide by {guide.author}. Scripture text is the
              King James Version from Verse Together&apos;s local library.
            </p>
            <p>
              Originally published at{" "}
              <a href={SOURCE_SITE} target="_blank" rel="noopener noreferrer">
                isaacstuff.com/cfm
              </a>
              . Paintings are public domain and credited where they appear.
            </p>
            <WeekNav week={week} />
          </footer>
        }
      />
    </section>
  );
}
