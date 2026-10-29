import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faBookBible, faBookOpen, faFeather, faHighlighter, faShareNodes, type IconDefinition, } from "@fortawesome/free-solid-svg-icons";
import CopySectionLink from "@/features/featureGuide/CopySectionLink";
import GuideClipPlayer from "@/features/featureGuide/GuideClipPlayer";
import { clipMedia, clipPosterSrc, coverOrigin, formatClipDuration, GUIDE_GROUPS, GUIDE_SECTIONS, sectionDuration, sectionsInGroup, type GuideGroupId, type GuideSection, } from "@/features/featureGuide/guide";
import styles from "@/features/featureGuide/featureGuide.module.css";
export const metadata: Metadata = {
    title: "Feature guide · Verse Together",
    description: "How each part of Verse Together works, in short silent clips of the app with the steps written out.",
    robots: { index: false, follow: true },
};
const GROUP_ICONS: Record<GuideGroupId, IconDefinition> = {
    read: faBookOpen,
    bibles: faBookBible,
    study: faHighlighter,
    write: faFeather,
    more: faShareNodes,
};
const GROUP_TITLES = Object.fromEntries(GUIDE_GROUPS.map((group) => [group.id, group.title])) as Record<GuideGroupId, string>;
const clipCount = (section: GuideSection) => `${section.clips.length} ${section.clips.length === 1 ? "clip" : "clips"}`;
function GroupMark({ group, className }: {
    group: GuideGroupId;
    className?: string;
}) {
    return (<span className={`${styles.groupMark} ${className ?? ""}`} aria-hidden="true">
      <FontAwesomeIcon icon={GROUP_ICONS[group]}/>
    </span>);
}
function TopicCard({ section }: {
    section: GuideSection;
}) {
    const { cover } = section;
    return (<li className={styles.accent} data-group={section.group}>
      <a href={`#${section.id}`} className={styles.card}>
        <span className={styles.thumb} style={{ ["--zoom" as string]: cover.zoom, ["--origin" as string]: coverOrigin(cover) }}>
          <Image src={clipPosterSrc(cover.clip)} alt="" fill sizes="(min-width: 640px) 36rem, 20rem" className={styles.thumbImage}/>
        </span>
        <span className={styles.cardBody}>
          <span className={styles.cardTitle}>{section.title}</span>
          <span className={styles.cardGroup}>
            <GroupMark group={section.group} className={styles.cardMark}/>
            {GROUP_TITLES[section.group]}
          </span>
          <span className={styles.cardMeta}>
            {clipCount(section)} · {sectionDuration(section)}
            {section.latterDaySaint ? <LatterDaySaintLabel /> : null}
          </span>
        </span>
      </a>
    </li>);
}
function LatterDaySaintLabel() {
    return (<span className={styles.tradition} title="Shown when your faith tradition is the Church of Jesus Christ of Latter-day Saints">
      Latter-day Saint
    </span>);
}
function Section({ section }: {
    section: GuideSection;
}) {
    const titleId = `${section.id}-title`;
    return (<section id={section.id} aria-labelledby={titleId} className={styles.section}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>
          <GroupMark group={section.group} className={styles.kickerMark}/>
          <span className={styles.kickerGroup}>{GROUP_TITLES[section.group]}</span>
          <span className={styles.kickerMeta}>
            {clipCount(section)} · {sectionDuration(section)}
          </span>
        </p>
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
            return (<figure key={clip.id} className={styles.clip}>
              <GuideClipPlayer id={clip.id} title={clip.title} durationSeconds={media.durationSeconds} width={media.width} height={media.height} describedBy={stepsId}/>
              <figcaption className={styles.clipText}>
                <h4 className={styles.clipTitle}>
                  {clip.title} <span className={styles.duration}>{formatClipDuration(media.durationSeconds)}</span>
                </h4>
                <ol id={stepsId} className={styles.steps}>
                  {clip.steps.map((step) => (<li key={step}>{step}</li>))}
                </ol>
              </figcaption>
            </figure>);
        })}
      </div>

      {section.notes?.length ? (<ul className={styles.notes}>
          {section.notes.map((note) => (<li key={note}>{note}</li>))}
        </ul>) : null}

      <footer className={styles.sectionFoot}>
        <Link href={section.tryIt.href} className={styles.tryIt}>
          Try it: {section.tryIt.label} <span aria-hidden="true">&rarr;</span>
        </Link>
        <CopySectionLink sectionId={section.id} title={section.title}/>
        <a href="#guide-topics" className={styles.toTopics}>
          <FontAwesomeIcon icon={faArrowUp} aria-hidden="true"/>
          All topics
        </a>
      </footer>
    </section>);
}
export default function FeatureGuidePage() {
    return (<article className={`page-shell ${styles.guide}`}>
      <header className={`page-hero ${styles.hero}`}>
        <h1 className="page-title">Feature guide</h1>
      </header>

      <nav aria-labelledby="guide-topics" className={styles.index}>
        <h2 id="guide-topics" className={styles.indexTitle}>
          Topics
        </h2>
        <ul className={styles.cards}>
          {GUIDE_SECTIONS.map((section) => (<TopicCard key={section.id} section={section}/>))}
        </ul>
      </nav>

      {GUIDE_GROUPS.map((group) => (<div key={group.id} className={`${styles.group} ${styles.accent}`} data-group={group.id}>
          <h2 id={`group-${group.id}`} className={styles.groupTitle}>
            <GroupMark group={group.id}/>
            {group.title}
          </h2>
          {sectionsInGroup(group.id).map((section) => (<Section key={section.id} section={section}/>))}
        </div>))}

      <p className={styles.closing}>
        Something missing or unclear? <Link href="/account#feedback">Send feedback</Link> from Settings.
      </p>
    </article>);
}
