import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import ChapterGuidePendingStatus from "@/features/chapterGuides/ChapterGuidePendingStatus";
import LessonNoteButton from "@/features/comeFollowMe/LessonNoteButton";
import { chapterHref, passageTarget } from "@/features/comeFollowMe/passagePreview";
import StudyCompanion from "@/features/comeFollowMe/StudyCompanion";
import styles from "@/features/comeFollowMe/studyCompanion.module.css";
import type { NoteSource } from "@/features/notes/journal";
import NoteSourceRegistrar from "@/features/notes/NoteSourceRegistrar";
import { chapterGuideCompanion } from "@/lib/chapterGuideCompanion";
import { readChapterGuideState } from "@/lib/chapterGuideState.server";
import {
  CHAPTER_GUIDE_LABEL,
  chapterGuideHref,
  chapterGuideKey,
  chapterGuideModelName,
  chapterGuideNoGuideMessage,
  type ChapterGuideView,
} from "@/lib/chapterGuideView";
import { getLocalLdsChapter } from "@/lib/ldsLocalData.server";

export const dynamic = "force-dynamic";

const ATTRIBUTION = "Prepared with AI";

type Params = { params: Promise<{ volume: string; book: string; chapter: string }> };

function chapterTarget({ volume, book, chapter }: { volume: string; book: string; chapter: string }) {
  return /^\d{1,3}$/.test(chapter) ? passageTarget(volume, book, Number(chapter)) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const target = chapterTarget(await params);
  const title = target ? `${target.label} ${target.chapter} · ${CHAPTER_GUIDE_LABEL} · Verse Together` : `${CHAPTER_GUIDE_LABEL} · Verse Together`;
  return { title, robots: { index: false, follow: false } };
}

async function readTimedChapterGuideState(...args: Parameters<typeof readChapterGuideState>) {
  const state = await readChapterGuideState(...args);
  return { state, readAt: Date.now() };
}

function formatGeneratedDate(generatedAt: number) {
  return new Date(generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function correctionsLine(provenance: ChapterGuideView["provenance"], reviewer: string) {
  if (provenance.requiredCorrections === 0) return `${reviewer} checked the draft against the chapter and the research notes and required no corrections.`;
  const count = provenance.requiredCorrections === 1 ? "1 required correction" : `${provenance.requiredCorrections} required corrections`;
  const found = `${reviewer} checked the draft against the chapter and the research notes and found ${count}.`;
  const rounds = provenance.correctionRounds ?? 1;
  if (rounds > 1) return `${found} The guide reached correction round ${rounds}, and the reviewer cleared the final draft before it was saved.`;
  return `${found} The writer revised those sections once, and the same reviewer checked the result before it was saved.`;
}

function citedScriptureLine(provenance: ChapterGuideView["provenance"]) {
  const checked = provenance.crossReferencesChecked;
  if (checked === undefined) return "The reviewer wasn’t given the text of scriptures cited from other chapters, so those references weren’t checked against their wording.";
  const total = checked + (provenance.crossReferencesUnchecked ?? 0);
  return `The reviewer was given the text of ${checked} of the ${total} scriptures this guide cites from other chapters.`;
}

function humanReviewLine(provenance: ChapterGuideView["provenance"]) {
  if (!provenance.ownerContinuations) return "No person has reviewed it.";
  return "A human reviewer looked at an earlier draft and allowed more correction rounds, but no person has approved this text.";
}

function GuideFooter({ guide }: { guide: ChapterGuideView }) {
  const { provenance } = guide;
  const reviewer = chapterGuideModelName(provenance.reviewModel);
  return (
    <footer className={styles.footer}>
      <p>
        <span className={styles.attribution}>{ATTRIBUTION}</span>, saved {formatGeneratedDate(guide.generatedAt)}. {humanReviewLine(provenance)} It isn’t a Come, Follow Me lesson, a Church publication, or a statement of doctrine. Scripture text is from Verse Together&apos;s local library.
      </p>
      <details className={styles.generatedProvenance}>
        <summary>How this guide was made</summary>
        <ol>
          <li>Research. {chapterGuideModelName(provenance.researchModel)} chose its own web searches, within a fixed limit and a list of allowed sites, and wrote short notes tied to verses.</li>
          <li>Writing. {chapterGuideModelName(provenance.writerModel)} wrote the guide from the chapter and those notes. It had no web access and didn’t see the source pages.</li>
          <li>Review. {correctionsLine(provenance, reviewer)}</li>
        </ol>
        <p>{citedScriptureLine(provenance)}</p>
        <p>Only the research step chooses what to do. The steps after it run in a fixed order.</p>
      </details>
    </footer>
  );
}

function PlainHero({ eyebrow, title, reference, readerHref, noteSource }: { eyebrow: string[]; title: string; reference: string; readerHref: string; noteSource?: NoteSource }) {
  return (
    <header className={`${styles.header} ${styles.headerPlain}`}>
      <Link href={readerHref} className={styles.backLink}>
        <span aria-hidden="true">←</span> {reference}
      </Link>
      <div className={styles.heroText}>
        <p className={styles.eyebrow}>
          {eyebrow.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
        <h1 className={styles.title}>{title}</h1>
        {noteSource ? (
          <div className={`simple-hide ${styles.heroActions}`}>
            <LessonNoteButton source={noteSource} />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function NoGuidePage({ reference, readerHref, children }: { reference: string; readerHref: string; children: ReactNode }) {
  return (
    <section className={`page-shell ${styles.page}`} data-lesson-page>
      <PlainHero eyebrow={[reference, CHAPTER_GUIDE_LABEL]} title={`${reference} guide`} reference={reference} readerHref={readerHref} />
      <div className={styles.noGuide}>
        {children}
        <ul>
          <li><Link href={readerHref}>Open {reference} in the reader</Link></li>
        </ul>
      </div>
    </section>
  );
}

export default async function ChapterGuidePage({ params }: Params) {
  const target = chapterTarget(await params);
  if (!target) notFound();
  const scripture = await getLocalLdsChapter(target.volume, target.book, target.chapter);
  if (!scripture) notFound();
  const location = { volume: target.volume, book: target.book, chapter: target.chapter };
  const reference = `${target.label} ${target.chapter}`;
  const readerHref = chapterHref(target, false);

  let state;
  let readAt;
  try {
    ({ state, readAt } = await readTimedChapterGuideState(location, scripture));
  } catch {
    return <NoGuidePage reference={reference} readerHref={readerHref}><p>This chapter guide is temporarily unavailable. Try again in a little while.</p></NoGuidePage>;
  }
  if (!state.guide) {
    return (
      <NoGuidePage reference={reference} readerHref={readerHref}>
        {state.generating
          ? <ChapterGuidePendingStatus chapter={location} reference={reference} generating={state.generating} renderedAt={readAt} />
          : <p>{chapterGuideNoGuideMessage(state, reference, readAt)}</p>}
      </NoGuidePage>
    );
  }

  const companion = chapterGuideCompanion(state.guide, location);
  const href = chapterGuideHref(location.volume, location.book, location.chapter);
  const noteSource: NoteSource = { kind: "page", label: `${reference}: ${CHAPTER_GUIDE_LABEL}`, href };

  return (
    <section className={`page-shell-wide ${styles.page}`} data-lesson-page data-generated-guide>
      <PlainHero eyebrow={[reference, CHAPTER_GUIDE_LABEL]} title={companion.subtitle} reference={reference} readerHref={readerHref} noteSource={noteSource} />
      <NoteSourceRegistrar kind={noteSource.kind} label={noteSource.label} href={noteSource.href} />
      <StudyCompanion
        introductionHtml={companion.introductionHtml}
        readerHtml=""
        readerSections={companion.readerSections}
        closingHtml={companion.closingHtml}
        toc={companion.toc}
        chapters={[{ ...companion.chapter, verses: scripture.verses }]}
        guideId={chapterGuideKey(location.volume, location.book, location.chapter)}
        guideSource={noteSource}
        footer={<GuideFooter guide={state.guide} />}
      />
    </section>
  );
}
