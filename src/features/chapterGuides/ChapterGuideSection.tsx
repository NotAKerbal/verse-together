"use client";

import Link from "next/link";
import VerseResourceItem from "@/components/VerseResourceItem";
import panelStyles from "@/components/VerseResourcesPanel.module.css";
import { useAuth } from "@/lib/auth";
import { CHAPTER_GUIDE_LABEL, CHAPTER_GUIDE_UNAVAILABLE_MESSAGES, chapterGuideUnavailableMessage, OPEN_CHAPTER_GUIDE_LABEL } from "@/lib/chapterGuideView";
import ChapterGuideProgress from "./ChapterGuideProgress";
import styles from "./ChapterGuideSection.module.css";
import type { ChapterGuideSelection } from "./useChapterGuideSelection";

export default function ChapterGuideSection({ guide, previewsPassages }: { guide: ChapterGuideSelection; previewsPassages: boolean }) {
  const { user } = useAuth();
  const { state, stateLoadedAt, loadFailed, requesting, requestError, request } = guide;

  if (state?.hasGuide) {
    return (
      <section className={panelStyles.generatedGuide} aria-label={CHAPTER_GUIDE_LABEL}>
        {state.resources.length > 0 ? (
          <ul className={panelStyles.resourceList}>
            {state.resources.map((resource) => <VerseResourceItem key={resource.id} resource={resource} previewsPassages={previewsPassages} />)}
          </ul>
        ) : (
          <>
            <p className={styles.message}>The guide for {state.reference} has no section for these verses.</p>
            <a className={panelStyles.link} href={state.href}>{OPEN_CHAPTER_GUIDE_LABEL} <span aria-hidden="true">→</span></a>
          </>
        )}
      </section>
    );
  }

  const reference = state?.reference ?? "this chapter";
  const refusalShownByState = state?.availability && state.availability !== "available"
    ? CHAPTER_GUIDE_UNAVAILABLE_MESSAGES[state.availability]
    : null;
  const unavailableMessage = state ? chapterGuideUnavailableMessage(state, stateLoadedAt) : null;
  let body;
  if (loadFailed && !state) {
    body = <p className={styles.message}>We couldn’t check for a chapter guide.</p>;
  } else if (!state) {
    body = <p className={styles.message} role="status">Checking for a chapter guide…</p>;
  } else if (state.generating) {
    body = <ChapterGuideProgress reference={reference} generating={state.generating} now={stateLoadedAt} />;
  } else if (unavailableMessage) {
    body = <p className={styles.message} role="status">{unavailableMessage}</p>;
  } else if (!user) {
    body = <p className={styles.message}>There’s no chapter guide for {reference} yet. <Link href="/sign-in">Sign in</Link> to request one.</p>;
  } else {
    body = (
      <div>
        <p className={styles.message}>
          There’s no chapter guide for {reference} yet. You can request one for the whole chapter, broken into small passages with historical context, cross-references, and study questions. AI writes it in several minutes, and it’s saved here for everyone. It isn’t an editorial Come, Follow Me lesson.
        </p>
        <button type="button" className={styles.request} disabled={requesting} onClick={() => void request()}>
          {requesting ? "Requesting…" : `Generate a guide for ${reference}`}
        </button>
      </div>
    );
  }

  return (
    <section className={styles.section} aria-label={CHAPTER_GUIDE_LABEL}>
      {body}
      {requestError && requestError !== refusalShownByState ? <p className={styles.message} role="alert">{requestError}</p> : null}
    </section>
  );
}
