import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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

function formatGeneratedDate(generatedAt: number) {
  return new Date(generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function correctionsLine(provenance: ChapterGuideView["provenance"], reviewer: string) {
  if (provenance.requiredCorrections === 0) return `${reviewer} checked the draft against the chapter and the research notes and required no corrections.`;
  const count = provenance.requiredCorrections === 1 ? "1 required correction" : `${provenance.requiredCorrections} required corrections`;
  return `${reviewer} checked the draft against the chapter and the research notes and found ${count}. The writer revised those sections once, and the same reviewer checked the result before it was saved.`;
}

function citedScriptureLine(provenance: ChapterGuideView["provenance"]) {
  const checked = provenance.crossReferencesChecked;
  if (checked === undefined) return "The reviewer wasn’t given the text of scriptures cited from other chapters, so those references weren’t checked against their wording.";
  const total = checked + (provenance.crossReferencesUnchecked ?? 0);
  return `The reviewer was given the text of ${checked} of the ${total} scriptures this guide cites from other chapters.`;
}

function GuideFooter({ guide }: { guide: ChapterGuideView }) {
  const { provenance } = guide;
  const reviewer = chapterGuideModelName(provenance.reviewModel);
  return (
    <footer className={styles.footer}>
      <p>
        <span className={styles.attribution}>{ATTRIBUTION}</span>, saved {formatGeneratedDate(guide.generatedAt)}. No person has reviewed it. It isn’t a Come, Follow Me lesson, a Church publication, or a statement of doctrine. Scripture text is from Verse Together&apos;s local library.
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

function NoGuidePage({ reference, readerHref, message }: { reference: string; readerHref: string; message: string }) {
  return (
    <section className={`page-shell ${styles.page}`} data-lesson-page>
      <PlainHero eyebrow={[reference, CHAPTER_GUIDE_LABEL]} title={`${reference} guide`} reference={reference} readerHref={readerHref} />
      <div className={styles.noGuide}>
        <p>{message}</p>
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
  try {
    state = await readChapterGuideState(location, scripture);
  } catch {
    return <NoGuidePage reference={reference} readerHref={readerHref} message="This chapter guide is temporarily unavailable. Try again in a little while." />;
  }
  if (!state.guide) {
    const message = state.generating
      ? `A guide for ${reference} is being written. It can take several minutes.`
      : `There’s no chapter guide for ${reference} yet. You can request one from Resources in the reader.`;
    return <NoGuidePage reference={reference} readerHref={readerHref} message={message} />;
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
