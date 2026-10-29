import type { Metadata } from "next";
import Link from "next/link";
import CopySectionLink from "@/features/featureGuide/CopySectionLink";
import GuideClipPlayer from "@/features/featureGuide/GuideClipPlayer";
import {
  clipMedia,
  formatClipDuration,
  GUIDE_GROUPS,
  GUIDE_SECTIONS,
  sectionsInGroup,
  type GuideSection,
} from "@/features/featureGuide/guide";
import styles from "@/features/featureGuide/featureGuide.module.css";

export const metadata: Metadata = {
  title: "Feature guide · Verse Together",
  description: "How each part of Verse Together works, in short silent clips of the app with the steps written out.",
  // Linked from Settings and shared by hand; kept out of search results, not hidden.
  robots: { index: false, follow: true },
};

const CLIP_COUNT = GUIDE_SECTIONS.reduce((count, section) => count + section.clips.length, 0);

function LatterDaySaintLabel() {
  return (
    <span className={styles.tradition} title="Shown when your faith tradition is the Church of Jesus Christ of Latter-day Saints">
      Latter-day Saint
    </span>
  );
}

function Section({ section }: { section: GuideSection }) {
  const titleId = `${section.id}-title`;
  return (
    <section id={section.id} aria-labelledby={titleId} className={styles.section}>
      <header className={styles.sectionHead}>
        <h3 id={titleId} className={styles.sectionTitle}>
          <a href={`#${section.id}`}>{section.title}</a>
        </h3>
        {section.latterDaySaint ? <LatterDaySaintLabel /> : null}
        <p className={styles.summary}>{section.summary}</p>
      </header>

      <div className={styles.clips}>
        {section.clips.map((clip) => {
          const media = clipMedia(clip.id);
          const stepsId = `${clip.id}-steps`;
          return (
            <figure key={clip.id} className={styles.clip}>
              <GuideClipPlayer
                id={clip.id}
                title={clip.title}
                durationSeconds={media.durationSeconds}
                width={media.width}
                height={media.height}
                describedBy={stepsId}
              />
              <figcaption className={styles.clipText}>
                <h4 className={styles.clipTitle}>
                  {clip.title} <span className={styles.duration}>{formatClipDuration(media.durationSeconds)}</span>
                </h4>
                <ol id={stepsId} className={styles.steps}>
                  {clip.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </figcaption>
            </figure>
          );
        })}
      </div>

      {section.notes?.length ? (
        <ul className={styles.notes}>
          {section.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <footer className={styles.sectionFoot}>
        <Link href={section.tryIt.href} className={styles.tryIt}>
          Try it: {section.tryIt.label} <span aria-hidden="true">&rarr;</span>
        </Link>
        <CopySectionLink sectionId={section.id} title={section.title} />
      </footer>
    </section>
  );
}

export default function FeatureGuidePage() {
  return (
    <article className={`page-shell ${styles.guide}`}>
      <header className="page-hero space-y-3">
        <div className="page-eyebrow">Verse Together</div>
        <h1 className="page-title">Feature guide</h1>
        <p className="page-subtitle">
          How each part of Verse Together works: a short, silent clip of the app for each step, with the steps written out
          beside it.
        </p>
        <p className={styles.meta}>
          {GUIDE_SECTIONS.length} topics · {CLIP_COUNT} clips · Recorded on the website on a computer; on a phone the same
          tools are arranged for the smaller screen.
        </p>
      </header>

      <nav aria-labelledby="guide-topics" className={styles.index}>
        <h2 id="guide-topics" className={styles.indexTitle}>
          Topics
        </h2>
        <div className={styles.indexGroups}>
          {GUIDE_GROUPS.map((group) => (
            <div key={group.id} className={styles.indexGroup}>
              <p className={styles.indexGroupTitle}>{group.title}</p>
              <ol>
                {sectionsInGroup(group.id).map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>
                      {section.title}
                      {section.latterDaySaint ? (
                        <>
                          {" "}
                          <LatterDaySaintLabel />
                        </>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </nav>

      {GUIDE_GROUPS.map((group) => (
        <div key={group.id} className={styles.group}>
          <h2 id={`group-${group.id}`} className={styles.groupTitle}>
            {group.title}
          </h2>
          {sectionsInGroup(group.id).map((section) => (
            <Section key={section.id} section={section} />
          ))}
        </div>
      ))}

      <p className={styles.closing}>
        Something missing or unclear? <Link href="/account#feedback">Send feedback</Link> from Settings.
      </p>
    </article>
  );
}
