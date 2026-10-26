import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LessonCoverImage, { CoverCredit } from "@/features/comeFollowMe/LessonCoverImage";
import { getLessonCover, type LessonCover } from "@/features/comeFollowMe/lessonCovers";
import StudyCompanion, { type CompanionChapter } from "@/features/comeFollowMe/StudyCompanion";
import NoteSourceRegistrar from "@/features/notes/NoteSourceRegistrar";
import styles from "@/features/comeFollowMe/studyCompanion.module.css";
import { getBookLabel, getChapterHref } from "@/features/plans/scriptureCatalog";
import { readGuide, readGuides, type Guide } from "@/lib/cfm/cfmGuide";
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

function BackLink() {
  return (
    <Link href="/come-follow-me" className={styles.backLink}>
      <span aria-hidden="true">←</span> All lessons
    </Link>
  );
}

type HeroProps = {
  cover: LessonCover;
  /** The quiet line above the title: the week's reading and dates. */
  meta: string[];
  title: string;
  summary?: string;
};

/**
 * The page head: the week's text beside its cover, which fades into the page. The cover's credit (or a
 * generated illustration's provenance) is in the footer, not here; see CoverLine.
 */
function LessonHero({ cover, meta, title, summary }: HeroProps) {
  return (
    <header className={styles.header}>
      <BackLink />
      {/* Never wider than the source, so small paintings are not upscaled. */}
      <div className={styles.heroArt} style={{ maxWidth: cover.width }}>
        <LessonCoverImage cover={cover} className={styles.heroImage} priority />
      </div>
      <div className={styles.heroText}>
        <p className={styles.eyebrow}>
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
        <h1 className={styles.title}>{title}</h1>
        {summary ? <p className={styles.summary}>{summary}</p> : null}
      </div>
    </header>
  );
}

/** The cover's full credit, for the footer. */
function CoverLine({ cover }: { cover: LessonCover }) {
  return (
    <p>
      Cover: <CoverCredit cover={cover} />
    </p>
  );
}

function NoGuide({ week }: { week: ComeFollowMeWeek }) {
  const ranges = week.refs.length > 0 ? week.refs : week.suggestion ? [week.suggestion.ref] : [];
  const cover = getLessonCover(week.start);
  return (
    <section className={`page-shell ${styles.page}`}>
      <LessonHero cover={cover} meta={["Come, Follow Me", formatWeekRange(week)]} title={week.block} />
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
      <footer className={styles.footer}>
        <CoverLine cover={cover} />
        <WeekNav week={week} />
      </footer>
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
  // Only the week's own chapters ("Jeremiah 1–3; 7; …" skips 4–6); other chapters stay preview links.
  for (const chapter of range.chapters) {
    const data = await getLocalLdsChapter(range.volume, range.slug, chapter);
    if (!data) throw new Error(`Come, Follow Me: missing ${range.book} ${chapter}`);
    chapters.push({ chapter, verses: data.verses });
  }

  const cover = getLessonCover(week.start);
  const guideSource = {
    kind: "guide" as const,
    label: `${guide.scripture}: ${parsed.title}`,
    href: `/come-follow-me/${week.start}`,
  };

  return (
    <section className={`page-shell-wide ${styles.page}`}>
      <LessonHero
        cover={cover}
        meta={[guide.scripture, guide.dateLabel]}
        title={parsed.title}
        summary={guide.summary}
      />

      <NoteSourceRegistrar kind={guideSource.kind} label={guideSource.label} href={guideSource.href} />
      <StudyCompanion
        introductionHtml={parsed.introductionHtml}
        readerHtml={parsed.readerSections.length ? "" : parsed.readerHtml}
        readerSections={parsed.readerSections}
        closingHtml={parsed.closingHtml}
        toc={parsed.toc}
        book={{ label: range.book, slug: range.slug, volume: range.volume }}
        chapters={chapters}
        weekStart={week.start}
        guideSource={guideSource}
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
              .
            </p>
            <CoverLine cover={cover} />
            <WeekNav week={week} />
          </footer>
        }
      />
    </section>
  );
}
